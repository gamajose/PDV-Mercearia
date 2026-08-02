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
