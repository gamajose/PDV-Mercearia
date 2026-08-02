using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class SaleItem : Entity
{
    private SaleItem()
    {
    }

    internal SaleItem(Guid saleId, Guid productId, string description, decimal quantity, decimal unitPrice)
    {
        if (quantity <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity));
        }

        if (unitPrice < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(unitPrice));
        }

        SaleId = saleId;
        ProductId = productId;
        Description = string.IsNullOrWhiteSpace(description)
            ? throw new ArgumentException("Descrição obrigatória.", nameof(description))
            : description.Trim();
        Quantity = quantity;
        UnitPrice = decimal.Round(unitPrice, 2, MidpointRounding.AwayFromZero);
    }

    public Guid SaleId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public decimal Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal Total => decimal.Round(Quantity * UnitPrice, 2, MidpointRounding.AwayFromZero);
}
