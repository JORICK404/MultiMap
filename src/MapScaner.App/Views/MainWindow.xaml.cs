using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using MapScaner.App.ViewModels;

namespace MapScaner.App.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (DataContext is MainViewModel vm && !vm.CanClose())
        {
            e.Cancel = true;
        }
        base.OnClosing(e);
    }

    private void Cell_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: TileCellViewModel cell } && DataContext is MainViewModel vm)
        {
            vm.SelectedCell = cell;
        }
    }

    private void LoadImageMenuItem_Click(object sender, RoutedEventArgs e)
    {
        (DataContext as MainViewModel)?.LoadFileIntoSelectedCommand.Execute(null);
    }

    private void ClearTileMenuItem_Click(object sender, RoutedEventArgs e)
    {
        (DataContext as MainViewModel)?.ClearSelectedCommand.Execute(null);
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
