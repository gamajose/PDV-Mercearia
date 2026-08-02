package br.com.gama.pdv.database;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class DatabaseMigrator {
    private static final List<Migration> MIGRATIONS = List.of(
            new Migration(1, "Estrutura inicial", "/db/migration/V1__initial_schema.sql")
    );

    void migrate(Connection connection) throws SQLException {
        createHistoryTable(connection);
        Set<Integer> appliedVersions = loadAppliedVersions(connection);

        for (Migration migration : MIGRATIONS) {
            if (!appliedVersions.contains(migration.version())) {
                apply(connection, migration);
            }
        }
    }

    private void createHistoryTable(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS schema_history (
                        version INTEGER PRIMARY KEY,
                        description TEXT NOT NULL,
                        installed_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """);
        }
    }

    private Set<Integer> loadAppliedVersions(Connection connection) throws SQLException {
        Set<Integer> versions = new HashSet<>();
        try (Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery("SELECT version FROM schema_history")) {
            while (resultSet.next()) {
                versions.add(resultSet.getInt("version"));
            }
        }
        return versions;
    }

    private void apply(Connection connection, Migration migration) throws SQLException {
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);

        try {
            executeScript(connection, readResource(migration.resource()));
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO schema_history(version, description) VALUES (?, ?)")) {
                statement.setInt(1, migration.version());
                statement.setString(2, migration.description());
                statement.executeUpdate();
            }
            connection.commit();
        } catch (SQLException | RuntimeException exception) {
            connection.rollback();
            throw exception;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private void executeScript(Connection connection, String script) throws SQLException {
        String withoutComments = script.replaceAll("(?m)^\\s*--.*$", "");
        for (String command : withoutComments.split(";")) {
            String sql = command.trim();
            if (!sql.isEmpty()) {
                try (Statement statement = connection.createStatement()) {
                    statement.execute(sql);
                }
            }
        }
    }

    private String readResource(String resource) {
        try (InputStream input = DatabaseMigrator.class.getResourceAsStream(resource)) {
            if (input == null) {
                throw new IllegalStateException("Migração não encontrada: " + resource);
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("Não foi possível ler a migração: " + resource, exception);
        }
    }

    private record Migration(int version, String description, String resource) {
    }
}
