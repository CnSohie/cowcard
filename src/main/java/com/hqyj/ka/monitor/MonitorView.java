package com.hqyj.ka.monitor;

import java.util.List;

/** 管理端运行监测只读快照。不含密钥、订单号和异常原文里的链接。 */
public final class MonitorView {
    private MonitorView() {}

    public record Overview(
            String level,
            String generatedAt,
            int stallAfterSeconds,
            int stuckAfterSeconds,
            int manualStuckAfterSeconds,
            int openAlerts,
            int unackedAlerts,
            List<ChainCard> chains,
            List<TaskCard> tasks,
            FulfillmentCard fulfillment,
            List<NotifyCard> notifications,
            ResourceCard resources,
            SecurityCard security,
            List<IssueCard> issues
    ) {}

    public record ChainCard(String chain, String level, Long scannedBlock, Long blockLag,
                            Long lastSuccessAgeSeconds, int consecutiveFailures, String lastError) {}

    public record TaskCard(String key, String name, String level, Long lastSuccessAgeSeconds,
                           Long lastDurationMs, int consecutiveFailures, String detail) {}

    public record FulfillmentCard(
            String level, int autoCard, Long autoCardOldestSeconds, int manual, Long manualOldestSeconds,
            int presale, Long presaleOldestSeconds, int recharge, Long rechargeOldestSeconds,
            int latePaid, int confirming, Long confirmingOldestSeconds, boolean readFailed
    ) {}

    public record NotifyCard(String channel, String level, int consecutiveFailures, int totalFailures, String detail) {}

    public record ResourceCard(
            String level, Integer heapPercent, Integer poolActive, Integer poolMax, Integer poolPending,
            boolean poolReadable, Integer asyncQueued, Integer asyncCapacity, Long diskFreeMb,
            Integer diskFreePercent, String detail
    ) {}

    public record SecurityCard(
            String level, int loginFailures15m, int rateLimits15m, int bans15m, int activeBans,
            int auditConsecutiveFailures
    ) {}

    public record IssueCard(String key, String level, String title, String detail, String href) {}

    public record AlertItem(
            long id, String alertKey, String title, String summary, String status,
            String firstSeenAt, String lastSeenAt, String recoveredAt, String ackedAt, String ackedBy
    ) {}
}
