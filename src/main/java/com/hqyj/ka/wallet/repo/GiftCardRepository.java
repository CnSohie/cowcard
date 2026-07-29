package com.hqyj.ka.wallet.repo;

import com.hqyj.ka.wallet.entity.GiftCard;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface GiftCardRepository extends JpaRepository<GiftCard, Long> {
    Optional<GiftCard> findByCode(String code);
    Page<GiftCard> findByBatchNoContainingIgnoreCaseOrNameContainingIgnoreCaseOrCodeContainingIgnoreCase(
            String batchNo, String name, String code, Pageable pageable);

    /** 原子兑换:只有 ACTIVE 且未过期的卡码能从可用态切换为已兑换,防并发重复入账。 */
    @Modifying(flushAutomatically = true)
    @Query("update GiftCard g set g.status = :redeemed, g.redeemedBy = :memberId, g.redeemedAt = :now " +
           "where g.code = :code and g.status = :active and (g.expireAt is null or g.expireAt >= :now)")
    int redeemActive(@Param("code") String code,
                     @Param("active") GiftCard.Status active,
                     @Param("redeemed") GiftCard.Status redeemed,
                     @Param("memberId") Long memberId,
                     @Param("now") LocalDateTime now);
}
