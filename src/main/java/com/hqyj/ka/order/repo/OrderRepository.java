package com.hqyj.ka.order.repo;

import com.hqyj.ka.order.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNo(String orderNo);

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
