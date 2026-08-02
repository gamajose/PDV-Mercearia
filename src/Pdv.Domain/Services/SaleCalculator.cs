namespace Pdv.Domain.Services;

public static class SaleCalculator
{
    public static decimal CalculateTotal(
        IEnumerable<(decimal Quantity, decimal UnitPrice)> items,
        decimal discount = 0)
    {
        ArgumentNullException.ThrowIfNull(items);

        var subtotal = items.Sum(item =>
        {
            if (item.Quantity <= 0 || item.UnitPrice < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(items));
            }

            return item.Quantity * item.UnitPrice;
        });

        if (discount < 0 || discount > subtotal)
        {
            throw new ArgumentOutOfRangeException(nameof(discount));
        }

        return decimal.Round(subtotal - discount, 2, MidpointRounding.AwayFromZero);
    }
}
