package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.sysconfig.service.ConfigService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class FxRateServiceTest {
    @Test
    void stablecoinCollectionAddsHalfPercentBeforeRoundingWithoutChangingOtherConversions() {
        ConfigService config = mock(ConfigService.class);
        when(config.all()).thenReturn(Map.of("site.currency", "CNY"));
        var fx = new FxRateService(new AppProperties(), config, JsonMapper.builder().build());
        fx.init();

        assertEquals(new BigDecimal("10.05"), fx.siteToUsd(new BigDecimal("72.00")));
        // 72 / 7.2 * 1.005 = 10.05;非整额在加价后统一向上取整。
        assertEquals(new BigDecimal("10.06"), fx.siteToUsd(new BigDecimal("72.01")));
        assertEquals(new BigDecimal("7.20"), fx.getRate());
        assertEquals(new BigDecimal("72.00"), fx.siteToCny(new BigDecimal("72.00")));

        when(config.all()).thenReturn(Map.of("site.currency", "USD"));
        assertEquals(new BigDecimal("10.05"), fx.siteToUsd(new BigDecimal("10.00")));
        when(config.all()).thenReturn(Map.of("site.currency", "EUR"));
        assertEquals(new BigDecimal("10.05"), fx.siteToUsd(new BigDecimal("9.20")));
    }
}
