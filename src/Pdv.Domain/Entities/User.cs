using System.Security.Cryptography;
using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class User : Entity
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int Iterations = 100_000;

    private User()
    {
    }

    public User(Guid companyId, string name, string username, string password, Guid roleId)
    {
        CompanyId = companyId;
        Name = Require(name, nameof(name));
        Username = Require(username, nameof(username)).ToLowerInvariant();
        RoleId = roleId;
        SetPassword(password);
    }

    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string Username { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public string PasswordSalt { get; private set; } = string.Empty;
    public Guid RoleId { get; private set; }
    public bool IsActive { get; private set; } = true;

    public void SetPassword(string newPassword)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 4)
            throw new ArgumentException("A senha deve conter no mínimo 4 caracteres.", nameof(newPassword));

        var saltBytes = RandomNumberGenerator.GetBytes(SaltSize);
        var hashBytes = Rfc2898DeriveBytes.Pbkdf2(
            newPassword,
            saltBytes,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);

        PasswordSalt = Convert.ToBase64String(saltBytes);
        PasswordHash = Convert.ToBase64String(hashBytes);
        Touch();
    }

    public bool VerifyPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(PasswordSalt) || string.IsNullOrWhiteSpace(PasswordHash))
            return false;

        var saltBytes = Convert.FromBase64String(PasswordSalt);
        var expectedHashBytes = Convert.FromBase64String(PasswordHash);

        var actualHashBytes = Rfc2898DeriveBytes.Pbkdf2(
            password,
            saltBytes,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);

        return CryptographicOperations.FixedTimeEquals(actualHashBytes, expectedHashBytes);
    }

    public void ChangeRole(Guid newRoleId)
    {
        RoleId = newRoleId;
        Touch();
    }

    public void SetActive(bool active)
    {
        IsActive = active;
        Touch();
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
