package com.hqyj.ka.payment.repo;

import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.order.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {
    Optional<PaymentTransaction> findByChannelTradeNo(String channelTradeNo);

    /** 近 N 天成功流水(量小,Java 侧聚合出日营收) */
    List<PaymentTransaction> findByStatusAndPaidAtAfter(PaymentTransaction.Status status, LocalDateTime after);

    /** 已有成功支付流水,但订单仍停在异常状态(如迟到支付打到 EXPIRED 单),需要后台人工补单/清算。 */
    @Query("select count(distinct t.orderId) from PaymentTransaction t, Order o " +
           "where t.orderId = o.id and t.status = :txStatus and o.status in :orderStatuses")
    long countSuccessfulTxWithOrderStatusIn(@Param("txStatus") PaymentTransaction.Status txStatus,
                                            @Param("orderStatuses") Collection<Order.Status> orderStatuses);
}
