package com.hqyj.ka.monitor;

import java.util.List;

/** 一次快照用到的原始读数。采集失败的字段单独标出,不让整页变空白。 */
public record MonitorFacts(
        long nowMs,
        long uptimeMs,
        long scanIntervalMs,
        long fxIntervalMs,
        boolean fxAuto,
        boolean mailEnabled,
        boolean telegramConfigured,
        List<ChainFact> chains,
        PaidFact paid,
        long latePaid,
        boolean lateReadFailed,
        long confirming,
        Long confirmingOldestSeconds,
        boolean confirmingReadFailed,
        long expiredPending,
        boolean expiredReadFailed,
        JobTracker.Beat expireJob,
        JobTracker.Beat fxJob,
        JobTracker.Beat emailJob,
        JobTracker.Beat telegramJob,
        ResourceFact resources,
        SecuritySignals.Snapshot security,
        int activeBans,
        int openAlerts,
        int unackedAlerts
) {
    public record ChainFact(
            String code, boolean enabled, boolean cursorPresent, Long scannedBlock, Long blockLag,
            Long lastSuccessAtMs, int consecutiveFailures, String lastError
    ) {}

    public record PaidFact(
            long autoCard, Long autoCardOldestSeconds, long manual, Long manualOldestSeconds,
            long presale, Long presaleOldestSeconds, long recharge, Long rechargeOldestSeconds,
            boolean readFailed
    ) {}

    public record ResourceFact(
            boolean heapKnown, int heapPercent, boolean heapHigh,
            int poolActive, int poolMax, int poolPending, boolean poolReadable,
            boolean asyncKnown, int asyncQueued, int asyncActive, int asyncCapacity,
            boolean diskKnown, long diskFreeBytes, int diskFreePercent, boolean diskTight,
            int heapHighStreak, int diskTightStreak, boolean queueSustained
    ) {}
}
