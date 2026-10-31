using Microsoft.EntityFrameworkCore;
using Pdv.Domain.Entities;

namespace Pdv.Infrastructure.Persistence;

public sealed class PdvDbContext(DbContextOptions<PdvDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<InventoryBalance> InventoryBalances => Set<InventoryBalance>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<SalePayment> SalePayments => Set<SalePayment>();
    public DbSet<Purchase> Purchases => Set<Purchase>();
    public DbSet<CashSession> CashSessions => Set<CashSession>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<User> Users => Set<User>();
    public DbSet<SecurityRole> SecurityRoles => Set<SecurityRole>();
    public DbSet<CreditInstallment> CreditInstallments => Set<CreditInstallment>();
    public DbSet<FinancialEntry> FinancialEntries => Set<FinancialEntry>();
    public DbSet<OutboxEvent> OutboxEvents => Set<OutboxEvent>();
    public DbSet<ReceivedSyncEvent> ReceivedSyncEvents => Set<ReceivedSyncEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Company>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.LegalName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.TradeName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Document).HasMaxLength(32);
        });

        modelBuilder.Entity<Store>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Sku).HasMaxLength(60).IsRequired();
            entity.Property(x => x.Barcode).HasMaxLength(60);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.SalePrice).HasPrecision(18, 2);
            entity.Property(x => x.CostPrice).HasPrecision(18, 2);
            entity.Property(x => x.Category).HasMaxLength(80);
            entity.Property(x => x.Department).HasMaxLength(80);
            entity.Property(x => x.Brand).HasMaxLength(80);
            entity.Property(x => x.Size).HasMaxLength(20);
            entity.Property(x => x.Color).HasMaxLength(40);
            entity.Property(x => x.PluCode).HasMaxLength(20);
            entity.Property(x => x.Ncm).HasMaxLength(20);
            entity.Property(x => x.Cfop).HasMaxLength(10);
            entity.HasIndex(x => new { x.CompanyId, x.Sku }).IsUnique();
            entity.HasIndex(x => new { x.CompanyId, x.Barcode });
            entity.HasIndex(x => new { x.CompanyId, x.PluCode });
        });

        modelBuilder.Entity<InventoryBalance>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Quantity).HasPrecision(18, 3);
            entity.Property(x => x.MinimumQuantity).HasPrecision(18, 3);
            entity.HasIndex(x => new { x.StoreId, x.ProductId }).IsUnique();
        });

        modelBuilder.Entity<Sale>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Discount).HasPrecision(18, 2);
            entity.Property(x => x.OperatorName).HasMaxLength(80);
            entity.Ignore(x => x.Subtotal);
            entity.Ignore(x => x.Total);
            entity.Ignore(x => x.TotalPaid);
            entity.Ignore(x => x.Change);
            entity.HasIndex(x => new { x.StoreId, x.Number }).IsUnique();

            var items = entity.Metadata.FindNavigation(nameof(Sale.Items));
            items?.SetPropertyAccessMode(PropertyAccessMode.Field);
            entity.HasMany(x => x.Items)
                .WithOne()
                .HasForeignKey(x => x.SaleId)
                .OnDelete(DeleteBehavior.Cascade);

            var payments = entity.Metadata.FindNavigation(nameof(Sale.Payments));
            payments?.SetPropertyAccessMode(PropertyAccessMode.Field);
            entity.HasMany(x => x.Payments)
                .WithOne()
                .HasForeignKey(x => x.SaleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SaleItem>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Description).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Quantity).HasPrecision(18, 3);
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Ignore(x => x.Total);
        });

        modelBuilder.Entity<SalePayment>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.HasIndex(x => x.SaleId);
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.CpfCnpj).HasMaxLength(20);
            entity.Property(x => x.Email).HasMaxLength(120);
            entity.Property(x => x.Phone).HasMaxLength(30);
            entity.Property(x => x.CreditLimit).HasPrecision(18, 2);
            entity.Property(x => x.CurrentDebt).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.CompanyId, x.CpfCnpj });
            entity.HasIndex(x => new { x.CompanyId, x.Name });
        });

        modelBuilder.Entity<Supplier>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.CorporateName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.TradeName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Cnpj).HasMaxLength(20).IsRequired();
            entity.Property(x => x.StateRegistration).HasMaxLength(30);
            entity.HasIndex(x => new { x.CompanyId, x.Cnpj }).IsUnique();
        });

        modelBuilder.Entity<SecurityRole>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(255);
            entity.HasIndex(x => new { x.CompanyId, x.Name }).IsUnique();

            var permissions = entity.Metadata.FindNavigation(nameof(SecurityRole.Permissions));
            permissions?.SetPropertyAccessMode(PropertyAccessMode.Field);
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Username).HasMaxLength(60).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(128).IsRequired();
            entity.Property(x => x.PasswordSalt).HasMaxLength(64).IsRequired();
            entity.HasIndex(x => new { x.CompanyId, x.Username }).IsUnique();
        });

        modelBuilder.Entity<CreditInstallment>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OriginalAmount).HasPrecision(18, 2);
            entity.Property(x => x.PaidAmount).HasPrecision(18, 2);
            entity.Property(x => x.InterestAmount).HasPrecision(18, 2);
            entity.Property(x => x.FineAmount).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.CustomerId, x.Status });
            entity.HasIndex(x => new { x.CompanyId, x.DueDate });
        });

        modelBuilder.Entity<FinancialEntry>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Description).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Category).HasMaxLength(80).IsRequired();
            entity.Property(x => x.OriginalAmount).HasPrecision(18, 2);
            entity.Property(x => x.PaidAmount).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.StoreId, x.Type, x.Status, x.DueDate });
        });

        modelBuilder.Entity<Purchase>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SupplierName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Total).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.StoreId, x.PurchasedAt });
        });

        modelBuilder.Entity<CashSession>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OpeningAmount).HasPrecision(18, 2);
            entity.Property(x => x.ClosingAmount).HasPrecision(18, 2);
            entity.Ignore(x => x.IsOpen);
            entity.HasIndex(x => new { x.StoreId, x.TerminalId, x.ClosedAt });
        });

        modelBuilder.Entity<ReceivedSyncEvent>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Payload).IsRequired();
            entity.HasIndex(x => new { x.SourceNodeId, x.SourceEventId }).IsUnique();
            entity.HasIndex(x => new { x.CompanyId, x.StoreId, x.OccurredAt });
        });

        modelBuilder.Entity<OutboxEvent>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventType).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Payload).IsRequired();
            entity.Property(x => x.LastError).HasMaxLength(1000);
            entity.HasIndex(x => new { x.SentAt, x.CreatedAt });
        });
    }
}
