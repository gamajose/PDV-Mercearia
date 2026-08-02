using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Pdv.Infrastructure.Configuration;
using Pdv.Infrastructure.Persistence;

namespace Pdv.Infrastructure.Sync;

public sealed class OutboxDispatcher(
    IDbContextFactory<PdvDbContext> contextFactory,
    IHttpClientFactory httpClientFactory,
    NodeSettingsStore settingsStore)
{
    public async Task<int> DispatchBatchAsync(CancellationToken cancellationToken = default)
    {
        var settings = await settingsStore.LoadAsync(cancellationToken);
        if (settings.IsAdministrationHub || string.IsNullOrWhiteSpace(settings.AdministrationHubUrl))
        {
            return 0;
        }

        await using var context = await contextFactory.CreateDbContextAsync(cancellationToken);
        var events = await context.OutboxEvents
            .Where(x => x.SentAt == null)
            .OrderBy(x => x.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        if (events.Count == 0)
        {
            return 0;
        }

        var client = httpClientFactory.CreateClient(nameof(OutboxDispatcher));
        client.BaseAddress = new Uri(settings.AdministrationHubUrl, UriKind.Absolute);
        client.DefaultRequestHeaders.Add("X-Node-Id", settings.NodeId.ToString("D"));
        if (!string.IsNullOrWhiteSpace(settings.AdministrationHubApiKey))
        {
            client.DefaultRequestHeaders.Add("X-Terminal-Key", settings.AdministrationHubApiKey);
        }

        foreach (var outboxEvent in events)
        {
            try
            {
                using var response = await client.PostAsJsonAsync(
                    "/api/sync/events",
                    new
                    {
                        eventId = outboxEvent.Id,
                        outboxEvent.CompanyId,
                        outboxEvent.StoreId,
                        outboxEvent.EventType,
                        outboxEvent.Payload,
                        outboxEvent.CreatedAt
                    },
                    cancellationToken);

                response.EnsureSuccessStatusCode();
                outboxEvent.MarkSent();
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
            {
                outboxEvent.MarkFailure(exception.Message);
            }
        }

        await context.SaveChangesAsync(cancellationToken);
        return events.Count;
    }
}
