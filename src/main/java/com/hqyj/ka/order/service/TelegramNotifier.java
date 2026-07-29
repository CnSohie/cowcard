package com.hqyj.ka.order.service;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.event.OrderPaidEvent;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Telegram 成交通知:站点配置里填 tg.bot_token 与 tg.chat_id 即生效,留空关闭。
 * AFTER_COMMIT + @Async:不阻塞入账事务,发送失败只记日志。
 * 扩展点:同样方式可加邮件/webhook 通知器,各自订阅 OrderPaidEvent 即可。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramNotifier {

    private final ConfigService configService;
    private final OrderRepository orderRepository;
    private final RestClient restClient = RestClient.create();

    @Async("taskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaid(OrderPaidEvent event) {
        Order order = orderRepository.findById(event.orderId()).orElse(null);
        if (order == null) return;
        Map<String, String> cfg = configService.all();
        String symbol = symbol(cfg.getOrDefault("site.currency", "CNY"));
        String text = "💰 新订单成交\n"
                + "商品:" + order.getProductName() + " ×" + order.getQuantity() + "\n"
                + "金额:" + symbol + order.getAmount().toPlainString()
                + (order.getDiscountAmount().signum() > 0 ? "(已优惠 " + symbol + order.getDiscountAmount().toPlainString() + ")" : "") + "\n"
                + "渠道:" + order.getPaidChannel() + "\n"
                + "状态:" + order.getStatus().name() + "\n"
                + "单号:" + order.getOrderNo();
        send(text);
    }

    /** 管理侧安全告警(异步):支付渠道配置变更等高危事件即时推送,便于第一时间发现被篡改。 */
    @Async("taskExecutor")
    public void notifyAdmin(String text) {
        send(text);
    }

    private void send(String text) {
        Map<String, String> cfg = configService.all();
        String token = cfg.getOrDefault("tg.bot_token", "").trim();
        String chatId = cfg.getOrDefault("tg.chat_id", "").trim();
        if (token.isEmpty() || chatId.isEmpty()) return;
        try {
            restClient.post()
                    .uri("https://api.telegram.org/bot" + token + "/sendMessage")
                    .header("Content-Type", "application/json")
                    .body(Map.of("chat_id", chatId, "text", text))
                    .retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.warn("telegram notify failed: {}", e.getMessage());
        }
    }

    private String symbol(String currency) {
        return switch ((currency == null ? "CNY" : currency.trim().toUpperCase())) {
            case "USD" -> "$";
            case "EUR" -> "€";
            case "GBP" -> "£";
            case "JPY" -> "¥";
            case "CHF" -> "CHF ";
            case "HKD" -> "HK$";
            case "TWD" -> "NT$";
            case "SGD" -> "S$";
            default -> "¥";
        };
    }
}
