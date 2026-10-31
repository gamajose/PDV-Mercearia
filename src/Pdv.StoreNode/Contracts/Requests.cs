using Pdv.Domain.Entities;
using Pdv.Domain.Enums;
using Pdv.Hardware.Labels;

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
    decimal MinimumQuantity,
    string? Category = null,
    string? Department = null,
    string? Brand = null,
    string? Size = null,
    string? Color = null,
    bool IsWeighable = false,
    string? PluCode = null,
    string? Ncm = null,
    string? Cfop = null);

public sealed record PaymentRequest(
    PaymentMethod Method,
    decimal Amount);

public sealed record CompleteSaleRequest(
    Guid TerminalId,
    decimal Discount,
    IReadOnlyCollection<CompleteSaleItemRequest> Items,
    IReadOnlyCollection<PaymentRequest>? Payments = null,
    Guid? CustomerId = null,
    string? OperatorName = null);

public sealed record CompleteSaleItemRequest(
    Guid ProductId,
    decimal Quantity);

public sealed record CreateCustomerRequest(
    string Name,
    string? CpfCnpj,
    string? Email,
    string? Phone,
    string? Address,
    string? City,
    string? State,
    string? ZipCode,
    decimal CreditLimit);

public sealed record SettleCustomerDebtRequest(
    decimal Amount);

public sealed record CreateSupplierRequest(
    string CorporateName,
    string TradeName,
    string Cnpj,
    string? StateRegistration,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Address,
    string? City,
    string? State,
    string? ZipCode);

public sealed record LoginRequest(
    string Username,
    string Password);

public sealed record SupervisorAuthRequest(
    string Username,
    string Password,
    string RequiredPermission);

public sealed record CreateFinancialEntryRequest(
    FinancialEntryType Type,
    string Description,
    string Category,
    DateOnly DueDate,
    decimal Amount,
    Guid? SupplierId = null,
    Guid? CustomerId = null);

public sealed record SettleFinancialEntryRequest(
    decimal PaidAmount,
    PaymentMethod PaymentMethod);

public sealed record PrintLabelsApiRequest(
    string PrinterNameOrAddress,
    LabelLanguage Language,
    LabelLayout Layout,
    IReadOnlyList<LabelItem> Items,
    int CopiesPerItem = 1);

public sealed record SyncEventRequest(
    Guid EventId,
    Guid CompanyId,
    Guid StoreId,
    string EventType,
    string Payload,
    DateTimeOffset CreatedAt);
