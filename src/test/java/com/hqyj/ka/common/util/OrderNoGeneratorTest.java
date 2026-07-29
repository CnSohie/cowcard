package com.hqyj.ka.common.util;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class OrderNoGeneratorTest {

    @Test
    void formatIs22DigitsStartingWithTimestamp() {
        String orderNo = OrderNoGenerator.next();
        assertEquals(22, orderNo.length());
        assertTrue(orderNo.matches("^20\\d{20}$"), "应以年份开头且全为数字: " + orderNo);
    }

    @Test
    void reasonablyUnique() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) assertTrue(seen.add(OrderNoGenerator.next()));
    }
}
