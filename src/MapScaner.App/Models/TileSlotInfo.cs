namespace MapScaner.App.Models;

public sealed class TileSlotInfo
{
    public int Row { get; set; }
    public int Col { get; set; }
    public bool IsFilled { get; set; }
    public int PixelWidth { get; set; }
    public int PixelHeight { get; set; }
    public string? SourceDescription { get; set; }
    public DateTime CapturedUtc { get; set; }
}
