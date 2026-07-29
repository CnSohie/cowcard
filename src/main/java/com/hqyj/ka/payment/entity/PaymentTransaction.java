package com.hqyj.ka.payment.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 支付流水:每次支付尝试一条;channelTradeNo 唯一约束 = 重复回调兜底幂等。 */
@Entity
@Table(name = "payment_transaction", indexes = {
        @Index(name = "idx_ptx_order", columnList = "orderId"),
        @Index(name = "uk_ptx_channel_trade", columnList = "channelTradeNo", unique = true)
})
@Getter @Setter @NoArgsConstructor
public class PaymentTransaction {

    public enum Status { CREATED, SUCCESS, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long orderId;

    @Column(nullable = false, length = 32)
    private String orderNo;

    @Column(nullable = false, length = 32)
    private String channelCode;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal amount;

    /** 渠道流水号(支付宝 trade_no / 易支付 trade_no / 链上 txHash) */
    @Column(length = 128)
    private String channelTradeNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.CREATED;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime paidAt;
}
