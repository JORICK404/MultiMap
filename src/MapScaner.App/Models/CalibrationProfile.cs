using System.Windows;

namespace MapScaner.App.Models;

public sealed class CalibrationProfile
{
    public int SourceWidth { get; set; }
    public int SourceHeight { get; set; }

    public int CropX { get; set; }
    public int CropY { get; set; }
    public int CropWidth { get; set; }
    public int CropHeight { get; set; }

    public string? Label { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public Int32Rect CropRect
    {
        get => new(CropX, CropY, CropWidth, CropHeight);
        set
        {
            CropX = value.X;
            CropY = value.Y;
            CropWidth = value.Width;
            CropHeight = value.Height;
        }
    }

    public string ResolutionKey => $"{SourceWidth}x{SourceHeight}";
}
