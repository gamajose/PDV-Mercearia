namespace Pdv.Hardware.Printers;

public sealed record ReceiptCompanyInfo(
    string TradeName,
    string LegalName,
    string Cnpj,
    string Address,
    string CityState,
    string Phone
);

public sealed record ReceiptItem(
    int ItemNumber,
    string Code,
    string Description,
    string Unit,
    decimal Quantity,
    decimal UnitPrice,
    decimal TotalPrice
);

public sealed record ReceiptPayment(
    string MethodName,
    decimal Amount
);

public sealed record SaleReceiptModel(
    ReceiptCompanyInfo Company,
    long SaleNumber,
    string StoreName,
    string TerminalId,
    string OperatorName,
    DateTime CompletedAt,
    IReadOnlyList<ReceiptItem> Items,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    IReadOnlyList<ReceiptPayment> Payments,
    decimal Change,
    string? CustomerName = null,
    string? CustomerCpfCnpj = null,
    string? AdditionalMessage = null
);

public enum CashMovementType
{
    Opening = 1,
    Supply = 2,
    Bleed = 3,
    Closing = 4
}

public sealed record CashMovementReceiptModel(
    ReceiptCompanyInfo Company,
    CashMovementType Type,
    string StoreName,
    string TerminalId,
    string OperatorName,
    DateTime Timestamp,
    decimal Amount,
    string? Reason,
    IReadOnlyDictionary<string, decimal>? ClosingSummary = null
);
