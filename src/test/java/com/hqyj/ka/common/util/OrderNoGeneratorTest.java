package com.hqyj.ka.common.util;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class OrderNoGeneratorTest {

    @Test
    void formatIsTimestampPlusUrlSafeRandomSuffix() {
        String orderNo = OrderNoGenerator.next();
        assertEquals(30, orderNo.length());
        assertTrue(orderNo.matches("^20\\d{12}[A-Za-z0-9_-]{16}$"), "应为时间前缀 + URL-safe 随机后缀: " + orderNo);
    }

    @Test
    void reasonablyUnique() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) assertTrue(seen.add(OrderNoGenerator.next()));
    }
}
