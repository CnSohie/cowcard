package com.hqyj.ka.wallet.repo;

import com.hqyj.ka.wallet.entity.WithdrawRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WithdrawRequestRepository extends JpaRepository<WithdrawRequest, Long> {

    Page<WithdrawRequest> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);

    Page<WithdrawRequest> findByStatusOrderByIdAsc(WithdrawRequest.Status status, Pageable pageable);

    Page<WithdrawRequest> findAllByOrderByIdDesc(Pageable pageable);

    boolean existsByMemberIdAndStatus(Long memberId, WithdrawRequest.Status status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from WithdrawRequest r where r.memberId = :mid and r.status = :status")
    List<WithdrawRequest> lockByMemberIdAndStatus(@Param("mid") Long memberId,
                                               @Param("status") WithdrawRequest.Status status);

    long countByStatus(WithdrawRequest.Status status);

    /**
     * 审核状态 CAS:PENDING → APPROVED/REJECTED 只允许一个管理员成功,
     * 返回 0 行 = 已被他人处理(先抢状态、后动钱,杜绝双审双付)。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update WithdrawRequest r set r.status = :to where r.id = :id and r.status = :from")
    int casStatus(@Param("id") Long id,
                  @Param("from") WithdrawRequest.Status from,
                  @Param("to") WithdrawRequest.Status to);
}
