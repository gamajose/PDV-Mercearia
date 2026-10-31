namespace Pdv.Hardware.Scales;

public static class ScaleFactory
{
    public static IScaleDriver Create(ScaleConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);

        return configuration.Protocol switch
        {
            ScaleProtocol.Toledo => new ToledoScaleDriver(configuration),
            ScaleProtocol.Filizola => new FilizolaScaleDriver(configuration),
            ScaleProtocol.Elgin => new ElginScaleDriver(configuration),
            _ => new MockScaleDriver(configuration)
        };
    }
}
