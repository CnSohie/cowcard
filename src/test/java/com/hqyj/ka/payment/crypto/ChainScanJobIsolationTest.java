package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.monitor.ChainCursorMonitor;
import com.hqyj.ka.monitor.JobTracker;
import com.hqyj.ka.observability.OpsSignals;
import com.hqyj.ka.payment.crypto.entity.ChainCursor;
import com.hqyj.ka.payment.crypto.repo.ChainCursorRepository;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChainScanJobIsolationTest {

    @Test
    void oneChainFailureDoesNotStopTheNextOrEscapeTheScheduler() {
        AppProperties props = props(chain("BASE"), chain("POLYGON"));
        ChainRpcClient rpc = mock(ChainRpcClient.class);
        ChainCursorRepository cursors = mock(ChainCursorRepository.class);
        CryptoPaymentIntentRepository intents = mock(CryptoPaymentIntentRepository.class);
        CryptoPaymentService payments = mock(CryptoPaymentService.class);
        OpsSignals signals = mock(OpsSignals.class);
        ChainCursorMonitor monitor = mock(ChainCursorMonitor.class);
        when(rpc.latestBlock(any())).thenAnswer(invocation -> {
            AppProperties.Chain chain = invocation.getArgument(0);
            if ("BASE".equals(chain.getCode())) throw new IllegalStateException("rpc down");
            return 20L;
        });
        when(intents.findByChainCodeAndStatus(anyString(), any())).thenReturn(List.of());
        when(intents.findTop200ByChainCodeAndStatusAndExpireAtAfterAndTxHashIsNullOrderByIdDesc(anyString(), any(), any()))
                .thenReturn(List.of());
        when(cursors.findById(anyString())).thenReturn(Optional.empty());
        when(cursors.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(new RuntimeException("cursor db")).when(monitor).markFailure(anyString(), any());

        ChainScanJob job = new ChainScanJob(props, rpc, cursors, intents, payments, signals, new JobTracker(), monitor);
        job.scan();

        verify(payments).expireStaleIntents();
        verify(signals).scanFailed(org.mockito.ArgumentMatchers.eq("BASE"), any());
        verify(signals, never()).scanFailed(org.mockito.ArgumentMatchers.eq("POLYGON"), any());
        verify(signals).scanOk("POLYGON", 0L);
    }

    @Test
    void successKeepsCursorHeightAndClearsConsecutiveFailures() {
        AppProperties props = props(chain("BASE"));
        ChainRpcClient rpc = mock(ChainRpcClient.class);
        ChainCursorRepository cursors = mock(ChainCursorRepository.class);
        CryptoPaymentIntentRepository intents = mock(CryptoPaymentIntentRepository.class);
        ChainCursor cursor = new ChainCursor("BASE", 10);
        cursor.setConsecutiveFailures(4);
        when(rpc.latestBlock(any())).thenReturn(15L);
        when(intents.findByChainCodeAndStatus(anyString(), any())).thenReturn(List.of());
        when(intents.findTop200ByChainCodeAndStatusAndExpireAtAfterAndTxHashIsNullOrderByIdDesc(anyString(), any(), any()))
                .thenReturn(List.of());
        when(cursors.findById("BASE")).thenReturn(Optional.of(cursor));
        when(cursors.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChainScanJob job = new ChainScanJob(props, rpc, cursors, intents, mock(CryptoPaymentService.class),
                mock(OpsSignals.class), new JobTracker(), new ChainCursorMonitor(cursors));
        job.scan();

        assertEquals(15L, cursor.getScannedBlock());
        assertEquals(0, cursor.getConsecutiveFailures());
        assertEquals(0L, cursor.getLastBlockLag());
        assertNotNull(cursor.getLastSuccessAt());
    }

    private static AppProperties props(AppProperties.Chain... chains) {
        AppProperties props = new AppProperties();
        props.getCrypto().setChains(List.of(chains));
        return props;
    }

    private static AppProperties.Chain chain(String code) {
        AppProperties.Chain chain = new AppProperties.Chain();
        chain.setCode(code);
        chain.setEnabled(true);
        return chain;
    }
}
