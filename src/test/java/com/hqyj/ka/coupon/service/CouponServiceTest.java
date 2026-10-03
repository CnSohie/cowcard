package com.hqyj.ka.coupon.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.coupon.entity.Coupon;
import com.hqyj.ka.coupon.repo.CouponRepository;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CouponServiceTest {
    private final CouponRepository repo = mock(CouponRepository.class);
    private final CouponService service = new CouponService(repo);
    private Coupon coupon(Long product) {
        Coupon c = new Coupon(); c.setId(1L); c.setProductId(product); c.setValue(new BigDecimal("5"));
        when(repo.findByCodeAndEnabledTrue("TEST")).thenReturn(Optional.of(c));
        when(repo.redeem(eq(1L), any(), any())).thenReturn(1);
        return c;
    }
    @Test void generalCouponWorksForDifferentProducts() {
        coupon(null);
        assertEquals(new BigDecimal("5"), service.preview("TEST", new BigDecimal("10"), 12L));
        assertEquals(new BigDecimal("5"), service.redeem("TEST", new BigDecimal("10"), 13L));
    }
    @Test void scopedCouponOnlyWorksOnSelectedProduct() {
        coupon(12L);
        assertThrows(BusinessException.class, () -> service.preview("TEST", new BigDecimal("10"), 13L));
        assertThrows(BusinessException.class, () -> service.redeem("TEST", new BigDecimal("10"), null));
        verify(repo, never()).redeem(any(), any(), any());
        assertEquals(new BigDecimal("5"), service.redeem("TEST", new BigDecimal("10"), 12L));
    }
    @Test void expiredCouponCannotPreviewOrRedeem() {
        Coupon c = coupon(null); c.setExpireAt(LocalDateTime.now().minusSeconds(1));
        assertThrows(BusinessException.class, () -> service.preview("TEST", BigDecimal.TEN, 12L));
        assertThrows(BusinessException.class, () -> service.redeem("TEST", BigDecimal.TEN, 12L));
        verify(repo, never()).redeem(any(), any(), any());
    }
    @Test void atomicRejectionAndDiscountCapRemainEffective() {
        coupon(12L);
        assertEquals(new BigDecimal("0.99"), service.preview("TEST", BigDecimal.ONE, 12L));
        when(repo.redeem(eq(1L), any(), any())).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.redeem("TEST", BigDecimal.TEN, 12L));
    }
}
