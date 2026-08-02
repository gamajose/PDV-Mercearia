using Pdv.Infrastructure.Sync;

namespace Pdv.StoreNode.Services;

public sealed class SyncWorker(
    OutboxDispatcher dispatcher,
    ILogger<SyncWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(20));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await dispatcher.DispatchBatchAsync(stoppingToken);
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Falha ao processar a fila de sincronização.");
            }

            await timer.WaitForNextTickAsync(stoppingToken);
        }
    }
}
