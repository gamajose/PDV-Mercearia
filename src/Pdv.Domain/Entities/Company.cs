using Pdv.Domain.Common;
using Pdv.Domain.Enums;

namespace Pdv.Domain.Entities;

public sealed class Company : Entity
{
    private Company()
    {
    }

    public Company(string legalName, string tradeName, BusinessSegment segment)
    {
        LegalName = Require(legalName, nameof(legalName));
        TradeName = Require(tradeName, nameof(tradeName));
        Segment = segment;
    }

    public string LegalName { get; private set; } = string.Empty;
    public string TradeName { get; private set; } = string.Empty;
    public string? Document { get; private set; }
    public BusinessSegment Segment { get; private set; }

    public void UpdateIdentity(string legalName, string tradeName, string? document, BusinessSegment segment)
    {
        LegalName = Require(legalName, nameof(legalName));
        TradeName = Require(tradeName, nameof(tradeName));
        Document = string.IsNullOrWhiteSpace(document) ? null : document.Trim();
        Segment = segment;
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
