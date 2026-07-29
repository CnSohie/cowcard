package com.hqyj.ka.payment.epay;

import org.junit.jupiter.api.Test;

import java.util.TreeMap;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EpaySignTest {

    @Test
    void joinSkipsSignAndEmptyAndSortsAscii() {
        TreeMap<String, String> params = new TreeMap<>();
        params.put("pid", "1000");
        params.put("out_trade_no", "20260101120000123");
        params.put("money", "10.00");
        params.put("sign", "should-skip");
        params.put("sign_type", "MD5");
        params.put("empty", "");
        assertEquals("money=10.00&out_trade_no=20260101120000123&pid=1000",
                EpayStrategy.joinForSign(params));
    }

    @Test
    void md5KnownVector() {
        assertEquals("900150983cd24fb0d6963f7d28e17f72", EpayStrategy.md5("abc"));
    }
}
