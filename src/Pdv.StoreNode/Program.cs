using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pdv.Domain.Entities;
using Pdv.Domain.Enums;
using Pdv.Hardware.Labels;
using Pdv.Infrastructure.Configuration;
using Pdv.Infrastructure.Persistence;
using Pdv.Infrastructure.Purchases;
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
        context.Request.Path.StartsWithSegments("/api/auth") ||
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

// ----------------------------------------------------
// Health & Bootstrap
// ----------------------------------------------------
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "PDV Gama Store Node",
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "1.0.0",
    utc = DateTimeOffset.UtcNow
}));

app.MapGet("/api/bootstrap/status", async (
    HttpContext httpContext,
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
        terminalApiKey = configured &&
                         httpContext.Connection.RemoteIpAddress is { } address &&
                         IPAddress.IsLoopback(address)
            ? settings.TerminalApiKey
            : null
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

    // Cria perfis de segurança padrão e usuário Administrador inicial
    var adminRole = SecurityRole.CreateAdminRole(company.Id);
    var managerRole = SecurityRole.CreateManagerRole(company.Id);
    var cashierRole = SecurityRole.CreateCashierRole(company.Id);
    var adminUser = new User(company.Id, "Administrador Geral", "admin", "admin123", adminRole.Id);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Companies.Add(company);
    db.Stores.Add(store);
    db.SecurityRoles.AddRange(adminRole, managerRole, cashierRole);
    db.Users.Add(adminUser);
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

// ----------------------------------------------------
// Autenticação & RBAC (Segurança)
// ----------------------------------------------------
app.MapPost("/api/auth/login", async (
    LoginRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var targetUsername = request.Username.ToLowerInvariant();
    var user = await db.Users
        .FirstOrDefaultAsync(u => u.CompanyId == settings.CompanyId &&
                                  u.Username == targetUsername &&
                                  u.IsActive, cancellationToken);

    if (user == null || !user.VerifyPassword(request.Password))
    {
        return Results.Unauthorized();
    }

    var role = await db.SecurityRoles.FirstOrDefaultAsync(r => r.Id == user.RoleId, cancellationToken);
    var permissions = role?.Permissions.ToList() ?? [];

    return Results.Ok(new
    {
        user.Id,
        user.Name,
        user.Username,
        RoleName = role?.Name ?? "Sem Perfil",
        Permissions = permissions
    });
});

app.MapPost("/api/auth/authorize-supervisor", async (
    SupervisorAuthRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var targetUsername = request.Username.ToLowerInvariant();
    var user = await db.Users
        .FirstOrDefaultAsync(u => u.CompanyId == settings.CompanyId &&
                                  u.Username == targetUsername &&
                                  u.IsActive, cancellationToken);

    if (user == null || !user.VerifyPassword(request.Password))
    {
        return Results.Unauthorized();
    }

    var role = await db.SecurityRoles.FirstOrDefaultAsync(r => r.Id == user.RoleId, cancellationToken);
    if (role == null || !role.HasPermission(request.RequiredPermission))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    return Results.Ok(new
    {
        authorized = true,
        supervisorId = user.Id,
        supervisorName = user.Name
    });
});

// ----------------------------------------------------
// Perfil e Dashboard da Loja
// ----------------------------------------------------
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
            company.LegalName,
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

// ----------------------------------------------------
// Produtos & Estoque
// ----------------------------------------------------
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
            product.Category,
            product.Department,
            product.Brand,
            product.Size,
            product.Color,
            product.IsWeighable,
            product.PluCode,
            product.Ncm,
            product.Cfop,
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
    product.SetClassification(request.Category, request.Department, request.Brand);
    product.SetApparelAttributes(request.Size, request.Color);
    product.SetWeighable(request.IsWeighable, request.PluCode);
    product.SetFiscal(request.Ncm, request.Cfop);

    var balance = new InventoryBalance(settings.StoreId!.Value, product.Id, request.InitialQuantity);
    balance.SetMinimum(request.MinimumQuantity);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Products.Add(product);
    db.InventoryBalances.Add(balance);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/products/{product.Id}", new { product.Id });
});

// ----------------------------------------------------
// Clientes & Crediário
// ----------------------------------------------------
app.MapGet("/api/customers", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var customers = await db.Customers.AsNoTracking()
        .Where(x => x.CompanyId == settings.CompanyId && x.IsActive)
        .OrderBy(x => x.Name)
        .Select(x => new
        {
            x.Id,
            x.Name,
            x.CpfCnpj,
            x.Phone,
            x.Email,
            x.CreditLimit,
            x.CurrentDebt,
            x.IsCreditBlocked
        })
        .ToListAsync(cancellationToken);

    return Results.Ok(customers);
});

app.MapPost("/api/customers", async (
    CreateCustomerRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    var customer = new Customer(settings.CompanyId!.Value, request.Name, request.CpfCnpj);
    customer.UpdateContact(request.Email, request.Phone, request.Address, request.City, request.State, request.ZipCode);
    customer.SetCreditLimit(request.CreditLimit);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Customers.Add(customer);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/customers/{customer.Id}", new { customer.Id });
});

app.MapPost("/api/customers/{id:guid}/settle", async (
    Guid id,
    SettleCustomerDebtRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var customer = await db.Customers
        .FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == settings.CompanyId, cancellationToken);

    if (customer == null) return Results.NotFound();

    customer.SettleDebt(request.Amount);

    var entry = new FinancialEntry(
        settings.CompanyId!.Value,
        settings.StoreId!.Value,
        FinancialEntryType.Receivable,
        $"Quitação Crediário: {customer.Name}",
        "Crediário Próprio",
        DateOnly.FromDateTime(DateTime.UtcNow),
        request.Amount);

    entry.LinkCustomer(customer.Id);
    entry.Settle(request.Amount, PaymentMethod.Cash);

    db.FinancialEntries.Add(entry);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Ok(new { customer.CurrentDebt });
});

// ----------------------------------------------------
// Fornecedores
// ----------------------------------------------------
app.MapGet("/api/suppliers", async (
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);

    var suppliers = await db.Suppliers.AsNoTracking()
        .Where(x => x.CompanyId == settings.CompanyId && x.IsActive)
        .OrderBy(x => x.TradeName)
        .ToListAsync(cancellationToken);

    return Results.Ok(suppliers);
});

app.MapPost("/api/suppliers", async (
    CreateSupplierRequest request,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);
    var supplier = new Supplier(settings.CompanyId!.Value, request.CorporateName, request.TradeName, request.Cnpj);
    supplier.UpdateInfo(request.CorporateName, request.TradeName, request.StateRegistration, request.ContactName, request.Email, request.Phone);
    supplier.UpdateAddress(request.Address, request.City, request.State, request.ZipCode);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    db.Suppliers.Add(supplier);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/api/suppliers/{supplier.Id}", new { supplier.Id });
});

// ----------------------------------------------------
// Compras & Entrada de NF-e (XML)
// ----------------------------------------------------
app.MapPost("/api/purchases/import-xml", async (
    HttpRequest httpRequest,
    NodeSettingsStore settingsStore,
    IDbContextFactory<PdvDbContext> contextFactory,
    CancellationToken cancellationToken) =>
{
    var settings = await RequireConfiguredAsync(settingsStore, cancellationToken);

    if (!httpRequest.HasFormContentType || httpRequest.Form.Files.Count == 0)
    {
        return Results.BadRequest(new { error = "Arquivo XML da NF-e não enviado." });
    }

    var file = httpRequest.Form.Files[0];
    await using var stream = file.OpenReadStream();
    var invoice = NfeXmlParser.Parse(stream);

    await using var db = await contextFactory.CreateDbContextAsync(cancellationToken);
    await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);

    // 1. Cadastra ou recupera fornecedor
    var cleanCnpj = new string(invoice.Supplier.Cnpj.Where(char.IsDigit).ToArray());
    var supplier = await db.Suppliers
        .FirstOrDefaultAsync(s => s.CompanyId == settings.CompanyId && s.Cnpj == cleanCnpj, cancellationToken);

    if (supplier == null)
    {
        supplier = new Supplier(settings.CompanyId!.Value, invoice.Supplier.CorporateName, invoice.Supplier.TradeName, cleanCnpj);
        supplier.UpdateInfo(invoice.Supplier.CorporateName, invoice.Supplier.TradeName, invoice.Supplier.StateRegistration, null, null, null);
        supplier.UpdateAddress(invoice.Supplier.Address, invoice.Supplier.City, invoice.Supplier.State, invoice.Supplier.ZipCode);
        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync(cancellationToken);
    }

    // 2. Registra compra
    var purchase = new Purchase(settings.StoreId!.Value, supplier.TradeName, invoice.TotalAmount);
    purchase.SetPurchasedAt(invoice.IssueDate);
    db.Purchases.Add(purchase);

    // 3. Atualiza produtos e estoque
    foreach (var item in invoice.Items)
    {
        Product? product = null;

        if (!string.IsNullOrWhiteSpace(item.Barcode))
        {
            product = await db.Products
                .FirstOrDefaultAsync(p => p.CompanyId == settings.CompanyId && p.Barcode == item.Barcode, cancellationToken);
        }

        if (product == null)
        {
            product = await db.Products
                .FirstOrDefaultAsync(p => p.CompanyId == settings.CompanyId && p.Sku == item.SupplierProductCode, cancellationToken);
        }

        if (product == null)
        {
            // Sugere margem padrão de 40% na venda
            var suggestedSalePrice = decimal.Round(item.UnitCost * 1.40m, 2, MidpointRounding.AwayFromZero);
            product = new Product(settings.CompanyId!.Value, item.SupplierProductCode, item.Description, UnitOfMeasure.Unit, suggestedSalePrice);
            product.UpdatePricing(item.UnitCost, suggestedSalePrice);
            product.SetBarcode(item.Barcode);
            product.SetFiscal(item.Ncm, item.Cfop);
            db.Products.Add(product);
        }
        else
        {
            // Atualiza preço de custo
            product.UpdatePricing(item.UnitCost, product.SalePrice);
        }

        await db.SaveChangesAsync(cancellationToken);

        // Adiciona ao estoque da loja
        var balance = await db.InventoryBalances
            .FirstOrDefaultAsync(b => b.StoreId == settings.StoreId && b.ProductId == product.Id, cancellationToken);

        if (balance == null)
        {
            balance = new InventoryBalance(settings.StoreId!.Value, product.Id, item.Quantity);
            db.InventoryBalances.Add(balance);
        }
        else
        {
            balance.Add(item.Quantity);
        }
    }

    // 4. Cria conta a pagar
    var payable = new FinancialEntry(
        settings.CompanyId!.Value,
        settings.StoreId!.Value,
        FinancialEntryType.Payable,
        $"NF-e {invoice.InvoiceNumber} - {supplier.TradeName}",
        "Compras Fornecedores",
        DateOnly.FromDateTime(invoice.IssueDate.DateTime.AddDays(30)),
        invoice.TotalAmount);

    payable.LinkSupplier(supplier.Id);
    db.FinancialEntries.Add(payable);

    await db.SaveChangesAsync(cancellationToken);
    await tx.CommitAsync(cancellationToken);

    return Results.Ok(new
    {
        invoice.AccessKey,
        invoice.InvoiceNumber,
        Supplier = supplier.TradeName,
        ItemsCount = invoice.Items.Count,
        TotalAmount = invoice.TotalAmount
    });
});

// ----------------------------------------------------
// Vendas com Múltiplos Pagamentos & Crediário
// ----------------------------------------------------
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
    if (!string.IsNullOrWhiteSpace(request.OperatorName))
        sale.SetOperator(request.OperatorName);

    Customer? customer = null;
    if (request.CustomerId.HasValue)
    {
        customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId.Value, cancellationToken);
        if (customer != null)
            sale.SetCustomer(customer.Id);
    }

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

    // Registra formas de pagamento
    if (request.Payments != null && request.Payments.Count > 0)
    {
        foreach (var p in request.Payments)
        {
            sale.AddPayment(p.Method, p.Amount);

            // Se for crediário próprio, lança na conta do cliente
            if (p.Method == PaymentMethod.CustomerCredit)
            {
                if (customer == null)
                {
                    return Results.BadRequest(new { error = "Cliente obrigatório para pagamento em crediário próprio." });
                }

                customer.AddDebt(p.Amount);

                var installment = new CreditInstallment(
                    settings.CompanyId!.Value,
                    customer.Id,
                    sale.Id,
                    installmentNumber: 1,
                    totalInstallments: 1,
                    dueDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)),
                    originalAmount: p.Amount);

                db.CreditInstallments.Add(installment);
            }
        }
    }
    else
    {
        // Padrão: dinheiro integral
        sale.AddPayment(PaymentMethod.Cash, sale.Total);
    }

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
        }),
        payments = sale.Payments.Select(p => new
        {
            Method = p.Method.ToString(),
            p.Amount
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
        sale.Change,
        receiptType = "COMPROVANTE NÃO FISCAL"
    });
});

// ----------------------------------------------------
// Impressão de Etiquetas
// ----------------------------------------------------
app.MapPost("/api/labels/print", async (
    PrintLabelsApiRequest request,
    CancellationToken cancellationToken) =>
{
    var job = new LabelPrintJob(request.Layout, request.Items, request.CopiesPerItem);
    var success = await LabelPrintService.PrintLabelsAsync(
        request.PrinterNameOrAddress,
        job,
        request.Language,
        cancellationToken);

    return success ? Results.Ok(new { success = true }) : Results.BadRequest(new { error = "Falha ao enviar para impressora." });
});

// ----------------------------------------------------
// Sincronização Outbox & SignalR
// ----------------------------------------------------
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
