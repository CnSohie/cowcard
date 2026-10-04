package com.hqyj.ka.monitor;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 告警评估跟页面刷新分开。页面只读快照。 */
@Component
@RequiredArgsConstructor
public class MonitorScheduler {

    private final MonitorAlertService alerts;

    @Scheduled(initialDelay = 20_000, fixedDelay = 30_000)
    public void evaluate() {
        alerts.evaluate();
    }
}
