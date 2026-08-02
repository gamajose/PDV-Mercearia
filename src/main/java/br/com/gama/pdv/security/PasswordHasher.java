package br.com.gama.pdv.security;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

public final class PasswordHasher {
    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 210_000;
    private static final int KEY_LENGTH = 256;
    private static final int SALT_LENGTH = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordHasher() {
    }

    public static String hash(char[] password) {
        byte[] salt = new byte[SALT_LENGTH];
        RANDOM.nextBytes(salt);

        try {
            PBEKeySpec specification = new PBEKeySpec(password, salt, ITERATIONS, KEY_LENGTH);
            byte[] derivedKey = SecretKeyFactory.getInstance(ALGORITHM)
                    .generateSecret(specification)
                    .getEncoded();

            return "pbkdf2_sha256$" + ITERATIONS + "$"
                    + Base64.getEncoder().encodeToString(salt) + "$"
                    + Base64.getEncoder().encodeToString(derivedKey);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Não foi possível proteger a senha.", exception);
        }
    }
}
