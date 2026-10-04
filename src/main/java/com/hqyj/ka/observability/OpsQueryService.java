package com.hqyj.ka.observability;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class OpsQueryService {

    private final OpsSignals signals;
    private final PaidDeliveryProbe paid;
    private final DbPoolProbe pool;

    public OpsQueryService(OpsSignals signals, PaidDeliveryProbe paid, DbPoolProbe pool) {
        this.signals = signals;
        this.paid = paid;
        this.pool = pool;
    }

    public OpsSnapshot snapshot() {
        long now = System.currentTimeMillis();
        List<OpsSnapshot.ChainRow> chains = signals.chainRows(now);
        List<OpsSnapshot.NotifyRow> notifications = signals.notifyRows(now);
        PaidDeliveryProbe.Counts counts = paid.current();
        DbPoolProbe.Counts poolCounts = pool.read();
        OpsSnapshot.PaidRow paidRow = paidRow(counts);
        OpsSnapshot.PoolRow poolRow = poolRow(poolCounts);
        List<String> levels = new ArrayList<>();
        levels.add(OpsRules.worst(chains.stream().map(OpsSnapshot.ChainRow::level).toList()));
        levels.add(paidRow.level());
        levels.add(OpsRules.worst(notifications.stream().map(OpsSnapshot.NotifyRow::level).toList()));
        levels.add(poolRow.level());
        return new OpsSnapshot(OpsRules.worst(levels), signals.stallAfterMs() / 1000L, OpsRules.STUCK_PAID_SECONDS,
                List.copyOf(chains), paidRow, List.copyOf(notifications), poolRow);
    }

    private OpsSnapshot.PaidRow paidRow(PaidDeliveryProbe.Counts counts) {
        String level = OpsRules.paidLevel(counts.readFailed(), counts.autoCard(), counts.autoCardOldestSeconds(),
                counts.presale(), counts.presaleOldestSeconds(), counts.recharge(), counts.rechargeOldestSeconds());
        return new OpsSnapshot.PaidRow(level, counts.autoCard(), counts.autoCardOldestSeconds(), counts.manual(),
                counts.manualOldestSeconds(), counts.presale(), counts.presaleOldestSeconds(), counts.recharge(),
                counts.rechargeOldestSeconds(), counts.readFailed());
    }

    private static OpsSnapshot.PoolRow poolRow(DbPoolProbe.Counts counts) {
        int active = counts.active() == null ? 0 : counts.active();
        int pending = counts.pending() == null ? 0 : counts.pending();
        int max = counts.max() == null ? 0 : counts.max();
        String level = OpsRules.poolLevel(counts.readable(), active, pending, max);
        return new OpsSnapshot.PoolRow(level, counts.name(), counts.active(), counts.idle(), counts.pending(),
                counts.max(), counts.readable());
    }
}
