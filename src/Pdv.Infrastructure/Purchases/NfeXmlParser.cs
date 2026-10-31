using System.Globalization;
using System.Xml.Linq;

namespace Pdv.Infrastructure.Purchases;

public sealed record NfeSupplierInfo(
    string Cnpj,
    string CorporateName,
    string TradeName,
    string? StateRegistration,
    string? Address,
    string? City,
    string? State,
    string? ZipCode
);

public sealed record NfeItemInfo(
    int ItemNumber,
    string SupplierProductCode,
    string? Barcode,
    string Description,
    string Ncm,
    string Cfop,
    string Unit,
    decimal Quantity,
    decimal UnitCost,
    decimal TotalCost
);

public sealed record NfeInvoiceInfo(
    string AccessKey,
    string InvoiceNumber,
    string Series,
    DateTimeOffset IssueDate,
    decimal TotalAmount,
    NfeSupplierInfo Supplier,
    IReadOnlyList<NfeItemInfo> Items
);

public static class NfeXmlParser
{
    private static readonly XNamespace Ns = "http://www.portalfiscal.inf.br/nfe";

    public static NfeInvoiceInfo Parse(Stream xmlStream)
    {
        ArgumentNullException.ThrowIfNull(xmlStream);

        var doc = XDocument.Load(xmlStream);
        return ParseDocument(doc);
    }

    public static NfeInvoiceInfo Parse(string xmlContent)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(xmlContent);

        var doc = XDocument.Parse(xmlContent);
        return ParseDocument(doc);
    }

    private static NfeInvoiceInfo ParseDocument(XDocument doc)
    {
        // Encontra infNFe com ou sem namespace
        var infNfe = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "infNFe")
            ?? throw new InvalidOperationException("Estrutura infNFe não encontrada no XML.");

        var accessKey = (string?)infNfe.Attribute("Id") ?? string.Empty;
        if (accessKey.StartsWith("NFe", StringComparison.OrdinalIgnoreCase))
        {
            accessKey = accessKey.Substring(3);
        }

        var ide = infNfe.Element(Ns + "ide") ?? infNfe.Element("ide")
            ?? throw new InvalidOperationException("Tag <ide> não encontrada.");

        var invoiceNumber = (string?)ide.Element(Ns + "nNF") ?? (string?)ide.Element("nNF") ?? "0";
        var series = (string?)ide.Element(Ns + "serie") ?? (string?)ide.Element("serie") ?? "1";
        var dhEmiRaw = (string?)ide.Element(Ns + "dhEmi") ?? (string?)ide.Element("dhEmi")
                    ?? (string?)ide.Element(Ns + "dEmi") ?? (string?)ide.Element("dEmi");

        var issueDate = DateTimeOffset.TryParse(dhEmiRaw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate)
            ? parsedDate
            : DateTimeOffset.UtcNow;

        // Emitente (Fornecedor)
        var emit = infNfe.Element(Ns + "emit") ?? infNfe.Element("emit")
            ?? throw new InvalidOperationException("Tag <emit> do fornecedor não encontrada.");

        var cnpj = (string?)emit.Element(Ns + "CNPJ") ?? (string?)emit.Element("CNPJ")
                ?? (string?)emit.Element(Ns + "CPF") ?? (string?)emit.Element("CPF") ?? string.Empty;
        var corporateName = (string?)emit.Element(Ns + "xNome") ?? (string?)emit.Element("xNome") ?? "FORNECEDOR";
        var tradeName = (string?)emit.Element(Ns + "xFant") ?? (string?)emit.Element("xFant") ?? corporateName;
        var ie = (string?)emit.Element(Ns + "IE") ?? (string?)emit.Element("IE");

        var enderEmit = emit.Element(Ns + "enderEmit") ?? emit.Element("enderEmit");
        var address = enderEmit != null
            ? $"{(string?)enderEmit.Element(Ns + "xLgr") ?? (string?)enderEmit.Element("xLgr")}, {(string?)enderEmit.Element(Ns + "nro") ?? (string?)enderEmit.Element("nro")}"
            : null;
        var city = enderEmit != null
            ? (string?)enderEmit.Element(Ns + "xMun") ?? (string?)enderEmit.Element("xMun")
            : null;
        var state = enderEmit != null
            ? (string?)enderEmit.Element(Ns + "UF") ?? (string?)enderEmit.Element("UF")
            : null;
        var zipCode = enderEmit != null
            ? (string?)enderEmit.Element(Ns + "CEP") ?? (string?)enderEmit.Element("CEP")
            : null;

        var supplier = new NfeSupplierInfo(cnpj, corporateName, tradeName, ie, address, city, state, zipCode);

        // Itens
        var detElements = infNfe.Elements().Where(e => e.Name.LocalName == "det").ToList();
        var items = new List<NfeItemInfo>();

        foreach (var det in detElements)
        {
            var itemNumberAttr = (string?)det.Attribute("nItem") ?? (items.Count + 1).ToString(CultureInfo.InvariantCulture);
            _ = int.TryParse(itemNumberAttr, out var itemNumber);

            var prod = det.Element(Ns + "prod") ?? det.Element("prod");
            if (prod == null) continue;

            var cProd = (string?)prod.Element(Ns + "cProd") ?? (string?)prod.Element("cProd") ?? string.Empty;
            var cEan = (string?)prod.Element(Ns + "cEAN") ?? (string?)prod.Element("cEAN");
            if (string.Equals(cEan, "SEM GTIN", StringComparison.OrdinalIgnoreCase)) cEan = null;

            var xProd = (string?)prod.Element(Ns + "xProd") ?? (string?)prod.Element("xProd") ?? string.Empty;
            var ncm = (string?)prod.Element(Ns + "NCM") ?? (string?)prod.Element("NCM") ?? string.Empty;
            var cfop = (string?)prod.Element(Ns + "CFOP") ?? (string?)prod.Element("CFOP") ?? string.Empty;
            var uCom = (string?)prod.Element(Ns + "uCom") ?? (string?)prod.Element("uCom") ?? "UN";

            var qComRaw = (string?)prod.Element(Ns + "qCom") ?? (string?)prod.Element("qCom") ?? "0";
            var vUnComRaw = (string?)prod.Element(Ns + "vUnCom") ?? (string?)prod.Element("vUnCom") ?? "0";
            var vProdRaw = (string?)prod.Element(Ns + "vProd") ?? (string?)prod.Element("vProd") ?? "0";

            var qCom = decimal.TryParse(qComRaw, CultureInfo.InvariantCulture, out var qVal) ? qVal : 0m;
            var vUnCom = decimal.TryParse(vUnComRaw, CultureInfo.InvariantCulture, out var unVal) ? unVal : 0m;
            var vProd = decimal.TryParse(vProdRaw, CultureInfo.InvariantCulture, out var totVal) ? totVal : (qCom * vUnCom);

            items.Add(new NfeItemInfo(
                ItemNumber: itemNumber,
                SupplierProductCode: cProd,
                Barcode: cEan,
                Description: xProd,
                Ncm: ncm,
                Cfop: cfop,
                Unit: uCom.ToUpperInvariant(),
                Quantity: qCom,
                UnitCost: vUnCom,
                TotalCost: vProd
            ));
        }

        // Total
        var totalElem = infNfe.Element(Ns + "total") ?? infNfe.Element("total");
        var icmsTot = totalElem?.Element(Ns + "ICMSTot") ?? totalElem?.Element("ICMSTot");
        var vNfRaw = (string?)icmsTot?.Element(Ns + "vNF") ?? (string?)icmsTot?.Element("vNF")
                    ?? (string?)totalElem?.Element(Ns + "vNF") ?? (string?)totalElem?.Element("vNF") ?? "0";

        var totalAmount = decimal.TryParse(vNfRaw, CultureInfo.InvariantCulture, out var parsedTotal)
            ? parsedTotal
            : items.Sum(x => x.TotalCost);

        return new NfeInvoiceInfo(
            AccessKey: accessKey,
            InvoiceNumber: invoiceNumber,
            Series: series,
            IssueDate: issueDate,
            TotalAmount: totalAmount,
            Supplier: supplier,
            Items: items
        );
    }
}
