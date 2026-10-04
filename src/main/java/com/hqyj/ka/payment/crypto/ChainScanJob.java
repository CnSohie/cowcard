package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.monitor.ChainCursorMonitor;
import com.hqyj.ka.monitor.JobTracker;
import com.hqyj.ka.observability.OpsRules;
import com.hqyj.ka.observability.OpsSignals;
import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.ChainCursorRepository;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 链上扫描调度(单线程,三链串行,常态 CPU <1%):
 *  1) 从游标续扫 Transfer(to=商户) 事件 → 金额指纹匹配意向单
 *  2) CONFIRMING 意向更新确认数,达标入账
 *  3) 过期意向释放金额额度
 * 游标持久化,宕机重启不漏账;确认数达标才入账,天然抵御区块回滚。
 * 多节点部署时此任务需加分布式锁(ShedLock,升级点)。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChainScanJob {

    private final AppProperties props;
    private final ChainRpcClient rpc;
    private final ChainCursorRepository cursorRepository;
    private final CryptoPaymentIntentRepository intentRepository;
    private final CryptoPaymentService cryptoPaymentService;
    private final OpsSignals opsSignals;
    private final JobTracker jobTracker;
    private final ChainCursorMonitor cursorMonitor;

    @Scheduled(fixedDelayString = "${ka.crypto.scan-interval-ms:15000}")
    public void scan() {
        cryptoPaymentService.expireStaleIntents();
        for (AppProperties.Chain chain : props.getCrypto().getChains()) {
            if (!chain.isEnabled()) continue;
            jobTracker.begin(JobTracker.chain(chain.getCode()));
            try {
                scanChain(chain);
                jobTracker.success(JobTracker.chain(chain.getCode()));
            } catch (Exception e) {
                // 脱敏后的类型+摘要,避免异常里的 URL 把密钥打进日志;指标只记链名
                log.warn("chain scan failed, will retry next round. chain={} err={}", chain.getCode(), OpsRules.sanitize(e));
                opsSignals.scanFailed(chain.getCode(), e);
                jobTracker.failure(JobTracker.chain(chain.getCode()), e);
                try {
                    cursorMonitor.markFailure(chain.getCode(), e);
                } catch (RuntimeException ignored) {
                    log.warn("chain failure state skipped chain={}", chain.getCode());
                }
            }
        }
    }

    private void scanChain(AppProperties.Chain chain) {
        long latest = rpc.latestBlock(chain);

        // 等待中意向与 24h 内过期意向都要扫描:后者用于捞回超时后才上链的迟到付款。
        List<CryptoPaymentIntent> waiting = intentRepository.findByChainCodeAndStatus(chain.getCode(),
                CryptoPaymentIntent.Status.WAITING);
        List<CryptoPaymentIntent> scanTargets = new ArrayList<>(waiting);
        scanTargets.addAll(intentRepository
                .findTop200ByChainCodeAndStatusAndExpireAtAfterAndTxHashIsNullOrderByIdDesc(
                        chain.getCode(), CryptoPaymentIntent.Status.EXPIRED, LocalDateTime.now().minusHours(24)));
        List<CryptoPaymentIntent> confirming = intentRepository.findByChainCodeAndStatus(chain.getCode(),
                CryptoPaymentIntent.Status.CONFIRMING);

        long scanned;
        if (!scanTargets.isEmpty()) {
            ChainCursor cursor = cursorRepository.findById(chain.getCode())
                    .orElseGet(() -> new ChainCursor(chain.getCode(), latest - 1));
            long from = cursor.getScannedBlock() + 1;
            if (from <= latest) {
                long to = Math.min(latest, from + props.getCrypto().getMaxBlockRange() - 1L);
                List<String> contracts = chain.getTokens().stream()
                        .map(t -> t.getContract().toLowerCase()).toList();
                // 按意向单快照地址扫描:后台换收款地址后,旧订单仍能在原地址正常入账。
                for (String merchant : scanTargets.stream().map(CryptoPaymentIntent::getMerchantAddress).distinct().toList()) {
                    for (ChainRpcClient.TransferLog tl : rpc.transferLogsTo(chain, contracts, merchant, from, to)) {
                        cryptoPaymentService.onTransferDetected(chain.getCode(), tl.contract(), tl.txHash(),
                                tl.blockNumber(), tl.value());
                    }
                }
                cursor.setScannedBlock(to);
                cursorRepository.save(cursor);
                scanned = to;
            } else {
                scanned = cursor.getScannedBlock();
            }
        } else {
            // 无等待意向:沿用已有游标推进到最新,避免把成功时间和连续失败清掉
            ChainCursor cursor = cursorRepository.findById(chain.getCode())
                    .orElseGet(() -> new ChainCursor(chain.getCode(), latest));
            cursor.setScannedBlock(latest);
            cursorRepository.save(cursor);
            scanned = latest;
        }

        for (CryptoPaymentIntent intent : confirming) {
            cryptoPaymentService.settleIfConfirmed(intent.getId(), latest);
        }
        // 确认数也处理完才记成功。页面和告警只读这里写下的时间和落后块数,刷新不再打 RPC。
        ChainCursor saved = cursorRepository.findById(chain.getCode()).orElse(null);
        if (saved != null) {
            cursorMonitor.markSuccess(saved, Math.max(0L, latest - scanned));
            cursorRepository.save(saved);
        }
        opsSignals.scanOk(chain.getCode(), Math.max(0L, latest - scanned));
    }
}
