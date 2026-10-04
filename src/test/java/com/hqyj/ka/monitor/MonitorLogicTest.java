package com.hqyj.ka.monitor;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MonitorLogicTest {

    private static final long NOW = 1_700_000_000_000L;

    @Test
    void startupWithoutRunsIsNoDataAndDoesNotAlert() {
        MonitorOverviewBuilder.Built built = MonitorOverviewBuilder.build(facts(5_000L, enabledChain("BASE", null, 0),
                paid(0, null, 0, null), true, false, beat(), beat()));
        assertEquals(MonitorRules.NO_DATA, built.overview().level());
        assertTrue(built.desired().isEmpty());
        assertEquals(MonitorRules.NO_DATA, chain(built, "BASE").level());
    }

    @Test
    void noOrdersDoesNotMakeAHealthyScanLookFailed() {
        JobTracker jobs = new JobTracker();
        jobs.begin(JobTracker.EXPIRE);
        jobs.success(JobTracker.EXPIRE);
        MonitorFacts.ChainFact base = new MonitorFacts.ChainFact("BASE", true, true, 120L, 0L, NOW - 5_000L, 0, null);
        MonitorOverviewBuilder.Built built = MonitorOverviewBuilder.build(facts(30_000L, base,
                paid(0, null, 0, null), false, false, jobs.get(JobTracker.EXPIRE), beat()));
        assertEquals(MonitorRules.NORMAL, chain(built, "BASE").level());
        assertEquals(MonitorRules.NORMAL, built.overview().level());
        assertTrue(built.desired().stream().noneMatch(item -> item.key().startsWith("chain.")));
        assertTrue(built.desired().stream().noneMatch(item -> item.key().startsWith("fulfill.")));
    }

    @Test
    void oneScanFailureStaysNormalAndThreeBecomeAnAlert() {
        MonitorFacts.ChainFact once = new MonitorFacts.ChainFact("BASE", true, true, 10L, 1L, NOW - 10_000L, 1, "timeout");
        MonitorOverviewBuilder.Built quiet = MonitorOverviewBuilder.build(facts(60_000L, once,
                paid(0, null, 0, null), false, false, freshJob(), beat()));
        assertEquals(MonitorRules.NORMAL, chain(quiet, "BASE").level());
        assertTrue(quiet.desired().stream().noneMatch(item -> "chain.BASE".equals(item.key())));

        MonitorFacts.ChainFact stuck = new MonitorFacts.ChainFact("BASE", true, true, 10L, 4L, NOW - 10_000L, 3, "timeout");
        MonitorOverviewBuilder.Built loud = MonitorOverviewBuilder.build(facts(60_000L, stuck,
                paid(0, null, 0, null), false, false, freshJob(), beat()));
        assertEquals(MonitorRules.ABNORMAL, chain(loud, "BASE").level());
        assertTrue(loud.desired().stream().anyMatch(item -> "chain.BASE".equals(item.key())));
    }

    @Test
    void manualDeliveryUsesItsOwnLimit() {
        MonitorOverviewBuilder.Built fresh = MonitorOverviewBuilder.build(facts(60_000L, healthyChain(),
                paid(0, null, 1, 100L), false, false, freshJob(), beat()));
        assertTrue(fresh.desired().stream().noneMatch(item -> "fulfill.manual".equals(item.key())));

        MonitorOverviewBuilder.Built late = MonitorOverviewBuilder.build(facts(60_000L, healthyChain(),
                paid(0, null, 1, 8_000L), false, false, freshJob(), beat()));
        assertTrue(late.desired().stream().anyMatch(item -> "fulfill.manual".equals(item.key())));
        assertTrue(late.desired().stream().noneMatch(item -> "fulfill.auto".equals(item.key())));
    }

    @Test
    void autoDeliveryStuckAndNotifyThreshold() {
        MonitorOverviewBuilder.Built paidLate = MonitorOverviewBuilder.build(facts(60_000L, healthyChain(),
                paid(2, 90L, 0, null), false, true, freshJob(), beat()));
        assertTrue(paidLate.desired().stream().anyMatch(item -> "fulfill.auto".equals(item.key())
                && PAID_LINK.equals(itemHref(paidLate, "fulfill.auto"))));

        JobTracker mail = new JobTracker();
        mail.failure(JobTracker.EMAIL, new IllegalStateException("smtp"));
        mail.failure(JobTracker.EMAIL, new IllegalStateException("smtp"));
        MonitorOverviewBuilder.Built once = MonitorOverviewBuilder.build(facts(60_000L, healthyChain(),
                paid(0, null, 0, null), false, true, freshJob(), mail.get(JobTracker.EMAIL)));
        assertTrue(once.desired().stream().noneMatch(item -> "notify.email".equals(item.key())));

        mail.failure(JobTracker.EMAIL, new IllegalStateException("smtp"));
        MonitorOverviewBuilder.Built third = MonitorOverviewBuilder.build(facts(60_000L, healthyChain(),
                paid(0, null, 0, null), false, true, freshJob(), mail.get(JobTracker.EMAIL)));
        assertTrue(third.desired().stream().anyMatch(item -> "notify.email".equals(item.key())));
    }

    @Test
    void disabledChainAndDisabledFxAreUnconfigured() {
        MonitorFacts.ChainFact base = new MonitorFacts.ChainFact("BASE", false, false, null, null, null, 0, null);
        MonitorOverviewBuilder.Built built = MonitorOverviewBuilder.build(facts(60_000L, base,
                paid(0, null, 0, null), false, false, freshJob(), beat()));
        assertEquals(MonitorRules.UNCONFIGURED, chain(built, "BASE").level());
        assertEquals(MonitorRules.UNCONFIGURED, task(built, "task.fx").level());
        assertTrue(built.desired().isEmpty());
    }

    @Test
    void alertsMergeUntilCooldownThenRecoverOnce() {
        AlertPlan.Desired desired = new AlertPlan.Desired("chain.BASE", "BASE 连续扫描失败", "连续失败 3 次");
        List<AlertPlan.Step> opened = AlertPlan.plan(List.of(), List.of(desired), 1_000L, 30_000L);
        assertEquals(List.of(AlertPlan.OPEN), opened.stream().map(AlertPlan.Step::action).toList());

        List<AlertPlan.Step> again = AlertPlan.plan(
                List.of(new AlertPlan.OpenAlert("chain.BASE", 1_000L)), List.of(desired), 10_000L, 30_000L);
        assertEquals(AlertPlan.TOUCH, again.get(0).action());

        List<AlertPlan.Step> remind = AlertPlan.plan(
                List.of(new AlertPlan.OpenAlert("chain.BASE", 1_000L)), List.of(desired), 40_000L, 30_000L);
        assertEquals(AlertPlan.REMIND, remind.get(0).action());

        List<AlertPlan.Step> recovered = AlertPlan.plan(
                List.of(new AlertPlan.OpenAlert("chain.BASE", 40_000L)), List.of(), 50_000L, 30_000L);
        assertEquals(AlertPlan.RECOVER, recovered.get(0).action());
        assertEquals("chain.BASE", recovered.get(0).key());
    }

    @Test
    void trackerFailureCannotEscapeAndSuccessClearsTheStreak() {
        JobTracker tracker = new JobTracker();
        tracker.failure(JobTracker.FX, null);
        tracker.failure("chain.BASE", new IllegalStateException("https://rpc.example/bot1:secret"));
        assertEquals(1, tracker.get(JobTracker.FX).consecutiveFailures());
        assertNull(tracker.get(JobTracker.FX).lastError());
        assertFalse(tracker.get("chain.BASE").lastError().contains("secret"));
        tracker.success("chain.BASE");
        assertEquals(0, tracker.get("chain.BASE").consecutiveFailures());
        assertTrue(tracker.get("chain.BASE").everSucceeded());
    }

    private static MonitorView.ChainCard chain(MonitorOverviewBuilder.Built built, String code) {
        return built.overview().chains().stream().filter(card -> code.equals(card.chain())).findFirst().orElseThrow();
    }

    private static MonitorView.TaskCard task(MonitorOverviewBuilder.Built built, String key) {
        return built.overview().tasks().stream().filter(card -> key.equals(card.key())).findFirst().orElseThrow();
    }

    private static String itemHref(MonitorOverviewBuilder.Built built, String key) {
        return built.overview().issues().stream().filter(issue -> key.equals(issue.key())).findFirst().orElseThrow().href();
    }

    private static final String PAID_LINK = "/admin/orders?status=PAID";

    private static MonitorFacts facts(long uptime, MonitorFacts.ChainFact base, MonitorFacts.PaidFact paid,
                                      boolean fxAuto, boolean mail, JobTracker.Beat expire, JobTracker.Beat email) {
        return new MonitorFacts(NOW, uptime, 15_000L, 3_600_000L, fxAuto, mail, false,
                List.of(base, unconfigured("POLYGON"), unconfigured("BSC")),
                paid, 0, false, 0, null, false, 0, false,
                expire, beat(), email, beat(), healthyResources(),
                new SecuritySignals.Snapshot(0, 0, 0, 0, 0), 0, 0, 0);
    }

    private static MonitorFacts.ChainFact enabledChain(String code, Long successAt, int failures) {
        return new MonitorFacts.ChainFact(code, true, successAt != null, successAt == null ? null : 1L,
                successAt == null ? null : 0L, successAt, failures, null);
    }

    private static MonitorFacts.ChainFact healthyChain() {
        return new MonitorFacts.ChainFact("BASE", true, true, 80L, 0L, NOW - 4_000L, 0, null);
    }

    private static MonitorFacts.ChainFact unconfigured(String code) {
        return new MonitorFacts.ChainFact(code, false, false, null, null, null, 0, null);
    }

    private static MonitorFacts.PaidFact paid(long auto, Long autoAge, long manual, Long manualAge) {
        return new MonitorFacts.PaidFact(auto, autoAge, manual, manualAge, 0, null, 0, null, false);
    }

    private static JobTracker.Beat beat() {
        return new JobTracker().get("none");
    }

    private static JobTracker.Beat freshJob() {
        JobTracker jobs = new JobTracker();
        jobs.begin(JobTracker.EXPIRE);
        jobs.success(JobTracker.EXPIRE);
        return jobs.get(JobTracker.EXPIRE);
    }

    private static MonitorFacts.ResourceFact healthyResources() {
        return new MonitorFacts.ResourceFact(true, 40, false, 1, 8, 0, true,
                true, 0, 0, 500, true, 20L << 30, 50, false, 0, 0, false);
    }
}
