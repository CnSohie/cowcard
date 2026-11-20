package com.hqyj.ka.catalog.controller;

import com.hqyj.ka.catalog.dto.CatalogDtos.*;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.catalog.service.CatalogService;
import com.hqyj.ka.sysconfig.service.SiteAvailabilityService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.coupon.service.CouponService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.CaptchaService;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.member.service.MemberLevelService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 前台公开接口(无需登录)。 */
@RestController
@RequestMapping("/api/store")
@RequiredArgsConstructor
public class StoreController {
    private final SiteAvailabilityService siteAvailabilityService;

    private final CatalogService catalogService;
    private final ConfigService configService;
    private final CouponService couponService;
    private final ProductRepository productRepository;
    private final MemberLevelService memberLevelService;
    private final CaptchaService captchaService;

    @GetMapping("/availability")
    public ApiResponse<SiteAvailabilityService.Status> availability(jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        return ApiResponse.ok(siteAvailabilityService.status());
    }

    @GetMapping("/categories")
    public ApiResponse<List<CategoryView>> categories() {
        return ApiResponse.ok(catalogService.visibleCategories());
    }

    @GetMapping("/products")
    public ApiResponse<List<ProductCard>> products() {
        return ApiResponse.ok(catalogService.visibleProducts());
    }

    @GetMapping("/products/{id}")
    public ApiResponse<ProductDetail> product(@PathVariable Long id) {
        return ApiResponse.ok(catalogService.productDetail(id));
    }

    @GetMapping("/products/{id}/member-price")
    public ApiResponse<MemberLevelService.PriceResult> memberPrice(@PathVariable Long id, @RequestParam(defaultValue = "1") int quantity, HttpServletRequest http) {
        var product = productRepository.findByIdAndVisibleTrue(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF));
        return ApiResponse.ok(memberLevelService.priceFor((Long) http.getAttribute("mid"), product, quantity));
    }

    public record CouponCheckRequest(@NotBlank String code, @NotNull Long productId,
                                     @jakarta.validation.constraints.Min(1) int quantity) {}
    public record CaptchaAnswerRequest(@NotBlank @Size(max = 128) String challengeId,
                                       @NotBlank @Size(max = 12) String answer,
                                       @NotBlank @Size(max = 40) String action) {}

    /** 优惠码预览:返回折扣与到手价(不核销) */
    @PostMapping("/coupon-check")
    public ApiResponse<Map<String, Object>> couponCheck(@Valid @RequestBody CouponCheckRequest req, HttpServletRequest http) {
        var product = productRepository.findByIdAndVisibleTrue(req.productId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF));
        var price = memberLevelService.priceFor((Long) http.getAttribute("mid"), product, req.quantity());
        var base = price.unitPrice().multiply(java.math.BigDecimal.valueOf(req.quantity()));
        var discount = couponService.preview(req.code(), base, req.productId());
        return ApiResponse.ok(Map.of("discount", discount, "finalAmount", base.subtract(discount)));
    }

    /** 站内图形验证码：生成图片 challenge，答案只保存在限时内存缓存。 */
    @GetMapping("/captcha/challenge")
    public ApiResponse<CaptchaService.BuiltinChallengeView> captchaChallenge(
            @RequestParam @Size(max = 40) String action, HttpServletRequest http) {
        return ApiResponse.ok(captchaService.createBuiltinChallenge(action, RateLimitFilter.clientIp(http)));
    }

    /** challenge 答对后换取短时一次性 proof；真正业务请求仍由 CaptchaFilter 消费 proof。 */
    @PostMapping("/captcha/verify")
    public ApiResponse<Map<String, String>> verifyCaptcha(@Valid @RequestBody CaptchaAnswerRequest req,
                                                           HttpServletRequest http) {
        String token = captchaService.solveBuiltinChallenge(req.challengeId(), req.answer(), req.action(),
                RateLimitFilter.clientIp(http));
        if (token == null) throw new BusinessException(ErrorCode.CAPTCHA_INVALID, "验证码错误或已过期，请换一张重试");
        return ApiResponse.ok(Map.of("token", token));
    }

    /** 站点公开配置(站名/公告等,过滤敏感键) */
    @GetMapping("/site")
    public ApiResponse<Map<String, String>> site() {
        Map<String, String> all = configService.all();
        CaptchaService.PublicConfig captcha = captchaService.publicConfig();
        return ApiResponse.ok(Map.ofEntries(
                Map.entry("siteName", all.getOrDefault("site.name", "Ka 发卡")),
                Map.entry("icon", all.getOrDefault("site.icon", "")),
                Map.entry("announcement", all.getOrDefault("site.announcement", "")),
                Map.entry("contact", all.getOrDefault("site.contact", "")),
                Map.entry("currency", all.getOrDefault("site.currency", "CNY")),
                Map.entry("theme", all.getOrDefault("site.theme", "gptibo")),
                Map.entry("mode", all.getOrDefault("site.mode", "auto")),
                Map.entry("heroSlides", all.getOrDefault("site.hero_slides", "")),
                Map.entry("seoTitle", all.getOrDefault("seo.title", all.getOrDefault("site.name", "Ka 发卡"))),
                Map.entry("seoDescription", all.getOrDefault("seo.description", "自动发卡 · 数字商品秒级到账")),
                Map.entry("seoKeywords", all.getOrDefault("seo.keywords", "")),
                Map.entry("seoOgImage", all.getOrDefault("seo.og_image", "")),
                Map.entry("seoIndex", all.getOrDefault("seo.index", "1")),
                Map.entry("captchaEnabled", captcha.enabled() ? "1" : "0"),
                Map.entry("captchaConfigured", captcha.configured() ? "1" : "0"),
                Map.entry("captchaProvider", captcha.provider()),
                Map.entry("captchaSiteKey", captcha.siteKey()),
                Map.entry("captchaScopes", captcha.scopes())));
    }
}
