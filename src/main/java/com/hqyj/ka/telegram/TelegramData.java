package com.hqyj.ka.telegram;

import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

@Component
@RequiredArgsConstructor
public class TelegramData {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final AppProperties props;
    private final JsonMapper mapper;

    public String encrypt(Object value) {
        return AesGcmUtil.encrypt(mapper.writeValueAsString(value), props.getSecurity().aesKeyBytes());
    }

    public <T> T decrypt(String value, Class<T> type) {
        return mapper.readValue(AesGcmUtil.decrypt(value, props.getSecurity().aesKeyBytes()), type);
    }

    public static String token() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
