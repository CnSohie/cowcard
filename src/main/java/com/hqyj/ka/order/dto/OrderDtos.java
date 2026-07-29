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

    public record OrderView(String orderNo, String productName, BigDecimal unitPrice, int quantity,
                            BigDecimal amount, BigDecimal discountAmount, BigDecimal walletPaidAmount,
                            String status, String paidChannel,
                            LocalDateTime createdAt, LocalDateTime expireAt, LocalDateTime paidAt,
                            List<String> cards, String usageNote,
                            String deliveryMode, String buyerNote, String deliveryContent,
                            String presaleVoucherHint, String presaleVoucherStatus, String presaleFulfillmentNote,
                            LocalDateTime presaleStartAt, LocalDateTime presaleEndAt) {}

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
                                 String deliveryMode, String buyerNote, String deliveryContent) {}

    /** 收银台摘要(公开,凭高熵订单号获取;仅含展示所需字段)。 */
    public record PaySummary(String orderNo, String orderType, String productName,
                             BigDecimal amount, String status, LocalDateTime expireAt,
                             BigDecimal walletPaidAmount,
                             String deliveryMode) {}

    /** 敏感操作双因子凭证(人工补单/关单等):管理员密码 + TOTP 动态码。 */
    public record SensitiveAuthRequest(String password, String totpCode) {}
}
