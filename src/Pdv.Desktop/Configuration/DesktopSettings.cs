using System.IO;
using System.Text.Json;

namespace Pdv.Desktop.Configuration;

public sealed record DesktopSettings
{
    public string ServerUrl { get; init; } = "http://localhost:5080";
    public string TerminalApiKey { get; init; } = string.Empty;
    public Guid TerminalId { get; init; } = Guid.NewGuid();
    public string TerminalName { get; init; } = Environment.MachineName;
}

public sealed class DesktopSettingsStore
{
    private readonly string _filePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "PDVGama",
        "Desktop",
        "desktop-settings.json");

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public async Task<DesktopSettings> LoadAsync()
    {
        if (!File.Exists(_filePath))
        {
            return new DesktopSettings();
        }

        await using var stream = File.OpenRead(_filePath);
        return await JsonSerializer.DeserializeAsync<DesktopSettings>(stream, Options)
               ?? new DesktopSettings();
    }

    public async Task SaveAsync(DesktopSettings settings)
    {
        var directory = Path.GetDirectoryName(_filePath)!;
        Directory.CreateDirectory(directory);

        var temp = _filePath + ".tmp";
        await using (var stream = File.Create(temp))
        {
            await JsonSerializer.SerializeAsync(stream, settings, Options);
        }

        File.Move(temp, _filePath, true);
    }
}
