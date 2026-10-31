using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class Customer : Entity
{
    private Customer()
    {
    }

    public Customer(Guid companyId, string name, string? cpfCnpj = null)
    {
        CompanyId = companyId;
        Name = Require(name, nameof(name));
        SetCpfCnpj(cpfCnpj);
    }

    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? CpfCnpj { get; private set; }
    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? Address { get; private set; }
    public string? City { get; private set; }
    public string? State { get; private set; }
    public string? ZipCode { get; private set; }
    public decimal CreditLimit { get; private set; }
    public decimal CurrentDebt { get; private set; }
    public bool IsCreditBlocked { get; private set; }
    public bool IsActive { get; private set; } = true;

    public void UpdateContact(string? email, string? phone, string? address, string? city, string? state, string? zipCode)
    {
        Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
        City = string.IsNullOrWhiteSpace(city) ? null : city.Trim();
        State = string.IsNullOrWhiteSpace(state) ? null : state.Trim().ToUpperInvariant();
        ZipCode = string.IsNullOrWhiteSpace(zipCode) ? null : zipCode.Trim();
        Touch();
    }

    public void SetCpfCnpj(string? cpfCnpj)
    {
        if (string.IsNullOrWhiteSpace(cpfCnpj))
        {
            CpfCnpj = null;
        }
        else
        {
            CpfCnpj = new string(cpfCnpj.Where(char.IsDigit).ToArray());
        }
        Touch();
    }

    public void SetCreditLimit(decimal limit)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(limit);
        CreditLimit = decimal.Round(limit, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void BlockCredit(bool blocked)
    {
        IsCreditBlocked = blocked;
        Touch();
    }

    public void AddDebt(decimal amount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(amount);

        if (IsCreditBlocked)
            throw new InvalidOperationException("Cliente com crediário bloqueado.");

        if (CreditLimit > 0 && (CurrentDebt + amount) > CreditLimit)
            throw new InvalidOperationException($"Limite de crédito excedido. Limite: {CreditLimit:C2}, Dívida atual: {CurrentDebt:C2}.");

        CurrentDebt = decimal.Round(CurrentDebt + amount, 2, MidpointRounding.AwayFromZero);
        Touch();
    }

    public void SettleDebt(decimal amount)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(amount);
        CurrentDebt = Math.Max(0m, decimal.Round(CurrentDebt - amount, 2, MidpointRounding.AwayFromZero));
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
