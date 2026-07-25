using System.IO;
using System.IO.Compression;
using System.Text.Json;
using System.Windows.Media.Imaging;
using MapScaner.App.Models;

namespace MapScaner.App.Services;

/// <summary>
/// Reads/writes ".mapproj" project files: a ZIP container with a JSON manifest and one
/// full-resolution lossless PNG per filled tile, so any single tile can be losslessly
/// re-extracted or replaced later.
/// </summary>
public static class ProjectFileService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static void Save(MapProject project, string path)
    {
        var tempPath = path + ".tmp";
        using (var fs = new FileStream(tempPath, FileMode.Create))
        using (var zip = new ZipArchive(fs, ZipArchiveMode.Create))
        {
            var manifestEntry = zip.CreateEntry("manifest.json", CompressionLevel.Optimal);
            using (var entryStream = manifestEntry.Open())
            {
                JsonSerializer.Serialize(entryStream, project.Manifest, JsonOptions);
            }

            for (int r = 0; r < project.Rows; r++)
            {
                for (int c = 0; c < project.Cols; c++)
                {
                    var tile = project.Tiles[r, c];
                    if (tile is null) continue;

                    // PngBitmapEncoder.Save requires a seekable stream; ZipArchiveEntry streams are
                    // forward-only, so encode to a MemoryStream first and copy the bytes into the entry.
                    using var pngBuffer = new MemoryStream();
                    var encoder = new PngBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(tile));
                    encoder.Save(pngBuffer);

                    var entry = zip.CreateEntry($"tiles/r{r:D2}_c{c:D2}.png", CompressionLevel.NoCompression);
                    using var entryStream = entry.Open();
                    pngBuffer.Position = 0;
                    pngBuffer.CopyTo(entryStream);
                }
            }
        }

        File.Move(tempPath, path, overwrite: true);
        project.FilePath = path;
        project.IsDirty = false;
    }

    public static MapProject Open(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read);
        using var zip = new ZipArchive(fs, ZipArchiveMode.Read);

        var manifestEntry = zip.GetEntry("manifest.json")
            ?? throw new InvalidDataException("Not a valid MapScaner project: missing manifest.json");

        MapProjectManifest manifest;
        using (var entryStream = manifestEntry.Open())
        {
            manifest = JsonSerializer.Deserialize<MapProjectManifest>(entryStream)
                ?? throw new InvalidDataException("Not a valid MapScaner project: manifest.json is empty/invalid");
        }

        var tiles = new BitmapSource?[manifest.Rows, manifest.Cols];
        foreach (var slot in manifest.Tiles)
        {
            var entry = zip.GetEntry($"tiles/r{slot.Row:D2}_c{slot.Col:D2}.png");
            if (entry is null) continue;

            using var entryStream = entry.Open();
            using var ms = new MemoryStream();
            entryStream.CopyTo(ms);
            ms.Position = 0;

            var decoder = new PngBitmapDecoder(ms, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            var frame = decoder.Frames[0];
            frame.Freeze();
            tiles[slot.Row, slot.Col] = frame;
        }

        return new MapProject(manifest, tiles) { FilePath = path, IsDirty = false };
    }
}
