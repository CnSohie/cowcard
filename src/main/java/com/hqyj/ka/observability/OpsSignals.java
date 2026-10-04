package com.hqyj.ka.observability;

import com.hqyj.ka.config.AppProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 扫链与通知的进程内状态。区块落后只在扫描当时记下,Prometheus 抓取不再打 RPC。
 * 指标标签只有链名和 email/telegram,不放异常文本。
 */
@Component
public class OpsSignals {

    private final MeterRegistry registry;
    private final AppProperties props;
    private final long startedAt;
    private final ConcurrentMap<String, ChainState> chains = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, NotifyState> notifications = new ConcurrentHashMap<>();

    @Autowired
    public OpsSignals(MeterRegistry registry, AppProperties props) {
        this(registry, props, System.currentTimeMillis());
    }

    OpsSignals(MeterRegistry registry, AppProperties props, long startedAt) {
        this.registry = registry;
        this.props = props;
        this.startedAt = startedAt;
        bindNotify("email");
        bindNotify("telegram");
    }

    @PostConstruct
    void bindConfiguredChains() {
        for (AppProperties.Chain chain : props.getCrypto().getChains()) {
            if (chain.isEnabled() && chain.getCode() != null && !chain.getCode().isBlank()) {
                bindChain(chain.getCode());
            }
        }
    }

    public void scanOk(String chain, long blockLag) {
        scanOkAt(chain, blockLag, System.currentTimeMillis());
    }

    public void scanFailed(String chain, Throwable error) {
        scanFailedAt(chain, error, System.currentTimeMillis());
    }

    public void notifyFailed(String channel) {
        notifyFailedAt(channel, System.currentTimeMillis());
    }

    void scanOkAt(String chain, long blockLag, long epochMs) {
        ChainState state = bindChain(chain);
        state.lastSuccessMs.set(epochMs);
        state.blockLag.set(Math.max(0L, blockLag));
        state.lastError.set(null);
    }

    void scanFailedAt(String chain, Throwable error, long epochMs) {
        ChainState state = bindChain(chain);
        state.failures.incrementAndGet();
        state.lastError.set(OpsRules.sanitize(error));
        state.lastFailureMs.set(epochMs);
        registry.counter("ka.chain.scan.failures", "chain", state.tag).increment();
    }

    void notifyFailedAt(String channel, long epochMs) {
        NotifyState state = notifications.get(channel);
        if (state == null) return;
        state.total.incrementAndGet();
        state.lastFailureMs.set(epochMs);
        state.mark(epochMs);
        registry.counter("ka.notify.failures", "channel", channel).increment();
    }

    public long stallAfterMs() {
        return OpsRules.stallAfterMs(props.getCrypto().getScanIntervalMs());
    }

    public List<OpsSnapshot.ChainRow> chainRows(long nowMs) {
        long stallAfterMs = stallAfterMs();
        List<OpsSnapshot.ChainRow> rows = new ArrayList<>();
        for (AppProperties.Chain chain : props.getCrypto().getChains()) {
            if (!chain.isEnabled() || chain.getCode() == null || chain.getCode().isBlank()) continue;
            String tag = OpsRules.metricTag(chain.getCode());
            ChainState state = chains.get(tag);
            long successAt = state == null ? 0 : state.lastSuccessMs.get();
            boolean scanned = successAt > 0;
            long base = scanned ? successAt : startedAt;
            long ageSeconds = Math.max(0L, (nowMs - base) / 1000L);
            Long blockLag = state == null || state.blockLag.get() < 0 ? null : state.blockLag.get();
            String lastError = state == null ? null : state.lastError.get();
            long failures = state == null ? 0 : state.failures.get();
            rows.add(new OpsSnapshot.ChainRow(tag, OpsRules.chainLevel(ageSeconds, stallAfterMs), ageSeconds,
                    blockLag, lastError, failures, scanned));
        }
        return rows;
    }

    public List<OpsSnapshot.NotifyRow> notifyRows(long nowMs) {
        List<OpsSnapshot.NotifyRow> rows = new ArrayList<>();
        for (String channel : List.of("email", "telegram")) {
            NotifyState state = notifications.get(channel);
            if (state == null) continue;
            long recent = state.recent(nowMs);
            long last = state.lastFailureMs.get();
            Long age = last <= 0 ? null : Math.max(0L, (nowMs - last) / 1000L);
            rows.add(new OpsSnapshot.NotifyRow(channel, OpsRules.notifyLevel(recent), state.total.get(), recent, age));
        }
        return rows;
    }

    private ChainState bindChain(String chain) {
        String tag = OpsRules.metricTag(chain);
        return chains.computeIfAbsent(tag, key -> {
            ChainState state = new ChainState(key);
            Gauge.builder("ka.chain.scan.age.seconds", state, st -> ageSeconds(st, System.currentTimeMillis()))
                    .tag("chain", key)
                    .description("Seconds since the last successful chain scan, or since process start")
                    .register(registry);
            Gauge.builder("ka.chain.scan.block.lag", state, st -> {
                        long lag = st.blockLag.get();
                        return lag < 0 ? -1d : lag;
                    })
                    .tag("chain", key)
                    .description("Blocks between the chain head and the cursor at the last successful scan. -1 before the first success")
                    .register(registry);
            Counter.builder("ka.chain.scan.failures")
                    .tag("chain", key)
                    .description("Chain scan rounds that threw")
                    .register(registry);
            return state;
        });
    }

    private void bindNotify(String channel) {
        NotifyState state = new NotifyState();
        notifications.put(channel, state);
        Counter.builder("ka.notify.failures")
                .tag("channel", channel)
                .description("Email or Telegram notification failures")
                .register(registry);
        Gauge.builder("ka.notify.failures.recent", state, st -> (double) st.recent(System.currentTimeMillis()))
                .tag("channel", channel)
                .description("Notification failures in the last 15 minutes")
                .register(registry);
    }

    private double ageSeconds(ChainState state, long nowMs) {
        long base = state.lastSuccessMs.get();
        if (base <= 0) base = startedAt;
        return Math.max(0d, (nowMs - base) / 1000d);
    }

    static final class ChainState {
        final String tag;
        final AtomicLong lastSuccessMs = new AtomicLong();
        final AtomicLong lastFailureMs = new AtomicLong();
        final AtomicLong failures = new AtomicLong();
        final AtomicLong blockLag = new AtomicLong(-1);
        final AtomicReference<String> lastError = new AtomicReference<>();

        ChainState(String tag) {
            this.tag = tag;
        }
    }

    static final class NotifyState {
        final AtomicLong total = new AtomicLong();
        final AtomicLong lastFailureMs = new AtomicLong();
        private final ArrayDeque<Long> recent = new ArrayDeque<>();

        synchronized void mark(long epochMs) {
            recent.addLast(epochMs);
            prune(epochMs);
            while (recent.size() > 500) recent.removeFirst();
        }

        synchronized int recent(long nowMs) {
            prune(nowMs);
            return recent.size();
        }

        private void prune(long nowMs) {
            long cutoff = nowMs - OpsRules.NOTIFY_WINDOW_MS;
            while (!recent.isEmpty() && recent.peekFirst() <= cutoff) recent.removeFirst();
        }
    }
}
