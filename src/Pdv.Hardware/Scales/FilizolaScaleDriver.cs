using System.Globalization;
using System.IO.Ports;
using System.Text;

namespace Pdv.Hardware.Scales;

public sealed class FilizolaScaleDriver : IScaleDriver
{
    private readonly ScaleConfiguration _config;
    private SerialPort? _serialPort;
    private CancellationTokenSource? _continuousCts;
    private readonly object _syncLock = new();
    private bool _disposed;

    public FilizolaScaleDriver(ScaleConfiguration config)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
    }

    public ScaleProtocol Protocol => ScaleProtocol.Filizola;
    public bool IsConnected => _serialPort is { IsOpen: true };

    public Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        lock (_syncLock)
        {
            if (_serialPort is { IsOpen: true })
                return Task.CompletedTask;

            _serialPort = new SerialPort(
                _config.PortName,
                _config.BaudRate,
                _config.Parity,
                _config.DataBits,
                _config.StopBits)
            {
                ReadTimeout = _config.ReadTimeoutMs,
                WriteTimeout = 1000,
                Encoding = Encoding.ASCII
            };

            _serialPort.Open();
            _serialPort.DiscardInBuffer();
            _serialPort.DiscardOutBuffer();
        }

        return Task.CompletedTask;
    }

    public Task DisconnectAsync()
    {
        StopContinuousReading();
        lock (_syncLock)
        {
            if (_serialPort != null)
            {
                if (_serialPort.IsOpen)
                {
                    _serialPort.Close();
                }
                _serialPort.Dispose();
                _serialPort = null;
            }
        }
        return Task.CompletedTask;
    }

    public async Task<ScaleReading> ReadWeightAsync(CancellationToken cancellationToken = default)
    {
        return await Task.Run(() =>
        {
            lock (_syncLock)
            {
                if (_serialPort is not { IsOpen: true })
                {
                    ConnectAsync(cancellationToken).GetAwaiter().GetResult();
                }

                _serialPort!.DiscardInBuffer();

                // Filizola padrão: Envia ENQ 0x05 para solicitar peso
                byte[] enq = [0x05];
                _serialPort.Write(enq, 0, 1);

                var buffer = new List<byte>();
                var startTime = DateTime.UtcNow;
                var timeout = TimeSpan.FromMilliseconds(_config.ReadTimeoutMs);

                while ((DateTime.UtcNow - startTime) < timeout)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (_serialPort.BytesToRead > 0)
                    {
                        var b = (byte)_serialPort.ReadByte();
                        buffer.Add(b);
                        if (b == 0x03 || b == 0x0A) // ETX ou LF
                            break;
                    }
                    else
                    {
                        Thread.Sleep(15);
                    }
                }

                return ParseFilizolaResponse(buffer.ToArray());
            }
        }, cancellationToken);
    }

    public static ScaleReading ParseFilizolaResponse(byte[] bytes)
    {
        if (bytes.Length == 0)
            return new ScaleReading(0m, false, true, false, "VAZIO");

        var raw = Encoding.ASCII.GetString(bytes);
        var clean = raw.Replace("\u0002", "").Replace("\u0003", "").Replace("\r", "").Replace("\n", "").Trim();

        var digits = new string(clean.Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits))
            return new ScaleReading(0m, false, true, false, raw);

        if (decimal.TryParse(digits, NumberStyles.Any, CultureInfo.InvariantCulture, out var rawNum))
        {
            var weightKg = rawNum / 1000m;
            return new ScaleReading(weightKg, true, weightKg == 0m, false, raw);
        }

        return new ScaleReading(0m, false, false, false, raw);
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
        DisconnectAsync().GetAwaiter().GetResult();
    }
}
