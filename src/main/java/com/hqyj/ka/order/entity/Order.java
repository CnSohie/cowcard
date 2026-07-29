package com.hqyj.ka.order.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单(游客模式:订单号 + 联系方式/查询密码 双凭证查单,防遍历)。
 * 状态机:PENDING → PAID → DELIVERED;PENDING → EXPIRED;人工 → CLOSED/REFUNDED。
 */
@Entity
@Table(name = "orders", indexes = {
        @Index(name = "idx_order_no", columnList = "orderNo", unique = true),
        @Index(name = "idx_order_expire", columnList = "status,expireAt"),
        @Index(name = "idx_order_contact", columnList = "contact"),
        @Index(name = "idx_order_member", columnList = "memberId")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class Order {

    public enum Status { PENDING, PAID, DELIVERED, EXPIRED, CLOSED, REFUNDED }

    /** GOODS=商品订单(发卡);RECHARGE=钱包充值(入账余额,不发卡)。 */
    public enum OrderType { GOODS, RECHARGE }

    /** 商品交付模式快照。 */
    public enum DeliveryMode { AUTO_CARD, MANUAL, PRESALE_VOUCHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String orderNo;

    /**
     * 订单类型。可空(存量行无该列值),getter 兜底 GOODS —— ddl-auto=update 不回填旧行。
     * RECHARGE 订单 productId 用 0 占位(该列历史 NOT NULL,update 模式不放开约束)。
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private OrderType orderType;

    /** 下单会员(可空:游客单无会员;充值单必有)。 */
    private Long memberId;

    @Column(nullable = false)
    private Long productId;

    public OrderType getOrderType() {
        return orderType == null ? OrderType.GOODS : orderType;
    }

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private DeliveryMode deliveryMode;

    public DeliveryMode getDeliveryMode() {
        return deliveryMode == null ? DeliveryMode.AUTO_CARD : deliveryMode;
    }

    /** 快照:商品改名改价不影响历史订单 */
    @Column(nullable = false, length = 128)
    private String productName;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal unitPrice;

    /** 原始商品单价快照;会员价生效时 unitPrice 为成交单价。 */
    @Column(precision = 20, scale = 2)
    private BigDecimal originalUnitPrice;

    @Column(nullable = false)
    private int quantity;

    /** 应付金额(CNY,已扣除优惠) */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal amount;

    /** 使用的优惠码(快照) */
    @Column(length = 32)
    private String couponCode;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal discountAmount = BigDecimal.ZERO;

    /** 会员等级折扣总额(含专属价差);计入 discountAmount 方便旧页面展示总优惠。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal memberDiscountAmount = BigDecimal.ZERO;

    /** 下单时已使用的钱包抵扣金额。订单未支付超时/关闭时会退回钱包。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal walletPaidAmount = BigDecimal.ZERO;

    /** 管理员已退款到钱包累计额。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal walletRefundedAmount = BigDecimal.ZERO;

    private Long memberLevelId;

    @Column(length = 64)
    private String memberLevelName;

    /** 买家联系方式(邮箱),查单凭证之一 */
    @Column(nullable = false, length = 128)
    private String contact;

    /** 查询密码 bcrypt(可选,增强凭证) */
    @Column(length = 100)
    private String queryPasswordHash;

    /** 人工发货商品:买家提交的收货/业务资料。 */
    @Column(columnDefinition = "TEXT")
    private String buyerNote;

    /** 人工发货商品:管理员填写的最终交付内容。 */
    @Column(columnDefinition = "TEXT")
    private String manualDeliveryContent;

    /** 下单成功返回给当前浏览器的取卡令牌 bcrypt;用于支付完成后自动展示卡密。 */
    @Column(length = 100)
    private String queryTokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    /** 成交渠道编码(ALIPAY_OFFICIAL / EPAY / CRYPTO_TRANSFER / CRYPTO_WALLET) */
    @Column(length = 32)
    private String paidChannel;

    private LocalDateTime paidAt;
    private LocalDateTime deliveredAt;

    @Column(nullable = false)
    private LocalDateTime expireAt;

    @Column(length = 45)
    private String buyerIp;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
