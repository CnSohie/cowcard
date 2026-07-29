package com.hqyj.ka.member.repo;

import com.hqyj.ka.member.entity.MemberLevelPrice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberLevelPriceRepository extends JpaRepository<MemberLevelPrice, Long> {
    Optional<MemberLevelPrice> findByLevelIdAndProductIdAndSkuCode(Long levelId, Long productId, String skuCode);
    List<MemberLevelPrice> findByProductId(Long productId);
    List<MemberLevelPrice> findByLevelIdOrderByProductIdAsc(Long levelId);
    void deleteByLevelIdAndProductIdAndSkuCode(Long levelId, Long productId, String skuCode);
}
