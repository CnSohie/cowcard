package com.hqyj.ka.order;

import com.hqyj.ka.order.dto.OrderDtos.PaymentReconcile;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class OrderReconcileTest {

    @Test
    void alipayTradeNoStaysWhenAnUnusedChainIntentExists() {
        PaymentTransaction alipay = success(8L, "ALIPAY_OFFICIAL", "2026100422001400000001", "10.00");
        CryptoPaymentIntent abandoned = intent(3L, CryptoPaymentIntent.Status.CONFIRMING, "0xabc");

        PaymentReconcile reconcile = OrderReconcile.build("ALIPAY_OFFICIAL", alipay, abandoned);

        assertEquals("2026100422001400000001", reconcile.tradeNo());
        assertEquals("ALIPAY_OFFICIAL", reconcile.channelCode());
        assertEquals(new BigDecimal("10.00"), reconcile.paidAmount());
        assertNull(reconcile.chainCode());
        assertNull(reconcile.tokenAmount());
    }

    @Test
    void cryptoSettlementCarriesTxAndChainAmount() {
        PaymentTransaction paid = success(9L, "CRYPTO_TRANSFER", "0xabc123", "72.00");
        CryptoPaymentIntent confirmed = intent(4L, CryptoPaymentIntent.Status.CONFIRMED, "0xabc123");

        PaymentReconcile reconcile = OrderReconcile.build("CRYPTO_TRANSFER", paid, confirmed);

        assertEquals("0xabc123", reconcile.tradeNo());
        assertEquals("BASE", reconcile.chainCode());
        assertEquals("USDC", reconcile.tokenSymbol());
        assertEquals("10.000001", reconcile.tokenAmount());
        assertEquals("0xmerchant", reconcile.receiveAddress());
        assertEquals(6, reconcile.confirmations());
        assertEquals(12, reconcile.requiredConfirmations());
        assertEquals(88L, reconcile.blockNumber());
    }

    @Test
    void confirmingTxIsVisibleBeforeSettlement() {
        CryptoPaymentIntent confirming = intent(2L, CryptoPaymentIntent.Status.CONFIRMING, "0xpending");

        PaymentReconcile reconcile = OrderReconcile.build(null, null, confirming);

        assertEquals("0xpending", reconcile.tradeNo());
        assertEquals("CRYPTO_TRANSFER", reconcile.channelCode());
        assertNull(reconcile.paidAmount());
    }

    @Test
    void prefersConfirmedIntentAndTheChannelThatActuallyPaid() {
        CryptoPaymentIntent older = intent(1L, CryptoPaymentIntent.Status.EXPIRED, "0xold");
        CryptoPaymentIntent confirmed = intent(5L, CryptoPaymentIntent.Status.CONFIRMED, "0xnew");
        assertEquals("0xnew", OrderReconcile.preferIntent(older, confirmed).getTxHash());

        PaymentTransaction alipay = success(1L, "ALIPAY_OFFICIAL", "trade-a", "10.00");
        PaymentTransaction laterCrypto = success(2L, "CRYPTO_WALLET", "0xlate", "10.00");
        assertEquals("trade-a", OrderReconcile.preferTransaction(laterCrypto, alipay, "ALIPAY_OFFICIAL").getChannelTradeNo());
    }

    @Test
    void unpaidOrderHasNoReconcileRecord() {
        assertNull(OrderReconcile.build(null, null, null));
    }

    private static PaymentTransaction success(Long id, String channel, String tradeNo, String amount) {
        PaymentTransaction tx = new PaymentTransaction();
        tx.setId(id);
        tx.setChannelCode(channel);
        tx.setChannelTradeNo(tradeNo);
        tx.setAmount(new BigDecimal(amount));
        tx.setFeeAmount(new BigDecimal("0.10"));
        tx.setPaidAt(LocalDateTime.of(2026, 10, 4, 12, 0));
        tx.setStatus(PaymentTransaction.Status.SUCCESS);
        return tx;
    }

    private static CryptoPaymentIntent intent(Long id, CryptoPaymentIntent.Status status, String txHash) {
        CryptoPaymentIntent intent = new CryptoPaymentIntent();
        intent.setId(id);
        intent.setStatus(status);
        intent.setMode(CryptoPaymentIntent.Mode.TRANSFER);
        intent.setTxHash(txHash);
        intent.setChainCode("BASE");
        intent.setTokenSymbol("USDC");
        intent.setAmountToken(new BigDecimal("10.000001"));
        intent.setMerchantAddress("0xmerchant");
        intent.setConfirmations(6);
        intent.setRequiredConfirmations(12);
        intent.setBlockNumber(88L);
        return intent;
    }
}
