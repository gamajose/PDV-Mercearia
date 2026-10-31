using System.Text;
using Pdv.Hardware.Printers;

namespace Pdv.Hardware.Labels;

public enum LabelLanguage
{
    Zpl = 1,
    Epl = 2
}

public sealed class LabelPrintService
{
    public static async Task<bool> PrintLabelsAsync(
        string printerNameOrAddress,
        LabelPrintJob job,
        LabelLanguage language = LabelLanguage.Zpl,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(printerNameOrAddress);
        ArgumentNullException.ThrowIfNull(job);

        var payload = language switch
        {
            LabelLanguage.Epl => EplLabelGenerator.Generate(job),
            _ => ZplLabelGenerator.Generate(job)
        };

        var bytes = Encoding.UTF8.GetBytes(payload);

        if (printerNameOrAddress.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(printerNameOrAddress);
            using var client = new System.Net.Sockets.TcpClient();
            await client.ConnectAsync(uri.Host, uri.Port <= 0 ? 9100 : uri.Port, cancellationToken);
            await using var stream = client.GetStream();
            await stream.WriteAsync(bytes, cancellationToken);
            await stream.FlushAsync(cancellationToken);
            return true;
        }

        return await Task.Run(() => RawPrinterHelper.SendBytesToPrinter(printerNameOrAddress, bytes, "Etiquetas PDV"), cancellationToken);
    }
}
