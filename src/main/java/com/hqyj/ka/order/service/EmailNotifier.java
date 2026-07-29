package com.hqyj.ka.order.service;

import com.hqyj.ka.card.service.CardService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.event.OrderPaidEvent;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/** 订单邮件通知:SMTP 参数和模板均来自 sys_config,支付交付后异步发送。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailNotifier {

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ConfigService configService;
    private final OrderRepository orderRepository;
    private final CardService cardService;

    @Async("taskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onPaid(OrderPaidEvent event) {
        Map<String, String> cfg = configService.all();
        if (!enabled(cfg)) return;
        Order order = orderRepository.findById(event.orderId()).orElse(null);
        if (order == null || order.getStatus() != Order.Status.DELIVERED) return;
        try {
            if (order.getOrderType() == Order.OrderType.RECHARGE) {
                sendRecharge(order, cfg);
            } else if (order.getDeliveryMode() == Order.DeliveryMode.PRESALE_VOUCHER) {
                sendPresale(order, cfg);
            } else {
                sendGoods(order, cfg);
            }
        } catch (Exception e) {
            log.warn("order mail notify failed, orderId={}: {}", event.orderId(), e.getMessage());
        }
    }

    public void sendTest(String to) {
        Map<String, String> cfg = configService.all();
        if (!enabled(cfg)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请先开启邮件通知并填写 SMTP 配置");
        }
        Map<String, String> vars = baseVars(cfg);
        vars.put("contact", to);
        vars.put("orderNo", "TEST-" + System.currentTimeMillis());
        vars.put("productName", "测试邮件");
        vars.put("amount", "0.00");
        vars.put("quantity", "1");
        vars.put("paidChannel", "TEST");
        vars.put("paidAt", TIME_FMT.format(java.time.LocalDateTime.now()));
        vars.put("deliveredAt", vars.get("paidAt"));
        vars.put("cards", "这是一封测试邮件,说明 SMTP 配置已连通。");
        send(cfg, to, apply(template(cfg, "mail.template.order_paid_subject", defaultGoodsSubject()), vars),
                apply(template(cfg, "mail.template.order_paid_body", defaultGoodsBody()), vars));
    }

    private void sendGoods(Order order, Map<String, String> cfg) {
        List<String> cards = cardService.decryptForOrder(order.getId());
        Map<String, String> vars = orderVars(order, cfg);
        vars.put("cards", cards.isEmpty() ? "暂无卡密,请联系售后处理。" : String.join("\n", cards));
        send(cfg, order.getContact(),
                apply(template(cfg, "mail.template.order_paid_subject", defaultGoodsSubject()), vars),
                apply(template(cfg, "mail.template.order_paid_body", defaultGoodsBody()), vars));
    }

    private void sendRecharge(Order order, Map<String, String> cfg) {
        Map<String, String> vars = orderVars(order, cfg);
        vars.put("balanceAmount", order.getAmount().toPlainString());
        send(cfg, order.getContact(),
                apply(template(cfg, "mail.template.recharge_subject", defaultRechargeSubject()), vars),
                apply(template(cfg, "mail.template.recharge_body", defaultRechargeBody()), vars));
    }

    private void sendPresale(Order order, Map<String, String> cfg) {
        Map<String, String> vars = orderVars(order, cfg);
        send(cfg, order.getContact(),
                apply(template(cfg, "mail.template.presale_subject", defaultPresaleSubject()), vars),
                apply(template(cfg, "mail.template.presale_body", defaultPresaleBody()), vars));
    }

    private Map<String, String> orderVars(Order order, Map<String, String> cfg) {
        Map<String, String> vars = baseVars(cfg);
        vars.put("orderNo", order.getOrderNo());
        vars.put("productName", order.getProductName());
        vars.put("amount", order.getAmount().toPlainString());
        vars.put("quantity", String.valueOf(order.getQuantity()));
        vars.put("contact", order.getContact());
        vars.put("paidChannel", order.getPaidChannel() == null ? "" : order.getPaidChannel());
        vars.put("paidAt", order.getPaidAt() == null ? "" : TIME_FMT.format(order.getPaidAt()));
        vars.put("deliveredAt", order.getDeliveredAt() == null ? "" : TIME_FMT.format(order.getDeliveredAt()));
        return vars;
    }

    private Map<String, String> baseVars(Map<String, String> cfg) {
        String siteName = cfg.getOrDefault("site.name", "Ka 发卡");
        String siteUrl = cfg.getOrDefault("site.url", "").trim();
        String orderPath = siteUrl.isBlank() ? "/order" : siteUrl.replaceAll("/+$", "") + "/order";
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("siteName", siteName);
        vars.put("siteUrl", siteUrl);
        vars.put("queryUrl", orderPath);
        vars.put("supportContact", cfg.getOrDefault("site.contact", ""));
        String currency = cfg.getOrDefault("site.currency", "CNY").trim().toUpperCase();
        vars.put("currencyCode", currency);
        vars.put("currencySymbol", symbol(currency));
        return vars;
    }

    private String symbol(String currency) {
        return switch (currency) {
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

    private void send(Map<String, String> cfg, String to, String subject, String text) {
        try {
            JavaMailSenderImpl sender = sender(cfg);
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(cfg.getOrDefault("mail.from", cfg.getOrDefault("mail.username", "")),
                    cfg.getOrDefault("mail.from_name", cfg.getOrDefault("site.name", "Ka 发卡")));
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(text, false);
            sender.send(message);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "邮件发送失败:" + e.getMessage());
        }
    }

    private JavaMailSenderImpl sender(Map<String, String> cfg) {
        String host = cfg.getOrDefault("mail.host", "").trim();
        if (host.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "请填写 SMTP Host");
        JavaMailSenderImpl s = new JavaMailSenderImpl();
        s.setHost(host);
        s.setPort(parseInt(cfg.get("mail.port"), 587));
        s.setUsername(cfg.getOrDefault("mail.username", "").trim());
        s.setPassword(cfg.getOrDefault("mail.password", ""));
        s.setDefaultEncoding("UTF-8");
        Properties p = s.getJavaMailProperties();
        p.put("mail.smtp.auth", String.valueOf(!s.getUsername().isBlank()));
        p.put("mail.smtp.starttls.enable", String.valueOf(bool(cfg.get("mail.starttls"), true)));
        p.put("mail.smtp.ssl.enable", String.valueOf(bool(cfg.get("mail.ssl"), false)));
        p.put("mail.smtp.connectiontimeout", "8000");
        p.put("mail.smtp.timeout", "10000");
        p.put("mail.smtp.writetimeout", "10000");
        return s;
    }

    private boolean enabled(Map<String, String> cfg) {
        return bool(cfg.get("mail.enabled"), false);
    }

    private boolean bool(String v, boolean def) {
        if (v == null || v.isBlank()) return def;
        return "1".equals(v.trim()) || "true".equalsIgnoreCase(v.trim()) || "yes".equalsIgnoreCase(v.trim());
    }

    private int parseInt(String v, int def) {
        try {
            return v == null || v.isBlank() ? def : Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private String template(Map<String, String> cfg, String key, String def) {
        String v = cfg.get(key);
        return v == null || v.isBlank() ? def : v;
    }

    private String apply(String template, Map<String, String> vars) {
        String out = template;
        for (Map.Entry<String, String> e : vars.entrySet()) {
            out = out.replace("{{" + e.getKey() + "}}", e.getValue() == null ? "" : e.getValue());
        }
        return out;
    }

    private String defaultGoodsSubject() {
        return "【{{siteName}}】订单 {{orderNo}} 已发货";
    }

    private String defaultGoodsBody() {
        return """
                你好,你的订单已完成发货。

                订单号: {{orderNo}}
                商品: {{productName}}
                数量: {{quantity}}
                实付金额: {{currencySymbol}}{{amount}} {{currencyCode}}
                支付渠道: {{paidChannel}}
                发货时间: {{deliveredAt}}

                卡密内容:
                {{cards}}

                你也可以前往 {{queryUrl}} 使用订单号和邮箱查询。
                如需售后,请联系: {{supportContact}}

                {{siteName}}
                """;
    }

    private String defaultRechargeSubject() {
        return "【{{siteName}}】充值订单 {{orderNo}} 已入账";
    }

    private String defaultPresaleSubject() {
        return "【{{siteName}}】预售订单 {{orderNo}} 已确认";
    }

    private String defaultPresaleBody() {
        return """
                你好,你的预售订单付款已确认。

                订单号: {{orderNo}}
                商品: {{productName}}
                数量: {{quantity}}
                实付金额: {{currencySymbol}}{{amount}} {{currencyCode}}
                支付渠道: {{paidChannel}}
                确认时间: {{deliveredAt}}

                电子预售提货码不会通过邮件发送。请使用下单浏览器前往 {{queryUrl}} 查询订单,领取并妥善保存一次性明文提货码。
                平台仅保存不可逆哈希,提货码丢失后无法找回。核销需登录会员账号,核销后可在会员中心跟进履约状态。

                如需售后,请联系: {{supportContact}}

                {{siteName}}
                """;
    }

    private String defaultRechargeBody() {
        return """
                你好,你的余额充值已入账。

                订单号: {{orderNo}}
                入账金额: {{currencySymbol}}{{balanceAmount}} {{currencyCode}}
                支付渠道: {{paidChannel}}
                入账时间: {{deliveredAt}}

                你可以登录会员中心查看余额和流水。
                如需帮助,请联系: {{supportContact}}

                {{siteName}}
                """;
    }
}
