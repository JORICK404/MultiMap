using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MapScaner.App.Services;

/// <summary>
/// Auto-detects the map square in a full screenshot so calibration doesn't require a
/// precise manual drag. The map is one large SOLID rectangular block of varied color;
/// everything else (hotbar, FPS/speed/clock text, and a "black" background that in
/// practice is rarely pure RGB(0,0,0) — dithering/compression noise nudges it a few
/// levels up) is either small or, crucially, not a fully-filled rectangle. So instead of
/// flood-filling connected non-black pixels (which lets background noise "bridge" into
/// the map and blow the selection up to nearly the whole screen), this finds the largest
/// axis-aligned rectangle whose every single pixel clears the threshold — the classic
/// "maximal rectangle in a binary matrix" scan. Background noise, being sparse, essentially
/// never fills an entire large rectangle, so it can't falsely win against the real map.
/// </summary>
public static class MapBoundsDetector
{
    private const byte BlackThreshold = 20;

    public static Int32Rect? DetectLargestNonBlackRegion(BitmapSource source)
    {
        int width = source.PixelWidth;
        int height = source.PixelHeight;
        if (width == 0 || height == 0) return null;

        var converted = source.Format == PixelFormats.Bgra32
            ? source
            : new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);

        int stride = width * 4;
        var pixels = new byte[stride * height];
        converted.CopyPixels(pixels, stride, 0);

        var isContent = new bool[width * height];
        for (int y = 0; y < height; y++)
        {
            int rowOffset = y * stride;
            int maskRowOffset = y * width;
            for (int x = 0; x < width; x++)
            {
                int i = rowOffset + x * 4;
                isContent[maskRowOffset + x] =
                    pixels[i] > BlackThreshold || pixels[i + 1] > BlackThreshold || pixels[i + 2] > BlackThreshold;
            }
        }

        var heights = new int[width];
        var stackX = new int[width + 1];
        var stackH = new int[width + 1];
        int bestArea = 0;
        Int32Rect bestRect = default;

        for (int y = 0; y < height; y++)
        {
            int rowBase = y * width;
            for (int x = 0; x < width; x++)
            {
                heights[x] = isContent[rowBase + x] ? heights[x] + 1 : 0;
            }

            // Largest rectangle in this row's histogram, via a monotonically increasing stack.
            int top = 0;
            for (int x = 0; x <= width; x++)
            {
                int h = x < width ? heights[x] : 0;
                int startX = x;
                while (top > 0 && stackH[top - 1] >= h)
                {
                    top--;
                    int rectHeight = stackH[top];
                    int rectWidth = x - stackX[top];
                    int area = rectHeight * rectWidth;
                    if (area > bestArea)
                    {
                        bestArea = area;
                        bestRect = new Int32Rect(stackX[top], y - rectHeight + 1, rectWidth, rectHeight);
                    }
                    startX = stackX[top];
                }
                stackX[top] = startX;
                stackH[top] = h;
                top++;
            }
        }

        return bestArea > 0 ? bestRect : null;
    }
}
