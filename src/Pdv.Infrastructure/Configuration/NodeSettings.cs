using System.Security.Cryptography;
using System.Text.Json;

namespace Pdv.Infrastructure.Configuration;

public sealed record NodeSettings
{
    public Guid NodeId { get; init; } = Guid.NewGuid();
    public Guid? CompanyId { get; init; }
    public Guid? StoreId { get; init; }
    public string StoreCode { get; init; } = string.Empty;
    public bool IsAdministrationHub { get; init; }
    public string? AdministrationHubUrl { get; init; }
    public string? AdministrationHubApiKey { get; init; }
    public string TerminalApiKey { get; init; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
}

public sealed class NodeSettingsStore(string filePath)
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public async Task<NodeSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(filePath))
        {
            var created = new NodeSettings();
            await SaveAsync(created, cancellationToken);
            return created;
        }

        await using var stream = File.OpenRead(filePath);
        return await JsonSerializer.DeserializeAsync<NodeSettings>(
                   stream,
                   SerializerOptions,
                   cancellationToken)
               ?? throw new InvalidOperationException("Configuração do nó inválida.");
    }

    public async Task SaveAsync(NodeSettings settings, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempFile = filePath + ".tmp";
        await using (var stream = File.Create(tempFile))
        {
            await JsonSerializer.SerializeAsync(stream, settings, SerializerOptions, cancellationToken);
        }

        File.Move(tempFile, filePath, true);
    }
}
