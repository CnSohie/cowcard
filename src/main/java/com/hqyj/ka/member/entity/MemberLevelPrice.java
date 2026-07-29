package com.hqyj.ka.member.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/** 会员专属价。当前系统无 SKU,skuCode 预留为空;未来 SKU 级价格优先于商品级。 */
@Entity
@Table(name = "member_level_price", uniqueConstraints = {
        @UniqueConstraint(name = "uk_level_product_sku", columnNames = {"levelId", "productId", "skuCode"})
}, indexes = {
        @Index(name = "idx_level_price_product", columnList = "productId"),
        @Index(name = "idx_level_price_level", columnList = "levelId")
})
@Getter @Setter @NoArgsConstructor
public class MemberLevelPrice {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long levelId;

    @Column(nullable = false)
    private Long productId;

    @Column(length = 64)
    private String skuCode = "";

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal price;
}
