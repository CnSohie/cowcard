package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.sysconfig.service.ConfigService;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WithdrawMethodServiceTest {
    private final ConfigService config = mock(ConfigService.class);
    private final WithdrawMethodService service = new WithdrawMethodService(config);

    @Test
    void rejectsChannelNotEnabledByAdmin() {
        when(config.all()).thenReturn(Map.of(WithdrawMethodService.CONFIG_KEY, "ALIPAY"));
        assertThrows(BusinessException.class, () -> service.validate(
                "USDT_TRC20", "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", null, null));
    }

    @Test
    void validatesAlipayIdentityAndBankCard() {
        when(config.all()).thenReturn(Map.of(WithdrawMethodService.CONFIG_KEY, "ALIPAY,BANK"));
        assertEquals("13800138000", service.validate("ALIPAY", "13800138000", "张三", null).account());
        assertEquals("4532015112830366", service.validate("BANK", "4532 0151 1283 0366", "张三", "测试银行").account());
        assertThrows(BusinessException.class, () -> service.validate("BANK", "1234567890123456", "张三", "测试银行"));
    }

    @Test
    void keepsTrc20AndBep20NetworksSeparate() {
        when(config.all()).thenReturn(Map.of(WithdrawMethodService.CONFIG_KEY, "USDT_TRC20,USDT_BEP20"));
        assertDoesNotThrow(() -> service.validate("USDT_TRC20", "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", null, null));
        assertThrows(BusinessException.class, () -> service.validate("USDT_TRC20", "0x1111111111111111111111111111111111111111", null, null));
        assertDoesNotThrow(() -> service.validate("USDT_BEP20", "0x1111111111111111111111111111111111111111", null, null));
    }

    @Test
    void calculatesMethodSpecificFeeAndNetAmount() {
        when(config.all()).thenReturn(Map.of(
                WithdrawMethodService.CONFIG_KEY, "ALIPAY",
                "wallet.withdraw_fee_rate.ALIPAY", "2.5",
                "wallet.withdraw_fee_fixed.ALIPAY", "1.00"));
        var quote = service.feeQuote("ALIPAY", new BigDecimal("100.00"));
        assertEquals(new BigDecimal("3.50"), quote.feeAmount());
        assertEquals(new BigDecimal("96.50"), quote.netAmount());
    }
}
