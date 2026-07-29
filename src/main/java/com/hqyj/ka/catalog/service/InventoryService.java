package com.hqyj.ka.catalog.service;

import com.hqyj.ka.card.entity.CardSecret;
import com.hqyj.ka.card.repo.CardSecretRepository;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商品可售库存口径:未售卡密数 - 待支付自动卡订单预占数。
 * 不可直接用未售卡密数覆盖商品库存,否则支付发货后会把其他待支付订单的预占库存加回来。
 */
@Service
@RequiredArgsConstructor
public class InventoryService {

    private final CardSecretRepository cardRepository;
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final CacheManager cacheManager;

    @Transactional(readOnly = true)
    public long sellableStock(Long productId) {
        long available = cardRepository.countByProductIdAndStatus(productId, CardSecret.Status.AVAILABLE);
        long reserved = orderRepository.sumPendingAutoCardQuantity(productId);
        return Math.max(0, available - reserved);
    }

    @Transactional
    public int syncAutoCardStock(Long productId) {
        long sellable = sellableStock(productId);
        int stock = sellable > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) sellable;
        productRepository.findById(productId).ifPresent(product -> product.setStockCached(stock));
        evictProductCache();
        return stock;
    }

    private void evictProductCache() {
        Cache cache = cacheManager.getCache("products");
        if (cache != null) cache.clear();
    }
}
