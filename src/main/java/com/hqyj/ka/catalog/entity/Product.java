package com.hqyj.ka.catalog.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "product", indexes = @Index(name = "idx_product_cat", columnList = "categoryId,visible"))
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class Product {
    public enum DeliveryMode { AUTO_CARD, MANUAL, PRESALE_VOUCHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long categoryId;

    @Column(nullable = false, length = 128)
    private String name;

    /** 简介(列表页) */
    @Column(length = 255)
    private String brief;

    /** 详情(Markdown) */
    @Column(columnDefinition = "TEXT")
    private String description;

    /** 使用说明,发卡后随卡密展示 */
    @Column(columnDefinition = "TEXT")
    private String usageNote;

    /** 交付模式:AUTO_CARD 自动发卡;MANUAL 人工发货/开通服务。 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private DeliveryMode deliveryMode = DeliveryMode.AUTO_CARD;

    public DeliveryMode getDeliveryMode() {
        return deliveryMode == null ? DeliveryMode.AUTO_CARD : deliveryMode;
    }

    /** 人工发货时展示给买家的信息收集提示。 */
    @Column(columnDefinition = "TEXT")
    private String manualPrompt;

    /** 预售提货开放时间;仅 PRESALE_VOUCHER 生效。 */
    private LocalDateTime presaleStartAt;

    /** 最晚提货截止时间;逾期后凭证按清算规则处理。 */
    private LocalDateTime presaleEndAt;

    /** 逾期清算:SINK=沉淀清算;REFUND=原路退回预留;BALANCE=转余额。 */
    @Column(length = 16)
    private String presaleSettlementMode = "BALANCE";

    @Column(length = 255)
    private String coverImage;

    /** 定价:CNY,DECIMAL 杜绝浮点误差 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal price;

    /** 冗余库存计数(与 card_secret AVAILABLE 数一致,发卡时同步扣减) */
    @Column(nullable = false)
    private int stockCached = 0;

    @Column(nullable = false)
    private int minBuy = 1;

    @Column(nullable = false)
    private int maxBuy = 10;

    @Column(nullable = false)
    private boolean visible = true;

    @Column(nullable = false)
    private int sortOrder = 0;

    /** 乐观锁:后台并发编辑保护 */
    @Version
    private Long version;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
