package com.hqyj.ka.order.repo;

import com.hqyj.ka.order.entity.PresaleVoucher;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PresaleVoucherRepository extends JpaRepository<PresaleVoucher, Long> {
    Optional<PresaleVoucher> findByOrderId(Long orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from PresaleVoucher v where v.orderId = :orderId")
    Optional<PresaleVoucher> findLockedByOrderId(@Param("orderId") Long orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<PresaleVoucher> findByTokenHash(String tokenHash);

    List<PresaleVoucher> findTop200ByStatusAndPresaleEndAtBefore(PresaleVoucher.Status status, LocalDateTime now);

    List<PresaleVoucher> findTop200ByStatusInAndPresaleEndAtBefore(List<PresaleVoucher.Status> statuses, LocalDateTime now);

    List<PresaleVoucher> findTop100ByStatusAndPresaleStartAtBeforeOrderByIdAsc(PresaleVoucher.Status status, LocalDateTime now);

    List<PresaleVoucher> findByRedeemMemberIdOrderByIdDesc(Long memberId);
}
