using System.Windows;
using MapScaner.App.Models;

namespace MapScaner.App.Views;

public partial class GridResizeDialog : Window
{
    public GridSize Result { get; private set; }

    public GridResizeDialog(int currentRows, int currentCols)
    {
        InitializeComponent();
        RowsBox.Text = currentRows.ToString();
        ColsBox.Text = currentCols.ToString();
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(RowsBox.Text, out int rows) || rows < 1 ||
            !int.TryParse(ColsBox.Text, out int cols) || cols < 1)
        {
            MessageBox.Show(this, "Enter positive whole numbers for rows and columns.", "MapScaner",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        Result = new GridSize(rows, cols);
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
