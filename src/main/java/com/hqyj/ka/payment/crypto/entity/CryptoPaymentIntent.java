package com.hqyj.ka.payment.crypto.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 链上收款意向单。
 * uniqueKey = chainCode:合约:最小单位金额 —— 唯一约束保证「同链同币同金额」在活跃期互斥,
 * 链上转账金额即订单指纹;过期后置 NULL 释放额度(MySQL 唯一索引允许多个 NULL)。
 * 状态机:WAITING → CONFIRMING(命中转账) → CONFIRMED(确认数达标入账) / EXPIRED。
 */
@Entity
@Table(name = "crypto_payment_intent", indexes = {
        @Index(name = "uk_intent_unique_amount", columnList = "uniqueKey", unique = true),
        @Index(name = "uk_intent_tx", columnList = "txHash", unique = true),
        @Index(name = "idx_intent_order", columnList = "orderNo"),
        @Index(name = "idx_intent_status", columnList = "status,expireAt")
})
@Getter @Setter @NoArgsConstructor
public class CryptoPaymentIntent {

    public enum Status { WAITING, CONFIRMING, CONFIRMED, EXPIRED }
    public enum Mode { TRANSFER, WALLET }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long orderId;

    @Column(nullable = false, length = 32)
    private String orderNo;

    @Column(nullable = false, length = 16)
    private String chainCode;

    @Column(nullable = false)
    private long chainId;

    @Column(nullable = false, length = 16)
    private String tokenSymbol;

    @Column(nullable = false, length = 64)
    private String tokenContract;

    @Column(nullable = false)
    private int decimals;

    /** 展示金额(如 10.003917) */
    @Column(nullable = false, precision = 20, scale = 6)
    private BigDecimal amountToken;

    /** 最小单位金额(BigInteger 字符串,如 10003917) */
    @Column(nullable = false, length = 40)
    private String amountMinor;

    /** chainCode:contract:amountMinor;过期置 NULL 释放 */
    @Column(length = 128)
    private String uniqueKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Mode mode = Mode.TRANSFER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.WAITING;

    @Column(nullable = false, length = 64)
    private String merchantAddress;

    /** 命中的链上交易(全局唯一,防一笔交易核销多单) */
    @Column(length = 80)
    private String txHash;

    private Long blockNumber;

    @Column(nullable = false)
    private int confirmations = 0;

    @Column(nullable = false)
    private int requiredConfirmations;

    @Column(nullable = false)
    private LocalDateTime expireAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime confirmedAt;
}
