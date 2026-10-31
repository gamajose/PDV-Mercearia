using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public enum InstallmentStatus
{
    Pending = 1,
    Paid = 2,
    Cancelled = 3
}

public sealed class CreditInstallment : Entity
{
    private CreditInstallment()
    {
    }

    public CreditInstallment(
        Guid companyId,
        Guid customerId,
        Guid saleId,
        int installmentNumber,
        int totalInstallments,
        DateOnly dueDate,
        decimal originalAmount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(originalAmount);

        CompanyId = companyId;
        CustomerId = customerId;
        SaleId = saleId;
        InstallmentNumber = installmentNumber;
        TotalInstallments = totalInstallments;
        DueDate = dueDate;
        OriginalAmount = decimal.Round(originalAmount, 2, MidpointRounding.AwayFromZero);
        Status = InstallmentStatus.Pending;
    }

    public Guid CompanyId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid SaleId { get; private set; }
    public int InstallmentNumber { get; private set; }
    public int TotalInstallments { get; private set; }
    public DateOnly DueDate { get; private set; }
    public decimal OriginalAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public decimal InterestAmount { get; private set; }
    public decimal FineAmount { get; private set; }
    public DateTimeOffset? PaidAt { get; private set; }
    public InstallmentStatus Status { get; private set; }

    public void Settle(decimal paidAmount, decimal interest = 0m, decimal fine = 0m)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(paidAmount);
        ArgumentOutOfRangeException.ThrowIfNegative(interest);
        ArgumentOutOfRangeException.ThrowIfNegative(fine);

        PaidAmount = decimal.Round(paidAmount, 2, MidpointRounding.AwayFromZero);
        InterestAmount = decimal.Round(interest, 2, MidpointRounding.AwayFromZero);
        FineAmount = decimal.Round(fine, 2, MidpointRounding.AwayFromZero);
        PaidAt = DateTimeOffset.UtcNow;
        Status = InstallmentStatus.Paid;
        Touch();
    }

    public void Cancel()
    {
        Status = InstallmentStatus.Cancelled;
        Touch();
    }
}
