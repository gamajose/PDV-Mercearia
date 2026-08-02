using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class Purchase : Entity
{
    private Purchase()
    {
    }

    public Purchase(Guid storeId, string supplierName, decimal total)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(total);

        StoreId = storeId;
        SupplierName = string.IsNullOrWhiteSpace(supplierName)
            ? throw new ArgumentException("Fornecedor obrigatório.", nameof(supplierName))
            : supplierName.Trim();
        Total = decimal.Round(total, 2, MidpointRounding.AwayFromZero);
    }

    public Guid StoreId { get; private set; }
    public string SupplierName { get; private set; } = string.Empty;
    public decimal Total { get; private set; }
    public DateTimeOffset PurchasedAt { get; private set; } = DateTimeOffset.UtcNow;
}
