package com.hqyj.ka.observability;

import java.util.Collection;

/** 扫链、发货、通知、连接池的判定。无 Spring、无 IO,方便单测。 */
public final class OpsRules {

    public static final long STUCK_PAID_SECONDS = 60;
    public static final long NOTIFY_WINDOW_MS = 15 * 60 * 1000L;
    static final int ERROR_MAX = 180;

    private OpsRules() {}

    /** 启用中的链超过该时长没有成功扫描,视为停滞。至少 2 分钟,且不少于 4 个扫描间隔。 */
    public static long stallAfterMs(long scanIntervalMs) {
        long interval = scanIntervalMs > 0 ? scanIntervalMs : 15_000L;
        return Math.max(120_000L, interval * 4L);
    }

    public static String chainLevel(long ageSeconds, long stallAfterMs) {
        return ageSeconds * 1000L >= stallAfterMs ? "DOWN" : "UP";
    }

    /** 自动发卡、预售、充值停留在已支付超过窗口即异常。人工发货不在这里判断。 */
    public static boolean fulfillmentStuck(long count, Long oldestSeconds) {
        return count > 0 && (oldestSeconds == null || oldestSeconds >= STUCK_PAID_SECONDS);
    }

    public static String paidLevel(boolean readFailed, long autoCard, Long autoAge, long presale, Long presaleAge,
                                   long recharge, Long rechargeAge) {
        if (readFailed) return "DOWN";
        if (fulfillmentStuck(autoCard, autoAge) || fulfillmentStuck(presale, presaleAge)
                || fulfillmentStuck(recharge, rechargeAge)) {
            return "DOWN";
        }
        return "UP";
    }

    public static String notifyLevel(long recentFailures) {
        return recentFailures > 0 ? "DEGRADED" : "UP";
    }

    /** 有线程在等连接才是耗尽。池子借满但无人等待记为需关注,避免正常高峰把健康检查打成 503。 */
    public static String poolLevel(boolean readable, int active, int pending, int max) {
        if (!readable) return "DEGRADED";
        if (pending > 0) return "DOWN";
        if (max > 0 && active >= max) return "DEGRADED";
        return "UP";
    }

    public static String worst(Collection<String> levels) {
        boolean degraded = false;
        if (levels != null) {
            for (String level : levels) {
                if ("DOWN".equals(level)) return "DOWN";
                if ("DEGRADED".equals(level)) degraded = true;
            }
        }
        return degraded ? "DEGRADED" : "UP";
    }

    /** 指标标签只留安全字符,避免链名把 Prometheus 标签弄坏。 */
    public static String metricTag(String raw) {
        if (raw == null) return "unknown";
        String value = raw.trim();
        if (value.isEmpty() || value.length() > 32 || !value.matches("[A-Za-z0-9_.-]+")) return "unknown";
        return value;
    }

    /** 日志和后台可见的错误摘要。去掉 URL 和密钥,避免 Telegram token 进日志或页面。 */
    public static String sanitize(Throwable error) {
        if (error == null) return null;
        String type = error.getClass().getSimpleName();
        if (type == null || type.isBlank()) type = "Exception";
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            Throwable cause = error.getCause();
            if (cause != null && cause != error) return clip(type + ": " + cause.getClass().getSimpleName());
            return type;
        }
        return clip(type + ": " + redact(message));
    }

    static String redact(String message) {
        String value = message.replaceAll("(?i)https?://\\S+", "[url]");
        value = value.replaceAll("(?i)bot\\d+:[A-Za-z0-9_-]+", "bot[redacted]");
        value = value.replaceAll("(?i)(api[_-]?key|token|password|secret)\\s*[=:]\\s*\\S+", "$1=[redacted]");
        return value;
    }

    private static String clip(String value) {
        String cleaned = value.replaceAll("[\\p{Cntrl}&&[^\r\n\t]]", " ").trim();
        return cleaned.length() <= ERROR_MAX ? cleaned : cleaned.substring(0, ERROR_MAX);
    }
}
