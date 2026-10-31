using System.Globalization;
using System.Text;

namespace Pdv.Hardware.Labels;

public static class EplLabelGenerator
{
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    public static string Generate(LabelPrintJob job)
    {
        ArgumentNullException.ThrowIfNull(job);

        var sb = new StringBuilder();

        foreach (var item in job.Items)
        {
            for (var copy = 0; copy < job.CopiesPerItem; copy++)
            {
                sb.AppendLine("N");
                sb.AppendLine("q800");
                sb.AppendLine("Q240,24");

                switch (job.Layout)
                {
                    case LabelLayout.GondolaSupermarket:
                        AppendGondolaEpl(sb, item);
                        break;
                    case LabelLayout.ApparelSizeColor:
                        AppendApparelEpl(sb, item);
                        break;
                    default:
                        AppendStandardEpl(sb, item);
                        break;
                }

                sb.AppendLine("P1");
            }
        }

        return sb.ToString();
    }

    private static void AppendGondolaEpl(StringBuilder sb, LabelItem item)
    {
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,20,0,3,1,1,N,\"{Escape(item.Description)}\"");
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,55,0,2,1,1,N,\"Cod: {item.Sku} ({item.Unit})\"");

        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine(CultureInfo.InvariantCulture, $"A400,45,0,5,1,2,N,\"{priceStr}\"");

        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine(CultureInfo.InvariantCulture, $"B30,90,0,1,2,5,50,B,\"{barcode}\"");

        var dateStr = DateTime.Now.ToString("dd/MM/yyyy HH:mm", PtBr);
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,175,0,1,1,1,N,\"Impresso em: {dateStr}\"");
    }

    private static void AppendApparelEpl(StringBuilder sb, LabelItem item)
    {
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,20,0,3,1,1,N,\"{Escape(item.Description)}\"");
        var sizeColor = $"TAM: {item.Size ?? "U"}   COR: {item.Color ?? "UNICA"}";
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,55,0,2,1,1,N,\"{sizeColor}\"");

        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine(CultureInfo.InvariantCulture, $"B30,90,0,1,2,5,55,B,\"{barcode}\"");

        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine(CultureInfo.InvariantCulture, $"A400,85,0,5,1,2,N,\"{priceStr}\"");
    }

    private static void AppendStandardEpl(StringBuilder sb, LabelItem item)
    {
        sb.AppendLine(CultureInfo.InvariantCulture, $"A30,20,0,3,1,1,N,\"{Escape(item.Description)}\"");

        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine(CultureInfo.InvariantCulture, $"B30,60,0,1,2,5,60,B,\"{barcode}\"");

        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine(CultureInfo.InvariantCulture, $"A420,70,0,5,1,2,N,\"{priceStr}\"");
    }

    private static string Escape(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return text.Replace("\"", "'").Trim();
    }
}
