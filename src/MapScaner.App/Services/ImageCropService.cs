using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MapScaner.App.Services;

/// <summary>
/// Crops without resampling (CroppedBitmap is a view, not a resize) and materializes
/// the result into its own independent WriteableBitmap so the (large) source screenshot
/// can be released and every tile carries only the pixels it needs.
/// </summary>
public static class ImageCropService
{
    public static BitmapSource CropToIndependentBitmap(BitmapSource source, Int32Rect rect)
    {
        var clamped = Clamp(rect, source.PixelWidth, source.PixelHeight);
        var cropped = new CroppedBitmap(source, clamped);
        var normalized = new FormatConvertedBitmap(cropped, PixelFormats.Bgra32, null, 0);

        var wb = new WriteableBitmap(normalized);
        wb.Freeze();
        return wb;
    }

    public static Int32Rect Clamp(Int32Rect rect, int sourceWidth, int sourceHeight)
    {
        int x = Math.Clamp(rect.X, 0, Math.Max(0, sourceWidth - 1));
        int y = Math.Clamp(rect.Y, 0, Math.Max(0, sourceHeight - 1));
        int width = Math.Clamp(rect.Width, 1, sourceWidth - x);
        int height = Math.Clamp(rect.Height, 1, sourceHeight - y);
        return new Int32Rect(x, y, width, height);
    }
}
