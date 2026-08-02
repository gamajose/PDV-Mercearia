using Pdv.Domain.Services;

namespace Pdv.Domain.Tests;

public sealed class SaleCalculatorTests
{
    [Fact]
    public void CalculatesWeightedItemsAndDiscount()
    {
        var total = SaleCalculator.CalculateTotal(
            [
                (Quantity: 2m, UnitPrice: 10.50m),
                (Quantity: 1.250m, UnitPrice: 8m)
            ],
            discount: 1m);

        Assert.Equal(30m, total);
    }

    [Fact]
    public void RejectsDiscountGreaterThanSubtotal()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            SaleCalculator.CalculateTotal([(1m, 10m)], 11m));
    }
}
