using Pdv.Domain.Entities;
using Pdv.Domain.Enums;
using Pdv.Infrastructure.Purchases;
using Xunit;

namespace Pdv.Domain.Tests;

public class CoreDomainTests
{
    [Fact]
    public void CustomerCreditLimitShouldPreventExcessDebt()
    {
        var customer = new Customer(Guid.NewGuid(), "Manoel Silva", "123.456.789-00");
        customer.SetCreditLimit(100.00m);

        customer.AddDebt(80.00m);
        Assert.Equal(80.00m, customer.CurrentDebt);

        // Tentar adicionar mais 30.00m deve estourar o limite de 100.00m
        Assert.Throws<InvalidOperationException>(() => customer.AddDebt(30.00m));

        // Quitar 50.00m
        customer.SettleDebt(50.00m);
        Assert.Equal(30.00m, customer.CurrentDebt);

        // Agora pode adicionar 30.00m
        customer.AddDebt(30.00m);
        Assert.Equal(60.00m, customer.CurrentDebt);
    }

    [Fact]
    public void UserPasswordHashShouldVerifyCorrectly()
    {
        var companyId = Guid.NewGuid();
        var role = SecurityRole.CreateManagerRole(companyId);
        var user = new User(companyId, "Carlos Gerente", "carlos", "SenhaForte@2026", role.Id);

        Assert.True(user.VerifyPassword("SenhaForte@2026"));
        Assert.False(user.VerifyPassword("SenhaErrada"));
        Assert.False(user.VerifyPassword(""));
    }

    [Fact]
    public void SecurityRoleShouldCheckPermissionsAccurately()
    {
        var companyId = Guid.NewGuid();
        var cashier = SecurityRole.CreateCashierRole(companyId);
        var manager = SecurityRole.CreateManagerRole(companyId);
        var admin = SecurityRole.CreateAdminRole(companyId);

        // Caixa não tem permissão para cancelar item
        Assert.False(cashier.HasPermission("pdv.item.cancel"));

        // Gerente e Admin possuem
        Assert.True(manager.HasPermission("pdv.item.cancel"));
        Assert.True(admin.HasPermission("pdv.item.cancel"));
    }

    [Fact]
    public void NfeXmlParserShouldExtractInvoiceDataCorrectly()
    {
        var sampleXml = """
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
            <NFe>
                <infNFe Id="NFe35240112345678000199550010000012341000012345">
                    <ide>
                        <nNF>1234</nNF>
                        <serie>1</serie>
                        <dhEmi>2026-10-31T10:00:00-03:00</dhEmi>
                    </ide>
                    <emit>
                        <CNPJ>12345678000199</CNPJ>
                        <xNome>DISTRIBUIDORA DE ALIMENTOS LTDA</xNome>
                        <xFant>DISTRIBUIDORA GAMA</xFant>
                        <IE>123456789</IE>
                        <enderEmit>
                            <xLgr>AV BRASIL</xLgr>
                            <nro>1000</nro>
                            <xMun>SAO PAULO</xMun>
                            <UF>SP</UF>
                            <CEP>01000000</CEP>
                        </enderEmit>
                    </emit>
                    <det nItem="1">
                        <prod>
                            <cProd>PROD-99</cProd>
                            <cEAN>7891234567890</cEAN>
                            <xProd>FEIJAO CARIOCA 1KG</xProd>
                            <NCM>07133399</NCM>
                            <CFOP>5102</CFOP>
                            <uCom>KG</uCom>
                            <qCom>100.0000</qCom>
                            <vUnCom>7.5000</vUnCom>
                            <vProd>750.00</vProd>
                        </prod>
                    </det>
                    <total>
                        <ICMSTot>
                            <vNF>750.00</vNF>
                        </ICMSTot>
                    </total>
                </infNFe>
            </NFe>
        </nfeProc>
        """;

        var invoice = NfeXmlParser.Parse(sampleXml);

        Assert.Equal("35240112345678000199550010000012341000012345", invoice.AccessKey);
        Assert.Equal("1234", invoice.InvoiceNumber);
        Assert.Equal(750.00m, invoice.TotalAmount);
        Assert.Equal("12345678000199", invoice.Supplier.Cnpj);
        Assert.Equal("DISTRIBUIDORA DE ALIMENTOS LTDA", invoice.Supplier.CorporateName);
        Assert.Single(invoice.Items);

        var item = invoice.Items[0];
        Assert.Equal("PROD-99", item.SupplierProductCode);
        Assert.Equal("7891234567890", item.Barcode);
        Assert.Equal(100.00m, item.Quantity);
        Assert.Equal(7.50m, item.UnitCost);
    }
}
