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
        String cipher = AesGcmUtil.encrypt(key, plain);
        assertNotEquals(plain, cipher);
        assertEquals(plain, AesGcmUtil.decrypt(key, cipher));
    }

    @Test
    void sameInputDifferentCiphertext() {
        byte[] key = key();
        // 每条随机 IV:同一明文两次加密密文必须不同
        assertNotEquals(AesGcmUtil.encrypt(key, "same"), AesGcmUtil.encrypt(key, "same"));
    }

    @Test
    void wrongKeyFails() {
        String cipher = AesGcmUtil.encrypt(key(), "secret");
        assertThrows(IllegalStateException.class, () -> AesGcmUtil.decrypt(key(), cipher));
    }

    @Test
    void tamperedCiphertextFails() {
        byte[] key = key();
        String cipher = AesGcmUtil.encrypt(key, "secret");
        char flipped = cipher.charAt(10) == 'A' ? 'B' : 'A';
        String tampered = cipher.substring(0, 10) + flipped + cipher.substring(11);
        assertThrows(IllegalStateException.class, () -> AesGcmUtil.decrypt(key, tampered));
    }

    @Test
    void sha256HexIs64Chars() {
        assertEquals(64, AesGcmUtil.sha256Hex("abc").length());
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                AesGcmUtil.sha256Hex("abc"));
    }
}
