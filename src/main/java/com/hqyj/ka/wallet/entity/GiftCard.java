package com.hqyj.ka.wallet.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "gift_card", indexes = {
        @Index(name = "idx_gift_code", columnList = "code", unique = true),
        @Index(name = "idx_gift_batch", columnList = "batchNo")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class GiftCard {
    public enum Status { ACTIVE, REDEEMED, DISABLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String batchNo;

    @Column(nullable = false, length = 64)
    private String name;

    /** 新卡仅保存 SHA-256 指纹;旧数据可能仍是历史明文,由服务层受控迁移。 */
    @Column(nullable = false, unique = true, length = 64)
    private String code;

    /** 新卡码明文 AES-GCM 密文,仅在已通过 2FA 的管理端视图中解密。 */
    @Column(length = 256)
    private String codeEnc;

    /** 仅用于本次兑换响应,不落库。 */
    @Transient
    private String redeemedCode;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.ACTIVE;

    private LocalDateTime expireAt;
    private Long redeemedBy;
    private LocalDateTime redeemedAt;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
