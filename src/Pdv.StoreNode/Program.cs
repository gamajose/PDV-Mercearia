using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pdv.Domain.Entities;
using Pdv.Domain.Enums;
using Pdv.Infrastructure.Configuration;
using Pdv.Infrastructure.Persistence;
using Pdv.Infrastructure.Sync;
using Pdv.StoreNode.Contracts;
using Pdv.StoreNode.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(options => options.ServiceName = "PDV Gama - Nó da Loja");

var dataRoot = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
    "PDVGama",
    "StoreNode");
Directory.CreateDirectory(dataRoot);

var databasePath = Path.Combine(dataRoot, "pdv-store.db");
var settingsPath = Path.Combine(dataRoot, "node-settings.json");
var connectionString = $"Data Source={databasePath};Cache=Shared;Pooling=True";

builder.Services.AddPooledDbContextFactory<PdvDbContext>(options =>
    options.UseSqlite(connectionString));
builder.Services.AddSingleton(new NodeSettingsStore(settingsPath));
builder.Services.AddSingleton(serviceProvider =>
    new DatabaseInitializer(
        serviceProvider.GetRequiredService<IDbContextFactory<PdvDbContext>>(),
        connectionString));
builder.Services.AddHttpClient();
builder.Services.AddSingleton<OutboxDispatcher>();
builder.Services.AddHostedService<SyncWorker>();
builder.Services.AddSignalR();

var app = builder.Build();

await app.Services.GetRequiredService<DatabaseInitializer>().InitializeAsync();

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/health") ||
        context.Request.Path.StartsWithSegments("/api/bootstrap") ||
        context.Request.Path.StartsWithSegments("/realtime"))
    {
        await next();
        return;
    }

    var settings = await app.Services.GetRequiredService<NodeSettingsStore>()
        .LoadAsync(context.RequestAborted);

    if (!context.Request.Headers.TryGetValue("X-Terminal-Key", out var suppliedKey) ||
        !string.Equals(suppliedKey, settings.TerminalApiKey, StringComparison.Ordinal))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { error = "Terminal não autorizado." });
        return;
    }

    await next();
});

app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "PDV Gama Store Node",
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "development",
    utc = DateTimeOffset.UtcNow
}));

app.MapGet("/api/bootstrap/status", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await settingsStore.LoadAsync(cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var configured = settings.CompanyId.HasValue &&
                     settings.StoreId.HasValue &&
                     await db.Companies.AnyAsync(x => x.Id == settings.CompanyId, cancellationToken);

    return Results.Ok(new
    {
        configured,
        settings.NodeId,
        settings.CompanyId,
        settings.StoreId,
        settings.StoreCode,
        settings.IsAdministrationHub,
        terminalApiKey = configured ? settings.TerminalApiKey : null
    });
});

app.MapPost("/api/bootstrap/initialize", async (
    HttpContext httpContext,
    BootstrapRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var remoteAddress = httpContext.Connection.RemoteIpAddress;
    if (remoteAddress is not null && !IPAddress.IsLoopback(remoteAddress))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var current = await settingsStore.LoadAsync(cancellationToken);
    if (current.CompanyId.HasValue || current.StoreId.HasValue)
    {
        return Results.Conflict(new { error = "Nó já configurado." });
    }

    var company = new Company(request.LegalName, request.TradeName, request.Segment);
    var store = new Store(company.Id, request.StoreCode, request.StoreName, request.IsAdministrationHub);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Companies.Add(company);
    db.Stores.Add(store);
    await db.SaveChangesAsync(cancellationToken);

    var configured = current with
    {
        CompanyId = company.Id,
        StoreId = store.Id,
        StoreCode = store.Code,
        IsAdministrationHub = request.IsAdministrationHub,
        AdministrationHubUrl = string.IsNullOrWhiteSpace(request.AdministrationHubUrl)
            ? null
            : request.AdministrationHubUrl.TrimEnd('/'),
        AdministrationHubApiKey = string.IsNullOrWhiteSpace(request.AdministrationHubApiKey)
            ? null
            : request.AdministrationHubApiKey.Trim()
    };
    await settingsStore.SaveAsync(configured, cancellationToken);

    return Results.Created("/api/bootstrap/status", new
    {
        companyId = company.Id,
        storeId = store.Id,
        terminalApiKey = configured.TerminalApiKey
    });
});

app.MapGet("/api/store/profile", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var profile = await (
        from company in db.Companies
        join store in db.Stores on company.Id equals store.CompanyId
        where company.Id == settings.CompanyId && store.Id == settings.StoreId
        select new
        {
            company.TradeName,
            company.Segment,
            StoreName = store.Name,
            store.Code,
            store.IsAdministrationHub
        }).SingleAsync(cancellationToken);

    return Results.Ok(profile);
});

app.MapGet("/api/dashboard", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    var today = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var sales = await db.Sales
        .AsNoTracking()
        .Include(x => x.Items)
        .Where(x => x.StoreId == settings.StoreId &&
                    x.Status == SaleStatus.Completed &&
                    x.CompletedAt >= today)
        .ToListAsync(cancellationToken);

    var lowStock = await db.InventoryBalances
        .AsNoTracking()
        .CountAsync(x => x.StoreId == settings.StoreId &&
                         x.Quantity <= x.MinimumQuantity, cancellationToken);

    var pendingSync = await db.OutboxEvents
        .AsNoTracking()
        .CountAsync(x => x.SentAt == null, cancellationToken);

    return Results.Ok(new
    {
        salesToday = sales.Sum(x => x.Total),
        transactionsToday = sales.Count,
        lowStock,
        pendingSync,
        hourly = sales
            .GroupBy(x => x.CompletedAt?.ToLocalTime().Hour ?? 0)
            .Select(x => new { hour = x.Key, total = x.Sum(sale => sale.Total) })
            .OrderBy(x => x.hour)
    });
});

app.MapGet("/api/products", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var products = await (
        from product in db.Products.AsNoTracking()
        join balance in db.InventoryBalances.AsNoTracking()
            on new { ProductId = product.Id, StoreId = settings.StoreId!.Value }
            equals new { balance.ProductId, balance.StoreId }
            into balances
        from balance in balances.DefaultIfEmpty()
        where product.CompanyId == settings.CompanyId && product.IsActive
        orderby product.Name
        select new
        {
            product.Id,
            product.Sku,
            product.Barcode,
            product.Name,
            product.Unit,
            product.CostPrice,
            product.SalePrice,
            Quantity = balance == null ? 0 : balance.Quantity,
            MinimumQuantity = balance == null ? 0 : balance.MinimumQuantity
        }).ToListAsync(cancellationToken);

    return Results.Ok(products);
});

app.MapPost("/api/products", async (
    CreateProductRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    var product = new Product(
        settings.CompanyId!.Value,
        request.Sku,
        request.Name,
        request.Unit,
        request.SalePrice);
    product.UpdatePricing(request.CostPrice, request.SalePrice);
    product.SetBarcode(request.Barcode);

    var balance = new InventoryBalance(settings.StoreId!.Value, product.Id, request.InitialQuantity);
    balance.SetMinimum(request.MinimumQuantity);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Products.Add(product);
    db.InventoryBalances.Add(balance);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/products/{product.Id}", new { product.Id });
});

app.MapPost("/api/sales/complete", async (
    CompleteSaleRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    if (request.Items.Count == 0)
    {
        return Results.BadRequest(new { error = "Venda sem itens." });
    }

    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

    var productIds = request.Items.Select(x => x.ProductId).Distinct().ToArray();
    var products = await db.Products
        .Where(x => x.CompanyId == settings.CompanyId && productIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id, cancellationToken);
    var balances = await db.InventoryBalances
        .Where(x => x.StoreId == settings.StoreId && productIds.Contains(x.ProductId))
        .ToDictionaryAsync(x => x.ProductId, cancellationToken);

    var nextNumber = (await db.Sales
        .Where(x => x.StoreId == settings.StoreId)
        .MaxAsync(x => (long?)x.Number, cancellationToken) ?? 0) + 1;

    var sale = new Sale(settings.StoreId!.Value, request.TerminalId, nextNumber);

    foreach (var item in request.Items)
    {
        if (!products.TryGetValue(item.ProductId, out var product) ||
            !balances.TryGetValue(item.ProductId, out var balance))
        {
            return Results.BadRequest(new { error = "Produto ou estoque não encontrado." });
        }

        balance.Remove(item.Quantity);
        sale.AddItem(product.Id, product.Name, item.Quantity, product.SalePrice);
    }

    sale.ApplyDiscount(request.Discount);
    sale.Complete();

    var eventPayload = JsonSerializer.Serialize(new
    {
        sale.Id,
        sale.Number,
        sale.StoreId,
        sale.CompletedAt,
        sale.Total,
        items = sale.Items.Select(x => new
        {
            x.ProductId,
            x.Description,
            x.Quantity,
            x.UnitPrice,
            x.Total
        })
    });

    db.Sales.Add(sale);
    db.OutboxEvents.Add(new OutboxEvent(
        settings.CompanyId!.Value,
        settings.StoreId.Value,
        "sale.completed.v1",
        eventPayload));

    await db.SaveChangesAsync(cancellationToken);
    await transaction.CommitAsync(cancellationToken);

    return Results.Ok(new
    {
        sale.Id,
        sale.Number,
        sale.Total,
        receiptType = "COMPROVANTE NÃO FISCAL"
    });
});

app.MapPost("/api/sync/events", async (
    HttpContext context,
    SyncEventRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    if (!settings.IsAdministrationHub)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    if (!Guid.TryParse(context.Request.Headers["X-Node-Id"], out var sourceNodeId))
    {
        return Results.BadRequest(new { error = "Nó de origem inválido." });
    }

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    var exists = await db.ReceivedSyncEvents.AnyAsync(
        x => x.SourceNodeId == sourceNodeId && x.SourceEventId == request.EventId,
        cancellationToken);

    if (!exists)
    {
        db.ReceivedSyncEvents.Add(new ReceivedSyncEvent(
            request.EventId,
            sourceNodeId,
            request.CompanyId,
            request.StoreId,
            request.EventType,
            request.Payload,
            request.CreatedAt));
        await db.SaveChangesAsync(cancellationToken);
    }

    return Results.Accepted();
});

app.MapHub<StoreHub>("/realtime");

app.Run();

static async Task<NodeSettings> RequireConfiguredAsync(
    NodeSettingsStore settingsStore,
    CancellationToken cancellationToken)
{
    var settings = await settingsStore.LoadAsync(cancellationToken);
    if (!settings.CompanyId.HasValue || !settings.StoreId.HasValue)
    {
        throw new InvalidOperationException("O nó ainda não foi configurado.");
    }

    return settings;
}

public partial class Program;
