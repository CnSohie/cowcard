package com.hqyj.ka.monitor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 同类告警合并:未恢复不重复开,冷却期内不提醒,恢复只通知一次。确认与否不改变这里的判断。 */
public final class AlertPlan {

    public static final String OPEN = "OPEN";
    public static final String TOUCH = "TOUCH";
    public static final String REMIND = "REMIND";
    public static final String RECOVER = "RECOVER";

    private AlertPlan() {}

    public record OpenAlert(String key, long lastNotifiedAtMs) {}

    public record Desired(String key, String title, String summary) {}

    public record Step(String action, String key, String title, String summary) {}

    public static List<Step> plan(List<OpenAlert> open, List<Desired> desired, long nowMs, long cooldownMs) {
        Map<String, OpenAlert> current = new HashMap<>();
        if (open != null) {
            for (OpenAlert alert : open) {
                if (alert != null && alert.key() != null) current.put(alert.key(), alert);
            }
        }
        List<Step> steps = new ArrayList<>();
        if (desired != null) {
            for (Desired item : desired) {
                if (item == null || item.key() == null) continue;
                OpenAlert existing = current.remove(item.key());
                if (existing == null) {
                    steps.add(new Step(OPEN, item.key(), item.title(), item.summary()));
                } else if (existing.lastNotifiedAtMs() <= 0
                        || nowMs - existing.lastNotifiedAtMs() >= cooldownMs) {
                    steps.add(new Step(REMIND, item.key(), item.title(), item.summary()));
                } else {
                    steps.add(new Step(TOUCH, item.key(), item.title(), item.summary()));
                }
            }
        }
        for (OpenAlert leftover : current.values()) {
            steps.add(new Step(RECOVER, leftover.key(), null, null));
        }
        return steps;
    }
}
