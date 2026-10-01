package com.hqyj.ka.member.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.member.entity.MemberLevel;
import com.hqyj.ka.member.entity.MemberLevelPrice;
import com.hqyj.ka.member.service.MemberLevelService;
import com.hqyj.ka.order.dto.OrderDtos.SensitiveAuthRequest;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/admin/member-levels")
@RequiredArgsConstructor
public class AdminMemberLevelController {
    private final MemberLevelService levelService;
    private final AuditService auditService;
    private final AuthService authService;

    public record SaveLevelRequest(Long id, String name, String slug, String icon, BigDecimal discountRate,
                                   BigDecimal rechargeThreshold, BigDecimal spendThreshold, int sortWeight,
                                   boolean defaultLevel, boolean enabled, boolean manualOnly, String password, String totpCode) {}
    public record SavePriceRequest(Long productId, BigDecimal price, String password, String totpCode) {}
    public record AssignRequest(Long levelId, String password, String totpCode) {}

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<List<MemberLevel>> levels() {
        return ApiResponse.ok(levelService.levels());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<MemberLevel> save(@RequestBody SaveLevelRequest req, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-save", RateLimitFilter.clientIp(http));
        MemberLevel level = new MemberLevel();
        level.setId(req.id());
        level.setName(req.name());
        level.setSlug(req.slug());
        level.setIcon(req.icon());
        level.setDiscountRate(req.discountRate());
        level.setRechargeThreshold(req.rechargeThreshold());
        level.setSpendThreshold(req.spendThreshold());
        level.setSortWeight(req.sortWeight());
        level.setDefaultLevel(req.defaultLevel());
        level.setEnabled(req.enabled());
        level.setManualOnly(req.manualOnly());
        MemberLevel saved = levelService.saveLevel(level);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_SAVE",
                "level:" + saved.getId(), RateLimitFilter.clientIp(http), saved.getSlug());
        return ApiResponse.ok(saved);
    }

    @PostMapping("/{id}/delete")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> delete(@PathVariable Long id, @RequestBody SensitiveAuthRequest req,
                                    HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-delete", RateLimitFilter.clientIp(http));
        levelService.deleteLevel(id);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_DELETE",
                "level:" + id, RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @PostMapping("/backfill-default")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> backfill(@RequestBody SensitiveAuthRequest req, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-backfill", RateLimitFilter.clientIp(http));
        levelService.backfillDefault();
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_BACKFILL",
                "members", RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @PostMapping("/members/{memberId}/assign")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> assign(@PathVariable Long memberId, @RequestBody AssignRequest req,
                                    HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-assign", RateLimitFilter.clientIp(http));
        levelService.assignLevel(memberId, req.levelId());
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_ASSIGN",
                "member:" + memberId, RateLimitFilter.clientIp(http), "level:" + req.levelId());
        return ApiResponse.ok();
    }

    @GetMapping("/{levelId}/prices")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<List<MemberLevelPrice>> prices(@PathVariable Long levelId) {
        return ApiResponse.ok(levelService.prices(levelId));
    }

    @PostMapping("/{levelId}/prices")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<MemberLevelPrice> savePrice(@PathVariable Long levelId, @RequestBody SavePriceRequest req,
                                                   HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-price-save", RateLimitFilter.clientIp(http));
        MemberLevelPrice saved = levelService.savePrice(levelId, req.productId(), req.price());
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_PRICE_SAVE",
                "level:" + levelId, RateLimitFilter.clientIp(http), "product:" + req.productId());
        return ApiResponse.ok(saved);
    }

    @PostMapping("/{levelId}/prices/{productId}/delete")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> deletePrice(@PathVariable Long levelId, @PathVariable Long productId,
                                         @RequestBody SensitiveAuthRequest req,
                                         HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-level-price-delete", RateLimitFilter.clientIp(http));
        levelService.deletePrice(levelId, productId);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_PRICE_DELETE",
                "level:" + levelId, RateLimitFilter.clientIp(http), "product:" + productId);
        return ApiResponse.ok();
    }
}
