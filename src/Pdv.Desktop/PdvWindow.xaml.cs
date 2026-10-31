using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using Pdv.Desktop.Services;
using Pdv.Hardware.Barcodes;
using Pdv.Hardware.Scales;

namespace Pdv.Desktop;

public partial class PdvWindow : Window, IDisposable
{
    private readonly PdvApiClient _client;
    private readonly IScaleDriver _scaleDriver;
    private readonly ObservableCollection<SaleItemViewModel> _items = [];
    private List<ProductDto> _cachedProducts = [];
    private decimal _discount;
    private decimal _currentScaleWeight = 0m;
    private readonly DispatcherTimer _clockTimer;
    private bool _disposed;

    public PdvWindow(PdvApiClient client, IScaleDriver? scaleDriver = null)
    {
        InitializeComponent();
        _client = client;
        _scaleDriver = scaleDriver ?? ScaleFactory.Create(new ScaleConfiguration(ScaleProtocol.Mock));

        ItemsGrid.ItemsSource = _items;

        _clockTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clockTimer.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        _clockTimer.Start();

        Loaded += PdvWindow_Loaded;
        Closed += (_, _) => Dispose();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _clockTimer.Stop();
        _scaleDriver.Dispose();
        GC.SuppressFinalize(this);
    }

    private async void PdvWindow_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var profile = await _client.GetStoreProfileAsync();
            if (profile != null)
            {
                StoreInfoText.Text = $"LOJA: {profile.StoreName} ({profile.Code}) | CAIXA 01 | OPERADOR: Caixa";
            }

            var prods = await _client.GetProductsAsync();
            if (prods != null)
            {
                _cachedProducts = prods;
            }

            await _scaleDriver.ConnectAsync();
            _scaleDriver.StartContinuousReading(reading =>
            {
                Dispatcher.Invoke(() =>
                {
                    _currentScaleWeight = reading.Weight;
                    ScaleStatusText.Text = $"BALANÇA: Conectada ({reading.Weight:F3} kg)";
                });
            });

            BarcodeInput.Focus();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Aviso de inicialização do caixa: {ex.Message}", "PDV", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void BarcodeInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            ProcessBarcode(BarcodeInput.Text);
            BarcodeInput.Clear();
        }
    }

    private void AddItem_Click(object sender, RoutedEventArgs e)
    {
        ProcessBarcode(BarcodeInput.Text);
        BarcodeInput.Clear();
    }

    private void ProcessBarcode(string rawInput)
    {
        if (string.IsNullOrWhiteSpace(rawInput)) return;

        var decoded = BarcodeScannerDecoder.Parse(rawInput);

        // 1. Tenta achar produto por código de barras, SKU ou PLU
        var product = _cachedProducts.FirstOrDefault(p =>
            string.Equals(p.Barcode, decoded.CleanCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p.Sku, decoded.SkuOrPlu, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p.PluCode, decoded.SkuOrPlu, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p.Sku, decoded.CleanCode, StringComparison.OrdinalIgnoreCase));

        if (product == null)
        {
            MessageBox.Show($"Produto não cadastrado para o código: {rawInput}", "PDV", MessageBoxButton.OK, MessageBoxImage.Warning);
            BarcodeInput.Focus();
            return;
        }

        decimal quantity = 1.0m;
        decimal unitPrice = product.SalePrice;

        // Se for etiqueta gerada por balança de supermercado (flag 2)
        if (decoded.IsScaleBarcode)
        {
            if (decoded.EmbeddedPrice.HasValue && unitPrice > 0)
            {
                // Modo Preço: Calcula o peso/quantidade baseado no valor cobrado e preço por kg
                quantity = decimal.Round(decoded.EmbeddedPrice.Value / unitPrice, 3, MidpointRounding.AwayFromZero);
            }
            else if (decoded.EmbeddedWeightKg.HasValue)
            {
                quantity = decoded.EmbeddedWeightKg.Value;
            }
        }
        else if (product.IsWeighable && _currentScaleWeight > 0)
        {
            // Se for produto pesável e a balança tiver peso sobre o prato
            quantity = _currentScaleWeight;
        }

        var itemVm = new SaleItemViewModel(
            ItemIndex: _items.Count + 1,
            ProductId: product.Id,
            Sku: product.Sku,
            Name: product.Name,
            Quantity: quantity,
            UnitPrice: unitPrice
        );

        _items.Add(itemVm);

        LastItemNameText.Text = product.Name.ToUpperInvariant();
        LastItemQtyText.Text = $"{quantity:N3} UN";
        LastItemPriceText.Text = unitPrice.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));

        UpdateTotals();
        ItemsGrid.ScrollIntoView(itemVm);
        BarcodeInput.Focus();
    }

    private void UpdateTotals()
    {
        var subtotal = _items.Sum(i => i.Total);
        var total = Math.Max(0m, subtotal - _discount);

        SubtotalText.Text = subtotal.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));
        DiscountText.Text = _discount.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));
        TotalText.Text = total.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.F2:
                F2_Click(this, new RoutedEventArgs());
                break;
            case Key.F3:
                F3_Click(this, new RoutedEventArgs());
                break;
            case Key.F4:
                F4_Click(this, new RoutedEventArgs());
                break;
            case Key.F5:
                F5_Click(this, new RoutedEventArgs());
                break;
            case Key.F6:
                F6_Click(this, new RoutedEventArgs());
                break;
            case Key.F10:
                F10_Click(this, new RoutedEventArgs());
                break;
            case Key.Escape:
                Esc_Click(this, new RoutedEventArgs());
                break;
        }
    }

    private void F2_Click(object sender, RoutedEventArgs e)
    {
        var searchWindow = new Window
        {
            Title = "Consulta Rápida de Produtos [F2]",
            Width = 600,
            Height = 400,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = this
        };
        // Exibe lista rápida
        searchWindow.ShowDialog();
        BarcodeInput.Focus();
    }

    private async void F3_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var reading = await _scaleDriver.ReadWeightAsync();
            _currentScaleWeight = reading.Weight;
            ScaleStatusText.Text = $"BALANÇA: Capturado ({reading.Weight:F3} kg)";
            MessageBox.Show($"Peso capturado da balança: {reading.Weight:F3} kg", "Balança de Checkout", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Falha na leitura da balança: {ex.Message}", "Balança", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        BarcodeInput.Focus();
    }

    private void F4_Click(object sender, RoutedEventArgs e)
    {
        // Aplicação de desconto simples
        _discount = 5.00m;
        UpdateTotals();
        BarcodeInput.Focus();
    }

    private void F5_Click(object sender, RoutedEventArgs e)
    {
        if (_items.Count > 0)
        {
            _items.RemoveAt(_items.Count - 1);
            UpdateTotals();
        }
        BarcodeInput.Focus();
    }

    private void F6_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Deseja realmente cancelar esta venda?", "Cancelar Venda", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
        {
            _items.Clear();
            _discount = 0m;
            LastItemNameText.Text = "VENDA CANCELADA";
            UpdateTotals();
        }
        BarcodeInput.Focus();
    }

    private async void F10_Click(object sender, RoutedEventArgs e)
    {
        if (_items.Count == 0)
        {
            MessageBox.Show("Nenhum item adicionado à venda.", "PDV", MessageBoxButton.OK, MessageBoxImage.Warning);
            BarcodeInput.Focus();
            return;
        }

        try
        {
            var payload = new CompleteSalePayload(
                TerminalId: Guid.NewGuid(),
                Discount: _discount,
                Items: _items.Select(i => new CompleteSaleItemPayload(i.ProductId, i.Quantity)).ToList()
            );

            var result = await _client.CompleteSaleAsync(payload);

            MessageBox.Show($"Venda #{result.Number:D6} finalizada com sucesso!\nTotal: {result.Total:C2}\nTroco: {result.Change:C2}", "Venda Concluída", MessageBoxButton.OK, MessageBoxImage.Information);

            _items.Clear();
            _discount = 0m;
            LastItemNameText.Text = "CAIXA LIVRE";
            UpdateTotals();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Erro ao concluir venda: {ex.Message}", "Erro", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        BarcodeInput.Focus();
    }

    private void Esc_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}

public sealed record SaleItemViewModel(
    int ItemIndex,
    Guid ProductId,
    string Sku,
    string Name,
    decimal Quantity,
    decimal UnitPrice
)
{
    public decimal Total => decimal.Round(Quantity * UnitPrice, 2, MidpointRounding.AwayFromZero);
}
