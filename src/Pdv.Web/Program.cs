using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
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
        options.LoginPath = "/";
        options.Cookie.Name = "pdv-gama-session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.ExpireTimeSpan = TimeSpan.FromHours(10);
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

app.MapGet("/api/state", async (Database db, HttpContext context) =>
{
    var configured = await db.IsConfiguredAsync();
    if (!configured)
        return Results.Ok(new { configured = false, authenticated = false });

    if (context.User.Identity?.IsAuthenticated != true)
        return Results.Ok(new { configured = true, authenticated = false });

    var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var user = await db.GetUserAsync(Guid.Parse(userId));
    return Results.Ok(new
    {
        configured = true,
        authenticated = true,
        user = new { user!.Id, user.Name, user.Login, user.Role, user.Permissions }
    });
});

app.MapPost("/api/setup", async (SetupRequest request, Database db, HttpContext context) =>
{
    if (await db.IsConfiguredAsync()) return Results.Conflict(new { error = "O sistema já foi configurado." });
    if (string.IsNullOrWhiteSpace(request.CompanyName) || string.IsNullOrWhiteSpace(request.AdminName) ||
        string.IsNullOrWhiteSpace(request.Login) || request.Password.Length < 8)
        return Results.BadRequest(new { error = "Preencha os dados e use uma senha com pelo menos 8 caracteres." });

    var result = await db.CreateInitialSetupAsync(request);
    await SignInAsync(context, result.User);
    return Results.Ok(new { success = true });
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

app.MapGet("/api/dashboard", async (Database db) => Results.Ok(await db.GetDashboardAsync()))
    .RequireAuthorization();

app.MapGet("/api/company", async (Database db) => Results.Ok(await db.GetCompanyAsync()))
    .RequireAuthorization();

app.MapGet("/api/users", async (Database db, HttpContext context) =>
{
    if (!Has(context.User, "users.manage")) return Results.Forbid();
    return Results.Ok(await db.ListUsersAsync());
}).RequireAuthorization();

app.MapPost("/api/users", async (CreateUserRequest request, Database db, HttpContext context) =>
{
    if (!Has(context.User, "users.manage")) return Results.Forbid();
    if (request.Password.Length < 8) return Results.BadRequest(new { error = "Senha com no mínimo 8 caracteres." });
    try
    {
        return Results.Ok(await db.CreateUserAsync(request));
    }
    catch (SqliteException exception) when (exception.SqliteErrorCode == 19)
    {
        return Results.Conflict(new { error = "Este login já está em uso." });
    }
}).RequireAuthorization();

app.MapPut("/api/users/{id:guid}/permissions", async (Guid id, UpdatePermissionsRequest request, Database db, HttpContext context) =>
{
    if (!Has(context.User, "users.manage")) return Results.Forbid();
    await db.UpdatePermissionsAsync(id, request.Role, request.Permissions);
    return Results.Ok();
}).RequireAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", version = typeof(Program).Assembly.GetName().Version?.ToString() }));
app.MapFallbackToFile("index.html");
app.Run();

static bool Has(ClaimsPrincipal user, string permission) =>
    user.IsInRole("Administrator") || user.Claims.Any(x => x.Type == "permission" && x.Value == permission);

static async Task SignInAsync(HttpContext context, AppUser user)
{
    var claims = new List<Claim>
    {
        new(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new(ClaimTypes.Name, user.Name),
        new(ClaimTypes.Role, user.Role)
    };
    claims.AddRange(user.Permissions.Select(permission => new Claim("permission", permission)));
    await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)));
}

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
              id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT NOT NULL, sku TEXT NULL,
              sale_price REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
              FOREIGN KEY(company_id) REFERENCES company(id)
            );
            CREATE TABLE IF NOT EXISTS sale (
              id TEXT PRIMARY KEY, store_id TEXT NOT NULL, total REAL NOT NULL, completed_at TEXT NOT NULL,
              FOREIGN KEY(store_id) REFERENCES store(id)
            );
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<bool> IsConfiguredAsync() => await ScalarAsync<long>("SELECT COUNT(*) FROM company") > 0;

    public async Task<(Guid CompanyId, AppUser User)> CreateInitialSetupAsync(SetupRequest request)
    {
        var companyId = Guid.NewGuid();
        var storeId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var (hash, salt) = Passwords.Hash(request.Password);
        var permissions = PermissionCatalog.All;
        await using var connection = Open();
        await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();
        await ExecuteAsync(connection, tx, "INSERT INTO company VALUES ($id,$name,$document,$segment,$created)",
            ("$id", companyId), ("$name", request.CompanyName.Trim()), ("$document", request.Document?.Trim()),
            ("$segment", request.Segment.Trim()), ("$created", DateTimeOffset.UtcNow));
        await ExecuteAsync(connection, tx, "INSERT INTO store VALUES ($id,$company,'MATRIZ',$name,1)",
            ("$id", storeId), ("$company", companyId), ("$name", request.CompanyName.Trim()));
        await ExecuteAsync(connection, tx, "INSERT INTO app_user VALUES ($id,$name,$login,$hash,$salt,'Administrator',$permissions,1,$created)",
            ("$id", userId), ("$name", request.AdminName.Trim()), ("$login", request.Login.Trim()),
            ("$hash", hash), ("$salt", salt), ("$permissions", JsonSerializer.Serialize(permissions)),
            ("$created", DateTimeOffset.UtcNow));
        await tx.CommitAsync();
        return (companyId, new AppUser(userId, request.AdminName.Trim(), request.Login.Trim(), "Administrator", permissions));
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
        var command = connection.CreateCommand(); command.CommandText = "SELECT id,name,login,password_hash,password_salt,role,permissions_json FROM app_user WHERE id=$id";
        command.Parameters.AddWithValue("$id", id.ToString());
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadUser(reader) : null;
    }

    public async Task<object> GetDashboardAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var company = await QuerySingleAsync(connection, "SELECT name,segment FROM company LIMIT 1");
        var stores = await CountAsync(connection, "store");
        var products = await CountAsync(connection, "product");
        var sales = await CountAsync(connection, "sale");
        var total = await ScalarAsync<double>("SELECT COALESCE(SUM(total),0) FROM sale");
        return new { companyName = company[0], segment = company[1], stores, products, sales, salesTotal = total };
    }

    public async Task<object> GetCompanyAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var row = await QuerySingleAsync(connection, "SELECT id,name,document,segment,created_at FROM company LIMIT 1");
        return new { id = row[0], name = row[1], document = row[2], segment = row[3], createdAt = row[4] };
    }

    public async Task<IReadOnlyList<object>> ListUsersAsync()
    {
        var list = new List<object>(); await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand(); command.CommandText = "SELECT id,name,login,role,permissions_json,active FROM app_user ORDER BY name";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync()) list.Add(new { id = reader.GetString(0), name = reader.GetString(1), login = reader.GetString(2), role = reader.GetString(3), permissions = JsonSerializer.Deserialize<string[]>(reader.GetString(4)) ?? [], active = reader.GetInt32(5) == 1 });
        return list;
    }

    public async Task<object> CreateUserAsync(CreateUserRequest request)
    {
        var id = Guid.NewGuid(); var (hash, salt) = Passwords.Hash(request.Password);
        await using var connection = Open(); await connection.OpenAsync();
        await ExecuteAsync(connection, null, "INSERT INTO app_user VALUES ($id,$name,$login,$hash,$salt,$role,$permissions,1,$created)",
            ("$id", id), ("$name", request.Name.Trim()), ("$login", request.Login.Trim()), ("$hash", hash), ("$salt", salt),
            ("$role", request.Role), ("$permissions", JsonSerializer.Serialize(request.Permissions.Distinct())), ("$created", DateTimeOffset.UtcNow));
        return new { id };
    }

    public async Task UpdatePermissionsAsync(Guid id, string role, string[] permissions)
    {
        await using var connection = Open(); await connection.OpenAsync();
        await ExecuteAsync(connection, null, "UPDATE app_user SET role=$role, permissions_json=$permissions WHERE id=$id",
            ("$role", role), ("$permissions", JsonSerializer.Serialize(permissions.Distinct())), ("$id", id));
    }

    private SqliteConnection Open() => new(connectionString);
    private async Task<T> ScalarAsync<T>(string sql) { await using var c = Open(); await c.OpenAsync(); var cmd = c.CreateCommand(); cmd.CommandText = sql; return (T)Convert.ChangeType(await cmd.ExecuteScalarAsync() ?? 0, typeof(T)); }
    private static async Task<long> CountAsync(SqliteConnection c, string table) { var cmd = c.CreateCommand(); cmd.CommandText = $"SELECT COUNT(*) FROM {table}"; return Convert.ToInt64(await cmd.ExecuteScalarAsync()); }
    private static async Task<string?[]> QuerySingleAsync(SqliteConnection c, string sql) { var cmd = c.CreateCommand(); cmd.CommandText = sql; await using var r = await cmd.ExecuteReaderAsync(); await r.ReadAsync(); var values = new string?[r.FieldCount]; for (var i=0;i<r.FieldCount;i++) values[i] = r.IsDBNull(i) ? null : r.GetValue(i).ToString(); return values; }
    private static async Task ExecuteAsync(SqliteConnection c, System.Data.Common.DbTransaction? tx, string sql, params (string Name, object? Value)[] p) { var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.Transaction = (SqliteTransaction?)tx; foreach (var item in p) cmd.Parameters.AddWithValue(item.Name, item.Value?.ToString() ?? (object)DBNull.Value); await cmd.ExecuteNonQueryAsync(); }
    private static AppUser ReadUser(SqliteDataReader r) => new(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(5), JsonSerializer.Deserialize<string[]>(r.GetString(6)) ?? []);
}

static class Passwords
{
    public static (string Hash, string Salt) Hash(string password) { var salt = RandomNumberGenerator.GetBytes(32); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 210_000, HashAlgorithmName.SHA256, 32); return (Convert.ToBase64String(hash), Convert.ToBase64String(salt)); }
    public static bool Verify(string password, string hash, string salt) => CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hash), Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 210_000, HashAlgorithmName.SHA256, 32));
}

static class PermissionCatalog
{
    public static readonly string[] All = ["dashboard.view","sales.view","sales.create","products.view","products.manage","inventory.view","inventory.manage","purchases.view","purchases.manage","reports.view","company.manage","stores.manage","users.manage"];
}

record AppUser(Guid Id, string Name, string Login, string Role, string[] Permissions);
record SetupRequest(string CompanyName, string? Document, string Segment, string AdminName, string Login, string Password);
record LoginRequest(string Login, string Password);
record CreateUserRequest(string Name, string Login, string Password, string Role, string[] Permissions);
record UpdatePermissionsRequest(string Role, string[] Permissions);
public partial class Program;
