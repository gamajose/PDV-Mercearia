namespace Pdv.Hardware.Labels;

public enum LabelLayout
{
    GondolaSupermarket = 1,
    ProductBarcode = 2,
    ApparelSizeColor = 3
}

public sealed record LabelItem(
    string Sku,
    string Barcode,
    string Description,
    decimal SalePrice,
    string Unit = "UN",
    string? Size = null,
    string? Color = null,
    string? Category = null,
    decimal? PricePerUnit = null,
    string? PricePerUnitLabel = null
);

public sealed record LabelPrintJob(
    LabelLayout Layout,
    IReadOnlyList<LabelItem> Items,
    int CopiesPerItem = 1,
    int LabelWidthMm = 100,
    int LabelHeightMm = 30
);
