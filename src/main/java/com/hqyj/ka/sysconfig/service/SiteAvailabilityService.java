package com.hqyj.ka.sysconfig.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.Map;

/** 按请求计算营业状态，使用配置缓存，无需额外调度线程。 */
@Service
@RequiredArgsConstructor
public class SiteAvailabilityService {
    private final ConfigService configService;
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    public record Status(String state, String message, String timezone, String offStart,
                         String offEnd, String resumesAt) {}

    public Status status() {
        return evaluate(configService.all(), Instant.now());
    }

    public void requireOpen() {
        Status status = status();
        if (!status.state().equals("OPEN")) {
            throw new BusinessException(ErrorCode.SITE_UNAVAILABLE, status.message());
        }
    }

    static Status evaluate(Map<String, String> cfg, Instant instant) {
        String start = cfg.getOrDefault("site.off_hours.start", "22:00");
        String end = cfg.getOrDefault("site.off_hours.end", "09:00");
        if (enabled(cfg, "site.maintenance.enabled")) {
            return new Status("MAINTENANCE", message(cfg, "site.maintenance.message", "网站维护中，请稍后再来。"),
                    ZONE.getId(), start, end, null);
        }
        if (enabled(cfg, "site.off_hours.enabled")) {
            LocalTime from = LocalTime.parse(start), to = LocalTime.parse(end);
            ZonedDateTime now = instant.atZone(ZONE);
            LocalTime time = now.toLocalTime();
            boolean closed = from.isBefore(to)
                    ? !time.isBefore(from) && time.isBefore(to)
                    : !time.isBefore(from) || time.isBefore(to);
            if (closed) {
                ZonedDateTime resume = now.toLocalDate().atTime(to).atZone(ZONE);
                if (!resume.isAfter(now)) resume = resume.plusDays(1);
                return new Status("OFF_HOURS", message(cfg, "site.off_hours.message", "已经下班啦，营业后欢迎再来。"),
                        ZONE.getId(), start, end, resume.toOffsetDateTime().toString());
            }
        }
        return new Status("OPEN", "", ZONE.getId(), start, end, null);
    }

    public void validateConfiguration(Map<String, String> cfg) {
        for (String key : new String[]{"site.maintenance.enabled", "site.off_hours.enabled"}) {
            if (!java.util.Set.of("0", "1").contains(cfg.getOrDefault(key, "0"))) invalid("营业状态开关必须为 0 或 1");
        }
        String start = cfg.getOrDefault("site.off_hours.start", "22:00");
        String end = cfg.getOrDefault("site.off_hours.end", "09:00");
        if (start == null || end == null || !start.matches("([01]\\d|2[0-3]):[0-5]\\d")
                || !end.matches("([01]\\d|2[0-3]):[0-5]\\d")) invalid("下班时段请使用 HH:mm 格式");
        if (start.equals(end)) invalid("下班开始与结束时间不能相同");
        for (String key : new String[]{"site.maintenance.message", "site.off_hours.message"}) {
            if (cfg.containsKey(key) && (cfg.get(key) == null || cfg.get(key).length() > 500)) invalid("状态提示最多 500 字");
        }
    }

    private static boolean enabled(Map<String, String> cfg, String key) { return "1".equals(cfg.get(key)); }
    private static String message(Map<String, String> cfg, String key, String fallback) {
        String value = cfg.get(key);
        return value == null || value.isBlank() ? fallback : value;
    }
    private static void invalid(String message) { throw new BusinessException(ErrorCode.BAD_REQUEST, message); }
}
