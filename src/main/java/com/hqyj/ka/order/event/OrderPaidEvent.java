package com.hqyj.ka.order.event;

/** 支付成功领域事件:发卡、通知、风控等各自订阅,支付与履约解耦(升级到 MQ 时监听器平移)。 */
public record OrderPaidEvent(Long orderId) {
}
