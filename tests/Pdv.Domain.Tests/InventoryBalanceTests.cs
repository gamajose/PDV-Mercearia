using Pdv.Domain.Entities;

namespace Pdv.Domain.Tests;

public sealed class InventoryBalanceTests
{
    [Fact]
    public void BalancesAreIndependentForEachStore()
    {
        var productId = Guid.NewGuid();
        var storeA = new InventoryBalance(Guid.NewGuid(), productId, 10m);
        var storeB = new InventoryBalance(Guid.NewGuid(), productId, 4m);

        storeA.Remove(3m);

        Assert.Equal(7m, storeA.Quantity);
        Assert.Equal(4m, storeB.Quantity);
    }

    [Fact]
    public void DoesNotAllowNegativeStock()
    {
        var balance = new InventoryBalance(Guid.NewGuid(), Guid.NewGuid(), 2m);

        Assert.Throws<InvalidOperationException>(() => balance.Remove(3m));
    }
}
