package br.com.gama.pdv.ui;

import br.com.gama.pdv.database.Database;
import br.com.gama.pdv.domain.BusinessSegment;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Parent;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

import java.util.Arrays;

public final class SetupView {
    private final Database database;
    private final Runnable onCompleted;
    private final BorderPane root = new BorderPane();

    private final TextField companyName = new TextField();
    private final TextField tradeName = new TextField();
    private final TextField document = new TextField();
    private final ComboBox<BusinessSegment> segment = new ComboBox<>();
    private final TextField adminName = new TextField();
    private final TextField adminLogin = new TextField("admin");
    private final PasswordField password = new PasswordField();
    private final PasswordField passwordConfirmation = new PasswordField();

    public SetupView(Database database, Runnable onCompleted) {
        this.database = database;
        this.onCompleted = onCompleted;
        build();
    }

    public Parent root() {
        return root;
    }

    private void build() {
        root.getStyleClass().add("setup-root");
        root.setLeft(buildBrandPanel());
        root.setCenter(buildForm());
    }

    private VBox buildBrandPanel() {
        Label brand = new Label("PDV\nGAMA");
        brand.getStyleClass().add("brand-title");

        Label description = new Label(
                "Um único sistema para mercearia, supermercado, hortifruti, açougue, padaria e outros comércios."
        );
        description.setWrapText(true);
        description.getStyleClass().add("brand-description");

        Label note = new Label("Venda, estoque, compras, caixa e comprovantes não fiscais.");
        note.setWrapText(true);
        note.getStyleClass().add("brand-note");

        VBox panel = new VBox(24, brand, description, note);
        panel.setPadding(new Insets(56));
        panel.setPrefWidth(390);
        panel.getStyleClass().add("brand-panel");
        VBox.setVgrow(description, Priority.ALWAYS);
        return panel;
    }

    private ScrollPane buildForm() {
        Label title = new Label("Configuração inicial");
        title.getStyleClass().add("page-title");

        Label subtitle = new Label("Informe os dados da empresa e crie o primeiro usuário administrador.");
        subtitle.getStyleClass().add("page-subtitle");
        subtitle.setWrapText(true);

        configureFields();

        GridPane form = new GridPane();
        form.setHgap(18);
        form.setVgap(14);
        form.add(field("Razão social ou nome da empresa *", companyName), 0, 0, 2, 1);
        form.add(field("Nome fantasia", tradeName), 0, 1);
        form.add(field("CNPJ/CPF (opcional)", document), 1, 1);
        form.add(field("Ramo do comércio *", segment), 0, 2, 2, 1);
        form.add(sectionTitle("Administrador"), 0, 3, 2, 1);
        form.add(field("Nome do responsável *", adminName), 0, 4);
        form.add(field("Usuário de acesso *", adminLogin), 1, 4);
        form.add(field("Senha *", password), 0, 5);
        form.add(field("Confirmar senha *", passwordConfirmation), 1, 5);

        GridPane.setHgrow(companyName, Priority.ALWAYS);
        GridPane.setHgrow(tradeName, Priority.ALWAYS);
        GridPane.setHgrow(document, Priority.ALWAYS);
        GridPane.setHgrow(segment, Priority.ALWAYS);
        GridPane.setHgrow(adminName, Priority.ALWAYS);
        GridPane.setHgrow(adminLogin, Priority.ALWAYS);
        GridPane.setHgrow(password, Priority.ALWAYS);
        GridPane.setHgrow(passwordConfirmation, Priority.ALWAYS);

        Button finish = new Button("Criar empresa e abrir o PDV");
        finish.getStyleClass().add("primary-button");
        finish.setMaxWidth(Double.MAX_VALUE);
        finish.setOnAction(event -> save());

        Label disclaimer = new Label(
                "Os documentos gerados pelo sistema serão comprovantes não fiscais e não substituem NF-e, NFC-e, SAT ou outros documentos fiscais."
        );
        disclaimer.setWrapText(true);
        disclaimer.getStyleClass().add("disclaimer");

        VBox content = new VBox(12, title, subtitle, form, finish, disclaimer);
        content.setPadding(new Insets(44, 64, 44, 64));
        content.setMaxWidth(760);

        VBox wrapper = new VBox(content);
        wrapper.setAlignment(Pos.TOP_CENTER);

        ScrollPane scrollPane = new ScrollPane(wrapper);
        scrollPane.setFitToWidth(true);
        scrollPane.getStyleClass().add("form-scroll");
        return scrollPane;
    }

    private void configureFields() {
        companyName.setPromptText("Ex.: Mercearia do Bairro LTDA");
        tradeName.setPromptText("Ex.: Mercearia do José");
        document.setPromptText("Somente para identificação interna");
        segment.getItems().setAll(BusinessSegment.values());
        segment.getSelectionModel().select(BusinessSegment.MERCEARIA);
        segment.setMaxWidth(Double.MAX_VALUE);
        adminName.setPromptText("Nome completo");
        adminLogin.setPromptText("Ex.: admin");
        password.setPromptText("Mínimo de 6 caracteres");
        passwordConfirmation.setPromptText("Repita a senha");
    }

    private VBox field(String labelText, javafx.scene.control.Control control) {
        Label label = new Label(labelText);
        label.getStyleClass().add("field-label");
        control.setMaxWidth(Double.MAX_VALUE);
        return new VBox(6, label, control);
    }

    private Label sectionTitle(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("section-title");
        GridPane.setMargin(label, new Insets(18, 0, 0, 0));
        return label;
    }

    private void save() {
        String error = validateForm();
        if (error != null) {
            showAlert(Alert.AlertType.WARNING, "Confira os dados", error);
            return;
        }

        char[] rawPassword = password.getText().toCharArray();
        try {
            Database.InitialSetup setup = new Database.InitialSetup(
                    companyName.getText(),
                    tradeName.getText(),
                    document.getText(),
                    segment.getValue(),
                    adminName.getText(),
                    adminLogin.getText(),
                    rawPassword
            );
            database.saveInitialConfiguration(setup);
            onCompleted.run();
        } catch (RuntimeException exception) {
            showAlert(Alert.AlertType.ERROR, "Não foi possível concluir", exception.getMessage());
        } finally {
            Arrays.fill(rawPassword, '\0');
        }
    }

    private String validateForm() {
        if (companyName.getText().isBlank()) {
            return "Informe o nome da empresa.";
        }
        if (segment.getValue() == null) {
            return "Selecione o ramo do comércio.";
        }
        if (adminName.getText().isBlank()) {
            return "Informe o nome do administrador.";
        }
        if (adminLogin.getText().isBlank()) {
            return "Informe o usuário de acesso.";
        }
        if (password.getText().length() < 6) {
            return "A senha precisa ter pelo menos 6 caracteres.";
        }
        if (!password.getText().equals(passwordConfirmation.getText())) {
            return "A confirmação da senha não corresponde à senha informada.";
        }
        return null;
    }

    private void showAlert(Alert.AlertType type, String header, String message) {
        Alert alert = new Alert(type);
        alert.setTitle("PDV Gama");
        alert.setHeaderText(header);
        alert.setContentText(message);
        alert.showAndWait();
    }
}
