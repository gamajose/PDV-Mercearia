namespace Pdv.Hardware.Printers;

public static class EscPosCommands
{
    // Inicialização
    public static readonly byte[] Initialize = [0x1B, 0x40];

    // Alinhamento
    public static readonly byte[] AlignLeft = [0x1B, 0x61, 0x00];
    public static readonly byte[] AlignCenter = [0x1B, 0x61, 0x01];
    public static readonly byte[] AlignRight = [0x1B, 0x61, 0x02];

    // Estilos de Fonte
    public static readonly byte[] BoldOn = [0x1B, 0x45, 0x01];
    public static readonly byte[] BoldOff = [0x1B, 0x45, 0x00];
    public static readonly byte[] DoubleHeightOn = [0x1B, 0x21, 0x10];
    public static readonly byte[] DoubleWidthOn = [0x1B, 0x21, 0x20];
    public static readonly byte[] DoubleSizeOn = [0x1D, 0x21, 0x11];
    public static readonly byte[] NormalSize = [0x1D, 0x21, 0x00];
    public static readonly byte[] UnderlineOn = [0x1B, 0x2D, 0x01];
    public static readonly byte[] UnderlineOff = [0x1B, 0x2D, 0x00];

    // Linha e Avanço de Papel
    public static readonly byte[] LineFeed = [0x0A];
    public static readonly byte[] Feed3Lines = [0x1B, 0x64, 0x03];
    public static readonly byte[] Feed5Lines = [0x1B, 0x64, 0x05];

    // Corte de Papel (Guilhotina)
    public static readonly byte[] FullCut = [0x1D, 0x56, 0x41, 0x00];
    public static readonly byte[] PartialCut = [0x1D, 0x56, 0x42, 0x00];

    // Pulso elétrico para abertura de Gaveta de Dinheiro (Porta RJ-11 da impressora)
    public static readonly byte[] OpenDrawer = [0x1B, 0x70, 0x00, 0x19, 0xFA];

    // Gerador de Separador Horizontal
    public static string LineSeparator(int columns = 48) => new('-', columns);
    public static string DoubleLineSeparator(int columns = 48) => new('=', columns);
}
