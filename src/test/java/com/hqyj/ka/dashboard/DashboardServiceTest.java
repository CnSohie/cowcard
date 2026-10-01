package com.hqyj.ka.dashboard;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import(DashboardService.class)
class DashboardServiceTest {
    @Autowired DashboardService dashboard;
    @Autowired OrderRepository orders;

    private void order(LocalDateTime paidAt, Order.Status status, Order.OrderType type, String amount, String wallet, String refunded) {
        var o = new Order();
        o.setOrderNo(UUID.randomUUID().toString().replace("-", ""));
        o.setProductId(7L); o.setProductName("test"); o.setContact("test@example.com");
        o.setUnitPrice(BigDecimal.TEN); o.setQuantity(1); o.setExpireAt(LocalDateTime.now().plusMinutes(15));
        o.setPaidAt(paidAt); o.setStatus(status); o.setOrderType(type);
        o.setAmount(new BigDecimal(amount)); o.setWalletPaidAmount(new BigDecimal(wallet));
        o.setWalletRefundedAmount(new BigDecimal(refunded));
        orders.save(o);
    }

    @Test void actualPaidGoodsCountOnceWithWalletRefundsAndExactDateBoundaries() {
        var today = LocalDate.now();
        order(today.atStartOfDay(), Order.Status.DELIVERED, Order.OrderType.GOODS, "70", "30", "10");
        order(today.atTime(12, 0), Order.Status.PAID, null, "0", "20", "0");
        order(today.minusDays(6).atStartOfDay(), Order.Status.DELIVERED, Order.OrderType.GOODS, "5", "0", "0");
        order(today.minusDays(7).atTime(23, 59), Order.Status.DELIVERED, Order.OrderType.GOODS, "999", "0", "0");
        order(today.plusDays(1).atStartOfDay(), Order.Status.DELIVERED, Order.OrderType.GOODS, "999", "0", "0");
        order(today.atTime(12, 0), Order.Status.DELIVERED, Order.OrderType.RECHARGE, "999", "0", "0");
        order(null, Order.Status.DELIVERED, Order.OrderType.GOODS, "999", "0", "0");
        for (var status : new Order.Status[]{Order.Status.PENDING, Order.Status.EXPIRED, Order.Status.CLOSED, Order.Status.REFUNDED}) {
            order(today.atTime(12, 0), status, Order.OrderType.GOODS, "999", "0", "0");
        }
        orders.flush();
        var stats = dashboard.stats();
        assertThat(stats.todayRevenue()).isEqualByComparingTo("110");
        assertThat(stats.todayPaidCount()).isEqualTo(2);
        assertThat(stats.weekRevenue()).isEqualByComparingTo("115");
        assertThat(stats.revenue7d()).hasSize(7);
        assertThat(stats.revenue7d().get(0).date()).isEqualTo(today.minusDays(6));
        assertThat(stats.revenue7d().get(0).amount()).isEqualByComparingTo("5");
        assertThat(stats.revenue7d().get(1).amount()).isZero();
        assertThat(stats.revenue7d().stream().map(DashboardService.DayRevenue::amount).reduce(BigDecimal.ZERO, BigDecimal::add))
                .isEqualByComparingTo(stats.weekRevenue());
    }

    @Test void emptyDatabaseProducesSevenRealZeros() {
        var stats = dashboard.stats();
        assertThat(stats.todayRevenue()).isZero();
        assertThat(stats.weekRevenue()).isZero();
        assertThat(stats.todayPaidCount()).isZero();
        assertThat(stats.revenue7d()).hasSize(7).allSatisfy(day -> assertThat(day.amount()).isZero());
    }
}
