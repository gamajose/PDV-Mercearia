using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class Store : Entity
{
    private Store()
    {
    }

    public Store(Guid companyId, string code, string name, bool isAdministrationHub = false)
    {
        CompanyId = companyId;
        Code = Require(code, nameof(code)).ToUpperInvariant();
        Name = Require(name, nameof(name));
        IsAdministrationHub = isAdministrationHub;
    }

    public Guid CompanyId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public bool IsAdministrationHub { get; private set; }
    public bool IsActive { get; private set; } = true;

    public void Disable()
    {
        IsActive = false;
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
