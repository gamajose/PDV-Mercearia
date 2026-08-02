using System.Windows;

namespace Pdv.Desktop.Updates;

public partial class UpdateWindow : Window
{
    private readonly ReleaseUpdateService _updateService;
    private readonly AvailableUpdate _update;
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private string? _installerPath;

    internal UpdateWindow(ReleaseUpdateService updateService, AvailableUpdate update)
    {
        InitializeComponent();
        _updateService = updateService;
        _update = update;
        VersionText.Text = $"Versão {update.CurrentVersion} → {update.LatestVersion} · {GetInstallationLabel(update.InstallationKind)}";
        Loaded += Window_Loaded;
        Closed += Window_Closed;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        var progress = new Progress<double>(value =>
        {
            DownloadProgress.Value = value;
            ProgressText.Text = $"{value:0}%";
        });

        try
        {
            StatusText.Text = "Baixando a atualização segura...";
            _installerPath = await _updateService.DownloadAsync(
                _update,
                progress,
                _cancellationTokenSource.Token);

            StatusText.Text = "Download concluído. Pronto para atualizar.";
            ProgressText.Text = "100%";
            InstallButton.IsEnabled = true;
            InstallButton.Focus();
        }
        catch (OperationCanceledException) when (_cancellationTokenSource.IsCancellationRequested)
        {
            StatusText.Text = "Download cancelado.";
        }
        catch (HttpRequestException exception)
        {
            ShowDownloadError(exception.Message);
        }
        catch (IOException exception)
        {
            ShowDownloadError(exception.Message);
        }
        catch (UnauthorizedAccessException exception)
        {
            ShowDownloadError(exception.Message);
        }
    }

    private void Install_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_installerPath))
        {
            return;
        }

        try
        {
            ReleaseUpdateService.StartInstaller(_installerPath);
            Application.Current.Shutdown();
        }
        catch (System.ComponentModel.Win32Exception exception)
        {
            MessageBox.Show(
                exception.Message,
                "Atualização",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void Later_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void Window_Closed(object? sender, EventArgs e)
    {
        _cancellationTokenSource.Cancel();
        _cancellationTokenSource.Dispose();
    }

    private void ShowDownloadError(string message)
    {
        StatusText.Text = "Não foi possível baixar a atualização.";
        ProgressText.Text = "Erro";
        LaterButton.Content = "Fechar";
        MessageBox.Show(
            message,
            "Atualização",
            MessageBoxButton.OK,
            MessageBoxImage.Warning);
    }

    private static string GetInstallationLabel(InstallationKind installationKind) =>
        installationKind == InstallationKind.Central ? "PDV Central" : "PDV Terminal";
}
