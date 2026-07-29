package com.hqyj.ka.card.repo;

import com.hqyj.ka.card.entity.CardSecret;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CardSecretRepository extends JpaRepository<CardSecret, Long> {

    /**
     * 发卡分配:SKIP LOCKED —— 并发抢卡互不阻塞,天然防超卖(MySQL 8 原生支持)。
     */
    @Query(value = "select * from card_secret where product_id = :productId and status = 'AVAILABLE' " +
            "order by id limit :qty for update skip locked", nativeQuery = true)
    List<CardSecret> lockAvailable(@Param("productId") Long productId, @Param("qty") int qty);

    List<CardSecret> findByOrderId(Long orderId);

    long countByProductIdAndStatus(Long productId, CardSecret.Status status);

    List<CardSecret> findByProductIdAndFingerprintIn(Long productId, List<String> fingerprints);

    @Modifying
    @Query(value = "insert ignore into card_secret(product_id, content_enc, fingerprint, status, created_at) " +
            "values (:productId, :contentEnc, :fingerprint, 'AVAILABLE', CURRENT_TIMESTAMP(6))", nativeQuery = true)
    int insertIgnoreAvailable(@Param("productId") Long productId,
                              @Param("contentEnc") String contentEnc,
                              @Param("fingerprint") String fingerprint);

    Page<CardSecret> findByProductIdOrderByIdDesc(Long productId, Pageable pageable);

    Page<CardSecret> findByProductIdAndStatusOrderByIdDesc(Long productId, CardSecret.Status status, Pageable pageable);
}
