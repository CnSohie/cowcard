package com.hqyj.ka.wallet.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import com.hqyj.ka.wallet.dto.WalletDtos.AdminWithdrawView;
import com.hqyj.ka.wallet.dto.WalletDtos.ReviewRequest;
import com.hqyj.ka.wallet.entity.WithdrawRequest;
import com.hqyj.ka.wallet.repo.WithdrawRequestRepository;
import com.hqyj.ka.wallet.service.WalletService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** 提现审核(withdraw:review;默认 FINANCE / SUPER_ADMIN)。 */
@RestController
@RequestMapping("/api/admin/withdrawals")
@RequiredArgsConstructor
public class AdminWalletController {

    private final WithdrawRequestRepository withdrawRepository;
    private final WalletService walletService;
    private final MemberRepository memberRepository;
    private final AuditService auditService;
    private final AuthService authService;

    @GetMapping
    @PreAuthorize("hasAuthority('withdraw:review')")
    public ApiResponse<Map<String, Object>> list(@RequestParam(required = false) String status,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        PageRequest pr = PageRequest.of(page, Math.min(size, 100));
        Page<WithdrawRequest> result;
        if (status != null && !status.isBlank()) {
            result = withdrawRepository.findByStatusOrderByIdAsc(
                    WithdrawRequest.Status.valueOf(status.trim().toUpperCase()), pr);
        } else {
            result = withdrawRepository.findAllByOrderByIdDesc(pr);
        }
        // 批量取会员邮箱,避免 N+1
        Set<Long> memberIds = result.getContent().stream()
                .map(WithdrawRequest::getMemberId).collect(Collectors.toSet());
        Map<Long, String> emails = memberRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Member::getId, Member::getEmail));
        PageResult<AdminWithdrawView> data = PageResult.of(result, r -> new AdminWithdrawView(
                r.getId(), r.getMemberId(), emails.getOrDefault(r.getMemberId(), "?"),
                r.getAmount(), r.getFeeAmount() == null ? java.math.BigDecimal.ZERO : r.getFeeAmount(),
                r.getNetAmount() == null ? r.getAmount().subtract(r.getFeeAmount() == null ? java.math.BigDecimal.ZERO : r.getFeeAmount()) : r.getNetAmount(),
                r.getPayoutAmount(), r.getPayoutCurrency(), r.getPayoutFxRate(),
                r.getChannel(), r.getAccount(), r.getAccountName(), r.getBankName(), r.getStatus().name(),
                r.getReviewedBy(), r.getReviewNote(), r.getCreatedAt(), r.getReviewedAt()));
        return ApiResponse.ok(Map.of(
                "page", data,
                "pendingCount", withdrawRepository.countByStatus(WithdrawRequest.Status.PENDING)));
    }

    /** 通过 = 线下打款完成后确认扣除冻结。财务级操作:密码 + TOTP 双因子复核,未启用 2FA 拒绝。 */
    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('withdraw:review')")
    public ApiResponse<Void> approve(@PathVariable Long id, @Valid @RequestBody ReviewRequest req,
                                     HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "withdraw-approve:" + id, RateLimitFilter.clientIp(http));
        String reviewer = String.valueOf(http.getAttribute("uname"));
        WithdrawRequest r = walletService.reviewWithdraw(id, true, reviewer, req.note());
        auditService.record(reviewer, "WITHDRAW_APPROVE", "withdraw:" + id,
                RateLimitFilter.clientIp(http), "申请人民币 " + r.getAmount() + "，手续费人民币 " + r.getFeeAmount()
                        + "，实际打款 " + r.getPayoutAmount() + " " + r.getPayoutCurrency() + " → " + r.getChannel() + "/" + r.getAccount());
        return ApiResponse.ok();
    }

    /** 驳回 = 冻结解冻退回余额。同为敏感操作,双因子复核。 */
    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('withdraw:review')")
    public ApiResponse<Void> reject(@PathVariable Long id, @Valid @RequestBody ReviewRequest req,
                                    HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "withdraw-reject:" + id, RateLimitFilter.clientIp(http));
        String reviewer = String.valueOf(http.getAttribute("uname"));
        WithdrawRequest r = walletService.reviewWithdraw(id, false, reviewer, req.note());
        auditService.record(reviewer, "WITHDRAW_REJECT", "withdraw:" + id,
                RateLimitFilter.clientIp(http), "金额 " + r.getAmount() + " 已解冻退回，原因：" + r.getReviewNote());
        return ApiResponse.ok();
    }
}
