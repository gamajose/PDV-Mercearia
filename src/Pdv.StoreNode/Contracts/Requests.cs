using Pdv.Domain.Enums;

namespace Pdv.StoreNode.Contracts;

public sealed record BootstrapRequest(
    string LegalName,
    string TradeName,
    string StoreCode,
    string StoreName,
    BusinessSegment Segment,
    bool IsAdministrationHub,
    string? AdministrationHubUrl,
    string? AdministrationHubApiKey);

public sealed record CreateProductRequest(
    string Sku,
    string Name,
    string? Barcode,
    UnitOfMeasure Unit,
    decimal CostPrice,
    decimal SalePrice,
    decimal InitialQuantity,
    decimal MinimumQuantity);

public sealed record CompleteSaleRequest(
    Guid TerminalId,
    decimal Discount,
    IReadOnlyCollection<CompleteSaleItemRequest> Items);

public sealed record CompleteSaleItemRequest(
    Guid ProductId,
    decimal Quantity);

public sealed record SyncEventRequest(
    Guid EventId,
    Guid CompanyId,
    Guid StoreId,
    string EventType,
    string Payload,
    DateTimeOffset CreatedAt);
