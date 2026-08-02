using Microsoft.EntityFrameworkCore;
using Pdv.Domain.Entities;

namespace Pdv.Infrastructure.Persistence;

public sealed class PdvDbContext(DbContextOptions<PdvDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<InventoryBalance> InventoryBalances => Set<InventoryBalance>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<Purchase> Purchases => Set<Purchase>();
    public DbSet<CashSession> CashSessions => Set<CashSession>();
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

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DisplayName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Login).HasMaxLength(80).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(600).IsRequired();
            entity.HasIndex(x => x.Login).IsUnique();
            entity.HasIndex(x => new { x.CompanyId, x.IsActive });
        });

        modelBuilder.Entity<UserPermission>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Permission).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => new { x.UserId, x.Permission }).IsUnique();
            entity.HasOne<AppUser>()
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Sku).HasMaxLength(60).IsRequired();
            entity.Property(x => x.Barcode).HasMaxLength(60);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.SalePrice).HasPrecision(18, 2);
            entity.Property(x => x.CostPrice).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.CompanyId, x.Sku }).IsUnique();
            entity.HasIndex(x => new { x.CompanyId, x.Barcode });
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
            entity.Ignore(x => x.Total);
            entity.HasIndex(x => new { x.StoreId, x.Number }).IsUnique();

            var items = entity.Metadata.FindNavigation(nameof(Sale.Items));
            items?.SetPropertyAccessMode(PropertyAccessMode.Field);
            entity.HasMany(x => x.Items)
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
