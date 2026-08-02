using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Shapes;
using Pdv.Desktop.Services;

namespace Pdv.Desktop;

public partial class MainWindow : Window
{
    private readonly PdvApiClient _client;
    private DashboardSnapshot? _snapshot;

    public MainWindow(PdvApiClient client)
    {
        InitializeComponent();
        _client = client;
        Loaded += MainWindow_Loaded;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshAsync();
    }

    private async Task RefreshAsync()
    {
        try
        {
            SetStatus("Atualizando", "#F59E0B");

            var profileTask = _client.GetStoreProfileAsync();
            var dashboardTask = _client.GetDashboardAsync();
            await Task.WhenAll(profileTask, dashboardTask);

            var profile = await profileTask;
            _snapshot = await dashboardTask;

            StoreText.Text = profile is null
                ? "Loja não identificada"
                : $"{profile.TradeName}  •  {profile.StoreName}";

            if (_snapshot is not null)
            {
                SalesTodayText.Text = _snapshot.SalesToday.ToString("C", CultureInfo.GetCultureInfo("pt-BR"));
                TransactionsText.Text = _snapshot.TransactionsToday.ToString(CultureInfo.InvariantCulture);
                LowStockText.Text = _snapshot.LowStock.ToString(CultureInfo.InvariantCulture);
                PendingSyncText.Text = _snapshot.PendingSync.ToString(CultureInfo.InvariantCulture);
                DrawChart();
            }

            SetStatus("Conectado", "#22C55E");
        }
        catch
        {
            SetStatus("Desconectado", "#EF4444");
        }
    }

    private void DrawChart()
    {
        ChartCanvas.Children.Clear();
        if (_snapshot is null || ChartCanvas.ActualWidth <= 0)
        {
            return;
        }

        var points = Enumerable.Range(8, 15)
            .Select(hour => new
            {
                Hour = hour,
                Total = _snapshot.Hourly.FirstOrDefault(x => x.Hour == hour)?.Total ?? 0
            })
            .ToArray();

        var max = Math.Max(points.Max(x => x.Total), 1);
        var width = Math.Max(ChartCanvas.ActualWidth - 20, 200);
        var height = Math.Max(ChartCanvas.ActualHeight - 34, 160);
        var slot = width / points.Length;
        var barWidth = Math.Max(slot * 0.55, 8);

        for (var index = 0; index < points.Length; index++)
        {
            var point = points[index];
            var barHeight = (double)(point.Total / max) * (height - 18);
            var bar = new Rectangle
            {
                Width = barWidth,
                Height = Math.Max(barHeight, 3),
                RadiusX = 5,
                RadiusY = 5,
                Fill = new SolidColorBrush(Color.FromRgb(37, 99, 235)),
                Opacity = point.Total > 0 ? 0.92 : 0.18
            };

            Canvas.SetLeft(bar, 10 + (index * slot) + ((slot - barWidth) / 2));
            Canvas.SetTop(bar, height - bar.Height);
            ChartCanvas.Children.Add(bar);

            if (index % 2 == 0)
            {
                var label = new System.Windows.Controls.TextBlock
                {
                    Text = $"{point.Hour:00}h",
                    Foreground = new SolidColorBrush(Color.FromRgb(116, 128, 149)),
                    FontSize = 10
                };

                Canvas.SetLeft(label, 10 + (index * slot) + 2);
                Canvas.SetTop(label, height + 8);
                ChartCanvas.Children.Add(label);
            }
        }
    }

    private void ShowPlaceholder(string title, string icon)
    {
        DashboardPanel.Visibility = Visibility.Collapsed;
        PlaceholderPanel.Visibility = Visibility.Visible;
        SectionTitleText.Text = title;
        PlaceholderTitle.Text = title;
        PlaceholderIcon.Text = icon;
    }

    private void Dashboard_Click(object sender, RoutedEventArgs e)
    {
        SectionTitleText.Text = "Visão geral";
        PlaceholderPanel.Visibility = Visibility.Collapsed;
        DashboardPanel.Visibility = Visibility.Visible;
        _ = RefreshAsync();
    }

    private void Sales_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Nova venda", "\uE719");
    private void Products_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Produtos", "\uE7C3");
    private void Inventory_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Estoque", "\uE7B8");
    private void Purchases_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Compras", "\uE8CB");
    private void Reports_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Relatórios", "\uE9D2");
    private void Settings_Click(object sender, RoutedEventArgs e) => ShowPlaceholder("Configurações", "\uE713");

    private void ChartCanvas_SizeChanged(object sender, SizeChangedEventArgs e) => DrawChart();

    private void SetStatus(string text, string color)
    {
        StatusText.Text = text;
        StatusEllipse.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
    }
}
