package com.hqyj.ka.wallet.repo;

import com.hqyj.ka.wallet.entity.GiftCard;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GiftCardRepository extends JpaRepository<GiftCard, Long> {
    Optional<GiftCard> findByCode(String code);
    Page<GiftCard> findByBatchNoContainingIgnoreCaseOrNameContainingIgnoreCaseOrCodeContainingIgnoreCase(
            String batchNo, String name, String code, Pageable pageable);
}
