package com.hqyj.ka.payment.balance;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.wallet.service.WalletService;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BalancePaymentStrategyTest {
    @Test
    void ownershipFailureDoesNotReportExpiredSessionOrDebitWallet() {
        var wallet = mock(WalletService.class);
        var orders = mock(OrderService.class);
        var strategy = new BalancePaymentStrategy(wallet, orders);
        var order = new Order();
        var context = new PayContext("127.0.0.1", 7L, Map.of());
        var guest = assertThrows(BusinessException.class, () -> strategy.create(order, Map.of(), context));
        assertEquals(ErrorCode.ORDER_STATE_INVALID, guest.getErrorCode());
        order.setMemberId(8L);
        var other = assertThrows(BusinessException.class, () -> strategy.create(order, Map.of(), context));
        assertEquals(ErrorCode.FORBIDDEN, other.getErrorCode());
        var expired = assertThrows(BusinessException.class, () -> strategy.create(order, Map.of(), new PayContext("127.0.0.1", null, Map.of())));
        assertEquals(ErrorCode.UNAUTHORIZED, expired.getErrorCode());
        verifyNoInteractions(wallet, orders);
    }
}
