package com.hqyj.ka.article.repo;

import com.hqyj.ka.article.entity.ArticlePurchase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArticlePurchaseRepository extends JpaRepository<ArticlePurchase, Long> {

    boolean existsByMemberIdAndArticleId(Long memberId, Long articleId);

    Page<ArticlePurchase> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);
}
