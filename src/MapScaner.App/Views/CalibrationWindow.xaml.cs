using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using MapScaner.App.Models;
using MapScaner.App.Services;

namespace MapScaner.App.Views;

public partial class CalibrationWindow : Window
{
    private const double MaxDisplayWidth = 1000;
    private const double MaxDisplayHeight = 650;

    private readonly BitmapSource _source;
    private readonly double _scale;
    private Point? _dragStart;
    private bool _updatingFromCode;
    private Int32Rect _selectedRect;

    public CalibrationProfile? Result { get; private set; }

    public CalibrationWindow(BitmapSource source, Int32Rect? initialRect = null)
    {
        InitializeComponent();
        _source = source;

        _scale = Math.Min(1.0, Math.Min(MaxDisplayWidth / source.PixelWidth, MaxDisplayHeight / source.PixelHeight));

        PreviewImage.Source = source;
        PreviewImage.Width = source.PixelWidth * _scale;
        PreviewImage.Height = source.PixelHeight * _scale;
        SelectionCanvas.Width = PreviewImage.Width;
        SelectionCanvas.Height = PreviewImage.Height;

        var initial = initialRect ?? MapBoundsDetector.DetectLargestNonBlackRegion(source) ?? new Int32Rect(
            (int)(source.PixelWidth * 0.3), (int)(source.PixelHeight * 0.3),
            (int)(source.PixelWidth * 0.4), (int)(source.PixelHeight * 0.4));

        // An existing calibration's rect is already trimmed (it's the final saved crop), so
        // don't trim it again by default — only fresh (auto-detected/placeholder) selections
        // default to trimming the faint blended border off.
        TrimBox.Text = initialRect.HasValue ? "0" : "2";

        SetRectFromSource(initial);
    }

    private void AutoDetect_Click(object sender, RoutedEventArgs e)
    {
        var detected = MapBoundsDetector.DetectLargestNonBlackRegion(_source);
        if (detected is null)
        {
            MessageBox.Show(this,
                "Couldn't find a solid non-black region automatically. Drag a rectangle over the map manually.",
                "MapScaner", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        SetRectFromSource(detected.Value);
    }

    private void SelectionCanvas_MouseDown(object sender, MouseButtonEventArgs e)
    {
        _dragStart = e.GetPosition(SelectionCanvas);
        SelectionCanvas.CaptureMouse();
    }

    private void SelectionCanvas_MouseMove(object sender, MouseEventArgs e)
    {
        if (_dragStart is not Point start || e.LeftButton != MouseButtonState.Pressed) return;

        var current = e.GetPosition(SelectionCanvas);
        var displayRect = new Rect(start, current);
        displayRect.Intersect(new Rect(0, 0, SelectionCanvas.Width, SelectionCanvas.Height));

        var deviceRect = new Int32Rect(
            (int)Math.Round(displayRect.X / _scale),
            (int)Math.Round(displayRect.Y / _scale),
            Math.Max(1, (int)Math.Round(displayRect.Width / _scale)),
            Math.Max(1, (int)Math.Round(displayRect.Height / _scale)));

        SetRectFromSource(deviceRect);
    }

    private void SelectionCanvas_MouseUp(object sender, MouseButtonEventArgs e)
    {
        _dragStart = null;
        SelectionCanvas.ReleaseMouseCapture();
    }

    private void Field_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_updatingFromCode) return;
        if (!int.TryParse(XBox.Text, out int x)) return;
        if (!int.TryParse(YBox.Text, out int y)) return;
        if (!int.TryParse(WBox.Text, out int w)) return;
        if (!int.TryParse(HBox.Text, out int h)) return;
        if (w <= 0 || h <= 0) return;

        SetRectFromSource(new Int32Rect(x, y, w, h));
    }

    private void SetRectFromSource(Int32Rect rect)
    {
        _selectedRect = ImageCropService.Clamp(rect, _source.PixelWidth, _source.PixelHeight);

        _updatingFromCode = true;
        XBox.Text = _selectedRect.X.ToString();
        YBox.Text = _selectedRect.Y.ToString();
        WBox.Text = _selectedRect.Width.ToString();
        HBox.Text = _selectedRect.Height.ToString();
        _updatingFromCode = false;

        Canvas.SetLeft(SelectionRectangle, _selectedRect.X * _scale);
        Canvas.SetTop(SelectionRectangle, _selectedRect.Y * _scale);
        SelectionRectangle.Width = _selectedRect.Width * _scale;
        SelectionRectangle.Height = _selectedRect.Height * _scale;
    }

    private void UseSelection_Click(object sender, RoutedEventArgs e)
    {
        if (_selectedRect.Width <= 0 || _selectedRect.Height <= 0)
        {
            MessageBox.Show(this, "Select a non-empty rectangle first.", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        int trim = int.TryParse(TrimBox.Text, out int t) ? Math.Max(0, t) : 0;
        var finalRect = InsetRect(_selectedRect, trim);
        if (finalRect.Width <= 0 || finalRect.Height <= 0)
        {
            MessageBox.Show(this, "Edge trim is too large for the selected rectangle.", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        Result = new CalibrationProfile
        {
            SourceWidth = _source.PixelWidth,
            SourceHeight = _source.PixelHeight,
            CropRect = finalRect,
            CreatedUtc = DateTime.UtcNow,
        };
        DialogResult = true;
        Close();
    }

    private static Int32Rect InsetRect(Int32Rect rect, int trim)
    {
        return new Int32Rect(
            rect.X + trim,
            rect.Y + trim,
            Math.Max(0, rect.Width - 2 * trim),
            Math.Max(0, rect.Height - 2 * trim));
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
