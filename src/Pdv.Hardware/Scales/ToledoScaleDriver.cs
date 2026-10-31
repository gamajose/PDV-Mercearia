using System.Globalization;
using System.IO.Ports;
using System.Text;

namespace Pdv.Hardware.Scales;

public sealed class ToledoScaleDriver : IScaleDriver
{
    private readonly ScaleConfiguration _config;
    private SerialPort? _serialPort;
    private CancellationTokenSource? _continuousCts;
    private readonly object _syncLock = new();
    private bool _disposed;

    public ToledoScaleDriver(ScaleConfiguration config)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
    }

    public ScaleProtocol Protocol => ScaleProtocol.Toledo;
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
                Encoding = Encoding.ASCII,
                DtrEnable = true,
                RtsEnable = true
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

                // Protocolo Toledo P03/P05: Envia ENQ (0x05)
                byte[] requestEnq = [0x05];
                _serialPort.Write(requestEnq, 0, 1);

                // Lê resposta STX ... ETX
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

                        if (b == 0x03) // ETX
                        {
                            break;
                        }
                    }
                    else
                    {
                        Thread.Sleep(15);
                    }
                }

                return ParseToledoResponse(buffer.ToArray());
            }
        }, cancellationToken);
    }

    public static ScaleReading ParseToledoResponse(byte[] bytes)
    {
        if (bytes.Length == 0)
        {
            return new ScaleReading(0m, false, true, false, "VAZIO");
        }

        var raw = Encoding.ASCII.GetString(bytes);

        // STX = 0x02, ETX = 0x03
        var clean = raw.Replace("\u0002", "").Replace("\u0003", "").Trim();

        if (clean.Contains('?') || clean.Contains('^') || clean.Contains("SOBRE"))
        {
            return new ScaleReading(0m, false, false, true, raw);
        }

        // Tenta isolar dígitos e pontuação
        var numericPart = new StringBuilder();
        foreach (var c in clean)
        {
            if (char.IsDigit(c) || c == '.' || c == ',')
            {
                numericPart.Append(c == ',' ? '.' : c);
            }
        }

        var numericStr = numericPart.ToString();
        if (string.IsNullOrWhiteSpace(numericStr))
        {
            return new ScaleReading(0m, false, true, false, raw);
        }

        // Se veio sem ponto (ex: 5 dígitos Toledo: 01250 = 1.250kg)
        if (!numericStr.Contains('.') && numericStr.Length >= 5)
        {
            if (decimal.TryParse(numericStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var rawVal))
            {
                var weightKg = rawVal / 1000m;
                return new ScaleReading(weightKg, true, weightKg == 0m, false, raw);
            }
        }
        else if (decimal.TryParse(numericStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var weightKg))
        {
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
