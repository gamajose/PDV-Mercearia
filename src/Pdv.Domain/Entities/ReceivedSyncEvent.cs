using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class ReceivedSyncEvent : Entity
{
    private ReceivedSyncEvent()
    {
    }

    public ReceivedSyncEvent(
        Guid sourceEventId,
        Guid sourceNodeId,
        Guid companyId,
        Guid storeId,
        string eventType,
        string payload,
        DateTimeOffset occurredAt)
    {
        SourceEventId = sourceEventId;
        SourceNodeId = sourceNodeId;
        CompanyId = companyId;
        StoreId = storeId;
        EventType = eventType;
        Payload = payload;
        OccurredAt = occurredAt;
    }

    public Guid SourceEventId { get; private set; }
    public Guid SourceNodeId { get; private set; }
    public Guid CompanyId { get; private set; }
    public Guid StoreId { get; private set; }
    public string EventType { get; private set; } = string.Empty;
    public string Payload { get; private set; } = string.Empty;
    public DateTimeOffset OccurredAt { get; private set; }
}
