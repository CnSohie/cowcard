package com.hqyj.ka.monitor;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.observability.OpsRules;
import com.hqyj.ka.order.service.TelegramNotifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 告警合并、冷却和恢复通知。确认只表示有人看见,不把告警关掉。 */
@Slf4j
@Service
public class MonitorAlertService {

    private final MonitorFactsLoader loader;
    private final MonitorAlertRepository alerts;
    private final TelegramNotifier telegram;
    private final AuditService auditService;
    private final TransactionTemplate tx;

    public MonitorAlertService(MonitorFactsLoader loader, MonitorAlertRepository alerts, TelegramNotifier telegram,
                               AuditService auditService, PlatformTransactionManager transactions) {
        this.loader = loader;
        this.alerts = alerts;
        this.telegram = telegram;
        this.auditService = auditService;
        this.tx = new TransactionTemplate(transactions);
    }

    public void evaluate() {
        try {
            loader.sampleResources();
            List<AlertPlan.Desired> desired = MonitorOverviewBuilder.build(loader.load()).desired();
            tx.executeWithoutResult(status -> apply(desired));
        } catch (RuntimeException e) {
            log.warn("monitor evaluate skipped: {}", OpsRules.sanitize(e));
        }
    }

    @Transactional(readOnly = true)
    public List<MonitorView.AlertItem> list() {
        List<MonitorAlert> rows = new ArrayList<>(alerts.findByStatusOrderByLastSeenAtDesc(MonitorAlert.Status.OPEN));
        rows.addAll(alerts.findTop20ByStatusOrderByRecoveredAtDesc(MonitorAlert.Status.RECOVERED));
        rows.sort(Comparator.comparingInt(MonitorAlertService::rank));
        List<MonitorView.AlertItem> views = new ArrayList<>();
        for (MonitorAlert row : rows) views.add(toView(row));
        return views;
    }

    @Transactional
    public MonitorView.AlertItem ack(long id, String actor, String ip) {
        MonitorAlert alert = alerts.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (alert.getAckedAt() == null) {
            alert.setAckedAt(LocalDateTime.now());
            alert.setAckedBy(MonitorRules.clip(actor == null ? "unknown" : actor, 64));
            auditService.record(alert.getAckedBy(), "MONITOR_ALERT_ACK", "monitor-alert:" + id, ip, alert.getAlertKey());
        }
        return toView(alert);
    }

    private void apply(List<AlertPlan.Desired> desired) {
        List<AlertPlan.OpenAlert> open = new ArrayList<>();
        for (MonitorAlert alert : alerts.findByStatusOrderByLastSeenAtDesc(MonitorAlert.Status.OPEN)) {
            open.add(new AlertPlan.OpenAlert(alert.getAlertKey(), epoch(alert.getNotifiedAt())));
        }
        LocalDateTime now = LocalDateTime.now();
        for (AlertPlan.Step step : AlertPlan.plan(open, desired, System.currentTimeMillis(), MonitorRules.ALERT_COOLDOWN_MS)) {
            switch (step.action()) {
                case AlertPlan.OPEN -> openAlert(step, now);
                case AlertPlan.REMIND -> remind(step, now);
                case AlertPlan.TOUCH -> touch(step, now);
                case AlertPlan.RECOVER -> recover(step.key(), now);
                default -> { }
            }
        }
        alerts.deleteRecoveredBefore(now.minusDays(MonitorRules.ALERT_RETAIN_DAYS));
    }

    private void openAlert(AlertPlan.Step step, LocalDateTime now) {
        MonitorAlert alert = new MonitorAlert();
        alert.setAlertKey(MonitorRules.clip(step.key(), 64));
        alert.setTitle(titleOf(step.title(), step.key()));
        alert.setSummary(summaryOf(step.summary(), step.title()));
        alert.setStatus(MonitorAlert.Status.OPEN);
        alert.setFirstSeenAt(now);
        alert.setLastSeenAt(now);
        alert.setNotifiedAt(now);
        alerts.save(alert);
        notifyAdmin("【运行监测】" + alert.getTitle() + "\n" + alert.getSummary());
    }

    private void remind(AlertPlan.Step step, LocalDateTime now) {
        MonitorAlert alert = alerts.findFirstByAlertKeyAndStatus(step.key(), MonitorAlert.Status.OPEN).orElse(null);
        if (alert == null) return;
        alert.setTitle(titleOf(step.title(), alert.getTitle()));
        alert.setSummary(summaryOf(step.summary(), alert.getSummary()));
        alert.setLastSeenAt(now);
        alert.setNotifiedAt(now);
        notifyAdmin("【运行监测】仍未恢复\n" + alert.getTitle() + "\n" + alert.getSummary());
    }

    private void touch(AlertPlan.Step step, LocalDateTime now) {
        MonitorAlert alert = alerts.findFirstByAlertKeyAndStatus(step.key(), MonitorAlert.Status.OPEN).orElse(null);
        if (alert == null) return;
        alert.setTitle(titleOf(step.title(), alert.getTitle()));
        alert.setSummary(summaryOf(step.summary(), alert.getSummary()));
        alert.setLastSeenAt(now);
    }

    private void recover(String key, LocalDateTime now) {
        MonitorAlert alert = alerts.findFirstByAlertKeyAndStatus(key, MonitorAlert.Status.OPEN).orElse(null);
        if (alert == null) return;
        alert.setStatus(MonitorAlert.Status.RECOVERED);
        alert.setRecoveredAt(now);
        alert.setRecoveryNotifiedAt(now);
        notifyAdmin("【运行监测】已恢复\n" + alert.getTitle());
    }

    private void notifyAdmin(String text) {
        try {
            telegram.notifyAdmin(text);
        } catch (RuntimeException e) {
            log.warn("monitor telegram skipped: {}", OpsRules.sanitize(e));
        }
    }

    private static MonitorView.AlertItem toView(MonitorAlert alert) {
        return new MonitorView.AlertItem(alert.getId(), alert.getAlertKey(), alert.getTitle(), alert.getSummary(),
                alert.getStatus().name(), text(alert.getFirstSeenAt()), text(alert.getLastSeenAt()),
                text(alert.getRecoveredAt()), text(alert.getAckedAt()), alert.getAckedBy());
    }

    private static int rank(MonitorAlert alert) {
        if (alert.getStatus() == MonitorAlert.Status.RECOVERED) return 2;
        return alert.getAckedAt() == null ? 0 : 1;
    }

    private static String titleOf(String value, String fallback) {
        String chosen = value == null || value.isBlank() ? fallback : value;
        return MonitorRules.clip(chosen == null || chosen.isBlank() ? "告警" : chosen, 80);
    }

    private static String summaryOf(String value, String fallback) {
        String chosen = value == null || value.isBlank() ? fallback : value;
        return MonitorRules.clip(chosen == null ? "" : chosen, 300);
    }

    private static String text(LocalDateTime time) {
        return time == null ? null : time.atZone(ZoneId.systemDefault()).toInstant().toString();
    }

    private static long epoch(LocalDateTime time) {
        return time == null ? 0L : time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }
}
