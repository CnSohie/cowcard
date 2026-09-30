package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.wallet.entity.*;
import com.hqyj.ka.wallet.repo.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.math.BigDecimal;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest
@Import({WalletService.class,WithdrawMethodService.class,WithdrawPayoutService.class})
class PartialWithdrawalTest {
 @Autowired WalletAccountRepository accounts;
 @Autowired WithdrawRequestRepository requests;
 @Autowired WalletService service;
 @MockitoBean ConfigService config;
 @MockitoBean FxRateService fx;
 private BigDecimal n(String v) {return new BigDecimal(v);}
 @BeforeEach void setup() {
  when(config.all()).thenReturn(Map.of("wallet.min_withdraw","1","wallet.withdraw_methods","ALIPAY"));
  var a=new WalletAccount();a.setMemberId(901L);accounts.saveAndFlush(a);
 }
 private WalletAccount account() {return accounts.findByMemberId(901L).orElseThrow();}
 private void credit(String amount,WalletTxn.Type type) {service.credit(901L,n(amount),type,"ORDER",1L,"test");}
 private WithdrawRequest withdraw(String amount) {return service.requestWithdraw(901L,n(amount),"ALIPAY","13800138000","张三",null);}
 @Test void withdrawingThirtyLeavesSeventyAndApprovalDoesNotDeductAgain() {
  credit("100.00",WalletTxn.Type.COMMISSION);var r=withdraw("30.00");
  assertEquals(n("70.00"),account().getWithdrawableBalance());
  assertEquals(n("30.00"),account().getWithdrawalFrozen());
  service.reviewWithdraw(r.getId(),true,"admin",null);
  assertEquals(n("70.00"),account().getBalance());assertEquals(0,account().getWithdrawalFrozen().signum());
 }
 @Test void rechargeAndGiftCannotBeWithdrawn() {
  credit("100.00",WalletTxn.Type.RECHARGE);credit("20.00",WalletTxn.Type.GIFT_CARD);
  assertThrows(BusinessException.class,()->withdraw("10.00"));
  assertEquals(n("120.00"),account().getShoppingBalance());assertEquals(0,account().getWithdrawableBalance().signum());
 }
 @Test void mixedPurchaseAndPartialRefundPreserveSources() {
  credit("100.00",WalletTxn.Type.RECHARGE);credit("50.00",WalletTxn.Type.COMMISSION);
  service.debit(901L,n("120.00"),WalletTxn.Type.PURCHASE,"ORDER",2L,"buy");
  assertEquals(0,account().getShoppingBalance().signum());assertEquals(n("30.00"),account().getWithdrawableBalance());
  service.credit(901L,n("10.00"),WalletTxn.Type.ADMIN_REFUND,"ORDER",2L,"partial");
  assertEquals(n("40.00"),account().getWithdrawableBalance());
  service.credit(901L,n("110.00"),WalletTxn.Type.ADMIN_REFUND,"ORDER",2L,"remaining");
  assertEquals(n("100.00"),account().getShoppingBalance());assertEquals(n("50.00"),account().getWithdrawableBalance());
 }
 @Test void externalPaymentRefundCannotBecomeWithdrawable() {
  service.credit(901L,n("80.00"),WalletTxn.Type.ADMIN_REFUND,"ORDER",8L,"external refund");
  assertEquals(n("80.00"),account().getShoppingBalance());assertEquals(0,account().getWithdrawableBalance().signum());
 }
 @Test void manualUnfreezeDoesNotTouchWithdrawalAndReturnsToOriginalBuckets() {
  credit("40.00",WalletTxn.Type.RECHARGE);credit("100.00",WalletTxn.Type.COMMISSION);
  var r=withdraw("30.00");service.adminFreeze(901L,n("60.00"),"admin","risk");
  assertEquals(n("40.00"),account().getShoppingFrozen());assertEquals(n("20.00"),account().getWithdrawableFrozen());
  service.adminUnfreeze(901L,n("60.00"),"admin","clear");
  assertEquals(n("30.00"),account().getWithdrawalFrozen());
  assertEquals(n("40.00"),account().getShoppingBalance());assertEquals(n("70.00"),account().getWithdrawableBalance());
  assertThrows(BusinessException.class,()->service.adminUnfreeze(901L,n("1.00"),"admin","invalid"));
 }
 @Test void legacyRejectedFundsReturnOnlyToShopping() {
  var a=account();a.setWithdrawalFrozen(n("30.00"));accounts.saveAndFlush(a);
  var r=new WithdrawRequest();r.setMemberId(901L);r.setAmount(n("30.00"));r.setChannel("ALIPAY");r.setAccount("13800138000");r.setWithdrawableSource(false);requests.saveAndFlush(r);
  service.reviewWithdraw(r.getId(),false,"admin","不通过");
  assertEquals(n("30.00"),account().getShoppingBalance());assertEquals(0,account().getWithdrawableBalance().signum());
 }
 @Test void rechargeReversalCannotTakeCommission() {
  credit("100.00",WalletTxn.Type.COMMISSION);
  assertThrows(BusinessException.class,()->service.debit(901L,n("30.00"),WalletTxn.Type.RECHARGE_REVERSAL,"ORDER",1L,"reverse"));
 }
}
