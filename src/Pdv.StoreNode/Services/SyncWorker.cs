using Microsoft.Extensions.Logging;
using Pdv.Infrastructure.Sync;

namespace Pdv.StoreNode.Services;

public sealed class SyncWorker(
    OutboxDispatcher dispatcher,
    ILogger<SyncWorker> logger) : BackgroundService
{
    private static readonly Action<ILogger, Exception?> LogSyncFailure =
        LoggerMessage.Define(
            LogLevel.Error,
            new EventId(1001, nameof(LogSyncFailure)),
            "Falha ao processar a fila de sincronização.");

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
                LogSyncFailure(logger, exception);
            }

            await timer.WaitForNextTickAsync(stoppingToken);
        }
    }
}
