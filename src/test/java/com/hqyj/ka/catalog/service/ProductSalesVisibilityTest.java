package com.hqyj.ka.catalog.service;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.CategoryRepository;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProductSalesVisibilityTest {
    @Test
    void salesAreOptInAndZeroIsVisibleWhenEnabled() {
        var config = mock(ConfigService.class);
        var orders = mock(OrderRepository.class);
        var sales = new ProductSalesService(orders, config);
        var catalog = new CatalogService(mock(CategoryRepository.class), mock(ProductRepository.class),
                mock(ManualDeliveryFormService.class), sales, mock(WholesalePricingService.class));
        var product = new Product();
        product.setId(7L);
        when(config.all()).thenReturn(Map.of());
        assertNull(catalog.toCard(product).soldQuantity());
        verifyNoInteractions(orders);
        when(config.all()).thenReturn(Map.of("site.show_sales", "1"));
        assertEquals(0L, catalog.toCard(product).soldQuantity());
        when(config.all()).thenReturn(Map.of("site.show_sales", "0"));
        assertNull(catalog.toCard(product).soldQuantity());
    }
}
