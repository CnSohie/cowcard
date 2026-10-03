package com.hqyj.ka.coupon.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 优惠券。FIXED=立减(value 为金额),PERCENT=折扣(value 为百分比,如 10 = 减 10%)。
 * totalLimit=0 表示不限量;核销用原子扣减防超发。
 */
@Entity
@Table(name = "coupon")
@Getter @Setter @NoArgsConstructor
public class Coupon {

    public enum Type { FIXED, PERCENT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Type type = Type.FIXED;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal value;

    /** 最低消费门槛(0=无门槛) */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal minAmount = BigDecimal.ZERO;

    /** 总可用次数,0=不限 */
    @Column(nullable = false)
    private int totalLimit = 0;

    @Column(nullable = false)
    private int usedCount = 0;

    private LocalDateTime expireAt;

    /** null 表示全商品通用，否则仅适用指定商品。 */
    private Long productId;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
