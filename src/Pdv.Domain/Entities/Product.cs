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
        ArgumentOutOfRangeException.ThrowIfNegative(salePrice);

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

    // Atributos Organizacionais
    public string? Category { get; private set; }
    public string? Department { get; private set; }
    public string? Brand { get; private set; }

    // Multi-Segmento: Confecção / Calçados / Moda
    public string? Size { get; private set; }
    public string? Color { get; private set; }

    // Multi-Segmento: Supermercado / Açougue / Padaria
    public bool IsWeighable { get; private set; }
    public string? PluCode { get; private set; }

    // Fiscal Básico
    public string? Ncm { get; private set; }
    public string? Cfop { get; private set; }

    public void UpdatePricing(decimal costPrice, decimal salePrice)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(costPrice);
        ArgumentOutOfRangeException.ThrowIfNegative(salePrice);

        CostPrice = decimal.Round(costPrice, 2, MidpointRounding.AwayFromZero);
        SalePrice = decimal.Round(salePrice, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void SetBarcode(string? barcode)
    {
        Barcode = string.IsNullOrWhiteSpace(barcode) ? null : barcode.Trim();
        Touch();
    }

    public void SetClassification(string? category, string? department, string? brand = null)
    {
        Category = string.IsNullOrWhiteSpace(category) ? null : category.Trim();
        Department = string.IsNullOrWhiteSpace(department) ? null : department.Trim();
        Brand = string.IsNullOrWhiteSpace(brand) ? null : brand.Trim();
        Touch();
    }

    public void SetApparelAttributes(string? size, string? color)
    {
        Size = string.IsNullOrWhiteSpace(size) ? null : size.Trim().ToUpperInvariant();
        Color = string.IsNullOrWhiteSpace(color) ? null : color.Trim().ToUpperInvariant();
        Touch();
    }

    public void SetWeighable(bool isWeighable, string? pluCode = null)
    {
        IsWeighable = isWeighable;
        PluCode = string.IsNullOrWhiteSpace(pluCode) ? null : pluCode.Trim();
        Touch();
    }

    public void SetFiscal(string? ncm, string? cfop)
    {
        Ncm = string.IsNullOrWhiteSpace(ncm) ? null : new string(ncm.Where(char.IsDigit).ToArray());
        Cfop = string.IsNullOrWhiteSpace(cfop) ? null : new string(cfop.Where(char.IsDigit).ToArray());
        Touch();
    }

    public void SetActive(bool active)
    {
        IsActive = active;
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
