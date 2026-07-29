package com.hqyj.ka.card.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 卡密。内容 AES-256-GCM 加密落库(contentEnc),主密钥仅存环境变量。
 * 状态机:AVAILABLE → SOLD(发卡);发卡用 FOR UPDATE SKIP LOCKED,防超卖不排队。
 */
@Entity
@Table(name = "card_secret", indexes = {
        @Index(name = "idx_card_alloc", columnList = "productId,status"),
        @Index(name = "idx_card_order", columnList = "orderId"),
        @Index(name = "uk_card_product_fingerprint", columnList = "productId,fingerprint", unique = true)
})
@Getter @Setter @NoArgsConstructor
public class CardSecret {

    public enum Status { AVAILABLE, SOLD, DISABLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long productId;

    /** AES-256-GCM 密文(base64) */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String contentEnc;

    /** 去重指纹:sha256(明文),同商品下唯一,防重复导入 */
    @Column(nullable = false, length = 64)
    private String fingerprint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.AVAILABLE;

    private Long orderId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime soldAt;
}
