package com.hqyj.ka.catalog.service;

import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProductSalesService {
    private final OrderRepository orders;
    private final ConfigService config;

    public boolean enabled() {
        return "1".equals(config.all().get("site.show_sales"));
    }

    /** 批量统计并缓存五分钟,不对每件商品单独扫描订单。 */
    @Cacheable(cacheNames = "products", key = "'sales'")
    @Transactional(readOnly = true)
    public Map<Long, Long> quantities() {
        return orders.sumPurchasedQuantities().stream().collect(Collectors.toMap(
                OrderRepository.ProductSales::getProductId, OrderRepository.ProductSales::getQuantity));
    }
}
