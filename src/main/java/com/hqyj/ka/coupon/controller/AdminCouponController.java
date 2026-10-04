package com.hqyj.ka.coupon.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.coupon.entity.Coupon;
import com.hqyj.ka.coupon.repo.CouponRepository;
import com.hqyj.ka.coupon.service.CouponCodes;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/** 优惠券管理:独立营销权限,批量创建仍需 2FA。单次创建可按格式头生成加密段,列表支持勾选删除。 */
@RestController
@RequestMapping("/api/admin/coupons")
@RequiredArgsConstructor
public class AdminCouponController {

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
            @Positive(message = "请选择适用商品") Long productId,
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
            @Positive(message = "请选择适用商品") Long productId,
            boolean enabled,
            String password,
            String totpCode) {}

    public record BatchCreateCouponResponse(int created, List<String> codes) {}

    /** 单次创建:格式头可空,加密段 4～10 位,返回尚未落库的券码。 */
    public record GenerateCouponCodeRequest(
            @Size(max = 16) @Pattern(regexp = "[A-Za-z0-9-]*", message = "格式头仅限字母数字与横线") String prefix,
            @Min(value = CouponCodes.RANDOM_MIN, message = "加密位数至少 4 位")
            @Max(value = CouponCodes.SINGLE_RANDOM_MAX, message = "加密位数不能超过 10 位") int randomLength,
            String charset) {}

    public record GenerateCouponCodeResponse(String code) {}

    public record DeleteCouponsRequest(
            @NotEmpty(message = "请选择要删除的优惠券")
            @Size(max = 200, message = "一次最多删除 200 张") List<@NotNull @Positive Long> ids) {}

    public record DeleteCouponsResponse(int deleted) {}

    @GetMapping("/products")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    public ApiResponse<List<com.hqyj.ka.coupon.service.CouponScopeService.ProductOption>> products() {
        return ApiResponse.ok(couponScopeService.options());
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:read','coupon:manage','product:read')")
    public ApiResponse<List<Coupon>> list() {
        List<Coupon> coupons = couponRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        var names = couponScopeService.namesOf(coupons.stream().map(Coupon::getProductId).toList());
        coupons.forEach(coupon -> {
            if (coupon.getProductId() != null) coupon.setProductName(names.get(coupon.getProductId()));
        });
        return ApiResponse.ok(coupons);
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
        if (saved.getProductId() != null) {
            saved.setProductName(couponScopeService.namesOf(List.of(saved.getProductId())).get(saved.getProductId()));
        }
        auditService.record((String) http.getAttribute("uname"),
                req.id() == null ? "COUPON_CREATE" : "COUPON_UPDATE",
                "coupon:" + saved.getCode(), ip, "type=" + saved.getType() + ",value=" + saved.getValue() + ",productId=" + saved.getProductId());
        return ApiResponse.ok(saved);
    }

    @PostMapping("/generate")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    public ApiResponse<GenerateCouponCodeResponse> generate(@Valid @RequestBody GenerateCouponCodeRequest req) {
        String prefix = CouponCodes.normalizeAffix(req.prefix());
        if (prefix.length() + req.randomLength() > CouponCodes.CODE_MAX) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "格式头 + 加密位数不能超过 32 位");
        }
        String code = CouponCodes.generate(prefix, "", req.randomLength(), 1,
                CouponCodes.alphabet(req.charset()), couponRepository::existsByCode).get(0);
        return ApiResponse.ok(new GenerateCouponCodeResponse(code));
    }

    /** 勾选删除。订单只留券码字符串,删除后历史订单不变,券码立即不能再核销。 */
    @PostMapping("/delete")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('coupon:manage','product:write')")
    @Transactional
    public ApiResponse<DeleteCouponsResponse> deleteSelected(@Valid @RequestBody DeleteCouponsRequest req,
                                                              HttpServletRequest http) {
        List<Long> ids = req.ids().stream().distinct().toList();
        List<Coupon> found = couponRepository.findAllById(ids);
        if (found.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "没有可删除的优惠券");
        }
        couponRepository.deleteAll(found);
        String sample = found.stream().map(Coupon::getCode).limit(20).collect(Collectors.joining(","));
        if (found.size() > 20) sample = sample + "…";
        auditService.record((String) http.getAttribute("uname"), "COUPON_DELETE", "coupon",
                RateLimitFilter.clientIp(http), "count=" + found.size() + ",codes=" + sample);
        return ApiResponse.ok(new DeleteCouponsResponse(found.size()));
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
        String prefix = CouponCodes.normalizeAffix(req.prefix());
        String suffix = CouponCodes.normalizeAffix(req.suffix());
        if (prefix.length() + req.randomLength() + suffix.length() > CouponCodes.CODE_MAX) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "前缀 + 随机位数 + 后缀不能超过 32 位");
        }

        List<String> codes = CouponCodes.generate(prefix, suffix, req.randomLength(), req.count(),
                CouponCodes.alphabet(req.charset()), couponRepository::existsByCode);
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
        return ApiResponse.ok(new BatchCreateCouponResponse(coupons.size(), codes));
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
}
