package br.com.gama.pdv.ui;

import br.com.gama.pdv.database.Database;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Parent;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

public final class MainView {
    private final Database.CompanySummary company;
    private final BorderPane root = new BorderPane();

    public MainView(Database.CompanySummary company) {
        this.company = company;
        build();
    }

    public Parent root() {
        return root;
    }

    private void build() {
        root.getStyleClass().add("app-root");
        root.setLeft(buildSidebar());
        root.setTop(buildHeader());
        root.setCenter(buildDashboard());
        root.setBottom(buildStatusBar());
    }

    private VBox buildSidebar() {
        Label logo = new Label("PDV GAMA");
        logo.getStyleClass().add("sidebar-logo");

        VBox menu = new VBox(8,
                menuButton("Visão geral"),
                menuButton("Nova venda"),
                menuButton("Produtos"),
                menuButton("Estoque"),
                menuButton("Compras"),
                menuButton("Clientes"),
                menuButton("Fornecedores"),
                menuButton("Caixa"),
                menuButton("Relatórios"),
                menuButton("Configurações")
        );

        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);

        Label version = new Label("Versão inicial 0.1.0");
        version.getStyleClass().add("sidebar-version");

        VBox sidebar = new VBox(28, logo, menu, spacer, version);
        sidebar.setPadding(new Insets(28, 20, 22, 20));
        sidebar.setPrefWidth(230);
        sidebar.getStyleClass().add("sidebar");
        return sidebar;
    }

    private Button menuButton(String text) {
        Button button = new Button(text);
        button.setMaxWidth(Double.MAX_VALUE);
        button.setAlignment(Pos.CENTER_LEFT);
        button.getStyleClass().add("menu-button");
        button.setOnAction(event -> showModuleMessage(text));
        return button;
    }

    private HBox buildHeader() {
        VBox names = new VBox(2,
                styledLabel(company.displayName(), "header-company"),
                styledLabel(company.segment().displayName(), "header-segment")
        );

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label user = new Label("Administrador");
        user.getStyleClass().add("header-user");

        HBox header = new HBox(18, names, spacer, user);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(18, 28, 18, 28));
        header.getStyleClass().add("header");
        return header;
    }

    private VBox buildDashboard() {
        Label title = new Label("Bem-vindo ao seu PDV");
        title.getStyleClass().add("dashboard-title");

        Label subtitle = new Label(
                "A estrutura inicial está pronta. Os próximos módulos serão implementados sobre esta base, sem alterar a instalação do cliente."
        );
        subtitle.setWrapText(true);
        subtitle.getStyleClass().add("dashboard-subtitle");

        GridPane cards = new GridPane();
        cards.setHgap(18);
        cards.setVgap(18);
        cards.add(moduleCard("Venda rápida", "Leitura de código de barras, produtos por peso e múltiplas formas de pagamento."), 0, 0);
        cards.add(moduleCard("Controle de estoque", "Saldo separado por loja, entradas, saídas, ajustes e estoque mínimo."), 1, 0);
        cards.add(moduleCard("Compras", "Registro de fornecedores, itens adquiridos e comprovante não fiscal de compra."), 0, 1);
        cards.add(moduleCard("Caixa e relatórios", "Abertura, fechamento, sangria, suprimento e visão diária do movimento."), 1, 1);

        for (int column = 0; column < 2; column++) {
            javafx.scene.layout.ColumnConstraints constraints = new javafx.scene.layout.ColumnConstraints();
            constraints.setPercentWidth(50);
            constraints.setHgrow(Priority.ALWAYS);
            cards.getColumnConstraints().add(constraints);
        }

        Label warning = new Label(
                "Comprovantes emitidos pelo sistema serão sempre identificados como NÃO FISCAIS."
        );
        warning.setWrapText(true);
        warning.getStyleClass().add("non-fiscal-warning");

        VBox content = new VBox(12, title, subtitle, cards, warning);
        content.setPadding(new Insets(34));
        VBox.setVgrow(cards, Priority.ALWAYS);
        return content;
    }

    private VBox moduleCard(String titleText, String descriptionText) {
        Label title = styledLabel(titleText, "card-title");
        Label description = styledLabel(descriptionText, "card-description");
        description.setWrapText(true);

        Button open = new Button("Abrir módulo");
        open.getStyleClass().add("secondary-button");
        open.setOnAction(event -> showModuleMessage(titleText));

        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);

        VBox card = new VBox(12, title, description, spacer, open);
        card.setPadding(new Insets(22));
        card.setMinHeight(190);
        card.getStyleClass().add("module-card");
        return card;
    }

    private HBox buildStatusBar() {
        Label databaseStatus = new Label("Banco local: conectado");
        Label branch = new Label("Loja: Matriz");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        HBox status = new HBox(12, databaseStatus, spacer, branch);
        status.setPadding(new Insets(8, 20, 8, 20));
        status.getStyleClass().add("status-bar");
        return status;
    }

    private Label styledLabel(String text, String styleClass) {
        Label label = new Label(text);
        label.getStyleClass().add(styleClass);
        return label;
    }

    private void showModuleMessage(String module) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("PDV Gama");
        alert.setHeaderText(module);
        alert.setContentText("A base deste módulo já está preparada no banco. A tela funcional será adicionada na próxima etapa do projeto.");
        alert.showAndWait();
    }
}
