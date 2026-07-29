package com.hqyj.ka.member.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.member.entity.MemberLevel;
import com.hqyj.ka.member.entity.MemberLevelPrice;
import com.hqyj.ka.member.service.MemberLevelService;
import com.hqyj.ka.security.RateLimitFilter;
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

    public record SavePriceRequest(Long productId, BigDecimal price) {}
    public record AssignRequest(Long levelId) {}

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<List<MemberLevel>> levels() {
        return ApiResponse.ok(levelService.levels());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<MemberLevel> save(@RequestBody MemberLevel req, HttpServletRequest http) {
        MemberLevel saved = levelService.saveLevel(req);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_SAVE",
                "level:" + saved.getId(), RateLimitFilter.clientIp(http), saved.getSlug());
        return ApiResponse.ok(saved);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> delete(@PathVariable Long id, HttpServletRequest http) {
        levelService.deleteLevel(id);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_DELETE",
                "level:" + id, RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @PostMapping("/backfill-default")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> backfill(HttpServletRequest http) {
        levelService.backfillDefault();
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_BACKFILL",
                "members", RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @PostMapping("/members/{memberId}/assign")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> assign(@PathVariable Long memberId, @RequestBody AssignRequest req,
                                    HttpServletRequest http) {
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
        MemberLevelPrice saved = levelService.savePrice(levelId, req.productId(), req.price());
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_PRICE_SAVE",
                "level:" + levelId, RateLimitFilter.clientIp(http), "product:" + req.productId());
        return ApiResponse.ok(saved);
    }

    @DeleteMapping("/{levelId}/prices/{productId}")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member-level:manage','member:manage')")
    public ApiResponse<Void> deletePrice(@PathVariable Long levelId, @PathVariable Long productId,
                                         HttpServletRequest http) {
        levelService.deletePrice(levelId, productId);
        auditService.record(String.valueOf(http.getAttribute("uname")), "MEMBER_LEVEL_PRICE_DELETE",
                "level:" + levelId, RateLimitFilter.clientIp(http), "product:" + productId);
        return ApiResponse.ok();
    }
}
