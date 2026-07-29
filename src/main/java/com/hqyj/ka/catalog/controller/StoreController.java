package com.hqyj.ka.catalog.controller;

import com.hqyj.ka.catalog.dto.CatalogDtos.*;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.catalog.service.CatalogService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.coupon.service.CouponService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import com.hqyj.ka.common.ApiResponse;
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

    private final CatalogService catalogService;
    private final ConfigService configService;
    private final CouponService couponService;
    private final ProductRepository productRepository;
    private final MemberLevelService memberLevelService;

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
    public ApiResponse<MemberLevelService.PriceResult> memberPrice(@PathVariable Long id, HttpServletRequest http) {
        var product = productRepository.findByIdAndVisibleTrue(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF));
        return ApiResponse.ok(memberLevelService.priceFor((Long) http.getAttribute("mid"), product));
    }

    public record CouponCheckRequest(@NotBlank String code, @NotNull Long productId,
                                     @jakarta.validation.constraints.Min(1) int quantity) {}

    /** 优惠码预览:返回折扣与到手价(不核销) */
    @PostMapping("/coupon-check")
    public ApiResponse<Map<String, Object>> couponCheck(@Valid @RequestBody CouponCheckRequest req) {
        var product = catalogService.productDetail(req.productId());
        var base = product.price().multiply(java.math.BigDecimal.valueOf(req.quantity()));
        var discount = couponService.preview(req.code(), base);
        return ApiResponse.ok(Map.of("discount", discount, "finalAmount", base.subtract(discount)));
    }

    /** 站点公开配置(站名/公告等,过滤敏感键) */
    @GetMapping("/site")
    public ApiResponse<Map<String, String>> site() {
        Map<String, String> all = configService.all();
        return ApiResponse.ok(Map.ofEntries(
                Map.entry("siteName", all.getOrDefault("site.name", "Ka 发卡")),
                Map.entry("announcement", all.getOrDefault("site.announcement", "")),
                Map.entry("contact", all.getOrDefault("site.contact", "")),
                Map.entry("currency", all.getOrDefault("site.currency", "CNY")),
                Map.entry("theme", all.getOrDefault("site.theme", "mint")),
                Map.entry("mode", all.getOrDefault("site.mode", "auto")),
                Map.entry("seoTitle", all.getOrDefault("seo.title", all.getOrDefault("site.name", "Ka 发卡"))),
                Map.entry("seoDescription", all.getOrDefault("seo.description", "自动发卡 · 数字商品秒级到账")),
                Map.entry("seoKeywords", all.getOrDefault("seo.keywords", "")),
                Map.entry("seoOgImage", all.getOrDefault("seo.og_image", "")),
                Map.entry("seoIndex", all.getOrDefault("seo.index", "1"))));
    }
}
