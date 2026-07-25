using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using MapScaner.App.Models;
using MapScaner.App.Services;

namespace MapScaner.App.Views;

public partial class ImportGridDialog : Window
{
    private readonly BitmapSource _image;

    public GridSize Result { get; private set; }
    public int EdgeTrim { get; private set; }

    public ImportGridDialog(BitmapSource image, int defaultRows, int defaultCols)
    {
        InitializeComponent();
        _image = image;
        ImageInfoText.Text =
            $"Image is {image.PixelWidth}x{image.PixelHeight} pixels. Enter the grid size it was stitched from.";
        RowsBox.Text = defaultRows.ToString();
        ColsBox.Text = defaultCols.ToString();
        UpdateTileSizePreview();
    }

    private void Field_TextChanged(object sender, TextChangedEventArgs e) => UpdateTileSizePreview();

    private void Field_Checked(object sender, RoutedEventArgs e) => UpdateContinueEnabled();

    private void UpdateTileSizePreview()
    {
        if (TileSizeText is null || ContinueButton is null) return;

        if (!TryParseGrid(out int rows, out int cols))
        {
            TileSizeText.Text = "Enter positive whole numbers for rows and columns.";
            DiscardRemainderCheckBox.Visibility = Visibility.Collapsed;
            ContinueButton.IsEnabled = false;
            return;
        }

        var (dividesEvenly, tileWidth, tileHeight) = ImportStitchedImageService.ComputeTileSize(_image, rows, cols);
        int trim = ParseTrim();
        string trimmedSizeNote = trim > 0 ? $" (after trim: {tileWidth - 2 * trim}x{tileHeight - 2 * trim})" : "";
        if (dividesEvenly)
        {
            TileSizeText.Text = $"Each tile will be {tileWidth}x{tileHeight} pixels{trimmedSizeNote} — divides evenly.";
            DiscardRemainderCheckBox.Visibility = Visibility.Collapsed;
            DiscardRemainderCheckBox.IsChecked = false;
        }
        else
        {
            TileSizeText.Text = $"{rows}x{cols} does not divide {_image.PixelWidth}x{_image.PixelHeight} evenly " +
                                 $"(tiles would be {tileWidth}x{tileHeight}{trimmedSizeNote}, discarding leftover pixels).";
            DiscardRemainderCheckBox.Visibility = Visibility.Visible;
        }

        UpdateContinueEnabled();
    }

    private int ParseTrim() => int.TryParse(EdgeTrimBox?.Text, out int t) ? Math.Max(0, t) : 0;

    private void UpdateContinueEnabled()
    {
        if (!TryParseGrid(out int rows, out int cols)) { ContinueButton.IsEnabled = false; return; }
        var (dividesEvenly, tileWidth, tileHeight) = ImportStitchedImageService.ComputeTileSize(_image, rows, cols);
        int trim = ParseTrim();
        bool trimFits = tileWidth - 2 * trim > 0 && tileHeight - 2 * trim > 0;
        ContinueButton.IsEnabled = (dividesEvenly || DiscardRemainderCheckBox.IsChecked == true) && trimFits;
    }

    private bool TryParseGrid(out int rows, out int cols)
    {
        bool rowsOk = int.TryParse(RowsBox.Text, out rows) && rows > 0;
        bool colsOk = int.TryParse(ColsBox.Text, out cols) && cols > 0;
        return rowsOk && colsOk;
    }

    private void Continue_Click(object sender, RoutedEventArgs e)
    {
        if (!TryParseGrid(out int rows, out int cols)) return;
        Result = new GridSize(rows, cols);
        EdgeTrim = ParseTrim();
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
