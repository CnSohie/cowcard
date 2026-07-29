package com.hqyj.ka.common.util;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicInteger;

/** 订单号:yyyyMMddHHmmss + 3位序列 + 3位随机,单机唯一且不可预测遍历。 */
public final class OrderNoGenerator {
    private static final DateTimeFormatter F = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final AtomicInteger SEQ = new AtomicInteger();
    private static final SecureRandom RANDOM = new SecureRandom();

    private OrderNoGenerator() {}

    public static String next() {
        int seq = SEQ.updateAndGet(v -> (v + 1) % 1000);
        return LocalDateTime.now().format(F) + String.format("%03d", seq) + String.format("%03d", RANDOM.nextInt(1000));
    }
}
