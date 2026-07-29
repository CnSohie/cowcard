package com.hqyj.ka.payment;

import java.util.Map;

/**
 * kind:
 *  QRCODE   → data.qrContent 前端生成二维码(支付宝当面付)
 *  REDIRECT → data.url 前端跳转(易支付收银台)
 *  CRYPTO   → data 含 address/amount/chain/token/expireAt(加密支付面板)
 */
public record PayCreationResult(String kind, Map<String, Object> data) {
    public static PayCreationResult qrcode(String qrContent) {
        return new PayCreationResult("QRCODE", Map.of("qrContent", qrContent));
    }
    public static PayCreationResult redirect(String url) {
        return new PayCreationResult("REDIRECT", Map.of("url", url));
    }
    public static PayCreationResult crypto(Map<String, Object> data) {
        return new PayCreationResult("CRYPTO", data);
    }
}
