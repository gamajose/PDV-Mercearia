using Pdv.Hardware.Barcodes;
using Pdv.Hardware.Labels;
using Pdv.Hardware.Scales;
using Xunit;

namespace Pdv.Domain.Tests;

public class HardwareTests
{
    [Fact]
    public void BarcodeDecoderShouldRecognizeSupermarketScaleBarcodeWithPrice()
    {
        // 2 00123 001550 5:
        // Flag 2, PLU 123, Valor R$ 15,50
        var rawBarcode = "2001230015505";
        var result = BarcodeScannerDecoder.Parse(rawBarcode, BarcodeFormatMode.Price);

        Assert.True(result.IsScaleBarcode);
        Assert.Equal("123", result.SkuOrPlu);
        Assert.Equal(15.50m, result.EmbeddedPrice);
        Assert.Null(result.EmbeddedWeightKg);
    }

    [Fact]
    public void BarcodeDecoderShouldRecognizeSupermarketScaleBarcodeWithWeight()
    {
        // 2 00123 001250 5:
        // Flag 2, PLU 123, Peso 1.250 kg
        var rawBarcode = "2001230012505";
        var result = BarcodeScannerDecoder.Parse(rawBarcode, BarcodeFormatMode.Weight);

        Assert.True(result.IsScaleBarcode);
        Assert.Equal("123", result.SkuOrPlu);
        Assert.Equal(1.250m, result.EmbeddedWeightKg);
        Assert.Null(result.EmbeddedPrice);
    }

    [Fact]
    public void BarcodeDecoderShouldHandleStandardBarcode()
    {
        var rawBarcode = "7891000100103";
        var result = BarcodeScannerDecoder.Parse(rawBarcode);

        Assert.False(result.IsScaleBarcode);
        Assert.Equal("7891000100103", result.SkuOrPlu);
        Assert.Null(result.EmbeddedPrice);
        Assert.Null(result.EmbeddedWeightKg);
    }

    [Fact]
    public void ToledoDriverShouldParseStandardP03Response()
    {
        // STX + "01250" + ETX
        byte[] bytes = [0x02, (byte)'0', (byte)'1', (byte)'2', (byte)'5', (byte)'0', 0x03];
        var reading = ToledoScaleDriver.ParseToledoResponse(bytes);

        Assert.True(reading.IsStable);
        Assert.False(reading.IsZero);
        Assert.False(reading.IsOverload);
        Assert.Equal(1.250m, reading.Weight);
    }

    [Fact]
    public void FilizolaDriverShouldParseStandardResponse()
    {
        byte[] bytes = [0x02, (byte)'0', (byte)'2', (byte)'5', (byte)'0', (byte)'0', 0x03];
        var reading = FilizolaScaleDriver.ParseFilizolaResponse(bytes);

        Assert.True(reading.IsStable);
        Assert.Equal(2.500m, reading.Weight);
    }

    [Fact]
    public void ZplGeneratorShouldGenerateValidGondolaLabel()
    {
        var job = new LabelPrintJob(
            Layout: LabelLayout.GondolaSupermarket,
            Items:
            [
                new LabelItem("001", "7891234567890", "ARROZ TIPO 1 5KG", 29.90m, "UN", PricePerUnit: 5.98m, PricePerUnitLabel: "kg")
            ]
        );

        var zpl = ZplLabelGenerator.Generate(job);

        Assert.Contains("^XA", zpl, StringComparison.Ordinal);
        Assert.Contains("^XZ", zpl, StringComparison.Ordinal);
        Assert.Contains("ARROZ TIPO 1 5KG", zpl, StringComparison.Ordinal);
        Assert.Contains("29,90", zpl, StringComparison.Ordinal);
        Assert.Contains("7891234567890", zpl, StringComparison.Ordinal);
    }

    [Fact]
    public void EplGeneratorShouldGenerateValidApparelLabel()
    {
        var job = new LabelPrintJob(
            Layout: LabelLayout.ApparelSizeColor,
            Items:
            [
                new LabelItem("1002", "7899999999999", "CAMISA POLO SLIM", 89.90m, "UN", Size: "M", Color: "AZUL MARINHO")
            ]
        );

        var epl = EplLabelGenerator.Generate(job);

        Assert.Contains("N", epl, StringComparison.Ordinal);
        Assert.Contains("P1", epl, StringComparison.Ordinal);
        Assert.Contains("CAMISA POLO SLIM", epl, StringComparison.Ordinal);
        Assert.Contains("TAM: M   COR: AZUL MARINHO", epl, StringComparison.Ordinal);
    }
}
