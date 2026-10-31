using System.Net.Http;
using System.Net.Http.Json;
using Pdv.Desktop.Configuration;

namespace Pdv.Desktop.Services;

public sealed class PdvApiClient(DesktopSettings settings)
{
    private readonly HttpClient _client = CreateClient(settings);

    public Task<BootstrapStatus?> GetBootstrapStatusAsync() =>
        _client.GetFromJsonAsync<BootstrapStatus>("/api/bootstrap/status");

    public async Task<BootstrapResult> InitializeAsync(BootstrapPayload payload)
    {
        using var response = await _client.PostAsJsonAsync("/api/bootstrap/initialize", payload);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<BootstrapResult>()
               ?? throw new InvalidOperationException("Resposta de configuração inválida.");
    }

    public Task<StoreProfile?> GetStoreProfileAsync() =>
        _client.GetFromJsonAsync<StoreProfile>("/api/store/profile");

    public Task<DashboardSnapshot?> GetDashboardAsync() =>
        _client.GetFromJsonAsync<DashboardSnapshot>("/api/dashboard");

    public async Task<bool> IsHealthyAsync()
    {
        try
        {
            using var response = await _client.GetAsync("/health");
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    // Produtos
    public Task<List<ProductDto>?> GetProductsAsync() =>
        _client.GetFromJsonAsync<List<ProductDto>>("/api/products");

    // Vendas
    public async Task<CompleteSaleResponse> CompleteSaleAsync(CompleteSalePayload payload)
    {
        using var response = await _client.PostAsJsonAsync("/api/sales/complete", payload);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<CompleteSaleResponse>()
               ?? throw new InvalidOperationException("Erro ao processar venda.");
    }

    // Clientes
    public Task<List<CustomerDto>?> GetCustomersAsync() =>
        _client.GetFromJsonAsync<List<CustomerDto>>("/api/customers");

    public async Task<bool> SettleCustomerDebtAsync(Guid customerId, decimal amount)
    {
        using var response = await _client.PostAsJsonAsync($"/api/customers/{customerId}/settle", new { Amount = amount });
        return response.IsSuccessStatusCode;
    }

    // Autenticação & Supervisor
    public async Task<LoginResponse?> LoginAsync(string username, string password)
    {
        try
        {
            using var response = await _client.PostAsJsonAsync("/api/auth/login", new { Username = username, Password = password });
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadFromJsonAsync<LoginResponse>();
        }
        catch
        {
            return null;
        }
    }

    public async Task<bool> AuthorizeSupervisorAsync(string username, string password, string permission)
    {
        try
        {
            using var response = await _client.PostAsJsonAsync("/api/auth/authorize-supervisor", new
            {
                Username = username,
                Password = password,
                RequiredPermission = permission
            });
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    // Etiquetas
    public async Task<bool> PrintLabelsAsync(PrintLabelsPayload payload)
    {
        try
        {
            using var response = await _client.PostAsJsonAsync("/api/labels/print", payload);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static HttpClient CreateClient(DesktopSettings settings)
    {
        var client = new HttpClient
        {
            BaseAddress = new Uri(settings.ServerUrl.TrimEnd('/'), UriKind.Absolute),
            Timeout = TimeSpan.FromSeconds(8)
        };

        if (!string.IsNullOrWhiteSpace(settings.TerminalApiKey))
        {
            client.DefaultRequestHeaders.Add("X-Terminal-Key", settings.TerminalApiKey);
        }

        return client;
    }
}

public sealed record BootstrapStatus(
    bool Configured,
    Guid NodeId,
    Guid? CompanyId,
    Guid? StoreId,
    string StoreCode,
    bool IsAdministrationHub,
    string? TerminalApiKey);

public sealed record BootstrapPayload(
    string LegalName,
    string TradeName,
    string StoreCode,
    string StoreName,
    int Segment,
    bool IsAdministrationHub,
    string? AdministrationHubUrl,
    string? AdministrationHubApiKey);

public sealed record BootstrapResult(
    Guid CompanyId,
    Guid StoreId,
    string TerminalApiKey);

public sealed record StoreProfile(
    string TradeName,
    int Segment,
    string StoreName,
    string Code,
    bool IsAdministrationHub);

public sealed record DashboardSnapshot(
    decimal SalesToday,
    int TransactionsToday,
    int LowStock,
    int PendingSync,
    IReadOnlyCollection<HourlyPoint> Hourly);

public sealed record HourlyPoint(int Hour, decimal Total);

public sealed record ProductDto(
    Guid Id,
    string Sku,
    string? Barcode,
    string Name,
    int Unit,
    decimal CostPrice,
    decimal SalePrice,
    string? Category,
    string? Department,
    string? Brand,
    string? Size,
    string? Color,
    bool IsWeighable,
    string? PluCode,
    string? Ncm,
    string? Cfop,
    decimal Quantity,
    decimal MinimumQuantity);

public sealed record CustomerDto(
    Guid Id,
    string Name,
    string? CpfCnpj,
    string? Phone,
    string? Email,
    decimal CreditLimit,
    decimal CurrentDebt,
    bool IsCreditBlocked);

public sealed record CompleteSaleItemPayload(
    Guid ProductId,
    decimal Quantity);

public sealed record PaymentItemPayload(
    int Method,
    decimal Amount);

public sealed record CompleteSalePayload(
    Guid TerminalId,
    decimal Discount,
    IReadOnlyCollection<CompleteSaleItemPayload> Items,
    IReadOnlyCollection<PaymentItemPayload>? Payments = null,
    Guid? CustomerId = null,
    string? OperatorName = null);

public sealed record CompleteSaleResponse(
    Guid Id,
    long Number,
    decimal Total,
    decimal Change,
    string ReceiptType);

public sealed record LoginResponse(
    Guid Id,
    string Name,
    string Username,
    string RoleName,
    IReadOnlyList<string> Permissions);

public sealed record PrintLabelsPayload(
    string PrinterNameOrAddress,
    int Language,
    int Layout,
    IReadOnlyList<LabelItemDto> Items,
    int CopiesPerItem = 1);

public sealed record LabelItemDto(
    string Sku,
    string Barcode,
    string Description,
    decimal SalePrice,
    string Unit = "UN",
    string? Size = null,
    string? Color = null);
