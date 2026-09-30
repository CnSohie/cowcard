package com.hqyj.ka.integration;

import com.hqyj.ka.card.entity.CardSecret;
import com.hqyj.ka.card.repo.CardSecretRepository;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.wallet.entity.WalletAccount;
import com.hqyj.ka.wallet.repo.WalletAccountRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.mysql.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;

/** No outer test transaction: each worker owns a real, independently committed transaction. */
@Testcontainers
@Timeout(60)
@SpringBootTest(properties = {
        "spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver",
        "spring.datasource.hikari.maximum-pool-size=4",
        "spring.flyway.enabled=true", "spring.flyway.locations=classpath:db/migration",
        "spring.flyway.baseline-on-migrate=false", "spring.flyway.clean-disabled=true",
        "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.open-in-view=false",
        "ka.crypto.merchant-address=", "ka.crypto.fx-auto-refresh=false"
})
class MySqlDatabaseIT {
    @Container
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.0.36")
            .withDatabaseName("ka_integration").withUsername("ka_test").withPassword("test_only")
            .withCommand("--character-set-server=utf8mb4", "--collation-server=utf8mb4_0900_ai_ci");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", MYSQL::getJdbcUrl);
        r.add("spring.datasource.username", MYSQL::getUsername);
        r.add("spring.datasource.password", MYSQL::getPassword);
    }

    @Autowired PlatformTransactionManager manager;
    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired Flyway flyway;
    @Autowired CardSecretRepository cards;
    @Autowired WalletAccountRepository wallets;
    @Autowired com.hqyj.ka.wallet.service.WalletService walletService;
    @Autowired OrderRepository orders;
    @Autowired CryptoPaymentIntentRepository intents;
    @Autowired PaymentTransactionRepository payments;

    private <T> T tx(Supplier<T> work) {
        var t = new TransactionTemplate(manager);
        t.setTimeout(20);
        return t.execute(status -> work.get());
    }
    private static String key() { return UUID.randomUUID().toString().replace("-", ""); }
    private long wallet(String balance) {
        var w = new WalletAccount();
        w.setMemberId(ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE));
        w.setBalance(new BigDecimal(balance));
        return tx(() -> wallets.saveAndFlush(w).getMemberId());
    }
    private List<Integer> race(Supplier<Integer> action) throws Exception {
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> worker = () -> { try { return tx(() -> {
                ready.countDown();
                await(start);
                return action.get();
            }); } catch (com.hqyj.ka.common.BusinessException e) { return 0; } };
            var a = pool.submit(worker);
            var b = pool.submit(worker);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(a.get(25, TimeUnit.SECONDS), b.get(25, TimeUnit.SECONDS));
        } finally { start.countDown(); pool.shutdownNow(); }
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(15, TimeUnit.SECONDS)) throw new AssertionError("worker synchronization timed out"); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
    }

    @Test void migrationsValidateAndRestartDoesNotReplay() {
        assertThat(jdbc.queryForObject("select version()", String.class)).startsWith("8.0.");
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        // Context startup above validates all entity mappings against Flyway-created MySQL tables.
    }

    @Test void skipLockedAllocatesDifferentCardsAndRollbackReleasesLock() throws Exception {
        long product = ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE);
        tx(() -> {
            for (int i = 0; i < 2; i++) {
                var c = new CardSecret(); c.setProductId(product); c.setContentEnc("fixture"); c.setFingerprint(key());
                cards.saveAndFlush(c);
            }
            return null;
        });
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var firstId = new CompletableFuture<Long>();
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> new TransactionTemplate(manager).execute(status -> {
                var selected = cards.lockAvailable(product, 1);
                assertThat(selected).hasSize(1);
                firstId.complete(selected.get(0).getId()); locked.countDown(); await(release);
                status.setRollbackOnly();
                return null;
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            var second = pool.submit(() -> tx(() -> {
                var selected = cards.lockAvailable(product, 1);
                assertThat(selected).hasSize(1);
                var card = selected.get(0);
                assertThat(card.getId()).isNotEqualTo(firstId.join());
                card.setStatus(CardSecret.Status.SOLD); cards.saveAndFlush(card);
                return card.getId();
            }));
            // Must finish while the first row remains locked; a blocking FOR UPDATE fails here.
            assertThat(second.get(5, TimeUnit.SECONDS)).isNotNull();
            release.countDown(); first.get(5, TimeUnit.SECONDS);
            assertThat(tx(() -> cards.lockAvailable(product, 2)).stream().map(CardSecret::getId))
                    .containsExactly(firstId.join());
        } finally { release.countDown(); pool.shutdownNow(); }
    }

    @Test void concurrentWalletDebitCannotDoubleSpend() throws Exception {
        long member = wallet("10.00");
        assertThat(race(() -> { walletService.debit(member, new BigDecimal("7.00"), com.hqyj.ka.wallet.entity.WalletTxn.Type.PURCHASE,"ORDER",1L,"test"); return 1; })).containsExactlyInAnyOrder(1, 0);
        assertThat(wallets.findByMemberId(member).orElseThrow().getBalance()).isEqualByComparingTo("3.00");
    }

    @Test void rollbackRestoresWalletBalance() {
        long member = wallet("10.00");
        assertThatThrownBy(() -> tx(() -> {
            walletService.adminFreeze(member, new BigDecimal("7.00"), "test", "test");
            throw new IllegalStateException("simulate failure before ledger commit");
        })).isInstanceOf(IllegalStateException.class);
        var w = wallets.findByMemberId(member).orElseThrow();
        assertThat(w.getBalance()).isEqualByComparingTo("10.00");
        assertThat(w.getFrozen()).isEqualByComparingTo("0.00");
    }

    @Test void concurrentPaymentCasHasOneWinner() throws Exception {
        String no = key();
        jdbc.update("insert into orders(order_no,product_id,product_name,unit_price,quantity,amount,contact,expire_at) " +
                "values (?,0,'fixture',1.00,1,1.00,'test@example.invalid',?)", no, LocalDateTime.now().plusDays(1));
        long id = orders.findByOrderNo(no).orElseThrow().getId();
        assertThat(race(() -> orders.markPaidCas(id, LocalDateTime.now(), "EPAY", Order.Status.PAID, Order.Status.PENDING)))
                .containsExactlyInAnyOrder(1, 0);
        assertThat(orders.findById(id).orElseThrow().getStatus()).isEqualTo(Order.Status.PAID);
    }

    private CryptoPaymentIntent intent(String unique, String hash) {
        var i = new CryptoPaymentIntent();
        i.setOrderId(1L); i.setOrderNo(key()); i.setChainCode("BSC"); i.setChainId(56);
        i.setTokenSymbol("USDT"); i.setTokenContract("0x55d398326f99059ff775485246999027b3197955");
        i.setDecimals(18); i.setAmountToken(new BigDecimal("99999999999999.123456"));
        i.setAmountMinor("99999999999999123456000000000000");
        i.setMerchantAddress("0x0000000000000000000000000000000000000001");
        i.setUniqueKey(unique); i.setTxHash(hash); i.setRequiredConfirmations(5);
        i.setExpireAt(LocalDateTime.now().plusDays(1)); return i;
    }
    @Test void cryptoUniqueConstraintsAllowNullAndRejectReplay() {
        String unique = key(), hash = key();
        tx(() -> intents.saveAndFlush(intent(unique, hash)));
        assertThatThrownBy(() -> tx(() -> intents.saveAndFlush(intent(key(), hash))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> tx(() -> intents.saveAndFlush(intent(unique, key()))))
                .isInstanceOf(DataIntegrityViolationException.class);
        tx(() -> intents.saveAndFlush(intent(null, null)));
        tx(() -> intents.saveAndFlush(intent(null, null)));
    }

    private PaymentTransaction payment(String trade) {
        var p = new PaymentTransaction(); p.setOrderId(1L); p.setOrderNo(key()); p.setChannelCode("EPAY");
        p.setAmount(new BigDecimal("999999999999999999.99")); p.setChannelTradeNo(trade); return p;
    }
    @Test void channelTradeNumberPreventsReplayAndDecimalMappingIsExact() {
        String trade = key();
        long id = tx(() -> payments.saveAndFlush(payment(trade)).getId());
        assertThat(payments.findById(id).orElseThrow().getAmount()).isEqualTo(new BigDecimal("999999999999999999.99"));
        assertThatThrownBy(() -> tx(() -> payments.saveAndFlush(payment(trade))))
                .isInstanceOf(DataIntegrityViolationException.class);
        var i = intent(key(), null);
        long intentId = tx(() -> intents.saveAndFlush(i).getId());
        var loaded = intents.findById(intentId).orElseThrow();
        assertThat(loaded.getAmountToken()).isEqualTo(i.getAmountToken());
        assertThat(loaded.getAmountMinor()).isEqualTo(i.getAmountMinor());
        assertThat(loaded.getDecimals()).isEqualTo(18);
    }

    @Test void repeatableReadDoesNotSeeConcurrentCommittedBalanceUntilNextTransaction() throws Exception {
        long member = wallet("10.00");
        try (Connection c = dataSource.getConnection()) {
            assertThat(c.getTransactionIsolation()).isEqualTo(Connection.TRANSACTION_REPEATABLE_READ);
            c.setAutoCommit(false);
            try {
                assertThat(balance(c, member)).isEqualByComparingTo("10.00");
                walletService.credit(member, new BigDecimal("2.00"), com.hqyj.ka.wallet.entity.WalletTxn.Type.RECHARGE,"ORDER",1L,"test");
                assertThat(balance(c, member)).isEqualByComparingTo("10.00");
                c.commit();
                assertThat(balance(c, member)).isEqualByComparingTo("12.00");
            } finally { c.rollback(); }
        }
    }
    private BigDecimal balance(Connection c, long member) throws Exception {
        try (var s = c.prepareStatement("select balance from wallet_account where member_id=?")) {
            s.setLong(1, member);
            try (var r = s.executeQuery()) { assertThat(r.next()).isTrue(); return r.getBigDecimal(1); }
        }
    }
}
