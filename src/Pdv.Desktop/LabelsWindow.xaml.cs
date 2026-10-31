using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using Pdv.Desktop.Services;

namespace Pdv.Desktop;

public partial class LabelsWindow : Window
{
    private readonly PdvApiClient _client;
    private List<ProductDto> _allProducts = [];

    public LabelsWindow(PdvApiClient client)
    {
        InitializeComponent();
        _client = client;
        Loaded += LabelsWindow_Loaded;
    }

    private async void LabelsWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await LoadProductsAsync();
    }

    private async Task LoadProductsAsync()
    {
        try
        {
            StatusLabel.Text = "Carregando catálogo de produtos...";
            var prods = await _client.GetProductsAsync();
            if (prods != null)
            {
                _allProducts = prods;
                ApplyFilter();
                StatusLabel.Text = $"Catálogo carregado: {_allProducts.Count} produtos cadastrados.";
            }
        }
        catch (Exception ex)
        {
            StatusLabel.Text = $"Erro ao carregar: {ex.Message}";
        }
    }

    private void ApplyFilter()
    {
        var term = SearchBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(term))
        {
            ProductsGrid.ItemsSource = _allProducts;
        }
        else
        {
            ProductsGrid.ItemsSource = _allProducts.Where(p =>
                p.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                p.Sku.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (p.Barcode != null && p.Barcode.Contains(term, StringComparison.OrdinalIgnoreCase))
            ).ToList();
        }
    }

    private void SearchBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        ApplyFilter();
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e)
    {
        await LoadProductsAsync();
    }

    private async void Print_Click(object sender, RoutedEventArgs e)
    {
        var selected = ProductsGrid.SelectedItems.Cast<ProductDto>().ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show("Selecione ao menos um produto na tabela.", "Etiquetas", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (!int.TryParse(CopiesInput.Text, CultureInfo.InvariantCulture, out var copies) || copies <= 0)
        {
            copies = 1;
        }

        var layout = LayoutCombo.SelectedIndex switch
        {
            0 => 1, // GondolaSupermarket
            1 => 3, // ApparelSizeColor
            _ => 2  // ProductBarcode
        };

        var language = LanguageCombo.SelectedIndex switch
        {
            1 => 2, // Epl
            _ => 1  // Zpl
        };

        var items = selected.Select(p => new LabelItemDto(
            Sku: p.Sku,
            Barcode: p.Barcode ?? p.Sku,
            Description: p.Name,
            SalePrice: p.SalePrice,
            Unit: "UN",
            Size: p.Size,
            Color: p.Color
        )).ToList();

        var payload = new PrintLabelsPayload(
            PrinterNameOrAddress: PrinterTargetInput.Text.Trim(),
            Language: language,
            Layout: layout,
            Items: items,
            CopiesPerItem: copies
        );

        StatusLabel.Text = $"Enviando {items.Count} modelo(s) de etiqueta para {payload.PrinterNameOrAddress}...";

        var success = await _client.PrintLabelsAsync(payload);
        if (success)
        {
            StatusLabel.Text = "Etiquetas enviadas para a impressora com sucesso!";
            MessageBox.Show("Etiquetas enviadas para impressão com sucesso!", "Etiquetas", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        else
        {
            StatusLabel.Text = "Falha ao enviar etiquetas para a impressora. Verifique o nome/IP.";
            MessageBox.Show("Não foi possível imprimir. Verifique se o nome da impressora ou IP está correto.", "Aviso", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }
}
