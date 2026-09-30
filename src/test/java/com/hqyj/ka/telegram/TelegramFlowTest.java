package com.hqyj.ka.telegram;

import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.crypto.ChainScanJob;
import com.hqyj.ka.payment.crypto.CryptoPaymentService;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.service.PaymentService;
import com.hqyj.ka.payment.PayCreationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Real Flyway schema + JPA/JDBC shared transactions. Network and payment allocation are controlled fixtures. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:telegram-flow;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;NON_KEYWORDS=VALUE",
        // H2 maps MySQL LONGTEXT to VARCHAR while Hibernate's H2 dialect expects CLOB.
        // Run the real migration, but leave full type validation to MySqlDatabaseIT.
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=none", "spring.jpa.open-in-view=false",
        "ka.telegram.enabled=true", "ka.telegram.bot-token=123456:abcdefghijklmnopqrstuvwxyz0123456789",
        "ka.telegram.webhook-secret=01234567890123456789012345678901", "ka.telegram.site-url=https://store.example",
        "ka.crypto.fx-auto-refresh=false"
})
class TelegramFlowTest {
    @Autowired TelegramService service;
    @Autowired TelegramData data;
    @Autowired TelegramProperties properties;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProductRepository products;
    @Autowired OrderRepository orders;
    @Autowired OrderService orderService;
    @Autowired JsonMapper mapper;
    @MockitoBean TelegramWorker worker;
    @MockitoBean TelegramApiClient api;
    @MockitoBean ChainScanJob scan;
    @MockitoBean CryptoPaymentService crypto;
    @MockitoBean PaymentService payment;
    private static final AtomicLong IDS = new AtomicLong(1000);
    private long user;
    private Product product;
    private Map<String, Object> pay;

    @BeforeEach void setup() {
        jdbc.update("UPDATE telegram_outbox SET done=TRUE");
        user = IDS.incrementAndGet();
        product = new Product(); product.setCategoryId(1L); product.setName("测试商品");
        product.setPrice(new BigDecimal("7.20")); product.setStockCached(20);
        product = products.saveAndFlush(product);
        pay = Map.of("status", "WAITING", "chainCode", "BSC", "tokenSymbol", "USDT",
                "tokenContract", "0x55d398326f99059ff775485246999027b3197955",
                "address", "0x1111111111111111111111111111111111111111",
                "amount", "1.001234", "amountMinor", "1001234000000000000", "decimals", 18,
                "expireAt", LocalDateTime.now().plusMinutes(15).toString());
        when(crypto.options()).thenReturn(List.of(Map.of("chainCode", "BSC", "tokens", List.of(Map.of("symbol", "USDT")))));
        when(crypto.intentView(anyString(), eq(CryptoPaymentIntent.Mode.TRANSFER), anyString(), anyString())).thenReturn(pay);
        when(payment.create(anyString(), eq("CRYPTO_TRANSFER"), any())).thenReturn(PayCreationResult.crypto(pay));
    }

    private TelegramUpdate update(String text, String callback) {
        var from = new TelegramUpdate.User(user, false);
        var message = new TelegramUpdate.Message(from, new TelegramUpdate.Chat(user, "private"), text);
        long id = IDS.incrementAndGet();
        return new TelegramUpdate(id, callback == null ? message : null,
                callback == null ? null : new TelegramUpdate.Callback("cb" + id, from, message, callback));
    }
    private void run(String text, String callback) {
        var u = update(text, callback); service.accept(u); service.process(u.updateId());
    }
    private TelegramService.Draft draft() {
        return data.decrypt(jdbc.queryForObject("SELECT draft_enc FROM telegram_account WHERE bot_id=123456 AND user_id=?", String.class, user), TelegramService.Draft.class);
    }
    private String prepare() {
        run(null, "product:" + product.getId());
        run("1", null); run("buyer" + user + "@example.com", null); run("-", null);
        String nonce = draft().nonce(); run(null, "network:" + nonce + ":BSC:USDT");
        return nonce;
    }
    private Order order() {
        return orders.findById(jdbc.queryForObject("SELECT order_id FROM telegram_order WHERE user_id=?", Long.class, user)).orElseThrow();
    }

    @Test void createsOneRealOrderAndPreservesExactBscAmount() {
        String nonce = prepare();
        var confirm = update(null, "confirm:" + nonce);
        service.accept(confirm); service.accept(confirm); service.process(confirm.updateId()); service.process(confirm.updateId());
        Order o = order();
        assertThat(o.getBuyerIp()).isNull();
        assertThat(o.getMemberId()).isNull();
        assertThat(o.getAmount()).isEqualByComparingTo("7.20");
        assertThat(products.findById(product.getId()).orElseThrow().getStockCached()).isEqualTo(19);
        verify(payment, times(1)).create(eq(o.getOrderNo()), eq("CRYPTO_TRANSFER"), any());
        assertThatThrownBy(() -> run(null, "confirm:" + nonce)).isInstanceOf(BusinessException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_order WHERE user_id=?", Integer.class, user)).isEqualTo(1);
        String payload = jdbc.queryForObject("SELECT payload_enc FROM telegram_outbox WHERE user_id=? AND method='sendMessage' ORDER BY id DESC LIMIT 1", String.class, user);
        assertThat(payload).doesNotContain("buyer", "1.001234");
        assertThat(data.decrypt(payload, Map.class).get("text").toString()).contains("1.001234", "BSC", "USDT");
        assertThatThrownBy(() -> orderService.query(o.getOrderNo(), o.getContact(), null, null)).isInstanceOf(BusinessException.class);
    }

    @Test void paymentFailureRollsBackOrderAndStockAndDraftCanRetry() {
        String nonce = prepare();
        when(payment.create(anyString(), anyString(), any())).thenThrow(new BusinessException(ErrorCode.CHANNEL_DISABLED));
        var confirm = update(null, "confirm:" + nonce); service.accept(confirm);
        assertThatThrownBy(() -> service.process(confirm.updateId())).isInstanceOf(BusinessException.class);
        assertThat(products.findById(product.getId()).orElseThrow().getStockCached()).isEqualTo(20);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_order WHERE user_id=?", Integer.class, user)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders WHERE contact=?", Integer.class, "buyer" + user + "@example.com")).isZero();
        assertThat(draft().stage()).isEqualTo("CONFIRM");
        service.reject(confirm.updateId(), "渠道暂不可用");
        assertThat(jdbc.queryForObject("SELECT done FROM telegram_inbox WHERE update_id=?", Boolean.class, confirm.updateId())).isTrue();
    }

    @Test void ticketIsSingleUseAndBotOrderOwnershipIsChecked() {
        run(null, "confirm:" + prepare());
        Order o = order();
        String payload = jdbc.queryForObject("SELECT payload_enc FROM telegram_outbox WHERE user_id=? AND method='sendMessage' ORDER BY id DESC LIMIT 1", String.class, user);
        var message = mapper.valueToTree(data.decrypt(payload, Map.class));
        String url = message.path("reply_markup").path("inline_keyboard").path(1).path(0).path("url").asText();
        String ticket = url.substring(url.indexOf('#') + 1);
        assertThat(url).startsWith("https://store.example/tg/order#");
        var exchanged = service.exchange(ticket);
        assertThat(exchanged.orderNo()).isEqualTo(o.getOrderNo());
        assertThat(orderService.query(o.getOrderNo(), null, null, exchanged.queryToken()).orderNo()).isEqualTo(o.getOrderNo());
        assertThatThrownBy(() -> service.exchange(ticket)).isInstanceOf(BusinessException.class);
        user = IDS.incrementAndGet();
        assertThatThrownBy(() -> run(null, "order:" + o.getOrderNo())).isInstanceOf(BusinessException.class);
    }

    @Test void twoDistinctConfirmUpdatesCannotCreateTwoOrders() throws Exception {
        String nonce = prepare();
        var first = update(null, "confirm:" + nonce); var second = update(null, "confirm:" + nonce);
        service.accept(first); service.accept(second);
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try {
            var tasks = List.of(first, second).stream().map(u -> pool.submit(() -> {
                ready.countDown(); start.await(5, TimeUnit.SECONDS);
                try { service.process(u.updateId()); return true; } catch (BusinessException e) { return false; }
            })).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(List.of(tasks.get(0).get(15, TimeUnit.SECONDS), tasks.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_order WHERE user_id=?", Integer.class, user)).isEqualTo(1);
        } finally { start.countDown(); pool.shutdownNow(); }
    }

    @Test void statusNotificationIsDurableAndDoesNotExposeCards() {
        run(null, "confirm:" + prepare());
        Order o = order();
        int before = jdbc.queryForObject("SELECT COUNT(*) FROM telegram_outbox WHERE user_id=?", Integer.class, user);
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", o.getId());
        service.notifyStatus(o.getId()); service.notifyStatus(o.getId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_outbox WHERE user_id=?", Integer.class, user)).isEqualTo(before + 1);
        String payload = jdbc.queryForObject("SELECT payload_enc FROM telegram_outbox WHERE user_id=? ORDER BY id DESC LIMIT 1", String.class, user);
        assertThat(data.decrypt(payload, Map.class).get("text").toString()).contains("已到账，待交付").doesNotContain("已交付");
        jdbc.update("UPDATE orders SET status='DELIVERED' WHERE id=?", o.getId());
        service.notifyStatus(o.getId());
        assertThat(jdbc.queryForObject("SELECT notified_status FROM telegram_order WHERE order_id=?", String.class, o.getId())).isEqualTo("DELIVERED");
    }

    @Test void ignoresGroupsAndExpiredTickets() {
        var group = new TelegramUpdate(IDS.incrementAndGet(), new TelegramUpdate.Message(new TelegramUpdate.User(user, false),
                new TelegramUpdate.Chat(-100L, "group"), "/start"), null);
        service.accept(group);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_inbox WHERE update_id=?", Integer.class, group.updateId())).isZero();
        run(null, "confirm:" + prepare());
        String token = TelegramData.token();
        jdbc.update("INSERT INTO telegram_ticket(token_hash,order_id,expires_at) VALUES (?,?,?)", TelegramData.hash(token), order().getId(), LocalDateTime.now().minusMinutes(1));
        assertThatThrownBy(() -> service.exchange(token)).isInstanceOf(BusinessException.class);
    }

    @Test void outgoingRateLimitRetriesWithoutReprocessingOrder() {
        run("/start", null);
        var sender = new TelegramWorker(jdbc, service, properties, data, api);
        when(api.send(eq("sendMessage"), any())).thenReturn(new TelegramApiClient.Result(false, true, 120));
        sender.send(); sender.send();
        verify(api, times(1)).send(eq("sendMessage"), any());
        assertThat(jdbc.queryForObject("SELECT attempts FROM telegram_outbox WHERE user_id=?", Integer.class, user)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT available_at FROM telegram_outbox WHERE user_id=?", LocalDateTime.class, user))
                .isAfter(LocalDateTime.now().plusSeconds(100));
        jdbc.update("UPDATE telegram_outbox SET available_at=? WHERE user_id=?", LocalDateTime.now().minusSeconds(1), user);
        when(api.send(eq("sendMessage"), any())).thenReturn(new TelegramApiClient.Result(true, false, 0));
        sender.send();
        assertThat(jdbc.queryForObject("SELECT done FROM telegram_outbox WHERE user_id=?", Boolean.class, user)).isTrue();
        assertThat(jdbc.queryForObject("SELECT payload_enc FROM telegram_outbox WHERE user_id=?", String.class, user)).isNull();
    }

    @Test void oneTimeTicketCannotBeExchangedConcurrently() throws Exception {
        run(null, "confirm:" + prepare());
        String ticket = TelegramData.token();
        jdbc.update("INSERT INTO telegram_ticket(token_hash,order_id,expires_at) VALUES (?,?,?)",
                TelegramData.hash(ticket), order().getId(), LocalDateTime.now().plusMinutes(1));
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> exchange = () -> {
                try { service.exchange(ticket); return true; } catch (BusinessException e) { return false; }
            };
            var first = pool.submit(exchange); var second = pool.submit(exchange);
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        } finally { pool.shutdownNow(); }
    }

    @Test void businessRejectionsAlsoConsumeActorQuota() {
        var invalid = update(null, "order:NOT_OWNED");
        service.accept(invalid);
        assertThatThrownBy(() -> service.process(invalid.updateId())).isInstanceOf(BusinessException.class);
        service.reject(invalid.updateId(), "订单不存在");
        assertThat(jdbc.queryForObject("SELECT rate_count FROM telegram_account WHERE user_id=?", Integer.class, user)).isEqualTo(1);
        service.reject(invalid.updateId(), "重复拒绝");
        assertThat(jdbc.queryForObject("SELECT rate_count FROM telegram_account WHERE user_id=?", Integer.class, user)).isEqualTo(1);
        jdbc.update("UPDATE telegram_account SET rate_count=30 WHERE user_id=?", user);
        run("/start", null);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM telegram_outbox WHERE user_id=? AND method='sendMessage'", Integer.class, user)).isEqualTo(1);
    }
}
