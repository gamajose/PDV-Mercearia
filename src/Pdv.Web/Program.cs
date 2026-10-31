using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Linq;
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
// 1. Estado, Autenticação e Usuários
// ---------------------------------------------------------------------
app.MapGet("/api/state", async (Database db, HttpContext context) =>
{
    var configured = await db.IsConfiguredAsync();
    if (!configured)
        return Results.Ok(new { configured = false, authenticated = false });

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

app.MapGet("/api/users", async (Database db) => Results.Ok(await db.ListUsersAsync()));
app.MapPost("/api/users", async (CreateUserRequest req, Database db) => Results.Ok(await db.CreateUserAsync(req)));

// ---------------------------------------------------------------------
// 2. Painel Executivo & Dados da Empresa
// ---------------------------------------------------------------------
app.MapGet("/api/dashboard", async (Database db) => Results.Ok(await db.GetDashboardAsync()));
app.MapGet("/api/company", async (Database db) => Results.Ok(await db.GetCompanyAsync()));
app.MapPost("/api/company", async (UpdateCompanyRequest req, Database db) => Results.Ok(await db.UpdateCompanyAsync(req)));

// ---------------------------------------------------------------------
// 3. Catálogo de Produtos & Estoque
// ---------------------------------------------------------------------
app.MapGet("/api/products", async (Database db, string? query, string? category) => Results.Ok(await db.ListProductsAsync(query, category)));
app.MapGet("/api/products/{id:guid}", async (Guid id, Database db) =>
{
    var p = await db.GetProductByIdAsync(id);
    return p is not null ? Results.Ok(p) : Results.NotFound();
});
app.MapPost("/api/products", async (ProductDto req, Database db) => Results.Ok(await db.SaveProductAsync(req)));
app.MapPut("/api/products/{id:guid}", async (Guid id, ProductDto req, Database db) => Results.Ok(await db.SaveProductAsync(req with { Id = id })));
app.MapDelete("/api/products/{id:guid}", async (Guid id, Database db) =>
{
    await db.DeleteProductAsync(id);
    return Results.Ok(new { success = true });
});
app.MapPost("/api/products/adjust-stock", async (AdjustStockRequest req, Database db) =>
{
    await db.AdjustProductStockAsync(req.ProductId, req.NewQuantity, req.Reason);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 4. Clientes & Crediário
// ---------------------------------------------------------------------
app.MapGet("/api/customers", async (Database db, string? query) => Results.Ok(await db.ListCustomersAsync(query)));
app.MapGet("/api/customers/{id:guid}", async (Guid id, Database db) =>
{
    var c = await db.GetCustomerByIdAsync(id);
    return c is not null ? Results.Ok(c) : Results.NotFound();
});
app.MapPost("/api/customers", async (CustomerDto req, Database db) => Results.Ok(await db.SaveCustomerAsync(req)));
app.MapPut("/api/customers/{id:guid}", async (Guid id, CustomerDto req, Database db) => Results.Ok(await db.SaveCustomerAsync(req with { Id = id })));
app.MapGet("/api/crediario/customer/{id:guid}", async (Guid id, Database db) => Results.Ok(await db.GetCustomerCrediarioAsync(id)));
app.MapPost("/api/crediario/receive", async (ReceiveCrediarioRequest req, Database db) => Results.Ok(await db.ReceiveCrediarioPaymentAsync(req)));

// ---------------------------------------------------------------------
// 5. Fornecedores
// ---------------------------------------------------------------------
app.MapGet("/api/suppliers", async (Database db) => Results.Ok(await db.ListSuppliersAsync()));
app.MapPost("/api/suppliers", async (SupplierDto req, Database db) => Results.Ok(await db.SaveSupplierAsync(req)));
app.MapPut("/api/suppliers/{id:guid}", async (Guid id, SupplierDto req, Database db) => Results.Ok(await db.SaveSupplierAsync(req with { Id = id })));

// ---------------------------------------------------------------------
// 6. Controle de Caixa Diário (Abertura, Sangria, Suprimento, Fechamento)
// ---------------------------------------------------------------------
app.MapGet("/api/cash/current", async (Database db) => Results.Ok(await db.GetCurrentCashSessionAsync()));
app.MapPost("/api/cash/open", async (OpenCashRequest req, Database db) => Results.Ok(await db.OpenCashSessionAsync(req)));
app.MapPost("/api/cash/sangria", async (CashMovementRequest req, Database db) => Results.Ok(await db.AddCashMovementAsync("SANGRIA", req)));
app.MapPost("/api/cash/suprimento", async (CashMovementRequest req, Database db) => Results.Ok(await db.AddCashMovementAsync("SUPRIMENTO", req)));
app.MapPost("/api/cash/close", async (CloseCashRequest req, Database db) => Results.Ok(await db.CloseCashSessionAsync(req)));
app.MapGet("/api/cash/history", async (Database db) => Results.Ok(await db.ListCashHistoryAsync()));

// ---------------------------------------------------------------------
// 7. Frente de Caixa (Vendas PDV, Histórico e Cancelamento)
// ---------------------------------------------------------------------
app.MapGet("/api/sales", async (Database db) => Results.Ok(await db.ListSalesAsync()));
app.MapGet("/api/sales/{number:long}", async (long number, Database db) =>
{
    var sale = await db.GetSaleByNumberAsync(number);
    return sale is not null ? Results.Ok(sale) : Results.NotFound();
});
app.MapPost("/api/sales/complete", async (CompleteSaleWebRequest request, Database db) =>
{
    var result = await db.CompleteSaleAsync(request);
    return Results.Ok(result);
});
app.MapPost("/api/sales/{number:long}/cancel", async (long number, CancelSaleRequest req, Database db) =>
{
    var result = await db.CancelSaleAsync(number, req.Reason, req.SupervisorPassword);
    return Results.Ok(result);
});

// ---------------------------------------------------------------------
// 8. Financeiro (Contas a Pagar e Receber)
// ---------------------------------------------------------------------
app.MapGet("/api/financial", async (Database db, string? type, string? status) => Results.Ok(await db.ListFinancialEntriesAsync(type, status)));
app.MapPost("/api/financial", async (FinancialEntryDto req, Database db) => Results.Ok(await db.SaveFinancialEntryAsync(req)));
app.MapPost("/api/financial/{id:guid}/settle", async (Guid id, SettleFinancialRequest req, Database db) =>
{
    await db.SettleFinancialEntryAsync(id, req.Amount, req.Discount, req.Interest);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 9. Entrada de Compras / Importador de NF-e XML
// ---------------------------------------------------------------------
app.MapPost("/api/nfe/parse", async (HttpRequest request, Database db) =>
{
    using var reader = new StreamReader(request.Body);
    var xmlContent = await reader.ReadToEndAsync();
    var parsed = Database.ParseNfeXml(xmlContent);
    return Results.Ok(parsed);
});
app.MapPost("/api/nfe/import-parsed", async (ImportNfePayload payload, Database db) =>
{
    var result = await db.ImportParsedNfeAsync(payload);
    return Results.Ok(result);
});

// ---------------------------------------------------------------------
// 10. Configurações de Hardware e Sistema
// ---------------------------------------------------------------------
app.MapGet("/api/settings", async (Database db) => Results.Ok(await db.GetSettingsAsync()));
app.MapPost("/api/settings", async (Dictionary<string, string> settings, Database db) =>
{
    await db.SaveSettingsAsync(settings);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 11. Relatórios Executivos (Curva ABC, Fechamento de Caixa, Inadimplência)
// ---------------------------------------------------------------------
app.MapGet("/api/reports/abc", async (Database db) => Results.Ok(await db.GetAbcAnalysisReportAsync()));
app.MapGet("/api/reports/cash-summary", async (Database db) => Results.Ok(await db.GetCashSummaryReportAsync()));
app.MapGet("/api/reports/low-stock", async (Database db) => Results.Ok(await db.GetLowStockReportAsync()));
app.MapGet("/api/reports/defaulters", async (Database db) => Results.Ok(await db.GetDefaultersReportAsync()));

app.MapGet("/health", () => Results.Ok(new { status = "healthy", version = "2.0.0", utc = DateTimeOffset.UtcNow }));
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

// =====================================================================
// Banco de Dados SQLite Robusto e Completo (GDM + Linear Sistemas)
// =====================================================================
sealed class Database(string connectionString)
{
    private static readonly string[] AdminPermissions =
    [
        "admin.all", "sales.create", "sales.cancel", "sales.discount",
        "cash.open", "cash.sangria", "cash.suprimento", "cash.close",
        "products.manage", "customers.manage", "financial.manage", "settings.manage"
    ];

    private static readonly string[] OperatorPermissions =
    [
        "sales.create", "cash.sangria", "cash.suprimento"
    ];

    public async Task InitializeAsync()
    {
        await using var connection = Open();
        await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS company (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trade_name TEXT NULL,
                cnpj TEXT NOT NULL,
                ie TEXT NULL,
                im TEXT NULL,
                segment TEXT NOT NULL,
                phone1 TEXT NULL,
                phone2 TEXT NULL,
                email TEXT NULL,
                zip_code TEXT NULL,
                street TEXT NULL,
                number TEXT NULL,
                neighborhood TEXT NULL,
                city TEXT NULL,
                state TEXT NULL,
                logo_url TEXT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS store (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            CREATE TABLE IF NOT EXISTS app_user (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                login TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                role TEXT NOT NULL,
                commission_pct REAL NOT NULL DEFAULT 0,
                permissions_json TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS supplier (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                cnpj_cpf TEXT NOT NULL,
                corporate_name TEXT NOT NULL,
                trade_name TEXT NULL,
                state_registration TEXT NULL,
                email TEXT NULL,
                phone TEXT NULL,
                contact_person TEXT NULL,
                city TEXT NULL,
                state TEXT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            CREATE TABLE IF NOT EXISTS customer (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'PF',
                name TEXT NOT NULL,
                trade_name TEXT NULL,
                cpf_cnpj TEXT NULL,
                rg_ie TEXT NULL,
                phone TEXT NULL,
                cell_phone TEXT NULL,
                email TEXT NULL,
                zip_code TEXT NULL,
                street TEXT NULL,
                number TEXT NULL,
                neighborhood TEXT NULL,
                city TEXT NULL,
                state TEXT NULL,
                delivery_address TEXT NULL,
                credit_limit REAL NOT NULL DEFAULT 0,
                current_debt REAL NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0,
                notes TEXT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            CREATE TABLE IF NOT EXISTS product (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                sku TEXT NOT NULL,
                barcode TEXT NULL,
                name TEXT NOT NULL,
                brand TEXT NULL,
                category TEXT NOT NULL,
                unit TEXT NOT NULL DEFAULT 'UN',
                cost_price REAL NOT NULL DEFAULT 0,
                markup_pct REAL NOT NULL DEFAULT 0,
                sale_price REAL NOT NULL DEFAULT 0,
                commission_pct REAL NOT NULL DEFAULT 0,
                quantity REAL NOT NULL DEFAULT 0,
                min_quantity REAL NOT NULL DEFAULT 0,
                location TEXT NULL,
                ncm TEXT NULL,
                cfop TEXT NULL,
                supplier_id TEXT NULL,
                is_weighable INTEGER NOT NULL DEFAULT 0,
                plu_code TEXT NULL,
                size TEXT NULL,
                color TEXT NULL,
                expiry_date TEXT NULL,
                manufacture_date TEXT NULL,
                photo_url TEXT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            CREATE TABLE IF NOT EXISTS cash_session (
                id TEXT PRIMARY KEY,
                store_id TEXT NOT NULL,
                operator_id TEXT NOT NULL,
                operator_name TEXT NOT NULL,
                opened_at TEXT NOT NULL,
                closed_at TEXT NULL,
                opening_balance REAL NOT NULL DEFAULT 0,
                total_inflows REAL NOT NULL DEFAULT 0,
                total_outflows REAL NOT NULL DEFAULT 0,
                closing_balance_expected REAL NOT NULL DEFAULT 0,
                closing_balance_physical REAL NULL,
                difference REAL NULL,
                status TEXT NOT NULL DEFAULT 'ABERTO',
                FOREIGN KEY(store_id) REFERENCES store(id)
            );

            CREATE TABLE IF NOT EXISTS cash_movement (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                operator_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cash_session(id)
            );

            CREATE TABLE IF NOT EXISTS sale (
                id TEXT PRIMARY KEY,
                store_id TEXT NOT NULL,
                number INTEGER NOT NULL,
                subtotal REAL NOT NULL DEFAULT 0,
                discount REAL NOT NULL DEFAULT 0,
                addition REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL DEFAULT 0,
                payment_summary TEXT NOT NULL,
                operator_id TEXT NULL,
                operator_name TEXT NOT NULL,
                customer_id TEXT NULL,
                customer_name TEXT NULL,
                customer_cpf TEXT NULL,
                status TEXT NOT NULL DEFAULT 'CONCLUIDA',
                cancel_reason TEXT NULL,
                completed_at TEXT NOT NULL,
                FOREIGN KEY(store_id) REFERENCES store(id)
            );

            CREATE TABLE IF NOT EXISTS sale_item (
                id TEXT PRIMARY KEY,
                sale_id TEXT NOT NULL,
                item_number INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                sku TEXT NOT NULL,
                barcode TEXT NULL,
                name TEXT NOT NULL,
                unit TEXT NOT NULL,
                quantity REAL NOT NULL,
                unit_price REAL NOT NULL,
                discount REAL NOT NULL DEFAULT 0,
                total_price REAL NOT NULL,
                FOREIGN KEY(sale_id) REFERENCES sale(id)
            );

            CREATE TABLE IF NOT EXISTS sale_payment (
                id TEXT PRIMARY KEY,
                sale_id TEXT NOT NULL,
                method TEXT NOT NULL,
                amount REAL NOT NULL,
                card_flag TEXT NULL,
                installments INTEGER NOT NULL DEFAULT 1,
                change_amount REAL NOT NULL DEFAULT 0,
                FOREIGN KEY(sale_id) REFERENCES sale(id)
            );

            CREATE TABLE IF NOT EXISTS financial_entry (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                doc_number TEXT NULL,
                barcode TEXT NULL,
                issuer_bank TEXT NULL,
                entity_name TEXT NULL,
                due_date TEXT NOT NULL,
                amount REAL NOT NULL,
                installment_number INTEGER NOT NULL DEFAULT 1,
                total_installments INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'PENDENTE',
                paid_at TEXT NULL,
                paid_amount REAL NULL,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            CREATE TABLE IF NOT EXISTS credit_account (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                sale_id TEXT NULL,
                contract_number TEXT NOT NULL,
                total_amount REAL NOT NULL,
                balance REAL NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ABERTO',
                created_at TEXT NOT NULL,
                FOREIGN KEY(customer_id) REFERENCES customer(id)
            );

            CREATE TABLE IF NOT EXISTS credit_receipt (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                credit_account_id TEXT NULL,
                amount_paid REAL NOT NULL,
                discount REAL NOT NULL DEFAULT 0,
                penalty_interest REAL NOT NULL DEFAULT 0,
                operator_name TEXT NOT NULL,
                paid_at TEXT NOT NULL,
                FOREIGN KEY(customer_id) REFERENCES customer(id)
            );

            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();

        var count = await ScalarAsync<long>("SELECT COUNT(*) FROM company");
        if (count == 0)
        {
            await SeedEnterpriseDataAsync(connection);
        }
    }

    public async Task<bool> IsConfiguredAsync() => await ScalarAsync<long>("SELECT COUNT(*) FROM company") > 0;

    private static async Task SeedEnterpriseDataAsync(SqliteConnection conn)
    {
        var companyId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O");
        var (hash, salt) = Passwords.Hash("admin123");
        var allPerms = JsonSerializer.Serialize(AdminPermissions);

        // 1. Empresa Modelo Retaguarda
        await ExecuteAsync(conn, null,
            """
            INSERT INTO company VALUES (
                $id, 'Supermercado & Magazine Modelo Ltda', 'Super Modelo Matriz',
                '12.345.678/0001-90', '123.456.789.000', '987654321', 'Supermercado e Vestuário',
                '(11) 3344-5500', '(11) 98765-4321', 'contato@supermodelo.com.br',
                '01310-100', 'Avenida Paulista', '1578', 'Bela Vista', 'São Paulo', 'SP',
                '/imagens/logo_empresa.png', $now
            )
            """,
            ("$id", companyId), ("$now", now));

        // 2. Loja Matriz
        await ExecuteAsync(conn, null,
            "INSERT INTO store VALUES ($id, $cid, '01', 'Loja 01 - Matriz Centro', 1)",
            ("$id", storeId), ("$cid", companyId));

        // 3. Usuários / Colaboradores
        await ExecuteAsync(conn, null,
            "INSERT INTO app_user VALUES ($id, 'Administrador Master', 'admin', $h, $s, 'Administrador', 0, $p, 1, $now)",
            ("$id", adminId), ("$h", hash), ("$s", salt), ("$p", allPerms), ("$now", now));

        var (hOp, sOp) = Passwords.Hash("caixa123");
        var opPerms = JsonSerializer.Serialize(OperatorPermissions);
        await ExecuteAsync(conn, null,
            "INSERT INTO app_user VALUES ($id, 'Carla Operadora de Caixa', 'caixa01', $h, $s, 'Operador de Caixa', 1.5, $p, 1, $now)",
            ("$id", Guid.NewGuid()), ("$h", hOp), ("$s", sOp), ("$p", opPerms), ("$now", now));

        // 4. Fornecedores
        var supAmbev = Guid.NewGuid();
        var supJbs = Guid.NewGuid();
        var supHering = Guid.NewGuid();
        await ExecuteAsync(conn, null,
            "INSERT INTO supplier VALUES ($id, $cid, '02.808.708/0001-07', 'Ambev S/A', 'Ambev Distribuição Bebidas', '112.233.445.00', 'pedidos@ambev.com.br', '(11) 4004-2020', 'Carlos Representante', 'São Paulo', 'SP', 1)",
            ("$id", supAmbev), ("$cid", companyId));
        await ExecuteAsync(conn, null,
            "INSERT INTO supplier VALUES ($id, $cid, '02.916.265/0001-00', 'JBS S.A. Carnes e Derivados', 'Friboi Alimentos', '223.344.556.00', 'friboi@jbs.com.br', '(11) 3144-4000', 'Marcos Açougue', 'São Paulo', 'SP', 1)",
            ("$id", supJbs), ("$cid", companyId));
        await ExecuteAsync(conn, null,
            "INSERT INTO supplier VALUES ($id, $cid, '82.640.551/0001-96', 'Cia Hering Vestuário', 'Hering Confecções', '334.455.667.00', 'comercial@hering.com.br', '(47) 3321-3000', 'Ana Vendas', 'Blumenau', 'SC', 1)",
            ("$id", supHering), ("$cid", companyId));

        // 5. Produtos do Supermercado, Açougue com PLU, Moda com Grade
        await InsertProductFullAsync(conn, companyId, "101", "7891000100103", "Arroz Nobre Tipo 1 5kg", "Tio Nobre", "Mercearia", "PCT", 21.50, 39.07, 29.90, 0, 150, 20, "Corredor A - Gondola 01", "10063021", "5102", supAmbev.ToString(), 0, null, null, null, "2027-12-31");
        await InsertProductFullAsync(conn, companyId, "102", "7891000200201", "Feijão Carioca Especial 1kg", "Kicaldo", "Mercearia", "PCT", 5.20, 51.92, 7.90, 0, 95, 15, "Corredor A - Gondola 02", "07133290", "5102", supAmbev.ToString(), 0, null, null, null, "2027-08-30");
        await InsertProductFullAsync(conn, companyId, "103", "7891000300300", "Leite Integral UHT 1L", "Itambé", "Laticínios", "UN", 3.40, 43.82, 4.89, 0, 240, 30, "Geladeira 03", "04012010", "5102", supAmbev.ToString(), 0, null, null, null, "2027-04-15");
        await InsertProductFullAsync(conn, companyId, "104", "7891000400409", "Óleo de Soja Refinado 900ml", "Liza", "Mercearia", "UN", 4.90, 32.45, 6.49, 0, 160, 25, "Corredor B - Gondola 01", "15079011", "5102", supAmbev.ToString(), 0, null, null, null, "2027-11-20");
        await InsertProductFullAsync(conn, companyId, "105", "7891991010899", "Cerveja Pilsen Lata 350ml", "Heineken", "Bebidas", "UN", 3.10, 44.84, 4.49, 0, 320, 50, "Câmara Fria 01", "22030000", "5405", supAmbev.ToString(), 0, null, null, null, "2027-06-30");

        // Açougue e Pesáveis (Balança / PLU)
        await InsertProductFullAsync(conn, companyId, "201", null, "Picanha Bovina Grill Especial", "Friboi", "Açougue", "KG", 48.00, 45.63, 69.90, 0, 48.5, 10, "Balcão Açougue 01", "02013000", "5102", supJbs.ToString(), 1, "123", null, null, "2026-11-15");
        await InsertProductFullAsync(conn, companyId, "202", null, "Queijo Mussarela Fatiado", "Scala", "Frios", "KG", 31.00, 48.06, 45.90, 0, 32.0, 8, "Balcão de Frios 02", "04069022", "5102", supJbs.ToString(), 1, "124", null, null, "2026-12-10");
        await InsertProductFullAsync(conn, companyId, "203", null, "Maçã Nacional Fuji", "Hortifruti", "Hortifruti", "KG", 6.20, 59.68, 9.90, 0, 85.0, 15, "Banca 04 Central", "08081000", "5102", supJbs.ToString(), 1, "125", null, null, "2026-11-25");
        await InsertProductFullAsync(conn, companyId, "204", null, "Alcatra Bovina com Maminha", "Friboi", "Açougue", "KG", 33.50, 42.99, 47.90, 0, 60.0, 12, "Balcão Açougue 02", "02013000", "5102", supJbs.ToString(), 1, "126", null, null, "2026-11-18");

        // Moda & Vestuário (Grade de Tamanho e Cor)
        await InsertProductFullAsync(conn, companyId, "301", "7892000100011", "Camisa Polo Slim Confort", "Hering", "Vestuário", "UN", 45.00, 99.78, 89.90, 2.0, 18, 5, "Arara Moda Masc A", "61051000", "5102", supHering.ToString(), 0, null, "M", "Azul Marinho", null);
        await InsertProductFullAsync(conn, companyId, "302", "7892000100028", "Camisa Polo Slim Confort", "Hering", "Vestuário", "UN", 45.00, 99.78, 89.90, 2.0, 14, 5, "Arara Moda Masc A", "61051000", "5102", supHering.ToString(), 0, null, "G", "Preto", null);
        await InsertProductFullAsync(conn, companyId, "303", "7892000200018", "Calça Jeans Tradicional", "Hering", "Vestuário", "UN", 75.00, 86.53, 139.90, 3.0, 22, 6, "Prateleira Calças 02", "62034200", "5102", supHering.ToString(), 0, null, "42", "Azul Escuro", null);
        await InsertProductFullAsync(conn, companyId, "304", "7892000200025", "Calça Jeans Tradicional", "Hering", "Vestuário", "UN", 75.00, 86.53, 139.90, 3.0, 19, 6, "Prateleira Calças 02", "62034200", "5102", supHering.ToString(), 0, null, "44", "Azul Escuro", null);

        // 6. Clientes com Crediário e Contas em Aberto
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();
        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PF', 'João da Silva Sauro', 'João da Silva', '123.456.789-00', '12.345.678-9',
                '(11) 3456-7890', '(11) 98765-4321', 'joao.silva@email.com', '01310-200', 'Rua das Flores', '120',
                'Jardins', 'São Paulo', 'SP', 'Rua das Flores, 120, Apto 41', 800.0, 220.50, 0, 'Cliente tradicional há 5 anos', 1
            )
            """,
            ("$id", c1), ("$cid", companyId));

        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PF', 'Maria das Dores Oliveira', 'Dona Maria', '987.654.321-99', '23.456.789-0',
                '(11) 3890-1234', '(11) 91234-5678', 'maria.dores@email.com', '01310-300', 'Alameda Santos', '850',
                'Cerqueira César', 'São Paulo', 'SP', null, 1200.0, 0.0, 0, 'Ótima pagadora, limite liberado', 1
            )
            """,
            ("$id", c2), ("$cid", companyId));

        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PJ', 'Restaurante & Buffet Sabor Ltda', 'Restaurante Sabor Divino', '34.567.890/0001-12', '456.789.012.34',
                '(11) 3211-9988', '(11) 99887-6655', 'compras@sabordivino.com.br', '01311-000', 'Rua Augusta', '2100',
                'Consolação', 'São Paulo', 'SP', 'Rua Augusta, 2100 - Entrada de Carga Fundos', 3500.0, 480.00, 0, 'Faturamento semanal toda terça-feira', 1
            )
            """,
            ("$id", c3), ("$cid", companyId));

        // Crediário pendente do João da Silva
        await ExecuteAsync(conn, null,
            "INSERT INTO credit_account VALUES ($id, $cid, null, 'CARNE-2026-001', 220.50, 220.50, $due, 'ABERTO', $now)",
            ("$id", Guid.NewGuid()), ("$cid", c1), ("$due", DateTimeOffset.UtcNow.AddDays(15).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("$now", now));

        // Crediário pendente do Restaurante Sabor Divino
        await ExecuteAsync(conn, null,
            "INSERT INTO credit_account VALUES ($id, $cid, null, 'CARNE-2026-002', 480.00, 480.00, $due, 'ABERTO', $now)",
            ("$id", Guid.NewGuid()), ("$cid", c3), ("$due", DateTimeOffset.UtcNow.AddDays(7).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("$now", now));

        // 7. Sessão de Caixa Aberta com Saldo Inicial
        var sessionId = Guid.NewGuid();
        await ExecuteAsync(conn, null,
            """
            INSERT INTO cash_session VALUES (
                $id, $sid, $uid, 'Administrador Master', $now, null,
                200.00, 0.0, 0.0, 200.00, null, null, 'ABERTO'
            )
            """,
            ("$id", sessionId), ("$sid", storeId), ("$uid", adminId), ("$now", now));

        await ExecuteAsync(conn, null,
            "INSERT INTO cash_movement VALUES ($id, $sess, 'ABERTURA', 'Fundo de troco inicial de abertura do caixa', 200.00, 'Administrador Master', $now)",
            ("$id", Guid.NewGuid()), ("$sess", sessionId), ("$amt", (double)200.00),
            ("$op", "Administrador Master"), ("$now", now));

        // 8. Contas a Pagar e Receber
        await ExecuteAsync(conn, null,
            """
            INSERT INTO financial_entry VALUES (
                $id, $cid, 'PAGAR', 'Boleto Fornecimento Bebidas Ambev', 'DOC-88912', '23793.38128 60000.123456 01000.654321 1 95410000125000',
                'Banco Bradesco', 'Ambev S/A', $due, 1250.00, 1, 1, 'PENDENTE', null, null
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$due", DateTimeOffset.UtcNow.AddDays(5).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));

        await ExecuteAsync(conn, null,
            """
            INSERT INTO financial_entry VALUES (
                $id, $cid, 'PAGAR', 'Fatura Energia Elétrica Enel', 'FAT-202610', '84600000002 9 84500109011 8 00012345678 4 90123456789 1',
                'Banco do Brasil', 'Enel Distribuição São Paulo', $due, 845.00, 1, 1, 'PENDENTE', null, null
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$due", DateTimeOffset.UtcNow.AddDays(10).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));

        await ExecuteAsync(conn, null,
            """
            INSERT INTO financial_entry VALUES (
                $id, $cid, 'RECEBER', 'Fatura Convênio Empresa Metalúrgica Paulista', 'CONV-102', null,
                'Banco Itaú', 'Metalúrgica Paulista Ltda', $due, 2350.00, 1, 1, 'PENDENTE', null, null
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$due", DateTimeOffset.UtcNow.AddDays(12).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));

        // 9. Configurações Padrão de Hardware e Sistema
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_model', 'TOLEDO_PRIX3')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_port', 'COM1')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_baud', '9600')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_type', 'ESC_POS_80MM')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_model', 'EPSON_TM_T20X')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_cut_paper', 'true')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_drawer_trigger', 'true')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('fluxo_acumulado', 'sim')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('backup_auto', 'sim')");
    }

    private static async Task InsertProductFullAsync(
        SqliteConnection conn, Guid companyId, string sku, string? barcode, string name,
        string brand, string category, string unit, double cost, double markup, double salePrice,
        double commission, double qty, double minQty, string location, string ncm, string cfop,
        string? supplierId, int weighable, string? plu, string? size, string? color, string? expiry)
    {
        await ExecuteAsync(conn, null,
            """
            INSERT INTO product VALUES (
                $id, $cid, $sku, $bar, $name, $brand, $cat, $unit,
                $cost, $markup, $sale, $comm, $qty, $minq, $loc,
                $ncm, $cfop, $sup, $w, $plu, $size, $color, $exp, null, null, 1
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$sku", sku), ("$bar", barcode),
            ("$name", name), ("$brand", brand), ("$cat", category), ("$unit", unit),
            ("$cost", cost), ("$markup", markup), ("$sale", salePrice), ("$comm", commission),
            ("$qty", qty), ("$minq", minQty), ("$loc", location), ("$ncm", ncm), ("$cfop", cfop),
            ("$sup", supplierId), ("$w", weighable), ("$plu", plu), ("$size", size),
            ("$color", color), ("$exp", expiry));
    }

    // -----------------------------------------------------------------
    // Queries e Métodos do Dashboard e Relatórios
    // -----------------------------------------------------------------
    public async Task<object> GetDashboardAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var company = await QuerySingleAsync(connection, "SELECT name,trade_name,segment,cnpj FROM company LIMIT 1");
        var products = await CountAsync(connection, "product");
        var sales = await CountAsync(connection, "sale");
        var customers = await CountAsync(connection, "customer");
        var suppliers = await CountAsync(connection, "supplier");
        var salesTotal = await ScalarAsync<double>("SELECT COALESCE(SUM(total),0) FROM sale WHERE status='CONCLUIDA'");
        var pendingPayables = await ScalarAsync<double>("SELECT COALESCE(SUM(amount),0) FROM financial_entry WHERE type='PAGAR' AND status='PENDENTE'");
        var pendingReceivables = await ScalarAsync<double>("SELECT COALESCE(SUM(amount),0) FROM financial_entry WHERE type='RECEBER' AND status='PENDENTE'");
        var totalCrediarioDebt = await ScalarAsync<double>("SELECT COALESCE(SUM(current_debt),0) FROM customer");
        var lowStockCount = await ScalarAsync<long>("SELECT COUNT(*) FROM product WHERE quantity <= min_quantity AND active=1");

        return new
        {
            companyName = company[0],
            tradeName = company[1],
            segment = company[2],
            cnpj = company[3],
            products,
            sales,
            customers,
            suppliers,
            salesTotal,
            pendingPayables,
            pendingReceivables,
            totalCrediarioDebt,
            lowStockCount
        };
    }

    public async Task<object> GetCompanyAsync()
    {
        await using var c = Open(); await c.OpenAsync();
        var r = await QuerySingleAsync(c, "SELECT id,name,trade_name,cnpj,ie,im,segment,phone1,phone2,email,zip_code,street,number,neighborhood,city,state,logo_url FROM company LIMIT 1");
        return new
        {
            id = r[0], name = r[1], tradeName = r[2], cnpj = r[3], ie = r[4], im = r[5],
            segment = r[6], phone1 = r[7], phone2 = r[8], email = r[9], zipCode = r[10],
            street = r[11], number = r[12], neighborhood = r[13], city = r[14], state = r[15], logoUrl = r[16]
        };
    }

    public async Task<object> UpdateCompanyAsync(UpdateCompanyRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        await ExecuteAsync(c, null,
            """
            UPDATE company SET
                name=$name, trade_name=$trade, cnpj=$cnpj, ie=$ie, im=$im, segment=$seg,
                phone1=$p1, phone2=$p2, email=$email, zip_code=$cep, street=$st,
                number=$num, neighborhood=$neigh, city=$city, state=$uf, logo_url=$logo
            """,
            ("$name", req.Name), ("$trade", req.TradeName), ("$cnpj", req.Cnpj), ("$ie", req.Ie),
            ("$im", req.Im), ("$seg", req.Segment), ("$p1", req.Phone1), ("$p2", req.Phone2),
            ("$email", req.Email), ("$cep", req.ZipCode), ("$st", req.Street), ("$num", req.Number),
            ("$neigh", req.Neighborhood), ("$city", req.City), ("$uf", req.State), ("$logo", req.LogoUrl));
        return new { success = true };
    }

    // -----------------------------------------------------------------
    // Produtos
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListProductsAsync(string? query = null, string? category = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,sku,barcode,name,brand,category,unit,cost_price,markup_pct,sale_price,commission_pct,quantity,min_quantity,location,ncm,cfop,is_weighable,plu_code,size,color,expiry_date FROM product WHERE active=1";
        if (!string.IsNullOrWhiteSpace(query))
        {
            sql += " AND (name LIKE $q OR sku LIKE $q OR barcode LIKE $q OR plu_code LIKE $q)";
            cmd.Parameters.AddWithValue("$q", $"%{query.Trim()}%");
        }
        if (!string.IsNullOrWhiteSpace(category) && category != "Todos")
        {
            sql += " AND category = $cat";
            cmd.Parameters.AddWithValue("$cat", category.Trim());
        }
        sql += " ORDER BY name ASC";
        cmd.CommandText = sql;

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0),
                sku = r.GetString(1),
                barcode = r.IsDBNull(2) ? null : r.GetString(2),
                name = r.GetString(3),
                brand = r.IsDBNull(4) ? null : r.GetString(4),
                category = r.GetString(5),
                unit = r.GetString(6),
                costPrice = r.GetDouble(7),
                markupPct = r.GetDouble(8),
                salePrice = r.GetDouble(9),
                commissionPct = r.GetDouble(10),
                quantity = r.GetDouble(11),
                minQuantity = r.GetDouble(12),
                location = r.IsDBNull(13) ? null : r.GetString(13),
                ncm = r.IsDBNull(14) ? null : r.GetString(14),
                cfop = r.IsDBNull(15) ? null : r.GetString(15),
                isWeighable = r.GetInt32(16) == 1,
                pluCode = r.IsDBNull(17) ? null : r.GetString(17),
                size = r.IsDBNull(18) ? null : r.GetString(18),
                color = r.IsDBNull(19) ? null : r.GetString(19),
                expiryDate = r.IsDBNull(20) ? null : r.GetString(20)
            });
        }
        return list;
    }

    public async Task<object?> GetProductByIdAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,sku,barcode,name,brand,category,unit,cost_price,markup_pct,sale_price,commission_pct,quantity,min_quantity,location,ncm,cfop,is_weighable,plu_code,size,color,expiry_date FROM product WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new
        {
            id = r.GetString(0), sku = r.GetString(1), barcode = r.IsDBNull(2) ? null : r.GetString(2),
            name = r.GetString(3), brand = r.IsDBNull(4) ? null : r.GetString(4), category = r.GetString(5),
            unit = r.GetString(6), costPrice = r.GetDouble(7), markupPct = r.GetDouble(8), salePrice = r.GetDouble(9),
            commissionPct = r.GetDouble(10), quantity = r.GetDouble(11), minQuantity = r.GetDouble(12),
            location = r.IsDBNull(13) ? null : r.GetString(13), ncm = r.IsDBNull(14) ? null : r.GetString(14),
            cfop = r.IsDBNull(15) ? null : r.GetString(15), isWeighable = r.GetInt32(16) == 1,
            pluCode = r.IsDBNull(17) ? null : r.GetString(17), size = r.IsDBNull(18) ? null : r.GetString(18),
            color = r.IsDBNull(19) ? null : r.GetString(19), expiryDate = r.IsDBNull(20) ? null : r.GetString(20)
        };
    }

    public async Task<object> SaveProductAsync(ProductDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        await ExecuteAsync(c, null,
            """
            INSERT INTO product (
                id, company_id, sku, barcode, name, brand, category, unit, cost_price,
                markup_pct, sale_price, commission_pct, quantity, min_quantity, location,
                ncm, cfop, supplier_id, is_weighable, plu_code, size, color, expiry_date, active
            ) VALUES (
                $id, $cid, $sku, $bar, $name, $brand, $cat, $unit, $cost,
                $markup, $sale, $comm, $qty, $minq, $loc,
                $ncm, $cfop, $sup, $w, $plu, $size, $color, $exp, 1
            )
            ON CONFLICT(id) DO UPDATE SET
                sku=$sku, barcode=$bar, name=$name, brand=$brand, category=$cat, unit=$unit,
                cost_price=$cost, markup_pct=$markup, sale_price=$sale, commission_pct=$comm,
                quantity=$qty, min_quantity=$minq, location=$loc, ncm=$ncm, cfop=$cfop,
                supplier_id=$sup, is_weighable=$w, plu_code=$plu, size=$size, color=$color, expiry_date=$exp
            """,
            ("$id", id), ("$cid", cid), ("$sku", req.Sku), ("$bar", req.Barcode),
            ("$name", req.Name), ("$brand", req.Brand), ("$cat", req.Category ?? "Mercearia"),
            ("$unit", req.Unit ?? "UN"), ("$cost", (double)req.CostPrice), ("$markup", (double)req.MarkupPct),
            ("$sale", (double)req.SalePrice), ("$comm", (double)req.CommissionPct), ("$qty", (double)req.Quantity),
            ("$minq", (double)req.MinQuantity), ("$loc", req.Location), ("$ncm", req.Ncm),
            ("$cfop", req.Cfop), ("$sup", req.SupplierId), ("$w", req.IsWeighable ? 1 : 0),
            ("$plu", req.PluCode), ("$size", req.Size), ("$color", req.Color), ("$exp", req.ExpiryDate));

        return new { id, success = true };
    }

    public async Task DeleteProductAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        await ExecuteAsync(c, null, "UPDATE product SET active=0 WHERE id=$id", ("$id", id));
    }

    public async Task AdjustProductStockAsync(Guid id, decimal newQuantity, string? reason)
    {
        await using var c = Open(); await c.OpenAsync();
        await ExecuteAsync(c, null, "UPDATE product SET quantity=$q WHERE id=$id", ("$q", (double)newQuantity), ("$id", id));
    }

    // -----------------------------------------------------------------
    // Clientes
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListCustomersAsync(string? query = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,type,name,trade_name,cpf_cnpj,phone,cell_phone,email,credit_limit,current_debt,blocked,city,state FROM customer WHERE active=1";
        if (!string.IsNullOrWhiteSpace(query))
        {
            sql += " AND (name LIKE $q OR cpf_cnpj LIKE $q OR trade_name LIKE $q OR phone LIKE $q)";
            cmd.Parameters.AddWithValue("$q", $"%{query.Trim()}%");
        }
        sql += " ORDER BY name ASC";
        cmd.CommandText = sql;

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0),
                type = r.GetString(1),
                name = r.GetString(2),
                tradeName = r.IsDBNull(3) ? null : r.GetString(3),
                cpfCnpj = r.IsDBNull(4) ? null : r.GetString(4),
                phone = r.IsDBNull(5) ? null : r.GetString(5),
                cellPhone = r.IsDBNull(6) ? null : r.GetString(6),
                email = r.IsDBNull(7) ? null : r.GetString(7),
                creditLimit = r.GetDouble(8),
                currentDebt = r.GetDouble(9),
                blocked = r.GetInt32(10) == 1,
                city = r.IsDBNull(11) ? null : r.GetString(11),
                state = r.IsDBNull(12) ? null : r.GetString(12)
            });
        }
        return list;
    }

    public async Task<object?> GetCustomerByIdAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,type,name,trade_name,cpf_cnpj,rg_ie,phone,cell_phone,email,zip_code,street,number,neighborhood,city,state,delivery_address,credit_limit,current_debt,blocked,notes FROM customer WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new
        {
            id = r.GetString(0), type = r.GetString(1), name = r.GetString(2), tradeName = r.IsDBNull(3) ? null : r.GetString(3),
            cpfCnpj = r.IsDBNull(4) ? null : r.GetString(4), rgIe = r.IsDBNull(5) ? null : r.GetString(5),
            phone = r.IsDBNull(6) ? null : r.GetString(6), cellPhone = r.IsDBNull(7) ? null : r.GetString(7),
            email = r.IsDBNull(8) ? null : r.GetString(8), zipCode = r.IsDBNull(9) ? null : r.GetString(9),
            street = r.IsDBNull(10) ? null : r.GetString(10), number = r.IsDBNull(11) ? null : r.GetString(11),
            neighborhood = r.IsDBNull(12) ? null : r.GetString(12), city = r.IsDBNull(13) ? null : r.GetString(13),
            state = r.IsDBNull(14) ? null : r.GetString(14), deliveryAddress = r.IsDBNull(15) ? null : r.GetString(15),
            creditLimit = r.GetDouble(16), currentDebt = r.GetDouble(17), blocked = r.GetInt32(18) == 1, notes = r.IsDBNull(19) ? null : r.GetString(19)
        };
    }

    public async Task<object> SaveCustomerAsync(CustomerDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        await ExecuteAsync(c, null,
            """
            INSERT INTO customer (
                id, company_id, type, name, trade_name, cpf_cnpj, rg_ie, phone, cell_phone,
                email, zip_code, street, number, neighborhood, city, state, delivery_address,
                credit_limit, current_debt, blocked, notes, active
            ) VALUES (
                $id, $cid, $type, $name, $trade, $cpf, $rg, $phone, $cell,
                $email, $zip, $st, $num, $neigh, $city, $uf, $deliv,
                $limit, $debt, $block, $notes, 1
            )
            ON CONFLICT(id) DO UPDATE SET
                type=$type, name=$name, trade_name=$trade, cpf_cnpj=$cpf, rg_ie=$rg,
                phone=$phone, cell_phone=$cell, email=$email, zip_code=$zip, street=$st,
                number=$num, neighborhood=$neigh, city=$city, state=$uf, delivery_address=$deliv,
                credit_limit=$limit, blocked=$block, notes=$notes
            """,
            ("$id", id), ("$cid", cid), ("$type", req.Type ?? "PF"), ("$name", req.Name),
            ("$trade", req.TradeName), ("$cpf", req.CpfCnpj), ("$rg", req.RgIe), ("$phone", req.Phone),
            ("$cell", req.CellPhone), ("$email", req.Email), ("$zip", req.ZipCode), ("$st", req.Street),
            ("$num", req.Number), ("$neigh", req.Neighborhood), ("$city", req.City), ("$uf", req.State),
            ("$deliv", req.DeliveryAddress), ("$limit", (double)req.CreditLimit), ("$debt", (double)req.CurrentDebt),
            ("$block", req.Blocked ? 1 : 0), ("$notes", req.Notes));

        return new { id, success = true };
    }

    public async Task<object> GetCustomerCrediarioAsync(Guid customerId)
    {
        await using var c = Open(); await c.OpenAsync();
        var cust = await GetCustomerByIdAsync(customerId);
        if (cust is null) return new { error = "Cliente não encontrado" };

        var accounts = new List<object>();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,contract_number,total_amount,balance,due_date,status,created_at FROM credit_account WHERE customer_id=$cid ORDER BY due_date ASC";
        cmd.Parameters.AddWithValue("$cid", customerId.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            accounts.Add(new
            {
                id = r.GetString(0), contractNumber = r.GetString(1), totalAmount = r.GetDouble(2),
                balance = r.GetDouble(3), dueDate = r.GetString(4), status = r.GetString(5), createdAt = r.GetString(6)
            });
        }

        var receipts = new List<object>();
        var cmdRec = c.CreateCommand();
        cmdRec.CommandText = "SELECT id,amount_paid,discount,penalty_interest,operator_name,paid_at FROM credit_receipt WHERE customer_id=$cid ORDER BY paid_at DESC";
        cmdRec.Parameters.AddWithValue("$cid", customerId.ToString());
        await using var rRec = await cmdRec.ExecuteReaderAsync();
        while (await rRec.ReadAsync())
        {
            receipts.Add(new
            {
                id = rRec.GetString(0), amountPaid = rRec.GetDouble(1), discount = rRec.GetDouble(2),
                penaltyInterest = rRec.GetDouble(3), operatorName = rRec.GetString(4), paidAt = rRec.GetString(5)
            });
        }

        return new { customer = cust, accounts, receipts };
    }

    public async Task<object> ReceiveCrediarioPaymentAsync(ReceiveCrediarioRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        await using var tx = await c.BeginTransactionAsync();

        var receiptId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O");

        // Atualiza a conta de crediário se especificada
        if (req.CreditAccountId.HasValue)
        {
            var updAcc = c.CreateCommand();
            updAcc.Transaction = (SqliteTransaction)tx;
            updAcc.CommandText = "UPDATE credit_account SET balance = MAX(0, balance - $amt), status = CASE WHEN balance - $amt <= 0 THEN 'PAGO' ELSE 'ABERTO' END WHERE id=$id";
            updAcc.Parameters.AddWithValue("$amt", (double)req.Amount);
            updAcc.Parameters.AddWithValue("$id", req.CreditAccountId.Value.ToString());
            await updAcc.ExecuteNonQueryAsync();
        }

        // Abate do débito geral do cliente
        var updCust = c.CreateCommand();
        updCust.Transaction = (SqliteTransaction)tx;
        updCust.CommandText = "UPDATE customer SET current_debt = MAX(0, current_debt - $amt) WHERE id=$id";
        updCust.Parameters.AddWithValue("$amt", (double)req.Amount);
        updCust.Parameters.AddWithValue("$id", req.CustomerId.ToString());
        await updCust.ExecuteNonQueryAsync();

        // Insere o recibo de pagamento
        var insRec = c.CreateCommand();
        insRec.Transaction = (SqliteTransaction)tx;
        insRec.CommandText = "INSERT INTO credit_receipt VALUES ($id, $cid, $acc, $amt, $desc, $pen, $op, $now)";
        insRec.Parameters.AddWithValue("$id", receiptId.ToString());
        insRec.Parameters.AddWithValue("$cid", req.CustomerId.ToString());
        insRec.Parameters.AddWithValue("$acc", req.CreditAccountId?.ToString() ?? (object)DBNull.Value);
        insRec.Parameters.AddWithValue("$amt", (double)req.Amount);
        insRec.Parameters.AddWithValue("$desc", (double)req.Discount);
        insRec.Parameters.AddWithValue("$pen", (double)req.Interest);
        insRec.Parameters.AddWithValue("$op", req.OperatorName ?? "Operador");
        insRec.Parameters.AddWithValue("$now", now);
        await insRec.ExecuteNonQueryAsync();

        // Registra entrada no caixa ativo se houver
        var curSess = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' ORDER BY opened_at DESC LIMIT 1");
        if (curSess != null)
        {
            var insMov = c.CreateCommand();
            insMov.Transaction = (SqliteTransaction)tx;
            insMov.CommandText = "INSERT INTO cash_movement VALUES ($id, $sess, 'CREDIARIO', $desc, $amt, $op, $now)";
            insMov.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
            insMov.Parameters.AddWithValue("$sess", curSess);
            insMov.Parameters.AddWithValue("$desc", $"Recebimento Crediário Recibo #{receiptId.ToString()[..8].ToUpperInvariant()}");
            insMov.Parameters.AddWithValue("$amt", (double)req.Amount);
            insMov.Parameters.AddWithValue("$op", req.OperatorName ?? "Operador");
            insMov.Parameters.AddWithValue("$now", now);
            await insMov.ExecuteNonQueryAsync();

            var updSess = c.CreateCommand();
            updSess.Transaction = (SqliteTransaction)tx;
            updSess.CommandText = "UPDATE cash_session SET total_inflows = total_inflows + $amt, closing_balance_expected = closing_balance_expected + $amt WHERE id=$id";
            updSess.Parameters.AddWithValue("$amt", (double)req.Amount);
            updSess.Parameters.AddWithValue("$id", curSess);
            await updSess.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return new { success = true, receiptId, amountPaid = req.Amount, timestamp = now };
    }

    // -----------------------------------------------------------------
    // Fornecedores
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListSuppliersAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,cnpj_cpf,corporate_name,trade_name,state_registration,email,phone,contact_person,city,state FROM supplier WHERE active=1 ORDER BY corporate_name ASC";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), cnpjCpf = r.GetString(1), corporateName = r.GetString(2),
                tradeName = r.IsDBNull(3) ? null : r.GetString(3), stateRegistration = r.IsDBNull(4) ? null : r.GetString(4),
                email = r.IsDBNull(5) ? null : r.GetString(5), phone = r.IsDBNull(6) ? null : r.GetString(6),
                contactPerson = r.IsDBNull(7) ? null : r.GetString(7), city = r.IsDBNull(8) ? null : r.GetString(8),
                state = r.IsDBNull(9) ? null : r.GetString(9)
            });
        }
        return list;
    }

    public async Task<object> SaveSupplierAsync(SupplierDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        await ExecuteAsync(c, null,
            """
            INSERT INTO supplier (
                id, company_id, cnpj_cpf, corporate_name, trade_name,
                state_registration, email, phone, contact_person, city, state, active
            ) VALUES (
                $id, $cid, $cnpj, $corp, $trade, $ie, $email, $phone, $cont, $city, $uf, 1
            )
            ON CONFLICT(id) DO UPDATE SET
                cnpj_cpf=$cnpj, corporate_name=$corp, trade_name=$trade,
                state_registration=$ie, email=$email, phone=$phone, contact_person=$cont, city=$city, state=$uf
            """,
            ("$id", id), ("$cid", cid), ("$cnpj", req.CnpjCpf), ("$corp", req.CorporateName),
            ("$trade", req.TradeName), ("$ie", req.StateRegistration), ("$email", req.Email),
            ("$phone", req.Phone), ("$cont", req.ContactPerson), ("$city", req.City), ("$uf", req.State));

        return new { id, success = true };
    }

    // -----------------------------------------------------------------
    // Controle de Caixa Diário
    // -----------------------------------------------------------------
    public async Task<object?> GetCurrentCashSessionAsync()
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,operator_name,opened_at,opening_balance,total_inflows,total_outflows,closing_balance_expected,status FROM cash_session WHERE status='ABERTO' ORDER BY opened_at DESC LIMIT 1";
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        var sessionId = r.GetString(0);
        var session = new
        {
            id = sessionId,
            operatorName = r.GetString(1),
            openedAt = r.GetString(2),
            openingBalance = r.GetDouble(3),
            totalInflows = r.GetDouble(4),
            totalOutflows = r.GetDouble(5),
            closingBalanceExpected = r.GetDouble(6),
            status = r.GetString(7)
        };

        var movements = new List<object>();
        var cmdMov = c.CreateCommand();
        cmdMov.CommandText = "SELECT id,type,description,amount,operator_name,created_at FROM cash_movement WHERE session_id=$sid ORDER BY created_at ASC";
        cmdMov.Parameters.AddWithValue("$sid", sessionId);
        await using var rMov = await cmdMov.ExecuteReaderAsync();
        while (await rMov.ReadAsync())
        {
            movements.Add(new
            {
                id = rMov.GetString(0), type = rMov.GetString(1), description = rMov.GetString(2),
                amount = rMov.GetDouble(3), operatorName = rMov.GetString(4), createdAt = rMov.GetString(5)
            });
        }

        return new { session, movements };
    }

    public async Task<object> OpenCashSessionAsync(OpenCashRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var activeId = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' LIMIT 1");
        if (activeId != null) return new { error = "Já existe um caixa aberto no momento" };

        var storeId = (await QuerySingleAsync(c, "SELECT id FROM store LIMIT 1"))[0]!;
        var sessionId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O");

        await ExecuteAsync(c, null,
            """
            INSERT INTO cash_session VALUES (
                $id, $sid, $uid, $op, $now, null,
                $open, 0, 0, $open, null, null, 'ABERTO'
            )
            """,
            ("$id", sessionId), ("$sid", storeId), ("$uid", req.OperatorId ?? Guid.NewGuid()),
            ("$op", req.OperatorName ?? "Operador"), ("$now", now), ("$open", (double)req.OpeningBalance));

        await ExecuteAsync(c, null,
            "INSERT INTO cash_movement VALUES ($id, $sess, 'ABERTURA', 'Abertura de caixa com fundo de troco', $amt, $op, $now)",
            ("$id", Guid.NewGuid()), ("$sess", sessionId), ("$amt", (double)req.OpeningBalance),
            ("$op", req.OperatorName ?? "Operador"), ("$now", now));

        return new { sessionId, success = true };
    }

    public async Task<object> AddCashMovementAsync(string type, CashMovementRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var sessionId = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' LIMIT 1");
        if (sessionId == null) return new { error = "Nenhum caixa aberto no momento" };

        var now = DateTimeOffset.UtcNow.ToString("O");
        var amt = (double)req.Amount;

        await ExecuteAsync(c, null,
            "INSERT INTO cash_movement VALUES ($id, $sess, $type, $desc, $amt, $op, $now)",
            ("$id", Guid.NewGuid()), ("$sess", sessionId), ("$type", type),
            ("$desc", req.Description ?? type), ("$amt", amt),
            ("$op", req.OperatorName ?? "Operador"), ("$now", now));

        if (type == "SANGRIA")
        {
            await ExecuteAsync(c, null,
                "UPDATE cash_session SET total_outflows = total_outflows + $amt, closing_balance_expected = closing_balance_expected - $amt WHERE id=$id",
                ("$amt", amt), ("$id", sessionId));
        }
        else
        {
            await ExecuteAsync(c, null,
                "UPDATE cash_session SET total_inflows = total_inflows + $amt, closing_balance_expected = closing_balance_expected + $amt WHERE id=$id",
                ("$amt", amt), ("$id", sessionId));
        }

        return new { success = true, type, amount = req.Amount, timestamp = now };
    }

    public async Task<object> CloseCashSessionAsync(CloseCashRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var sessionId = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' LIMIT 1");
        if (sessionId == null) return new { error = "Nenhum caixa aberto para fechamento" };

        var expected = await ScalarAsync<double>($"SELECT closing_balance_expected FROM cash_session WHERE id='{sessionId}'");
        var physical = (double)req.PhysicalBalance;
        var diff = physical - expected;
        var now = DateTimeOffset.UtcNow.ToString("O");

        await ExecuteAsync(c, null,
            """
            UPDATE cash_session SET
                closed_at=$now, closing_balance_physical=$phys, difference=$diff, status='FECHADO'
            WHERE id=$id
            """,
            ("$now", now), ("$phys", physical), ("$diff", diff), ("$id", sessionId));

        return new
        {
            sessionId,
            expectedBalance = expected,
            physicalBalance = physical,
            difference = diff,
            closedAt = now,
            status = "FECHADO"
        };
    }

    public async Task<IReadOnlyList<object>> ListCashHistoryAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,operator_name,opened_at,closed_at,opening_balance,closing_balance_expected,closing_balance_physical,difference,status FROM cash_session ORDER BY opened_at DESC LIMIT 30";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), operatorName = r.GetString(1), openedAt = r.GetString(2),
                closedAt = r.IsDBNull(3) ? null : r.GetString(3), openingBalance = r.GetDouble(4),
                expected = r.GetDouble(5), physical = r.IsDBNull(6) ? null : (double?)r.GetDouble(6),
                difference = r.IsDBNull(7) ? null : (double?)r.GetDouble(7), status = r.GetString(8)
            });
        }
        return list;
    }

    // -----------------------------------------------------------------
    // Frente de Caixa (Vendas PDV)
    // -----------------------------------------------------------------
    public async Task<object> CompleteSaleAsync(CompleteSaleWebRequest request)
    {
        await using var connection = Open(); await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var storeId = (await QuerySingleAsync(connection, "SELECT id FROM store LIMIT 1"))[0]!;
        var nextNumber = (await ScalarAsync<long>("SELECT COALESCE(MAX(number),0) FROM sale")) + 1;
        var saleId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O");

        // 1. Baixa de estoque dos itens da venda
        var itemNumber = 1;
        foreach (var item in request.Items)
        {
            var pData = await QuerySingleAsync(connection, $"SELECT sku,barcode,name,unit FROM product WHERE id='{item.ProductId}'");
            var sku = pData[0] ?? "SKU";
            var bar = pData[1];
            var name = pData[2] ?? "Item";
            var unit = pData[3] ?? "UN";

            var insItem = connection.CreateCommand();
            insItem.Transaction = (SqliteTransaction)tx;
            insItem.CommandText = "INSERT INTO sale_item VALUES ($id, $sid, $num, $pid, $sku, $bar, $name, $unit, $qty, $prc, $disc, $tot)";
            insItem.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
            insItem.Parameters.AddWithValue("$sid", saleId.ToString());
            insItem.Parameters.AddWithValue("$num", itemNumber++);
            insItem.Parameters.AddWithValue("$pid", item.ProductId.ToString());
            insItem.Parameters.AddWithValue("$sku", sku);
            insItem.Parameters.AddWithValue("$bar", bar ?? (object)DBNull.Value);
            insItem.Parameters.AddWithValue("$name", name);
            insItem.Parameters.AddWithValue("$unit", unit);
            insItem.Parameters.AddWithValue("$qty", (double)item.Quantity);
            insItem.Parameters.AddWithValue("$prc", (double)item.UnitPrice);
            insItem.Parameters.AddWithValue("$disc", (double)item.Discount);
            insItem.Parameters.AddWithValue("$tot", (double)item.TotalPrice);
            await insItem.ExecuteNonQueryAsync();

            var updateCmd = connection.CreateCommand();
            updateCmd.Transaction = (SqliteTransaction)tx;
            updateCmd.CommandText = "UPDATE product SET quantity = MAX(0, quantity - $q) WHERE id=$pid";
            updateCmd.Parameters.AddWithValue("$q", (double)item.Quantity);
            updateCmd.Parameters.AddWithValue("$pid", item.ProductId.ToString());
            await updateCmd.ExecuteNonQueryAsync();
        }

        // 2. Registro dos meios de pagamento
        foreach (var pay in request.Payments)
        {
            var insPay = connection.CreateCommand();
            insPay.Transaction = (SqliteTransaction)tx;
            insPay.CommandText = "INSERT INTO sale_payment VALUES ($id, $sid, $meth, $amt, $flag, $inst, $chg)";
            insPay.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
            insPay.Parameters.AddWithValue("$sid", saleId.ToString());
            insPay.Parameters.AddWithValue("$meth", pay.Method);
            insPay.Parameters.AddWithValue("$amt", (double)pay.Amount);
            insPay.Parameters.AddWithValue("$flag", pay.CardFlag ?? (object)DBNull.Value);
            insPay.Parameters.AddWithValue("$inst", pay.Installments);
            insPay.Parameters.AddWithValue("$chg", (double)request.Change);
            await insPay.ExecuteNonQueryAsync();

            // Se pagamento for crediário, registra carnê e aumenta débito do cliente
            if (pay.Method.Equals("CREDIARIO", StringComparison.OrdinalIgnoreCase) && request.CustomerId.HasValue)
            {
                var custCmd = connection.CreateCommand();
                custCmd.Transaction = (SqliteTransaction)tx;
                custCmd.CommandText = "UPDATE customer SET current_debt = current_debt + $amt WHERE id=$cid";
                custCmd.Parameters.AddWithValue("$amt", (double)pay.Amount);
                custCmd.Parameters.AddWithValue("$cid", request.CustomerId.Value.ToString());
                await custCmd.ExecuteNonQueryAsync();

                var carneCmd = connection.CreateCommand();
                carneCmd.Transaction = (SqliteTransaction)tx;
                carneCmd.CommandText = "INSERT INTO credit_account VALUES ($id, $cid, $sid, $num, $amt, $amt, $due, 'ABERTO', $now)";
                carneCmd.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
                carneCmd.Parameters.AddWithValue("$cid", request.CustomerId.Value.ToString());
                carneCmd.Parameters.AddWithValue("$sid", saleId.ToString());
                carneCmd.Parameters.AddWithValue("$num", $"CARNE-VD-{nextNumber:D6}");
                carneCmd.Parameters.AddWithValue("$amt", (double)pay.Amount);
                carneCmd.Parameters.AddWithValue("$due", DateTimeOffset.UtcNow.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
                carneCmd.Parameters.AddWithValue("$now", now);
                await carneCmd.ExecuteNonQueryAsync();
            }
        }

        // 3. Insere a venda principal
        var paymentSummary = string.Join(" + ", request.Payments.Select(p => $"{p.Method}: R$ {p.Amount:F2}"));
        var insertSale = connection.CreateCommand();
        insertSale.Transaction = (SqliteTransaction)tx;
        insertSale.CommandText = "INSERT INTO sale VALUES ($id, $sid, $num, $sub, $desc, $add, $tot, $pay, $opid, $op, $cid, $cust, $cpf, 'CONCLUIDA', null, $now)";
        insertSale.Parameters.AddWithValue("$id", saleId.ToString());
        insertSale.Parameters.AddWithValue("$sid", storeId);
        insertSale.Parameters.AddWithValue("$num", nextNumber);
        insertSale.Parameters.AddWithValue("$sub", (double)request.Subtotal);
        insertSale.Parameters.AddWithValue("$desc", (double)request.Discount);
        insertSale.Parameters.AddWithValue("$add", (double)request.Addition);
        insertSale.Parameters.AddWithValue("$tot", (double)request.Total);
        insertSale.Parameters.AddWithValue("$pay", paymentSummary);
        insertSale.Parameters.AddWithValue("$opid", request.OperatorId?.ToString() ?? (object)DBNull.Value);
        insertSale.Parameters.AddWithValue("$op", request.OperatorName ?? "Operador 01");
        insertSale.Parameters.AddWithValue("$cid", request.CustomerId?.ToString() ?? (object)DBNull.Value);
        insertSale.Parameters.AddWithValue("$cust", request.CustomerName ?? (object)DBNull.Value);
        insertSale.Parameters.AddWithValue("$cpf", request.CustomerCpf ?? (object)DBNull.Value);
        insertSale.Parameters.AddWithValue("$now", now);
        await insertSale.ExecuteNonQueryAsync();

        // 4. Se houver dinheiro ou pix e houver caixa aberto, incrementa saldo do caixa
        var cashInflow = request.Payments
            .Where(p => p.Method.Equals("DINHEIRO", StringComparison.OrdinalIgnoreCase))
            .Sum(p => (double)p.Amount - (double)request.Change);

        var curSess = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' ORDER BY opened_at DESC LIMIT 1");
        if (curSess != null && cashInflow > 0)
        {
            var insMov = connection.CreateCommand();
            insMov.Transaction = (SqliteTransaction)tx;
            insMov.CommandText = "INSERT INTO cash_movement VALUES ($id, $sess, 'VENDA', $desc, $amt, $op, $now)";
            insMov.Parameters.AddWithValue("$id", Guid.NewGuid().ToString());
            insMov.Parameters.AddWithValue("$sess", curSess);
            insMov.Parameters.AddWithValue("$desc", $"Venda Cupom #{nextNumber:D6}");
            insMov.Parameters.AddWithValue("$amt", cashInflow);
            insMov.Parameters.AddWithValue("$op", request.OperatorName ?? "Operador 01");
            insMov.Parameters.AddWithValue("$now", now);
            await insMov.ExecuteNonQueryAsync();

            var updSess = connection.CreateCommand();
            updSess.Transaction = (SqliteTransaction)tx;
            updSess.CommandText = "UPDATE cash_session SET total_inflows = total_inflows + $amt, closing_balance_expected = closing_balance_expected + $amt WHERE id=$id";
            updSess.Parameters.AddWithValue("$amt", cashInflow);
            updSess.Parameters.AddWithValue("$id", curSess);
            await updSess.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();

        return new
        {
            saleId,
            number = nextNumber,
            total = request.Total,
            change = request.Change,
            paymentSummary,
            timestamp = now
        };
    }

    public async Task<IReadOnlyList<object>> ListSalesAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,number,subtotal,discount,total,payment_summary,operator_name,customer_name,customer_cpf,status,completed_at FROM sale ORDER BY number DESC LIMIT 50";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), number = r.GetInt64(1), subtotal = r.GetDouble(2),
                discount = r.GetDouble(3), total = r.GetDouble(4), paymentSummary = r.GetString(5),
                operatorName = r.GetString(6), customerName = r.IsDBNull(7) ? null : r.GetString(7),
                customerCpf = r.IsDBNull(8) ? null : r.GetString(8), status = r.GetString(9), completedAt = r.GetString(10)
            });
        }
        return list;
    }

    public async Task<object?> GetSaleByNumberAsync(long number)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,number,subtotal,discount,addition,total,payment_summary,operator_name,customer_name,customer_cpf,status,cancel_reason,completed_at FROM sale WHERE number=$num";
        cmd.Parameters.AddWithValue("$num", number);
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        var saleId = r.GetString(0);
        var sale = new
        {
            id = saleId, number = r.GetInt64(1), subtotal = r.GetDouble(2), discount = r.GetDouble(3),
            addition = r.GetDouble(4), total = r.GetDouble(5), paymentSummary = r.GetString(6),
            operatorName = r.GetString(7), customerName = r.IsDBNull(8) ? null : r.GetString(8),
            customerCpf = r.IsDBNull(9) ? null : r.GetString(9), status = r.GetString(10),
            cancelReason = r.IsDBNull(11) ? null : r.GetString(11), completedAt = r.GetString(12)
        };

        var items = new List<object>();
        var cmdIt = c.CreateCommand();
        cmdIt.CommandText = "SELECT item_number,sku,barcode,name,unit,quantity,unit_price,discount,total_price FROM sale_item WHERE sale_id=$sid ORDER BY item_number ASC";
        cmdIt.Parameters.AddWithValue("$sid", saleId);
        await using var rIt = await cmdIt.ExecuteReaderAsync();
        while (await rIt.ReadAsync())
        {
            items.Add(new
            {
                itemNumber = rIt.GetInt32(0), sku = rIt.GetString(1), barcode = rIt.IsDBNull(2) ? null : rIt.GetString(2),
                name = rIt.GetString(3), unit = rIt.GetString(4), quantity = rIt.GetDouble(5),
                unitPrice = rIt.GetDouble(6), discount = rIt.GetDouble(7), totalPrice = rIt.GetDouble(8)
            });
        }

        return new { sale, items };
    }

    public async Task<object> CancelSaleAsync(long number, string? reason, string? supervisorPassword)
    {
        await using var c = Open(); await c.OpenAsync();
        var saleData = await QuerySingleAsync(c, $"SELECT id,status FROM sale WHERE number={number}");
        if (saleData[0] == null) return new { error = "Venda não encontrada" };
        if (saleData[1] == "CANCELADA") return new { error = "Esta venda já está cancelada" };

        var saleId = saleData[0]!;

        // Estorno de estoque
        await using var tx = await c.BeginTransactionAsync();
        var itCmd = c.CreateCommand();
        itCmd.Transaction = (SqliteTransaction)tx;
        itCmd.CommandText = "SELECT product_id,quantity FROM sale_item WHERE sale_id=$sid";
        itCmd.Parameters.AddWithValue("$sid", saleId);
        var itemsToRevert = new List<(string Pid, double Qty)>();
        await using (var r = await itCmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync()) itemsToRevert.Add((r.GetString(0), r.GetDouble(1)));
        }

        foreach (var (pid, qty) in itemsToRevert)
        {
            var revCmd = c.CreateCommand();
            revCmd.Transaction = (SqliteTransaction)tx;
            revCmd.CommandText = "UPDATE product SET quantity = quantity + $q WHERE id=$pid";
            revCmd.Parameters.AddWithValue("$q", qty);
            revCmd.Parameters.AddWithValue("$pid", pid);
            await revCmd.ExecuteNonQueryAsync();
        }

        var cancelCmd = c.CreateCommand();
        cancelCmd.Transaction = (SqliteTransaction)tx;
        cancelCmd.CommandText = "UPDATE sale SET status='CANCELADA', cancel_reason=$reason WHERE id=$sid";
        cancelCmd.Parameters.AddWithValue("$reason", reason ?? "Cancelamento Solicitado pelo Operador");
        cancelCmd.Parameters.AddWithValue("$sid", saleId);
        await cancelCmd.ExecuteNonQueryAsync();

        await tx.CommitAsync();
        return new { success = true, number, status = "CANCELADA" };
    }

    // -----------------------------------------------------------------
    // Financeiro (Contas a Pagar e Receber)
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListFinancialEntriesAsync(string? type = null, string? status = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,type,title,doc_number,barcode,issuer_bank,entity_name,due_date,amount,installment_number,total_installments,status,paid_at,paid_amount FROM financial_entry WHERE 1=1";
        if (!string.IsNullOrWhiteSpace(type))
        {
            sql += " AND type = $type";
            cmd.Parameters.AddWithValue("$type", type.ToUpperInvariant());
        }
        if (!string.IsNullOrWhiteSpace(status))
        {
            sql += " AND status = $status";
            cmd.Parameters.AddWithValue("$status", status.ToUpperInvariant());
        }
        sql += " ORDER BY due_date ASC";
        cmd.CommandText = sql;

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), type = r.GetString(1), title = r.GetString(2),
                docNumber = r.IsDBNull(3) ? null : r.GetString(3), barcode = r.IsDBNull(4) ? null : r.GetString(4),
                issuerBank = r.IsDBNull(5) ? null : r.GetString(5), entityName = r.IsDBNull(6) ? null : r.GetString(6),
                dueDate = r.GetString(7), amount = r.GetDouble(8), installmentNumber = r.GetInt32(9),
                totalInstallments = r.GetInt32(10), status = r.GetString(11),
                paidAt = r.IsDBNull(12) ? null : r.GetString(12), paidAmount = r.IsDBNull(13) ? null : (double?)r.GetDouble(13)
            });
        }
        return list;
    }

    public async Task<object> SaveFinancialEntryAsync(FinancialEntryDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        await ExecuteAsync(c, null,
            """
            INSERT INTO financial_entry VALUES (
                $id, $cid, $type, $title, $doc, $bar, $bank, $ent,
                $due, $amt, $inst, $totinst, 'PENDENTE', null, null
            )
            """,
            ("$id", id), ("$cid", cid), ("$type", req.Type.ToUpperInvariant()),
            ("$title", req.Title), ("$doc", req.DocNumber), ("$bar", req.Barcode),
            ("$bank", req.IssuerBank), ("$ent", req.EntityName), ("$due", req.DueDate),
            ("$amt", (double)req.Amount), ("$inst", req.InstallmentNumber), ("$totinst", req.TotalInstallments));

        return new { id, success = true };
    }

    public async Task SettleFinancialEntryAsync(Guid id, decimal amount, decimal discount, decimal interest)
    {
        await using var c = Open(); await c.OpenAsync();
        var finalPaid = (double)(amount - discount + interest);
        var now = DateTimeOffset.UtcNow.ToString("O");
        await ExecuteAsync(c, null,
            "UPDATE financial_entry SET status='PAGO', paid_at=$now, paid_amount=$amt WHERE id=$id",
            ("$now", now), ("$amt", finalPaid), ("$id", id));
    }

    // -----------------------------------------------------------------
    // XML NF-e Parser e Importador (SEFAZ v4.00)
    // -----------------------------------------------------------------
    public static object ParseNfeXml(string xmlContent)
    {
        try
        {
            var doc = XDocument.Parse(xmlContent);
            XNamespace ns = "http://www.portalfiscal.inf.br/nfe";
            var infNFe = doc.Descendants(ns + "infNFe").FirstOrDefault() ?? doc.Descendants("infNFe").FirstOrDefault();
            if (infNFe == null) return new { error = "Arquivo XML não é uma NF-e válida" };

            var chNFe = infNFe.Attribute("Id")?.Value?.Replace("NFe", string.Empty) ?? "N/A";
            var ide = infNFe.Element(ns + "ide") ?? infNFe.Element("ide");
            var nNF = ide?.Element(ns + "nNF")?.Value ?? ide?.Element("nNF")?.Value ?? "0";
            var dhEmi = ide?.Element(ns + "dhEmi")?.Value ?? ide?.Element("dhEmi")?.Value ?? DateTime.UtcNow.ToString("O");

            var emit = infNFe.Element(ns + "emit") ?? infNFe.Element("emit");
            var emitCnpj = emit?.Element(ns + "CNPJ")?.Value ?? emit?.Element("CNPJ")?.Value ?? "";
            var emitNome = emit?.Element(ns + "xNome")?.Value ?? emit?.Element("xNome")?.Value ?? "Fornecedor";
            var emitFant = emit?.Element(ns + "xFant")?.Value ?? emit?.Element("xFant")?.Value ?? emitNome;

            var total = infNFe.Element(ns + "total")?.Element(ns + "ICMSTot") ?? infNFe.Element("total")?.Element("ICMSTot");
            var vNF = double.Parse(total?.Element(ns + "vNF")?.Value ?? total?.Element("vNF")?.Value ?? "0", CultureInfo.InvariantCulture);

            var items = new List<object>();
            var dets = infNFe.Elements(ns + "det").Any() ? infNFe.Elements(ns + "det") : infNFe.Elements("det");

            foreach (var det in dets)
            {
                var prod = det.Element(ns + "prod") ?? det.Element("prod");
                if (prod == null) continue;

                var cProd = prod.Element(ns + "cProd")?.Value ?? prod.Element("cProd")?.Value ?? "SKU";
                var cEAN = prod.Element(ns + "cEAN")?.Value ?? prod.Element("cEAN")?.Value;
                if (cEAN == "SEM GTIN") cEAN = null;
                var xProd = prod.Element(ns + "xProd")?.Value ?? prod.Element("xProd")?.Value ?? "Produto";
                var ncm = prod.Element(ns + "NCM")?.Value ?? prod.Element("NCM")?.Value ?? "";
                var cfop = prod.Element(ns + "CFOP")?.Value ?? prod.Element("CFOP")?.Value ?? "5102";
                var uCom = prod.Element(ns + "uCom")?.Value ?? prod.Element("uCom")?.Value ?? "UN";
                var qCom = double.Parse(prod.Element(ns + "qCom")?.Value ?? prod.Element("qCom")?.Value ?? "1", CultureInfo.InvariantCulture);
                var vUnCom = double.Parse(prod.Element(ns + "vUnCom")?.Value ?? prod.Element("vUnCom")?.Value ?? "0", CultureInfo.InvariantCulture);
                var vProd = double.Parse(prod.Element(ns + "vProd")?.Value ?? prod.Element("vProd")?.Value ?? "0", CultureInfo.InvariantCulture);

                var suggestedMarkup = 40.0;
                var suggestedSale = vUnCom * (1 + (suggestedMarkup / 100.0));

                items.Add(new
                {
                    sku = cProd, barcode = cEAN, name = xProd, ncm, cfop, unit = uCom,
                    quantity = qCom, costPrice = vUnCom, totalPrice = vProd,
                    suggestedMarkup, suggestedSalePrice = Math.Round(suggestedSale, 2)
                });
            }

            return new
            {
                accessKey = chNFe,
                invoiceNumber = nNF,
                issueDate = dhEmi,
                totalAmount = vNF,
                supplier = new { cnpj = emitCnpj, corporateName = emitNome, tradeName = emitFant },
                items
            };
        }
        catch (Exception ex)
        {
            return new { error = $"Falha ao interpretar XML da NF-e: {ex.Message}" };
        }
    }

    public async Task<object> ImportParsedNfeAsync(ImportNfePayload payload)
    {
        await using var c = Open(); await c.OpenAsync();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        // 1. Cadastra ou atualiza fornecedor
        var supId = Guid.NewGuid();
        var existingSup = await QuerySingleAsync(c, $"SELECT id FROM supplier WHERE cnpj_cpf='{payload.SupplierCnpj}'");
        if (existingSup[0] != null) supId = Guid.Parse(existingSup[0]!);
        else
        {
            await ExecuteAsync(c, null,
                "INSERT INTO supplier VALUES ($id, $cid, $cnpj, $corp, $trade, null, null, null, null, null, null, 1)",
                ("$id", supId), ("$cid", cid), ("$cnpj", payload.SupplierCnpj),
                ("$corp", payload.SupplierCorporateName), ("$trade", payload.SupplierTradeName));
        }

        // 2. Importa produtos e dá entrada de estoque
        var importedCount = 0;
        foreach (var item in payload.Items)
        {
            var pId = Guid.NewGuid();
            var existingP = await QuerySingleAsync(c, $"SELECT id,quantity FROM product WHERE sku='{item.Sku}' OR (barcode IS NOT NULL AND barcode='{item.Barcode}')");
            if (existingP[0] != null)
            {
                pId = Guid.Parse(existingP[0]!);
                var oldQty = double.Parse(existingP[1] ?? "0", CultureInfo.InvariantCulture);
                await ExecuteAsync(c, null,
                    """
                    UPDATE product SET
                        cost_price=$cost, markup_pct=$markup, sale_price=$sale,
                        quantity = quantity + $q, ncm=$ncm, supplier_id=$sup
                    WHERE id=$id
                    """,
                    ("$cost", (double)item.CostPrice), ("$markup", (double)item.MarkupPct),
                    ("$sale", (double)item.SalePrice), ("$q", (double)item.Quantity),
                    ("$ncm", item.Ncm), ("$sup", supId.ToString()), ("$id", pId));
            }
            else
            {
                await InsertProductFullAsync(c, cid, item.Sku, item.Barcode, item.Name,
                    payload.SupplierTradeName ?? "Geral", "Mercearia", item.Unit ?? "UN",
                    (double)item.CostPrice, (double)item.MarkupPct, (double)item.SalePrice,
                    0, (double)item.Quantity, 5, "Estoque Entrada", item.Ncm ?? "", "5102",
                    supId.ToString(), 0, null, null, null, null);
            }
            importedCount++;
        }

        // 3. Registra conta a pagar se solicitado
        if (payload.CreatePayable)
        {
            await ExecuteAsync(c, null,
                """
                INSERT INTO financial_entry VALUES (
                    $id, $cid, 'PAGAR', $title, $doc, null, 'Banco', $sup,
                    $due, $amt, 1, 1, 'PENDENTE', null, null
                )
                """,
                ("$id", Guid.NewGuid()), ("$cid", cid),
                ("$title", $"NF-e #{payload.InvoiceNumber} - {payload.SupplierTradeName}"),
                ("$doc", $"NF-{payload.InvoiceNumber}"), ("$sup", payload.SupplierCorporateName),
                ("$due", DateTimeOffset.UtcNow.AddDays(28).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                ("$amt", (double)payload.TotalAmount));
        }

        return new { success = true, importedCount, invoiceNumber = payload.InvoiceNumber };
    }

    // -----------------------------------------------------------------
    // Configurações
    // -----------------------------------------------------------------
    public async Task<Dictionary<string, string>> GetSettingsAsync()
    {
        var dict = new Dictionary<string, string>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT key,value FROM system_settings";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync()) dict[r.GetString(0)] = r.GetString(1);
        return dict;
    }

    public async Task SaveSettingsAsync(Dictionary<string, string> settings)
    {
        await using var c = Open(); await c.OpenAsync();
        foreach (var (k, v) in settings)
        {
            await ExecuteAsync(c, null,
                "INSERT INTO system_settings VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value=$v",
                ("$k", k), ("$v", v));
        }
    }

    // -----------------------------------------------------------------
    // Relatórios (Curva ABC, Fechamento de Caixa, Inadimplência, Estoque Baixo)
    // -----------------------------------------------------------------
    public async Task<object> GetAbcAnalysisReportAsync()
    {
        var items = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = """
            SELECT si.sku, si.name, si.unit, SUM(si.quantity) as tot_qty, SUM(si.total_price) as tot_val
            FROM sale_item si
            JOIN sale s ON s.id = si.sale_id
            WHERE s.status = 'CONCLUIDA'
            GROUP BY si.sku, si.name, si.unit
            ORDER BY tot_val DESC
            LIMIT 50
            """;
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            items.Add(new
            {
                sku = r.GetString(0), name = r.GetString(1), unit = r.GetString(2),
                totalQuantity = r.GetDouble(3), totalRevenue = r.GetDouble(4)
            });
        }
        return items;
    }

    public async Task<object> GetCashSummaryReportAsync()
    {
        await using var c = Open(); await c.OpenAsync();
        var methods = new List<object>();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT method, COUNT(*), SUM(amount) FROM sale_payment GROUP BY method";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            methods.Add(new { method = r.GetString(0), count = r.GetInt64(1), total = r.GetDouble(2) });
        }
        return methods;
    }

    public async Task<object> GetLowStockReportAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT sku,barcode,name,category,quantity,min_quantity,location FROM product WHERE quantity <= min_quantity AND active=1 ORDER BY quantity ASC";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                sku = r.GetString(0), barcode = r.IsDBNull(1) ? null : r.GetString(1),
                name = r.GetString(2), category = r.GetString(3), quantity = r.GetDouble(4),
                minQuantity = r.GetDouble(5), location = r.IsDBNull(6) ? null : r.GetString(6)
            });
        }
        return list;
    }

    public async Task<object> GetDefaultersReportAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,name,cpf_cnpj,phone,cell_phone,credit_limit,current_debt FROM customer WHERE current_debt > 0 AND active=1 ORDER BY current_debt DESC";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), name = r.GetString(1), cpfCnpj = r.IsDBNull(2) ? null : r.GetString(2),
                phone = r.IsDBNull(3) ? null : r.GetString(3), cellPhone = r.IsDBNull(4) ? null : r.GetString(4),
                creditLimit = r.GetDouble(5), currentDebt = r.GetDouble(6)
            });
        }
        return list;
    }

    // -----------------------------------------------------------------
    // Usuários
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListUsersAsync()
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,name,login,role,commission_pct,active FROM app_user ORDER BY name ASC";
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), name = r.GetString(1), login = r.GetString(2),
                role = r.GetString(3), commissionPct = r.GetDouble(4), active = r.GetInt32(5) == 1
            });
        }
        return list;
    }

    public async Task<object> CreateUserAsync(CreateUserRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = Guid.NewGuid();
        var (hash, salt) = Passwords.Hash(req.Password);
        var perms = JsonSerializer.Serialize(AdminPermissions);
        var now = DateTimeOffset.UtcNow.ToString("O");

        await ExecuteAsync(c, null,
            "INSERT INTO app_user VALUES ($id, $name, $login, $h, $s, $role, $comm, $p, 1, $now)",
            ("$id", id), ("$name", req.Name), ("$login", req.Login), ("$h", hash), ("$s", salt),
            ("$role", req.Role ?? "Operador"), ("$comm", (double)req.CommissionPct), ("$p", perms), ("$now", now));

        return new { id, success = true };
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

    // Helpers
    private SqliteConnection Open() => new(connectionString);
    private async Task<T> ScalarAsync<T>(string sql) { await using var c = Open(); await c.OpenAsync(); var cmd = c.CreateCommand(); cmd.CommandText = sql; var val = await cmd.ExecuteScalarAsync(); if (val == null || val == DBNull.Value) return default!; return (T)Convert.ChangeType(val, typeof(T), CultureInfo.InvariantCulture); }
    private static async Task<long> CountAsync(SqliteConnection c, string table) { var cmd = c.CreateCommand(); cmd.CommandText = $"SELECT COUNT(*) FROM {table}"; return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture); }
    private static async Task<string?[]> QuerySingleAsync(SqliteConnection c, string sql) { var cmd = c.CreateCommand(); cmd.CommandText = sql; await using var r = await cmd.ExecuteReaderAsync(); if (!await r.ReadAsync()) return Array.Empty<string?>(); var values = new string?[r.FieldCount]; for (var i=0;i<r.FieldCount;i++) values[i] = r.IsDBNull(i) ? null : r.GetValue(i).ToString(); return values; }
    private static async Task ExecuteAsync(SqliteConnection c, System.Data.Common.DbTransaction? tx, string sql, params (string Name, object? Value)[] p) { var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.Transaction = (SqliteTransaction?)tx; foreach (var item in p) cmd.Parameters.AddWithValue(item.Name, item.Value ?? (object)DBNull.Value); await cmd.ExecuteNonQueryAsync(); }
    private static AppUser ReadUser(SqliteDataReader r) => new(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(3), JsonSerializer.Deserialize<string[]>(r.GetString(4)) ?? []);
}

static class Passwords
{
    public static (string Hash, string Salt) Hash(string password) { var salt = RandomNumberGenerator.GetBytes(32); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32); return (Convert.ToBase64String(hash), Convert.ToBase64String(salt)); }
    public static bool Verify(string password, string hash, string salt) => CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hash), Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256, 32));
}

// Contratos e DTOs
sealed record AppUser(Guid Id, string Name, string Login, string Role, string[] Permissions);
sealed record LoginRequest(string Login, string Password);
sealed record CreateUserRequest(string Name, string Login, string Password, string? Role, decimal CommissionPct);
sealed record UpdateCompanyRequest(string Name, string? TradeName, string Cnpj, string? Ie, string? Im, string Segment, string? Phone1, string? Phone2, string? Email, string? ZipCode, string? Street, string? Number, string? Neighborhood, string? City, string? State, string? LogoUrl);
sealed record ProductDto(Guid? Id, string Sku, string? Barcode, string Name, string? Brand, string? Category, string? Unit, decimal CostPrice, decimal MarkupPct, decimal SalePrice, decimal CommissionPct, decimal Quantity, decimal MinQuantity, string? Location, string? Ncm, string? Cfop, string? SupplierId, bool IsWeighable, string? PluCode, string? Size, string? Color, string? ExpiryDate);
sealed record AdjustStockRequest(Guid ProductId, decimal NewQuantity, string? Reason);
sealed record CustomerDto(Guid? Id, string? Type, string Name, string? TradeName, string? CpfCnpj, string? RgIe, string? Phone, string? CellPhone, string? Email, string? ZipCode, string? Street, string? Number, string? Neighborhood, string? City, string? State, string? DeliveryAddress, decimal CreditLimit, decimal CurrentDebt, bool Blocked, string? Notes);
sealed record ReceiveCrediarioRequest(Guid CustomerId, Guid? CreditAccountId, decimal Amount, decimal Discount, decimal Interest, string? OperatorName);
sealed record SupplierDto(Guid? Id, string CnpjCpf, string CorporateName, string? TradeName, string? StateRegistration, string? Email, string? Phone, string? ContactPerson, string? City, string? State);
sealed record OpenCashRequest(Guid? OperatorId, string? OperatorName, decimal OpeningBalance);
sealed record CashMovementRequest(decimal Amount, string? Description, string? OperatorName);
sealed record CloseCashRequest(decimal PhysicalBalance);
sealed record CompleteSaleWebRequest(decimal Subtotal, decimal Discount, decimal Addition, decimal Total, decimal Change, Guid? OperatorId, string? OperatorName, Guid? CustomerId, string? CustomerName, string? CustomerCpf, IReadOnlyList<SaleItemWebPayload> Items, IReadOnlyList<SalePaymentPayload> Payments);
sealed record SaleItemWebPayload(Guid ProductId, decimal Quantity, decimal UnitPrice, decimal Discount, decimal TotalPrice);
sealed record SalePaymentPayload(string Method, decimal Amount, string? CardFlag, int Installments);
sealed record CancelSaleRequest(string? Reason, string? SupervisorPassword);
sealed record FinancialEntryDto(Guid? Id, string Type, string Title, string? DocNumber, string? Barcode, string? IssuerBank, string? EntityName, string DueDate, decimal Amount, int InstallmentNumber, int TotalInstallments);
sealed record SettleFinancialRequest(decimal Amount, decimal Discount, decimal Interest);
sealed record ImportNfePayload(string InvoiceNumber, string? AccessKey, string SupplierCnpj, string SupplierCorporateName, string? SupplierTradeName, decimal TotalAmount, bool CreatePayable, IReadOnlyList<NfeParsedItemPayload> Items);
sealed record NfeParsedItemPayload(string Sku, string? Barcode, string Name, string? Ncm, string? Unit, decimal Quantity, decimal CostPrice, decimal MarkupPct, decimal SalePrice);
public partial class Program;
