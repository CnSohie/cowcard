package com.hqyj.ka.order.repo;

import com.hqyj.ka.order.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    interface DailySales {
        java.time.LocalDate getDay();
        java.math.BigDecimal getAmount();
        long getOrderCount();
    }

    /** 站点计价的商品净成交额:外部应付 + 余额抵扣 - 已退余额,每订单只计一次。 */
    @Query("select cast(o.paidAt as LocalDate) as day, " +
           "sum(case when o.amount + coalesce(o.walletPaidAmount, 0) - coalesce(o.walletRefundedAmount, 0) > 0 " +
           "then o.amount + coalesce(o.walletPaidAmount, 0) - coalesce(o.walletRefundedAmount, 0) else 0 end) as amount, " +
           "count(o) as orderCount from Order o " +
           "where (o.orderType = com.hqyj.ka.order.entity.Order.OrderType.GOODS or o.orderType is null) " +
           "and o.status in (com.hqyj.ka.order.entity.Order.Status.PAID, com.hqyj.ka.order.entity.Order.Status.DELIVERED) " +
           "and o.paidAt >= :start and o.paidAt < :end group by cast(o.paidAt as LocalDate)")
    List<DailySales> dailySales(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    interface ProductSales {
        Long getProductId();
        Long getQuantity();
    }

    @Query("select o.productId as productId, sum(o.quantity) as quantity from Order o " +
           "where (o.orderType = com.hqyj.ka.order.entity.Order.OrderType.GOODS or o.orderType is null) " +
           "and o.status in (com.hqyj.ka.order.entity.Order.Status.PAID, com.hqyj.ka.order.entity.Order.Status.DELIVERED) " +
           "group by o.productId")
    List<ProductSales> sumPurchasedQuantities();

    Optional<Order> findByOrderNo(String orderNo);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.orderNo = :orderNo")
    Optional<Order> lockByOrderNo(@Param("orderNo") String orderNo);

    /** 会员中心「我的订单」分页(含充值单)。 */
    Page<Order> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);

    /**
     * 状态机 CAS:只有未支付订单能被标记支付成功,幂等入账的应用层闸门。
     * clearAutomatically:批量更新绕过一级缓存,清空后监听器重读才能看到 PAID 状态。
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :paid, o.paidAt = :paidAt, o.paidChannel = :channel " +
           "where o.id = :id and o.status = :pending")
    int markPaidCas(@Param("id") Long id, @Param("paidAt") LocalDateTime paidAt, @Param("channel") String channel,
                    @Param("paid") Order.Status paid, @Param("pending") Order.Status pending);

    List<Order> findTop200ByStatusAndExpireAtBefore(Order.Status status, LocalDateTime time);

    long countByStatusAndExpireAtBefore(Order.Status status, LocalDateTime time);

    long countByStatus(Order.Status status);

    /** 已支付但未交付的商品单。orderType 为空的旧行按商品单计。 */
    @Query("select count(o) from Order o where o.status = com.hqyj.ka.order.entity.Order.Status.PAID "
            + "and o.deliveryMode = :mode "
            + "and (o.orderType = com.hqyj.ka.order.entity.Order.OrderType.GOODS or o.orderType is null)")
    long countPaidGoods(@Param("mode") Order.DeliveryMode mode);

    @Query("select min(o.paidAt) from Order o where o.status = com.hqyj.ka.order.entity.Order.Status.PAID "
            + "and o.deliveryMode = :mode "
            + "and (o.orderType = com.hqyj.ka.order.entity.Order.OrderType.GOODS or o.orderType is null)")
    LocalDateTime oldestPaidGoods(@Param("mode") Order.DeliveryMode mode);

    @Query("select count(o) from Order o where o.status = com.hqyj.ka.order.entity.Order.Status.PAID "
            + "and o.orderType = com.hqyj.ka.order.entity.Order.OrderType.RECHARGE")
    long countPaidRecharge();

    @Query("select min(o.paidAt) from Order o where o.status = com.hqyj.ka.order.entity.Order.Status.PAID "
            + "and o.orderType = com.hqyj.ka.order.entity.Order.OrderType.RECHARGE")
    LocalDateTime oldestPaidRecharge();

    // ── 反库存挤占:同邮箱 / 同 IP 的未支付订单计数 ──
    long countByStatusAndContact(Order.Status status, String contact);

    long countByStatusAndBuyerIp(Order.Status status, String buyerIp);

    List<Order> findByContactOrderByIdDesc(String contact);

    @Query("select coalesce(sum(o.quantity), 0) from Order o " +
           "where o.productId = :productId and o.orderType = com.hqyj.ka.order.entity.Order.OrderType.GOODS " +
           "and o.deliveryMode = com.hqyj.ka.order.entity.Order.DeliveryMode.AUTO_CARD " +
           "and o.status = com.hqyj.ka.order.entity.Order.Status.PENDING")
    long sumPendingAutoCardQuantity(@Param("productId") Long productId);

    @Query("select o from Order o where o.status in :statuses " +
           "and exists (select 1 from PaymentTransaction t where t.orderId = o.id " +
           "and t.status = com.hqyj.ka.payment.entity.PaymentTransaction.Status.SUCCESS) " +
           "and (:kw is null or lower(o.orderNo) like lower(concat('%', :kw, '%')) " +
           "or lower(o.contact) like lower(concat('%', :kw, '%')) " +
           "or exists (select 1 from PaymentTransaction t2 where t2.orderId = o.id and t2.channelTradeNo is not null " +
           "and lower(t2.channelTradeNo) like lower(concat('%', :kw, '%'))) " +
           "or exists (select 1 from CryptoPaymentIntent i where i.orderId = o.id and i.txHash is not null " +
           "and lower(i.txHash) like lower(concat('%', :kw, '%'))))")
    Page<Order> findLatePaidOrders(@Param("statuses") List<Order.Status> statuses,
                                   @Param("kw") String keyword,
                                   Pageable pageable);

    /** 管理端订单搜索:订单号、联系方式、支付宝/易支付交易号、链上 TxID。 */
    @Query("select o from Order o where (:status is null or o.status = :status) and (" +
           ":kw is null or lower(o.orderNo) like lower(concat('%', :kw, '%')) " +
           "or lower(o.contact) like lower(concat('%', :kw, '%')) " +
           "or exists (select 1 from PaymentTransaction t where t.orderId = o.id and t.channelTradeNo is not null " +
           "and lower(t.channelTradeNo) like lower(concat('%', :kw, '%'))) " +
           "or exists (select 1 from CryptoPaymentIntent i where i.orderId = o.id and i.txHash is not null " +
           "and lower(i.txHash) like lower(concat('%', :kw, '%'))))")
    Page<Order> searchAdmin(@Param("status") Order.Status status, @Param("kw") String keyword, Pageable pageable);

    /** 通用状态 CAS(人工关单等):只允许从 from 状态迁移,防止与支付回调竞态。 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :to where o.id = :id and o.status = :from")
    int casStatus(@Param("id") Long id, @Param("from") Order.Status from, @Param("to") Order.Status to);
}
