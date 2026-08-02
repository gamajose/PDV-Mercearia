using System.Windows;
using Pdv.Desktop.Configuration;
using Pdv.Desktop.Services;

namespace Pdv.Desktop;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            var settingsStore = new DesktopSettingsStore();
            var settings = await settingsStore.LoadAsync();
            var client = new PdvApiClient(settings);

            if (!await client.IsHealthyAsync())
            {
                var connectionWindow = new ConnectionWindow(settings);
                if (connectionWindow.ShowDialog() != true)
                {
                    Shutdown();
                    return;
                }

                settings = connectionWindow.Settings;
                await settingsStore.SaveAsync(settings);
                client = new PdvApiClient(settings);

                if (!await client.IsHealthyAsync())
                {
                    MessageBox.Show(
                        "Não foi possível conectar ao PDV Central.",
                        "Conexão",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                    Shutdown();
                    return;
                }
            }

            var bootstrap = await client.GetBootstrapStatusAsync();
            if (bootstrap is { Configured: false })
            {
                if (!settings.ServerUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase) &&
                    !settings.ServerUrl.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase))
                {
                    MessageBox.Show(
                        "A configuração inicial deve ser realizada na máquina do PDV Central.",
                        "Configuração",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information);
                    Shutdown();
                    return;
                }

                var bootstrapWindow = new BootstrapWindow(client);
                if (bootstrapWindow.ShowDialog() != true || bootstrapWindow.Result is null)
                {
                    Shutdown();
                    return;
                }

                settings = settings with { TerminalApiKey = bootstrapWindow.Result.TerminalApiKey };
                await settingsStore.SaveAsync(settings);
                client = new PdvApiClient(settings);
            }
            else if (string.IsNullOrWhiteSpace(settings.TerminalApiKey) &&
                     !string.IsNullOrWhiteSpace(bootstrap?.TerminalApiKey))
            {
                settings = settings with { TerminalApiKey = bootstrap.TerminalApiKey };
                await settingsStore.SaveAsync(settings);
                client = new PdvApiClient(settings);
            }
            else if (string.IsNullOrWhiteSpace(settings.TerminalApiKey))
            {
                var connectionWindow = new ConnectionWindow(settings);
                if (connectionWindow.ShowDialog() != true)
                {
                    Shutdown();
                    return;
                }

                settings = connectionWindow.Settings;
                await settingsStore.SaveAsync(settings);
                client = new PdvApiClient(settings);
            }

            var mainWindow = new MainWindow(client);
            MainWindow = mainWindow;
            mainWindow.Show();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                exception.Message,
                "PDV Gama",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown();
        }
    }
}
