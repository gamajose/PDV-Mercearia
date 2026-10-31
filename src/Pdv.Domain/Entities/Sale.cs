using Pdv.Domain.Common;
using Pdv.Domain.Enums;

namespace Pdv.Domain.Entities;

public sealed class Sale : Entity
{
    private readonly List<SaleItem> _items = [];
    private readonly List<SalePayment> _payments = [];

    private Sale()
    {
    }

    public Sale(Guid storeId, Guid terminalId, long number)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(number);

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
    public Guid? CustomerId { get; private set; }
    public string OperatorName { get; private set; } = "Caixa 01";

    public decimal Subtotal => decimal.Round(_items.Sum(item => item.Total), 2, MidpointRounding.AwayFromZero);
    public decimal Total => decimal.Round(Math.Max(0m, Subtotal - Discount), 2, MidpointRounding.AwayFromZero);
    public decimal TotalPaid => decimal.Round(_payments.Sum(p => p.Amount), 2, MidpointRounding.AwayFromZero);
    public decimal Change => decimal.Round(Math.Max(0m, TotalPaid - Total), 2, MidpointRounding.AwayFromZero);

    public IReadOnlyCollection<SaleItem> Items => _items.AsReadOnly();
    public IReadOnlyCollection<SalePayment> Payments => _payments.AsReadOnly();

    public void SetCustomer(Guid? customerId)
    {
        EnsureDraft();
        CustomerId = customerId;
        Touch();
    }

    public void SetOperator(string operatorName)
    {
        EnsureDraft();
        OperatorName = string.IsNullOrWhiteSpace(operatorName) ? "Caixa 01" : operatorName.Trim();
        Touch();
    }

    public void AddItem(Guid productId, string description, decimal quantity, decimal unitPrice)
    {
        EnsureDraft();
        _items.Add(new SaleItem(Id, productId, description, quantity, unitPrice));
        Touch();
    }

    public void RemoveItem(Guid itemId)
    {
        EnsureDraft();
        var item = _items.FirstOrDefault(x => x.Id == itemId);
        if (item != null)
        {
            _items.Remove(item);
            Touch();
        }
    }

    public void ApplyDiscount(decimal discount)
    {
        EnsureDraft();
        ArgumentOutOfRangeException.ThrowIfNegative(discount);

        var subtotal = _items.Sum(item => item.Total);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(discount, subtotal);

        Discount = decimal.Round(discount, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void AddPayment(PaymentMethod method, decimal amount)
    {
        EnsureDraft();
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(amount);
        _payments.Add(new SalePayment(Id, method, amount));
        Touch();
    }

    public void ClearPayments()
    {
        EnsureDraft();
        _payments.Clear();
        Touch();
    }

    public void Complete()
    {
        EnsureDraft();
        if (_items.Count == 0)
        {
            throw new InvalidOperationException("A venda precisa possuir ao menos um item.");
        }

        // Se houver pagamentos registrados, o total pago deve cobrir o valor total
        if (_payments.Count > 0 && TotalPaid < Total)
        {
            throw new InvalidOperationException($"Valor pago ({TotalPaid:C2}) insuficiente para o total da venda ({Total:C2}).");
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
