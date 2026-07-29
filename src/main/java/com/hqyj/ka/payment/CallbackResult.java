package com.hqyj.ka.payment;

import java.math.BigDecimal;

/** 回调处理结果:验签通过才可能 ok=true;ack 为应答给支付网关的报文体。 */
public record CallbackResult(boolean ok, String orderNo, String channelTradeNo, BigDecimal amount, String ack) {
    public static CallbackResult success(String orderNo, String channelTradeNo, BigDecimal amount, String ack) {
        return new CallbackResult(true, orderNo, channelTradeNo, amount, ack);
    }
    public static CallbackResult fail(String ack) {
        return new CallbackResult(false, null, null, null, ack);
    }
    public static CallbackResult unsupported() {
        return new CallbackResult(false, null, null, null, "unsupported");
    }
}
