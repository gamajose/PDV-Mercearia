namespace Pdv.Hardware.Printers;

public interface IPosPrinter
{
    string PrinterName { get; }
    int Columns { get; }

    Task<bool> PrintSaleReceiptAsync(SaleReceiptModel receipt, CancellationToken cancellationToken = default);
    Task<bool> PrintCashMovementReceiptAsync(CashMovementReceiptModel movement, CancellationToken cancellationToken = default);
    Task<bool> OpenCashDrawerAsync(CancellationToken cancellationToken = default);
    Task<bool> PrintRawBytesAsync(byte[] bytes, CancellationToken cancellationToken = default);
    Task<bool> PrintTestPageAsync(CancellationToken cancellationToken = default);
}
