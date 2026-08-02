package br.com.gama.pdv.domain;

public enum BusinessSegment {
    MERCEARIA("Mercearia"),
    SUPERMERCADO("Supermercado"),
    HORTIFRUTI("Hortifruti"),
    ACOUGUE("Açougue"),
    PADARIA("Padaria"),
    ACAI_SORVETERIA("Açaí e sorveteria"),
    CONVENIENCIA("Loja de conveniência"),
    DISTRIBUIDORA("Distribuidora"),
    COMERCIO_GERAL("Comércio geral");

    private final String displayName;

    BusinessSegment(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }

    @Override
    public String toString() {
        return displayName;
    }
}
