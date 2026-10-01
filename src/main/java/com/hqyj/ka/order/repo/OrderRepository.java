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

    long countByStatus(Order.Status status);

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
           "or lower(o.contact) like lower(concat('%', :kw, '%')))")
    Page<Order> findLatePaidOrders(@Param("statuses") List<Order.Status> statuses,
                                   @Param("kw") String keyword,
                                   Pageable pageable);

    /** 通用状态 CAS(人工关单等):只允许从 from 状态迁移,防止与支付回调竞态。 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.status = :to where o.id = :id and o.status = :from")
    int casStatus(@Param("id") Long id, @Param("from") Order.Status from, @Param("to") Order.Status to);

    // ── 管理端筛选(派生查询,And 优先级高于 Or:等价 (status AND 单号like) OR (status AND 联系人like))──
    Page<Order> findByStatus(Order.Status status, Pageable pageable);

    Page<Order> findByOrderNoContainingIgnoreCaseOrContactContainingIgnoreCase(
            String orderNo, String contact, Pageable pageable);

    Page<Order> findByStatusAndOrderNoContainingIgnoreCaseOrStatusAndContactContainingIgnoreCase(
            Order.Status s1, String orderNo, Order.Status s2, String contact, Pageable pageable);
}
