package com.hqyj.ka.coupon.repo;

import com.hqyj.ka.coupon.entity.Coupon;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CouponRepository extends JpaRepository<Coupon, Long> {

    Optional<Coupon> findByCodeAndEnabledTrue(String code);

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, Long id);

    /** 原子核销:限量券并发下不超发 */
    @Modifying
    @Query("update Coupon c set c.usedCount = c.usedCount + 1 " +
           "where c.id = :id and (c.totalLimit = 0 or c.usedCount < c.totalLimit)")
    int redeem(@Param("id") Long id);
}
