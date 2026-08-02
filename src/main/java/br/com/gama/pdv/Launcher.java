package br.com.gama.pdv;

/**
 * Launcher separado da classe JavaFX para permitir a execução pelo JAR sombreado
 * e pelo instalador nativo gerado com jpackage.
 */
public final class Launcher {
    private Launcher() {
    }

    public static void main(String[] args) {
        PdvApplication.main(args);
    }
}
