using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class InventoryBalance : Entity
{
    private InventoryBalance()
    {
    }

    public InventoryBalance(Guid storeId, Guid productId, decimal initialQuantity = 0)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(initialQuantity);

        StoreId = storeId;
        ProductId = productId;
        Quantity = initialQuantity;
    }

    public Guid StoreId { get; private set; }
    public Guid ProductId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal MinimumQuantity { get; private set; }

    public void Add(decimal quantity)
    {
        EnsurePositive(quantity);
        Quantity += quantity;
        Touch();
    }

    public void Remove(decimal quantity)
    {
        EnsurePositive(quantity);

        if (Quantity < quantity)
        {
            throw new InvalidOperationException("Estoque insuficiente nesta loja.");
        }

        Quantity -= quantity;
        Touch();
    }

    public void SetMinimum(decimal quantity)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(quantity);
        MinimumQuantity = quantity;
        Touch();
    }

    private static void EnsurePositive(decimal quantity) =>
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(quantity);
}
