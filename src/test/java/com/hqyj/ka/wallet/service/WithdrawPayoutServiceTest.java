package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.wallet.dto.WalletDtos.WithdrawView;
import com.hqyj.ka.wallet.entity.WithdrawRequest;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WithdrawPayoutServiceTest {
    private final FxRateService fx = mock(FxRateService.class);
    private final WithdrawPayoutService service = new WithdrawPayoutService(fx);

    private WithdrawRequest request(String channel) {
        var r = new WithdrawRequest();
        r.setChannel(channel);
        r.setAmount(new BigDecimal("100.00"));
        r.setFeeAmount(new BigDecimal("3.50"));
        r.setNetAmount(new BigDecimal("96.50"));
        return r;
    }

    @Test void convertsNetCnyAndPreservesSnapshotAcrossRateChanges() {
        for (String channel : new String[]{"USDT_TRC20", "USDT_BEP20"}) {
            when(fx.getRate()).thenReturn(new BigDecimal("7.2"));
            var r = request(channel);
            service.snapshot(r);
            assertEquals("13.402777", r.getPayoutAmount());
            assertEquals("USDT", r.getPayoutCurrency());
            when(fx.getRate()).thenReturn(new BigDecimal("6.8"));
            var view = WithdrawView.of(r);
            assertEquals("13.402777", view.payoutAmount());
            assertEquals(new BigDecimal("7.20000000"), view.payoutFxRate());
        }
    }

    @Test void cnyChannelsPayNetYuanWithoutConversion() {
        for (String channel : new String[]{"ALIPAY", "BANK"}) {
            var r = request(channel);
            service.snapshot(r);
            assertEquals("96.50", r.getPayoutAmount());
            assertEquals("CNY", r.getPayoutCurrency());
            assertNull(r.getPayoutFxRate());
        }
        verifyNoInteractions(fx);
    }

    @Test void rejectsUnavailableRate() {
        when(fx.getRate()).thenReturn(BigDecimal.ZERO);
        assertThrows(BusinessException.class, () -> service.snapshot(request("USDT_BEP20")));
    }
}
