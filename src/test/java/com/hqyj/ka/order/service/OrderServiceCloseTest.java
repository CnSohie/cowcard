package com.hqyj.ka.order.service;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.wallet.service.WalletService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceCloseTest {
 @Mock OrderRepository orders;
 @Mock ProductRepository products;
 @Mock WalletService wallet;
 @Mock CacheManager cache;
 @InjectMocks OrderService service;
 private Order order(Order.Status status) {
  var o=new Order();o.setId(1L);o.setOrderNo("TEST");o.setStatus(status);
  o.setOrderType(Order.OrderType.GOODS);o.setDeliveryMode(Order.DeliveryMode.AUTO_CARD);
  o.setProductId(2L);o.setQuantity(3);
  when(orders.findByOrderNo("TEST")).thenReturn(Optional.of(o));return o;
 }
 @Test void expiredOrderClosesWithoutReturningStockOrMoneyAgain() {
  order(Order.Status.EXPIRED);
  when(orders.casStatus(1L,Order.Status.EXPIRED,Order.Status.CLOSED)).thenReturn(1);
  assertTrue(service.closeManually("TEST"));verifyNoInteractions(products,wallet,cache);
 }
 @Test void pendingOrderActuallyClosesAndReleasesStock() {
  order(Order.Status.PENDING);
  when(orders.casStatus(1L,Order.Status.PENDING,Order.Status.CLOSED)).thenReturn(1);
  assertTrue(service.closeManually("TEST"));verify(products).releaseStock(2L,3);
 }
 @Test void paymentRaceCannotReleaseStock() {
  order(Order.Status.PENDING);
  assertFalse(service.closeManually("TEST"));verifyNoInteractions(products,wallet,cache);
 }
 @Test void paidOrderCannotBeClosed() {
  order(Order.Status.PAID);
  assertFalse(service.closeManually("TEST"));verify(orders,never()).casStatus(any(),any(),any());
 }
}
