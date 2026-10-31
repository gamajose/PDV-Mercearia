namespace Pdv.Hardware.Scales;

public enum ScaleProtocol
{
    Mock = 0,
    Toledo = 1,
    Filizola = 2,
    Elgin = 3
}

public sealed record ScaleConfiguration(
    ScaleProtocol Protocol = ScaleProtocol.Mock,
    string PortName = "COM1",
    int BaudRate = 9600,
    int DataBits = 8,
    System.IO.Ports.Parity Parity = System.IO.Ports.Parity.None,
    System.IO.Ports.StopBits StopBits = System.IO.Ports.StopBits.One,
    int ReadTimeoutMs = 1500,
    int ContinuousPollIntervalMs = 250
);

public sealed record ScaleReading(
    decimal Weight,
    bool IsStable,
    bool IsZero,
    bool IsOverload,
    string RawData
)
{
    public static ScaleReading Zero => new(0m, true, true, false, "0.000");
}
