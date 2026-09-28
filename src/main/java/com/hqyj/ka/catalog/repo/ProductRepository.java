package com.hqyj.ka.catalog.repo;

import com.hqyj.ka.catalog.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByVisibleTrueOrderBySortOrderAscIdDesc();

    Optional<Product> findByIdAndVisibleTrue(Long id);

    boolean existsByCategoryId(Long categoryId);

    /** 下单预占:原子扣减冗余库存,防超卖第一道闸(第二道在卡密 SKIP LOCKED 分配) */
    @Modifying
    @Query("update Product p set p.stockCached = p.stockCached - :qty where p.id = :id and p.stockCached >= :qty")
    int reserveStock(@Param("id") Long id, @Param("qty") int qty);

    @Modifying
    @Query("update Product p set p.stockCached = p.stockCached + :qty where p.id = :id")
    int releaseStock(@Param("id") Long id, @Param("qty") int qty);
}
