package com.hqyj.ka.coupon.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Predicate;

/** 优惠券码生成。随机段使用 SecureRandom，单次创建的加密段限制在 4～10 位。 */
public final class CouponCodes {

    public static final int RANDOM_MIN = 4;
    /** 单次创建的加密段上限。批量创建仍可更长，由调用方另行限制。 */
    public static final int SINGLE_RANDOM_MAX = 10;
    public static final int CODE_MAX = 32;

    private static final char[] SAFE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final char[] ALNUM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toCharArray();
    private static final char[] NUMBER_CODE_CHARS = "0123456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private CouponCodes() {}

    public static String normalizeAffix(String value) {
        return value == null ? "" : value.trim().toUpperCase();
    }

    public static char[] alphabet(String charset) {
        if ("NUMERIC".equalsIgnoreCase(charset)) return NUMBER_CODE_CHARS;
        if ("ALNUM".equalsIgnoreCase(charset)) return ALNUM_CODE_CHARS;
        return SAFE_CODE_CHARS;
    }

    public static List<String> generate(String prefix, String suffix, int randomLength, int count,
                                         char[] alphabet, Predicate<String> taken) {
        return generate(prefix, suffix, randomLength, count, alphabet, taken, CouponCodes::randomPart);
    }

    static List<String> generate(String prefix, String suffix, int randomLength, int count,
                                  char[] alphabet, Predicate<String> taken,
                                  BiFunction<Integer, char[], String> randomizer) {
        String head = prefix == null ? "" : prefix;
        String tail = suffix == null ? "" : suffix;
        Set<String> codes = new LinkedHashSet<>();
        int attempts = 0;
        int maxAttempts = count * 30 + 100;
        while (codes.size() < count && attempts++ < maxAttempts) {
            String code = head + randomizer.apply(randomLength, alphabet) + tail;
            if (!codes.contains(code) && !taken.test(code)) {
                codes.add(code);
            }
        }
        if (codes.size() < count) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "可用券码不足,请增加随机位数或更换前缀");
        }
        return new ArrayList<>(codes);
    }

    private static String randomPart(int length, char[] alphabet) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(alphabet[RANDOM.nextInt(alphabet.length)]);
        }
        return sb.toString();
    }
}
