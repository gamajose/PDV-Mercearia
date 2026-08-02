package br.com.gama.pdv.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class AppPaths {
    private static final String DATA_DIR_PROPERTY = "pdv.data.dir";

    private AppPaths() {
    }

    public static Path dataDirectory() {
        String override = System.getProperty(DATA_DIR_PROPERTY);
        Path directory;

        if (override != null && !override.isBlank()) {
            directory = Paths.get(override);
        } else {
            String localAppData = System.getenv("LOCALAPPDATA");
            directory = localAppData != null && !localAppData.isBlank()
                    ? Paths.get(localAppData, "PDVGama")
                    : Paths.get(System.getProperty("user.home"), ".pdv-gama");
        }

        try {
            return Files.createDirectories(directory);
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível criar o diretório de dados: " + directory, exception);
        }
    }

    public static Path databaseFile() {
        return dataDirectory().resolve("pdv-gama.db");
    }

    public static Path backupDirectory() {
        Path directory = dataDirectory().resolve("backups");
        try {
            return Files.createDirectories(directory);
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível criar o diretório de backups: " + directory, exception);
        }
    }
}
