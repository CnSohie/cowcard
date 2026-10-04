package com.hqyj.ka.monitor;

import com.hqyj.ka.observability.OpsRules;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 定时任务和通知的进程内心跳。只留最近一轮,不把每次执行写进数据库。
 * 任何记录失败都吞掉,避免监测把关单、发货或通知拖垮。
 */
@Component
public class JobTracker {

    public static final String EXPIRE = "task.expire";
    public static final String FX = "task.fx";
    public static final String EMAIL = "notify.email";
    public static final String TELEGRAM = "notify.telegram";

    public static String chain(String code) {
        return "chain." + (code == null ? "" : code);
    }

    private final ConcurrentMap<String, Beat> beats = new ConcurrentHashMap<>();
    private final long startedAtMs = System.currentTimeMillis();

    public long startedAtMs() {
        return startedAtMs;
    }

    public void begin(String key) {
        try {
            Beat beat = beat(key);
            beat.everStarted = true;
            beat.lastBeginMs = System.currentTimeMillis();
        } catch (RuntimeException ignored) {
            // 监测不能影响业务
        }
    }

    public void success(String key) {
        try {
            Beat beat = beat(key);
            long now = System.currentTimeMillis();
            beat.everStarted = true;
            beat.everSucceeded = true;
            beat.lastSuccessMs = now;
            beat.lastDurationMs = beat.lastBeginMs > 0 ? Math.max(0L, now - beat.lastBeginMs) : 0L;
            beat.consecutiveFailures = 0;
            beat.lastError = null;
        } catch (RuntimeException ignored) {
            // 监测不能影响业务
        }
    }

    public void failure(String key, Throwable error) {
        try {
            Beat beat = beat(key);
            long now = System.currentTimeMillis();
            beat.everStarted = true;
            beat.totalFailures++;
            beat.consecutiveFailures++;
            beat.lastDurationMs = beat.lastBeginMs > 0 ? Math.max(0L, now - beat.lastBeginMs) : 0L;
            beat.lastError = OpsRules.sanitize(error);
        } catch (RuntimeException ignored) {
            // 监测不能影响业务
        }
    }

    public Beat get(String key) {
        Beat beat = beats.get(key);
        return beat == null ? Beat.empty() : beat.copy();
    }

    private Beat beat(String key) {
        return beats.computeIfAbsent(key, ignored -> new Beat());
    }

    public static final class Beat {
        private boolean everStarted;
        private boolean everSucceeded;
        private long lastBeginMs;
        private long lastSuccessMs;
        private long lastDurationMs;
        private int consecutiveFailures;
        private int totalFailures;
        private String lastError;

        static Beat empty() {
            return new Beat();
        }

        Beat copy() {
            Beat beat = new Beat();
            beat.everStarted = everStarted;
            beat.everSucceeded = everSucceeded;
            beat.lastBeginMs = lastBeginMs;
            beat.lastSuccessMs = lastSuccessMs;
            beat.lastDurationMs = lastDurationMs;
            beat.consecutiveFailures = consecutiveFailures;
            beat.totalFailures = totalFailures;
            beat.lastError = lastError;
            return beat;
        }

        public boolean everStarted() { return everStarted; }
        public boolean everSucceeded() { return everSucceeded; }
        public long lastSuccessMs() { return lastSuccessMs; }
        public long lastDurationMs() { return lastDurationMs; }
        public int consecutiveFailures() { return consecutiveFailures; }
        public int totalFailures() { return totalFailures; }
        public String lastError() { return lastError; }
    }
}
