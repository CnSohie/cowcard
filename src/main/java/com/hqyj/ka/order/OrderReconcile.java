package com.hqyj.ka.order;

import com.hqyj.ka.order.dto.OrderDtos.PaymentReconcile;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.entity.PaymentTransaction;

/**
 * 从成功支付流水和链上意向里抽出对账凭证。
 * 已由支付宝等法币渠道入账时，不把另一笔未使用的链上意向当成这笔订单的 TxID。
 */
public final class OrderReconcile {
    private OrderReconcile() {}

    public static PaymentTransaction preferTransaction(PaymentTransaction current, PaymentTransaction candidate,
                                                       String paidChannel) {
        if (candidate == null) return current;
        if (current == null) return candidate;
        boolean currentMatch = paidChannel != null && paidChannel.equals(current.getChannelCode());
        boolean nextMatch = paidChannel != null && paidChannel.equals(candidate.getChannelCode());
        if (currentMatch != nextMatch) return nextMatch ? candidate : current;
        return idOf(candidate) >= idOf(current) ? candidate : current;
    }

    public static CryptoPaymentIntent preferIntent(CryptoPaymentIntent current, CryptoPaymentIntent candidate) {
        if (candidate == null || candidate.getTxHash() == null || candidate.getTxHash().isBlank()) return current;
        if (current == null) return candidate;
        int rank = Integer.compare(rank(candidate), rank(current));
        if (rank != 0) return rank > 0 ? candidate : current;
        return idOf(candidate) >= idOf(current) ? candidate : current;
    }

    public static PaymentReconcile build(String paidChannel, PaymentTransaction success, CryptoPaymentIntent intent) {
        String channelCode = success != null ? success.getChannelCode() : paidChannel;
        boolean crypto = isCrypto(channelCode) || (success == null && isCrypto(intentChannel(intent)));
        CryptoPaymentIntent chain = crypto ? intent : null;
        String tradeNo = firstText(success == null ? null : success.getChannelTradeNo(),
                chain == null ? null : chain.getTxHash());
        if (tradeNo == null) return null;
        if (channelCode == null && chain != null) channelCode = intentChannel(chain);
        return new PaymentReconcile(
                channelCode,
                tradeNo,
                success == null ? null : success.getAmount(),
                success == null ? null : success.getFeeAmount(),
                success == null ? null : success.getPaidAt(),
                chain == null ? null : chain.getChainCode(),
                chain == null ? null : chain.getTokenSymbol(),
                chain == null || chain.getAmountToken() == null ? null : chain.getAmountToken().toPlainString(),
                chain == null ? null : chain.getMerchantAddress(),
                chain == null ? null : chain.getConfirmations(),
                chain == null ? null : chain.getRequiredConfirmations(),
                chain == null ? null : chain.getBlockNumber());
    }

    private static boolean isCrypto(String channelCode) {
        return channelCode != null && channelCode.startsWith("CRYPTO_");
    }

    private static String intentChannel(CryptoPaymentIntent intent) {
        if (intent == null) return null;
        return intent.getMode() == CryptoPaymentIntent.Mode.WALLET ? "CRYPTO_WALLET" : "CRYPTO_TRANSFER";
    }

    private static String firstText(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) return primary;
        if (fallback != null && !fallback.isBlank()) return fallback;
        return null;
    }

    private static int rank(CryptoPaymentIntent intent) {
        return switch (intent.getStatus()) {
            case CONFIRMED -> 3;
            case CONFIRMING -> 2;
            case WAITING -> 1;
            case EXPIRED -> 0;
        };
    }

    private static long idOf(PaymentTransaction tx) {
        return tx.getId() == null ? -1 : tx.getId();
    }

    private static long idOf(CryptoPaymentIntent intent) {
        return intent.getId() == null ? -1 : intent.getId();
    }
}
