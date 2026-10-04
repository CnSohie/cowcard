package com.hqyj.ka.observability;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;

/** 已支付仍未交付的数量。15 秒缓存,健康检查和 Prometheus 抓取共用,不每次各打一遍库。 */
@Slf4j
@Component
public class PaidDeliveryProbe {

    public record Counts(long autoCard, Long autoCardOldestSeconds, long manual, Long manualOldestSeconds,
                         long presale, Long presaleOldestSeconds, long recharge, Long rechargeOldestSeconds,
                         boolean readFailed) {
        static Counts emptyFailed() {
            return new Counts(0, null, 0, null, 0, null, 0, null, true);
        }

        Counts asFailed() {
            return new Counts(autoCard, autoCardOldestSeconds, manual, manualOldestSeconds, presale,
                    presaleOldestSeconds, recharge, rechargeOldestSeconds, true);
        }
    }

    private static final long CACHE_MS = 15_000;

    private final OrderRepository orders;
    private final MeterRegistry registry;
    private volatile Counts cached;
    private volatile long loadedAt;

    public PaidDeliveryProbe(OrderRepository orders, MeterRegistry registry) {
        this.orders = orders;
        this.registry = registry;
    }

    @PostConstruct
    void bindGauges() {
        gauge("AUTO_CARD", counts -> counts.autoCard, counts -> counts.autoCardOldestSeconds);
        gauge("MANUAL", counts -> counts.manual, counts -> counts.manualOldestSeconds);
        gauge("PRESALE_VOUCHER", counts -> counts.presale, counts -> counts.presaleOldestSeconds);
        gauge("RECHARGE", counts -> counts.recharge, counts -> counts.rechargeOldestSeconds);
        Gauge.builder("ka.orders.paid.read.failed", this, probe -> probe.current().readFailed() ? 1d : 0d)
                .description("1 when the paid-order probe could not read the database")
                .register(registry);
    }

    public Counts current() {
        Counts hit = fresh();
        if (hit != null) return hit;
        synchronized (this) {
            hit = fresh();
            if (hit != null) return hit;
            Counts loaded = loadQuietly();
            cached = loaded;
            loadedAt = System.currentTimeMillis();
            return loaded;
        }
    }

    private Counts fresh() {
        Counts snapshot = cached;
        if (snapshot != null && System.currentTimeMillis() - loadedAt < CACHE_MS) return snapshot;
        return null;
    }

    private Counts loadQuietly() {
        try {
            return load();
        } catch (RuntimeException e) {
            log.warn("paid-undelivered probe failed: {}", OpsRules.sanitize(e));
            return cached == null ? Counts.emptyFailed() : cached.asFailed();
        }
    }

    private Counts load() {
        LocalDateTime now = LocalDateTime.now();
        long auto = orders.countPaidGoods(Order.DeliveryMode.AUTO_CARD);
        long manual = orders.countPaidGoods(Order.DeliveryMode.MANUAL);
        long presale = orders.countPaidGoods(Order.DeliveryMode.PRESALE_VOUCHER);
        long recharge = orders.countPaidRecharge();
        return new Counts(auto, age(orders.oldestPaidGoods(Order.DeliveryMode.AUTO_CARD), now),
                manual, age(orders.oldestPaidGoods(Order.DeliveryMode.MANUAL), now),
                presale, age(orders.oldestPaidGoods(Order.DeliveryMode.PRESALE_VOUCHER), now),
                recharge, age(orders.oldestPaidRecharge(), now), false);
    }

    private static Long age(LocalDateTime paidAt, LocalDateTime now) {
        if (paidAt == null) return null;
        return Math.max(0L, Duration.between(paidAt, now).getSeconds());
    }

    private void gauge(String mode, java.util.function.ToLongFunction<Counts> count,
                       java.util.function.Function<Counts, Long> oldest) {
        Gauge.builder("ka.orders.paid.undelivered", this, probe -> (double) count.applyAsLong(probe.current()))
                .tag("mode", mode)
                .description("Orders still in PAID. MANUAL is a backlog; the other modes should leave PAID quickly")
                .register(registry);
        Gauge.builder("ka.orders.paid.undelivered.oldest.seconds", this, probe -> {
                    Long age = oldest.apply(probe.current());
                    return age == null ? 0d : age.doubleValue();
                })
                .tag("mode", mode)
                .description("Age in seconds of the oldest PAID order for this mode. 0 when there is none")
                .register(registry);
    }
}
