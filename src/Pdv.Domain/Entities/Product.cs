using Pdv.Domain.Common;
using Pdv.Domain.Enums;

namespace Pdv.Domain.Entities;

public sealed class Product : Entity
{
    private Product()
    {
    }

    public Product(Guid companyId, string sku, string name, UnitOfMeasure unit, decimal salePrice)
    {
        if (salePrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(salePrice));
        }

        CompanyId = companyId;
        Sku = Require(sku, nameof(sku)).ToUpperInvariant();
        Name = Require(name, nameof(name));
        Unit = unit;
        SalePrice = decimal.Round(salePrice, 2, MidpointRounding.AwayFromZero);
    }

    public Guid CompanyId { get; private set; }
    public string Sku { get; private set; } = string.Empty;
    public string? Barcode { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public UnitOfMeasure Unit { get; private set; }
    public decimal SalePrice { get; private set; }
    public decimal CostPrice { get; private set; }
    public bool IsActive { get; private set; } = true;

    public void UpdatePricing(decimal costPrice, decimal salePrice)
    {
        if (costPrice < 0 || salePrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(salePrice));
        }

        CostPrice = decimal.Round(costPrice, 2, MidpointRounding.AwayFromZero);
        SalePrice = decimal.Round(salePrice, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void SetBarcode(string? barcode)
    {
        Barcode = string.IsNullOrWhiteSpace(barcode) ? null : barcode.Trim();
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
