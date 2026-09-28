package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.PayCreationResult;
import com.hqyj.ka.payment.PaymentStrategy;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * 模式 A:转账直付(任意钱包/交易所提现按精确金额转账,链扫描按金额指纹入账)。
 * extras:chain=BASE|POLYGON|BSC, token=USDC|USDT
 */
@Component
@RequiredArgsConstructor
public class CryptoTransferStrategy implements PaymentStrategy {

    public static final String CODE = "CRYPTO_TRANSFER";

    private final CryptoPaymentService cryptoPaymentService;

    @Override
    public String channelCode() { return CODE; }

    @Override
    public PayCreationResult create(Order order, java.util.Map<String, String> config, PayContext ctx) {
        BigDecimal sitePayAmount = new BigDecimal(config.getOrDefault("_sitePayAmount", order.getAmount().toPlainString()));
        CryptoPaymentIntent intent = cryptoPaymentService.createIntent(order, sitePayAmount,
                ctx.extra("chain"), ctx.extra("token"), CryptoPaymentIntent.Mode.TRANSFER);
        return PayCreationResult.crypto(cryptoPaymentService.intentView(intent));
    }
}
