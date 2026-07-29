package com.hqyj.ka.article.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 媒体文章(Markdown)。付费内容用 <!--paywall--> 分割:标记前为试读,标记后购买可见;
 * price=0 免费全文。views/purchaseCount 用原子 UPDATE 递增,无需乐观锁(容忍计数近似)。
 */
@Entity
@Table(name = "article", indexes = {
        @Index(name = "idx_article_slug", columnList = "slug", unique = true),
        @Index(name = "idx_article_status", columnList = "status,pinned,publishedAt"),
        @Index(name = "idx_article_category", columnList = "category")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class Article {

    public enum Status { DRAFT, PUBLISHED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** URL 标识(唯一;留空自动生成) */
    @Column(nullable = false, length = 160)
    private String slug;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 64)
    private String category;

    /** 逗号分隔标签 */
    @Column(length = 255)
    private String tags;

    /** 封面图 URL(/files/…) */
    @Column(length = 255)
    private String coverImage;

    /** 列表摘要 */
    @Column(length = 500)
    private String summary;

    /** Markdown 正文(LONGTEXT) */
    @Lob
    @Column(columnDefinition = "LONGTEXT")
    private String contentMd;

    /** 付费价格(0 = 免费) */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.DRAFT;

    /** 置顶 */
    @Column(nullable = false)
    private boolean pinned = false;

    @Column(nullable = false)
    private long views = 0;

    @Column(nullable = false)
    private long purchaseCount = 0;

    /** 首次发布时间(列表排序依据) */
    private LocalDateTime publishedAt;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
