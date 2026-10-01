package com.hqyj.ka.dashboard;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final OrderRepository orders;
    private final PaymentTransactionRepository transactions;

    public record DayRevenue(LocalDate date, BigDecimal amount) {}
    public record Stats(BigDecimal todayRevenue, long todayPaidCount, BigDecimal weekRevenue,
                        List<DayRevenue> revenue7d, long pendingOrders, long paidOrders,
                        long deliveredOrders, long latePaidOrders, long totalOrders) {}

    @Transactional(readOnly = true)
    public Stats stats() {
        LocalDate today = LocalDate.now();
        var rows = orders.dailySales(today.minusDays(6).atStartOfDay(), today.plusDays(1).atStartOfDay())
                .stream().collect(Collectors.toMap(OrderRepository.DailySales::getDay, r -> r));
        List<DayRevenue> days = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate date = today.minusDays(i);
            var row = rows.get(date);
            days.add(new DayRevenue(date, row == null ? BigDecimal.ZERO : row.getAmount()));
        }
        var todayRow = rows.get(today);
        return new Stats(days.get(6).amount(), todayRow == null ? 0 : todayRow.getOrderCount(),
                days.stream().map(DayRevenue::amount).reduce(BigDecimal.ZERO, BigDecimal::add), days,
                orders.countByStatus(Order.Status.PENDING), orders.countByStatus(Order.Status.PAID),
                orders.countByStatus(Order.Status.DELIVERED), transactions.countSuccessfulTxWithOrderStatusIn(
                        PaymentTransaction.Status.SUCCESS, List.of(Order.Status.EXPIRED, Order.Status.CLOSED)), orders.count());
    }
}
