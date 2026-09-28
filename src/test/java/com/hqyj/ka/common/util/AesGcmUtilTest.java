package com.hqyj.ka.common.util;

import org.junit.jupiter.api.Test;

import java.security.SecureRandom;

import static org.junit.jupiter.api.Assertions.*;

class AesGcmUtilTest {

    private byte[] key() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return key;
    }

    @Test
    void encryptDecryptRoundTrip() {
        byte[] key = key();
        String plain = "CARD-1234-ABCD----pwd!@# 中文卡密";
        String cipher = AesGcmUtil.encrypt(plain, key);
        assertNotEquals(plain, cipher);
        assertEquals(plain, AesGcmUtil.decrypt(cipher, key));
    }

    @Test
    void sameInputDifferentCiphertext() {
        byte[] key = key();
        // 每条随机 IV:同一明文两次加密密文必须不同
        assertNotEquals(AesGcmUtil.encrypt("same", key), AesGcmUtil.encrypt("same", key));
    }

    @Test
    void wrongKeyFails() {
        String cipher = AesGcmUtil.encrypt("secret", key());
        assertThrows(IllegalStateException.class, () -> AesGcmUtil.decrypt(cipher, key()));
    }

    @Test
    void tamperedCiphertextFails() {
        byte[] key = key();
        String cipher = AesGcmUtil.encrypt("secret", key);
        char flipped = cipher.charAt(10) == 'A' ? 'B' : 'A';
        String tampered = cipher.substring(0, 10) + flipped + cipher.substring(11);
        assertThrows(IllegalStateException.class, () -> AesGcmUtil.decrypt(tampered, key));
    }
}
