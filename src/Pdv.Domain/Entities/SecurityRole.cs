using Pdv.Domain.Common;

namespace Pdv.Domain.Entities;

public sealed class SecurityRole : Entity
{
    private readonly HashSet<string> _permissions = new(StringComparer.OrdinalIgnoreCase);

    private SecurityRole()
    {
    }

    public SecurityRole(Guid companyId, string name, string? description = null)
    {
        CompanyId = companyId;
        Name = Require(name, nameof(name));
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
    }

    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsSystemDefault { get; private set; }

    public IReadOnlyCollection<string> Permissions => _permissions;

    public void AddPermission(string permission)
    {
        if (!string.IsNullOrWhiteSpace(permission))
        {
            _permissions.Add(permission.Trim());
            Touch();
        }
    }

    public void RemovePermission(string permission)
    {
        if (!string.IsNullOrWhiteSpace(permission))
        {
            _permissions.Remove(permission.Trim());
            Touch();
        }
    }

    public bool HasPermission(string permission) =>
        _permissions.Contains(permission.Trim()) || _permissions.Contains("admin.all");

    public void SetSystemDefault(bool isDefault)
    {
        IsSystemDefault = isDefault;
        Touch();
    }

    public static SecurityRole CreateAdminRole(Guid companyId)
    {
        var role = new SecurityRole(companyId, "Administrador", "Acesso total a todas as funções do sistema.")
        {
            IsSystemDefault = true
        };
        role.AddPermission("admin.all");
        return role;
    }

    public static SecurityRole CreateManagerRole(Guid companyId)
    {
        var role = new SecurityRole(companyId, "Gerente", "Acesso a relatórios, cancelamentos e operações de caixa.")
        {
            IsSystemDefault = true
        };
        role.AddPermission("pdv.discount.override");
        role.AddPermission("pdv.item.cancel");
        role.AddPermission("pdv.sale.cancel");
        role.AddPermission("pdv.drawer.open");
        role.AddPermission("pdv.cash.bleed");
        role.AddPermission("pdv.cash.supply");
        role.AddPermission("pdv.cash.close");
        role.AddPermission("finance.access");
        role.AddPermission("inventory.adjust");
        role.AddPermission("purchases.import");
        role.AddPermission("reports.view");
        return role;
    }

    public static SecurityRole CreateCashierRole(Guid companyId)
    {
        var role = new SecurityRole(companyId, "Operador de Caixa", "Acesso exclusivo à frente de caixa para vendas.")
        {
            IsSystemDefault = true
        };
        role.AddPermission("pdv.sale.create");
        role.AddPermission("pdv.cash.open");
        role.AddPermission("pdv.cash.close");
        role.AddPermission("pdv.price.query");
        return role;
    }

    private static string Require(string value, string name) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Valor obrigatório.", name)
            : value.Trim();
}
