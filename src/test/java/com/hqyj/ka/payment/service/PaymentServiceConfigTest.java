package com.hqyj.ka.payment.service;

import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.PaymentStrategyRegistry;
import com.hqyj.ka.payment.alipay.AlipayOfficialStrategy;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.payment.crypto.MerchantAddressProvider;
import com.hqyj.ka.payment.entity.PaymentChannel;
import com.hqyj.ka.payment.repo.PaymentChannelRepository;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentServiceConfigTest {

    @Test
    void enabledChannelsHidesIncompleteConfiguration() {
        Fixture f = fixture();
        PaymentChannel channel = channel();
        channel.setEnabled(true);
        when(f.channelRepository.findByEnabledTrueOrderBySortOrderAsc()).thenReturn(List.of(channel));

        assertTrue(f.service.enabledChannels().isEmpty());
    }

    @Test
    void fieldPatchValidatesKeysEncryptsAndPreservesBlankSecrets() throws Exception {
        Fixture f = fixture();
        PaymentChannel channel = channel();
        when(f.channelRepository.findById(1L)).thenReturn(Optional.of(channel));

        KeyPair pair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
        String privateKey = Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded());
        String publicKey = Base64.getEncoder().encodeToString(pair.getPublic().getEncoded());
        Map<String, String> initial = Map.of(
                "appId", "2026000000000000",
                "sellerId", "2088000000000000",
                "privateKey", privateKey,
                "alipayPublicKey", publicKey,
                "mode", "qr",
                "gateway", "https://openapi.alipay.com/gateway.do",
                "notifyUrl", "https://shop.example.com/api/pay/notify/ALIPAY_OFFICIAL"
        );

        f.service.saveChannelConfig(1L, null, false, null, null, initial);
        assertNotNull(channel.getConfigEnc());

        f.service.saveChannelConfig(1L, null, false, null, null,
                Map.of("mode", "page", "privateKey", "", "alipayPublicKey", ""));

        String json = AesGcmUtil.decrypt(channel.getConfigEnc(), f.props.getSecurity().aesKeyBytes());
        Map<?, ?> saved = f.mapper.readValue(json, Map.class);
        assertEquals("page", saved.get("mode"));
        assertEquals(privateKey, saved.get("privateKey"));
        assertEquals(publicKey, saved.get("alipayPublicKey"));
    }

    @Test
    void calculatesConfiguredBuyerPaymentFee() throws Exception {
        Fixture f = fixture();
        PaymentChannel channel = channel();
        channel.setEnabled(true);
        when(f.channelRepository.findById(1L)).thenReturn(Optional.of(channel));
        when(f.channelRepository.findByCodeAndEnabledTrue(AlipayOfficialStrategy.CODE)).thenReturn(Optional.of(channel));

        KeyPair pair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
        f.service.saveChannelConfig(1L, null, false, null, null, Map.of(
                "appId", "2026000000000000", "sellerId", "2088000000000000",
                "privateKey", Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),
                "alipayPublicKey", Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),
                "notifyUrl", "https://shop.example.com/api/pay/notify/ALIPAY_OFFICIAL",
                "feeRate", "2.5", "feeFixed", "0.30"));

        var quote = f.service.feeQuote(AlipayOfficialStrategy.CODE, new java.math.BigDecimal("100.00"));
        assertEquals(new java.math.BigDecimal("2.80"), quote.feeAmount());
        assertEquals(new java.math.BigDecimal("102.80"), quote.payAmount());
    }

    private static PaymentChannel channel() {
        PaymentChannel channel = new PaymentChannel();
        channel.setId(1L);
        channel.setCode(AlipayOfficialStrategy.CODE);
        channel.setDisplayName("支付宝");
        return channel;
    }

    private static Fixture fixture() {
        PaymentChannelRepository channels = mock(PaymentChannelRepository.class);
        PaymentTransactionRepository transactions = mock(PaymentTransactionRepository.class);
        OrderRepository orders = mock(OrderRepository.class);
        SettlementService settlement = mock(SettlementService.class);
        PaymentStrategyRegistry registry = mock(PaymentStrategyRegistry.class);
        FxRateService fx = mock(FxRateService.class);
        ConfigService config = mock(ConfigService.class);
        MerchantAddressProvider merchantAddressProvider = mock(MerchantAddressProvider.class);
        when(fx.siteCurrency()).thenReturn("CNY");
        when(config.all()).thenReturn(Map.of("site.url", "https://shop.example.com"));

        AppProperties props = new AppProperties();
        props.getSecurity().setAesKey(Base64.getEncoder().encodeToString(new byte[32]));
        props.getCrypto().setMerchantAddress("0x1111111111111111111111111111111111111111");
        JsonMapper mapper = JsonMapper.builder().build();
        PaymentService service = new PaymentService(channels, transactions, orders, settlement, registry,
                props, fx, config, merchantAddressProvider, mapper);
        return new Fixture(service, channels, props, mapper);
    }

    private record Fixture(PaymentService service, PaymentChannelRepository channelRepository,
                           AppProperties props, JsonMapper mapper) {}
}
