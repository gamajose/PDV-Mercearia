using System.Globalization;
using System.Text;

namespace Pdv.Hardware.Labels;

public static class ZplLabelGenerator
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
                sb.AppendLine("^XA");
                sb.AppendLine("^CI28"); // UTF-8 Encoding no ZPL

                switch (job.Layout)
                {
                    case LabelLayout.GondolaSupermarket:
                        AppendGondolaLayout(sb, item, job.LabelWidthMm, job.LabelHeightMm);
                        break;

                    case LabelLayout.ApparelSizeColor:
                        AppendApparelLayout(sb, item, job.LabelWidthMm, job.LabelHeightMm);
                        break;

                    default:
                        AppendStandardProductLayout(sb, item, job.LabelWidthMm, job.LabelHeightMm);
                        break;
                }

                sb.AppendLine("^XZ");
            }
        }

        return sb.ToString();
    }

    private static void AppendGondolaLayout(StringBuilder sb, LabelItem item, int widthMm, int heightMm)
    {
        // Descrição do Produto (Letras em destaque)
        sb.AppendLine("^FO30,25^A0N,28,26^FD" + Sanitize(item.Description) + "^FS");

        // Código / SKU
        sb.AppendLine("^FO30,65^A0N,20,18^FDCod: " + item.Sku + " (" + item.Unit + ")^FS");

        // Preço de Venda em Destaque Gigante (R$ XX,XX)
        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine("^FO420,55^A0N,60,55^FD" + priceStr + "^FS");

        // Preço por unidade de medida comparativo (ex: Hortifruti/Supermercado)
        if (item.PricePerUnit.HasValue && !string.IsNullOrWhiteSpace(item.PricePerUnitLabel))
        {
            var compPrice = $"{item.PricePerUnit.Value.ToString("C2", PtBr)} / {item.PricePerUnitLabel}";
            sb.AppendLine("^FO420,120^A0N,18,16^FD" + compPrice + "^FS");
        }

        // Código de Barras CODE128
        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine("^BY2,3,55");
        sb.AppendLine("^FO30,105^BCN,55,Y,N,N^FD" + barcode + "^FS");

        // Data / Rodapé
        sb.AppendLine("^FO30,190^A0N,16,14^FDImpresso em: " + DateTime.Now.ToString("dd/MM/yyyy HH:mm", PtBr) + "^FS");
    }

    private static void AppendApparelLayout(StringBuilder sb, LabelItem item, int widthMm, int heightMm)
    {
        // Descrição
        sb.AppendLine("^FO30,25^A0N,26,24^FD" + Sanitize(item.Description) + "^FS");

        // Grade: Tamanho e Cor em destaque
        var sizeColor = $"TAM: {item.Size ?? "U"}   COR: {item.Color ?? "UNICA"}";
        sb.AppendLine("^FO30,60^A0N,24,22^FD" + sizeColor + "^FS");

        // Código de barras
        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine("^BY2,3,60");
        sb.AppendLine("^FO30,95^BCN,60,Y,N,N^FD" + barcode + "^FS");

        // Preço
        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine("^FO430,90^A0N,55,50^FD" + priceStr + "^FS");
        sb.AppendLine("^FO430,150^A0N,20,18^FDA VISTA^FS");
    }

    private static void AppendStandardProductLayout(StringBuilder sb, LabelItem item, int widthMm, int heightMm)
    {
        // Descrição simples
        sb.AppendLine("^FO30,25^A0N,28,26^FD" + Sanitize(item.Description) + "^FS");

        // Código de barras
        var barcode = string.IsNullOrWhiteSpace(item.Barcode) ? item.Sku : item.Barcode;
        sb.AppendLine("^BY2,3,65");
        sb.AppendLine("^FO30,65^BCN,65,Y,N,N^FD" + barcode + "^FS");

        // Preço
        var priceStr = item.SalePrice.ToString("C2", PtBr);
        sb.AppendLine("^FO450,75^A0N,50,45^FD" + priceStr + "^FS");
    }

    private static string Sanitize(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return text.Replace("^", "").Replace("~", "").Trim();
    }
}
