using System.Windows;
using Pdv.Desktop.Configuration;

namespace Pdv.Desktop;

public partial class ConnectionWindow : Window
{
    public ConnectionWindow(DesktopSettings current)
    {
        InitializeComponent();
        Settings = current;
        ServerUrlTextBox.Text = current.ServerUrl;
        ApiKeyPasswordBox.Password = current.TerminalApiKey;
    }

    public DesktopSettings Settings { get; private set; }

    private void Connect_Click(object sender, RoutedEventArgs e)
    {
        if (!Uri.TryCreate(ServerUrlTextBox.Text.Trim(), UriKind.Absolute, out _))
        {
            MessageBox.Show("Informe um endereço válido.");
            return;
        }

        Settings = Settings with
        {
            ServerUrl = ServerUrlTextBox.Text.Trim().TrimEnd('/'),
            TerminalApiKey = ApiKeyPasswordBox.Password.Trim()
        };

        DialogResult = true;
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
