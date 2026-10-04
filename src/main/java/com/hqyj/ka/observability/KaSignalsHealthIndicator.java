package com.hqyj.ka.observability;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * 交易信号汇总进 /actuator/health。明细关闭,这里只放数量,不放错误文本。
 * 通知失败是 DEGRADED(HTTP 200);扫链停滞、自动发货卡住、连接池有线程等待是 DOWN。
 */
@Component("kaSignals")
public class KaSignalsHealthIndicator implements HealthIndicator {

    private final OpsQueryService ops;

    public KaSignalsHealthIndicator(OpsQueryService ops) {
        this.ops = ops;
    }

    @Override
    public Health health() {
        try {
            OpsSnapshot snapshot = ops.snapshot();
            Health.Builder builder = switch (snapshot.level()) {
                case "DOWN" -> Health.down();
                case "DEGRADED" -> Health.status("DEGRADED");
                default -> Health.up();
            };
            builder.withDetail("chains", snapshot.chains().size());
            builder.withDetail("paidAutoCard", snapshot.paid().autoCard());
            builder.withDetail("paidPresale", snapshot.paid().presale());
            builder.withDetail("paidRecharge", snapshot.paid().recharge());
            builder.withDetail("poolPending", snapshot.pool().pending() == null ? 0 : snapshot.pool().pending());
            return builder.build();
        } catch (RuntimeException e) {
            return Health.down().withDetail("probe", "failed").build();
        }
    }
}
