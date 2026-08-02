using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pdv.Domain.Entities;
using Pdv.Domain.Enums;
using Pdv.Infrastructure.Persistence;
using Pdv.Web.Security;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseSystemd();

var dataRoot = ResolveDataRoot();
Directory.CreateDirectory(dataRoot);
var databasePath = Path.Combine(dataRoot, "pdv-gama.db");
var connectionString = $"Data Source={databasePath};Cache=Shared;Pooling=True";
var listenUrls = Environment.GetEnvironmentVariable("PDV_URLS") ?? "http://0.0.0.0:5080";
builder.WebHost.UseUrls(listenUrls);

builder.Services.AddDbContextFactory<PdvDbContext>(options => options.UseSqlite(connectionString));
builder.Services.AddSingleton(serviceProvider =>
    new DatabaseInitializer(
        serviceProvider.GetRequiredService<IDbContextFactory<PdvDbContext>>(),
        connectionString));
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "pdv.gama.session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(10);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization(options =>
{
    foreach (var permission in PermissionCatalog.AllCodes)
    {
        options.AddPolicy(permission, policy => policy.RequireClaim("permission", permission));
    }
});

var app = builder.Build();
await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync();

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "PDV Gama Web",
    version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "development",
    database = databasePath
}));

app.MapGet("/api/setup/status", async (
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    return Results.Ok(new
    {
        configured = await db.Users.AsNoTracking().AnyAsync(cancellationToken),
        version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "development"
    });
});

app.MapPost("/api/setup", async (
    SetupRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    IPasswordHasher<AppUser> passwordHasher,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.LegalName) ||
        string.IsNullOrWhiteSpace(request.TradeName) ||
        string.IsNullOrWhiteSpace(request.StoreCode) ||
        string.IsNullOrWhiteSpace(request.StoreName) ||
        string.IsNullOrWhiteSpace(request.AdministratorName) ||
        string.IsNullOrWhiteSpace(request.Login) ||
        string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { error = "Preencha todos os campos obrigatórios." });
    }

    if (request.Password.Length < 8)
    {
        return Results.BadRequest(new { error = "A senha deve ter pelo menos 8 caracteres." });
    }

    if (!Enum.TryParse<BusinessSegment>(request.Segment, true, out var segment))
    {
        return Results.BadRequest(new { error = "Segmento inválido." });
    }

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
    if (await db.Users.AnyAsync(cancellationToken))
    {
        return Results.Conflict(new { error = "A configuração inicial já foi concluída." });
    }

    var company = new Company(request.LegalName, request.TradeName, segment);
    company.UpdateIdentity(request.LegalName, request.TradeName, request.Document, segment);
    var store = new Store(company.Id, request.StoreCode, request.StoreName, true);
    var administrator = new AppUser(
        company.Id,
        store.Id,
        request.AdministratorName,
        request.Login,
        "pending",
        true);
    administrator.ChangePassword(passwordHasher.HashPassword(administrator, request.Password));

    db.Companies.Add(company);
    db.Stores.Add(store);
    db.Users.Add(administrator);
    db.UserPermissions.AddRange(
        PermissionCatalog.AllCodes.Select(permission => new UserPermission(administrator.Id, permission)));

    await db.SaveChangesAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);
    return Results.Ok(new { configured = true });
});

app.MapPost("/api/auth/login", async (
    HttpContext httpContext,
    LoginRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    IPasswordHasher<AppUser> passwordHasher,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Login) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { error = "Informe usuário e senha." });
    }

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var normalizedLogin = AppUser.NormalizeLogin(request.Login);
    var user = await db.Users.SingleOrDefaultAsync(x => x.Login == normalizedLogin, cancellationToken);
    if (user is null || !user.IsActive)
    {
        return Results.Unauthorized();
    }

    var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
    if (verification == PasswordVerificationResult.Failed)
    {
        return Results.Unauthorized();
    }

    if (verification == PasswordVerificationResult.SuccessRehashNeeded)
    {
        user.ChangePassword(passwordHasher.HashPassword(user, request.Password));
    }

    var company = await db.Companies.AsNoTracking()
        .SingleAsync(x => x.Id == user.CompanyId, cancellationToken);
    var store = user.StoreId.HasValue
        ? await db.Stores.AsNoTracking().SingleOrDefaultAsync(x => x.Id == user.StoreId, cancellationToken)
        : null;
    var permissions = user.IsAdministrator
        ? PermissionCatalog.AllCodes
        : await db.UserPermissions.AsNoTracking()
            .Where(x => x.UserId == user.Id)
            .Select(x => x.Permission)
            .ToListAsync(cancellationToken);

    var claims = new List<Claim>
    {
        new(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new(ClaimTypes.Name, user.DisplayName),
        new("company_id", user.CompanyId.ToString()),
        new("company_name", company.TradeName),
        new("administrator", user.IsAdministrator.ToString())
    };
    if (store is not null)
    {
        claims.Add(new Claim("store_id", store.Id.ToString()));
        claims.Add(new Claim("store_name", store.Name));
    }
    claims.AddRange(permissions.Select(permission => new Claim("permission", permission)));

    user.RegisterLogin();
    await db.SaveChangesAsync(cancellationToken);
    await httpContext.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)),
        new AuthenticationProperties
        {
            IsPersistent = request.RememberMe,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(request.RememberMe ? 72 : 10)
        });

    return Results.Ok(new { authenticated = true });
});

app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Ok();
}).RequireAuthorization();

app.MapGet("/api/session", (ClaimsPrincipal user) => Results.Ok(new
{
    authenticated = true,
    userId = user.FindFirstValue(ClaimTypes.NameIdentifier),
    displayName = user.Identity?.Name,
    companyId = user.FindFirstValue("company_id"),
    companyName = user.FindFirstValue("company_name"),
    storeId = user.FindFirstValue("store_id"),
    storeName = user.FindFirstValue("store_name"),
    administrator = string.Equals(user.FindFirstValue("administrator"), "True", StringComparison.OrdinalIgnoreCase),
    permissions = user.FindAll("permission").Select(x => x.Value).OrderBy(x => x)
})).RequireAuthorization();

app.MapGet("/api/permissions", () => Results.Ok(PermissionCatalog.All))
    .RequireAuthorization(PermissionCatalog.UsersManage);

app.MapGet("/api/dashboard", async (
    ClaimsPrincipal user,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var companyId = RequireGuidClaim(user, "company_id");
    var storeId = RequireGuidClaim(user, "store_id");
    var startOfDay = new DateTimeOffset(DateTime.Today, TimeZoneInfo.Local.GetUtcOffset(DateTime.Today)).ToUniversalTime();

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var sales = await db.Sales.AsNoTracking()
        .Include(x => x.Items)
        .Where(x => x.StoreId == storeId && x.Status == SaleStatus.Completed && x.CompletedAt >= startOfDay)
        .ToListAsync(cancellationToken);
    var productCount = await db.Products.AsNoTracking()
        .CountAsync(x => x.CompanyId == companyId && x.IsActive, cancellationToken);
    var lowStock = await db.InventoryBalances.AsNoTracking()
        .CountAsync(x => x.StoreId == storeId && x.Quantity <= x.MinimumQuantity, cancellationToken);
    var storeCount = await db.Stores.AsNoTracking()
        .CountAsync(x => x.CompanyId == companyId && x.IsActive, cancellationToken);
    var pendingSync = await db.OutboxEvents.AsNoTracking()
        .CountAsync(x => x.CompanyId == companyId && x.StoreId == storeId && x.SentAt == null, cancellationToken);
    var hourly = sales
        .GroupBy(x => (x.CompletedAt ?? x.CreatedAt).ToLocalTime().Hour)
        .Select(group => new { hour = group.Key, total = group.Sum(sale => sale.Total) })
        .OrderBy(x => x.hour)
        .ToArray();

    return Results.Ok(new
    {
        salesToday = sales.Sum(x => x.Total),
        transactionsToday = sales.Count,
        productCount,
        lowStock,
        storeCount,
        pendingSync,
        hourly,
        recentSales = sales
            .OrderByDescending(x => x.CompletedAt)
            .Take(8)
            .Select(x => new { x.Number, x.Total, x.CompletedAt })
    });
}).RequireAuthorization(PermissionCatalog.DashboardView);

app.MapGet("/api/stores", async (
    ClaimsPrincipal user,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var companyId = RequireGuidClaim(user, "company_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var stores = await db.Stores.AsNoTracking()
        .Where(x => x.CompanyId == companyId)
        .OrderBy(x => x.Code)
        .Select(x => new { x.Id, x.Code, x.Name, x.IsAdministrationHub, x.IsActive })
        .ToListAsync(cancellationToken);
    return Results.Ok(stores);
}).RequireAuthorization(PermissionCatalog.StoresManage);

app.MapPost("/api/stores", async (
    ClaimsPrincipal user,
    StoreRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { error = "Informe o código e o nome da filial." });
    }

    var companyId = RequireGuidClaim(user, "company_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var normalizedCode = request.Code.Trim().ToUpperInvariant();
    if (await db.Stores.AnyAsync(x => x.CompanyId == companyId && x.Code == normalizedCode, cancellationToken))
    {
        return Results.Conflict(new { error = "Já existe uma filial com esse código." });
    }

    var store = new Store(companyId, request.Code, request.Name);
    db.Stores.Add(store);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/api/stores/{store.Id}", new { store.Id });
}).RequireAuthorization(PermissionCatalog.StoresManage);

app.MapGet("/api/users", async (
    ClaimsPrincipal principal,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var companyId = RequireGuidClaim(principal, "company_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var users = await db.Users.AsNoTracking()
        .Where(x => x.CompanyId == companyId)
        .OrderBy(x => x.DisplayName)
        .ToListAsync(cancellationToken);
    var stores = await db.Stores.AsNoTracking()
        .Where(x => x.CompanyId == companyId)
        .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);
    var permissions = await db.UserPermissions.AsNoTracking()
        .Where(x => users.Select(user => user.Id).Contains(x.UserId))
        .GroupBy(x => x.UserId)
        .ToDictionaryAsync(x => x.Key, x => x.Select(permission => permission.Permission).ToArray(), cancellationToken);

    return Results.Ok(users.Select(item => new
    {
        item.Id,
        item.DisplayName,
        item.Login,
        item.StoreId,
        storeName = item.StoreId.HasValue && stores.TryGetValue(item.StoreId.Value, out var storeName) ? storeName : null,
        item.IsAdministrator,
        item.IsActive,
        item.LastLoginAt,
        permissions = item.IsAdministrator
            ? PermissionCatalog.AllCodes
            : permissions.GetValueOrDefault(item.Id, [])
    }));
}).RequireAuthorization(PermissionCatalog.UsersManage);

app.MapPost("/api/users", async (
    ClaimsPrincipal principal,
    CreateUserRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    IPasswordHasher<AppUser> passwordHasher,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.DisplayName) ||
        string.IsNullOrWhiteSpace(request.Login) ||
        string.IsNullOrWhiteSpace(request.Password) ||
        request.Password.Length < 8)
    {
        return Results.BadRequest(new { error = "Informe nome, usuário e uma senha com pelo menos 8 caracteres." });
    }

    var companyId = RequireGuidClaim(principal, "company_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var normalizedLogin = AppUser.NormalizeLogin(request.Login);
    if (await db.Users.AnyAsync(x => x.Login == normalizedLogin, cancellationToken))
    {
        return Results.Conflict(new { error = "Esse usuário já está em uso." });
    }

    if (request.StoreId.HasValue &&
        !await db.Stores.AnyAsync(x => x.Id == request.StoreId && x.CompanyId == companyId, cancellationToken))
    {
        return Results.BadRequest(new { error = "Filial inválida." });
    }

    var appUser = new AppUser(companyId, request.StoreId, request.DisplayName, request.Login, "pending");
    appUser.ChangePassword(passwordHasher.HashPassword(appUser, request.Password));
    var selectedPermissions = (request.Permissions ?? [])
        .Where(PermissionCatalog.IsKnown)
        .Distinct(StringComparer.Ordinal)
        .ToArray();

    db.Users.Add(appUser);
    db.UserPermissions.AddRange(selectedPermissions.Select(code => new UserPermission(appUser.Id, code)));
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/api/users/{appUser.Id}", new { appUser.Id });
}).RequireAuthorization(PermissionCatalog.UsersManage);

app.MapPatch("/api/users/{id:guid}/active", async (
    Guid id,
    ClaimsPrincipal principal,
    ChangeUserStatusRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var currentUserId = RequireGuidClaim(principal, ClaimTypes.NameIdentifier);
    if (id == currentUserId && !request.IsActive)
    {
        return Results.BadRequest(new { error = "Você não pode desativar o próprio usuário." });
    }

    var companyId = RequireGuidClaim(principal, "company_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var appUser = await db.Users.SingleOrDefaultAsync(x => x.Id == id && x.CompanyId == companyId, cancellationToken);
    if (appUser is null)
    {
        return Results.NotFound();
    }

    appUser.UpdateProfile(appUser.DisplayName, appUser.StoreId, request.IsActive);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Ok();
}).RequireAuthorization(PermissionCatalog.UsersManage);

app.MapGet("/api/products", async (
    ClaimsPrincipal principal,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var companyId = RequireGuidClaim(principal, "company_id");
    var storeId = RequireGuidClaim(principal, "store_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var products = await (
        from product in db.Products.AsNoTracking()
        join balance in db.InventoryBalances.AsNoTracking().Where(x => x.StoreId == storeId)
            on product.Id equals balance.ProductId into productBalances
        from balance in productBalances.DefaultIfEmpty()
        where product.CompanyId == companyId && product.IsActive
        orderby product.Name
        select new
        {
            product.Id,
            product.Sku,
            product.Barcode,
            product.Name,
            unit = product.Unit.ToString(),
            product.CostPrice,
            product.SalePrice,
            quantity = balance == null ? 0 : balance.Quantity,
            minimumQuantity = balance == null ? 0 : balance.MinimumQuantity
        }).ToListAsync(cancellationToken);
    return Results.Ok(products);
}).RequireAuthorization(PermissionCatalog.ProductsView);

app.MapPost("/api/products", async (
    ClaimsPrincipal principal,
    CreateProductRequest request,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Sku) ||
        string.IsNullOrWhiteSpace(request.Name) ||
        !Enum.TryParse<UnitOfMeasure>(request.Unit, true, out var unit))
    {
        return Results.BadRequest(new { error = "Informe SKU, nome e unidade válidos." });
    }

    var companyId = RequireGuidClaim(principal, "company_id");
    var storeId = request.StoreId ?? RequireGuidClaim(principal, "store_id");
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    if (!await db.Stores.AnyAsync(x => x.Id == storeId && x.CompanyId == companyId, cancellationToken))
    {
        return Results.BadRequest(new { error = "Filial inválida." });
    }

    var sku = request.Sku.Trim().ToUpperInvariant();
    if (await db.Products.AnyAsync(x => x.CompanyId == companyId && x.Sku == sku, cancellationToken))
    {
        return Results.Conflict(new { error = "Já existe um produto com esse SKU." });
    }

    var product = new Product(companyId, request.Sku, request.Name, unit, request.SalePrice);
    product.UpdatePricing(request.CostPrice, request.SalePrice);
    product.SetBarcode(request.Barcode);
    var balance = new InventoryBalance(storeId, product.Id, request.InitialQuantity);
    balance.SetMinimum(request.MinimumQuantity);
    db.Products.Add(product);
    db.InventoryBalances.Add(balance);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/api/products/{product.Id}", new { product.Id });
}).RequireAuthorization(PermissionCatalog.ProductsManage);

app.MapFallbackToFile("index.html");
app.Run();

static string ResolveDataRoot()
{
    var configured = Environment.GetEnvironmentVariable("PDV_DATA_DIR");
    if (!string.IsNullOrWhiteSpace(configured))
    {
        return Path.GetFullPath(configured);
    }

    return OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PDVGama", "Web")
        : "/var/lib/pdv-gama";
}

static Guid RequireGuidClaim(ClaimsPrincipal principal, string claimType)
{
    var value = principal.FindFirstValue(claimType);
    return Guid.TryParse(value, out var id)
        ? id
        : throw new InvalidOperationException($"A sessão não contém {claimType}.");
}

public sealed record SetupRequest(
    string LegalName,
    string TradeName,
    string? Document,
    string Segment,
    string StoreCode,
    string StoreName,
    string AdministratorName,
    string Login,
    string Password);

public sealed record LoginRequest(string Login, string Password, bool RememberMe);
public sealed record StoreRequest(string Code, string Name);
public sealed record CreateUserRequest(
    string DisplayName,
    string Login,
    string Password,
    Guid? StoreId,
    IReadOnlyList<string>? Permissions);
public sealed record ChangeUserStatusRequest(bool IsActive);
public sealed record CreateProductRequest(
    string Sku,
    string? Barcode,
    string Name,
    string Unit,
    decimal CostPrice,
    decimal SalePrice,
    decimal InitialQuantity,
    decimal MinimumQuantity,
    Guid? StoreId);

public partial class Program;
