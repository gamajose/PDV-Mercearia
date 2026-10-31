using Pdv.Domain.Common;
using Pdv.Domain.Enums;

namespace Pdv.Domain.Entities;

public enum FinancialEntryType
{
    Payable = 1,   // Contas a Pagar (despesa / fornecedor)
    Receivable = 2 // Contas a Receber (receita / cliente)
}

public enum FinancialEntryStatus
{
    Pending = 1,
    Paid = 2,
    Cancelled = 3
}

public sealed class FinancialEntry : Entity
{
    private FinancialEntry()
    {
    }

    public FinancialEntry(
        Guid companyId,
        Guid storeId,
        FinancialEntryType type,
        string description,
        string category,
        DateOnly dueDate,
        decimal originalAmount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(originalAmount);

        CompanyId = companyId;
        StoreId = storeId;
        Type = type;
        Description = Require(description, nameof(description));
        Category = Require(category, nameof(category));
        DueDate = dueDate;
        OriginalAmount = decimal.Round(originalAmount, 2, MidpointRounding.AwayFromZero);
        Status = FinancialEntryStatus.Pending;
    }

    public Guid CompanyId { get; private set; }
    public Guid StoreId { get; private set; }
    public FinancialEntryType Type { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public string Category { get; private set; } = string.Empty;
    public DateOnly DueDate { get; private set; }
    public decimal OriginalAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public DateTimeOffset? PaidAt { get; private set; }
    public PaymentMethod? PaymentMethod { get; private set; }
    public FinancialEntryStatus Status { get; private set; }
    public Guid? SupplierId { get; private set; }
    public Guid? CustomerId { get; private set; }
    public Guid? PurchaseId { get; private set; }
    public Guid? SaleId { get; private set; }

    public void LinkSupplier(Guid supplierId)
    {
        SupplierId = supplierId;
        Touch();
    }

    public void LinkCustomer(Guid customerId)
    {
        CustomerId = customerId;
        Touch();
    }

    public void Settle(decimal paidAmount, PaymentMethod paymentMethod)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(paidAmount);

        PaidAmount = decimal.Round(paidAmount, 2, MidpointRounding.AwayFromZero);
        PaidAt = DateTimeOffset.UtcNow;
        PaymentMethod = paymentMethod;
        Status = FinancialEntryStatus.Paid;
        Touch();
    }

    public void Cancel()
    {
        Status = FinancialEntryStatus.Cancelled;
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
