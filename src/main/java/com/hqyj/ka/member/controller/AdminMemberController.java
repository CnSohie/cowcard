package com.hqyj.ka.member.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import com.hqyj.ka.wallet.entity.WalletAccount;
import com.hqyj.ka.wallet.repo.WalletAccountRepository;
import com.hqyj.ka.wallet.service.WalletService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** 会员管理:查看、封禁、余额冻结拆分权限。 */
@RestController
@RequestMapping("/api/admin/members")
@RequiredArgsConstructor
public class AdminMemberController {

    private final MemberRepository memberRepository;
    private final WalletAccountRepository accountRepository;
    private final AuditService auditService;
    private final AuthService authService;
    private final WalletService walletService;

    public record AdminMemberView(Long id, String email, String nickname, boolean enabled,
                                  String inviteCode, Long inviterId, BigDecimal balance,
                                  BigDecimal frozen, BigDecimal shoppingBalance, BigDecimal withdrawableBalance,
                                  BigDecimal shoppingFrozen, BigDecimal withdrawableFrozen, BigDecimal withdrawalFrozen,
                                  Long levelId, BigDecimal totalRecharge,
                                  BigDecimal totalSpend, LocalDateTime lastLoginAt, LocalDateTime createdAt) {}

    public record FreezeBalanceRequest(BigDecimal amount, String note, String password, String totpCode) {}
    public record ToggleMemberRequest(String password, String totpCode) {}

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member:read','member:manage')")
    public ApiResponse<PageResult<AdminMemberView>> list(@RequestParam(required = false) String q,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(page, Math.min(size, 100), Sort.by(Sort.Direction.DESC, "id"));
        Page<Member> result = (q != null && !q.isBlank())
                ? memberRepository.findByEmailContainingIgnoreCaseOrNicknameContainingIgnoreCase(q.trim(), q.trim(), pr)
                : memberRepository.findAll(pr);
        // 批量取钱包,避免 N+1
        Set<Long> ids = result.getContent().stream().map(Member::getId).collect(Collectors.toSet());
        Map<Long, WalletAccount> wallets = accountRepository.findByMemberIdIn(ids).stream()
                .collect(Collectors.toMap(WalletAccount::getMemberId, w -> w));
        return ApiResponse.ok(PageResult.of(result, m -> {
            WalletAccount w = wallets.get(m.getId());
            return new AdminMemberView(m.getId(), m.getEmail(), m.getNickname(), m.isEnabled(),
                    m.getInviteCode(), m.getInviterId(),
                    w != null ? w.getBalance() : BigDecimal.ZERO,
                    w != null ? w.getTotalFrozen() : BigDecimal.ZERO,
                    w != null ? w.getShoppingBalance() : BigDecimal.ZERO,
                    w != null ? w.getWithdrawableBalance() : BigDecimal.ZERO,
                    w != null ? w.getShoppingFrozen() : BigDecimal.ZERO,
                    w != null ? w.getWithdrawableFrozen() : BigDecimal.ZERO,
                    w != null ? w.getWithdrawalFrozen() : BigDecimal.ZERO,
                    m.getLevelId(), m.getTotalRecharge(), m.getTotalSpend(),
                    m.getLastLoginAt(), m.getCreatedAt());
        }));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member:read','member:manage')")
    public ApiResponse<Map<String, Object>> stats() {
        long total = memberRepository.count();
        long enabled = memberRepository.countByEnabled(true);
        return ApiResponse.ok(Map.of(
                "total", total,
                "enabled", enabled,
                "disabled", total - enabled,
                "balance", accountRepository.sumBalance(),
                "frozen", accountRepository.sumFrozen()));
    }

    /** 启用/禁用(禁用同时轮换令牌版本强制下线)。 */
    @PostMapping("/{id}/toggle")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('member:status','member:manage')")
    @Transactional
    public ApiResponse<Void> toggle(@PathVariable Long id, @RequestBody(required = false) ToggleMemberRequest req,
                                    HttpServletRequest http) {
        Member member = memberRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "会员不存在"));
        authService.verifySensitive((Long) http.getAttribute("uid"),
                req == null ? null : req.password(), req == null ? null : req.totpCode(),
                "member-status-toggle:" + id, RateLimitFilter.clientIp(http));
        member.setEnabled(!member.isEnabled());
        if (!member.isEnabled()) {
            member.setTokenVersion(UUID.randomUUID().toString()); // 旧 refresh 全失效
        }
        String actor = String.valueOf(http.getAttribute("uname"));
        auditService.record(actor, member.isEnabled() ? "MEMBER_ENABLE" : "MEMBER_DISABLE",
                "member:" + id, RateLimitFilter.clientIp(http), member.getEmail());
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/freeze")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('wallet:freeze','member:manage')")
    public ApiResponse<WalletBalances> freeze(@PathVariable Long id, @RequestBody FreezeBalanceRequest req,
                                    HttpServletRequest http) {
        memberRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "会员不存在"));
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-freeze:" + id, RateLimitFilter.clientIp(http));
        String actor = String.valueOf(http.getAttribute("uname"));
        walletService.adminFreeze(id, req.amount(), actor, req.note());
        auditService.record(actor, "MEMBER_BALANCE_FREEZE", "member:" + id,
                RateLimitFilter.clientIp(http), "{\"amount\":\"" + req.amount() + "\"}");
        return ApiResponse.ok(WalletBalances.of(walletService.ensureAccount(id)));
    }

    @PostMapping("/{id}/unfreeze")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('wallet:freeze','member:manage')")
    public ApiResponse<WalletBalances> unfreeze(@PathVariable Long id, @RequestBody FreezeBalanceRequest req,
                                      HttpServletRequest http) {
        memberRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "会员不存在"));
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "member-unfreeze:" + id, RateLimitFilter.clientIp(http));
        String actor = String.valueOf(http.getAttribute("uname"));
        walletService.adminUnfreeze(id, req.amount(), actor, req.note());
        auditService.record(actor, "MEMBER_BALANCE_UNFREEZE", "member:" + id,
                RateLimitFilter.clientIp(http), "{\"amount\":\"" + req.amount() + "\"}");
        return ApiResponse.ok(WalletBalances.of(walletService.ensureAccount(id)));
    }
    public record WalletBalances(BigDecimal balance, BigDecimal frozen, BigDecimal shoppingBalance,
                                 BigDecimal withdrawableBalance, BigDecimal shoppingFrozen,
                                 BigDecimal withdrawableFrozen, BigDecimal withdrawalFrozen) {
        static WalletBalances of(WalletAccount a) {
            return new WalletBalances(a.getBalance(), a.getTotalFrozen(), a.getShoppingBalance(),
                    a.getWithdrawableBalance(), a.getShoppingFrozen(), a.getWithdrawableFrozen(), a.getWithdrawalFrozen());
        }
    }
}
