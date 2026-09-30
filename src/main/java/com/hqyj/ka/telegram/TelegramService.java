package com.hqyj.ka.telegram;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.dto.OrderDtos.CreateOrderRequest;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.crypto.CryptoPaymentService;
import com.hqyj.ka.payment.crypto.CryptoTransferStrategy;
import com.hqyj.ka.payment.service.PaymentService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/** Bot adapter. Core orders/payments remain the only source of truth; no network calls inside DB transactions. */
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ka.telegram.enabled", havingValue = "true")
public class TelegramService {
    private final JdbcTemplate jdbc;
    private final TelegramProperties properties;
    private final TelegramData data;
    private final OrderService orders;
    private final OrderRepository orderRepository;
    private final ProductRepository products;
    private final CryptoPaymentService crypto;
    private final PaymentService payments;
    private final ConfigService config;
    private final Validator validator;

    public record Draft(String nonce, Long productId, int quantity, String email, String coupon,
                        String chain, String token, String stage, BigDecimal price) {}
    public record Network(String chain, String token) {}
    public record WebOrder(String orderNo, String contact, String productName, String amount,
                           String createdAt, String queryToken) {}

    /** Commit receipt before HTTP 200. Replays never re-enqueue an already accepted update. */
    public void accept(TelegramUpdate update) {
        Long user = update.privateUserId();
        if (user == null) return;
        if (update.callback() != null && (update.callback().data() == null
                || update.callback().data().length() > 64 || update.callback().id() == null)) return;
        LocalDateTime now = LocalDateTime.now();
        Integer pending = jdbc.queryForObject("SELECT COUNT(*) FROM telegram_inbox WHERE bot_id=? AND done=FALSE", Integer.class, properties.botId());
        if (pending != null && pending >= 5000) {
            Integer existing = jdbc.queryForObject("SELECT COUNT(*) FROM telegram_inbox WHERE bot_id=? AND update_id=?", Integer.class, properties.botId(), update.updateId());
            if (existing != null && existing > 0) return;
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            jdbc.update("INSERT INTO telegram_inbox(bot_id,update_id,user_id,payload_enc,available_at,created_at) VALUES (?,?,?,?,?,?)",
                    properties.botId(), update.updateId(), user, data.encrypt(update), now, now);
        } catch (DuplicateKeyException ignored) { /* Telegram retry, including a completed update */ }
    }

    @Transactional
    public void process(long updateId) {
        long bot = properties.botId();
        var rows = jdbc.queryForList("SELECT * FROM telegram_inbox WHERE bot_id=? AND update_id=? FOR UPDATE", bot, updateId);
        if (rows.isEmpty() || Boolean.TRUE.equals(rows.get(0).get("done"))) return;
        TelegramUpdate update = data.decrypt((String) rows.get(0).get("payload_enc"), TelegramUpdate.class);
        long user = update.privateUserId();
        if (!allowActor(user)) { done(updateId); return; }

        if (update.callback() != null) {
            enqueue(user, "answerCallbackQuery", Map.of("callback_query_id", update.callback().id()));
            callback(user, update.callback().data());
        } else if (update.message().text() != null) {
            String text = update.message().text().trim();
            if (text.length() > 256) fail("输入过长，请按提示填写。");
            command(user, text);
        }
        done(updateId);
    }

    private boolean allowActor(long user) {
        long bot = properties.botId();
        jdbc.update("INSERT INTO telegram_account(bot_id,user_id,rate_window) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id=user_id",
                bot, user, LocalDateTime.now());
        var account = jdbc.queryForMap("SELECT * FROM telegram_account WHERE bot_id=? AND user_id=? FOR UPDATE", bot, user);
        if (!Boolean.TRUE.equals(account.get("enabled"))) return false;
        // Actor-level throttling, independent of Telegram's shared webhook source IP.
        LocalDateTime window = jdbc.queryForObject("SELECT rate_window FROM telegram_account WHERE bot_id=? AND user_id=?",
                LocalDateTime.class, bot, user);
        int count = ((Number) account.get("rate_count")).intValue();
        if (window.isBefore(LocalDateTime.now().minusMinutes(1))) {
            jdbc.update("UPDATE telegram_account SET rate_window=?,rate_count=1 WHERE bot_id=? AND user_id=?", LocalDateTime.now(), bot, user);
        } else if (count >= 30) return false;
        else jdbc.update("UPDATE telegram_account SET rate_count=rate_count+1 WHERE bot_id=? AND user_id=?", bot, user);
        return true;
    }

    /** Called after process rollback, so business rejection cannot leave half an order or a poisoned transaction. */
    @Transactional
    public void reject(long updateId, String message) {
        var rows = jdbc.queryForList("SELECT * FROM telegram_inbox WHERE bot_id=? AND update_id=? FOR UPDATE", properties.botId(), updateId);
        if (rows.isEmpty() || Boolean.TRUE.equals(rows.get(0).get("done"))) return;
        long user = ((Number) rows.get(0).get("user_id")).longValue();
        // process rolled back, including its quota update; count rejected operations here as well.
        if (!allowActor(user)) { done(updateId); return; }
        TelegramUpdate update = data.decrypt((String) rows.get(0).get("payload_enc"), TelegramUpdate.class);
        if (update.callback() != null)
            enqueue(user, "answerCallbackQuery", Map.of("callback_query_id", update.callback().id(), "text", "操作未完成，请查看提示"));
        send(user, message + "\n可发送 /products 重新选择商品，或 /orders 查看已有订单。", List.of());
        done(updateId);
    }

    private void done(long updateId) {
        jdbc.update("UPDATE telegram_inbox SET done=TRUE,payload_enc=NULL WHERE bot_id=? AND update_id=?", properties.botId(), updateId);
    }

    private void command(long user, String text) {
        String cmd = text.split("\\s+", 2)[0].split("@", 2)[0];
        switch (cmd) {
            case "/start", "/help" -> send(user,
                    "欢迎使用自助商城。选择商品后，按提示填写数量、邮箱和优惠码，再选择转账网络。\n"
                    + "确认订单后会显示收款地址与精确金额；到账后自动发卡，网页可查。\n\n"
                    + "/products 商品列表\n/orders 我的订单\n/cancel 取消当前填写（不取消已创建订单）",
                    List.of(List.of(button("浏览商品", "products:0"), button("我的订单", "orders:0"))));
            case "/products" -> catalog(user, 0);
            case "/orders" -> history(user, 0);
            case "/cancel" -> {
                jdbc.update("UPDATE telegram_account SET draft_enc=NULL,draft_expires_at=NULL WHERE bot_id=? AND user_id=?", properties.botId(), user);
                send(user, "已取消当前填写；已创建订单不受影响。", List.of(List.of(button("浏览商品", "products:0"))));
            }
            default -> input(user, text);
        }
    }

    private void callback(long user, String callback) {
        String[] p = callback.split(":");
        try {
            switch (p[0]) {
                case "products" -> catalog(user, Integer.parseInt(p[1]));
                case "orders" -> history(user, Integer.parseInt(p[1]));
                case "product" -> {
                    Product product = product(Long.parseLong(p[1]));
                    saveDraft(user, new Draft(TelegramData.token().substring(0, 16), product.getId(), 0, null, null, null, null, "QUANTITY", product.getPrice()));
                    send(user, product.getName() + "\n单价：" + product.getPrice().toPlainString() + " " + currency()
                            + "\n请输入购买数量（" + product.getMinBuy() + "～" + product.getMaxBuy() + "）"
                            + "\n最低订购金额：" + product.getMinOrderAmount().toPlainString() + " " + currency(), List.of());
                }
                case "network" -> {
                    Draft draft = draft(user);
                    if (!draft.nonce().equals(p[1]) || !"NETWORK".equals(draft.stage())) fail("按钮已过期，请完成当前步骤。");
                    Network network = new Network(p[2], p[3]);
                    if (!networks().contains(network)) fail("该网络配置已变化，请重新选择商品。");
                    Draft next = new Draft(draft.nonce(), draft.productId(), draft.quantity(), draft.email(), draft.coupon(), network.chain(), network.token(), "CONFIRM", draft.price());
                    saveDraft(user, next);
                    send(user, "请确认订单\n商品：" + product(next.productId()).getName() + " × " + next.quantity()
                            + "\n标价小计：" + next.price().multiply(BigDecimal.valueOf(next.quantity())).toPlainString() + " " + currency()
                            + "\n邮箱：" + next.email() + "\n优惠码：" + Objects.toString(next.coupon(), "无")
                            + "\n转账网络：" + next.chain() + " / " + next.token()
                            + "\n优惠与渠道手续费将在建单时核算，请以收款信息的精确代币金额为准。",
                            List.of(List.of(button("确认下单", "confirm:" + next.nonce()))));
                }
                case "confirm" -> confirm(user, p[1]);
                case "order" -> showOrder(user, p[1]);
                default -> fail("按钮无效，请重新打开菜单。");
            }
        } catch (NumberFormatException | IndexOutOfBoundsException e) {
            var invalid = new BusinessException(ErrorCode.BAD_REQUEST, "按钮无效或已过期，请重新选择。");
            invalid.initCause(e);
            throw invalid;
        }
    }

    private void input(long user, String text) {
        Draft d = draft(user);
        switch (d.stage()) {
            case "QUANTITY" -> {
                int qty;
                try { qty = Integer.parseInt(text); } catch (NumberFormatException e) { fail("请输入整数数量。"); return; }
                Product product = product(d.productId());
                if (qty < product.getMinBuy() || qty > Math.min(product.getMaxBuy(), 1000)) fail("数量超出商品限购范围。");
                saveDraft(user, new Draft(d.nonce(), d.productId(), qty, null, null, null, null, "EMAIL", d.price()));
                send(user, "请输入接收邮箱。订单将同步到网页；请妥善保存 Bot 提供的查单链接。", List.of());
            }
            case "EMAIL" -> {
                var req = new CreateOrderRequest(d.productId(), d.quantity(), text, null, null, false, null);
                if (!validator.validate(req).isEmpty()) fail("请输入有效邮箱（最多 128 字符）。");
                saveDraft(user, new Draft(d.nonce(), d.productId(), d.quantity(), text.toLowerCase(Locale.ROOT), null, null, null, "COUPON", d.price()));
                send(user, "请输入优惠码；没有优惠码请回复 -", List.of());
            }
            case "COUPON" -> {
                String coupon = "-".equals(text) ? null : text;
                if (coupon != null && (coupon.isBlank() || coupon.length() > 32)) fail("优惠码最多 32 字符。");
                var options = networks();
                if (options.isEmpty()) fail("当前没有可用转账网络，请稍后再试。");
                saveDraft(user, new Draft(d.nonce(), d.productId(), d.quantity(), d.email(), coupon, null, null, "NETWORK", d.price()));
                List<List<Map<String, Object>>> buttons = new ArrayList<>();
                for (Network option : options) buttons.add(List.of(button(option.chain() + " / " + option.token(),
                        "network:" + d.nonce() + ":" + option.chain() + ":" + option.token())));
                send(user, "请选择实际转账使用的网络。选错网络可能无法自动入账。", buttons);
            }
            default -> send(user, "请点击上一条消息中的按钮，或 /cancel 取消当前填写。", List.of());
        }
    }

    private void confirm(long user, String nonce) {
        Draft d = draft(user);
        if (!d.nonce().equals(nonce) || !"CONFIRM".equals(d.stage())) fail("该确认按钮已使用或已过期，请查看 /orders。");
        if (product(d.productId()).getPrice().compareTo(d.price()) != 0) fail("商品价格已变化，请重新选择商品确认。");
        Integer pending = jdbc.queryForObject("SELECT COUNT(*) FROM telegram_order t JOIN orders o ON o.id=t.order_id WHERE t.bot_id=? AND t.user_id=? AND o.status='PENDING'",
                Integer.class, properties.botId(), user);
        if (pending != null && pending >= 3) fail("您已有 3 笔待付款订单，请先付款或等待超时。");
        // Telegram's server IP is not the buyer IP. A separate actor quota above replaces the IP quota.
        // Random query password prevents guessed order number + email from exposing cards.
        var req = new CreateOrderRequest(d.productId(), d.quantity(), d.email(), TelegramData.token(), d.coupon(), false, null);
        if (!validator.validate(req).isEmpty()) fail("订单信息无效，请重新填写。");
        var created = orders.create(req, null, null);
        var payment = payments.create(created.order().getOrderNo(), CryptoTransferStrategy.CODE,
                new PayContext(null, null, Map.of("chain", d.chain(), "token", d.token())));
        if (!"CRYPTO".equals(payment.kind())) throw new IllegalStateException("Unexpected Telegram payment kind");
        jdbc.update("INSERT INTO telegram_order(order_id,bot_id,user_id,query_token_enc,payment_enc,created_at) VALUES (?,?,?,?,?,?)",
                created.order().getId(), properties.botId(), user, data.encrypt(created.queryToken()), data.encrypt(payment.data()), LocalDateTime.now());
        jdbc.update("UPDATE telegram_account SET draft_enc=NULL,draft_expires_at=NULL WHERE bot_id=? AND user_id=?", properties.botId(), user);
        showOrder(user, created.order().getOrderNo());
    }

    private Product product(long id) {
        return products.findByIdAndVisibleTrue(id).filter(p -> p.getDeliveryMode() == Product.DeliveryMode.AUTO_CARD)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF, "该商品暂不支持 Bot 自动下单，请重新选择。"));
    }

    private List<Network> networks() {
        List<Network> list = new ArrayList<>();
        for (var chain : crypto.options()) {
            for (Object raw : (List<?>) chain.get("tokens")) {
                Map<?, ?> token = (Map<?, ?>) raw;
                list.add(new Network((String) chain.get("chainCode"), (String) token.get("symbol")));
            }
        }
        return list;
    }

    private void catalog(long user, int page) {
        if (page < 0 || page > 10000) fail("页码无效。");
        // Existing public catalogue is cached/list based; keep each Telegram message bounded.
        var list = products.findByVisibleTrueOrderBySortOrderAscIdDesc().stream()
                .filter(p -> p.getDeliveryMode() == Product.DeliveryMode.AUTO_CARD).toList();
        List<List<Map<String, Object>>> buttons = new ArrayList<>();
        list.stream().skip((long) page * 6).limit(6).forEach(p -> buttons.add(List.of(button(
                trim(p.getName(), 35) + " · " + p.getPrice().toPlainString() + " " + currency(), "product:" + p.getId()))));
        List<Map<String, Object>> pages = new ArrayList<>();
        if (page > 0) pages.add(button("上一页", "products:" + (page - 1)));
        if ((long) (page + 1) * 6 < list.size()) pages.add(button("下一页", "products:" + (page + 1)));
        if (!pages.isEmpty()) buttons.add(pages);
        send(user, buttons.isEmpty() ? "暂无可用的自动发卡商品。" : "选择商品 · 第 " + (page + 1) + " 页", buttons);
    }

    private void history(long user, int page) {
        if (page < 0 || page > 10000) fail("页码无效。");
        var list = jdbc.queryForList("SELECT o.order_no,o.product_name,o.status FROM telegram_order t JOIN orders o ON o.id=t.order_id WHERE t.bot_id=? AND t.user_id=? ORDER BY t.order_id DESC LIMIT 7 OFFSET ?",
                properties.botId(), user, page * 6);
        List<List<Map<String, Object>>> buttons = new ArrayList<>();
        list.stream().limit(6).forEach(o -> buttons.add(List.of(button(trim((String) o.get("product_name"), 24) + " · " + status((String) o.get("status")), "order:" + o.get("order_no")))));
        List<Map<String, Object>> pages = new ArrayList<>();
        if (page > 0) pages.add(button("上一页", "orders:" + (page - 1)));
        if (list.size() > 6) pages.add(button("下一页", "orders:" + (page + 1)));
        if (!pages.isEmpty()) buttons.add(pages);
        send(user, list.isEmpty() ? "暂无 Bot 订单。" : "我的 Bot 订单 · 点击查看详情", buttons);
    }

    private void showOrder(long user, String orderNo) {
        var rows = jdbc.queryForList("SELECT t.* FROM telegram_order t JOIN orders o ON o.id=t.order_id WHERE t.bot_id=? AND t.user_id=? AND o.order_no=?",
                properties.botId(), user, orderNo);
        if (rows.isEmpty()) fail("订单不存在。");
        var link = rows.get(0);
        Order order = orderRepository.findById(((Number) link.get("order_id")).longValue()).orElseThrow();
        String text = "订单：" + order.getOrderNo() + "\n商品：" + order.getProductName() + " × " + order.getQuantity()
                + "\n状态：" + status(order.getStatus().name()) + "\n订单金额：" + order.getAmount().toPlainString() + " " + currency();
        if (order.getStatus() == Order.Status.PENDING && order.getExpireAt().isAfter(LocalDateTime.now())) {
            Map<?, ?> snapshot = data.decrypt((String) link.get("payment_enc"), Map.class);
            Map<?, ?> pay = crypto.intentView(orderNo,
                    com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent.Mode.TRANSFER,
                    snapshot.get("chainCode").toString(), snapshot.get("tokenSymbol").toString());
            LocalDateTime intentExpiry = LocalDateTime.parse(pay.get("expireAt").toString());
            if ("CONFIRMING".equals(pay.get("status")) || "CONFIRMED".equals(pay.get("status"))) {
                text += "\n已检测到付款，正在确认/入账，请勿重复转账。";
            } else if ("WAITING".equals(pay.get("status")) && intentExpiry.isAfter(LocalDateTime.now())) {
                text += "\n\n网络：" + pay.get("chainCode") + "\n币种：" + pay.get("tokenSymbol")
                        + "\n代币合约：" + pay.get("tokenContract") + "\n收款地址：\n" + pay.get("address")
                        + "\n\n必须到账的精确金额：\n" + pay.get("amount") + " " + pay.get("tokenSymbol")
                        + "\n截止：" + (intentExpiry.isBefore(order.getExpireAt()) ? intentExpiry : order.getExpireAt())
                        + "（服务器时间）\n请保留全部小数，手续费另付，不要重复转账；达到链上确认数后自动交付。";
            } else text += "\n支付意向已过期，请勿向旧金额继续转账。";
        } else if (order.getStatus() == Order.Status.PENDING || order.getStatus() == Order.Status.EXPIRED)
            text += "\n订单已超时，请勿继续转账。已付款未入账请联系网站客服。";
        send(user, text, List.of(List.of(button("刷新状态", "order:" + orderNo)),
                List.of(Map.of("text", "网页查询 / 查看卡密", "url", ticket(order.getId())))));
    }

    private Draft draft(long user) {
        var rows = jdbc.queryForList("SELECT draft_enc FROM telegram_account WHERE bot_id=? AND user_id=? AND draft_expires_at>?",
                properties.botId(), user, LocalDateTime.now());
        if (rows.isEmpty() || rows.get(0).get("draft_enc") == null) fail("当前没有待填写订单，或填写已过期。请发送 /products。");
        return data.decrypt((String) rows.get(0).get("draft_enc"), Draft.class);
    }

    private void saveDraft(long user, Draft draft) {
        jdbc.update("UPDATE telegram_account SET draft_enc=?,draft_expires_at=? WHERE bot_id=? AND user_id=?",
                data.encrypt(draft), LocalDateTime.now().plusMinutes(15), properties.botId(), user);
    }

    private String ticket(long orderId) {
        String token = TelegramData.token();
        jdbc.update("INSERT INTO telegram_ticket(token_hash,order_id,expires_at) VALUES (?,?,?)",
                TelegramData.hash(token), orderId, LocalDateTime.now().plusMinutes(5));
        // Fragment is not sent to web servers/referrers. The landing page clears it immediately.
        return properties.getSiteUrl() + "/tg/order#" + token;
    }

    @Transactional
    public WebOrder exchange(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) fail("查单链接无效，请在 Bot 中重新查看订单。");
        String hash = TelegramData.hash(token);
        if (jdbc.update("UPDATE telegram_ticket SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
                LocalDateTime.now(), hash, LocalDateTime.now()) != 1) fail("链接已使用或过期，请在 Bot 中重新查看订单获取新链接。");
        var link = jdbc.queryForMap("SELECT t.* FROM telegram_order t JOIN telegram_ticket k ON k.order_id=t.order_id JOIN telegram_account a ON a.bot_id=t.bot_id AND a.user_id=t.user_id WHERE k.token_hash=? AND t.bot_id=? AND a.enabled=TRUE",
                hash, properties.botId());
        Order o = orderRepository.findById(((Number) link.get("order_id")).longValue()).orElseThrow();
        return new WebOrder(o.getOrderNo(), o.getContact(), o.getProductName(), o.getAmount().toPlainString(),
                o.getCreatedAt().toString(), data.decrypt((String) link.get("query_token_enc"), String.class));
    }

    /** Durable reconciliation also catches manual delivery and late payment; never claims PAID means delivered. */
    @Transactional
    public void notifyStatus(long orderId) {
        var links = jdbc.queryForList("SELECT * FROM telegram_order WHERE bot_id=? AND order_id=? FOR UPDATE", properties.botId(), orderId);
        if (links.isEmpty()) return;
        var link = links.get(0);
        Order order = orderRepository.findById(orderId).orElseThrow();
        String current = order.getStatus().name();
        if (current.equals(link.get("notified_status"))) return;
        long user = ((Number) link.get("user_id")).longValue();
        send(user, "订单状态更新\n订单：" + order.getOrderNo() + "\n商品：" + order.getProductName()
                        + "\n" + status(current) + (order.getStatus() == Order.Status.DELIVERED ? "\n点击查看订单，再打开网页领取卡密。" : ""),
                List.of(List.of(button("查看订单", "order:" + order.getOrderNo()))));
        jdbc.update("UPDATE telegram_order SET notified_status=? WHERE order_id=?", current, orderId);
    }

    private void send(long user, String text, List<List<Map<String, Object>>> buttons) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("chat_id", user);
        body.put("text", trim(text, 4000));
        body.put("protect_content", true);
        body.put("link_preview_options", Map.of("is_disabled", true));
        if (!buttons.isEmpty()) body.put("reply_markup", Map.of("inline_keyboard", buttons));
        enqueue(user, "sendMessage", body);
    }

    private void enqueue(long user, String method, Map<String, Object> body) {
        jdbc.update("INSERT INTO telegram_outbox(bot_id,user_id,method,payload_enc,available_at,created_at) VALUES (?,?,?,?,?,?)",
                properties.botId(), user, method, data.encrypt(body), LocalDateTime.now(), LocalDateTime.now());
    }

    private static Map<String, Object> button(String label, String callback) { return Map.of("text", label, "callback_data", callback); }
    private String currency() { return config.all().getOrDefault("site.currency", "CNY"); }
    private static String trim(String text, int length) { return text.length() <= length ? text : text.substring(0, length - 1) + "…"; }
    private static void fail(String message) { throw new BusinessException(ErrorCode.BAD_REQUEST, message); }
    static String status(String value) {
        return switch (value) {
            case "PENDING" -> "待付款";
            case "PAID" -> "已到账，待交付";
            case "DELIVERED" -> "已交付";
            case "EXPIRED" -> "已超时";
            case "CLOSED" -> "已关闭";
            case "REFUNDED" -> "已退款";
            default -> value;
        };
    }
}
