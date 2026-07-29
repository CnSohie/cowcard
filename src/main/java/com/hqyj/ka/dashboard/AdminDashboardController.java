package com.hqyj.ka.dashboard;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/dashboard")
@RequiredArgsConstructor
public class AdminDashboardController {

    private final OrderRepository orderRepository;
    private final PaymentTransactionRepository transactionRepository;

    @GetMapping
    @PreAuthorize("hasAuthority('dashboard:read')")
    public ApiResponse<Map<String, Object>> stats() {
        LocalDate today = LocalDate.now();
        LocalDateTime weekStart = today.minusDays(6).atStartOfDay();
        List<PaymentTransaction> recent = transactionRepository
                .findByStatusAndPaidAtAfter(PaymentTransaction.Status.SUCCESS, weekStart);

        // 近 7 天逐日营收(含今天,缺日补零)
        Map<String, BigDecimal> daily = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) daily.put(today.minusDays(i).toString(), BigDecimal.ZERO);
        BigDecimal todayRevenue = BigDecimal.ZERO;
        long todayCount = 0;
        for (PaymentTransaction tx : recent) {
            String day = tx.getPaidAt().toLocalDate().toString();
            daily.computeIfPresent(day, (k, v) -> v.add(tx.getAmount()));
            if (tx.getPaidAt().toLocalDate().equals(today)) {
                todayRevenue = todayRevenue.add(tx.getAmount());
                todayCount++;
            }
        }
        List<Map<String, Object>> revenue7d = new ArrayList<>();
        daily.forEach((day, amount) -> revenue7d.add(Map.of("date", day, "amount", amount)));
        BigDecimal weekRevenue = recent.stream().map(PaymentTransaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("todayRevenue", todayRevenue);
        out.put("todayPaidCount", todayCount);
        out.put("weekRevenue", weekRevenue);
        out.put("revenue7d", revenue7d);
        out.put("pendingOrders", orderRepository.countByStatus(Order.Status.PENDING));
        out.put("paidOrders", orderRepository.countByStatus(Order.Status.PAID));
        out.put("deliveredOrders", orderRepository.countByStatus(Order.Status.DELIVERED));
        out.put("totalOrders", orderRepository.count());
        return ApiResponse.ok(out);
    }
}
