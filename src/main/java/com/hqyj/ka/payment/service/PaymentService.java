package com.hqyj.ka.payment.service;

import tools.jackson.databind.json.JsonMapper;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.*;
import com.hqyj.ka.payment.entity.PaymentChannel;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentChannelRepository;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.payment.alipay.AlipayOfficialStrategy;
import com.hqyj.ka.payment.balance.BalancePaymentStrategy;
import com.hqyj.ka.payment.crypto.CryptoTransferStrategy;
import com.hqyj.ka.payment.crypto.CryptoWalletStrategy;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.payment.crypto.MerchantAddressProvider;
import com.hqyj.ka.payment.epay.EpayStrategy;
import com.hqyj.ka.payment.stripe.StripeStrategy;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.sysconfig.entity.SysConfig;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Base64;

/**
 * 支付编排:创建支付 → 策略执行;回调 → 验签 → 金额核对 → 幂等入账。
 * 入账双保险:订单状态 CAS + channelTradeNo 唯一约束。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentChannelRepository channelRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final OrderRepository orderRepository;
    private final SettlementService settlementService;
    private final PaymentStrategyRegistry registry;
    private final AppProperties props;
    private final FxRateService fxRateService;
    private final ConfigService configService;
    private final MerchantAddressProvider merchantAddressProvider;
    // Spring Boot 4 默认 Jackson 3(tools.jackson),注入自动装配的 JsonMapper
    private final JsonMapper jsonMapper;

    /** 前台可用渠道列表 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> enabledChannels() {
        return channelRepository.findByEnabledTrueOrderBySortOrderAsc().stream()
                .filter(this::isReady)
                .<Map<String, Object>>map(c -> {
                    Map<String, String> config = decryptConfig(c);
                    return Map.of("code", c.getCode(), "displayName", c.getDisplayName(),
                            "feeRate", feeRate(c.getCode(), config).toPlainString(),
                            "feeFixed", feeFixed(c.getCode(), config).toPlainString());
                })
                .toList();
    }

    public record FeeQuote(BigDecimal baseAmount, BigDecimal feeAmount, BigDecimal payAmount) {}

    public FeeQuote feeQuote(String channelCode, BigDecimal baseAmount) {
        PaymentChannel channel = channelRepository.findByCodeAndEnabledTrue(channelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHANNEL_DISABLED));
        return feeQuote(channelCode, baseAmount, decryptConfig(channel));
    }

    @Transactional
    public PayCreationResult create(String orderNo, String channelCode, PayContext ctx) {
        // 加密支付串行化同一订单的创建，避免双击在尚无意向记录时并发生成两笔不同金额。
        // 其他渠道可能包含外部网关调用，不额外持有订单行锁。
        var orderLookup = isCryptoChannel(channelCode)
                ? orderRepository.lockByOrderNo(orderNo) : orderRepository.findByOrderNo(orderNo);
        Order order = orderLookup
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getStatus() != Order.Status.PENDING) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID);
        }
        if (order.getExpireAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.ORDER_EXPIRED);
        }
        if (order.getMemberId() != null && (ctx.memberId() == null || !order.getMemberId().equals(ctx.memberId()))) {
            throw new BusinessException(ctx.memberId() == null ? ErrorCode.UNAUTHORIZED : ErrorCode.FORBIDDEN,
                    "请登录下单会员账号后支付该订单");
        }
        PaymentChannel channel = channelRepository.findByCodeAndEnabledTrue(channelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHANNEL_DISABLED));
        if (!isReady(channel)) {
            throw new BusinessException(ErrorCode.CHANNEL_DISABLED, "支付渠道配置不完整或格式无效");
        }

        Map<String, String> config = new HashMap<>(decryptConfig(channel));
        PaymentTransaction tx = transactionRepository.findFirstByOrderNoAndChannelCodeAndStatusOrderByIdDesc(
                orderNo, channelCode, PaymentTransaction.Status.CREATED).orElseGet(() -> {
            FeeQuote quote = feeQuote(channelCode, order.getAmount(), config);
            PaymentTransaction created = new PaymentTransaction();
            created.setOrderId(order.getId());
            created.setOrderNo(order.getOrderNo());
            created.setChannelCode(channelCode);
            created.setFeeAmount(quote.feeAmount());
            created.setAmount(isCnyGateway(channelCode)
                    ? fxRateService.siteToCny(quote.payAmount()) : quote.payAmount());
            return transactionRepository.save(created);
        });
        BigDecimal lockedFee = tx.getFeeAmount() == null ? BigDecimal.ZERO : tx.getFeeAmount();
        BigDecimal lockedSitePayAmount = order.getAmount().add(lockedFee).setScale(2, RoundingMode.HALF_UP);
        config.put("_sitePayAmount", lockedSitePayAmount.toPlainString());
        if (isCnyGateway(channelCode)) {
            // 锁定首次创建时的人民币金额,避免支付中途汇率刷新导致回调金额误判。
            config.put("_expectedAmount", tx.getAmount().toPlainString());
        }

        // 策略调用必须留在当前事务内。尤其余额支付依赖同一事务同时完成:
        // 扣钱包余额 -> 订单 CAS 标记 PAID -> 发卡/入账 -> 支付流水 SUCCESS。
        PayCreationResult result = registry.get(channelCode).create(order, config, ctx);
        if (BalancePaymentStrategy.CODE.equals(channelCode) && "BALANCE".equals(result.kind())) {
            tx.setStatus(PaymentTransaction.Status.SUCCESS);
            tx.setChannelTradeNo("BALANCE:" + order.getOrderNo());
            tx.setPaidAt(LocalDateTime.now());
        }
        return result;
    }

    /** 支付网关异步回调统一入口。返回应答报文体。 */
    @Transactional
    public String handleCallback(String channelCode, HttpServletRequest request) {
        // 停用只阻止新建支付,不能拒绝已经付款订单的延迟回调。
        PaymentChannel channel = channelRepository.findByCode(channelCode).orElse(null);
        if (channel == null) return "channel not found";

        CallbackResult result = registry.get(channelCode).handleCallback(request, decryptConfig(channel));
        if (!result.ok()) {
            log.warn("callback verify failed, channel={}", channelCode);
            return result.ack();
        }
        try {
            settlementService.settle(result.orderNo(), channelCode, result.channelTradeNo(), result.amount(), true);
        } catch (BusinessException e) {
            log.error("callback settle rejected: order={} reason={}", result.orderNo(), e.getMessage());
            return "fail";
        }
        return result.ack();
    }

    Map<String, String> decryptConfig(PaymentChannel channel) {
        if (channel.getConfigEnc() == null || channel.getConfigEnc().isBlank()) return Map.of();
        try {
            String json = AesGcmUtil.decrypt(channel.getConfigEnc(), props.getSecurity().aesKeyBytes());
            Map<?, ?> raw = jsonMapper.readValue(json, Map.class);
            Map<String, String> config = new java.util.HashMap<>();
            raw.forEach((k, v) -> config.put(String.valueOf(k), v == null ? "" : String.valueOf(v)));
            return config;
        } catch (Exception e) {
            log.error("channel config decrypt failed: {}", channel.getCode());
            throw new BusinessException(ErrorCode.CHANNEL_DISABLED);
        }
    }

    /** 管理端保存渠道配置:JSON 明文入参 → AES 加密落库。 */
    @Transactional
    public void saveChannelConfig(Long channelId, String displayName, Boolean enabled, Integer sortOrder,
                                  String configJson, Map<String, String> configPatch) {
        PaymentChannel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        Map<String, String> config = new HashMap<>(decryptConfig(channel));
        if (configJson != null && !configJson.isBlank()) {
            try {
                Map<?, ?> raw = jsonMapper.readValue(configJson, Map.class);
                config.clear();
                raw.forEach((k, v) -> config.put(String.valueOf(k), v == null ? "" : String.valueOf(v)));
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "配置必须是合法 JSON");
            }
        }
        if (configPatch != null) mergeConfigPatch(channel.getCode(), config, configPatch);
        boolean configChanged = (configJson != null && !configJson.isBlank()) || (configPatch != null && !configPatch.isEmpty());
        if (configChanged || Boolean.TRUE.equals(enabled) || (enabled == null && channel.isEnabled())) {
            validateConfig(channel.getCode(), config);
        }
        if (displayName != null && !displayName.isBlank()) channel.setDisplayName(displayName.strip());
        if (enabled != null) channel.setEnabled(enabled);
        if (sortOrder != null) channel.setSortOrder(sortOrder);
        if (configChanged) {
            try {
                channel.setConfigEnc(AesGcmUtil.encrypt(jsonMapper.writeValueAsString(config), props.getSecurity().aesKeyBytes()));
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR);
            }
            if (isCryptoChannel(channel.getCode()) && has(config, "merchantAddress")) {
                configService.saveAll(List.of(new SysConfig(MerchantAddressProvider.CONFIG_KEY,
                        config.get("merchantAddress").toLowerCase())));
            }
        }
    }

    @Transactional(readOnly = true)
    public List<PaymentChannel> allChannels() {
        return channelRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder", "id"));
    }

    /** 老库升级兜底:打开支付渠道页时也补齐内置渠道,不只依赖应用启动种子。 */
    @Transactional
    public List<PaymentChannel> allChannelsEnsured() {
        seedChannel(AlipayOfficialStrategy.CODE, "支付宝", 1, false);
        seedChannel(EpayStrategy.CODE, "支付宝(聚合)", 2, false);
        seedChannel(CryptoTransferStrategy.CODE, "USDT/USDC 转账", 3, false);
        seedChannel(CryptoWalletStrategy.CODE, "连接钱包支付", 4, false);
        seedChannel(StripeStrategy.CODE, "信用卡支付", 5, false);
        seedChannel(BalancePaymentStrategy.CODE, "余额支付", 6, true);
        return allChannels();
    }

    public record AdminChannelView(Long id, String code, String displayName, boolean enabled, int sortOrder,
                                   boolean configured, boolean ready, List<String> missingFields, String validationError,
                                   Map<String, String> config, Map<String, Boolean> secrets) {}

    @Transactional
    public List<AdminChannelView> adminChannelViewsEnsured() {
        allChannelsEnsured();
        return allChannels().stream().map(this::toAdminView).toList();
    }

    private AdminChannelView toAdminView(PaymentChannel channel) {
        Map<String, String> config;
        try {
            config = new HashMap<>(decryptConfig(channel));
        } catch (BusinessException e) {
            config = new HashMap<>();
        }
        if (isCryptoChannel(channel.getCode())) config.put("merchantAddress", merchantAddressProvider.current());
        addDisplayDefaults(channel.getCode(), config);
        List<String> missing = missingFields(channel.getCode(), config);
        String validationError = null;
        if (missing.isEmpty()) {
            try {
                validateConfig(channel.getCode(), new HashMap<>(config));
            } catch (BusinessException e) {
                validationError = e.getMessage();
            }
        }
        Map<String, Boolean> secrets = new LinkedHashMap<>();
        for (String key : secretKeys(channel.getCode())) {
            secrets.put(key, has(config, key));
        }
        Map<String, String> visible = new LinkedHashMap<>();
        for (String key : publicKeys(channel.getCode())) {
            if (has(config, key)) visible.put(key, config.get(key));
        }
        return new AdminChannelView(channel.getId(), channel.getCode(), channel.getDisplayName(), channel.isEnabled(),
                channel.getSortOrder(), channel.getConfigEnc() != null && !channel.getConfigEnc().isBlank(),
                missing.isEmpty() && validationError == null, missing, validationError, visible, secrets);
    }

    private boolean isReady(PaymentChannel channel) {
        try {
            Map<String, String> config = new HashMap<>(decryptConfig(channel));
            if (isCryptoChannel(channel.getCode())) config.put("merchantAddress", merchantAddressProvider.current());
            addDisplayDefaults(channel.getCode(), config);
            validateConfig(channel.getCode(), config);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private List<String> missingFields(String code, Map<String, String> config) {
        List<String> required = switch (code) {
            case AlipayOfficialStrategy.CODE -> List.of("appId", "sellerId", "privateKey", "alipayPublicKey", "notifyUrl");
            case EpayStrategy.CODE -> List.of("gateway", "pid", "key", "notifyUrl", "payType");
            case StripeStrategy.CODE -> List.of("secretKey", "webhookSecret", "currency");
            case CryptoTransferStrategy.CODE, CryptoWalletStrategy.CODE -> List.of("merchantAddress");
            default -> List.of();
        };
        return required.stream().filter(key -> !has(config, key)).toList();
    }

    private void addDisplayDefaults(String code, Map<String, String> config) {
        if (AlipayOfficialStrategy.CODE.equals(code)) {
            config.putIfAbsent("mode", "qr");
            config.putIfAbsent("gateway", "https://openapi.alipay.com/gateway.do");
        }
        if (EpayStrategy.CODE.equals(code)) config.putIfAbsent("payType", "alipay");
        if (StripeStrategy.CODE.equals(code)) config.putIfAbsent("currency", fxRateService.siteCurrency());
        if (isCryptoChannel(code)) config.putIfAbsent("merchantAddress", merchantAddressProvider.current());
        if (!config.containsKey("notifyUrl") && (AlipayOfficialStrategy.CODE.equals(code) || EpayStrategy.CODE.equals(code))) {
            String siteUrl = configService.all().get("site.url");
            if (siteUrl != null && !siteUrl.isBlank()) {
                config.put("notifyUrl", siteUrl.replaceAll("/+$", "") + "/api/pay/notify/" + code);
            }
        }
    }

    private void mergeConfigPatch(String code, Map<String, String> current, Map<String, String> patch) {
        Set<String> allowed = new java.util.HashSet<>(publicKeys(code));
        allowed.addAll(secretKeys(code));
        for (Map.Entry<String, String> entry : patch.entrySet()) {
            if (!allowed.contains(entry.getKey())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的渠道配置项:" + entry.getKey());
            }
            String value = entry.getValue() == null ? "" : entry.getValue().strip();
            if (secretKeys(code).contains(entry.getKey()) && value.isBlank()) continue; // 密钥留空=保留旧值
            if (value.isBlank()) current.remove(entry.getKey());
            else current.put(entry.getKey(), value);
        }
    }

    private void validateConfig(String code, Map<String, String> config) {
        addDisplayDefaults(code, config);
        validateFee(code, config);
        List<String> missing = missingFields(code, config);
        if (!missing.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "支付配置缺少:" + String.join(", ", missing));
        }
        if (AlipayOfficialStrategy.CODE.equals(code)) {
            if (!config.get("appId").matches("\\d{10,32}")) bad("支付宝 AppID 格式不正确");
            if (!config.get("sellerId").matches("\\d{16,32}")) bad("支付宝账号 PID(seller_id)格式不正确");
            if (!Set.of("qr", "page").contains(config.get("mode"))) bad("支付宝支付模式只能是 qr 或 page");
            validateUrl(config.get("gateway"), "支付宝网关地址");
            validateUrl(config.get("notifyUrl"), "支付宝异步通知地址");
            if (has(config, "returnUrl")) validateUrlTemplate(config.get("returnUrl"), "支付宝同步返回地址");
            try {
                KeyFactory factory = KeyFactory.getInstance("RSA");
                var privateKey = factory.generatePrivate(new PKCS8EncodedKeySpec(decodePem(config.get("privateKey"))));
                factory.generatePublic(new X509EncodedKeySpec(decodePem(config.get("alipayPublicKey"))));
                Signature signature = Signature.getInstance("SHA256withRSA");
                signature.initSign(privateKey);
                signature.update("ka-payment-config-check".getBytes(StandardCharsets.UTF_8));
                signature.sign();
            } catch (Exception e) {
                bad("支付宝应用私钥或支付宝公钥格式不正确");
            }
        }
        if (EpayStrategy.CODE.equals(code)) {
            validateUrl(config.get("gateway"), "易支付网关地址");
            validateUrl(config.get("notifyUrl"), "易支付异步通知地址");
            if (has(config, "returnUrl")) validateUrlTemplate(config.get("returnUrl"), "易支付同步返回地址");
        }
        if (StripeStrategy.CODE.equals(code)) {
            if (!config.get("secretKey").startsWith("sk_")) bad("Stripe Secret Key 格式不正确");
            if (!config.get("webhookSecret").startsWith("whsec_")) bad("Stripe Webhook Secret 格式不正确");
            if (!config.get("currency").matches("[A-Za-z]{3}")) bad("Stripe 币种必须是三位字母代码");
            if (has(config, "successUrl")) validateUrlTemplate(config.get("successUrl"), "Stripe 成功返回地址");
            if (has(config, "cancelUrl")) validateUrlTemplate(config.get("cancelUrl"), "Stripe 取消返回地址");
        }
        if (isCryptoChannel(code)) {
            String address = config.get("merchantAddress");
            if (!address.matches("(?i)^0x[0-9a-f]{40}$")
                    || address.equalsIgnoreCase("0x0000000000000000000000000000000000000000")) {
                bad("EVM 收款地址格式不正确");
            }
        }
    }

    private List<String> publicKeys(String code) {
        List<String> keys = switch (code) {
            case AlipayOfficialStrategy.CODE -> List.of("appId", "sellerId", "mode", "gateway", "notifyUrl", "returnUrl");
            case EpayStrategy.CODE -> List.of("gateway", "pid", "notifyUrl", "returnUrl", "payType");
            case StripeStrategy.CODE -> List.of("currency", "successUrl", "cancelUrl");
            case CryptoTransferStrategy.CODE, CryptoWalletStrategy.CODE -> List.of("merchantAddress");
            default -> List.of();
        };
        if (BalancePaymentStrategy.CODE.equals(code)) return keys;
        java.util.ArrayList<String> withFee = new java.util.ArrayList<>(keys);
        withFee.add("feeRate");
        withFee.add("feeFixed");
        return withFee;
    }

    private FeeQuote feeQuote(String code, BigDecimal base, Map<String, String> config) {
        BigDecimal normalized = base.setScale(2, RoundingMode.HALF_UP);
        BigDecimal fee = normalized.multiply(feeRate(code, config))
                .divide(BigDecimal.valueOf(100), 8, RoundingMode.HALF_UP)
                .add(feeFixed(code, config)).setScale(2, RoundingMode.HALF_UP);
        return new FeeQuote(normalized, fee, normalized.add(fee));
    }

    private BigDecimal feeRate(String code, Map<String, String> config) {
        if (BalancePaymentStrategy.CODE.equals(code)) return BigDecimal.ZERO;
        return decimal(config.get("feeRate"), BigDecimal.ZERO);
    }

    private BigDecimal feeFixed(String code, Map<String, String> config) {
        if (BalancePaymentStrategy.CODE.equals(code)) return BigDecimal.ZERO;
        return decimal(config.get("feeFixed"), BigDecimal.ZERO);
    }

    private void validateFee(String code, Map<String, String> config) {
        if (BalancePaymentStrategy.CODE.equals(code)) return;
        BigDecimal rate = feeRate(code, config);
        BigDecimal fixed = feeFixed(code, config);
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.valueOf(100)) > 0 || rate.scale() > 4) {
            bad("手续费比例必须在 0–100% 之间,最多 4 位小数");
        }
        if (fixed.signum() < 0 || fixed.scale() > 2 || fixed.compareTo(BigDecimal.valueOf(1_000_000)) > 0) {
            bad("固定手续费必须为非负金额,最多 2 位小数");
        }
    }

    private BigDecimal decimal(String value, BigDecimal fallback) {
        if (value == null || value.isBlank()) return fallback;
        try { return new BigDecimal(value.trim()); }
        catch (NumberFormatException e) { bad("手续费配置必须是数字"); return fallback; }
    }

    private List<String> secretKeys(String code) {
        return switch (code) {
            case AlipayOfficialStrategy.CODE -> List.of("privateKey", "alipayPublicKey");
            case EpayStrategy.CODE -> List.of("key");
            case StripeStrategy.CODE -> List.of("secretKey", "webhookSecret");
            default -> List.of();
        };
    }

    private void validateUrl(String value, String label) {
        try {
            URI uri = URI.create(value);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) || uri.getHost() == null) bad(label + "格式不正确");
        } catch (IllegalArgumentException e) {
            bad(label + "格式不正确");
        }
    }

    private void validateUrlTemplate(String value, String label) {
        validateUrl(value.replace("{{orderNo}}", "TEST_ORDER"), label);
    }

    private byte[] decodePem(String key) {
        String base64 = key.replaceAll("-----BEGIN [^-]+-----", "")
                .replaceAll("-----END [^-]+-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(base64);
    }

    private void bad(String message) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, message);
    }

    private boolean has(Map<String, String> config, String key) {
        return config.get(key) != null && !config.get(key).isBlank();
    }

    private boolean isCnyGateway(String channelCode) {
        return AlipayOfficialStrategy.CODE.equals(channelCode) || EpayStrategy.CODE.equals(channelCode);
    }

    private boolean isCryptoChannel(String channelCode) {
        return CryptoTransferStrategy.CODE.equals(channelCode) || CryptoWalletStrategy.CODE.equals(channelCode);
    }

    private void seedChannel(String code, String name, int sort, boolean enabled) {
        channelRepository.findByCode(code).orElseGet(() -> {
            PaymentChannel channel = new PaymentChannel();
            channel.setCode(code);
            channel.setDisplayName(name);
            channel.setSortOrder(sort);
            channel.setEnabled(enabled);
            return channelRepository.save(channel);
        });
    }
}
