package com.hqyj.ka.wallet.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.wallet.dto.WalletDtos.*;
import com.hqyj.ka.wallet.entity.WalletAccount;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.repo.WalletAccountRepository;
import com.hqyj.ka.wallet.repo.WalletTxnRepository;
import com.hqyj.ka.wallet.repo.WithdrawRequestRepository;
import com.hqyj.ka.wallet.service.CommissionService;
import com.hqyj.ka.wallet.service.GiftCardService;
import com.hqyj.ka.wallet.service.WalletService;
import com.hqyj.ka.wallet.service.WithdrawMethodService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/** 会员钱包(/api/member/** 由 SecurityConfig 强制 KIND_MEMBER,mid 取自令牌)。 */
@RestController
@RequestMapping("/api/member/wallet")
@RequiredArgsConstructor
public class WalletController {

    private final WalletService walletService;
    private final CommissionService commissionService;
    private final WalletAccountRepository accountRepository;
    private final WalletTxnRepository txnRepository;
    private final WithdrawRequestRepository withdrawRepository;
    private final MemberRepository memberRepository;
    private final OrderService orderService;
    private final GiftCardService giftCardService;
    private final WithdrawMethodService withdrawMethodService;

    @GetMapping
    public ApiResponse<WalletSummary> summary(HttpServletRequest http) {
        Long mid = mid(http);
        BigDecimal balance = BigDecimal.ZERO, frozen = BigDecimal.ZERO;
        WalletAccount account = accountRepository.findByMemberId(mid).orElse(null);
        if (account != null) {
            balance = account.getBalance();
            frozen = account.getTotalFrozen();
        }
        String freezeReason = frozen.signum() > 0
                ? txnRepository.findTopByMemberIdAndTypeOrderByIdDesc(mid, WalletTxn.Type.ADMIN_FREEZE)
                        .map(WalletTxn::getRemark).orElse(null)
                : null;
        return ApiResponse.ok(new WalletSummary(balance, frozen,
                account == null ? BigDecimal.ZERO : account.getShoppingBalance(),
                account == null ? BigDecimal.ZERO : account.getWithdrawableBalance(),
                account == null ? BigDecimal.ZERO : account.getShoppingFrozen(),
                account == null ? BigDecimal.ZERO : account.getWithdrawableFrozen(),
                account == null ? BigDecimal.ZERO : account.getWithdrawalFrozen(),
                txnRepository.sumByType(mid, WalletTxn.Type.COMMISSION),
                walletService.minWithdraw(), commissionService.rate(), freezeReason,
                withdrawMethodService.enabledMethods()));
    }

    @GetMapping("/txns")
    public ApiResponse<PageResult<TxnView>> txns(HttpServletRequest http,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(PageResult.of(txnRepository.findByMemberIdOrderByIdDesc(
                mid(http), PageRequest.of(page, Math.min(size, 50))), TxnView::of));
    }

    /** 充值:走订单 + 现有全部支付渠道,前端拿 orderNo 跳 /pay/{orderNo}。 */
    @PostMapping("/recharge")
    public ApiResponse<Map<String, Object>> recharge(@Valid @RequestBody RechargeRequest req,
                                                     HttpServletRequest http) {
        Long mid = mid(http);
        String email = memberRepository.findById(mid).map(Member::getEmail).orElse("member@local");
        Order order = orderService.createRecharge(mid, req.amount(), RateLimitFilter.clientIp(http), email);
        return ApiResponse.ok(Map.of(
                "orderNo", order.getOrderNo(),
                "amount", order.getAmount(),
                "expireAt", order.getExpireAt().toString()));
    }

    @PostMapping("/withdraw")
    public ApiResponse<WithdrawView> withdraw(@Valid @RequestBody CreateWithdrawRequest req,
                                              HttpServletRequest http) {
        return ApiResponse.ok(WithdrawView.of(
                walletService.requestWithdraw(mid(http), req.amount(), req.channel(), req.account(),
                        req.accountName(), req.bankName())));
    }

    @PostMapping("/gift-cards/redeem")
    public ApiResponse<Map<String, Object>> redeemGiftCard(@Valid @RequestBody RedeemGiftCardRequest req,
                                                           HttpServletRequest http) {
        var card = giftCardService.redeem(mid(http), req.code());
        return ApiResponse.ok(Map.of("amount", card.getAmount(), "code",
                card.getRedeemedCode() == null ? "" : card.getRedeemedCode()));
    }

    @GetMapping("/withdrawals")
    public ApiResponse<PageResult<WithdrawView>> withdrawals(HttpServletRequest http,
                                                             @RequestParam(defaultValue = "0") int page,
                                                             @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(PageResult.of(withdrawRepository.findByMemberIdOrderByIdDesc(
                mid(http), PageRequest.of(page, Math.min(size, 50))), WithdrawView::of));
    }

    private Long mid(HttpServletRequest http) {
        return (Long) http.getAttribute("mid");
    }
}
