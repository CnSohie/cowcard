package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.wallet.entity.*;
import com.hqyj.ka.wallet.repo.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WithdrawReviewTest {
    private final WalletAccountRepository accounts = mock(WalletAccountRepository.class);
    private final WalletTxnRepository txns = mock(WalletTxnRepository.class);
    private final WithdrawRequestRepository requests = mock(WithdrawRequestRepository.class);
    private final WalletService service = new WalletService(accounts, txns, requests,
            mock(ConfigService.class), mock(WithdrawMethodService.class), mock(WithdrawPayoutService.class));
    private WalletAccount wallet() {
        var a = new WalletAccount(); a.setMemberId(2L); a.setWithdrawalFrozen(new BigDecimal("100.00"));
        when(accounts.findByMemberId(2L)).thenReturn(Optional.of(a));
        when(accounts.lockByMemberId(2L)).thenReturn(Optional.of(a));
        ReflectionTestUtils.setField(service, "entityManager", mock(EntityManager.class));
        return a;
    }
    @Test void manualUnfreezeCannotReleaseWithdrawalReservation() {
        var a=wallet();
        assertThrows(BusinessException.class, () -> service.adminUnfreeze(2L, new BigDecimal("30.00"), "admin", "解冻"));
        assertEquals(new BigDecimal("100.00"),a.getWithdrawalFrozen());
        verifyNoInteractions(txns);
    }
    @Test void blankRejectionNeverChangesStatusOrBalance() {
        assertThrows(BusinessException.class, () -> service.reviewWithdraw(1L, false, "admin", "  "));
        verifyNoInteractions(requests, accounts, txns);
    }
    @Test void rejectionReturnsFullAmountToWithdrawableWallet() {
        var a=wallet(); var r=new WithdrawRequest();r.setMemberId(2L);r.setAmount(new BigDecimal("100.00"));
        when(requests.findById(1L)).thenReturn(Optional.of(r));
        when(requests.casStatus(1L, WithdrawRequest.Status.PENDING, WithdrawRequest.Status.REJECTED)).thenReturn(1);
        var result=service.reviewWithdraw(1L,false,"admin"," 地址网络错误 ");
        assertEquals("地址网络错误",result.getReviewNote());
        assertEquals(new BigDecimal("100.00"),a.getWithdrawableBalance());
        assertEquals(0,a.getWithdrawalFrozen().signum());
    }
    @Test void legacyCryptoWithoutQuoteCannotConsumeFrozenFunds() {
        var a=wallet(); var r=new WithdrawRequest();r.setMemberId(2L);r.setAmount(new BigDecimal("100.00"));r.setChannel("USDT_BEP20");
        when(requests.findById(1L)).thenReturn(Optional.of(r));
        when(requests.casStatus(1L, WithdrawRequest.Status.PENDING, WithdrawRequest.Status.APPROVED)).thenReturn(1);
        assertThrows(BusinessException.class, () -> service.reviewWithdraw(1L,true,"admin",null));
        assertEquals(new BigDecimal("100.00"),a.getWithdrawalFrozen());
        verifyNoInteractions(txns);
    }
}
