package com.hqyj.ka.common.util;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;

/** 订单号:时间前缀 + 96-bit CSPRNG,兼顾排序可读性与防枚举。 */
public final class OrderNoGenerator {
    private static final DateTimeFormatter F = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final SecureRandom RANDOM = new SecureRandom();

    private OrderNoGenerator() {}

    public static String next() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return LocalDateTime.now().format(F)
                + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
