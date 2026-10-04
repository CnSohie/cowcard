package com.hqyj.ka.monitor;

import com.hqyj.ka.observability.OpsRules;
import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import com.hqyj.ka.payment.crypto.repo.ChainCursorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 把扫链结果写进已有游标。失败时不新建游标,避免把扫描高度重置成 0。 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChainCursorMonitor {

    private final ChainCursorRepository cursors;

    public void markSuccess(ChainCursor cursor, long blockLag) {
        cursor.setLastSuccessAt(LocalDateTime.now());
        cursor.setConsecutiveFailures(0);
        cursor.setLastError(null);
        cursor.setLastBlockLag(Math.max(0L, blockLag));
    }

    public void markFailure(String chainCode, Throwable error) {
        try {
            ChainCursor cursor = cursors.findById(chainCode).orElse(null);
            if (cursor == null) return;
            cursor.setConsecutiveFailures(cursor.getConsecutiveFailures() + 1);
            cursor.setLastFailureAt(LocalDateTime.now());
            cursor.setLastError(OpsRules.sanitize(error));
            cursors.save(cursor);
        } catch (RuntimeException e) {
            log.warn("chain failure state skipped chain={} err={}", chainCode, OpsRules.sanitize(e));
        }
    }
}
