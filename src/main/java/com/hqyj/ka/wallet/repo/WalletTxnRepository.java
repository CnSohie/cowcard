package com.hqyj.ka.wallet.repo;

import com.hqyj.ka.wallet.entity.WalletTxn;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.List;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

public interface WalletTxnRepository extends JpaRepository<WalletTxn, Long> {

    Page<WalletTxn> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);

    Optional<WalletTxn> findTopByMemberIdAndTypeOrderByIdDesc(Long memberId, WalletTxn.Type type);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<WalletTxn> findByMemberIdAndRefTypeAndRefIdOrderByIdAsc(Long memberId, String refType, Long refId);

    /** 某类型累计金额(如佣金总额),无记录返回 0 */
    @Query("select coalesce(sum(t.amount), 0) from WalletTxn t " +
           "where t.memberId = :mid and t.type = :type")
    BigDecimal sumByType(@Param("mid") Long memberId, @Param("type") WalletTxn.Type type);
}
