namespace MapScaner.App.Models;

public sealed class MapProjectManifest
{
    public int FormatVersion { get; set; } = 1;
    public int Rows { get; set; }
    public int Cols { get; set; }
    public int? TileWidth { get; set; }
    public int? TileHeight { get; set; }
    public List<TileSlotInfo> Tiles { get; set; } = new();
    public List<CalibrationProfile> CalibrationsUsed { get; set; } = new();
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedUtc { get; set; } = DateTime.UtcNow;
}
