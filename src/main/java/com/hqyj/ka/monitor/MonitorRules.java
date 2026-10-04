package com.hqyj.ka.monitor;

import java.util.Collection;

/** 运行监测的状态和告警门槛。无 Spring、无 IO。一次抖动不够成异常。 */
public final class MonitorRules {

    public static final String NORMAL = "NORMAL";
    public static final String ABNORMAL = "ABNORMAL";
    public static final String UNCONFIGURED = "UNCONFIGURED";
    public static final String NO_DATA = "NO_DATA";

    public static final int CHAIN_FAILURES = 3;
    public static final long STUCK_PAID_SECONDS = 60;
    public static final long MANUAL_STUCK_SECONDS = 2 * 60 * 60;
    public static final long CONFIRMING_STUCK_SECONDS = 10 * 60;
    public static final int NOTIFY_FAILURES = 3;
    public static final long EXPIRE_STALL_MS = 180_000L;
    public static final long EXPIRE_UNCLOSED_MS = 120_000L;
    public static final long ALERT_COOLDOWN_MS = 30 * 60 * 1000L;
    public static final int ALERT_RETAIN_DAYS = 14;
    public static final int LOGIN_WINDOW = 20;
    public static final int RATE_WINDOW = 100;
    public static final int BAN_WINDOW = 5;
    public static final int ACTIVE_BANS = 10;
    public static final int AUDIT_FAILURES = 3;
    public static final double HEAP_RATIO = 0.90d;
    public static final int RESOURCE_SAMPLES = 3;
    public static final double DISK_FREE_RATIO = 0.10d;
    public static final long DISK_FREE_FLOOR = 512L * 1024 * 1024;
    public static final int QUEUE_HIGH = 100;
    public static final int QUEUE_GROWTH_FLOOR = 20;

    private MonitorRules() {}

    public static long stallAfterMs(long scanIntervalMs) {
        long interval = scanIntervalMs > 0 ? scanIntervalMs : 15_000L;
        return Math.max(120_000L, interval * 4L);
    }

    /** 没扫过不是故障。连续失败或超过停滞时间才异常。未启用的链是未配置。 */
    public static String chainLevel(boolean enabled, boolean everSucceeded, int consecutiveFailures,
                                    long sinceSuccessMs, long uptimeMs, long stallMs) {
        if (!enabled) return UNCONFIGURED;
        if (consecutiveFailures >= CHAIN_FAILURES) return ABNORMAL;
        if (!everSucceeded) return uptimeMs >= stallMs ? ABNORMAL : NO_DATA;
        return sinceSuccessMs >= stallMs ? ABNORMAL : NORMAL;
    }

    public static String taskLevel(boolean configured, boolean everSucceeded, int consecutiveFailures,
                                   long sinceSuccessMs, long uptimeMs, long stallMs, int failureThreshold) {
        if (!configured) return UNCONFIGURED;
        if (consecutiveFailures >= failureThreshold) return ABNORMAL;
        if (!everSucceeded) return uptimeMs >= stallMs ? ABNORMAL : NO_DATA;
        return sinceSuccessMs >= stallMs ? ABNORMAL : NORMAL;
    }

    /** 自动发卡、预售、充值用短窗口。人工发货用自己的时限。没有订单不是异常。 */
    public static boolean fulfillmentLate(long count, Long oldestSeconds, long limitSeconds) {
        return count > 0 && (oldestSeconds == null || oldestSeconds >= limitSeconds);
    }

    public static String worst(Collection<String> levels) {
        boolean noData = false;
        if (levels != null) {
            for (String level : levels) {
                if (ABNORMAL.equals(level)) return ABNORMAL;
                if (NO_DATA.equals(level)) noData = true;
            }
        }
        return noData ? NO_DATA : NORMAL;
    }

    public static String clip(String value, int max) {
        if (value == null) return "";
        String cleaned = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max);
    }
}
