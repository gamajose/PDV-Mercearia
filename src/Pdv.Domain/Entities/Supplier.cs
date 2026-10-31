using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class Supplier : Entity
{
    private Supplier()
    {
    }

    public Supplier(Guid companyId, string corporateName, string tradeName, string cnpj)
    {
        CompanyId = companyId;
        CorporateName = Require(corporateName, nameof(corporateName));
        TradeName = Require(tradeName, nameof(tradeName));
        Cnpj = new string(cnpj.Where(char.IsDigit).ToArray());

        if (string.IsNullOrWhiteSpace(Cnpj))
            throw new ArgumentException("CNPJ obrigatório.", nameof(cnpj));
    }

    public Guid CompanyId { get; private set; }
    public string CorporateName { get; private set; } = string.Empty;
    public string TradeName { get; private set; } = string.Empty;
    public string Cnpj { get; private set; } = string.Empty;
    public string? StateRegistration { get; private set; }
    public string? ContactName { get; private set; }
    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? Address { get; private set; }
    public string? City { get; private set; }
    public string? State { get; private set; }
    public string? ZipCode { get; private set; }
    public bool IsActive { get; private set; } = true;

    public void UpdateInfo(string corporateName, string tradeName, string? stateRegistration, string? contactName, string? email, string? phone)
    {
        CorporateName = Require(corporateName, nameof(corporateName));
        TradeName = Require(tradeName, nameof(tradeName));
        StateRegistration = string.IsNullOrWhiteSpace(stateRegistration) ? null : stateRegistration.Trim();
        ContactName = string.IsNullOrWhiteSpace(contactName) ? null : contactName.Trim();
        Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        Touch();
    }

    public void UpdateAddress(string? address, string? city, string? state, string? zipCode)
    {
        Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
        City = string.IsNullOrWhiteSpace(city) ? null : city.Trim();
        State = string.IsNullOrWhiteSpace(state) ? null : state.Trim().ToUpperInvariant();
        ZipCode = string.IsNullOrWhiteSpace(zipCode) ? null : zipCode.Trim();
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
