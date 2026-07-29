package com.hqyj.ka.article.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 文章购买记录。唯一约束 (memberId, articleId) 兜底并发双购(冲突回滚连同扣款)。 */
@Entity
@Table(name = "article_purchase",
        uniqueConstraints = @UniqueConstraint(name = "uk_purchase_member_article",
                columnNames = {"memberId", "articleId"}),
        indexes = @Index(name = "idx_purchase_member", columnList = "memberId,id"))
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class ArticlePurchase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long memberId;

    @Column(nullable = false)
    private Long articleId;

    /** 成交价快照(后续改价不影响已购) */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal price;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
