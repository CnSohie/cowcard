package com.hqyj.ka.article.repo;

import com.hqyj.ka.article.entity.Article;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ArticleRepository extends JpaRepository<Article, Long> {

    Optional<Article> findBySlug(String slug);

    boolean existsBySlug(String slug);

    List<Article> findByStatusOrderByPublishedAtDescIdDesc(Article.Status status);

    /** 前台列表:已发布,可选分类/标题搜索,置顶优先。 */
    @Query("select a from Article a where a.status = :status " +
           "and (:category is null or a.category = :category) " +
           "and (:q is null or a.title like concat('%', :q, '%')) " +
           "order by a.pinned desc, a.publishedAt desc, a.id desc")
    Page<Article> search(@Param("status") Article.Status status,
                         @Param("category") String category,
                         @Param("q") String q, Pageable pageable);

    /** 后台列表:全状态可筛。 */
    @Query("select a from Article a where (:status is null or a.status = :status) " +
           "and (:q is null or a.title like concat('%', :q, '%')) " +
           "order by a.pinned desc, a.id desc")
    Page<Article> adminSearch(@Param("status") Article.Status status,
                              @Param("q") String q, Pageable pageable);

    /** 浏览数原子递增(容忍近似,不加锁)。 */
    @Modifying
    @Query("update Article a set a.views = a.views + 1 where a.id = :id")
    void incrementViews(@Param("id") Long id);

    @Modifying
    @Query("update Article a set a.purchaseCount = a.purchaseCount + 1 where a.id = :id")
    void incrementPurchaseCount(@Param("id") Long id);

    @Query("select distinct a.category from Article a " +
           "where a.status = :status and a.category is not null and a.category <> '' " +
           "order by a.category")
    List<String> categories(@Param("status") Article.Status status);
}
