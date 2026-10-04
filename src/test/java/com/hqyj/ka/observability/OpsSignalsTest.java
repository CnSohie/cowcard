package com.hqyj.ka.observability;

import com.hqyj.ka.config.AppProperties;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpsSignalsTest {

    @Test
    void enabledChainGoesDownUntilAScanSucceedsAndKeepsTheLastBlockLag() {
        long started = 1_000_000L;
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        OpsSignals signals = signals(registry, started);
        signals.bindConfiguredChains();

        OpsSnapshot.ChainRow cold = signals.chainRows(started + 119_000).get(0);
        assertEquals("UP", cold.level());
        assertEquals(false, cold.scanned());
        assertNull(cold.blockLag());

        OpsSnapshot.ChainRow stalled = signals.chainRows(started + 120_000).get(0);
        assertEquals("DOWN", stalled.level());

        signals.scanOkAt("BASE", 4, started + 130_000);
        OpsSnapshot.ChainRow fresh = signals.chainRows(started + 140_000).get(0);
        assertEquals("UP", fresh.level());
        assertEquals(4L, fresh.blockLag());
        assertEquals(true, fresh.scanned());
        assertNull(fresh.lastError());

        signals.scanFailedAt("BASE", new IllegalStateException("https://rpc.example/secret"), started + 141_000);
        OpsSnapshot.ChainRow failed = signals.chainRows(started + 150_000).get(0);
        assertEquals("UP", failed.level());
        assertEquals(4L, failed.blockLag());
        assertEquals("IllegalStateException: [url]", failed.lastError());
        assertEquals(1L, failed.failures());
        assertTrue(signals.chainRows(started + 130_000 + 120_000).get(0).level().equals("DOWN"));
        assertEquals(1.0, registry.get("ka.chain.scan.failures").tag("chain", "BASE").counter().count());
    }

    @Test
    void notifyWindowDropsFailuresOlderThanFifteenMinutes() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        OpsSignals signals = signals(registry, 0);
        long now = 5_000_000L;
        signals.notifyFailedAt("email", now - OpsRules.NOTIFY_WINDOW_MS);
        OpsSnapshot.NotifyRow expired = row(signals, now, "email");
        assertEquals(0, expired.recentFailures());
        assertEquals("UP", expired.level());
        assertEquals(1, expired.totalFailures());

        signals.notifyFailedAt("email", now - 30_000);
        OpsSnapshot.NotifyRow recent = row(signals, now, "email");
        assertEquals(1, recent.recentFailures());
        assertEquals("DEGRADED", recent.level());
        assertEquals(2, recent.totalFailures());
        assertEquals(30L, recent.lastFailureAgeSeconds());
        assertEquals("UP", row(signals, now, "telegram").level());
        assertEquals(2.0, registry.get("ka.notify.failures").tag("channel", "email").counter().count());
    }

    @Test
    void disabledChainIsNotReported() {
        AppProperties props = new AppProperties();
        AppProperties.Chain off = new AppProperties.Chain();
        off.setCode("BASE");
        off.setEnabled(false);
        props.getCrypto().setChains(List.of(off));
        OpsSignals signals = new OpsSignals(new SimpleMeterRegistry(), props, 0);
        assertEquals(0, signals.chainRows(120_000).size());
    }

    private static OpsSnapshot.NotifyRow row(OpsSignals signals, long now, String channel) {
        return signals.notifyRows(now).stream().filter(item -> channel.equals(item.channel())).findFirst().orElseThrow();
    }

    private static OpsSignals signals(SimpleMeterRegistry registry, long startedAt) {
        AppProperties props = new AppProperties();
        props.getCrypto().setScanIntervalMs(15_000);
        AppProperties.Chain base = new AppProperties.Chain();
        base.setCode("BASE");
        base.setEnabled(true);
        props.getCrypto().setChains(List.of(base));
        return new OpsSignals(registry, props, startedAt);
    }
}
