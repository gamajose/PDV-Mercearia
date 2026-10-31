using System.Globalization;
using System.Net.Sockets;
using System.Text;

namespace Pdv.Hardware.Printers;

public sealed class PosPrinter : IPosPrinter
{
    private readonly string _target; // Nome da impressora no Windows ou "tcp://192.168.1.200:9100"
    private readonly int _columns;
    private readonly Encoding _encoding;

    public PosPrinter(string target = "Default", int columns = 48)
    {
        _target = string.IsNullOrWhiteSpace(target) ? "Default" : target;
        _columns = columns <= 0 ? 48 : columns;

        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        try
        {
            _encoding = Encoding.GetEncoding("windows-1252");
        }
        catch
        {
            _encoding = Encoding.ASCII;
        }
    }

    public string PrinterName => _target;
    public int Columns => _columns;

    public async Task<bool> OpenCashDrawerAsync(CancellationToken cancellationToken = default)
    {
        return await PrintRawBytesAsync(EscPosCommands.OpenDrawer, cancellationToken);
    }

    public async Task<bool> PrintTestPageAsync(CancellationToken cancellationToken = default)
    {
        using var ms = new MemoryStream();
        await ms.WriteAsync(EscPosCommands.Initialize, cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await ms.WriteAsync(EscPosCommands.DoubleSizeOn, cancellationToken);
        await WriteTextAsync(ms, "TESTE DE IMPRESSAO\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.NormalSize, cancellationToken);
        await WriteTextAsync(ms, $"PDV Gama - {_columns} Colunas\n", cancellationToken);
        await WriteTextAsync(ms, $"{DateTime.Now:dd/MM/yyyy HH:mm:ss}\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignLeft, cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);
        await WriteTextAsync(ms, "Impressora termica configurada com sucesso!\n", cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.Feed3Lines, cancellationToken);
        await ms.WriteAsync(EscPosCommands.PartialCut, cancellationToken);

        return await PrintRawBytesAsync(ms.ToArray(), cancellationToken);
    }

    public async Task<bool> PrintSaleReceiptAsync(SaleReceiptModel receipt, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(receipt);

        using var ms = new MemoryStream();
        await ms.WriteAsync(EscPosCommands.Initialize, cancellationToken);

        // 1. Cabeçalho da Empresa
        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await WriteTextAsync(ms, $"{receipt.Company.TradeName.ToUpperInvariant()}\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);
        await WriteTextAsync(ms, $"{receipt.Company.LegalName}\n", cancellationToken);
        await WriteTextAsync(ms, $"CNPJ: {receipt.Company.Cnpj}\n", cancellationToken);
        if (!string.IsNullOrWhiteSpace(receipt.Company.Address))
            await WriteTextAsync(ms, $"{receipt.Company.Address}\n", cancellationToken);
        if (!string.IsNullOrWhiteSpace(receipt.Company.CityState))
            await WriteTextAsync(ms, $"{receipt.Company.CityState} - Tel: {receipt.Company.Phone}\n", cancellationToken);

        await ms.WriteAsync(EscPosCommands.AlignLeft, cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.DoubleLineSeparator(_columns) + "\n", cancellationToken);

        // 2. Título do Documento
        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await WriteTextAsync(ms, "COMPROVANTE NAO FISCAL\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignLeft, cancellationToken);
        await WriteTextAsync(ms, $"Venda: #{receipt.SaleNumber:D6}    Data: {receipt.CompletedAt:dd/MM/yyyy HH:mm:ss}\n", cancellationToken);
        await WriteTextAsync(ms, $"Loja: {receipt.StoreName}  Terminal: {receipt.TerminalId}  Op: {receipt.OperatorName}\n", cancellationToken);

        if (!string.IsNullOrWhiteSpace(receipt.CustomerName))
        {
            await WriteTextAsync(ms, $"Cliente: {receipt.CustomerName}\n", cancellationToken);
            if (!string.IsNullOrWhiteSpace(receipt.CustomerCpfCnpj))
                await WriteTextAsync(ms, $"CPF/CNPJ: {receipt.CustomerCpfCnpj}\n", cancellationToken);
        }

        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        // 3. Cabeçalho de Itens
        await WriteTextAsync(ms, FormatItemHeader(), cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        // 4. Lista de Itens
        foreach (var item in receipt.Items)
        {
            var line1 = $"#{item.ItemNumber:D2} {item.Code} {Truncate(item.Description, _columns - 14)}\n";
            await WriteTextAsync(ms, line1, cancellationToken);

            var qtyStr = $"{item.Quantity:N3} {item.Unit} x {item.UnitPrice:C2}";
            var totalStr = item.TotalPrice.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));
            var spaces = Math.Max(1, _columns - qtyStr.Length - totalStr.Length);
            var line2 = $"{qtyStr}{new string(' ', spaces)}{totalStr}\n";
            await WriteTextAsync(ms, line2, cancellationToken);
        }

        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        // 5. Totais
        await WriteTwoColumnLineAsync(ms, "Subtotal:", receipt.Subtotal.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), false, cancellationToken);
        if (receipt.Discount > 0)
        {
            await WriteTwoColumnLineAsync(ms, "Desconto:", $"-{receipt.Discount.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"))}", false, cancellationToken);
        }

        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await ms.WriteAsync(EscPosCommands.DoubleHeightOn, cancellationToken);
        await WriteTwoColumnLineAsync(ms, "TOTAL:", receipt.Total.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), true, cancellationToken);
        await ms.WriteAsync(EscPosCommands.NormalSize, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);

        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        // 6. Pagamentos
        await WriteTextAsync(ms, "FORMA(S) DE PAGAMENTO:\n", cancellationToken);
        foreach (var pay in receipt.Payments)
        {
            await WriteTwoColumnLineAsync(ms, pay.MethodName, pay.Amount.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), false, cancellationToken);
        }

        if (receipt.Change > 0)
        {
            await WriteTwoColumnLineAsync(ms, "Troco:", receipt.Change.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), false, cancellationToken);
        }

        // 7. Rodapé
        await WriteTextAsync(ms, EscPosCommands.DoubleLineSeparator(_columns) + "\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        if (!string.IsNullOrWhiteSpace(receipt.AdditionalMessage))
        {
            await WriteTextAsync(ms, $"{receipt.AdditionalMessage}\n", cancellationToken);
        }
        await WriteTextAsync(ms, "Obrigado pela preferencia! Volte sempre.\n", cancellationToken);
        await WriteTextAsync(ms, "PDV Gama - Automacao Comercial\n", cancellationToken);

        // 8. Corte
        await ms.WriteAsync(EscPosCommands.Feed5Lines, cancellationToken);
        await ms.WriteAsync(EscPosCommands.PartialCut, cancellationToken);

        return await PrintRawBytesAsync(ms.ToArray(), cancellationToken);
    }

    public async Task<bool> PrintCashMovementReceiptAsync(CashMovementReceiptModel movement, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(movement);

        using var ms = new MemoryStream();
        await ms.WriteAsync(EscPosCommands.Initialize, cancellationToken);

        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await WriteTextAsync(ms, $"{movement.Company.TradeName.ToUpperInvariant()}\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);
        await WriteTextAsync(ms, $"CNPJ: {movement.Company.Cnpj}\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignLeft, cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.DoubleLineSeparator(_columns) + "\n", cancellationToken);

        var title = movement.Type switch
        {
            CashMovementType.Opening => "ABERTURA DE CAIXA",
            CashMovementType.Supply => "SUPRIMENTO DE CAIXA",
            CashMovementType.Bleed => "SANGRIA DE CAIXA (RETIRADA)",
            CashMovementType.Closing => "FECHAMENTO DE CAIXA",
            _ => "MOVIMENTACAO DE CAIXA"
        };

        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await WriteTextAsync(ms, $"{title}\n", cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignLeft, cancellationToken);
        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        await WriteTextAsync(ms, $"Data/Hora : {movement.Timestamp:dd/MM/yyyy HH:mm:ss}\n", cancellationToken);
        await WriteTextAsync(ms, $"Loja      : {movement.StoreName}\n", cancellationToken);
        await WriteTextAsync(ms, $"Terminal  : {movement.TerminalId}\n", cancellationToken);
        await WriteTextAsync(ms, $"Operador  : {movement.OperatorName}\n", cancellationToken);

        if (!string.IsNullOrWhiteSpace(movement.Reason))
        {
            await WriteTextAsync(ms, $"Motivo    : {movement.Reason}\n", cancellationToken);
        }

        await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);

        await ms.WriteAsync(EscPosCommands.BoldOn, cancellationToken);
        await WriteTwoColumnLineAsync(ms, "VALOR MOVIMENTADO:", movement.Amount.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), true, cancellationToken);
        await ms.WriteAsync(EscPosCommands.BoldOff, cancellationToken);

        if (movement.ClosingSummary != null && movement.ClosingSummary.Count > 0)
        {
            await WriteTextAsync(ms, EscPosCommands.LineSeparator(_columns) + "\n", cancellationToken);
            await WriteTextAsync(ms, "RESUMO POR FORMA DE PAGAMENTO:\n", cancellationToken);
            foreach (var kvp in movement.ClosingSummary)
            {
                await WriteTwoColumnLineAsync(ms, kvp.Key, kvp.Value.ToString("C2", CultureInfo.GetCultureInfo("pt-BR")), false, cancellationToken);
            }
        }

        await ms.WriteAsync(EscPosCommands.Feed3Lines, cancellationToken);
        await ms.WriteAsync(EscPosCommands.AlignCenter, cancellationToken);
        await WriteTextAsync(ms, "____________________________________\n", cancellationToken);
        await WriteTextAsync(ms, "Assinatura do Operador / Gerente\n", cancellationToken);

        await ms.WriteAsync(EscPosCommands.Feed3Lines, cancellationToken);
        await ms.WriteAsync(EscPosCommands.PartialCut, cancellationToken);

        return await PrintRawBytesAsync(ms.ToArray(), cancellationToken);
    }

    public async Task<bool> PrintRawBytesAsync(byte[] bytes, CancellationToken cancellationToken = default)
    {
        if (bytes.Length == 0) return true;

        if (_target.StartsWith("tcp://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(_target);
            using var client = new TcpClient();
            await client.ConnectAsync(uri.Host, uri.Port <= 0 ? 9100 : uri.Port, cancellationToken);
            await using var stream = client.GetStream();
            await stream.WriteAsync(bytes, cancellationToken);
            await stream.FlushAsync(cancellationToken);
            return true;
        }

        return await Task.Run(() => RawPrinterHelper.SendBytesToPrinter(_target, bytes), cancellationToken);
    }

    private async Task WriteTextAsync(Stream stream, string text, CancellationToken cancellationToken)
    {
        var sanitized = RemoveDiacritics(text);
        var bytes = _encoding.GetBytes(sanitized);
        await stream.WriteAsync(bytes, cancellationToken);
    }

    private async Task WriteTwoColumnLineAsync(Stream stream, string left, string right, bool isBold, CancellationToken cancellationToken)
    {
        var spaces = Math.Max(1, _columns - left.Length - right.Length);
        var line = $"{left}{new string(' ', spaces)}{right}\n";
        await WriteTextAsync(stream, line, cancellationToken);
    }

    private string FormatItemHeader()
    {
        var left = "ITEM CODIGO DESCRICAO";
        var right = "QTD UN VALOR";
        var spaces = Math.Max(1, _columns - left.Length - right.Length);
        return $"{left}{new string(' ', spaces)}{right}\n";
    }

    private static string Truncate(string value, int maxLen)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLen) return value;
        return value.Substring(0, maxLen);
    }

    private static string RemoveDiacritics(string text)
    {
        var normalized = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
        {
            var uc = CharUnicodeInfo.GetUnicodeCategory(c);
            if (uc != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(c);
            }
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
