package com.hqyj.ka.order.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public final class OrderDtos {
    private OrderDtos() {}

    public record CreateOrderRequest(
            @NotNull Long productId,
            @Min(1) @Max(1000) int quantity,
            @NotBlank @Email @Size(max = 128) String contact,
            /** 可选查询密码,防止仅凭邮箱查单 */
            @Size(min = 6, max = 64) String queryPassword,
            /** 可选优惠码 */
            @Size(max = 32) String couponCode,
            /** 登录会员可选择使用钱包余额抵扣部分金额 */
            Boolean useWallet,
            /** 人工发货商品的业务/收货信息 */
            @Size(max = 2000) String buyerNote) {}

    public record CreateOrderResponse(String orderNo, BigDecimal amount,
                                      LocalDateTime expireAt, String queryToken,
                                      BigDecimal walletPaidAmount, BigDecimal memberDiscountAmount,
                                      String presaleVoucherToken) {}

    /** 下单时签发的 256-bit 随机凭证;不接受邮箱/密码替代。 */
    public record TokenOrderRequest(@NotBlank @Size(max = 32) String orderNo,
                                    @Pattern(regexp = "[A-Za-z0-9_-]{43}") String queryToken,
                                    @Size(min = 1, max = 2048) String historyToken) {
        @AssertTrue(message = "请提供有效查询凭证")
        public boolean isCredentialPresent() {
            return (queryToken != null && !queryToken.isBlank()) ^ (historyToken != null && !historyToken.isBlank());
        }
    }

    public record PresaleVoucherClaimResponse(String token, String tokenHint, String status) {}

    public record OrderView(String orderNo, String productName, BigDecimal unitPrice, int quantity,
                            BigDecimal amount, BigDecimal discountAmount, BigDecimal walletPaidAmount,
                            String status, String paidChannel,
                            LocalDateTime createdAt, LocalDateTime expireAt, LocalDateTime paidAt,
                            List<String> cards, String usageNote,
                            String deliveryMode, String buyerNote, String deliveryContent,
                            String presaleVoucherHint, String presaleVoucherStatus, String presaleFulfillmentNote,
                            LocalDateTime presaleStartAt, LocalDateTime presaleEndAt,
                            String historyToken, java.time.Instant historyExpiresAt) {
        public OrderView withHistory(String token, java.time.Instant expiresAt) {
            return new OrderView(orderNo, productName, unitPrice, quantity, amount, discountAmount, walletPaidAmount, status, paidChannel, createdAt, expireAt, paidAt, cards, usageNote, deliveryMode, buyerNote, deliveryContent, presaleVoucherHint, presaleVoucherStatus, presaleFulfillmentNote, presaleStartAt, presaleEndAt, token, expiresAt);
        }
    }

    public record QueryOrderRequest(
            @NotBlank String orderNo,
            @Size(max = 128) String contact,
            String queryPassword,
            String queryToken) {}

    /** 管理端订单视图(列表 + 详情共用;不含查询密码哈希等敏感内部字段)。 */
    public record AdminOrderView(Long id, String orderNo, String orderType, Long memberId,
                                 String productName, BigDecimal unitPrice, int quantity,
                                 BigDecimal amount, BigDecimal discountAmount, BigDecimal walletPaidAmount,
                                 String couponCode,
                                 String contact, String status, String paidChannel, String buyerIp,
                                 LocalDateTime createdAt, LocalDateTime expireAt,
                                 LocalDateTime paidAt, LocalDateTime deliveredAt,
                                 String deliveryMode, String buyerNote, String deliveryContent,
                                 PaymentReconcile reconcile) {}

    /**
     * 对账凭证。支付宝/易支付的 tradeNo 是渠道交易号，链上支付的 tradeNo 是 TxID。
     * 链上额外带出网络、代币、精确金额和收款地址。
     */
    public record PaymentReconcile(String channelCode, String tradeNo,
                                   BigDecimal paidAmount, BigDecimal feeAmount, LocalDateTime paidAt,
                                   String chainCode, String tokenSymbol, String tokenAmount,
                                   String receiveAddress, Integer confirmations, Integer requiredConfirmations,
                                   Long blockNumber) {}

    /** 收银台摘要(公开,凭高熵订单号获取;仅含展示所需字段)。 */
    public record PaySummary(String orderNo, String orderType, String productName,
                             BigDecimal amount, String status, LocalDateTime expireAt,
                             BigDecimal walletPaidAmount,
                             String deliveryMode) {}

    /** 敏感操作双因子凭证(人工补单/关单等):管理员密码 + TOTP 动态码。 */
    public record SensitiveAuthRequest(String password, String totpCode) {}
}
