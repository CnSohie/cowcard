package com.hqyj.ka.card.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.card.entity.CardSecret;
import com.hqyj.ka.card.repo.CardSecretRepository;
import com.hqyj.ka.card.service.CardService;
import com.hqyj.ka.catalog.service.InventoryService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.order.dto.OrderDtos.SensitiveAuthRequest;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/cards")
@RequiredArgsConstructor
public class AdminCardController {

    private final CardService cardService;
    private final CardSecretRepository cardRepository;
    private final InventoryService inventoryService;
    private final AuditService auditService;
    private final AuthService authService;

    public record ImportRequest(@NotNull Long productId, @NotEmpty @Size(max = 10000, message = "单次最多导入 10000 条") List<String> lines) {}
    public record CardView(Long id, Long productId, String status, Long orderId,
                           LocalDateTime createdAt, LocalDateTime soldAt) {}
    public record StatusRequest(@NotNull String status) {}
    public record CardContentView(Long id, String content, boolean editable) {}
    public record UpdateContentRequest(@NotNull String content) {}

    @PostMapping("/unlock")
    @PreAuthorize("hasAuthority('card:read')")
    public ApiResponse<Void> unlock(@RequestBody SensitiveAuthRequest auth, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "card-management-unlock", RateLimitFilter.clientIp(http));
        auditService.record((String) http.getAttribute("uname"), "CARD_MANAGEMENT_UNLOCK",
                "cards", RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @GetMapping
    @PreAuthorize("hasAuthority('card:read')")
    public ApiResponse<PageResult<CardView>> list(@RequestParam Long productId,
                                                  @RequestParam(required = false) String status,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size,
                                                  HttpServletRequest http) {
        requireUnlocked(http);
        PageRequest pr = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100),
                Sort.by(Sort.Direction.DESC, "id"));
        Page<CardSecret> result;
        if (status != null && !status.isBlank()) {
            CardSecret.Status st = parseStatus(status);
            result = cardRepository.findByProductIdAndStatusOrderByIdDesc(productId, st, pr);
        } else {
            result = cardRepository.findByProductIdOrderByIdDesc(productId, pr);
        }
        return ApiResponse.ok(PageResult.of(result, AdminCardController::toView));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('card:read')")
    public ApiResponse<Map<String, Long>> stats(@RequestParam Long productId, HttpServletRequest http) {
        requireUnlocked(http);
        long available = cardService.availableCount(productId);
        long sellable = inventoryService.sellableStock(productId);
        return ApiResponse.ok(Map.of(
                "SELLABLE", sellable,
                "RESERVED", Math.max(0, available - sellable),
                "AVAILABLE", available,
                "SOLD", cardRepository.countByProductIdAndStatus(productId, CardSecret.Status.SOLD),
                "DISABLED", cardRepository.countByProductIdAndStatus(productId, CardSecret.Status.DISABLED)));
    }

    /** 批量导入卡密(文本行),导入后同步冗余库存。 */
    @PostMapping("/import")
    @PreAuthorize("hasAuthority('card:write')")
    @CacheEvict(cacheNames = "products", allEntries = true)
    @Transactional
    public ApiResponse<Map<String, Object>> importCards(@Valid @RequestBody ImportRequest req, HttpServletRequest http) {
        requireUnlocked(http);
        int[] result = cardService.importCards(req.productId(), req.lines());
        inventoryService.syncAutoCardStock(req.productId());
        auditService.record((String) http.getAttribute("uname"), "CARD_IMPORT",
                "product:" + req.productId(), RateLimitFilter.clientIp(http),
                "{\"imported\":" + result[0] + ",\"dup\":" + result[1] + "}");
        return ApiResponse.ok(Map.of("imported", result[0], "duplicated", result[1]));
    }

    @GetMapping("/count")
    @PreAuthorize("hasAuthority('card:read')")
    public ApiResponse<Long> availableCount(@RequestParam Long productId) {
        return ApiResponse.ok(cardService.availableCount(productId));
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('card:write')")
    @CacheEvict(cacheNames = "products", allEntries = true)
    @Transactional
    public ApiResponse<CardView> updateStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest req,
                                              HttpServletRequest http) {
        requireUnlocked(http);
        CardSecret card = cardRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (card.getStatus() == CardSecret.Status.SOLD) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已售卡密不允许修改状态");
        }
        CardSecret.Status next = parseStatus(req.status());
        if (next == CardSecret.Status.SOLD) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "不能手动改为已售状态");
        }
        card.setStatus(next);
        syncStock(card.getProductId());
        auditService.record((String) http.getAttribute("uname"), "CARD_STATUS_UPDATE",
                "card:" + id, RateLimitFilter.clientIp(http), next.name());
        return ApiResponse.ok(toView(card));
    }

    /** 受控查看卡密明文:仅卡密管理 2FA 信任期内可用,全程审计。 */
    @GetMapping("/{id}/content")
    @PreAuthorize("hasAuthority('card:read')")
    @Transactional(readOnly = true)
    public ApiResponse<CardContentView> content(@PathVariable Long id, HttpServletRequest http) {
        requireUnlocked(http);
        CardSecret card = cardRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        auditService.record((String) http.getAttribute("uname"), "CARD_VIEW_CONTENT",
                "card:" + id, RateLimitFilter.clientIp(http), "status:" + card.getStatus().name());
        return ApiResponse.ok(new CardContentView(id, cardService.decryptOne(card),
                card.getStatus() != CardSecret.Status.SOLD));
    }

    /** 编辑未售卡密明文:仍加密落库;已售卡密禁止编辑,避免破坏订单交付记录。 */
    @PutMapping("/{id}/content")
    @PreAuthorize("hasAuthority('card:write')")
    @Transactional
    public ApiResponse<CardContentView> updateContent(@PathVariable Long id,
                                                      @Valid @RequestBody UpdateContentRequest req,
                                                      HttpServletRequest http) {
        requireUnlocked(http);
        CardSecret card = cardRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (card.getStatus() == CardSecret.Status.SOLD) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已售卡密不允许编辑");
        }
        cardService.updateContent(card, req.content());
        auditService.record((String) http.getAttribute("uname"), "CARD_CONTENT_UPDATE",
                "card:" + id, RateLimitFilter.clientIp(http), "product:" + card.getProductId());
        return ApiResponse.ok(new CardContentView(id, cardService.decryptOne(card), true));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('card:write')")
    @CacheEvict(cacheNames = "products", allEntries = true)
    @Transactional
    public ApiResponse<Void> delete(@PathVariable Long id, HttpServletRequest http) {
        requireUnlocked(http);
        CardSecret card = cardRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (card.getStatus() == CardSecret.Status.SOLD) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "已售卡密不允许删除");
        }
        Long productId = card.getProductId();
        cardRepository.delete(card);
        syncStock(productId);
        auditService.record((String) http.getAttribute("uname"), "CARD_DELETE",
                "card:" + id, RateLimitFilter.clientIp(http), "product:" + productId);
        return ApiResponse.ok();
    }

    private void syncStock(Long productId) {
        inventoryService.syncAutoCardStock(productId);
    }

    private void requireUnlocked(HttpServletRequest http) {
        if (!authService.sensitiveTrusted((Long) http.getAttribute("uid"))) {
            throw new BusinessException(ErrorCode.TOTP_REQUIRED, "请先完成卡密管理 2FA 验证");
        }
    }

    private static CardView toView(CardSecret c) {
        return new CardView(c.getId(), c.getProductId(), c.getStatus().name(),
                c.getOrderId(), c.getCreatedAt(), c.getSoldAt());
    }

    private static CardSecret.Status parseStatus(String raw) {
        try {
            return CardSecret.Status.valueOf(raw.trim().toUpperCase());
        } catch (RuntimeException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "卡密状态无效");
        }
    }
}
