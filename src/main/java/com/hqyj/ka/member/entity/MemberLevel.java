package com.hqyj.ka.member.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/** 会员等级:折扣率 100=无折扣,90=九折;门槛为 0 时不参与自动升级。 */
@Entity
@Table(name = "member_level", indexes = {
        @Index(name = "idx_level_slug", columnList = "slug", unique = true),
        @Index(name = "idx_level_enabled_sort", columnList = "enabled,sortWeight")
})
@Getter @Setter @NoArgsConstructor
public class MemberLevel {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(nullable = false, unique = true, length = 64)
    private String slug;

    @Column(length = 255)
    private String icon;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal discountRate = new BigDecimal("100.00");

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal rechargeThreshold = BigDecimal.ZERO;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal spendThreshold = BigDecimal.ZERO;

    @Column(nullable = false)
    private int sortWeight = 0;

    @Column(nullable = false)
    private boolean defaultLevel = false;

    @Column(nullable = false)
    private boolean enabled = true;

    /** 仅管理员授予,不参与充值/消费自动升级。 */
    @Column(nullable = false)
    private boolean manualOnly = false;
}
