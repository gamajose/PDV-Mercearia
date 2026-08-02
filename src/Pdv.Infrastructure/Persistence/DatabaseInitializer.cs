using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Pdv.Infrastructure.Persistence;

public sealed class DatabaseInitializer(
    IDbContextFactory<PdvDbContext> contextFactory,
    string connectionString)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(new SqliteConnectionStringBuilder(connectionString).DataSource);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await using var context = await contextFactory.CreateDbContextAsync(cancellationToken);
        await context.Database.EnsureCreatedAsync(cancellationToken);
        await EnsureAuthenticationSchemaAsync(context, cancellationToken);
        await context.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", cancellationToken);
        await context.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys=ON;", cancellationToken);
        await context.Database.ExecuteSqlRawAsync("PRAGMA busy_timeout=5000;", cancellationToken);
    }

    private static async Task EnsureAuthenticationSchemaAsync(
        PdvDbContext context,
        CancellationToken cancellationToken)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS "Users" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_Users" PRIMARY KEY,
                "CompanyId" TEXT NOT NULL,
                "StoreId" TEXT NULL,
                "DisplayName" TEXT NOT NULL,
                "Login" TEXT NOT NULL,
                "PasswordHash" TEXT NOT NULL,
                "IsAdministrator" INTEGER NOT NULL,
                "IsActive" INTEGER NOT NULL,
                "LastLoginAt" TEXT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_Users_Companies_CompanyId" FOREIGN KEY ("CompanyId") REFERENCES "Companies" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_Users_Stores_StoreId" FOREIGN KEY ("StoreId") REFERENCES "Stores" ("Id") ON DELETE RESTRICT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_Login" ON "Users" ("Login");
            CREATE INDEX IF NOT EXISTS "IX_Users_CompanyId_IsActive" ON "Users" ("CompanyId", "IsActive");

            CREATE TABLE IF NOT EXISTS "UserPermissions" (
                "Id" TEXT NOT NULL CONSTRAINT "PK_UserPermissions" PRIMARY KEY,
                "UserId" TEXT NOT NULL,
                "Permission" TEXT NOT NULL,
                "CreatedAt" TEXT NOT NULL,
                "UpdatedAt" TEXT NOT NULL,
                CONSTRAINT "FK_UserPermissions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_UserPermissions_UserId_Permission" ON "UserPermissions" ("UserId", "Permission");
            """;

        await context.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }
}
