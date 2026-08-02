using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class AppUser : Entity
{
    private AppUser()
    {
    }

    public AppUser(
        Guid companyId,
        Guid? storeId,
        string displayName,
        string login,
        string passwordHash,
        bool isAdministrator = false)
    {
        CompanyId = companyId;
        StoreId = storeId;
        DisplayName = Require(displayName, nameof(displayName));
        Login = NormalizeLogin(login);
        PasswordHash = Require(passwordHash, nameof(passwordHash));
        IsAdministrator = isAdministrator;
        IsActive = true;
    }

    public Guid CompanyId { get; private set; }
    public Guid? StoreId { get; private set; }
    public string DisplayName { get; private set; } = string.Empty;
    public string Login { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public bool IsAdministrator { get; private set; }
    public bool IsActive { get; private set; }
    public DateTimeOffset? LastLoginAt { get; private set; }

    public void UpdateProfile(string displayName, Guid? storeId, bool isActive)
    {
        DisplayName = Require(displayName, nameof(displayName));
        StoreId = storeId;
        IsActive = isActive;
        Touch();
    }

    public void ChangePassword(string passwordHash)
    {
        PasswordHash = Require(passwordHash, nameof(passwordHash));
        Touch();
    }

    public void RegisterLogin()
    {
        LastLoginAt = DateTimeOffset.UtcNow;
        Touch();
    }

    public static string NormalizeLogin(string login) =>
        Require(login, nameof(login)).ToUpperInvariant();

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
