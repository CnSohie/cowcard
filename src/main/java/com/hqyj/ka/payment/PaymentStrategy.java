package com.hqyj.ka.payment;

import com.hqyj.ka.order.entity.Order;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;

/**
 * 支付策略 SPI。新渠道:实现本接口 + 注册为 Spring Bean + 后台配置渠道记录即接入。
 * config 为渠道解密后的配置项(密钥等仅在内存短暂存在)。
 */
public interface PaymentStrategy {

    String channelCode();

    /** 创建支付:返回前端渲染所需数据(二维码内容/跳转 URL/链上意向单)。 */
    PayCreationResult create(Order order, Map<String, String> config, PayContext ctx);

    /** 异步回调:验签 + 提取订单号金额。链上渠道无回调,默认不支持。 */
    default CallbackResult handleCallback(HttpServletRequest request, Map<String, String> config) {
        return CallbackResult.unsupported();
    }
}
