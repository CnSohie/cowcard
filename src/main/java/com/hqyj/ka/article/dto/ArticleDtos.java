package com.hqyj.ka.article.dto;

import com.hqyj.ka.article.entity.Article;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class ArticleDtos {

    /** 列表卡片(不含正文) */
    public record ArticleCard(Long id, String slug, String title, String category, String tags,
                              String coverImage, String summary, BigDecimal price, boolean pinned,
                              long views, long purchaseCount, LocalDateTime publishedAt) {
        public static ArticleCard of(Article a) {
            return new ArticleCard(a.getId(), a.getSlug(), a.getTitle(), a.getCategory(), a.getTags(),
                    a.getCoverImage(), a.getSummary(), a.getPrice(), a.isPinned(),
                    a.getViews(), a.getPurchaseCount(), a.getPublishedAt());
        }
    }

    /** 阅读页:content 为可见部分(免费/已购=全文;未购付费=试读),locked 表示尾部被截断 */
    public record ArticleDetail(Long id, String slug, String title, String category, String tags,
                                String coverImage, String summary, BigDecimal price, boolean pinned,
                                long views, LocalDateTime publishedAt,
                                String content, boolean locked, boolean purchased) {}

    /** 后台编辑视图(完整 Markdown) */
    public record AdminArticleView(Long id, String slug, String title, String category, String tags,
                                   String coverImage, String summary, String contentMd, BigDecimal price,
                                   String status, boolean pinned, long views, long purchaseCount,
                                   LocalDateTime publishedAt, LocalDateTime updatedAt) {
        public static AdminArticleView of(Article a) {
            return new AdminArticleView(a.getId(), a.getSlug(), a.getTitle(), a.getCategory(), a.getTags(),
                    a.getCoverImage(), a.getSummary(), a.getContentMd(), a.getPrice(),
                    a.getStatus().name(), a.isPinned(), a.getViews(), a.getPurchaseCount(),
                    a.getPublishedAt(), a.getUpdatedAt());
        }
    }

    public record SaveArticleRequest(
            Long id,
            @Size(max = 160) String slug,
            @NotBlank @Size(max = 200) String title,
            @Size(max = 64) String category,
            @Size(max = 255) String tags,
            @Size(max = 255) String coverImage,
            @Size(max = 500) String summary,
            String contentMd,
            @DecimalMin(value = "0") @Digits(integer = 18, fraction = 2) BigDecimal price,
            boolean pinned,
            /** DRAFT / PUBLISHED */
            String status) {}

    public record PurchaseView(Long id, Long articleId, String title, String slug,
                               BigDecimal price, LocalDateTime createdAt) {}
}
