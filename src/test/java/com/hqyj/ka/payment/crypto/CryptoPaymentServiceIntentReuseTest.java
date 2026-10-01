package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import com.hqyj.ka.payment.crypto.repo.CryptoPaymentIntentRepository;
import com.hqyj.ka.payment.service.SettlementService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CryptoPaymentServiceIntentReuseTest {

    private static final String MERCHANT = "0x1111111111111111111111111111111111111111";
    private static final String BASE_USDC = "0x2222222222222222222222222222222222222222";
    private static final String POLYGON_USDC = "0x3333333333333333333333333333333333333333";

    private CryptoPaymentIntentRepository repository;
    private CryptoPaymentService service;
    private Order order;

    @BeforeEach
    void setUp() {
        repository = mock(CryptoPaymentIntentRepository.class);
        MerchantAddressProvider merchant = mock(MerchantAddressProvider.class);
        when(merchant.current()).thenReturn(MERCHANT);
        when(repository.findFirstByOrderNoAndStatusInOrderByIdDesc(any(), any())).thenReturn(Optional.empty());
        when(repository.findByOrderNoAndStatusOrderByIdDesc(any(), any())).thenReturn(List.of());
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AppProperties props = new AppProperties();
        ConfigService config = mock(ConfigService.class);
        when(config.all()).thenReturn(Map.of("site.currency", "CNY"));
        FxRateService fx = new FxRateService(props, config, JsonMapper.builder().build());
        fx.init();
        props.getCrypto().setIntentExpireMinutes(15);
        var bsc = chain("BSC", 56, POLYGON_USDC);
        bsc.getTokens().get(0).setSymbol("USDT");
        bsc.getTokens().get(0).setDecimals(18);
        props.getCrypto().setChains(List.of(
                chain("BASE", 8453, BASE_USDC),
                chain("POLYGON", 137, POLYGON_USDC), bsc));
        service = new CryptoPaymentService(repository, props, merchant,
                mock(ChainRpcClient.class), fx, mock(SettlementService.class));

        order = new Order();
        order.setId(9L);
        order.setOrderNo("KA-REUSE-1");
    }

    @Test
    void allThreeNetworksAndBothModesUseSameHalfPercentMarkup() {
        for (String chain : List.of("BASE", "POLYGON", "BSC")) {
            String token = "BSC".equals(chain) ? "USDT" : "USDC";
            int decimals = "BSC".equals(chain) ? 18 : 6;
            for (var mode : CryptoPaymentIntent.Mode.values()) {
                when(repository.findByOrderNoAndStatusOrderByIdDesc(any(), any())).thenReturn(List.of());
                var result = service.createIntent(order, new BigDecimal("72.00"), chain, token, mode);
                assertTrue(result.getAmountToken().compareTo(new BigDecimal("10.05")) > 0);
                assertTrue(result.getAmountToken().compareTo(new BigDecimal("10.06")) < 0);
                assertEquals(result.getAmountToken().movePointRight(decimals).toBigIntegerExact().toString(),
                        result.getAmountMinor());
                assertTrue(result.getAmountToken().stripTrailingZeros().scale() <= 6);
                when(repository.findByOrderNoAndStatusOrderByIdDesc(any(), any())).thenReturn(List.of(result));
                assertSame(result, service.createIntent(order, new BigDecimal("72.00"), chain, token, mode));
            }
        }
    }

    @Test
    void repeatedClickReusesSameUnexpiredIntentAndAmount() {
        CryptoPaymentIntent existing = intent("BASE", 8453, "USDC", BASE_USDC,
                CryptoPaymentIntent.Mode.TRANSFER, LocalDateTime.now().plusMinutes(10), "10001234");
        when(repository.findByOrderNoAndStatusOrderByIdDesc(order.getOrderNo(), CryptoPaymentIntent.Status.WAITING))
                .thenReturn(List.of(existing));

        CryptoPaymentIntent result = service.createIntent(order, new BigDecimal("72.00"),
                "BASE", "USDC", CryptoPaymentIntent.Mode.TRANSFER);

        assertSame(existing, result);
        assertEquals("10001234", result.getAmountMinor());
        verify(repository, never()).saveAndFlush(any(CryptoPaymentIntent.class));
    }

    @Test
    void switchingChainKeepsOldIntentSoSwitchingBackRestoresItsAmount() {
        CryptoPaymentIntent base = intent("BASE", 8453, "USDC", BASE_USDC,
                CryptoPaymentIntent.Mode.TRANSFER, LocalDateTime.now().plusMinutes(10), "10004567");
        when(repository.findByOrderNoAndStatusOrderByIdDesc(order.getOrderNo(), CryptoPaymentIntent.Status.WAITING))
                .thenReturn(List.of(base));

        CryptoPaymentIntent polygon = service.createIntent(order, new BigDecimal("72.00"),
                "POLYGON", "USDC", CryptoPaymentIntent.Mode.TRANSFER);
        assertNotSame(base, polygon);
        assertEquals(CryptoPaymentIntent.Status.WAITING, base.getStatus());
        assertNotNull(base.getUniqueKey());

        when(repository.findByOrderNoAndStatusOrderByIdDesc(order.getOrderNo(), CryptoPaymentIntent.Status.WAITING))
                .thenReturn(List.of(polygon, base));
        CryptoPaymentIntent switchedBack = service.createIntent(order, new BigDecimal("72.00"),
                "BASE", "USDC", CryptoPaymentIntent.Mode.TRANSFER);
        assertSame(base, switchedBack);
        assertEquals("10004567", switchedBack.getAmountMinor());
    }

    @Test
    void expiredIntentIsReleasedAndReplaced() {
        CryptoPaymentIntent expired = intent("BASE", 8453, "USDC", BASE_USDC,
                CryptoPaymentIntent.Mode.TRANSFER, LocalDateTime.now().minusSeconds(1), "10007890");
        when(repository.findByOrderNoAndStatusOrderByIdDesc(order.getOrderNo(), CryptoPaymentIntent.Status.WAITING))
                .thenReturn(List.of(expired));

        CryptoPaymentIntent replacement = service.createIntent(order, new BigDecimal("72.00"),
                "BASE", "USDC", CryptoPaymentIntent.Mode.TRANSFER);

        assertNotSame(expired, replacement);
        assertEquals(CryptoPaymentIntent.Status.EXPIRED, expired.getStatus());
        assertNull(expired.getUniqueKey());
        verify(repository).flush();
        verify(repository).saveAndFlush(any(CryptoPaymentIntent.class));
    }

    @Test
    void confirmingIntentPreventsAnyNewAmount() {
        CryptoPaymentIntent confirming = intent("BASE", 8453, "USDC", BASE_USDC,
                CryptoPaymentIntent.Mode.TRANSFER, LocalDateTime.now().plusMinutes(10), "10009999");
        confirming.setStatus(CryptoPaymentIntent.Status.CONFIRMING);
        when(repository.findFirstByOrderNoAndStatusInOrderByIdDesc(order.getOrderNo(),
                List.of(CryptoPaymentIntent.Status.CONFIRMING, CryptoPaymentIntent.Status.CONFIRMED)))
                .thenReturn(Optional.of(confirming));

        CryptoPaymentIntent result = service.createIntent(order, new BigDecimal("72.00"),
                "POLYGON", "USDC", CryptoPaymentIntent.Mode.WALLET);

        assertSame(confirming, result);
        verify(repository, never()).saveAndFlush(any(CryptoPaymentIntent.class));
    }

    @Test
    void pollingUsesCurrentlySelectedChainInsteadOfLatestOtherIntent() {
        CryptoPaymentIntent base = intent("BASE", 8453, "USDC", BASE_USDC,
                CryptoPaymentIntent.Mode.TRANSFER, LocalDateTime.now().plusMinutes(10), "10004567");
        when(repository.findFirstByOrderNoAndModeAndChainCodeIgnoreCaseAndTokenSymbolIgnoreCaseOrderByIdDesc(
                order.getOrderNo(), CryptoPaymentIntent.Mode.TRANSFER, "BASE", "USDC"))
                .thenReturn(Optional.of(base));

        var view = service.intentView(order.getOrderNo(), CryptoPaymentIntent.Mode.TRANSFER, "BASE", "USDC");

        assertEquals("BASE", view.get("chainCode"));
        assertEquals("10.004567", view.get("amount"));
    }

    private CryptoPaymentIntent intent(String chain, long chainId, String symbol, String contract,
                                       CryptoPaymentIntent.Mode mode, LocalDateTime expireAt, String amountMinor) {
        CryptoPaymentIntent intent = new CryptoPaymentIntent();
        intent.setOrderId(order.getId());
        intent.setOrderNo(order.getOrderNo());
        intent.setChainCode(chain);
        intent.setChainId(chainId);
        intent.setTokenSymbol(symbol);
        intent.setTokenContract(contract);
        intent.setDecimals(6);
        intent.setAmountMinor(amountMinor);
        intent.setAmountToken(new BigDecimal(amountMinor).movePointLeft(6));
        intent.setUniqueKey(CryptoPaymentService.uniqueKey(chain, contract, amountMinor));
        intent.setMode(mode);
        intent.setMerchantAddress(MERCHANT);
        intent.setExpireAt(expireAt);
        return intent;
    }

    private AppProperties.Chain chain(String code, long chainId, String contract) {
        AppProperties.Token token = new AppProperties.Token();
        token.setSymbol("USDC");
        token.setContract(contract);
        token.setDecimals(6);
        AppProperties.Chain chain = new AppProperties.Chain();
        chain.setCode(code);
        chain.setChainId(chainId);
        chain.setConfirmations(6);
        chain.setEnabled(true);
        chain.setTokens(List.of(token));
        return chain;
    }
}
