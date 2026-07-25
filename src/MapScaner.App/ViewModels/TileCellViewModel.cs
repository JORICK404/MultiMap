using System.Windows.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;

namespace MapScaner.App.ViewModels;

public partial class TileCellViewModel : ObservableObject
{
    public int Row { get; }
    public int Col { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private BitmapSource? _thumbnailSource;

    public bool IsEmpty => ThumbnailSource is null;

    public string Label => $"({Row}, {Col})";

    public TileCellViewModel(int row, int col)
    {
        Row = row;
        Col = col;
    }
}
