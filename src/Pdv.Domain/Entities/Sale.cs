using Pdv.Domain.Common;
using Pdv.Domain.Enums;

namespace Pdv.Domain.Entities;

public sealed class Sale : Entity
{
    private readonly List<SaleItem> _items = [];

    private Sale()
    {
    }

    public Sale(Guid storeId, Guid terminalId, long number)
    {
        if (number <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(number));
        }

        StoreId = storeId;
        TerminalId = terminalId;
        Number = number;
    }

    public Guid StoreId { get; private set; }
    public Guid TerminalId { get; private set; }
    public long Number { get; private set; }
    public SaleStatus Status { get; private set; } = SaleStatus.Draft;
    public DateTimeOffset? CompletedAt { get; private set; }
    public decimal Discount { get; private set; }
    public decimal Total => decimal.Round(_items.Sum(item => item.Total) - Discount, 2, MidpointRounding.AwayFromZero);
    public IReadOnlyCollection<SaleItem> Items => _items.AsReadOnly();

    public void AddItem(Guid productId, string description, decimal quantity, decimal unitPrice)
    {
        EnsureDraft();
        _items.Add(new SaleItem(Id, productId, description, quantity, unitPrice));
        Touch();
    }

    public void ApplyDiscount(decimal discount)
    {
        EnsureDraft();
        if (discount < 0 || discount > _items.Sum(item => item.Total))
        {
            throw new ArgumentOutOfRangeException(nameof(discount));
        }

        Discount = decimal.Round(discount, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void Complete()
    {
        EnsureDraft();
        if (_items.Count == 0)
        {
            throw new InvalidOperationException("A venda precisa possuir ao menos um item.");
        }

        Status = SaleStatus.Completed;
        CompletedAt = DateTimeOffset.UtcNow;
        Touch();
    }

    public void Cancel()
    {
        if (Status == SaleStatus.Cancelled)
        {
            return;
        }

        Status = SaleStatus.Cancelled;
        Touch();
    }

    private void EnsureDraft()
    {
        if (Status != SaleStatus.Draft)
        {
            throw new InvalidOperationException("A venda não pode mais ser alterada.");
        }
    }
}
