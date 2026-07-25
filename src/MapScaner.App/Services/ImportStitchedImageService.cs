using System.Windows;
using System.Windows.Media.Imaging;
using MapScaner.App.Models;

namespace MapScaner.App.Services;

/// <summary>
/// Slices an already-finished flat composite image into a grid of tiles so it can be
/// reopened as an editable project (e.g. to swap out just one tile) even without the
/// original .mapproj that produced it.
/// </summary>
public static class ImportStitchedImageService
{
    public static (bool DividesEvenly, int TileWidth, int TileHeight) ComputeTileSize(
        BitmapSource image, int rows, int cols)
    {
        int tileWidth = image.PixelWidth / cols;
        int tileHeight = image.PixelHeight / rows;
        bool dividesEvenly = tileWidth * cols == image.PixelWidth && tileHeight * rows == image.PixelHeight;
        return (dividesEvenly, tileWidth, tileHeight);
    }

    /// <param name="edgeTrim">
    /// Pixels to shave off each side of every tile before re-stitching. Latite's map HUD
    /// scales the 128x128 map texture up to screen size, which can leave a faint blended
    /// border (a pixel or two) where the map meets the black background — that border then
    /// shows up as a thin seam at every internal tile boundary once stitched. Trimming it
    /// off here removes the seam without needing the original per-screenshot captures.
    /// </param>
    public static MapProject SliceIntoProject(BitmapSource image, int rows, int cols, string sourceDescription, int edgeTrim = 0)
    {
        var (_, tileWidth, tileHeight) = ComputeTileSize(image, rows, cols);
        var project = new MapProject(rows, cols);

        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                int x = c * tileWidth + edgeTrim;
                int y = r * tileHeight + edgeTrim;
                int w = Math.Max(1, tileWidth - 2 * edgeTrim);
                int h = Math.Max(1, tileHeight - 2 * edgeTrim);
                var rect = new Int32Rect(x, y, w, h);
                var cropped = ImageCropService.CropToIndependentBitmap(image, rect);

                var info = new TileSlotInfo
                {
                    Row = r,
                    Col = c,
                    IsFilled = true,
                    PixelWidth = cropped.PixelWidth,
                    PixelHeight = cropped.PixelHeight,
                    SourceDescription = sourceDescription,
                    CapturedUtc = DateTime.UtcNow,
                };
                project.SetTile(r, c, cropped, info);
            }
        }

        project.IsDirty = true;
        return project;
    }
}
