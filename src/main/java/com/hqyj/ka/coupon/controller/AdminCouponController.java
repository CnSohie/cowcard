package com.hqyj.ka.coupon.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.coupon.entity.Coupon;
import com.hqyj.ka.coupon.repo.CouponRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 优惠券管理:独立营销权限,批量创建仍需 2FA。 */
@RestController
@RequestMapping("/api/admin/coupons")
@RequiredArgsConstructor
public class AdminCouponController {

    private static final char[] SAFE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final char[] ALNUM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toCharArray();
    private static final char[] NUMBER_CODE_CHARS = "0123456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final CouponRepository couponRepository;
    private final com.hqyj.ka.coupon.service.CouponScopeService couponScopeService;
    private final AuthService authService;
    private final AuditService auditService;

    public record SaveCouponRequest(
            Long id,
            @NotBlank @Size(min = 4, max = 32) @Pattern(regexp = "[A-Za-z0-9-]+", message = "券码仅限字母数字与横线") String code,
            @NotNull Coupon.Type type,
            @NotNull @DecimalMin("0.01") BigDecimal value,
            @DecimalMin("0") BigDecimal minAmount,
            @Min(0) int totalLimit,
            LocalDateTime expireAt,
            @Positive Long productId,
            boolean enabled) {}

    public record BatchCreateCouponRequest(
            @Size(max = 16) @Pattern(regexp = "[A-Za-z0-9-]*", message = "前缀仅限字母数字与横线") String prefix,
            @Size(max = 16) @Pattern(regexp = "[A-Za-z0-9-]*", message = "后缀仅限字母数字与横线") String suffix,
            @Min(1) @Max(500) int count,
            @Min(4) @Max(24) int randomLength,
            String charset,
            @NotNull Coupon.Type type,
            @NotNull @DecimalMin("0.01") BigDecimal value,
            @DecimalMin("0") BigDecimal minAmount,
            @Min(0) int totalLimit,
            LocalDateTime expireAt,
            @Positive Long productId,
            boolean enabled,
            String password,
            String totpCode) {}

    public record BatchCreateCouponResponse(int created, List<String> codes) {}

    @GetMapping("/products")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    public ApiResponse<List<com.hqyj.ka.coupon.service.CouponScopeService.ProductOption>> products() {
        return ApiResponse.ok(couponScopeService.options());
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:read','coupon:manage','product:read')")
    public ApiResponse<List<Coupon>> list() {
        return ApiResponse.ok(couponRepository.findAll(Sort.by(Sort.Direction.DESC, "id")));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    @Transactional
    public ApiResponse<Coupon> save(@Valid @RequestBody SaveCouponRequest req, HttpServletRequest http) {
        couponScopeService.validate(req.productId());
        String ip = RateLimitFilter.clientIp(http);
        Coupon coupon = req.id() == null ? new Coupon()
                : couponRepository.findById(req.id()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        applyCoupon(coupon, req.code().trim().toUpperCase(), req.type(), req.value(), req.minAmount(),
                req.totalLimit(), req.expireAt(), req.enabled(), req.id());
        coupon.setProductId(req.productId());
        Coupon saved = couponRepository.save(coupon);
        auditService.record((String) http.getAttribute("uname"),
                req.id() == null ? "COUPON_CREATE" : "COUPON_UPDATE",
                "coupon:" + saved.getCode(), ip, "type=" + saved.getType() + ",value=" + saved.getValue() + ",productId=" + saved.getProductId());
        return ApiResponse.ok(saved);
    }

    @PostMapping("/batch")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    @Transactional
    public ApiResponse<BatchCreateCouponResponse> batchCreate(@Valid @RequestBody BatchCreateCouponRequest req,
                                                              HttpServletRequest http) {
        couponScopeService.validate(req.productId());
        String ip = RateLimitFilter.clientIp(http);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "coupon-batch-create:" + req.count(), ip);

        validateDiscount(req.type(), req.value());
        String prefix = req.prefix() == null ? "" : req.prefix().trim().toUpperCase();
        String suffix = req.suffix() == null ? "" : req.suffix().trim().toUpperCase();
        if (prefix.length() + req.randomLength() + suffix.length() > 32) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "前缀 + 随机位数 + 后缀不能超过 32 位");
        }

        Set<String> codes = generateCodes(prefix, suffix, req.randomLength(), req.count(), alphabet(req.charset()));
        List<Coupon> coupons = new ArrayList<>(codes.size());
        for (String code : codes) {
            Coupon coupon = new Coupon();
            applyCoupon(coupon, code, req.type(), req.value(), req.minAmount(), req.totalLimit(),
                    req.expireAt(), req.enabled(), null);
            coupon.setProductId(req.productId());
            coupons.add(coupon);
        }
        couponRepository.saveAll(coupons);
        auditService.record((String) http.getAttribute("uname"), "COUPON_BATCH_CREATE", "coupon",
                ip, "count=" + coupons.size() + ",prefix=" + prefix + ",suffix=" + suffix + ",type=" + req.type()
                        + ",value=" + req.value() + ",productId=" + req.productId());
        return ApiResponse.ok(new BatchCreateCouponResponse(coupons.size(), new ArrayList<>(codes)));
    }

    private void applyCoupon(Coupon coupon, String code, Coupon.Type type, BigDecimal value, BigDecimal minAmount,
                             int totalLimit, LocalDateTime expireAt, boolean enabled, Long editingId) {
        validateDiscount(type, value);
        if ((editingId == null && couponRepository.existsByCode(code))
                || (editingId != null && couponRepository.existsByCodeAndIdNot(code, editingId))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "优惠券码已存在");
        }
        coupon.setCode(code);
        coupon.setType(type);
        coupon.setValue(value);
        coupon.setMinAmount(minAmount == null ? BigDecimal.ZERO : minAmount);
        coupon.setTotalLimit(totalLimit);
        coupon.setExpireAt(expireAt);
        coupon.setEnabled(enabled);
    }

    private void validateDiscount(Coupon.Type type, BigDecimal value) {
        if (type == Coupon.Type.PERCENT && value.compareTo(new BigDecimal("100")) > 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "折扣百分比不能超过 100");
        }
    }

    private Set<String> generateCodes(String prefix, String suffix, int randomLength, int count, char[] alphabet) {
        Set<String> codes = new LinkedHashSet<>();
        int attempts = 0;
        int maxAttempts = count * 30 + 100;
        while (codes.size() < count && attempts++ < maxAttempts) {
            String code = prefix + randomSuffix(randomLength, alphabet) + suffix;
            if (!codes.contains(code) && !couponRepository.existsByCode(code)) {
                codes.add(code);
            }
        }
        if (codes.size() < count) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "可用券码不足,请增加随机位数或更换前缀");
        }
        return codes;
    }

    private String randomSuffix(int length, char[] alphabet) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(alphabet[RANDOM.nextInt(alphabet.length)]);
        }
        return sb.toString();
    }

    private char[] alphabet(String charset) {
        if ("NUMERIC".equalsIgnoreCase(charset)) return NUMBER_CODE_CHARS;
        if ("ALNUM".equalsIgnoreCase(charset)) return ALNUM_CODE_CHARS;
        return SAFE_CODE_CHARS;
    }
}
