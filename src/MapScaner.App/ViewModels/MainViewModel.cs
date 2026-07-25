using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using MapScaner.App.Models;
using MapScaner.App.Services;
using MapScaner.App.Views;

namespace MapScaner.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private const string ImageFileFilter = "Images (*.png;*.jpg;*.jpeg;*.bmp)|*.png;*.jpg;*.jpeg;*.bmp";
    private const string ProjectFileFilter = "MapScaner project (*.mapproj)|*.mapproj";

    private readonly CalibrationLibrary _calibrationLibrary = new();
    private MapProject _project;

    public ObservableCollection<TileCellViewModel> Cells { get; } = new();

    [ObservableProperty]
    private int _rows = 4;

    [ObservableProperty]
    private int _cols = 4;

    [ObservableProperty]
    private TileCellViewModel? _selectedCell;

    [ObservableProperty]
    private string _statusMessage = "Ready. Click a cell, then Ctrl+V to paste a screenshot.";

    [ObservableProperty]
    private string _windowTitle = "MapScaner";

    public MainViewModel()
    {
        _project = new MapProject(4, 4);
        LoadProjectIntoUi(_project);
    }

    private static Window? OwnerWindow => Application.Current?.MainWindow;

    private void LoadProjectIntoUi(MapProject project)
    {
        _project = project;
        Cells.Clear();
        for (int r = 0; r < project.Rows; r++)
        {
            for (int c = 0; c < project.Cols; c++)
            {
                Cells.Add(new TileCellViewModel(r, c) { ThumbnailSource = project.Tiles[r, c] });
            }
        }
        Rows = project.Rows;
        Cols = project.Cols;
        SelectedCell = null;
        UpdateTitle();
    }

    private void UpdateTitle()
    {
        var name = _project.FilePath is null ? "Untitled" : Path.GetFileName(_project.FilePath);
        WindowTitle = $"MapScaner — {name}{(_project.IsDirty ? "*" : "")}";
    }

    public bool CanClose() => ConfirmDiscardUnsavedChanges();

    private bool ConfirmDiscardUnsavedChanges()
    {
        if (!_project.IsDirty) return true;
        var result = MessageBox.Show(OwnerWindow, "You have unsaved changes. Discard them?", "MapScaner",
            MessageBoxButton.YesNo, MessageBoxImage.Warning);
        return result == MessageBoxResult.Yes;
    }

    private static BitmapSource LoadImageFromFile(string path)
    {
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read);
        var decoder = BitmapDecoder.Create(fs, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        frame.Freeze();
        return frame;
    }

    [RelayCommand]
    private void NewProject()
    {
        if (!ConfirmDiscardUnsavedChanges()) return;
        LoadProjectIntoUi(new MapProject(4, 4));
        StatusMessage = "New project created (4x4). Use Resize Grid to change size.";
    }

    [RelayCommand]
    private void OpenProject()
    {
        if (!ConfirmDiscardUnsavedChanges()) return;

        var dialog = new OpenFileDialog { Filter = ProjectFileFilter };
        if (dialog.ShowDialog() != true) return;

        try
        {
            var project = ProjectFileService.Open(dialog.FileName);
            LoadProjectIntoUi(project);
            StatusMessage = $"Opened {Path.GetFileName(dialog.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not open project:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private void SaveProject()
    {
        if (_project.FilePath is null)
        {
            SaveProjectAs();
            return;
        }
        SaveToPath(_project.FilePath);
    }

    [RelayCommand]
    private void SaveProjectAs()
    {
        var dialog = new SaveFileDialog { Filter = ProjectFileFilter, FileName = "map.mapproj" };
        if (dialog.ShowDialog() != true) return;
        SaveToPath(dialog.FileName);
    }

    private void SaveToPath(string path)
    {
        try
        {
            ProjectFileService.Save(_project, path);
            UpdateTitle();
            StatusMessage = $"Saved {Path.GetFileName(path)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not save project:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private void Export()
    {
        if (_project.Manifest.TileWidth is not int tileWidth || _project.Manifest.TileHeight is not int tileHeight)
        {
            MessageBox.Show(OwnerWindow, "No tiles captured yet.", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        int emptyCount = 0;
        for (int r = 0; r < _project.Rows; r++)
        for (int c = 0; c < _project.Cols; c++)
            if (_project.Tiles[r, c] is null) emptyCount++;

        if (emptyCount > 0)
        {
            var proceed = MessageBox.Show(OwnerWindow,
                $"{emptyCount} of {_project.Rows * _project.Cols} tiles are empty and will be transparent in the export. Continue?",
                "MapScaner", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (proceed != MessageBoxResult.Yes) return;
        }

        var dialog = new SaveFileDialog { Filter = "PNG image (*.png)|*.png", FileName = "map.png" };
        if (dialog.ShowDialog() != true) return;

        try
        {
            var stitched = ImageStitchService.Stitch(_project.Tiles, _project.Rows, _project.Cols, tileWidth, tileHeight);
            ImageStitchService.SavePng(stitched, dialog.FileName);
            StatusMessage = $"Exported {Path.GetFileName(dialog.FileName)}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not export:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private BitmapSource? PromptForSampleImage()
    {
        var clip = ClipboardImageService.GetImageFromClipboard();
        if (clip is not null)
        {
            var useClipboard = MessageBox.Show(OwnerWindow,
                "Use the image currently in the clipboard as the calibration sample?",
                "MapScaner", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (useClipboard == MessageBoxResult.Yes) return clip.Image;
        }

        var dialog = new OpenFileDialog { Filter = ImageFileFilter };
        if (dialog.ShowDialog() != true) return null;

        try
        {
            return LoadImageFromFile(dialog.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not load image:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return null;
        }
    }

    [RelayCommand]
    private void Calibrate()
    {
        var sample = PromptForSampleImage();
        if (sample is null) return;

        var existing = _calibrationLibrary.TryGet(sample.PixelWidth, sample.PixelHeight);
        var window = new CalibrationWindow(sample, existing?.CropRect) { Owner = OwnerWindow };
        if (window.ShowDialog() == true && window.Result is CalibrationProfile profile)
        {
            _calibrationLibrary.Save(profile);
            StatusMessage = $"Calibrated {profile.ResolutionKey}: crop {profile.CropWidth}x{profile.CropHeight} at ({profile.CropX},{profile.CropY})";
        }
    }

    [RelayCommand]
    private void ResizeGrid()
    {
        var dialog = new GridResizeDialog(_project.Rows, _project.Cols) { Owner = OwnerWindow };
        if (dialog.ShowDialog() != true) return;

        var (newRows, newCols) = (dialog.Result.Rows, dialog.Result.Cols);
        if (newRows == _project.Rows && newCols == _project.Cols) return;

        var dropped = _project.GetTilesOutsideBounds(newRows, newCols);
        if (dropped.Count > 0)
        {
            var message = $"Resizing to {newRows}x{newCols} will remove {dropped.Count} already-captured tile(s): " +
                           string.Join(", ", dropped.Select(t => $"({t.Row},{t.Col})")) + ". Continue?";
            if (MessageBox.Show(OwnerWindow, message, "MapScaner", MessageBoxButton.YesNo, MessageBoxImage.Warning)
                != MessageBoxResult.Yes)
            {
                return;
            }
        }

        _project.ResizeTo(newRows, newCols);
        LoadProjectIntoUi(_project);
        StatusMessage = $"Grid resized to {newRows}x{newCols}";
    }

    [RelayCommand]
    private void ImportStitchedImage()
    {
        if (!ConfirmDiscardUnsavedChanges()) return;

        var dialog = new OpenFileDialog { Filter = ImageFileFilter };
        if (dialog.ShowDialog() != true) return;

        BitmapSource image;
        try
        {
            image = LoadImageFromFile(dialog.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not load image:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        var importDialog = new ImportGridDialog(image, _project.Rows, _project.Cols) { Owner = OwnerWindow };
        if (importDialog.ShowDialog() != true) return;

        var project = ImportStitchedImageService.SliceIntoProject(
            image, importDialog.Result.Rows, importDialog.Result.Cols, $"imported:{Path.GetFileName(dialog.FileName)}",
            importDialog.EdgeTrim);
        LoadProjectIntoUi(project);
        StatusMessage = $"Imported {Path.GetFileName(dialog.FileName)} as {importDialog.Result.Rows}x{importDialog.Result.Cols}" +
                        (importDialog.EdgeTrim > 0 ? $" (trimmed {importDialog.EdgeTrim}px/edge)" : "") +
                        " — every tile is now editable.";
    }

    [RelayCommand]
    private void PasteIntoSelected()
    {
        if (SelectedCell is null)
        {
            StatusMessage = "Select a cell first, then paste.";
            return;
        }

        var clip = ClipboardImageService.GetImageFromClipboard();
        if (clip is null)
        {
            StatusMessage = "Clipboard has no image.";
            return;
        }

        PlaceImageIntoCell(SelectedCell, clip.Image, $"clipboard ({clip.SourceFormat})");
    }

    [RelayCommand]
    private void LoadFileIntoSelected()
    {
        if (SelectedCell is null)
        {
            StatusMessage = "Select a cell first.";
            return;
        }

        var dialog = new OpenFileDialog { Filter = ImageFileFilter };
        if (dialog.ShowDialog() != true) return;

        BitmapSource image;
        try
        {
            image = LoadImageFromFile(dialog.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(OwnerWindow, $"Could not load image:\n{ex.Message}", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        PlaceImageIntoCell(SelectedCell, image, $"file:{Path.GetFileName(dialog.FileName)}");
    }

    [RelayCommand]
    private void ClearSelected()
    {
        if (SelectedCell is null) return;

        _project.ClearTile(SelectedCell.Row, SelectedCell.Col);
        SelectedCell.ThumbnailSource = null;
        UpdateTitle();
        StatusMessage = $"Cleared tile ({SelectedCell.Row},{SelectedCell.Col})";
    }

    private void PlaceImageIntoCell(TileCellViewModel cell, BitmapSource fullImage, string sourceDescription)
    {
        var profile = _calibrationLibrary.TryGet(fullImage.PixelWidth, fullImage.PixelHeight);
        if (profile is null)
        {
            var proceed = MessageBox.Show(OwnerWindow,
                $"No calibration saved for resolution {fullImage.PixelWidth}x{fullImage.PixelHeight}. Calibrate now?",
                "MapScaner", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (proceed != MessageBoxResult.Yes)
            {
                StatusMessage = "Cancelled — no calibration for this resolution.";
                return;
            }

            var window = new CalibrationWindow(fullImage) { Owner = OwnerWindow };
            if (window.ShowDialog() != true || window.Result is not CalibrationProfile newProfile)
            {
                StatusMessage = "Calibration cancelled.";
                return;
            }

            _calibrationLibrary.Save(newProfile);
            RecordCalibrationUsed(newProfile);
            profile = newProfile;
        }

        var cropped = ImageCropService.CropToIndependentBitmap(fullImage, profile.CropRect);

        if (!_project.TryValidateTileSize(cropped.PixelWidth, cropped.PixelHeight, out var error))
        {
            var recalibrate = MessageBox.Show(OwnerWindow, $"{error}\n\nRecalibrate for this resolution now?",
                "MapScaner", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (recalibrate != MessageBoxResult.Yes)
            {
                StatusMessage = "Cancelled — tile size mismatch.";
                return;
            }

            var window = new CalibrationWindow(fullImage, profile.CropRect) { Owner = OwnerWindow };
            if (window.ShowDialog() != true || window.Result is not CalibrationProfile fixedProfile)
            {
                StatusMessage = "Recalibration cancelled.";
                return;
            }

            _calibrationLibrary.Save(fixedProfile);
            RecordCalibrationUsed(fixedProfile);
            cropped = ImageCropService.CropToIndependentBitmap(fullImage, fixedProfile.CropRect);

            if (!_project.TryValidateTileSize(cropped.PixelWidth, cropped.PixelHeight, out error))
            {
                MessageBox.Show(OwnerWindow, error, "MapScaner", MessageBoxButton.OK, MessageBoxImage.Error);
                StatusMessage = "Tile size still mismatched after recalibration.";
                return;
            }
        }

        var info = new TileSlotInfo
        {
            Row = cell.Row,
            Col = cell.Col,
            IsFilled = true,
            PixelWidth = cropped.PixelWidth,
            PixelHeight = cropped.PixelHeight,
            SourceDescription = sourceDescription,
            CapturedUtc = DateTime.UtcNow,
        };
        _project.SetTile(cell.Row, cell.Col, cropped, info);
        cell.ThumbnailSource = cropped;
        UpdateTitle();
        StatusMessage = $"Placed tile ({cell.Row},{cell.Col}) from {sourceDescription}";
    }

    private void RecordCalibrationUsed(CalibrationProfile profile)
    {
        _project.Manifest.CalibrationsUsed.RemoveAll(p => p.ResolutionKey == profile.ResolutionKey);
        _project.Manifest.CalibrationsUsed.Add(profile);
    }
}
