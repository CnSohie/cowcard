package com.hqyj.ka.payment;

import java.util.Map;

/** 创建支付的上下文:客户端 IP、渠道扩展参数(如加密支付的 chain/token 选择)。 */
public record PayContext(String clientIp, Long memberId, Map<String, String> extras) {
    public String extra(String key) { return extras == null ? null : extras.get(key); }
}
