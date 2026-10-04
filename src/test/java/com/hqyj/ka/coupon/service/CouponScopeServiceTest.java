package com.hqyj.ka.coupon.service;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CouponScopeServiceTest {
    private final ProductRepository products = mock(ProductRepository.class);
    private final CouponScopeService service = new CouponScopeService(products);

    @Test void blankScopeMeansEveryProduct() {
        service.validate(null);
        verify(products, never()).existsById(org.mockito.ArgumentMatchers.any());
    }

    @Test void missingOrZeroProductIsRejected() {
        when(products.existsById(9L)).thenReturn(false);
        assertThrows(BusinessException.class, () -> service.validate(0L));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.validate(9L));
        assertEquals("指定商品不存在，请重新选择", ex.getMessage());
    }

    @Test void namesOfReturnsExistingProductsOnly() {
        Product product = new Product();
        product.setId(9L);
        product.setName("月卡");
        when(products.findAllById(List.of(9L))).thenReturn(List.of(product));
        assertEquals("月卡", service.namesOf(Arrays.asList(9L, null, 0L)).get(9L));
        assertTrue(service.namesOf(List.of()).isEmpty());
    }
}
