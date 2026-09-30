package com.hqyj.ka.wallet.repo;

import com.hqyj.ka.wallet.entity.WalletAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 余额变动全部走原子 UPDATE + 守卫条件(返回 0 行 = 余额不足/状态异常),
 * 不做实体读-改-写,天然防并发双花。clearAutomatically 清一级缓存防脏读。
 */
public interface WalletAccountRepository extends JpaRepository<WalletAccount, Long> {

    Optional<WalletAccount> findByMemberId(Long memberId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from WalletAccount w where w.memberId = :mid")
    Optional<WalletAccount> lockByMemberId(@Param("mid") Long memberId);

    List<WalletAccount> findByMemberIdIn(Collection<Long> memberIds);

    @Query("select coalesce(sum(w.balance), 0) from WalletAccount w")
    BigDecimal sumBalance();

    @Query("select coalesce(sum(w.frozen + w.withdrawalFrozen), 0) from WalletAccount w")
    BigDecimal sumFrozen();

}
