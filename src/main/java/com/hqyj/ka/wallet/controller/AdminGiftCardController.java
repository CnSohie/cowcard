package com.hqyj.ka.wallet.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.wallet.dto.WalletDtos.GenerateGiftCardsRequest;
import com.hqyj.ka.wallet.dto.WalletDtos.GiftCardView;
import com.hqyj.ka.wallet.entity.GiftCard;
import com.hqyj.ka.wallet.repo.GiftCardRepository;
import com.hqyj.ka.wallet.service.GiftCardService;
import com.hqyj.ka.order.dto.OrderDtos.SensitiveAuthRequest;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/gift-cards")
@RequiredArgsConstructor
public class AdminGiftCardController {
    private final GiftCardRepository giftCardRepository;
    private final GiftCardService giftCardService;
    private final AuditService auditService;
    private final AuthService authService;

    public record ToggleGiftCardRequest(boolean enabled, String password, String totpCode) {}

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('gift-card:read','gift-card:manage','member:manage')")
    public ApiResponse<PageResult<GiftCardView>> list(@RequestParam(required = false) String q,
                                                      @RequestParam(defaultValue = "0") int page,
                                                      @RequestParam(defaultValue = "20") int size,
                                                      HttpServletRequest http) {
        requireUnlocked(http);
        PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by(Sort.Direction.DESC, "id"));
        var result = (q == null || q.isBlank())
                ? giftCardRepository.findAll(pr)
                : giftCardRepository.findByBatchNoContainingIgnoreCaseOrNameContainingIgnoreCaseOrCodeContainingIgnoreCase(q, q, q, pr);
        return ApiResponse.ok(PageResult.of(result, this::view));
    }

    @PostMapping("/generate")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('gift-card:manage','member:manage')")
    public ApiResponse<List<GiftCardView>> generate(@Valid @RequestBody GenerateGiftCardsRequest req,
                                                    HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "gift-card-generate", RateLimitFilter.clientIp(http));
        List<GiftCard> cards = giftCardService.generate(req.name(), req.amount(), req.quantity(), req.expireAt());
        auditService.record(String.valueOf(http.getAttribute("uname")), "GIFT_CARD_GENERATE",
                "gift-card", RateLimitFilter.clientIp(http),
                "{\"quantity\":" + req.quantity() + ",\"amount\":\"" + req.amount() + "\"}");
        return ApiResponse.ok(cards.stream().map(this::view).toList());
    }

    @PostMapping("/{id}/toggle")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('gift-card:manage','member:manage')")
    public ApiResponse<GiftCardView> toggle(@PathVariable Long id, @RequestBody ToggleGiftCardRequest req,
                                            HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "gift-card-toggle", RateLimitFilter.clientIp(http));
        GiftCard card = giftCardService.toggle(id, req.enabled());
        auditService.record(String.valueOf(http.getAttribute("uname")), "GIFT_CARD_TOGGLE",
                "gift-card:" + id, RateLimitFilter.clientIp(http), card.getStatus().name());
        return ApiResponse.ok(view(card));
    }

    @PostMapping("/{id}/delete")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('gift-card:manage','member:manage')")
    public ApiResponse<Void> delete(@PathVariable Long id, @RequestBody SensitiveAuthRequest req,
                                    HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "gift-card-delete", RateLimitFilter.clientIp(http));
        giftCardService.delete(id);
        auditService.record(String.valueOf(http.getAttribute("uname")), "GIFT_CARD_DELETE",
                "gift-card:" + id, RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    private GiftCardView view(GiftCard c) {
        return new GiftCardView(c.getId(), c.getBatchNo(), c.getName(), giftCardService.revealCode(c), c.getAmount(),
                c.getStatus().name(), c.getRedeemedBy(), c.getRedeemedAt(), c.getExpireAt(), c.getCreatedAt());
    }

    private void requireUnlocked(HttpServletRequest http) {
        if (!authService.sensitiveTrusted((Long) http.getAttribute("uid"))) {
            throw new com.hqyj.ka.common.BusinessException(
                    com.hqyj.ka.common.ErrorCode.TOTP_REQUIRED, "请先完成 2FA 验证后查看礼品卡");
        }
    }
}
