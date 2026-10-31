namespace Pdv.Hardware.Scales;

public interface IScaleDriver : IDisposable
{
    ScaleProtocol Protocol { get; }
    bool IsConnected { get; }

    Task ConnectAsync(CancellationToken cancellationToken = default);
    Task DisconnectAsync();

    Task<ScaleReading> ReadWeightAsync(CancellationToken cancellationToken = default);

    void StartContinuousReading(
        Action<ScaleReading> onWeightRead,
        Action<Exception>? onError = null);

    void StopContinuousReading();
}
