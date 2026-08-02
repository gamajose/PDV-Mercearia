package br.com.gama.pdv.database;

import br.com.gama.pdv.domain.BusinessSegment;
import br.com.gama.pdv.security.PasswordHasher;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public final class Database {
    private final Path databaseFile;

    public Database(Path databaseFile) {
        this.databaseFile = databaseFile;
    }

    public void initialize() {
        try {
            Class.forName("org.sqlite.JDBC");
            try (Connection connection = openConnection()) {
                new DatabaseMigrator().migrate(connection);
            }
        } catch (ClassNotFoundException | SQLException exception) {
            throw new IllegalStateException("Não foi possível inicializar o banco de dados.", exception);
        }
    }

    public boolean isConfigured() {
        try (Connection connection = openConnection();
             Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery("SELECT COUNT(*) FROM company")) {
            return resultSet.next() && resultSet.getInt(1) > 0;
        } catch (SQLException exception) {
            throw new IllegalStateException("Não foi possível consultar a configuração da empresa.", exception);
        }
    }

    public void saveInitialConfiguration(InitialSetup setup) {
        try (Connection connection = openConnection()) {
            boolean previousAutoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);

            try {
                long companyId = insertCompany(connection, setup);
                insertMainBranch(connection, companyId);
                insertAdministrator(connection, companyId, setup);
                connection.commit();
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw exception;
            } finally {
                connection.setAutoCommit(previousAutoCommit);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Não foi possível salvar a configuração inicial.", exception);
        }
    }

    public CompanySummary loadCompanySummary() {
        String sql = "SELECT legal_name, trade_name, segment FROM company ORDER BY id LIMIT 1";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet resultSet = statement.executeQuery()) {
            if (!resultSet.next()) {
                throw new IllegalStateException("Empresa ainda não configurada.");
            }
            return new CompanySummary(
                    resultSet.getString("legal_name"),
                    resultSet.getString("trade_name"),
                    BusinessSegment.valueOf(resultSet.getString("segment"))
            );
        } catch (SQLException exception) {
            throw new IllegalStateException("Não foi possível carregar os dados da empresa.", exception);
        }
    }

    private Connection openConnection() throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:sqlite:" + databaseFile.toAbsolutePath());
        try (Statement statement = connection.createStatement()) {
            statement.execute("PRAGMA foreign_keys = ON");
            statement.execute("PRAGMA journal_mode = WAL");
            statement.execute("PRAGMA busy_timeout = 5000");
        }
        return connection;
    }

    private long insertCompany(Connection connection, InitialSetup setup) throws SQLException {
        String sql = """
                INSERT INTO company(legal_name, trade_name, document, segment)
                VALUES (?, ?, ?, ?)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, setup.companyName().trim());
            statement.setString(2, blankToNull(setup.tradeName()));
            statement.setString(3, blankToNull(setup.document()));
            statement.setString(4, setup.segment().name());
            statement.executeUpdate();

            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (!keys.next()) {
                    throw new SQLException("O banco não retornou o identificador da empresa.");
                }
                return keys.getLong(1);
            }
        }
    }

    private void insertMainBranch(Connection connection, long companyId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO branch(company_id, code, name, active)
                VALUES (?, 'MATRIZ', 'Matriz', 1)
                """)) {
            statement.setLong(1, companyId);
            statement.executeUpdate();
        }
    }

    private void insertAdministrator(Connection connection, long companyId, InitialSetup setup) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO app_user(company_id, name, login, password_hash, role, active)
                VALUES (?, ?, ?, ?, 'ADMIN', 1)
                """)) {
            statement.setLong(1, companyId);
            statement.setString(2, setup.adminName().trim());
            statement.setString(3, setup.adminLogin().trim().toLowerCase());
            statement.setString(4, PasswordHasher.hash(setup.adminPassword()));
            statement.executeUpdate();
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record InitialSetup(
            String companyName,
            String tradeName,
            String document,
            BusinessSegment segment,
            String adminName,
            String adminLogin,
            char[] adminPassword
    ) {
    }

    public record CompanySummary(
            String legalName,
            String tradeName,
            BusinessSegment segment
    ) {
        public String displayName() {
            return tradeName == null || tradeName.isBlank() ? legalName : tradeName;
        }
    }
}
