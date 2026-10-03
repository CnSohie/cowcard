package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.article.service.ArticleService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SiteAvailabilityServiceTest {
    private final ConfigService config = mock(ConfigService.class);
    private final SiteAvailabilityService service = new SiteAvailabilityService(config);

    private Map<String, String> schedule(String start, String end) {
        return new HashMap<>(Map.of("site.off_hours.enabled", "1", "site.off_hours.start", start, "site.off_hours.end", end));
    }
    private SiteAvailabilityService.Status at(Map<String, String> cfg, String time) {
        return SiteAvailabilityService.evaluate(cfg, Instant.parse("2026-10-01T" + time + ":00Z"));
    }

    @Test void defaultsOpen() {
        assertEquals("OPEN", at(Map.of(), "16:00").state());
        service.validateConfiguration(Map.of());
    }

    @Test void overnightUsesShanghaiTimeAndExclusiveEnd() {
        var cfg = schedule("22:00", "09:00");
        assertEquals("OPEN", at(cfg, "13:59").state());
        assertEquals("OFF_HOURS", at(cfg, "14:00").state());
        assertEquals("2026-10-02T09:00+08:00", at(cfg, "14:00").resumesAt());
        assertEquals("OFF_HOURS", at(cfg, "00:59").state());
        assertEquals("OPEN", at(cfg, "01:00").state());
    }

    @Test void sameDayWindowAndMaintenancePriority() {
        var cfg = schedule("12:00", "14:00");
        assertEquals("OPEN", at(cfg, "03:59").state());
        assertEquals("OFF_HOURS", at(cfg, "04:00").state());
        assertEquals("OPEN", at(cfg, "06:00").state());
        cfg.put("site.maintenance.enabled", "1");
        assertEquals("MAINTENANCE", at(cfg, "04:00").state());
        assertNull(at(cfg, "04:00").resumesAt());
        cfg.put("site.maintenance.enabled", "0");
        assertEquals("OFF_HOURS", at(cfg, "04:00").state());
        cfg.put("site.off_hours.enabled", "0");
        assertEquals("OPEN", at(cfg, "04:00").state());
    }

    @Test void rejectsInvalidConfiguration() {
        for (String start : new String[]{"24:00", "9:00", "09:60", "", "09:00"}) {
            assertThrows(BusinessException.class, () -> service.validateConfiguration(schedule(start, "09:00")));
        }
        assertThrows(BusinessException.class, () -> service.validateConfiguration(Map.of("site.maintenance.enabled", "yes")));
        assertThrows(BusinessException.class, () -> service.validateConfiguration(Map.of("site.maintenance.message", "a".repeat(501))));
    }

    @Test void blocksTransactionsBeforeAnySideEffects() {
        when(config.all()).thenReturn(Map.of("site.maintenance.enabled", "1"));
        OrderService orders = mock(OrderService.class, CALLS_REAL_METHODS);
        ArticleService articles = mock(ArticleService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(orders, "siteAvailabilityService", service);
        ReflectionTestUtils.setField(articles, "siteAvailabilityService", service);
        assertEquals(ErrorCode.SITE_UNAVAILABLE, assertThrows(BusinessException.class, () -> orders.create(null, null, null)).getErrorCode());
        assertThrows(BusinessException.class, () -> orders.createRecharge(null, null, null, null));
        assertThrows(BusinessException.class, () -> articles.purchase(null, null));
        when(config.all()).thenReturn(Map.of());
        assertDoesNotThrow(service::requireOpen);
    }
}
