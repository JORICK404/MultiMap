using System.IO;
using System.Text.Json;
using MapScaner.App.Models;

namespace MapScaner.App.Services;

/// <summary>
/// Machine-wide store of calibration profiles keyed by screenshot resolution
/// ("{width}x{height}"), persisted at %AppData%\MapScaner\calibrations.json so a
/// resolution calibrated once benefits every future project.
/// </summary>
public sealed class CalibrationLibrary
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _filePath;
    private readonly Dictionary<string, CalibrationProfile> _profiles;

    public CalibrationLibrary() : this(DefaultFilePath)
    {
    }

    public CalibrationLibrary(string filePath)
    {
        _filePath = filePath;
        _profiles = Load(_filePath);
    }

    private static string DefaultFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MapScaner", "calibrations.json");

    public CalibrationProfile? TryGet(int width, int height) =>
        _profiles.TryGetValue($"{width}x{height}", out var profile) ? profile : null;

    public void Save(CalibrationProfile profile)
    {
        _profiles[profile.ResolutionKey] = profile;
        Persist();
    }

    private static Dictionary<string, CalibrationProfile> Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return new();
            var json = File.ReadAllText(path);
            var loaded = JsonSerializer.Deserialize<Dictionary<string, CalibrationProfile>>(json);
            return loaded ?? new();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return new();
        }
    }

    private void Persist()
    {
        var directory = Path.GetDirectoryName(_filePath)!;
        Directory.CreateDirectory(directory);
        var json = JsonSerializer.Serialize(_profiles, JsonOptions);

        var tempPath = _filePath + ".tmp";
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, _filePath, overwrite: true);
    }
}
