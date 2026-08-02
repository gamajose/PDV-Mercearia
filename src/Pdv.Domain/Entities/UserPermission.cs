using System.Diagnostics.CodeAnalysis;
using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

[SuppressMessage(
    "Naming",
    "CA1711:Identifiers should not have incorrect suffix",
    Justification = "A entidade representa literalmente uma permissão persistida de usuário.")]
public sealed class UserPermission : Entity
{
    private UserPermission()
    {
    }

    public UserPermission(Guid userId, string permission)
    {
        UserId = userId;
        Permission = string.IsNullOrWhiteSpace(permission)
            ? throw new ArgumentException("Permissão obrigatória.", nameof(permission))
            : permission.Trim();
    }

    public Guid UserId { get; private set; }
    public string Permission { get; private set; } = string.Empty;
}
