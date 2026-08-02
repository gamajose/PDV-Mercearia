using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using Pdv.Desktop.Services;

namespace Pdv.Desktop;

public partial class BootstrapWindow : Window
{
    private readonly PdvApiClient _client;

    public BootstrapWindow(PdvApiClient client)
    {
        InitializeComponent();
        _client = client;
    }

    public BootstrapResult? Result { get; private set; }

    private async void Finish_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(LegalNameTextBox.Text) ||
            string.IsNullOrWhiteSpace(TradeNameTextBox.Text) ||
            string.IsNullOrWhiteSpace(StoreCodeTextBox.Text) ||
            string.IsNullOrWhiteSpace(StoreNameTextBox.Text))
        {
            MessageBox.Show("Preencha os dados da empresa e da loja.");
            return;
        }

        var selected = (ComboBoxItem)SegmentComboBox.SelectedItem;
        var segment = int.Parse((string)selected.Tag, CultureInfo.InvariantCulture);

        try
        {
            IsEnabled = false;
            Result = await _client.InitializeAsync(new BootstrapPayload(
                LegalNameTextBox.Text.Trim(),
                TradeNameTextBox.Text.Trim(),
                StoreCodeTextBox.Text.Trim(),
                StoreNameTextBox.Text.Trim(),
                segment,
                HubCheckBox.IsChecked == true,
                HubCheckBox.IsChecked == true ? null : Normalize(HubUrlTextBox.Text),
                HubCheckBox.IsChecked == true ? null : Normalize(HubKeyPasswordBox.Password)));

            DialogResult = true;
        }
        catch (Exception exception)
        {
            MessageBox.Show(exception.Message, "Configuração", MessageBoxButton.OK, MessageBoxImage.Error);
            IsEnabled = true;
        }
    }

    private void HubCheckBox_Changed(object sender, RoutedEventArgs e)
    {
        var enabled = HubCheckBox.IsChecked != true;
        HubUrlTextBox.IsEnabled = enabled;
        HubKeyPasswordBox.IsEnabled = enabled;
    }

    private static string? Normalize(string value) =>
        string.IsNullOrWhiteSpace(value) || value.Trim() == "https://"
            ? null
            : value.Trim();

    private void Cancel_Click(object sender, RoutedEventArgs e) => DialogResult = false;
}
