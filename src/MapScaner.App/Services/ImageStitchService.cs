using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MapScaner.App.Services;

/// <summary>
/// Combines tiles into one composite via raw pixel blits (WriteableBitmap.WritePixels),
/// never a scaling draw operation, so Minecraft's blocky pixel art stays crisp.
/// </summary>
public static class ImageStitchService
{
    public static BitmapSource Stitch(BitmapSource?[,] tiles, int rows, int cols, int tileWidth, int tileHeight)
    {
        var target = new WriteableBitmap(cols * tileWidth, rows * tileHeight, 96, 96, PixelFormats.Bgra32, null);

        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                var tile = tiles[r, c];
                if (tile is null) continue;

                var source = tile.Format == PixelFormats.Bgra32
                    ? tile
                    : new FormatConvertedBitmap(tile, PixelFormats.Bgra32, null, 0);

                int stride = tileWidth * 4;
                var buffer = new byte[stride * tileHeight];
                source.CopyPixels(buffer, stride, 0);
                target.WritePixels(new Int32Rect(c * tileWidth, r * tileHeight, tileWidth, tileHeight), buffer, stride, 0);
            }
        }

        target.Freeze();
        return target;
    }

    public static void SavePng(BitmapSource image, string path)
    {
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(image));

        var tempPath = path + ".tmp";
        using (var fs = new FileStream(tempPath, FileMode.Create))
        {
            encoder.Save(fs);
        }
        File.Move(tempPath, path, overwrite: true);
    }
}
