using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class OutboxEvent : Entity
{
    private OutboxEvent()
    {
    }

    public OutboxEvent(Guid companyId, Guid storeId, string eventType, string payload)
    {
        CompanyId = companyId;
        StoreId = storeId;
        EventType = string.IsNullOrWhiteSpace(eventType)
            ? throw new ArgumentException("Tipo obrigatório.", nameof(eventType))
            : eventType.Trim();
        Payload = string.IsNullOrWhiteSpace(payload)
            ? throw new ArgumentException("Payload obrigatório.", nameof(payload))
            : payload;
    }

    public Guid CompanyId { get; private set; }
    public Guid StoreId { get; private set; }
    public string EventType { get; private set; } = string.Empty;
    public string Payload { get; private set; } = string.Empty;
    public int AttemptCount { get; private set; }
    public DateTimeOffset? SentAt { get; private set; }
    public string? LastError { get; private set; }

    public void MarkSent()
    {
        SentAt = DateTimeOffset.UtcNow;
        LastError = null;
        Touch();
    }

    public void MarkFailure(string error)
    {
        AttemptCount++;
        LastError = error;
        Touch();
    }
}
