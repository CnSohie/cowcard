package com.hqyj.ka.order.repo;

import com.hqyj.ka.order.entity.Order;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class ProductSalesTest {
    @Autowired OrderRepository orders;

    private void order(long product, int quantity, Order.Status status, Order.OrderType type) {
        var o = new Order();
        o.setOrderNo(UUID.randomUUID().toString().replace("-", ""));
        o.setProductId(product);
        o.setProductName("test");
        o.setQuantity(quantity);
        o.setUnitPrice(BigDecimal.ONE);
        o.setAmount(BigDecimal.valueOf(quantity));
        o.setContact("test@example.com");
        o.setExpireAt(LocalDateTime.now().plusMinutes(15));
        o.setStatus(status);
        o.setOrderType(type);
        orders.save(o);
    }

    @Test
    void countsPaidQuantitiesIncludingLegacyGoodsButExcludesUnpaidRefundsAndRecharge() {
        order(1, 3, Order.Status.PAID, Order.OrderType.GOODS);
        order(1, 2, Order.Status.DELIVERED, null);
        order(2, 4, Order.Status.DELIVERED, Order.OrderType.GOODS);
        for (var status : new Order.Status[]{Order.Status.PENDING, Order.Status.CLOSED, Order.Status.EXPIRED, Order.Status.REFUNDED}) {
            order(1, 10, status, Order.OrderType.GOODS);
        }
        order(0, 100, Order.Status.PAID, Order.OrderType.RECHARGE);
        orders.flush();
        var totals = orders.sumPurchasedQuantities().stream().collect(Collectors.toMap(
                OrderRepository.ProductSales::getProductId, OrderRepository.ProductSales::getQuantity));
        assertEquals(java.util.Map.of(1L, 5L, 2L, 4L), totals);
    }
}
