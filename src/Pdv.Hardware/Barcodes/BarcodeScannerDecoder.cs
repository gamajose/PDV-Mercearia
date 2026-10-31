namespace Pdv.Hardware.Barcodes;

public enum BarcodeFormatMode
{
    /// <summary>
    /// O miolo do código de barras da balança representa o VALOR TOTAL em centavos (padrão mais comum no Brasil).
    /// Exemplo: 2 00123 001550 5 -> PLU: 123, Valor: R$ 15,50.
    /// </summary>
    Price = 0,

    /// <summary>
    /// O miolo do código de barras da balança representa o PESO em gramas.
    /// Exemplo: 2 00123 001250 5 -> PLU: 123, Peso: 1,250 kg.
    /// </summary>
    Weight = 1
}

public sealed record BarcodeParseResult(
    string RawCode,
    bool IsScaleBarcode,
    string CleanCode,
    string SkuOrPlu,
    decimal? EmbeddedPrice,
    decimal? EmbeddedWeightKg,
    bool IsChecksumValid
);

public static class BarcodeScannerDecoder
{
    public static BarcodeParseResult Parse(string? rawBarcode, BarcodeFormatMode scaleMode = BarcodeFormatMode.Price)
    {
        if (string.IsNullOrWhiteSpace(rawBarcode))
        {
            return new BarcodeParseResult(
                RawCode: string.Empty,
                IsScaleBarcode: false,
                CleanCode: string.Empty,
                SkuOrPlu: string.Empty,
                EmbeddedPrice: null,
                EmbeddedWeightKg: null,
                IsChecksumValid: false
            );
        }

        var clean = new string(rawBarcode.Where(char.IsDigit).ToArray());

        // Se for código padrão EAN-13 iniciado pelo dígito '2' (código de balança de supermercado/açougue)
        if (clean.Length == 13 && clean.StartsWith('2'))
        {
            var isValidChecksum = ValidateEan13Checksum(clean);

            // Formato padrão nacional brasileiro:
            // Dígito 1: '2' (flag de balança)
            // Dígitos 2 a 6 (5 dígitos): Código do Produto / PLU
            // Dígitos 7 a 12 (6 dígitos ou 5 dígitos + verif): Valor em centavos ou peso em gramas
            // Dígito 13: Dígito verificador
            var pluRaw = clean.Substring(1, 5).TrimStart('0');
            var plu = string.IsNullOrEmpty(pluRaw) ? "0" : pluRaw;
            var valueOrWeightDigits = clean.Substring(6, 6);

            decimal? embeddedPrice = null;
            decimal? embeddedWeightKg = null;

            if (decimal.TryParse(valueOrWeightDigits, out var numericPayload))
            {
                if (scaleMode == BarcodeFormatMode.Price)
                {
                    // Exemplo: 001550 -> R$ 15.50
                    embeddedPrice = numericPayload / 100m;
                }
                else
                {
                    // Exemplo: 001250 -> 1.250 kg (1250 gramas)
                    embeddedWeightKg = numericPayload / 1000m;
                }
            }

            return new BarcodeParseResult(
                RawCode: rawBarcode,
                IsScaleBarcode: true,
                CleanCode: clean,
                SkuOrPlu: plu,
                EmbeddedPrice: embeddedPrice,
                EmbeddedWeightKg: embeddedWeightKg,
                IsChecksumValid: isValidChecksum
            );
        }

        // Código convencional (EAN-13, EAN-8, CODE-128, etc.)
        var isEan13Valid = clean.Length == 13 ? ValidateEan13Checksum(clean) : true;

        return new BarcodeParseResult(
            RawCode: rawBarcode,
            IsScaleBarcode: false,
            CleanCode: clean,
            SkuOrPlu: clean,
            EmbeddedPrice: null,
            EmbeddedWeightKg: null,
            IsChecksumValid: isEan13Valid
        );
    }

    public static bool ValidateEan13Checksum(string ean13)
    {
        if (ean13.Length != 13 || !ean13.All(char.IsDigit))
            return false;

        var sum = 0;
        for (var i = 0; i < 12; i++)
        {
            var digit = ean13[i] - '0';
            sum += (i % 2 == 0) ? digit * 1 : digit * 3;
        }

        var mod = sum % 10;
        var checkDigit = (mod == 0) ? 0 : 10 - mod;

        return checkDigit == (ean13[12] - '0');
    }
}
