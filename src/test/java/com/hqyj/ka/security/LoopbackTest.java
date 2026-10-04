package com.hqyj.ka.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoopbackTest {

    @Test
    void acceptsLoopbackLiteralsOnly() {
        assertTrue(Loopback.matches("127.0.0.1"));
        assertTrue(Loopback.matches("127.0.0.2"));
        assertTrue(Loopback.matches("::1"));
        assertTrue(Loopback.matches("0:0:0:0:0:0:0:1"));
        assertTrue(Loopback.matches("::ffff:127.0.0.1"));
        assertFalse(Loopback.matches("127.0.0.256"));
        assertFalse(Loopback.matches("10.0.0.1"));
        assertFalse(Loopback.matches("203.0.113.8"));
        assertFalse(Loopback.matches("127.0.0.1, 10.0.0.1"));
        assertFalse(Loopback.matches(null));
        assertFalse(Loopback.matches("localhost"));
    }
}
