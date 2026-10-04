package com.hqyj.ka.coupon.service;

import com.hqyj.ka.common.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CouponCodesTest {

    @Test
    void singleEncryptedPartStaysWithinTenCharacters() {
        List<String> codes = CouponCodes.generate("VIP", "", CouponCodes.SINGLE_RANDOM_MAX, 8,
                CouponCodes.alphabet("SAFE"), code -> false);
        assertEquals(8, new HashSet<>(codes).size());
        for (String code : codes) {
            assertTrue(code.startsWith("VIP"));
            String random = code.substring(3);
            assertEquals(10, random.length());
            assertTrue(random.chars().allMatch(ch -> "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".indexOf(ch) >= 0));
            assertTrue(random.chars().noneMatch(ch -> ch == '0' || ch == 'O' || ch == '1' || ch == 'I'));
        }
    }

    @Test
    void numericCharsetAndAffixesArePreserved() {
        List<String> codes = CouponCodes.generate("KA-", "-9", 6, 5,
                CouponCodes.alphabet("NUMERIC"), code -> false);
        assertEquals(5, codes.size());
        assertTrue(codes.stream().allMatch(code -> code.matches("KA-\\d{6}-9")));
    }

    @Test
    void retriesWhenGeneratedCodeAlreadyExists() {
        AtomicInteger n = new AtomicInteger();
        List<String> codes = CouponCodes.generate("A", "", 4, 1, CouponCodes.alphabet("NUMERIC"),
                code -> code.endsWith("0000"),
                (len, alphabet) -> n.getAndIncrement() == 0 ? "0000" : "1234");
        assertEquals(List.of("A1234"), codes);
    }

    @Test
    void failsWhenUniqueCodesRunOut() {
        BusinessException ex = assertThrows(BusinessException.class, () ->
                CouponCodes.generate("", "", 4, 2, CouponCodes.alphabet("NUMERIC"),
                        code -> true, (len, alphabet) -> "0000"));
        assertEquals("可用券码不足,请增加随机位数或更换前缀", ex.getMessage());
    }

    @Test
    void normalizeAffixTrimsAndUppercases() {
        assertEquals("", CouponCodes.normalizeAffix(null));
        assertEquals("VIP-", CouponCodes.normalizeAffix(" vip- "));
    }
}
