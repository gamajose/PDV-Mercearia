package br.com.gama.pdv;

import br.com.gama.pdv.config.AppPaths;
import br.com.gama.pdv.database.Database;
import br.com.gama.pdv.ui.MainView;
import br.com.gama.pdv.ui.SetupView;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.stage.Stage;

import java.net.URL;

public final class PdvApplication extends Application {
    private static final double DEFAULT_WIDTH = 1180;
    private static final double DEFAULT_HEIGHT = 720;

    private final Database database = new Database(AppPaths.databaseFile());

    public static void main(String[] args) {
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        try {
            database.initialize();
            configureStage(stage);

            if (database.isConfigured()) {
                showDashboard(stage);
            } else {
                showInitialSetup(stage);
            }

            stage.show();
        } catch (RuntimeException exception) {
            showFatalError(exception);
        }
    }

    private void configureStage(Stage stage) {
        stage.setTitle("PDV Gama");
        stage.setMinWidth(960);
        stage.setMinHeight(620);
    }

    private void showInitialSetup(Stage stage) {
        SetupView setupView = new SetupView(database, () -> showDashboard(stage));
        stage.setScene(createScene(setupView.root()));
        stage.centerOnScreen();
    }

    private void showDashboard(Stage stage) {
        MainView mainView = new MainView(database.loadCompanySummary());
        stage.setScene(createScene(mainView.root()));
        stage.centerOnScreen();
    }

    private Scene createScene(Parent root) {
        Scene scene = new Scene(root, DEFAULT_WIDTH, DEFAULT_HEIGHT);
        URL stylesheet = PdvApplication.class.getResource("/styles/app.css");
        if (stylesheet != null) {
            scene.getStylesheets().add(stylesheet.toExternalForm());
        }
        return scene;
    }

    private void showFatalError(RuntimeException exception) {
        exception.printStackTrace();
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Erro ao iniciar o PDV");
        alert.setHeaderText("A aplicação não pôde ser iniciada.");
        alert.setContentText(exception.getMessage());
        alert.showAndWait();
        Platform.exit();
    }
}
