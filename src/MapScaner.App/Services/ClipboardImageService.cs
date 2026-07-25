using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media.Imaging;

namespace MapScaner.App.Services;

public sealed record ClipboardImageResult(BitmapSource Image, string SourceFormat);

/// <summary>
/// Reads images from the clipboard preferring the lossless "PNG" clipboard format
/// (placed there by Win+Shift+S / Snipping Tool) over the lossy CF_DIB fallback that
/// System.Windows.Clipboard.GetImage() uses, since DIB can drop alpha or get recompressed.
/// </summary>
public static class ClipboardImageService
{
    private static readonly string[] PngFormats = { "PNG", "image/png" };

    public static ClipboardImageResult? GetImageFromClipboard()
    {
        IDataObject? data;
        try
        {
            data = Clipboard.GetDataObject();
        }
        catch (COMException)
        {
            return null;
        }

        if (data is null) return null;

        foreach (var format in PngFormats)
        {
            if (!data.GetDataPresent(format)) continue;
            if (data.GetData(format) is not MemoryStream ms) continue;

            ms.Position = 0;
            var decoder = new PngBitmapDecoder(ms, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            if (decoder.Frames.Count == 0) continue;

            var frame = decoder.Frames[0];
            frame.Freeze();
            return new ClipboardImageResult(frame, $"PNG clipboard format ({format})");
        }

        if (data.GetDataPresent(DataFormats.Bitmap))
        {
            var image = Clipboard.GetImage();
            if (image is not null)
            {
                image.Freeze();
                return new ClipboardImageResult(image, "DIB fallback (no lossless PNG format found)");
            }
        }

        return null;
    }
}
