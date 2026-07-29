package com.hqyj.ka.payment.repo;

import com.hqyj.ka.payment.entity.PaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {
    Optional<PaymentTransaction> findByChannelTradeNo(String channelTradeNo);

    /** 近 N 天成功流水(量小,Java 侧聚合出日营收) */
    List<PaymentTransaction> findByStatusAndPaidAtAfter(PaymentTransaction.Status status, LocalDateTime after);
}
