package com.hqyj.ka.telegram;

import com.hqyj.ka.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;

/** Dedicated single scheduler: Telegram network latency cannot consume the chain scanner's scheduler. */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ka.telegram.enabled", havingValue = "true")
public class TelegramWorker {
    private final JdbcTemplate jdbc;
    private final TelegramService service;
    private final TelegramProperties properties;
    private final TelegramData data;
    private final TelegramApiClient api;

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = "ka.telegram.enabled", havingValue = "true")
    static class Scheduling {
        @Bean("telegramScheduler")
        ThreadPoolTaskScheduler telegramScheduler() {
            var scheduler = new ThreadPoolTaskScheduler();
            scheduler.setPoolSize(1);
            scheduler.setThreadNamePrefix("ka-telegram-");
            scheduler.setWaitForTasksToCompleteOnShutdown(true);
            scheduler.setAwaitTerminationSeconds(15);
            return scheduler;
        }
    }

    @Scheduled(fixedDelay = 1000, scheduler = "telegramScheduler")
    public void receive() {
        var updates = jdbc.queryForList("SELECT update_id FROM telegram_inbox WHERE bot_id=? AND done=FALSE AND attempts<8 AND available_at<=? ORDER BY update_id LIMIT 10",
                Long.class, properties.botId(), LocalDateTime.now());
        for (long id : updates) {
            try { service.process(id); }
            catch (BusinessException e) { service.reject(id, e.getMessage()); }
            catch (RuntimeException e) {
                jdbc.update("UPDATE telegram_inbox SET attempts=attempts+1,available_at=? WHERE bot_id=? AND update_id=? AND done=FALSE",
                        LocalDateTime.now().plusSeconds(30), properties.botId(), id);
                log.warn("Telegram update deferred: updateId={}, errorType={}", id, e.getClass().getSimpleName());
            }
        }
    }

    @Scheduled(fixedDelay = 1000, scheduler = "telegramScheduler")
    public void send() {
        var batch = jdbc.queryForList("SELECT * FROM telegram_outbox WHERE bot_id=? AND done=FALSE AND attempts<8 AND available_at<=? ORDER BY id LIMIT 20",
                properties.botId(), LocalDateTime.now());
        var sentUsers = new HashSet<Long>();
        int sent = 0;
        for (var row : batch) {
            long user = ((Number) row.get("user_id")).longValue();
            if (sent >= 4) break;
            if ("sendMessage".equals(row.get("method")) && !sentUsers.add(user)) continue;
            long id = ((Number) row.get("id")).longValue();
            String lease = UUID.randomUUID().toString();
            if (jdbc.update("UPDATE telegram_outbox SET lease_id=?,available_at=?,attempts=attempts+1 WHERE id=? AND done=FALSE AND attempts<8 AND available_at<=?",
                    lease, LocalDateTime.now().plusSeconds(60), id, LocalDateTime.now()) != 1) continue;
            sent++;
            TelegramApiClient.Result result;
            try { result = api.send((String) row.get("method"), data.decrypt((String) row.get("payload_enc"), Map.class)); }
            catch (RuntimeException e) { result = new TelegramApiClient.Result(false, false, 0); }
            int attempt = ((Number) row.get("attempts")).intValue() + 1;
            if (result.ok()) {
                jdbc.update("UPDATE telegram_outbox SET done=TRUE,payload_enc=NULL,lease_id=NULL WHERE id=? AND lease_id=?", id, lease);
            } else {
                long delay = Math.max(result.retryAfterSeconds(), Math.min(1800, 5L << attempt));
                jdbc.update("UPDATE telegram_outbox SET available_at=?,lease_id=NULL,attempts=? WHERE id=? AND lease_id=?",
                        LocalDateTime.now().plusSeconds(delay), result.retryable() ? attempt : 8, id, lease);
                if (!result.retryable() || attempt >= 8)
                    log.warn("Telegram outbound needs attention: messageId={}, attempts={}", id, attempt);
            }
        }
    }

    @Scheduled(fixedDelay = 10_000, scheduler = "telegramScheduler")
    public void reconcile() {
        var ids = jdbc.queryForList("SELECT t.order_id FROM telegram_order t JOIN orders o ON o.id=t.order_id JOIN telegram_account a ON a.bot_id=t.bot_id AND a.user_id=t.user_id WHERE t.bot_id=? AND a.enabled=TRUE AND t.notified_status<>o.status ORDER BY t.order_id LIMIT 50",
                Long.class, properties.botId());
        for (long id : ids) {
            try { service.notifyStatus(id); }
            catch (RuntimeException e) { log.warn("Telegram status deferred: orderId={}, errorType={}", id, e.getClass().getSimpleName()); }
        }
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 3_600_000, scheduler = "telegramScheduler")
    public void expirePrivateData() {
        // Keep inbox IDs for replay protection; remove message content and expired credentials.
        jdbc.update("DELETE FROM telegram_ticket WHERE expires_at<?", LocalDateTime.now());
        jdbc.update("UPDATE telegram_account SET draft_enc=NULL,draft_expires_at=NULL WHERE draft_expires_at<?", LocalDateTime.now());
        jdbc.update("UPDATE telegram_inbox SET payload_enc=NULL,done=TRUE WHERE created_at<? AND done=FALSE",
                LocalDateTime.now().minusDays(7));
        jdbc.update("UPDATE telegram_outbox SET payload_enc=NULL,done=TRUE WHERE created_at<? AND done=FALSE",
                LocalDateTime.now().minusDays(7));
    }
}
