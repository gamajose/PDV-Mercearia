using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
var dataRoot = Environment.GetEnvironmentVariable("PDV_DATA_DIR")
    ?? Path.Combine(AppContext.BaseDirectory, "data");
Directory.CreateDirectory(dataRoot);
var databasePath = Path.Combine(dataRoot, "pdv-web.db");
var connectionString = $"Data Source={databasePath};Cache=Shared;Pooling=True";

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.Cookie.Name = "pdv-gama-session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.SlidingExpiration = true;
    });
builder.Services.AddAuthorization();
builder.Services.AddSingleton(new Database(connectionString));

var app = builder.Build();
await app.Services.GetRequiredService<Database>().InitializeAsync();

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// ---------------------------------------------------------------------
// Estado e Autenticação
// ---------------------------------------------------------------------
app.MapGet("/api/state", async (Database db, HttpContext context) =>
{
    var configured = await db.IsConfiguredAsync();
    if (!configured)
        return Results.Ok(new { configured = false, authenticated = false });

    // Se estiver autenticado via cookie
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var user = await db.GetUserAsync(Guid.Parse(userId));
        if (user != null)
        {
            return Results.Ok(new
            {
                configured = true,
                authenticated = true,
                user = new { user.Id, user.Name, user.Login, user.Role, user.Permissions }
            });
        }
    }

    // Auto-login do operador padrão para agilidade no preview web
    var defaultAdmin = await db.GetFirstAdminAsync();
    if (defaultAdmin != null)
    {
        await SignInAsync(context, defaultAdmin);
        return Results.Ok(new
        {
            configured = true,
            authenticated = true,
            user = new { defaultAdmin.Id, defaultAdmin.Name, defaultAdmin.Login, defaultAdmin.Role, defaultAdmin.Permissions }
        });
    }

    return Results.Ok(new { configured = true, authenticated = false });
});

app.MapPost("/api/login", async (LoginRequest request, Database db, HttpContext context) =>
{
    var user = await db.ValidateLoginAsync(request.Login, request.Password);
    if (user is null) return Results.Unauthorized();
    await SignInAsync(context, user);
    return Results.Ok(new { success = true });
});

app.MapPost("/api/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Ok();
});

// ---------------------------------------------------------------------
// Painel / Retaguarda
// ---------------------------------------------------------------------
app.MapGet("/api/dashboard", async (Database db) => Results.Ok(await db.GetDashboardAsync()));
app.MapGet("/api/company", async (Database db) => Results.Ok(await db.GetCompanyAsync()));

// ---------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------
app.MapGet("/api/products", async (Database db) => Results.Ok(await db.ListProductsAsync()));
app.MapPost("/api/products", async (CreateProductWebRequest request, Database db) =>
{
    var id = await db.CreateProductAsync(request);
    return Results.Created($"/api/products/{id}", new { id });
});

// ---------------------------------------------------------------------
// Clientes & Crediário
// ---------------------------------------------------------------------
app.MapGet("/api/customers", async (Database db) => Results.Ok(await db.ListCustomersAsync()));
app.MapPost("/api/customers/{id:guid}/settle", async (Guid id, SettleDebtWebRequest request, Database db) =>
{
    await db.SettleCustomerDebtAsync(id, request.Amount);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// Vendas / Frente de Caixa (PDV)
// ---------------------------------------------------------------------
app.MapGet("/api/sales", async (Database db) => Results.Ok(await db.ListSalesAsync()));
app.MapPost("/api/sales/complete", async (CompleteSaleWebRequest request, Database db) =>
{
    var result = await db.CompleteSaleAsync(request);
    return Results.Ok(result);
});

// ---------------------------------------------------------------------
// Usuários & Permissões
// ---------------------------------------------------------------------
app.MapGet("/api/users", async (Database db) => Results.Ok(await db.ListUsersAsync()));

app.MapGet("/health", () => Results.Ok(new { status = "healthy", version = "1.0.0", utc = DateTimeOffset.UtcNow }));

app.MapFallbackToFile("index.html");
app.Run();

static async Task SignInAsync(HttpContext context, AppUser user)
{
    var claims = new List<Claim>
    {
        new(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new(ClaimTypes.Name, user.Name),
        new(ClaimTypes.Role, user.Role)
    };
    claims.AddRange(user.Permissions.Select(p => new Claim("permission", p)));
    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
}

// ---------------------------------------------------------------------
// Banco de Dados SQLite Embutido do Pdv.Web
// ---------------------------------------------------------------------
sealed class Database(string connectionString)
{
    public async Task InitializeAsync()
    {
        await using var connection = Open();
        await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS company (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NULL, segment TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_user (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, login TEXT NOT NULL UNIQUE COLLATE NOCASE,
              password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL,
              permissions_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS store (
              id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(company_id) REFERENCES company(id)
            );
            CREATE TABLE IF NOT EXISTS product (
              id TEXT PRIMARY KEY, company_id TEXT NOT NULL, sku TEXT NOT NULL, barcode TEXT NULL,
              name TEXT NOT NULL, sale_price REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0,
              unit TEXT NOT NULL DEFAULT 'UN', category TEXT NULL, size TEXT NULL, color TEXT NULL,
              is_weighable INTEGER NOT NULL DEFAULT 0, plu_code TEXT NULL, quantity REAL NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS customer (
              id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, cpf_cnpj TEXT NULL,
              phone TEXT NULL, credit_limit REAL NOT NULL DEFAULT 0, current_debt REAL NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS sale (
              id TEXT PRIMARY KEY, store_id TEXT NOT NULL, number INTEGER NOT NULL, total REAL NOT NULL,
              discount REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL, operator_name TEXT NOT NULL,
              customer_name TEXT NULL, completed_at TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();

        // Se o banco estiver vazio, semeia automaticamente dados completos para teste imediato
        var count = await ScalarAsync<long>("SELECT COUNT(*) FROM company");
        if (count == 0)
        {
            await SeedDemoDataAsync(connection);
        }
    }

    public async Task<bool> IsConfiguredAsync() => await ScalarAsync<long>("SELECT COUNT(*) FROM company") > 0;

    private static readonly string[] DefaultAdminPermissions = ["admin.all", "sales.create", "sales.view", "products.view", "inventory.view"];

    private static async Task SeedDemoDataAsync(SqliteConnection connection)
    {
        var companyId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var (hash, salt) = Passwords.Hash("admin123");
        var allPermissions = JsonSerializer.Serialize(DefaultAdminPermissions);

        await ExecuteAsync(connection, null, "INSERT INTO company VALUES ($id, 'Supermercado & Magazine Modelo', '12.345.678/0001-90', 'Supermercado e Vestuário', $now)",
            ("$id", companyId), ("$now", DateTimeOffset.UtcNow));

        await ExecuteAsync(connection, null, "INSERT INTO store VALUES ($id, $cid, 'MATRIZ', 'Loja Matriz Central', 1)",
            ("$id", storeId), ("$cid", companyId));

        await ExecuteAsync(connection, null, "INSERT INTO app_user VALUES ($id, 'Administrador do Sistema', 'admin', $h, $s, 'Administrator', $p, 1, $now)",
            ("$id", adminId), ("$h", hash), ("$s", salt), ("$p", allPermissions), ("$now", DateTimeOffset.UtcNow));

        // Produtos Supermercado & Açougue
        await InsertProductAsync(connection, companyId, "101", "7891000100103", "Arroz Nobre Tipo 1 5kg", 29.90, 21.50, "PCT", "Mercearia", null, null, 0, null, 120);
        await InsertProductAsync(connection, companyId, "102", "7891000200201", "Feijão Carioca Especial 1kg", 7.90, 5.20, "PCT", "Mercearia", null, null, 0, null, 85);
        await InsertProductAsync(connection, companyId, "103", "7891000300300", "Leite Integral UHT 1L", 4.89, 3.60, "UN", "Laticínios", null, null, 0, null, 240);
        await InsertProductAsync(connection, companyId, "104", "7891000400409", "Óleo de Soja Refinado 900ml", 6.49, 4.90, "UN", "Mercearia", null, null, 0, null, 150);
        await InsertProductAsync(connection, companyId, "201", null, "Picanha Bovina Grill Especial", 69.90, 48.00, "KG", "Açougue", null, null, 1, "123", 45.5);
        await InsertProductAsync(connection, companyId, "202", null, "Queijo Mussarela Fatiado", 45.90, 31.00, "KG", "Frios", null, null, 1, "124", 28.0);
        await InsertProductAsync(connection, companyId, "203", null, "Maçã Nacional Fuji", 9.90, 6.20, "KG", "Hortifruti", null, null, 1, "125", 80.0);

        // Produtos Moda & Vestuário (Grade Tamanho x Cor)
        await InsertProductAsync(connection, companyId, "301", "7892000100011", "Camisa Polo Slim Confort", 89.90, 45.00, "UN", "Vestuário", "M", "Azul Marinho", 0, null, 15);
        await InsertProductAsync(connection, companyId, "302", "7892000100028", "Camisa Polo Slim Confort", 89.90, 45.00, "UN", "Vestuário", "G", "Preto", 0, null, 12);
        await InsertProductAsync(connection, companyId, "303", "7892000200018", "Calça Jeans Tradicional", 139.90, 75.00, "UN", "Vestuário", "42", "Azul Escuro", 0, null, 20);
        await InsertProductAsync(connection, companyId, "304", "7892000200025", "Calça Jeans Tradicional", 139.90, 75.00, "UN", "Vestuário", "44", "Azul Escuro", 0, null, 18);

        // Clientes para Crediário
        await ExecuteAsync(connection, null, "INSERT INTO customer VALUES ($id, $cid, 'João da Silva Sauro', '123.456.789-00', '(11) 98765-4321', 600.0, 145.50, 1)",
            ("$id", Guid.NewGuid()), ("$cid", companyId));
        await ExecuteAsync(connection, null, "INSERT INTO customer VALUES ($id, $cid, 'Maria das Dores Oliveira', '987.654.321-99', '(11) 91234-5678', 1000.0, 0.0, 1)",
            ("$id", Guid.NewGuid()), ("$cid", companyId));
    }

    private static async Task InsertProductAsync(SqliteConnection c, Guid cid, string sku, string? barcode, string name, double price, double cost, string unit, string cat, string? size, string? color, int weighable, string? plu, double qty)
    {
        await ExecuteAsync(c, null,
            "INSERT INTO product VALUES ($id, $cid, $sku, $bar, $name, $price, $cost, $unit, $cat, $size, $color, $w, $plu, $qty, 1)",
            ("$id", Guid.NewGuid()), ("$cid", cid), ("$sku", sku), ("$bar", barcode), ("$name", name),
            ("$price", price), ("$cost", cost), ("$unit", unit), ("$cat", cat), ("$size", size),
            ("$color", color), ("$w", weighable), ("$plu", plu), ("$qty", qty));
    }

    public async Task<AppUser?> GetFirstAdminAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,login,role,permissions_json FROM app_user WHERE active=1 LIMIT 1";
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadUser(reader) : null;
    }

    public async Task<AppUser?> ValidateLoginAsync(string login, string password)
    {
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,login,password_hash,password_salt,role,permissions_json FROM app_user WHERE login=$login AND active=1";
        command.Parameters.AddWithValue("$login", login.Trim());
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync() || !Passwords.Verify(password, reader.GetString(3), reader.GetString(4))) return null;
        return ReadUser(reader);
    }

    public async Task<AppUser?> GetUserAsync(Guid id)
    {
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,login,role,permissions_json FROM app_user WHERE id=$id";
        command.Parameters.AddWithValue("$id", id.ToString());
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadUser(reader) : null;
    }

    public async Task<object> GetDashboardAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var company = await QuerySingleAsync(connection, "SELECT name,segment FROM company LIMIT 1");
        var products = await CountAsync(connection, "product");
        var sales = await CountAsync(connection, "sale");
        var customers = await CountAsync(connection, "customer");
        var total = await ScalarAsync<double>("SELECT COALESCE(SUM(total),0) FROM sale");
        return new
        {
            companyName = company[0],
            segment = company[1],
            products,
            sales,
            customers,
            salesTotal = total
        };
    }

    public async Task<object> GetCompanyAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var row = await QuerySingleAsync(connection, "SELECT id,name,document,segment,created_at FROM company LIMIT 1");
        return new { id = row[0], name = row[1], document = row[2], segment = row[3], createdAt = row[4] };
    }

    public async Task<IReadOnlyList<object>> ListProductsAsync()
    {
        var list = new List<object>();
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,sku,barcode,name,sale_price,cost_price,unit,category,size,color,is_weighable,plu_code,quantity FROM product WHERE active=1 ORDER BY name";
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0),
                sku = r.GetString(1),
                barcode = r.IsDBNull(2) ? null : r.GetString(2),
                name = r.GetString(3),
                salePrice = r.GetDouble(4),
                costPrice = r.GetDouble(5),
                unit = r.GetString(6),
                category = r.IsDBNull(7) ? null : r.GetString(7),
                size = r.IsDBNull(8) ? null : r.GetString(8),
                color = r.IsDBNull(9) ? null : r.GetString(9),
                isWeighable = r.GetInt32(10) == 1,
                pluCode = r.IsDBNull(11) ? null : r.GetString(11),
                quantity = r.GetDouble(12)
            });
        }
        return list;
    }

    public async Task<Guid> CreateProductAsync(CreateProductWebRequest req)
    {
        var id = Guid.NewGuid();
        var companyId = Guid.Parse((await QuerySingleAsync(Open(), "SELECT id FROM company LIMIT 1"))[0]!);
        await using var connection = Open(); await connection.OpenAsync();
        await InsertProductAsync(connection, companyId, req.Sku, req.Barcode, req.Name, (double)req.SalePrice, (double)req.CostPrice, req.Unit, req.Category ?? "Geral", req.Size, req.Color, req.IsWeighable ? 1 : 0, req.PluCode, (double)req.Quantity);
        return id;
    }

    public async Task<IReadOnlyList<object>> ListCustomersAsync()
    {
        var list = new List<object>();
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,cpf_cnpj,phone,credit_limit,current_debt FROM customer WHERE active=1 ORDER BY name";
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0),
                name = r.GetString(1),
                cpfCnpj = r.IsDBNull(2) ? null : r.GetString(2),
                phone = r.IsDBNull(3) ? null : r.GetString(3),
                creditLimit = r.GetDouble(4),
                currentDebt = r.GetDouble(5)
            });
        }
        return list;
    }

    public async Task SettleCustomerDebtAsync(Guid customerId, decimal amount)
    {
        await using var connection = Open(); await connection.OpenAsync();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "UPDATE customer SET current_debt = MAX(0, current_debt - $amt) WHERE id=$id";
        cmd.Parameters.AddWithValue("$amt", (double)amount);
        cmd.Parameters.AddWithValue("$id", customerId.ToString());
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<object> CompleteSaleAsync(CompleteSaleWebRequest request)
    {
        await using var connection = Open(); await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var storeId = (await QuerySingleAsync(connection, "SELECT id FROM store LIMIT 1"))[0]!;
        var nextNumber = (await ScalarAsync<long>("SELECT COALESCE(MAX(number),0) FROM sale")) + 1;
        var saleId = Guid.NewGuid();

        // Baixa estoque dos itens
        foreach (var item in request.Items)
        {
            var updateCmd = connection.CreateCommand();
            updateCmd.Transaction = (SqliteTransaction)tx;
            updateCmd.CommandText = "UPDATE product SET quantity = MAX(0, quantity - $q) WHERE id=$pid";
            updateCmd.Parameters.AddWithValue("$q", (double)item.Quantity);
            updateCmd.Parameters.AddWithValue("$pid", item.ProductId.ToString());
            await updateCmd.ExecuteNonQueryAsync();
        }

        // Se pagamento for crediário e tiver cliente
        if (request.PaymentMethod.Equals("Crediario", StringComparison.OrdinalIgnoreCase) && request.CustomerId.HasValue)
        {
            var custCmd = connection.CreateCommand();
            custCmd.Transaction = (SqliteTransaction)tx;
            custCmd.CommandText = "UPDATE customer SET current_debt = current_debt + $amt WHERE id=$cid";
            custCmd.Parameters.AddWithValue("$amt", (double)request.Total);
            custCmd.Parameters.AddWithValue("$cid", request.CustomerId.Value.ToString());
            await custCmd.ExecuteNonQueryAsync();
        }

        var insertSale = connection.CreateCommand();
        insertSale.Transaction = (SqliteTransaction)tx;
        insertSale.CommandText = "INSERT INTO sale VALUES ($id, $sid, $num, $tot, $desc, $pay, $op, $cust, $now)";
        insertSale.Parameters.AddWithValue("$id", saleId.ToString());
        insertSale.Parameters.AddWithValue("$sid", storeId);
        insertSale.Parameters.AddWithValue("$num", nextNumber);
        insertSale.Parameters.AddWithValue("$tot", (double)request.Total);
        insertSale.Parameters.AddWithValue("$desc", (double)request.Discount);
        insertSale.Parameters.AddWithValue("$pay", request.PaymentMethod);
        insertSale.Parameters.AddWithValue("$op", request.OperatorName ?? "Operador 01");
        insertSale.Parameters.AddWithValue("$cust", request.CustomerName ?? (object)DBNull.Value);
        insertSale.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        await insertSale.ExecuteNonQueryAsync();

        await tx.CommitAsync();

        return new
        {
            saleId,
            number = nextNumber,
            total = request.Total,
            change = request.Change,
            paymentMethod = request.PaymentMethod,
            timestamp = DateTimeOffset.UtcNow
        };
    }

    public async Task<IReadOnlyList<object>> ListSalesAsync()
    {
        var list = new List<object>();
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT number,total,discount,payment_method,operator_name,customer_name,completed_at FROM sale ORDER BY number DESC LIMIT 50";
        await using var r = await command.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                number = r.GetInt64(0),
                total = r.GetDouble(1),
                discount = r.GetDouble(2),
                paymentMethod = r.GetString(3),
                operatorName = r.GetString(4),
                customerName = r.IsDBNull(5) ? null : r.GetString(5),
                completedAt = r.GetString(6)
            });
        }
        return list;
    }

    public async Task<IReadOnlyList<object>> ListUsersAsync()
    {
        var list = new List<object>();
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,login,role,active FROM app_user ORDER BY name";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(new { id = reader.GetString(0), name = reader.GetString(1), login = reader.GetString(2), role = reader.GetString(3), active = reader.GetInt32(4) == 1 });
        return list;
    }

    private SqliteConnection Open() => new(connectionString);
    private async Task<T> ScalarAsync<T>(string sql) { await using var c = Open(); await c.OpenAsync(); var cmd = c.CreateCommand(); cmd.CommandText = sql; return (T)Convert.ChangeType(await cmd.ExecuteScalarAsync() ?? 0, typeof(T), CultureInfo.InvariantCulture); }
    private static async Task<long> CountAsync(SqliteConnection c, string table) { var cmd = c.CreateCommand(); cmd.CommandText = $"SELECT COUNT(*) FROM {table}"; return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture); }
    private static async Task<string?[]> QuerySingleAsync(SqliteConnection c, string sql) { var cmd = c.CreateCommand(); cmd.CommandText = sql; await using var r = await cmd.ExecuteReaderAsync(); await r.ReadAsync(); var values = new string?[r.FieldCount]; for (var i=0;i<r.FieldCount;i++) values[i] = r.IsDBNull(i) ? null : r.GetValue(i).ToString(); return values; }
    private static async Task ExecuteAsync(SqliteConnection c, System.Data.Common.DbTransaction? tx, string sql, params (string Name, object? Value)[] p) { var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.Transaction = (SqliteTransaction?)tx; foreach (var item in p) cmd.Parameters.AddWithValue(item.Name, item.Value?.ToString() ?? (object)DBNull.Value); await cmd.ExecuteNonQueryAsync(); }
    private static AppUser ReadUser(SqliteDataReader r) => new(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(3), JsonSerializer.Deserialize<string[]>(r.GetString(4)) ?? []);
}

static class Passwords
{
    public static (string Hash, string Salt) Hash(string password) { var salt = RandomNumberGenerator.GetBytes(32); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32); return (Convert.ToBase64String(hash), Convert.ToBase64String(salt)); }
    public static bool Verify(string password, string hash, string salt) => CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hash), Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256, 32));
}

sealed record AppUser(Guid Id, string Name, string Login, string Role, string[] Permissions);
sealed record LoginRequest(string Login, string Password);
sealed record CreateProductWebRequest(string Sku, string? Barcode, string Name, decimal SalePrice, decimal CostPrice, string Unit, string? Category, string? Size, string? Color, bool IsWeighable, string? PluCode, decimal Quantity);
sealed record SettleDebtWebRequest(decimal Amount);
sealed record CompleteSaleWebRequest(decimal Total, decimal Discount, decimal Change, string PaymentMethod, string? OperatorName, Guid? CustomerId, string? CustomerName, IReadOnlyList<SaleItemWebPayload> Items);
sealed record SaleItemWebPayload(Guid ProductId, decimal Quantity, decimal UnitPrice);
public partial class Program;
