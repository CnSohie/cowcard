package com.hqyj.ka.monitor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** 把一次读数收成页面和告警。没有订单不会把扫链判成故障。 */
public final class MonitorOverviewBuilder {

    public static final List<String> CHAINS = List.of("BASE", "POLYGON", "BSC");
    public static final String PAID_HREF = "/admin/orders?status=PAID";
    public static final String LATE_HREF = "/admin/orders?latePaid=1";
    public static final String PENDING_HREF = "/admin/orders?status=PENDING";

    public record Built(MonitorView.Overview overview, List<AlertPlan.Desired> desired) {}

    private MonitorOverviewBuilder() {}

    public static Built build(MonitorFacts facts) {
        long stallMs = MonitorRules.stallAfterMs(facts.scanIntervalMs());
        List<MonitorView.ChainCard> chains = new ArrayList<>();
        List<MonitorView.IssueCard> issues = new ArrayList<>();
        List<String> levels = new ArrayList<>();
        for (String code : CHAINS) {
            MonitorFacts.ChainFact fact = findChain(facts.chains(), code);
            MonitorView.ChainCard card = chainCard(code, fact, facts.nowMs(), facts.uptimeMs(), stallMs);
            chains.add(card);
            if (MonitorRules.ABNORMAL.equals(card.level())) {
                String title = card.consecutiveFailures() >= MonitorRules.CHAIN_FAILURES
                        ? code + " 连续扫描失败" : code + " 长时间没有成功扫描";
                issues.add(issue("chain." + code, title, chainDetail(card), null));
            }
            if (!MonitorRules.UNCONFIGURED.equals(card.level())) levels.add(card.level());
        }

        MonitorView.FulfillmentCard fulfillment = fulfillment(facts);
        levels.add(fulfillment.level());
        addFulfillmentIssues(issues, fulfillment);

        List<MonitorView.TaskCard> tasks = new ArrayList<>();
        tasks.add(expireTask(facts, issues));
        tasks.add(fxTask(facts, issues));
        for (MonitorView.ChainCard chain : chains) {
            if (MonitorRules.UNCONFIGURED.equals(chain.level())) continue;
            tasks.add(new MonitorView.TaskCard("chain." + chain.chain(), "扫链 " + chain.chain(), chain.level(),
                    chain.lastSuccessAgeSeconds(), null, chain.consecutiveFailures(), chainDetail(chain)));
        }
        for (MonitorView.TaskCard task : tasks) {
            if (!MonitorRules.UNCONFIGURED.equals(task.level())) levels.add(task.level());
        }

        List<MonitorView.NotifyCard> notifications = List.of(
                notify("email", "邮件", facts.mailEnabled(), facts.emailJob(), issues),
                notify("telegram", "Telegram", facts.telegramConfigured(), facts.telegramJob(), issues));
        for (MonitorView.NotifyCard row : notifications) {
            if (!MonitorRules.UNCONFIGURED.equals(row.level())) levels.add(row.level());
        }

        MonitorView.ResourceCard resources = resources(facts, issues);
        MonitorView.SecurityCard security = security(facts, issues);
        if (!MonitorRules.UNCONFIGURED.equals(resources.level())) levels.add(resources.level());
        if (!MonitorRules.UNCONFIGURED.equals(security.level())) levels.add(security.level());

        List<AlertPlan.Desired> desired = new ArrayList<>();
        for (MonitorView.IssueCard issue : issues) {
            desired.add(new AlertPlan.Desired(issue.key(), issue.title(), issue.detail()));
        }
        MonitorView.Overview overview = new MonitorView.Overview(
                MonitorRules.worst(levels),
                Instant.ofEpochMilli(facts.nowMs()).toString(),
                (int) (stallMs / 1000L),
                (int) MonitorRules.STUCK_PAID_SECONDS,
                (int) MonitorRules.MANUAL_STUCK_SECONDS,
                facts.openAlerts(),
                facts.unackedAlerts(),
                chains,
                tasks,
                fulfillment,
                notifications,
                resources,
                security,
                issues);
        return new Built(overview, desired);
    }

    private static MonitorView.ChainCard chainCard(String code, MonitorFacts.ChainFact fact, long nowMs,
                                                   long uptimeMs, long stallMs) {
        boolean enabled = fact != null && fact.enabled();
        boolean ever = fact != null && fact.lastSuccessAtMs() != null;
        int failures = fact == null ? 0 : fact.consecutiveFailures();
        long since = ever ? Math.max(0L, nowMs - fact.lastSuccessAtMs()) : uptimeMs;
        String level = MonitorRules.chainLevel(enabled, ever, failures, since, uptimeMs, stallMs);
        Long age = !enabled || !ever ? null : since / 1000L;
        return new MonitorView.ChainCard(code, level,
                fact != null && fact.cursorPresent() ? fact.scannedBlock() : null,
                fact == null ? null : fact.blockLag(),
                age, failures, fact == null ? null : fact.lastError());
    }

    private static String chainDetail(MonitorView.ChainCard card) {
        if (MonitorRules.NO_DATA.equals(card.level())) return "进程启动后还没有成功扫描,这不是故障";
        if (MonitorRules.UNCONFIGURED.equals(card.level())) return "这条链没有启用";
        String lag = card.blockLag() == null ? "落后块数还没有采到" : "上次成功时落后 " + card.blockLag() + " 块";
        String height = card.scannedBlock() == null ? "还没有扫描高度" : "扫描高度 " + card.scannedBlock();
        String age = card.lastSuccessAgeSeconds() == null ? "还没有成功记录" : "最近成功 " + card.lastSuccessAgeSeconds() + " 秒前";
        return age + "," + height + "," + lag + ",连续失败 " + card.consecutiveFailures() + " 次";
    }

    private static MonitorView.FulfillmentCard fulfillment(MonitorFacts facts) {
        MonitorFacts.PaidFact paid = facts.paid();
        boolean readFailed = paid.readFailed() || facts.lateReadFailed() || facts.confirmingReadFailed();
        boolean auto = MonitorRules.fulfillmentLate(paid.autoCard(), paid.autoCardOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS);
        boolean presale = MonitorRules.fulfillmentLate(paid.presale(), paid.presaleOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS);
        boolean recharge = MonitorRules.fulfillmentLate(paid.recharge(), paid.rechargeOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS);
        boolean manual = MonitorRules.fulfillmentLate(paid.manual(), paid.manualOldestSeconds(), MonitorRules.MANUAL_STUCK_SECONDS);
        boolean late = facts.latePaid() > 0;
        boolean confirming = facts.confirming() > 0 && facts.confirmingOldestSeconds() != null
                && facts.confirmingOldestSeconds() >= MonitorRules.CONFIRMING_STUCK_SECONDS;
        String level = readFailed || auto || presale || recharge || manual || late || confirming
                ? MonitorRules.ABNORMAL : MonitorRules.NORMAL;
        return new MonitorView.FulfillmentCard(level,
                (int) paid.autoCard(), paid.autoCardOldestSeconds(),
                (int) paid.manual(), paid.manualOldestSeconds(),
                (int) paid.presale(), paid.presaleOldestSeconds(),
                (int) paid.recharge(), paid.rechargeOldestSeconds(),
                (int) facts.latePaid(), (int) facts.confirming(), facts.confirmingOldestSeconds(), readFailed);
    }

    private static void addFulfillmentIssues(List<MonitorView.IssueCard> issues, MonitorView.FulfillmentCard card) {
        if (card.readFailed()) {
            issues.add(issue("fulfill.read", "暂时读不到支付和发货状态", "数据库读数失败,沿用不上这次的订单数量", PAID_HREF));
        }
        if (MonitorRules.fulfillmentLate(card.autoCard(), card.autoCardOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS)) {
            issues.add(issue("fulfill.auto", "自动发卡已支付未发出", card.autoCard() + " 单超过 60 秒仍停在已支付", PAID_HREF));
        }
        if (MonitorRules.fulfillmentLate(card.presale(), card.presaleOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS)) {
            issues.add(issue("fulfill.presale", "预售凭证已支付未交付", card.presale() + " 单超过 60 秒仍停在已支付", PAID_HREF));
        }
        if (MonitorRules.fulfillmentLate(card.recharge(), card.rechargeOldestSeconds(), MonitorRules.STUCK_PAID_SECONDS)) {
            issues.add(issue("fulfill.recharge", "充值已支付未入账", card.recharge() + " 单超过 60 秒仍停在已支付", PAID_HREF));
        }
        if (MonitorRules.fulfillmentLate(card.manual(), card.manualOldestSeconds(), MonitorRules.MANUAL_STUCK_SECONDS)) {
            issues.add(issue("fulfill.manual", "人工发货超过时限", card.manual() + " 单已超过 2 小时仍未交付", PAID_HREF));
        }
        if (card.latePaid() > 0) {
            issues.add(issue("fulfill.late", "有迟到收款待处理", card.latePaid() + " 笔已有成功流水,订单仍是超时或关闭", LATE_HREF));
        }
        if (card.confirming() > 0 && card.confirmingOldestSeconds() != null
                && card.confirmingOldestSeconds() >= MonitorRules.CONFIRMING_STUCK_SECONDS) {
            issues.add(issue("fulfill.confirming", "链上意向长时间停在确认中",
                    card.confirming() + " 笔命中转账后超过 10 分钟还没入账", PENDING_HREF));
        }
    }

    private static MonitorView.TaskCard expireTask(MonitorFacts facts, List<MonitorView.IssueCard> issues) {
        JobTracker.Beat beat = facts.expireJob();
        long since = beat.everSucceeded() ? Math.max(0L, facts.nowMs() - beat.lastSuccessMs()) : facts.uptimeMs();
        String level = MonitorRules.taskLevel(true, beat.everSucceeded(), beat.consecutiveFailures(),
                since, facts.uptimeMs(), MonitorRules.EXPIRE_STALL_MS, 2);
        String detail = taskDetail(level, since, beat);
        if (MonitorRules.ABNORMAL.equals(level)) {
            issues.add(issue("task.expire", "关单任务停滞", detail, null));
        }
        boolean jobHadChance = beat.everSucceeded() && since >= MonitorRules.EXPIRE_UNCLOSED_MS;
        if (!facts.expiredReadFailed() && facts.expiredPending() > 0 && jobHadChance
                && !MonitorRules.NO_DATA.equals(level)) {
            issues.add(issue("task.unclosed", "有过期订单仍未关闭",
                    facts.expiredPending() + " 笔待支付订单已过截止时间,关单任务最近一次成功已经超过 2 分钟",
                    "/admin/orders?status=PENDING"));
            if (!MonitorRules.ABNORMAL.equals(level)) level = MonitorRules.ABNORMAL;
        } else if (facts.expiredReadFailed()) {
            detail = detail + "。过期订单数量这次没有读到";
        }
        return new MonitorView.TaskCard("task.expire", "关闭超时订单", level,
                beat.everSucceeded() ? since / 1000L : null, beat.everStarted() ? beat.lastDurationMs() : null,
                beat.consecutiveFailures(), detail);
    }

    private static MonitorView.TaskCard fxTask(MonitorFacts facts, List<MonitorView.IssueCard> issues) {
        if (!facts.fxAuto()) {
            return new MonitorView.TaskCard("task.fx", "汇率刷新", MonitorRules.UNCONFIGURED,
                    null, null, 0, "汇率自动刷新已关闭,页面不会因此标成异常");
        }
        JobTracker.Beat beat = facts.fxJob();
        // 刷新周期一到就会跑下一轮,所以要超过两个周期仍没有成功才算长期旧值。
        long stall = Math.max(facts.fxIntervalMs() * 2, 120_000L);
        long since = beat.everSucceeded() ? Math.max(0L, facts.nowMs() - beat.lastSuccessMs()) : facts.uptimeMs();
        String level = MonitorRules.taskLevel(true, beat.everSucceeded(), beat.consecutiveFailures(),
                since, facts.uptimeMs(), stall, MonitorRules.CHAIN_FAILURES);
        String detail = MonitorRules.NO_DATA.equals(level)
                ? "还没有成功刷新过,当前使用启动时的汇率"
                : taskDetail(level, since, beat);
        if (beat.everSucceeded() && since >= stall) {
            detail = "汇率已经 " + (since / 1000L) + " 秒没有成功刷新,仍在使用旧值";
        }
        if (MonitorRules.ABNORMAL.equals(level)) {
            String title = beat.consecutiveFailures() >= MonitorRules.CHAIN_FAILURES && since < stall
                    ? "汇率刷新连续失败" : "汇率长期使用旧值";
            issues.add(issue("task.fx", title, detail, null));
        }
        return new MonitorView.TaskCard("task.fx", "汇率刷新", level,
                beat.everSucceeded() ? since / 1000L : null, beat.everStarted() ? beat.lastDurationMs() : null,
                beat.consecutiveFailures(), detail);
    }

    private static String taskDetail(String level, long sinceMs, JobTracker.Beat beat) {
        if (MonitorRules.NO_DATA.equals(level)) return "启动后还没有成功执行";
        if (MonitorRules.UNCONFIGURED.equals(level)) return "未配置";
        String age = "最近成功 " + (sinceMs / 1000L) + " 秒前";
        String took = beat.lastDurationMs() > 0 ? ",耗时 " + beat.lastDurationMs() + " 毫秒" : "";
        String fails = beat.consecutiveFailures() > 0 ? ",连续失败 " + beat.consecutiveFailures() + " 次" : "";
        return age + took + fails;
    }

    private static MonitorView.NotifyCard notify(String channel, String name, boolean configured,
                                                JobTracker.Beat beat, List<MonitorView.IssueCard> issues) {
        if (!configured) {
            return new MonitorView.NotifyCard(channel, MonitorRules.UNCONFIGURED, 0, 0, name + "未配置,跳过发送不算失败");
        }
        String level = beat.consecutiveFailures() >= MonitorRules.NOTIFY_FAILURES
                ? MonitorRules.ABNORMAL
                : (beat.everStarted() ? MonitorRules.NORMAL : MonitorRules.NO_DATA);
        String detail = MonitorRules.NO_DATA.equals(level)
                ? "还没有发送过"
                : "连续失败 " + beat.consecutiveFailures() + " 次,本次进程累计 " + beat.totalFailures() + " 次";
        if (MonitorRules.ABNORMAL.equals(level)) {
            String title = "email".equals(channel) ? "邮件通知连续失败" : "Telegram 通知连续失败";
            issues.add(issue("notify." + channel, title, detail, null));
        }
        return new MonitorView.NotifyCard(channel, level, beat.consecutiveFailures(), beat.totalFailures(), detail);
    }

    private static MonitorView.ResourceCard resources(MonitorFacts facts, List<MonitorView.IssueCard> issues) {
        MonitorFacts.ResourceFact resource = facts.resources();
        List<String> levels = new ArrayList<>();
        StringBuilder detail = new StringBuilder();
        if (!resource.poolReadable()) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("resource.db", "数据库不可用", "读不到连接池,可能是数据源没有就绪", null));
            detail.append("数据库连接池不可读。");
        } else if (resource.poolPending() > 0) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("resource.pool", "数据库连接池耗尽",
                    resource.poolPending() + " 个请求正在等待连接", null));
            detail.append("有请求在等数据库连接。");
        } else {
            levels.add(MonitorRules.NORMAL);
            detail.append("连接池 ").append(resource.poolActive()).append(" / ").append(resource.poolMax())
                    .append(",等待 ").append(resource.poolPending()).append("。");
        }
        if (resource.heapKnown() && resource.heapHighStreak() >= MonitorRules.RESOURCE_SAMPLES) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("resource.heap", "JVM 堆内存持续偏高",
                    "堆内存已连续 " + resource.heapHighStreak() + " 次采样超过 90%", null));
        } else if (!resource.heapKnown()) {
            levels.add(MonitorRules.NO_DATA);
        } else {
            levels.add(MonitorRules.NORMAL);
        }
        if (resource.diskKnown() && resource.diskTightStreak() >= MonitorRules.RESOURCE_SAMPLES) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("resource.disk", "磁盘剩余空间不足", "剩余空间连续偏低", null));
        } else if (!resource.diskKnown()) {
            levels.add(MonitorRules.NO_DATA);
        } else {
            levels.add(MonitorRules.NORMAL);
        }
        if (resource.asyncKnown() && resource.queueSustained()) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("resource.queue", "异步队列积压",
                    "通知和审计共用的异步队列深度 " + resource.asyncQueued(), null));
        } else if (!resource.asyncKnown()) {
            levels.add(MonitorRules.NO_DATA);
        } else {
            levels.add(MonitorRules.NORMAL);
        }
        if (resource.heapKnown()) detail.append("堆内存 ").append(resource.heapPercent()).append("%。");
        if (resource.diskKnown()) detail.append("磁盘剩余 ").append(resource.diskFreeBytes() / (1024 * 1024)).append(" MB。");
        if (resource.asyncKnown()) detail.append("异步队列 ").append(resource.asyncQueued()).append(" / ").append(resource.asyncCapacity()).append("。");
        return new MonitorView.ResourceCard(MonitorRules.worst(levels),
                resource.heapKnown() ? resource.heapPercent() : null,
                resource.poolActive(), resource.poolMax(), resource.poolPending(), resource.poolReadable(),
                resource.asyncKnown() ? resource.asyncQueued() : null,
                resource.asyncKnown() ? resource.asyncCapacity() : null,
                resource.diskKnown() ? resource.diskFreeBytes() / (1024 * 1024) : null,
                resource.diskKnown() ? resource.diskFreePercent() : null,
                detail.toString());
    }

    private static MonitorView.SecurityCard security(MonitorFacts facts, List<MonitorView.IssueCard> issues) {
        SecuritySignals.Snapshot shot = facts.security();
        List<String> levels = new ArrayList<>();
        if (shot.loginFailures15m() >= MonitorRules.LOGIN_WINDOW) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("security.login", "登录失败异常增多",
                    "近 15 分钟登录失败 " + shot.loginFailures15m() + " 次", null));
        } else levels.add(MonitorRules.NORMAL);
        if (shot.rateLimits15m() >= MonitorRules.RATE_WINDOW) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("security.rate", "限流次数异常增多",
                    "近 15 分钟被限流 " + shot.rateLimits15m() + " 次", null));
        } else levels.add(MonitorRules.NORMAL);
        if (shot.bans15m() >= MonitorRules.BAN_WINDOW || facts.activeBans() >= MonitorRules.ACTIVE_BANS) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("security.ban", "封禁数量异常增多",
                    "近 15 分钟新封禁 " + shot.bans15m() + " 次,当前仍封禁 " + facts.activeBans() + " 个地址", null));
        } else levels.add(MonitorRules.NORMAL);
        if (shot.auditConsecutive() >= MonitorRules.AUDIT_FAILURES) {
            levels.add(MonitorRules.ABNORMAL);
            issues.add(issue("security.audit", "审计落库连续失败",
                    "审计已连续失败 " + shot.auditConsecutive() + " 次", null));
        } else levels.add(MonitorRules.NORMAL);
        return new MonitorView.SecurityCard(MonitorRules.worst(levels), shot.loginFailures15m(), shot.rateLimits15m(),
                shot.bans15m(), facts.activeBans(), shot.auditConsecutive());
    }

    private static MonitorView.IssueCard issue(String key, String title, String detail, String href) {
        return new MonitorView.IssueCard(key, MonitorRules.ABNORMAL, MonitorRules.clip(title, 80),
                MonitorRules.clip(detail, 300), href);
    }

    private static MonitorFacts.ChainFact findChain(List<MonitorFacts.ChainFact> chains, String code) {
        if (chains == null) return null;
        for (MonitorFacts.ChainFact chain : chains) {
            if (code.equals(chain.code())) return chain;
        }
        return null;
    }
}
