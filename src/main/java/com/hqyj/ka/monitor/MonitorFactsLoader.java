package com.hqyj.ka.monitor;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.observability.DbPoolProbe;
import com.hqyj.ka.observability.OpsRules;
import com.hqyj.ka.observability.PaidDeliveryProbe;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.ChainCursorRepository;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 只读内存和数据库。不打 RPC,也不探测支付渠道通断。 */
@Slf4j
@Component
public class MonitorFactsLoader {

    private final AppProperties props;
    private final ChainCursorRepository cursors;
    private final JobTracker jobs;
    private final PaidDeliveryProbe paid;
    private final OrderRepository orders;
    private final PaymentTransactionRepository transactions;
    private final CryptoPaymentIntentRepository intents;
    private final ConfigService configService;
    private final DbPoolProbe pool;
    private final ThreadPoolTaskExecutor executor;
    private final ResourceSampler sampler;
    private final SecuritySignals security;
    private final RateLimitFilter rateLimitFilter;
    private final MonitorAlertRepository alerts;

    public MonitorFactsLoader(AppProperties props, ChainCursorRepository cursors, JobTracker jobs,
                              PaidDeliveryProbe paid, OrderRepository orders,
                              PaymentTransactionRepository transactions, CryptoPaymentIntentRepository intents,
                              ConfigService configService, DbPoolProbe pool,
                              @Qualifier("taskExecutor") ThreadPoolTaskExecutor executor,
                              ResourceSampler sampler, SecuritySignals security, RateLimitFilter rateLimitFilter,
                              MonitorAlertRepository alerts) {
        this.props = props;
        this.cursors = cursors;
        this.jobs = jobs;
        this.paid = paid;
        this.orders = orders;
        this.transactions = transactions;
        this.intents = intents;
        this.configService = configService;
        this.pool = pool;
        this.executor = executor;
        this.sampler = sampler;
        this.security = security;
        this.rateLimitFilter = rateLimitFilter;
        this.alerts = alerts;
    }

    /** 仅调度器调用。页面刷新不能往采样队列里塞点。 */
    public void sampleResources() {
        Reading reading = readResources();
        sampler.record(reading.heapKnown(), reading.heapHigh(), reading.diskKnown(), reading.diskTight(),
                reading.asyncKnown() ? reading.asyncQueued() : -1);
    }

    public MonitorFacts load() {
        long now = System.currentTimeMillis();
        Flags flags = flags();
        PaidDeliveryProbe.Counts paidCounts = paid.current();
        Late late = late();
        Confirming confirming = confirming(now);
        Expired expired = expired();
        Counts counts = counts();
        Reading reading = readResources();
        return new MonitorFacts(now, Math.max(0L, now - jobs.startedAtMs()),
                props.getCrypto().getScanIntervalMs(), props.getCrypto().getFxRefreshMs(),
                props.getCrypto().isFxAutoRefresh(), flags.mail(), flags.telegram(),
                chains(),
                new MonitorFacts.PaidFact(paidCounts.autoCard(), paidCounts.autoCardOldestSeconds(),
                        paidCounts.manual(), paidCounts.manualOldestSeconds(),
                        paidCounts.presale(), paidCounts.presaleOldestSeconds(),
                        paidCounts.recharge(), paidCounts.rechargeOldestSeconds(), paidCounts.readFailed()),
                late.count(), late.failed(), confirming.count(), confirming.oldestSeconds(), confirming.failed(),
                expired.count(), expired.failed(),
                jobs.get(JobTracker.EXPIRE), jobs.get(JobTracker.FX),
                jobs.get(JobTracker.EMAIL), jobs.get(JobTracker.TELEGRAM),
                reading.toFact(sampler), security.snapshot(now), activeBans(),
                counts.open(), counts.unacked());
    }

    private List<MonitorFacts.ChainFact> chains() {
        List<MonitorFacts.ChainFact> rows = new ArrayList<>();
        for (String code : MonitorOverviewBuilder.CHAINS) {
            AppProperties.Chain configured = chain(code);
            boolean enabled = configured != null && configured.isEnabled();
            if (!enabled) {
                rows.add(new MonitorFacts.ChainFact(code, false, false, null, null, null, 0, null));
                continue;
            }
            ChainCursor cursor = null;
            try {
                cursor = cursors.findById(code).orElse(null);
            } catch (RuntimeException e) {
                log.warn("chain cursor read skipped chain={} err={}", code, OpsRules.sanitize(e));
            }
            JobTracker.Beat beat = jobs.get(JobTracker.chain(code));
            int failures = Math.max(cursor == null ? 0 : cursor.getConsecutiveFailures(), beat.consecutiveFailures());
            Long successMs = cursor != null && cursor.getLastSuccessAt() != null
                    ? cursor.getLastSuccessAt().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() : null;
            if (successMs == null && beat.everSucceeded()) successMs = beat.lastSuccessMs();
            String error = cursor != null && cursor.getLastError() != null ? cursor.getLastError() : beat.lastError();
            rows.add(new MonitorFacts.ChainFact(code, true, cursor != null,
                    cursor == null ? null : cursor.getScannedBlock(),
                    cursor == null ? null : cursor.getLastBlockLag(),
                    successMs, failures, error));
        }
        return rows;
    }

    private AppProperties.Chain chain(String code) {
        for (AppProperties.Chain chain : props.getCrypto().getChains()) {
            if (chain.getCode() != null && code.equalsIgnoreCase(chain.getCode().trim())) return chain;
        }
        return null;
    }

    private Flags flags() {
        try {
            Map<String, String> cfg = configService.all();
            boolean mail = truthy(cfg.get("mail.enabled"));
            String token = cfg.getOrDefault("tg.bot_token", "").trim();
            String chat = cfg.getOrDefault("tg.chat_id", "").trim();
            return new Flags(mail, !token.isEmpty() && !chat.isEmpty());
        } catch (RuntimeException e) {
            log.warn("monitor config read skipped: {}", OpsRules.sanitize(e));
            return new Flags(true, true);
        }
    }

    private Late late() {
        try {
            long count = transactions.countSuccessfulTxWithOrderStatusIn(PaymentTransaction.Status.SUCCESS,
                    List.of(Order.Status.EXPIRED, Order.Status.CLOSED));
            return new Late(count, false);
        } catch (RuntimeException e) {
            log.warn("late payment count skipped: {}", OpsRules.sanitize(e));
            return new Late(0, true);
        }
    }

    private Confirming confirming(long nowMs) {
        try {
            long count = intents.countByStatus(CryptoPaymentIntent.Status.CONFIRMING);
            LocalDateTime oldest = intents.oldestConfirmingDetectedAt();
            Long seconds = oldest == null ? null : Math.max(0L, Duration.between(oldest, LocalDateTime.now()).getSeconds());
            return new Confirming(count, seconds, false);
        } catch (RuntimeException e) {
            log.warn("confirming intent count skipped: {}", OpsRules.sanitize(e));
            return new Confirming(0, null, true);
        }
    }

    private Expired expired() {
        try {
            return new Expired(orders.countByStatusAndExpireAtBefore(Order.Status.PENDING, LocalDateTime.now()), false);
        } catch (RuntimeException e) {
            log.warn("expired order count skipped: {}", OpsRules.sanitize(e));
            return new Expired(0, true);
        }
    }

    private Counts counts() {
        try {
            int open = (int) alerts.countByStatus(MonitorAlert.Status.OPEN);
            int unacked = (int) alerts.countByStatusAndAckedAtIsNull(MonitorAlert.Status.OPEN);
            return new Counts(open, unacked);
        } catch (RuntimeException e) {
            log.warn("monitor alert count skipped: {}", OpsRules.sanitize(e));
            return new Counts(0, 0);
        }
    }

    private int activeBans() {
        try {
            return rateLimitFilter.activeBanCount();
        } catch (RuntimeException e) {
            return 0;
        }
    }

    private Reading readResources() {
        boolean heapKnown = false;
        int heapPercent = 0;
        boolean heapHigh = false;
        try {
            MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
            long max = heap.getMax();
            long used = heap.getUsed();
            if (max > 0) {
                heapKnown = true;
                heapPercent = (int) Math.min(100L, used * 100L / max);
                heapHigh = used >= (long) (max * MonitorRules.HEAP_RATIO);
            }
        } catch (RuntimeException ignored) {
            heapKnown = false;
        }
        DbPoolProbe.Counts poolCounts = pool.read();
        boolean asyncKnown = false;
        int queued = 0;
        int active = 0;
        int capacity = 0;
        try {
            var poolExecutor = executor.getThreadPoolExecutor();
            queued = poolExecutor.getQueue().size();
            active = poolExecutor.getActiveCount();
            capacity = Math.max(executor.getQueueCapacity(), 1);
            asyncKnown = true;
        } catch (RuntimeException ignored) {
            asyncKnown = false;
        }
        boolean diskKnown = false;
        long free = 0;
        int freePercent = 0;
        boolean tight = false;
        try {
            Path configured = Path.of(props.getUpload().getDir()).toAbsolutePath();
            Path probe = Files.exists(configured) ? configured
                    : (configured.getParent() != null && Files.exists(configured.getParent())
                    ? configured.getParent() : Path.of("").toAbsolutePath());
            var store = Files.getFileStore(probe);
            long total = store.getTotalSpace();
            free = store.getUsableSpace();
            if (total > 0) {
                diskKnown = true;
                freePercent = (int) Math.min(100L, free * 100L / total);
                tight = free < MonitorRules.DISK_FREE_FLOOR || (double) free / (double) total < MonitorRules.DISK_FREE_RATIO;
            }
        } catch (Exception ignored) {
            diskKnown = false;
        }
        return new Reading(heapKnown, heapPercent, heapHigh,
                poolCounts.active() == null ? 0 : poolCounts.active(),
                poolCounts.max() == null ? 0 : poolCounts.max(),
                poolCounts.pending() == null ? 0 : poolCounts.pending(),
                poolCounts.readable(),
                asyncKnown, queued, active, capacity,
                diskKnown, free, freePercent, tight);
    }

    private static boolean truthy(String value) {
        if (value == null || value.isBlank()) return false;
        return "1".equals(value.trim()) || "true".equalsIgnoreCase(value.trim()) || "yes".equalsIgnoreCase(value.trim());
    }

    private record Flags(boolean mail, boolean telegram) {}
    private record Late(long count, boolean failed) {}
    private record Confirming(long count, Long oldestSeconds, boolean failed) {}
    private record Expired(long count, boolean failed) {}
    private record Counts(int open, int unacked) {}

    private record Reading(boolean heapKnown, int heapPercent, boolean heapHigh,
                           int poolActive, int poolMax, int poolPending, boolean poolReadable,
                           boolean asyncKnown, int asyncQueued, int asyncActive, int asyncCapacity,
                           boolean diskKnown, long diskFreeBytes, int diskFreePercent, boolean diskTight) {
        MonitorFacts.ResourceFact toFact(ResourceSampler sampler) {
            return new MonitorFacts.ResourceFact(heapKnown, heapPercent, heapHigh,
                    poolActive, poolMax, poolPending, poolReadable,
                    asyncKnown, asyncQueued, asyncActive, asyncCapacity,
                    diskKnown, diskFreeBytes, diskFreePercent, diskTight,
                    sampler.heapHighStreak(), sampler.diskTightStreak(),
                    sampler.queueSustained(MonitorRules.QUEUE_HIGH, MonitorRules.QUEUE_GROWTH_FLOOR));
        }
    }
}
