using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json.Serialization;

namespace Pdv.Desktop.Updates;

internal sealed class ReleaseUpdateService : IDisposable
{
    private const string LatestReleaseEndpoint = "https://api.github.com/repos/gamajose/PDV-Mercearia/releases/latest";
    private readonly HttpClient _httpClient;

    public ReleaseUpdateService()
    {
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(3)
        };
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("PDVGama-Updater/1.0");
        _httpClient.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        _httpClient.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2026-03-10");
    }

    public async Task<AvailableUpdate?> GetAvailableUpdateAsync(CancellationToken cancellationToken)
    {
        var release = await _httpClient.GetFromJsonAsync<GitHubRelease>(LatestReleaseEndpoint, cancellationToken);
        if (release is null || !SemanticVersion.TryParse(release.TagName, out var latestVersion))
        {
            return null;
        }

        var currentVersion = GetCurrentVersion();
        if (latestVersion.CompareTo(currentVersion) <= 0)
        {
            return null;
        }

        var installationKind = GetInstallationKind();
        var expectedPrefix = installationKind == InstallationKind.Central
            ? "PDV-Gama-Central-"
            : "PDV-Gama-Terminal-";

        var asset = release.Assets.FirstOrDefault(candidate =>
            candidate.Name.StartsWith(expectedPrefix, StringComparison.OrdinalIgnoreCase) &&
            candidate.Name.EndsWith("-win-x64.exe", StringComparison.OrdinalIgnoreCase));

        return asset is null
            ? null
            : new AvailableUpdate(
                currentVersion.ToString(),
                latestVersion.ToString(),
                installationKind,
                asset.Name,
                asset.BrowserDownloadUrl,
                asset.Digest,
                release.HtmlUrl,
                release.Body ?? string.Empty);
    }

    public async Task<string> DownloadAsync(
        AvailableUpdate update,
        IProgress<double> progress,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(update);
        ArgumentNullException.ThrowIfNull(progress);

        var updateDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PDVGama",
            "Updates",
            update.LatestVersion);
        Directory.CreateDirectory(updateDirectory);

        var destinationPath = Path.Combine(updateDirectory, update.AssetName);
        var temporaryPath = destinationPath + ".download";

        using var response = await _httpClient.GetAsync(
            update.DownloadUrl,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        response.EnsureSuccessStatusCode();

        var contentLength = response.Content.Headers.ContentLength;
        await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
        await using (var destination = new FileStream(
            temporaryPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            useAsync: true))
        {
            var buffer = new byte[81920];
            long totalRead = 0;
            int read;
            while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
            {
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                totalRead += read;
                if (contentLength is > 0)
                {
                    progress.Report(totalRead * 100d / contentLength.Value);
                }
            }
        }

        await ValidateDigestAsync(temporaryPath, update.Digest, cancellationToken);
        File.Move(temporaryPath, destinationPath, overwrite: true);
        progress.Report(100d);
        return destinationPath;
    }

    public static void StartInstaller(string installerPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(installerPath);
        if (!File.Exists(installerPath))
        {
            throw new FileNotFoundException("O instalador da atualização não foi encontrado.", installerPath);
        }

        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PDVGama",
            "Updates",
            "update-install.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);

        var startInfo = new ProcessStartInfo
        {
            FileName = installerPath,
            Arguments = $"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /LOG=\"{logPath}\"",
            WorkingDirectory = Path.GetDirectoryName(installerPath)!,
            UseShellExecute = true,
            Verb = "runas"
        };

        _ = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Não foi possível iniciar o instalador da atualização.");
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }

    private static InstallationKind GetInstallationKind()
    {
        var storeNodeDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "StoreNode"));
        return Directory.Exists(storeNodeDirectory)
            ? InstallationKind.Central
            : InstallationKind.Terminal;
    }

    private static SemanticVersion GetCurrentVersion()
    {
        var assemblyVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
        return new SemanticVersion(
            assemblyVersion.Major,
            assemblyVersion.Minor,
            Math.Max(assemblyVersion.Build, 0));
    }

    private static async Task ValidateDigestAsync(
        string filePath,
        string? digest,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(digest) ||
            !digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        await using var stream = File.OpenRead(filePath);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        var actual = Convert.ToHexStringLower(hash);
        var expected = digest["sha256:".Length..].Trim();

        if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(filePath);
            throw new InvalidDataException("A verificação de integridade da atualização falhou.");
        }
    }
}

internal sealed record AvailableUpdate(
    string CurrentVersion,
    string LatestVersion,
    InstallationKind InstallationKind,
    string AssetName,
    string DownloadUrl,
    string? Digest,
    string ReleaseUrl,
    string ReleaseNotes);

internal enum InstallationKind
{
    Central,
    Terminal
}

internal readonly record struct SemanticVersion(int Major, int Minor, int Patch) : IComparable<SemanticVersion>
{
    public static bool TryParse(string? value, out SemanticVersion version)
    {
        version = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var cleanValue = value.Trim().TrimStart('v', 'V');
        var parts = cleanValue.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 3 ||
            !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var major) ||
            !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var minor) ||
            !int.TryParse(parts[2].Split('-', '+')[0], NumberStyles.None, CultureInfo.InvariantCulture, out var patch))
        {
            return false;
        }

        version = new SemanticVersion(major, minor, patch);
        return true;
    }

    public int CompareTo(SemanticVersion other)
    {
        var majorComparison = Major.CompareTo(other.Major);
        if (majorComparison != 0)
        {
            return majorComparison;
        }

        var minorComparison = Minor.CompareTo(other.Minor);
        return minorComparison != 0 ? minorComparison : Patch.CompareTo(other.Patch);
    }

    public override string ToString() => FormattableString.Invariant($"{Major}.{Minor}.{Patch}");
}

internal sealed record GitHubRelease(
    [property: JsonPropertyName("tag_name")] string TagName,
    [property: JsonPropertyName("html_url")] string HtmlUrl,
    [property: JsonPropertyName("body")] string? Body,
    [property: JsonPropertyName("assets")] IReadOnlyList<GitHubReleaseAsset> Assets);

internal sealed record GitHubReleaseAsset(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("browser_download_url")] string BrowserDownloadUrl,
    [property: JsonPropertyName("digest")] string? Digest);
