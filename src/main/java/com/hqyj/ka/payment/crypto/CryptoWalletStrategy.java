package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.PayCreationResult;
import com.hqyj.ka.payment.PaymentStrategy;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 模式 B:钱包直付(Stripe 式体验)—— 前端连接钱包发起 ERC-20 transfer 签名,
 * 提交 txHash 后端链上回查;链扫描兜底(用户中途关页也不丢单)。
 * 升级点:USDC 支持 EIP-2612 permit,可演进为「签名即扣款」+ relayer 代付 gas。
 */
@Component
@RequiredArgsConstructor
public class CryptoWalletStrategy implements PaymentStrategy {

    public static final String CODE = "CRYPTO_WALLET";

    private final CryptoPaymentService cryptoPaymentService;

    @Override
    public String channelCode() { return CODE; }

    @Override
    public PayCreationResult create(Order order, java.util.Map<String, String> config, PayContext ctx) {
        CryptoPaymentIntent intent = cryptoPaymentService.createIntent(order,
                ctx.extra("chain"), ctx.extra("token"), CryptoPaymentIntent.Mode.WALLET);
        return PayCreationResult.crypto(cryptoPaymentService.intentView(intent.getOrderNo()));
    }
}
