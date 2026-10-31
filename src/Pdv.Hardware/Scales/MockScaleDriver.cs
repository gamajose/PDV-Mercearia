namespace Pdv.Hardware.Scales;

public sealed class MockScaleDriver : IScaleDriver
{
    private readonly ScaleConfiguration _config;
    private decimal _currentWeight = 1.250m;
    private CancellationTokenSource? _continuousCts;
    private bool _disposed;

    public MockScaleDriver(ScaleConfiguration? config = null)
    {
        _config = config ?? new ScaleConfiguration(ScaleProtocol.Mock);
    }

    public ScaleProtocol Protocol => ScaleProtocol.Mock;
    public bool IsConnected { get; private set; }

    public void SetWeight(decimal weight) => _currentWeight = Math.Max(0m, weight);

    public Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        IsConnected = true;
        return Task.CompletedTask;
    }

    public Task DisconnectAsync()
    {
        StopContinuousReading();
        IsConnected = false;
        return Task.CompletedTask;
    }

    public Task<ScaleReading> ReadWeightAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new ScaleReading(
            Weight: _currentWeight,
            IsStable: true,
            IsZero: _currentWeight == 0m,
            IsOverload: false,
            RawData: $"[MOCK] {_currentWeight:F3} kg"
        ));
    }

    public void StartContinuousReading(Action<ScaleReading> onWeightRead, Action<Exception>? onError = null)
    {
        StopContinuousReading();
        _continuousCts = new CancellationTokenSource();
        var token = _continuousCts.Token;

        _ = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    var reading = await ReadWeightAsync(token);
                    onWeightRead(reading);
                    await Task.Delay(_config.ContinuousPollIntervalMs, token);
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    onError?.Invoke(ex);
                    await Task.Delay(1000, token);
                }
            }
        }, token);
    }

    public void StopContinuousReading()
    {
        _continuousCts?.Cancel();
        _continuousCts?.Dispose();
        _continuousCts = null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopContinuousReading();
    }
}
