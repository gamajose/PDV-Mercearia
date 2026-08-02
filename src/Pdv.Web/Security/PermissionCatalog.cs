namespace Pdv.Web.Security;

public static class PermissionCatalog
{
    public const string DashboardView = "dashboard.view";
    public const string SalesView = "sales.view";
    public const string SalesCreate = "sales.create";
    public const string ProductsView = "products.view";
    public const string ProductsManage = "products.manage";
    public const string InventoryView = "inventory.view";
    public const string PurchasesView = "purchases.view";
    public const string ReportsView = "reports.view";
    public const string StoresManage = "stores.manage";
    public const string UsersManage = "users.manage";
    public const string SettingsManage = "settings.manage";

    public static IReadOnlyList<PermissionDefinition> All { get; } =
    [
        new(DashboardView, "Painel", "Visualizar indicadores da filial"),
        new(SalesView, "Vendas", "Consultar vendas"),
        new(SalesCreate, "Realizar vendas", "Abrir e concluir vendas"),
        new(ProductsView, "Produtos", "Consultar o catálogo"),
        new(ProductsManage, "Gerenciar produtos", "Cadastrar e alterar produtos"),
        new(InventoryView, "Estoque", "Consultar saldos da filial"),
        new(PurchasesView, "Compras", "Consultar e registrar compras"),
        new(ReportsView, "Relatórios", "Visualizar relatórios"),
        new(StoresManage, "Filiais", "Cadastrar e administrar filiais"),
        new(UsersManage, "Usuários", "Cadastrar usuários e definir permissões"),
        new(SettingsManage, "Configurações", "Alterar configurações da empresa")
    ];

    public static IReadOnlyList<string> AllCodes { get; } = All.Select(x => x.Code).ToArray();

    public static bool IsKnown(string permission) =>
        AllCodes.Contains(permission, StringComparer.Ordinal);
}

public sealed record PermissionDefinition(string Code, string Name, string Description);
