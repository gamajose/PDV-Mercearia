using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class CashSession : Entity
{
    private CashSession()
    {
    }

    public CashSession(Guid storeId, Guid terminalId, Guid openedByUserId, decimal openingAmount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(openingAmount);

        StoreId = storeId;
        TerminalId = terminalId;
        OpenedByUserId = openedByUserId;
        OpeningAmount = decimal.Round(openingAmount, 2, MidpointRounding.AwayFromZero);
    }

    public Guid StoreId { get; private set; }
    public Guid TerminalId { get; private set; }
    public Guid OpenedByUserId { get; private set; }
    public decimal OpeningAmount { get; private set; }
    public decimal? ClosingAmount { get; private set; }
    public DateTimeOffset OpenedAt { get; private set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ClosedAt { get; private set; }
    public bool IsOpen => ClosedAt is null;

    public void Close(decimal closingAmount)
    {
        if (!IsOpen)
        {
            throw new InvalidOperationException("Caixa já fechado.");
        }

        ArgumentOutOfRangeException.ThrowIfNegative(closingAmount);

        ClosingAmount = decimal.Round(closingAmount, 2, MidpointRounding.AwayFromZero);
        ClosedAt = DateTimeOffset.UtcNow;
        Touch();
    }
}
