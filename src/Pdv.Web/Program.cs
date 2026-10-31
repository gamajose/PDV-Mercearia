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

// ---------------------------------------------------------------------
// 2. Colaboradores / Funcionários (Unificado com Cliente / Crediário)
// ---------------------------------------------------------------------
app.MapGet("/api/collaborators", async (Database db, string? query) => Results.Ok(await db.ListCollaboratorsAsync(query)));
app.MapGet("/api/collaborators/{id:guid}", async (Guid id, Database db) =>
{
    var c = await db.GetCollaboratorByIdAsync(id);
    return c is not null ? Results.Ok(c) : Results.NotFound();
});
app.MapPost("/api/collaborators", async (CollaboratorDto req, Database db) => Results.Ok(await db.SaveCollaboratorAsync(req)));
app.MapPut("/api/collaborators/{id:guid}", async (Guid id, CollaboratorDto req, Database db) => Results.Ok(await db.SaveCollaboratorAsync(req with { Id = id })));
app.MapDelete("/api/collaborators/{id:guid}", async (Guid id, Database db) =>
{
    await db.DeleteCollaboratorAsync(id);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 3. Painel Executivo & Dados da Empresa
// ---------------------------------------------------------------------
app.MapGet("/api/dashboard", async (Database db) => Results.Ok(await db.GetDashboardAsync()));
app.MapGet("/api/company", async (Database db) => Results.Ok(await db.GetCompanyAsync()));
app.MapPost("/api/company", async (UpdateCompanyRequest req, Database db) => Results.Ok(await db.UpdateCompanyAsync(req)));

// ---------------------------------------------------------------------
// 4. Catálogo de Produtos (Engenharia Reversa Completa Linear Sistemas)
// ---------------------------------------------------------------------
app.MapGet("/api/products", async (Database db, string? query, string? category, string? department) =>
    Results.Ok(await db.ListProductsAsync(query, category, department)));
app.MapGet("/api/products/{id:guid}", async (Guid id, Database db) =>
{
    var p = await db.GetProductByIdAsync(id);
    return p is not null ? Results.Ok(p) : Results.NotFound();
});
app.MapPost("/api/products", async (ProductLinearDto req, Database db) => Results.Ok(await db.SaveProductLinearAsync(req)));
app.MapPut("/api/products/{id:guid}", async (Guid id, ProductLinearDto req, Database db) => Results.Ok(await db.SaveProductLinearAsync(req with { Id = id })));
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
// 5. Clientes & Crediário
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
// 6. Fornecedores
// ---------------------------------------------------------------------
app.MapGet("/api/suppliers", async (Database db) => Results.Ok(await db.ListSuppliersAsync()));
app.MapPost("/api/suppliers", async (SupplierDto req, Database db) => Results.Ok(await db.SaveSupplierAsync(req)));
app.MapPut("/api/suppliers/{id:guid}", async (Guid id, SupplierDto req, Database db) => Results.Ok(await db.SaveSupplierAsync(req with { Id = id })));

// ---------------------------------------------------------------------
// 7. Controle de Caixa Diário (SEPARADO EM ROTAS DISTINTAS)
// ---------------------------------------------------------------------
app.MapGet("/api/cash/status", async (Database db) => Results.Ok(await db.GetCurrentCashStatusAsync()));
app.MapPost("/api/cash/open", async (OpenCashRequest req, Database db) => Results.Ok(await db.OpenCashSessionAsync(req)));
app.MapPost("/api/cash/close", async (CloseCashRequest req, Database db) => Results.Ok(await db.CloseCashSessionAsync(req)));
app.MapPost("/api/cash/sangria", async (CashMovementRequest req, Database db) => Results.Ok(await db.AddCashMovementAsync("SANGRIA", req)));
app.MapPost("/api/cash/suprimento", async (CashMovementRequest req, Database db) => Results.Ok(await db.AddCashMovementAsync("SUPRIMENTO", req)));
app.MapGet("/api/cash/movements", async (Database db, string? type, string? date) => Results.Ok(await db.ListCashMovementsAsync(type, date)));
app.MapGet("/api/cash/history", async (Database db) => Results.Ok(await db.ListCashHistoryAsync()));

// ---------------------------------------------------------------------
// 8. Frente de Caixa (Vendas PDV, Histórico e Cancelamento)
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
// 9. Financeiro (Contas a Pagar e Receber)
// ---------------------------------------------------------------------
app.MapGet("/api/financial", async (Database db, string? type, string? status) => Results.Ok(await db.ListFinancialEntriesAsync(type, status)));
app.MapPost("/api/financial", async (FinancialEntryDto req, Database db) => Results.Ok(await db.SaveFinancialEntryAsync(req)));
app.MapPost("/api/financial/{id:guid}/settle", async (Guid id, SettleFinancialRequest req, Database db) =>
{
    await db.SettleFinancialEntryAsync(id, req.Amount, req.Discount, req.Interest);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 10. Entrada de Compras / Importador de NF-e XML
// ---------------------------------------------------------------------
app.MapPost("/api/nfe/parse", async (HttpRequest request) =>
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
// 11. Configurações de Hardware e Sistema
// ---------------------------------------------------------------------
app.MapGet("/api/settings", async (Database db) => Results.Ok(await db.GetSettingsAsync()));
app.MapPost("/api/settings", async (Dictionary<string, string> settings, Database db) =>
{
    await db.SaveSettingsAsync(settings);
    return Results.Ok(new { success = true });
});

// ---------------------------------------------------------------------
// 12. Relatórios Executivos
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
        "products.manage", "customers.manage", "collaborators.manage", "financial.manage", "settings.manage"
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

            -- Tabela de Colaboradores / Funcionários Unificada com Acesso e Crediário
            CREATE TABLE IF NOT EXISTS collaborator (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                name TEXT NOT NULL,
                cpf TEXT NULL,
                rg TEXT NULL,
                phone TEXT NULL,
                email TEXT NULL,
                street TEXT NULL,
                number TEXT NULL,
                neighborhood TEXT NULL,
                city TEXT NULL,
                state TEXT NULL,
                zip_code TEXT NULL,
                role TEXT NOT NULL,
                admission_date TEXT NULL,
                salary REAL DEFAULT 0,
                commission_pct REAL DEFAULT 0,
                can_login INTEGER DEFAULT 0,
                login TEXT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NULL,
                password_salt TEXT NULL,
                permissions_json TEXT NULL,
                is_customer INTEGER DEFAULT 0,
                credit_limit REAL DEFAULT 0,
                current_debt REAL DEFAULT 0,
                blocked INTEGER DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
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
                is_employee INTEGER DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY(company_id) REFERENCES company(id)
            );

            -- Tabela de Produtos Completa (Engenharia Reversa Linear Sistemas)
            CREATE TABLE IF NOT EXISTS product (
                id TEXT PRIMARY KEY,
                company_id TEXT NOT NULL,
                sku TEXT NOT NULL,
                barcode TEXT NULL,
                secondary_barcodes TEXT NULL,
                name TEXT NOT NULL,
                short_name TEXT NULL,
                label_name TEXT NULL,
                brand TEXT NULL,
                department TEXT NOT NULL DEFAULT 'Alimentos',
                section TEXT NOT NULL DEFAULT 'Mercearia',
                category TEXT NOT NULL DEFAULT 'Geral',
                subcategory TEXT NULL,
                unit TEXT NOT NULL DEFAULT 'UN',
                item_type TEXT NOT NULL DEFAULT '00',
                cost_price REAL NOT NULL DEFAULT 0,
                freight_pct REAL NOT NULL DEFAULT 0,
                other_expenses_pct REAL NOT NULL DEFAULT 0,
                net_cost REAL NOT NULL DEFAULT 0,
                markup_pct REAL NOT NULL DEFAULT 0,
                sale_price REAL NOT NULL DEFAULT 0,
                wholesale_min_qty REAL DEFAULT 0,
                wholesale_price REAL DEFAULT 0,
                promo_price REAL DEFAULT 0,
                promo_start TEXT NULL,
                promo_end TEXT NULL,
                commission_pct REAL NOT NULL DEFAULT 0,
                quantity REAL NOT NULL DEFAULT 0,
                min_quantity REAL NOT NULL DEFAULT 0,
                max_quantity REAL NOT NULL DEFAULT 0,
                location TEXT NULL,
                ncm TEXT NULL,
                cest TEXT NULL,
                cfop TEXT NULL,
                origin TEXT DEFAULT '0',
                icms_cst TEXT DEFAULT '102',
                icms_rate REAL DEFAULT 0,
                pis_cst TEXT DEFAULT '49',
                pis_rate REAL DEFAULT 0,
                cofins_cst TEXT DEFAULT '49',
                cofins_rate REAL DEFAULT 0,
                supplier_id TEXT NULL,
                is_weighable INTEGER NOT NULL DEFAULT 0,
                weigh_type INTEGER NOT NULL DEFAULT 0,
                plu_code TEXT NULL,
                tare_weight REAL DEFAULT 0,
                shelf_life_days INTEGER DEFAULT 0,
                supervisor_auth_required INTEGER DEFAULT 0,
                size TEXT NULL,
                color TEXT NULL,
                expiry_date TEXT NULL,
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

        // Migrações dinâmicas de colunas para bancos existentes
        var cols = new (string Table, string Column, string Definition)[]
        {
            ("product", "secondary_barcodes", "TEXT NULL"),
            ("product", "short_name", "TEXT NULL"),
            ("product", "label_name", "TEXT NULL"),
            ("product", "brand", "TEXT NULL"),
            ("product", "department", "TEXT NOT NULL DEFAULT 'Mercearia'"),
            ("product", "section", "TEXT NOT NULL DEFAULT 'Geral'"),
            ("product", "subcategory", "TEXT NULL"),
            ("product", "item_type", "TEXT NOT NULL DEFAULT '00'"),
            ("product", "freight_pct", "REAL NOT NULL DEFAULT 0"),
            ("product", "other_expenses_pct", "REAL NOT NULL DEFAULT 0"),
            ("product", "net_cost", "REAL NOT NULL DEFAULT 0"),
            ("product", "wholesale_min_qty", "REAL DEFAULT 0"),
            ("product", "wholesale_price", "REAL DEFAULT 0"),
            ("product", "promo_price", "REAL DEFAULT 0"),
            ("product", "promo_start", "TEXT NULL"),
            ("product", "promo_end", "TEXT NULL"),
            ("product", "max_quantity", "REAL DEFAULT 0"),
            ("product", "cest", "TEXT NULL"),
            ("product", "origin", "TEXT NOT NULL DEFAULT '0'"),
            ("product", "icms_cst", "TEXT NOT NULL DEFAULT '102'"),
            ("product", "icms_rate", "REAL NOT NULL DEFAULT 0"),
            ("product", "pis_cst", "TEXT NOT NULL DEFAULT '07'"),
            ("product", "pis_rate", "REAL NOT NULL DEFAULT 0"),
            ("product", "cofins_cst", "TEXT NOT NULL DEFAULT '07'"),
            ("product", "cofins_rate", "REAL NOT NULL DEFAULT 0"),
            ("product", "weigh_type", "INTEGER NOT NULL DEFAULT 0"),
            ("product", "tare_weight", "REAL NOT NULL DEFAULT 0"),
            ("product", "shelf_life_days", "INTEGER NOT NULL DEFAULT 90"),
            ("product", "supervisor_auth_required", "INTEGER NOT NULL DEFAULT 0"),
            ("collaborator", "is_customer", "INTEGER NOT NULL DEFAULT 0"),
            ("collaborator", "credit_limit", "REAL NOT NULL DEFAULT 0"),
            ("collaborator", "current_debt", "REAL NOT NULL DEFAULT 0"),
            ("collaborator", "can_login", "INTEGER NOT NULL DEFAULT 0")
        };

        foreach (var (tbl, col, def) in cols)
        {
            try
            {
                using var alterCmd = connection.CreateCommand();
                alterCmd.CommandText = $"ALTER TABLE {tbl} ADD COLUMN {col} {def};";
                await alterCmd.ExecuteNonQueryAsync();
            }
            catch (SqliteException) { /* Ignora se coluna já existir */ }
        }

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
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
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

        // 3. Usuários Legados
        await ExecuteAsync(conn, null,
            "INSERT INTO app_user VALUES ($id, 'Administrador Master', 'admin', $h, $s, 'Administrador', 0, $p, 1, $now)",
            ("$id", adminId), ("$h", hash), ("$s", salt), ("$p", allPerms), ("$now", now));

        // 4. Colaboradores Cadastrados (com opção de ser Cliente da loja também!)
        var colab1Id = Guid.NewGuid();
        var colab2Id = Guid.NewGuid();
        var (hOp, sOp) = Passwords.Hash("caixa123");
        var opPerms = JsonSerializer.Serialize(OperatorPermissions);

        // Colaboradora Carla: Operadora de Caixa e também CLIENTE da loja (com crediário/desconto em folha)
        await ExecuteAsync(conn, null,
            """
            INSERT INTO collaborator VALUES (
                $id, $cid, 'Carla Operadora de Caixa', '111.222.333-44', '12.345.678-X',
                '(11) 98765-1111', 'carla.caixa@supermodelo.com.br', 'Rua das Palmeiras', '45',
                'Bela Vista', 'São Paulo', 'SP', '01310-200', 'Operador de Caixa', '2024-01-15',
                2200.00, 1.5, 1, 'caixa01', $h, $s, $p, 1, 800.00, 0.0, 0, 1, $now
            )
            """,
            ("$id", colab1Id), ("$cid", companyId), ("$h", hOp), ("$s", sOp), ("$p", opPerms), ("$now", now));

        // Também insere na tabela de clientes para que o PDV localize Carla no crediário
        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PF', 'Carla Operadora de Caixa (Colaboradora)', 'Carla Caixa', '111.222.333-44', '12.345.678-X',
                '(11) 98765-1111', '(11) 98765-1111', 'carla.caixa@supermodelo.com.br', '01310-200', 'Rua das Palmeiras', '45',
                'Bela Vista', 'São Paulo', 'SP', null, 800.0, 0.0, 0, 'Colaboradora da loja - Desconto em folha', 1, 1
            )
            """,
            ("$id", colab1Id), ("$cid", companyId));

        // Colaborador Marcos: Fiscal de Loja
        await ExecuteAsync(conn, null,
            """
            INSERT INTO collaborator VALUES (
                $id, $cid, 'Marcos Vinicius Fiscal', '222.333.444-55', '23.456.789-Y',
                '(11) 97654-2222', 'marcos.fiscal@supermodelo.com.br', 'Rua Augusta', '890',
                'Consolação', 'São Paulo', 'SP', '01311-000', 'Fiscal de Caixa', '2023-06-01',
                2800.00, 0.0, 1, 'fiscal01', $h, $s, $p, 0, 0, 0, 0, 1, $now
            )
            """,
            ("$id", colab2Id), ("$cid", companyId), ("$h", hOp), ("$s", sOp), ("$p", opPerms), ("$now", now));

        // 5. Fornecedores
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

        // 6. Produtos com Estrutura Completa Linear Sistemas
        await InsertProductLinearCompleteAsync(conn, companyId,
            sku: "101", barcode: "7891000100103", secondaryBarcodes: "7891000100196,17891000100100",
            name: "Arroz Nobre Tipo 1 5kg", shortName: "ARROZ NOBRE 5KG", labelName: "ARROZ NOBRE T1 5KG",
            brand: "Tio Nobre", department: "Alimentos", section: "Mercearia Salgada", category: "Cereais", subcategory: "Arroz Tipo 1",
            unit: "PCT", itemType: "00", costPrice: 21.50, freightPct: 2.0, otherExpensesPct: 1.0, netCost: 22.15,
            markupPct: 35.0, salePrice: 29.90, wholesaleMinQty: 6, wholesalePrice: 27.90, promoPrice: 26.90,
            commissionPct: 0, quantity: 150, minQuantity: 20, maxQuantity: 300, location: "Corredor A - Gondola 01",
            ncm: "10063021", cest: "1700100", cfop: "5102", origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "06", pisRate: 0,
            cofinsCst: "06", cofinsRate: 0, supplierId: supAmbev.ToString(), isWeighable: 0, weighType: 0, pluCode: null,
            tareWeight: 0, shelfLifeDays: 365, supervisorAuthRequired: 0, size: null, color: null, expiryDate: "2027-12-31");

        await InsertProductLinearCompleteAsync(conn, companyId,
            sku: "102", barcode: "7891000200201", secondaryBarcodes: null,
            name: "Feijão Carioca Especial 1kg", shortName: "FEIJAO CARIOCA 1KG", labelName: "FEIJAO CARIOCA 1KG",
            brand: "Kicaldo", department: "Alimentos", section: "Mercearia Salgada", category: "Grãos", subcategory: "Feijão Carioca",
            unit: "PCT", itemType: "00", costPrice: 5.20, freightPct: 2.0, otherExpensesPct: 0, netCost: 5.30,
            markupPct: 49.0, salePrice: 7.90, wholesaleMinQty: 10, wholesalePrice: 6.99, promoPrice: 0,
            commissionPct: 0, quantity: 95, minQuantity: 15, maxQuantity: 200, location: "Corredor A - Gondola 02",
            ncm: "07133290", cest: "1700200", cfop: "5102", origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "06", pisRate: 0,
            cofinsCst: "06", cofinsRate: 0, supplierId: supAmbev.ToString(), isWeighable: 0, weighType: 0, pluCode: null,
            tareWeight: 0, shelfLifeDays: 180, supervisorAuthRequired: 0, size: null, color: null, expiryDate: "2027-08-30");

        // Açougue e Pesáveis (Balança / PLU / Tara)
        await InsertProductLinearCompleteAsync(conn, companyId,
            sku: "201", barcode: null, secondaryBarcodes: null,
            name: "Picanha Bovina Grill Especial", shortName: "PICANHA BOV GRILL", labelName: "PICANHA GRILL KG",
            brand: "Friboi", department: "Carnes e Aves", section: "Açougue Bovino", category: "Cortes Nobres", subcategory: "Picanha",
            unit: "KG", itemType: "00", costPrice: 48.00, freightPct: 0, otherExpensesPct: 0, netCost: 48.00,
            markupPct: 45.63, salePrice: 69.90, wholesaleMinQty: 5, wholesalePrice: 64.90, promoPrice: 59.90,
            commissionPct: 0, quantity: 48.5, minQuantity: 10, maxQuantity: 100, location: "Balcão Açougue 01",
            ncm: "02013000", cest: "1708000", cfop: "5102", origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "01", pisRate: 1.65,
            cofinsCst: "01", cofinsRate: 7.6, supplierId: supJbs.ToString(), isWeighable: 1, weighType: 1, pluCode: "123",
            tareWeight: 15.0, shelfLifeDays: 20, supervisorAuthRequired: 1, size: null, color: null, expiryDate: "2026-11-15");

        await InsertProductLinearCompleteAsync(conn, companyId,
            sku: "202", barcode: null, secondaryBarcodes: null,
            name: "Queijo Mussarela Fatiado", shortName: "QUEIJO MUSSARELA", labelName: "QUEIJO MUSS FAT KG",
            brand: "Scala", department: "Frios e Laticínios", section: "Balcão de Frios", category: "Queijos", subcategory: "Mussarela",
            unit: "KG", itemType: "00", costPrice: 31.00, freightPct: 0, otherExpensesPct: 0, netCost: 31.00,
            markupPct: 48.06, salePrice: 45.90, wholesaleMinQty: 3, wholesalePrice: 42.90, promoPrice: 0,
            commissionPct: 0, quantity: 32.0, minQuantity: 8, maxQuantity: 80, location: "Balcão de Frios 02",
            ncm: "04069022", cest: "1701500", cfop: "5102", origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "01", pisRate: 1.65,
            cofinsCst: "01", cofinsRate: 7.6, supplierId: supJbs.ToString(), isWeighable: 1, weighType: 1, pluCode: "124",
            tareWeight: 10.0, shelfLifeDays: 30, supervisorAuthRequired: 0, size: null, color: null, expiryDate: "2026-12-10");

        // Moda & Vestuário (Grade de Tamanho e Cor)
        await InsertProductLinearCompleteAsync(conn, companyId,
            sku: "301", barcode: "7892000100011", secondaryBarcodes: null,
            name: "Camisa Polo Slim Confort", shortName: "POLO SLIM AZUL M", labelName: "POLO SLIM AZUL M",
            brand: "Hering", department: "Vestuário", section: "Moda Masculina", category: "Camisas", subcategory: "Polo",
            unit: "UN", itemType: "00", costPrice: 45.00, freightPct: 0, otherExpensesPct: 0, netCost: 45.00,
            markupPct: 99.78, salePrice: 89.90, wholesaleMinQty: 3, wholesalePrice: 79.90, promoPrice: 0,
            commissionPct: 2.0, quantity: 18, minQuantity: 5, maxQuantity: 50, location: "Arara Moda Masc A",
            ncm: "61051000", cest: null, cfop: "5102", origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "49", pisRate: 0,
            cofinsCst: "49", cofinsRate: 0, supplierId: supHering.ToString(), isWeighable: 0, weighType: 0, pluCode: null,
            tareWeight: 0, shelfLifeDays: 0, supervisorAuthRequired: 0, size: "M", color: "Azul Marinho", expiryDate: null);

        // 7. Clientes Tradicionais com Limite de Crédito
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PF', 'João da Silva Sauro', 'João da Silva', '123.456.789-00', '12.345.678-9',
                '(11) 3456-7890', '(11) 98765-4321', 'joao.silva@email.com', '01310-200', 'Rua das Flores', '120',
                'Jardins', 'São Paulo', 'SP', 'Rua das Flores, 120, Apto 41', 800.0, 220.50, 0, 'Cliente tradicional há 5 anos', 0, 1
            )
            """,
            ("$id", c1), ("$cid", companyId));

        await ExecuteAsync(conn, null,
            """
            INSERT INTO customer VALUES (
                $id, $cid, 'PF', 'Maria das Dores Oliveira', 'Dona Maria', '987.654.321-99', '23.456.789-0',
                '(11) 3890-1234', '(11) 91234-5678', 'maria.dores@email.com', '01310-300', 'Alameda Santos', '850',
                'Cerqueira César', 'São Paulo', 'SP', null, 1200.0, 0.0, 0, 'Ótima pagadora, limite liberado', 0, 1
            )
            """,
            ("$id", c2), ("$cid", companyId));

        // Crediário pendente do João da Silva
        await ExecuteAsync(conn, null,
            "INSERT INTO credit_account VALUES ($id, $cid, null, 'CARNE-2026-001', 220.50, 220.50, $due, 'ABERTO', $now)",
            ("$id", Guid.NewGuid()), ("$cid", c1), ("$due", DateTimeOffset.UtcNow.AddDays(15).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("$now", now));

        // 8. Sessão de Caixa Aberta com Saldo Inicial
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

        // 9. Contas a Pagar e Receber
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
                $id, $cid, 'RECEBER', 'Fatura Convênio Empresa Metalúrgica Paulista', 'CONV-102', null,
                'Banco Itaú', 'Metalúrgica Paulista Ltda', $due, 2350.00, 1, 1, 'PENDENTE', null, null
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$due", DateTimeOffset.UtcNow.AddDays(12).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));

        // 10. Configurações Padrão de Hardware e Sistema
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_model', 'TOLEDO_PRIX3')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_port', 'COM1')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('scale_baud', '9600')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_type', 'ESC_POS_80MM')");
        await ExecuteAsync(conn, null, "INSERT INTO system_settings VALUES ('printer_model', 'EPSON_TM_T20X')");
    }

    private static async Task InsertProductLinearCompleteAsync(
        SqliteConnection conn, Guid companyId, string sku, string? barcode, string? secondaryBarcodes,
        string name, string shortName, string labelName, string brand, string department, string section,
        string category, string? subcategory, string unit, string itemType, double costPrice, double freightPct,
        double otherExpensesPct, double netCost, double markupPct, double salePrice, double wholesaleMinQty,
        double wholesalePrice, double promoPrice, double commissionPct, double quantity, double minQuantity,
        double maxQuantity, string location, string ncm, string? cest, string cfop, string origin,
        string icmsCst, double icmsRate, string pisCst, double pisRate, string cofinsCst, double cofinsRate,
        string? supplierId, int isWeighable, int weighType, string? pluCode, double tareWeight, int shelfLifeDays,
        int supervisorAuthRequired, string? size, string? color, string? expiryDate)
    {
        await ExecuteAsync(conn, null,
            """
            INSERT INTO product (
                id, company_id, sku, barcode, secondary_barcodes, name, short_name, label_name,
                brand, department, section, category, subcategory, unit, item_type,
                cost_price, freight_pct, other_expenses_pct, net_cost, markup_pct, sale_price,
                wholesale_min_qty, wholesale_price, promo_price, promo_start, promo_end,
                commission_pct, quantity, min_quantity, max_quantity, location,
                ncm, cest, cfop, origin, icms_cst, icms_rate, pis_cst, pis_rate, cofins_cst, cofins_rate,
                supplier_id, is_weighable, weigh_type, plu_code, tare_weight, shelf_life_days,
                supervisor_auth_required, size, color, expiry_date, active
            ) VALUES (
                $id, $cid, $sku, $bar, $secbar, $name, $sname, $lname,
                $brand, $dep, $sec, $cat, $subcat, $unit, $itype,
                $cost, $freight, $otherexp, $netcost, $markup, $sale,
                $wqty, $wprice, $promo, null, null,
                $comm, $qty, $minq, $maxq, $loc,
                $ncm, $cest, $cfop, $origin, $icmscst, $icmsrate, $piscst, $pisrate, $cofinscst, $cofinsrate,
                $sup, $w, $wtype, $plu, $tare, $shelflife,
                $supauth, $size, $color, $exp, 1
            )
            """,
            ("$id", Guid.NewGuid()), ("$cid", companyId), ("$sku", sku), ("$bar", barcode),
            ("$secbar", secondaryBarcodes), ("$name", name), ("$sname", shortName), ("$lname", labelName),
            ("$brand", brand), ("$dep", department), ("$sec", section), ("$cat", category),
            ("$subcat", subcategory), ("$unit", unit), ("$itype", itemType),
            ("$cost", costPrice), ("$freight", freightPct), ("$otherexp", otherExpensesPct), ("$netcost", netCost),
            ("$markup", markupPct), ("$sale", salePrice), ("$wqty", wholesaleMinQty), ("$wprice", wholesalePrice),
            ("$promo", promoPrice), ("$comm", commissionPct), ("$qty", quantity), ("$minq", minQuantity),
            ("$maxq", maxQuantity), ("$loc", location), ("$ncm", ncm), ("$cest", cest), ("$cfop", cfop),
            ("$origin", origin), ("$icmscst", icmsCst), ("$icmsrate", icmsRate), ("$piscst", pisCst),
            ("$pisrate", pisRate), ("$cofinscst", cofinsCst), ("$cofinsrate", cofinsRate),
            ("$sup", supplierId), ("$w", isWeighable), ("$wtype", weighType), ("$plu", pluCode),
            ("$tare", tareWeight), ("$shelflife", shelfLifeDays), ("$supauth", supervisorAuthRequired),
            ("$size", size), ("$color", color), ("$exp", expiryDate));
    }

    // -----------------------------------------------------------------
    // Colaboradores (CRUD Completo e Unificação com Cliente)
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListCollaboratorsAsync(string? query = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,name,cpf,phone,email,role,admission_date,salary,commission_pct,can_login,login,is_customer,credit_limit,current_debt FROM collaborator WHERE active=1";
        if (!string.IsNullOrWhiteSpace(query))
        {
            sql += " AND (name LIKE $q OR cpf LIKE $q OR role LIKE $q OR login LIKE $q)";
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
                name = r.GetString(1),
                cpf = r.IsDBNull(2) ? null : r.GetString(2),
                phone = r.IsDBNull(3) ? null : r.GetString(3),
                email = r.IsDBNull(4) ? null : r.GetString(4),
                role = r.GetString(5),
                admissionDate = r.IsDBNull(6) ? null : r.GetString(6),
                salary = r.GetDouble(7),
                commissionPct = r.GetDouble(8),
                canLogin = r.GetInt32(9) == 1,
                login = r.IsDBNull(10) ? null : r.GetString(10),
                isCustomer = r.GetInt32(11) == 1,
                creditLimit = r.GetDouble(12),
                currentDebt = r.GetDouble(13)
            });
        }
        return list;
    }

    public async Task<object?> GetCollaboratorByIdAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,name,cpf,rg,phone,email,street,number,neighborhood,city,state,zip_code,role,admission_date,salary,commission_pct,can_login,login,is_customer,credit_limit,current_debt FROM collaborator WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new
        {
            id = r.GetString(0), name = r.GetString(1), cpf = r.IsDBNull(2) ? null : r.GetString(2),
            rg = r.IsDBNull(3) ? null : r.GetString(3), phone = r.IsDBNull(4) ? null : r.GetString(4),
            email = r.IsDBNull(5) ? null : r.GetString(5), street = r.IsDBNull(6) ? null : r.GetString(6),
            number = r.IsDBNull(7) ? null : r.GetString(7), neighborhood = r.IsDBNull(8) ? null : r.GetString(8),
            city = r.IsDBNull(9) ? null : r.GetString(9), state = r.IsDBNull(10) ? null : r.GetString(10),
            zipCode = r.IsDBNull(11) ? null : r.GetString(11), role = r.GetString(12),
            admissionDate = r.IsDBNull(13) ? null : r.GetString(13), salary = r.GetDouble(14),
            commissionPct = r.GetDouble(15), canLogin = r.GetInt32(16) == 1,
            login = r.IsDBNull(17) ? null : r.GetString(17), isCustomer = r.GetInt32(18) == 1,
            creditLimit = r.GetDouble(19), currentDebt = r.GetDouble(20)
        };
    }

    public async Task<object> SaveCollaboratorAsync(CollaboratorDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

        string? hash = null;
        string? salt = null;
        if (!string.IsNullOrWhiteSpace(req.Password))
        {
            var res = Passwords.Hash(req.Password);
            hash = res.Hash;
            salt = res.Salt;
        }

        await ExecuteAsync(c, null,
            """
            INSERT INTO collaborator (
                id, company_id, name, cpf, rg, phone, email, street, number, neighborhood,
                city, state, zip_code, role, admission_date, salary, commission_pct,
                can_login, login, password_hash, password_salt, permissions_json,
                is_customer, credit_limit, current_debt, blocked, active, created_at
            ) VALUES (
                $id, $cid, $name, $cpf, $rg, $phone, $email, $st, $num, $neigh,
                $city, $uf, $zip, $role, $adm, $sal, $comm,
                $canlogin, $login, $h, $s, $perms,
                $iscust, $limit, $debt, 0, 1, $now
            )
            ON CONFLICT(id) DO UPDATE SET
                name=$name, cpf=$cpf, rg=$rg, phone=$phone, email=$email,
                street=$st, number=$num, neighborhood=$neigh, city=$city, state=$uf, zip_code=$zip,
                role=$role, admission_date=$adm, salary=$sal, commission_pct=$comm,
                can_login=$canlogin, login=$login, is_customer=$iscust, credit_limit=$limit
            """,
            ("$id", id), ("$cid", cid), ("$name", req.Name), ("$cpf", req.Cpf), ("$rg", req.Rg),
            ("$phone", req.Phone), ("$email", req.Email), ("$st", req.Street), ("$num", req.Number),
            ("$neigh", req.Neighborhood), ("$city", req.City), ("$uf", req.State), ("$zip", req.ZipCode),
            ("$role", req.Role), ("$adm", req.AdmissionDate), ("$sal", (double)req.Salary),
            ("$comm", (double)req.CommissionPct), ("$canlogin", req.CanLogin ? 1 : 0),
            ("$login", req.Login), ("$h", hash), ("$s", salt), ("$perms", "[\"sales.create\"]"),
            ("$iscust", req.IsCustomer ? 1 : 0), ("$limit", (double)req.CreditLimit),
            ("$debt", (double)req.CurrentDebt), ("$now", now));

        // Se o colaborador foi marcado como cliente, sincroniza diretamente com a tabela de clientes
        if (req.IsCustomer)
        {
            await ExecuteAsync(c, null,
                """
                INSERT INTO customer (
                    id, company_id, type, name, trade_name, cpf_cnpj, rg_ie, phone, cell_phone,
                    email, zip_code, street, number, neighborhood, city, state, delivery_address,
                    credit_limit, current_debt, blocked, notes, is_employee, active
                ) VALUES (
                    $id, $cid, 'PF', $name, 'Colaborador', $cpf, $rg, $phone, $phone,
                    $email, $zip, $st, $num, $neigh, $city, $uf, null,
                    $limit, $debt, 0, 'Colaborador da loja (Compras a Prazo / Folha)', 1, 1
                )
                ON CONFLICT(id) DO UPDATE SET
                    name=$name, cpf_cnpj=$cpf, rg_ie=$rg, phone=$phone, cell_phone=$phone,
                    email=$email, zip_code=$zip, street=$st, number=$num, neighborhood=$neigh,
                    city=$city, state=$uf, credit_limit=$limit, is_employee=1
                """,
                ("$id", id), ("$cid", cid), ("$name", req.Name), ("$cpf", req.Cpf), ("$rg", req.Rg),
                ("$phone", req.Phone), ("$email", req.Email), ("$zip", req.ZipCode), ("$st", req.Street),
                ("$num", req.Number), ("$neigh", req.Neighborhood), ("$city", req.City), ("$uf", req.State),
                ("$limit", (double)req.CreditLimit), ("$debt", (double)req.CurrentDebt));
        }

        return new { id, success = true };
    }

    public async Task DeleteCollaboratorAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        await ExecuteAsync(c, null, "UPDATE collaborator SET active=0 WHERE id=$id", ("$id", id));
    }

    // -----------------------------------------------------------------
    // Produtos (Linear Sistemas Engenharia Reversa)
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListProductsAsync(string? query = null, string? category = null, string? department = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,sku,barcode,name,short_name,brand,department,section,category,unit,cost_price,markup_pct,sale_price,wholesale_min_qty,wholesale_price,promo_price,quantity,min_quantity,location,ncm,cfop,is_weighable,plu_code,tare_weight FROM product WHERE active=1";

        if (!string.IsNullOrWhiteSpace(query))
        {
            sql += " AND (name LIKE $q OR sku LIKE $q OR barcode LIKE $q OR plu_code LIKE $q OR secondary_barcodes LIKE $q)";
            cmd.Parameters.AddWithValue("$q", $"%{query.Trim()}%");
        }
        if (!string.IsNullOrWhiteSpace(category) && category != "Todos")
        {
            sql += " AND category = $cat";
            cmd.Parameters.AddWithValue("$cat", category.Trim());
        }
        if (!string.IsNullOrWhiteSpace(department) && department != "Todos")
        {
            sql += " AND department = $dep";
            cmd.Parameters.AddWithValue("$dep", department.Trim());
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
                shortName = r.IsDBNull(4) ? null : r.GetString(4),
                brand = r.IsDBNull(5) ? null : r.GetString(5),
                department = r.GetString(6),
                section = r.GetString(7),
                category = r.GetString(8),
                unit = r.GetString(9),
                costPrice = r.GetDouble(10),
                markupPct = r.GetDouble(11),
                salePrice = r.GetDouble(12),
                wholesaleMinQty = r.GetDouble(13),
                wholesalePrice = r.GetDouble(14),
                promoPrice = r.GetDouble(15),
                quantity = r.GetDouble(16),
                minQuantity = r.GetDouble(17),
                location = r.IsDBNull(18) ? null : r.GetString(18),
                ncm = r.IsDBNull(19) ? null : r.GetString(19),
                cfop = r.IsDBNull(20) ? null : r.GetString(20),
                isWeighable = r.GetInt32(21) == 1,
                pluCode = r.IsDBNull(22) ? null : r.GetString(22),
                tareWeight = r.GetDouble(23)
            });
        }
        return list;
    }

    public async Task<object?> GetProductByIdAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,sku,barcode,secondary_barcodes,name,short_name,label_name,brand,department,section,category,subcategory,unit,item_type,cost_price,freight_pct,other_expenses_pct,net_cost,markup_pct,sale_price,wholesale_min_qty,wholesale_price,promo_price,commission_pct,quantity,min_quantity,max_quantity,location,ncm,cest,cfop,origin,icms_cst,icms_rate,pis_cst,pis_rate,cofins_cst,cofins_rate,supplier_id,is_weighable,weigh_type,plu_code,tare_weight,shelf_life_days,supervisor_auth_required,size,color,expiry_date FROM product WHERE id=$id";
        cmd.Parameters.AddWithValue("$id", id.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;
        return new
        {
            id = r.GetString(0), sku = r.GetString(1), barcode = r.IsDBNull(2) ? null : r.GetString(2),
            secondaryBarcodes = r.IsDBNull(3) ? null : r.GetString(3), name = r.GetString(4),
            shortName = r.IsDBNull(5) ? null : r.GetString(5), labelName = r.IsDBNull(6) ? null : r.GetString(6),
            brand = r.IsDBNull(7) ? null : r.GetString(7), department = r.GetString(8), section = r.GetString(9),
            category = r.GetString(10), subcategory = r.IsDBNull(11) ? null : r.GetString(11), unit = r.GetString(12),
            itemType = r.GetString(13), costPrice = r.GetDouble(14), freightPct = r.GetDouble(15),
            otherExpensesPct = r.GetDouble(16), netCost = r.GetDouble(17), markupPct = r.GetDouble(18),
            salePrice = r.GetDouble(19), wholesaleMinQty = r.GetDouble(20), wholesalePrice = r.GetDouble(21),
            promoPrice = r.GetDouble(22), commissionPct = r.GetDouble(23), quantity = r.GetDouble(24),
            minQuantity = r.GetDouble(25), maxQuantity = r.GetDouble(26), location = r.IsDBNull(27) ? null : r.GetString(27),
            ncm = r.IsDBNull(28) ? null : r.GetString(28), cest = r.IsDBNull(29) ? null : r.GetString(29),
            cfop = r.IsDBNull(30) ? null : r.GetString(30), origin = r.GetString(31), icmsCst = r.GetString(32),
            icmsRate = r.GetDouble(33), pisCst = r.GetString(34), pisRate = r.GetDouble(35), cofinsCst = r.GetString(36),
            cofinsRate = r.GetDouble(37), supplierId = r.IsDBNull(38) ? null : r.GetString(38),
            isWeighable = r.GetInt32(39) == 1, weighType = r.GetInt32(40), pluCode = r.IsDBNull(41) ? null : r.GetString(41),
            tareWeight = r.GetDouble(42), shelfLifeDays = r.GetInt32(43), supervisorAuthRequired = r.GetInt32(44) == 1,
            size = r.IsDBNull(45) ? null : r.GetString(45), color = r.IsDBNull(46) ? null : r.GetString(46),
            expiryDate = r.IsDBNull(47) ? null : r.GetString(47)
        };
    }

    public async Task<object> SaveProductLinearAsync(ProductLinearDto req)
    {
        await using var c = Open(); await c.OpenAsync();
        var id = req.Id ?? Guid.NewGuid();
        var cid = Guid.Parse((await QuerySingleAsync(c, "SELECT id FROM company LIMIT 1"))[0]!);

        var netCost = (double)req.CostPrice * (1 + (double)(req.FreightPct + req.OtherExpensesPct) / 100);

        await ExecuteAsync(c, null,
            """
            INSERT INTO product (
                id, company_id, sku, barcode, secondary_barcodes, name, short_name, label_name,
                brand, department, section, category, subcategory, unit, item_type,
                cost_price, freight_pct, other_expenses_pct, net_cost, markup_pct, sale_price,
                wholesale_min_qty, wholesale_price, promo_price, promo_start, promo_end,
                commission_pct, quantity, min_quantity, max_quantity, location,
                ncm, cest, cfop, origin, icms_cst, icms_rate, pis_cst, pis_rate, cofins_cst, cofins_rate,
                supplier_id, is_weighable, weigh_type, plu_code, tare_weight, shelf_life_days,
                supervisor_auth_required, size, color, expiry_date, active
            ) VALUES (
                $id, $cid, $sku, $bar, $secbar, $name, $sname, $lname,
                $brand, $dep, $sec, $cat, $subcat, $unit, $itype,
                $cost, $freight, $otherexp, $netcost, $markup, $sale,
                $wqty, $wprice, $promo, null, null,
                $comm, $qty, $minq, $maxq, $loc,
                $ncm, $cest, $cfop, $origin, $icmscst, $icmsrate, $piscst, $pisrate, $cofinscst, $cofinsrate,
                $sup, $w, $wtype, $plu, $tare, $shelflife,
                $supauth, $size, $color, $exp, 1
            )
            ON CONFLICT(id) DO UPDATE SET
                sku=$sku, barcode=$bar, secondary_barcodes=$secbar, name=$name, short_name=$sname, label_name=$lname,
                brand=$brand, department=$dep, section=$sec, category=$cat, subcategory=$subcat, unit=$unit, item_type=$itype,
                cost_price=$cost, freight_pct=$freight, other_expenses_pct=$otherexp, net_cost=$netcost, markup_pct=$markup,
                sale_price=$sale, wholesale_min_qty=$wqty, wholesale_price=$wprice, promo_price=$promo,
                commission_pct=$comm, quantity=$qty, min_quantity=$minq, max_quantity=$maxq, location=$loc,
                ncm=$ncm, cest=$cest, cfop=$cfop, origin=$origin, icms_cst=$icmscst, icms_rate=$icmsrate,
                pis_cst=$piscst, pis_rate=$pisrate, cofins_cst=$cofinscst, cofins_rate=$cofinsrate,
                supplier_id=$sup, is_weighable=$w, weigh_type=$wtype, plu_code=$plu, tare_weight=$tare,
                shelf_life_days=$shelflife, supervisor_auth_required=$supauth, size=$size, color=$color, expiry_date=$exp
            """,
            ("$id", id), ("$cid", cid), ("$sku", req.Sku), ("$bar", req.Barcode),
            ("$secbar", req.SecondaryBarcodes), ("$name", req.Name),
            ("$sname", req.ShortName ?? (req.Name.Length > 25 ? req.Name[..25] : req.Name)),
            ("$lname", req.LabelName ?? req.Name), ("$brand", req.Brand),
            ("$dep", req.Department ?? "Alimentos"), ("$sec", req.Section ?? "Mercearia"),
            ("$cat", req.Category ?? "Geral"), ("$subcat", req.Subcategory), ("$unit", req.Unit ?? "UN"),
            ("$itype", req.ItemType ?? "00"), ("$cost", (double)req.CostPrice),
            ("$freight", (double)req.FreightPct), ("$otherexp", (double)req.OtherExpensesPct),
            ("$netcost", netCost), ("$markup", (double)req.MarkupPct), ("$sale", (double)req.SalePrice),
            ("$wqty", (double)req.WholesaleMinQty), ("$wprice", (double)req.WholesalePrice),
            ("$promo", (double)req.PromoPrice), ("$comm", (double)req.CommissionPct),
            ("$qty", (double)req.Quantity), ("$minq", (double)req.MinQuantity),
            ("$maxq", (double)req.MaxQuantity), ("$loc", req.Location), ("$ncm", req.Ncm),
            ("$cest", req.Cest), ("$cfop", req.Cfop ?? "5102"), ("$origin", req.Origin ?? "0"),
            ("$icmscst", req.IcmsCst ?? "102"), ("$icmsrate", (double)req.IcmsRate),
            ("$piscst", req.PisCst ?? "49"), ("$pisrate", (double)req.PisRate),
            ("$cofinscst", req.CofinsCst ?? "49"), ("$cofinsrate", (double)req.CofinsRate),
            ("$sup", req.SupplierId), ("$w", req.IsWeighable ? 1 : 0), ("$wtype", req.WeighType),
            ("$plu", req.PluCode), ("$tare", (double)req.TareWeight),
            ("$shelflife", req.ShelfLifeDays), ("$supauth", req.SupervisorAuthRequired ? 1 : 0),
            ("$size", req.Size), ("$color", req.Color), ("$exp", req.ExpiryDate));

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
    // Controle de Caixa Diário (SEPARADO EM STATUS E MOVIMENTAÇÃO)
    // -----------------------------------------------------------------
    public async Task<object?> GetCurrentCashStatusAsync()
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,operator_name,opened_at,opening_balance,total_inflows,total_outflows,closing_balance_expected,status FROM cash_session WHERE status='ABERTO' ORDER BY opened_at DESC LIMIT 1";
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new
        {
            id = r.GetString(0),
            operatorName = r.GetString(1),
            openedAt = r.GetString(2),
            openingBalance = r.GetDouble(3),
            totalInflows = r.GetDouble(4),
            totalOutflows = r.GetDouble(5),
            closingBalanceExpected = r.GetDouble(6),
            status = r.GetString(7)
        };
    }

    public async Task<IReadOnlyList<object>> ListCashMovementsAsync(string? type = null, string? date = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,session_id,type,description,amount,operator_name,created_at FROM cash_movement WHERE 1=1";
        if (!string.IsNullOrWhiteSpace(type))
        {
            sql += " AND type = $type";
            cmd.Parameters.AddWithValue("$type", type.ToUpperInvariant());
        }
        if (!string.IsNullOrWhiteSpace(date))
        {
            sql += " AND created_at LIKE $d";
            cmd.Parameters.AddWithValue("$d", $"{date}%");
        }
        sql += " ORDER BY created_at DESC LIMIT 100";
        cmd.CommandText = sql;

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id = r.GetString(0), sessionId = r.GetString(1), type = r.GetString(2),
                description = r.GetString(3), amount = r.GetDouble(4), operatorName = r.GetString(5),
                createdAt = r.GetString(6)
            });
        }
        return list;
    }

    public async Task<object> OpenCashSessionAsync(OpenCashRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var activeId = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' LIMIT 1");
        if (activeId != null) return new { error = "Já existe um caixa aberto no momento" };

        var storeId = (await QuerySingleAsync(c, "SELECT id FROM store LIMIT 1"))[0]!;
        var sessionId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

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
            "INSERT INTO cash_movement VALUES ($id, $sess, 'ABERTURA', 'Fundo de troco inicial de abertura do caixa', $amt, $op, $now)",
            ("$id", Guid.NewGuid()), ("$sess", sessionId), ("$amt", (double)req.OpeningBalance),
            ("$op", req.OperatorName ?? "Operador"), ("$now", now));

        return new { sessionId, success = true };
    }

    public async Task<object> AddCashMovementAsync(string type, CashMovementRequest req)
    {
        await using var c = Open(); await c.OpenAsync();
        var sessionId = await ScalarAsync<string?>("SELECT id FROM cash_session WHERE status='ABERTO' LIMIT 1");
        if (sessionId == null) return new { error = "Nenhum caixa aberto no momento" };

        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
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
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

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
    // Dashboard, Empresa e Configurações
    // -----------------------------------------------------------------
    public async Task<object> GetDashboardAsync()
    {
        await using var connection = Open(); await connection.OpenAsync();
        var company = await QuerySingleAsync(connection, "SELECT name,trade_name,segment,cnpj FROM company LIMIT 1");
        var products = await CountAsync(connection, "product");
        var sales = await CountAsync(connection, "sale");
        var customers = await CountAsync(connection, "customer");
        var suppliers = await CountAsync(connection, "supplier");
        var collaborators = await CountAsync(connection, "collaborator");
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
            collaborators,
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
    // Clientes e Crediário
    // -----------------------------------------------------------------
    public async Task<IReadOnlyList<object>> ListCustomersAsync(string? query = null)
    {
        var list = new List<object>();
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        var sql = "SELECT id,type,name,trade_name,cpf_cnpj,phone,cell_phone,email,credit_limit,current_debt,blocked,city,state,is_employee FROM customer WHERE active=1";
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
                state = r.IsDBNull(12) ? null : r.GetString(12),
                isEmployee = r.GetInt32(13) == 1
            });
        }
        return list;
    }

    public async Task<object?> GetCustomerByIdAsync(Guid id)
    {
        await using var c = Open(); await c.OpenAsync();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT id,type,name,trade_name,cpf_cnpj,rg_ie,phone,cell_phone,email,zip_code,street,number,neighborhood,city,state,delivery_address,credit_limit,current_debt,blocked,notes,is_employee FROM customer WHERE id=$id";
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
            creditLimit = r.GetDouble(16), currentDebt = r.GetDouble(17), blocked = r.GetInt32(18) == 1,
            notes = r.IsDBNull(19) ? null : r.GetString(19), isEmployee = r.GetInt32(20) == 1
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
                credit_limit, current_debt, blocked, notes, is_employee, active
            ) VALUES (
                $id, $cid, $type, $name, $trade, $cpf, $rg, $phone, $cell,
                $email, $zip, $st, $num, $neigh, $city, $uf, $deliv,
                $limit, $debt, $block, $notes, 0, 1
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
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

        if (req.CreditAccountId.HasValue)
        {
            var updAcc = c.CreateCommand();
            updAcc.Transaction = (SqliteTransaction)tx;
            updAcc.CommandText = "UPDATE credit_account SET balance = MAX(0, balance - $amt), status = CASE WHEN balance - $amt <= 0 THEN 'PAGO' ELSE 'ABERTO' END WHERE id=$id";
            updAcc.Parameters.AddWithValue("$amt", (double)req.Amount);
            updAcc.Parameters.AddWithValue("$id", req.CreditAccountId.Value.ToString());
            await updAcc.ExecuteNonQueryAsync();
        }

        var updCust = c.CreateCommand();
        updCust.Transaction = (SqliteTransaction)tx;
        updCust.CommandText = "UPDATE customer SET current_debt = MAX(0, current_debt - $amt) WHERE id=$id";
        updCust.Parameters.AddWithValue("$amt", (double)req.Amount);
        updCust.Parameters.AddWithValue("$id", req.CustomerId.ToString());
        await updCust.ExecuteNonQueryAsync();

        // Se for colaborador, atualiza débito no colaborador também
        var updColab = c.CreateCommand();
        updColab.Transaction = (SqliteTransaction)tx;
        updColab.CommandText = "UPDATE collaborator SET current_debt = MAX(0, current_debt - $amt) WHERE id=$id";
        updColab.Parameters.AddWithValue("$amt", (double)req.Amount);
        updColab.Parameters.AddWithValue("$id", req.CustomerId.ToString());
        await updColab.ExecuteNonQueryAsync();

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
    // Frente de Caixa (Vendas PDV)
    // -----------------------------------------------------------------
    public async Task<object> CompleteSaleAsync(CompleteSaleWebRequest request)
    {
        await using var connection = Open(); await connection.OpenAsync();
        await using var tx = await connection.BeginTransactionAsync();

        var storeId = (await QuerySingleAsync(connection, "SELECT id FROM store LIMIT 1"))[0]!;
        var nextNumber = (await ScalarAsync<long>("SELECT COALESCE(MAX(number),0) FROM sale")) + 1;
        var saleId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);

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

            if (pay.Method.Equals("CREDIARIO", StringComparison.OrdinalIgnoreCase) && request.CustomerId.HasValue)
            {
                var custCmd = connection.CreateCommand();
                custCmd.Transaction = (SqliteTransaction)tx;
                custCmd.CommandText = "UPDATE customer SET current_debt = current_debt + $amt WHERE id=$cid";
                custCmd.Parameters.AddWithValue("$amt", (double)pay.Amount);
                custCmd.Parameters.AddWithValue("$cid", request.CustomerId.Value.ToString());
                await custCmd.ExecuteNonQueryAsync();

                var colabCmd = connection.CreateCommand();
                colabCmd.Transaction = (SqliteTransaction)tx;
                colabCmd.CommandText = "UPDATE collaborator SET current_debt = current_debt + $amt WHERE id=$cid";
                colabCmd.Parameters.AddWithValue("$amt", (double)pay.Amount);
                colabCmd.Parameters.AddWithValue("$cid", request.CustomerId.Value.ToString());
                await colabCmd.ExecuteNonQueryAsync();

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
    // Financeiro
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
        var now = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture);
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

        var importedCount = 0;
        foreach (var item in payload.Items)
        {
            var pId = Guid.NewGuid();
            var existingP = await QuerySingleAsync(c, $"SELECT id,quantity FROM product WHERE sku='{item.Sku}' OR (barcode IS NOT NULL AND barcode='{item.Barcode}')");
            if (existingP[0] != null)
            {
                pId = Guid.Parse(existingP[0]!);
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
                await InsertProductLinearCompleteAsync(c, cid,
                    sku: item.Sku, barcode: item.Barcode, secondaryBarcodes: null,
                    name: item.Name, shortName: item.Name.Length > 25 ? item.Name[..25] : item.Name,
                    labelName: item.Name, brand: payload.SupplierTradeName ?? "Geral",
                    department: "Alimentos", section: "Mercearia", category: "Geral", subcategory: null,
                    unit: item.Unit ?? "UN", itemType: "00", costPrice: (double)item.CostPrice, freightPct: 0,
                    otherExpensesPct: 0, netCost: (double)item.CostPrice, markupPct: (double)item.MarkupPct,
                    salePrice: (double)item.SalePrice, wholesaleMinQty: 0, wholesalePrice: 0, promoPrice: 0,
                    commissionPct: 0, quantity: (double)item.Quantity, minQuantity: 5, maxQuantity: 100,
                    location: "Estoque Entrada", ncm: item.Ncm ?? "00000000", cest: null, cfop: "5102",
                    origin: "0", icmsCst: "102", icmsRate: 0, pisCst: "49", pisRate: 0, cofinsCst: "49", cofinsRate: 0,
                    supplierId: supId.ToString(), isWeighable: 0, weighType: 0, pluCode: null, tareWeight: 0,
                    shelfLifeDays: 0, supervisorAuthRequired: 0, size: null, color: null, expiryDate: null);
            }
            importedCount++;
        }

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
    // Configurações e Relatórios
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
    // Usuários e Autenticação
    // -----------------------------------------------------------------
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
        if (await reader.ReadAsync() && Passwords.Verify(password, reader.GetString(3), reader.GetString(4)))
        {
            return ReadUser(reader);
        }

        // Se não encontrou em app_user, verifica se é um colaborador com login habilitado
        var colabCmd = connection.CreateCommand();
        colabCmd.CommandText = "SELECT id,name,login,password_hash,password_salt,role,permissions_json FROM collaborator WHERE login=$login AND can_login=1 AND active=1";
        colabCmd.Parameters.AddWithValue("$login", login.Trim());
        await using var colabReader = await colabCmd.ExecuteReaderAsync();
        if (await colabReader.ReadAsync() && !colabReader.IsDBNull(3) && !colabReader.IsDBNull(4))
        {
            if (Passwords.Verify(password, colabReader.GetString(3), colabReader.GetString(4)))
            {
                return ReadUser(colabReader);
            }
        }

        return null;
    }

    public async Task<AppUser?> GetUserAsync(Guid id)
    {
        await using var connection = Open(); await connection.OpenAsync();
        var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,login,role,permissions_json FROM app_user WHERE id=$id";
        command.Parameters.AddWithValue("$id", id.ToString());
        await using var reader = await command.ExecuteReaderAsync();
        if (await reader.ReadAsync()) return ReadUser(reader);

        var colabCmd = connection.CreateCommand();
        colabCmd.CommandText = "SELECT id,name,login,role,permissions_json FROM collaborator WHERE id=$id";
        colabCmd.Parameters.AddWithValue("$id", id.ToString());
        await using var colabReader = await colabCmd.ExecuteReaderAsync();
        return await colabReader.ReadAsync() ? ReadUser(colabReader) : null;
    }

    // Helpers
    private SqliteConnection Open() => new(connectionString);
    private async Task<T> ScalarAsync<T>(string sql) { await using var c = Open(); await c.OpenAsync(); var cmd = c.CreateCommand(); cmd.CommandText = sql; var val = await cmd.ExecuteScalarAsync(); if (val == null || val == DBNull.Value) return default!; return (T)Convert.ChangeType(val, typeof(T), CultureInfo.InvariantCulture); }
    private static async Task<long> CountAsync(SqliteConnection c, string table) { var cmd = c.CreateCommand(); cmd.CommandText = $"SELECT COUNT(*) FROM {table}"; return Convert.ToInt64(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture); }
    private static async Task<string?[]> QuerySingleAsync(SqliteConnection c, string sql) { var cmd = c.CreateCommand(); cmd.CommandText = sql; await using var r = await cmd.ExecuteReaderAsync(); if (!await r.ReadAsync()) return Array.Empty<string?>(); var values = new string?[r.FieldCount]; for (var i=0;i<r.FieldCount;i++) values[i] = r.IsDBNull(i) ? null : r.GetValue(i).ToString(); return values; }
    private static async Task ExecuteAsync(SqliteConnection c, System.Data.Common.DbTransaction? tx, string sql, params (string Name, object? Value)[] p) { var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.Transaction = (SqliteTransaction?)tx; foreach (var item in p) cmd.Parameters.AddWithValue(item.Name, item.Value ?? (object)DBNull.Value); await cmd.ExecuteNonQueryAsync(); }
    private static AppUser ReadUser(SqliteDataReader r) => new(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(3), JsonSerializer.Deserialize<string[]>(r.IsDBNull(4) ? "[\"sales.create\"]" : r.GetString(4)) ?? []);
}

static class Passwords
{
    public static (string Hash, string Salt) Hash(string password) { var salt = RandomNumberGenerator.GetBytes(32); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32); return (Convert.ToBase64String(hash), Convert.ToBase64String(salt)); }
    public static bool Verify(string password, string hash, string salt) => CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hash), Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256, 32));
}

// Contratos e DTOs
sealed record AppUser(Guid Id, string Name, string Login, string Role, string[] Permissions);
sealed record LoginRequest(string Login, string Password);
sealed record CollaboratorDto(Guid? Id, string Name, string? Cpf, string? Rg, string? Phone, string? Email, string? Street, string? Number, string? Neighborhood, string? City, string? State, string? ZipCode, string Role, string? AdmissionDate, decimal Salary, decimal CommissionPct, bool CanLogin, string? Login, string? Password, bool IsCustomer, decimal CreditLimit, decimal CurrentDebt);
sealed record UpdateCompanyRequest(string Name, string? TradeName, string Cnpj, string? Ie, string? Im, string Segment, string? Phone1, string? Phone2, string? Email, string? ZipCode, string? Street, string? Number, string? Neighborhood, string? City, string? State, string? LogoUrl);
sealed record ProductLinearDto(
    Guid? Id, string Sku, string? Barcode, string? SecondaryBarcodes, string Name, string? ShortName, string? LabelName,
    string? Brand, string? Department, string? Section, string? Category, string? Subcategory, string? Unit, string? ItemType,
    decimal CostPrice, decimal FreightPct, decimal OtherExpensesPct, decimal MarkupPct, decimal SalePrice,
    decimal WholesaleMinQty, decimal WholesalePrice, decimal PromoPrice, decimal CommissionPct, decimal Quantity,
    decimal MinQuantity, decimal MaxQuantity, string? Location, string? Ncm, string? Cest, string? Cfop, string? Origin,
    string? IcmsCst, decimal IcmsRate, string? PisCst, decimal PisRate, string? CofinsCst, decimal CofinsRate,
    string? SupplierId, bool IsWeighable, int WeighType, string? PluCode, decimal TareWeight, int ShelfLifeDays,
    bool SupervisorAuthRequired, string? Size, string? Color, string? ExpiryDate);
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
