package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.ChainCursorRepository;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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

    @Scheduled(fixedDelayString = "${ka.crypto.scan-interval-ms:15000}")
    public void scan() {
        cryptoPaymentService.expireStaleIntents();
        for (AppProperties.Chain chain : props.getCrypto().getChains()) {
            if (!chain.isEnabled()) continue;
            try {
                scanChain(chain);
            } catch (Exception e) {
                // e.toString() 而非 getMessage():NPE 等无消息异常也能看到类型,避免出现 err=null 的盲区
                log.warn("chain scan failed, will retry next round. chain={} err={}", chain.getCode(), e.toString());
            }
        }
    }

    private void scanChain(AppProperties.Chain chain) {
        String merchant = props.getCrypto().getMerchantAddress();
        if (merchant == null || merchant.isBlank()) return;

        long latest = rpc.latestBlock(chain);

        // 有等待中/确认中的意向才扫描日志,空闲期只留一次 blockNumber 轮询
        boolean hasWaiting = !intentRepository.findByChainCodeAndStatus(chain.getCode(),
                CryptoPaymentIntent.Status.WAITING).isEmpty();
        List<CryptoPaymentIntent> confirming = intentRepository.findByChainCodeAndStatus(chain.getCode(),
                CryptoPaymentIntent.Status.CONFIRMING);

        if (hasWaiting) {
            ChainCursor cursor = cursorRepository.findById(chain.getCode())
                    .orElseGet(() -> new ChainCursor(chain.getCode(), latest - 1));
            long from = cursor.getScannedBlock() + 1;
            if (from <= latest) {
                long to = Math.min(latest, from + props.getCrypto().getMaxBlockRange() - 1L);
                List<String> contracts = chain.getTokens().stream()
                        .map(t -> t.getContract().toLowerCase()).toList();
                for (ChainRpcClient.TransferLog tl : rpc.transferLogsTo(chain, contracts, merchant, from, to)) {
                    cryptoPaymentService.onTransferDetected(chain.getCode(), tl.contract(), tl.txHash(),
                            tl.blockNumber(), tl.value());
                }
                cursor.setScannedBlock(to);
                cursorRepository.save(cursor);
            }
        } else {
            // 无等待意向:游标直接推进到最新,避免下次大区间补扫
            cursorRepository.save(new ChainCursor(chain.getCode(), latest));
        }

        for (CryptoPaymentIntent intent : confirming) {
            cryptoPaymentService.settleIfConfirmed(intent.getId(), latest);
        }
    }
}
