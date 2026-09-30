package com.hqyj.ka.order.service;

import com.hqyj.ka.catalog.entity.Product;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OrderServiceMinimumAmountTest {

    @Test
    void checksMinimumAgainstListPriceSubtotalBeforeDiscounts() {
        Product product = new Product();
        product.setPrice(new BigDecimal("19.90"));
        product.setMinOrderAmount(new BigDecimal("50.00"));

        assertFalse(OrderService.meetsMinimumOrderAmount(product, 2));
        assertTrue(OrderService.meetsMinimumOrderAmount(product, 3));
    }

    @Test
    void zeroOrLegacyNullMeansNoAmountThreshold() {
        Product product = new Product();
        product.setPrice(new BigDecimal("1.00"));
        product.setMinOrderAmount(BigDecimal.ZERO);
        assertTrue(OrderService.meetsMinimumOrderAmount(product, 1));

        product.setMinOrderAmount(null);
        assertTrue(OrderService.meetsMinimumOrderAmount(product, 1));
    }
}
