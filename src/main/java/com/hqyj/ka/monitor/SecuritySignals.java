package com.hqyj.ka.monitor;

import org.springframework.stereotype.Component;

import java.util.ArrayDeque;

/** 登录失败、限流、封禁和审计失败的 15 分钟滑动窗口。有上界,不落库。 */
@Component
public class SecuritySignals {

    static final long WINDOW_MS = 15 * 60 * 1000L;
    private static final int CAP = 500;

    private final Window login = new Window();
    private final Window rateLimit = new Window();
    private final Window bans = new Window();
    private int auditConsecutive;
    private int auditTotal;

    public void loginFailed() {
        login.mark(System.currentTimeMillis());
    }

    public void rateLimited() {
        rateLimit.mark(System.currentTimeMillis());
    }

    public void banned() {
        bans.mark(System.currentTimeMillis());
    }

    public void auditFailed() {
        synchronized (this) {
            auditConsecutive++;
            auditTotal++;
        }
    }

    public void auditSucceeded() {
        synchronized (this) {
            auditConsecutive = 0;
        }
    }

    public Snapshot snapshot(long nowMs) {
        synchronized (this) {
            return new Snapshot(login.recent(nowMs), rateLimit.recent(nowMs), bans.recent(nowMs),
                    auditConsecutive, auditTotal);
        }
    }

    public record Snapshot(int loginFailures15m, int rateLimits15m, int bans15m,
                           int auditConsecutive, int auditTotal) {}

    private static final class Window {
        private final ArrayDeque<Long> recent = new ArrayDeque<>();

        synchronized void mark(long nowMs) {
            recent.addLast(nowMs);
            prune(nowMs);
            while (recent.size() > CAP) recent.removeFirst();
        }

        synchronized int recent(long nowMs) {
            prune(nowMs);
            return recent.size();
        }

        private void prune(long nowMs) {
            long cutoff = nowMs - WINDOW_MS;
            while (!recent.isEmpty() && recent.peekFirst() <= cutoff) recent.removeFirst();
        }
    }
}
