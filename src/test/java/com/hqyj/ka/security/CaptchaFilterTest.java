package com.hqyj.ka.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CaptchaFilterTest {
    @Test
    void mapsEveryProtectedFormToItsFrontendAction() {
        assertEquals("admin_login", CaptchaFilter.actionFor("/api/auth/login"));
        assertEquals("member_register", CaptchaFilter.actionFor("/api/member/auth/register"));
        assertEquals("order_create", CaptchaFilter.actionFor("/api/orders"));
        assertEquals("order_query", CaptchaFilter.actionFor("/api/orders/query"));
        assertEquals("payment", CaptchaFilter.actionFor("/api/pay/create"));
        assertEquals("payment", CaptchaFilter.actionFor("/api/pay/crypto/intent/KA123/tx"));
        assertEquals("article_purchase", CaptchaFilter.actionFor("/api/member/articles/9/purchase"));
        assertNull(CaptchaFilter.actionFor("/api/pay/notify/EPAY"));
        assertEquals("order_query", CaptchaFilter.actionFor("/api/orders/presale-token"));
    }
}
