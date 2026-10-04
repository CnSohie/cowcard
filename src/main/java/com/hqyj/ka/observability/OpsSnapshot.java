package com.hqyj.ka.observability;

import java.util.List;

/** 后台运行状态。错误文本已脱敏,不含订单号、令牌或回调 URL。 */
public record OpsSnapshot(
        String level,
        long stallAfterSeconds,
        long stuckAfterSeconds,
        List<ChainRow> chains,
        PaidRow paid,
        List<NotifyRow> notifications,
        PoolRow pool
) {
    public record ChainRow(String chain, String level, long ageSeconds, Long blockLag, String lastError,
                           long failures, boolean scanned) {}

    public record PaidRow(String level, long autoCard, Long autoCardOldestSeconds, long manual,
                          Long manualOldestSeconds, long presale, Long presaleOldestSeconds, long recharge,
                          Long rechargeOldestSeconds, boolean readFailed) {}

    public record NotifyRow(String channel, String level, long totalFailures, long recentFailures,
                            Long lastFailureAgeSeconds) {}

    public record PoolRow(String level, String name, Integer active, Integer idle, Integer pending, Integer max,
                          boolean readable) {}
}
