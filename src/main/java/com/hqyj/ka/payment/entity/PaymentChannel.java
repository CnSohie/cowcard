package com.hqyj.ka.payment.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 支付渠道配置。code 绑定策略实现;敏感配置(密钥等)AES 加密后存 configEnc。
 * 新增支付方式 = 新增策略类 + 插入一条渠道记录,零侵入。
 */
@Entity
@Table(name = "payment_channel")
@Getter @Setter @NoArgsConstructor
public class PaymentChannel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 策略编码:ALIPAY_OFFICIAL / EPAY / CRYPTO_TRANSFER / CRYPTO_WALLET */
    @Column(nullable = false, unique = true, length = 32)
    private String code;

    /** 前台展示名 */
    @Column(nullable = false, length = 64)
    private String displayName;

    @Column(nullable = false)
    private boolean enabled = false;

    @Column(nullable = false)
    private int sortOrder = 0;

    /** 渠道配置 JSON(AES-256-GCM 加密) */
    @Column(columnDefinition = "TEXT")
    private String configEnc;
}
