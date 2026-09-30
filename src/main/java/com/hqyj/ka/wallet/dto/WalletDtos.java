package com.hqyj.ka.wallet.dto;

import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.entity.WithdrawRequest;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class WalletDtos {

    /** 会员钱包总览 */
    public record WalletSummary(BigDecimal balance, BigDecimal frozen,
                                BigDecimal shoppingBalance, BigDecimal withdrawableBalance,
                                BigDecimal shoppingFrozen, BigDecimal withdrawableFrozen, BigDecimal withdrawalFrozen,
                                BigDecimal totalCommission,
                                BigDecimal minWithdraw, BigDecimal commissionRate, String freezeReason,
                                List<com.hqyj.ka.wallet.service.WithdrawMethodService.MethodView> withdrawMethods) {}

    public record TxnView(Long id, String type, BigDecimal amount, BigDecimal balanceAfter,
                          String remark, LocalDateTime createdAt, BigDecimal shoppingAmount, BigDecimal withdrawableAmount) {
        public static TxnView of(WalletTxn t) {
            return new TxnView(t.getId(), t.getType().name(), t.getAmount(), t.getBalanceAfter(),
                    t.getRemark(), t.getCreatedAt(), t.getShoppingAmount(), t.getWithdrawableAmount());
        }
    }

    public record WithdrawView(Long id, BigDecimal amount, BigDecimal feeAmount, BigDecimal netAmount,
                               String payoutAmount, String payoutCurrency, BigDecimal payoutFxRate, boolean withdrawableSource,
                               String channel, String account, String accountName, String bankName,
                               String status, String reviewNote, LocalDateTime createdAt,
                               LocalDateTime reviewedAt) {
        public static WithdrawView of(WithdrawRequest r) {
            BigDecimal fee = r.getFeeAmount() == null ? BigDecimal.ZERO : r.getFeeAmount();
            BigDecimal net = r.getNetAmount() == null ? r.getAmount().subtract(fee) : r.getNetAmount();
            return new WithdrawView(r.getId(), r.getAmount(), fee, net,
                    r.getPayoutAmount(), r.getPayoutCurrency(), r.getPayoutFxRate(), r.isWithdrawableSource(),
                    r.getChannel(), r.getAccount(), r.getAccountName(), r.getBankName(),
                    r.getStatus().name(), r.getReviewNote(), r.getCreatedAt(), r.getReviewedAt());
        }
    }

    /** 后台审核列表行(带会员邮箱) */
    public record AdminWithdrawView(Long id, Long memberId, String memberEmail, BigDecimal amount,
                                    BigDecimal feeAmount, BigDecimal netAmount, String payoutAmount, String payoutCurrency, BigDecimal payoutFxRate, boolean withdrawableSource,
                               String channel, String account, String accountName, String bankName,
                                    String status, String reviewedBy,
                                    String reviewNote, LocalDateTime createdAt, LocalDateTime reviewedAt) {}

    public record CreateWithdrawRequest(
            @NotNull @DecimalMin(value = "0.01") @Digits(integer = 18, fraction = 2) BigDecimal amount,
            @NotBlank @Size(max = 32) String channel,
            @NotBlank @Size(max = 128) String account,
            @Size(max = 50) String accountName,
            @Size(max = 80) String bankName) {}

    public record RechargeRequest(
            @NotNull @DecimalMin(value = "1") @DecimalMax(value = "50000")
            @Digits(integer = 18, fraction = 2) BigDecimal amount) {}

    public record RedeemGiftCardRequest(@NotBlank @Size(max = 64) String code) {}

    public record GiftCardView(Long id, String batchNo, String name, String code, BigDecimal amount,
                               String status, Long redeemedBy, LocalDateTime redeemedAt,
                               LocalDateTime expireAt, LocalDateTime createdAt) {}

    public record GenerateGiftCardsRequest(@NotBlank @Size(max = 64) String name,
                                           @NotNull @DecimalMin(value = "0.01") @Digits(integer = 18, fraction = 2) BigDecimal amount,
                                           @NotNull Integer quantity,
                                           LocalDateTime expireAt,
                                           String password,
                                           String totpCode) {}

    /** 审核请求:双因子凭证(管理员密码 + TOTP)+ 备注。 */
    public record ReviewRequest(String password, String totpCode, @Size(max = 255) String note) {}
}
