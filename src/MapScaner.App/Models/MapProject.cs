using System.Windows.Media.Imaging;

namespace MapScaner.App.Models;

public sealed class MapProject
{
    public MapProjectManifest Manifest { get; }
    public BitmapSource?[,] Tiles { get; private set; }
    public string? FilePath { get; set; }
    public bool IsDirty { get; set; }

    public int Rows => Manifest.Rows;
    public int Cols => Manifest.Cols;

    public MapProject(int rows, int cols)
    {
        Manifest = new MapProjectManifest { Rows = rows, Cols = cols };
        Tiles = new BitmapSource?[rows, cols];
    }

    public MapProject(MapProjectManifest manifest, BitmapSource?[,] tiles)
    {
        Manifest = manifest;
        Tiles = tiles;
    }

    public TileSlotInfo? GetSlotInfo(int row, int col) =>
        Manifest.Tiles.FirstOrDefault(t => t.Row == row && t.Col == col);

    public bool TryValidateTileSize(int width, int height, out string? error)
    {
        if (Manifest.TileWidth is int w && Manifest.TileHeight is int h && (w != width || h != height))
        {
            error = $"This crop is {width}x{height}, but existing tiles are {w}x{h}.";
            return false;
        }
        error = null;
        return true;
    }

    public void SetTile(int row, int col, BitmapSource bitmap, TileSlotInfo info)
    {
        Tiles[row, col] = bitmap;
        Manifest.Tiles.RemoveAll(t => t.Row == row && t.Col == col);
        Manifest.Tiles.Add(info);
        Manifest.TileWidth ??= bitmap.PixelWidth;
        Manifest.TileHeight ??= bitmap.PixelHeight;
        Manifest.ModifiedUtc = DateTime.UtcNow;
        IsDirty = true;
    }

    public void ClearTile(int row, int col)
    {
        Tiles[row, col] = null;
        Manifest.Tiles.RemoveAll(t => t.Row == row && t.Col == col);
        Manifest.ModifiedUtc = DateTime.UtcNow;
        IsDirty = true;
    }

    public List<(int Row, int Col)> GetTilesOutsideBounds(int newRows, int newCols)
    {
        var dropped = new List<(int, int)>();
        for (int r = 0; r < Rows; r++)
        for (int c = 0; c < Cols; c++)
        {
            if (Tiles[r, c] is not null && (r >= newRows || c >= newCols))
                dropped.Add((r, c));
        }
        return dropped;
    }

    public void ResizeTo(int newRows, int newCols)
    {
        var newTiles = new BitmapSource?[newRows, newCols];
        int copyRows = Math.Min(Rows, newRows);
        int copyCols = Math.Min(Cols, newCols);
        for (int r = 0; r < copyRows; r++)
        for (int c = 0; c < copyCols; c++)
            newTiles[r, c] = Tiles[r, c];

        Manifest.Tiles.RemoveAll(t => t.Row >= newRows || t.Col >= newCols);
        Manifest.Rows = newRows;
        Manifest.Cols = newCols;
        Manifest.ModifiedUtc = DateTime.UtcNow;
        Tiles = newTiles;
        IsDirty = true;
    }
}
