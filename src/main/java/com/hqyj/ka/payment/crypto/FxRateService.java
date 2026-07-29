package com.hqyj.ka.payment.crypto;

import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.sysconfig.service.ConfigService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * USD → 站点币种汇率自动刷新(默认每小时,免费接口 open.er-api.com,无需 API Key)。
 * 失败降级:保留上次成功值(初始值 = 配置的 ka.crypto.fx-rate);
 * CNY 合理性校验:超出 [3, 15] 区间视为脏数据丢弃,防止上游异常导致定价崩坏。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FxRateService {

    private static final BigDecimal MIN_SANE = new BigDecimal("3");
    private static final BigDecimal MAX_SANE = new BigDecimal("15");
    private static final Map<String, BigDecimal> FALLBACK_USD_RATES = Map.of(
            "USD", BigDecimal.ONE,
            "CNY", new BigDecimal("7.20"),
            "EUR", new BigDecimal("0.92"),
            "GBP", new BigDecimal("0.78"),
            "JPY", new BigDecimal("155"),
            "CHF", new BigDecimal("0.90"),
            "HKD", new BigDecimal("7.80"),
            "TWD", new BigDecimal("32.0"),
            "SGD", new BigDecimal("1.34"));

    private final AppProperties props;
    private final ConfigService configService;
    private final JsonMapper jsonMapper;
    private final RestClient restClient = RestClient.create();

    private volatile BigDecimal rate;
    private final Map<String, BigDecimal> usdRates = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        rate = props.getCrypto().getFxRate();
        usdRates.putAll(FALLBACK_USD_RATES);
        usdRates.put("CNY", rate);
    }

    /** 当前生效汇率(1 USD = rate CNY)。 */
    public BigDecimal getRate() {
        return rate;
    }

    public String siteCurrency() {
        return configCurrency();
    }

    public String symbol(String currency) {
        return switch (normalize(currency)) {
            case "USD" -> "$";
            case "EUR" -> "€";
            case "GBP" -> "£";
            case "JPY" -> "¥";
            case "CHF" -> "CHF";
            case "HKD" -> "HK$";
            case "TWD" -> "NT$";
            case "SGD" -> "S$";
            default -> "¥";
        };
    }

    /** 站点计价币种 → USD 稳定币金额。 */
    public BigDecimal siteToUsd(BigDecimal amount) {
        String currency = siteCurrency();
        BigDecimal usdToCurrency = rate(currency);
        return amount.divide(usdToCurrency, 2, RoundingMode.UP);
    }

    /** 站点计价币种 → CNY 网关收款金额(支付宝/易支付使用)。 */
    public BigDecimal siteToCny(BigDecimal amount) {
        String currency = siteCurrency();
        if ("CNY".equals(currency)) return amount.setScale(2, RoundingMode.HALF_UP);
        return amount.divide(rate(currency), 8, RoundingMode.HALF_UP)
                .multiply(rate("CNY"))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /** 站点计价币种 → 指定收款币种(Stripe 等多币种网关使用)。 */
    public BigDecimal siteTo(BigDecimal amount, String targetCurrency) {
        String source = siteCurrency();
        String target = normalize(targetCurrency);
        if (source.equals(target)) return amount.setScale("JPY".equals(target) ? 0 : 2, RoundingMode.HALF_UP);
        return amount.divide(rate(source), 8, RoundingMode.HALF_UP)
                .multiply(rate(target))
                .setScale("JPY".equals(target) ? 0 : 2, RoundingMode.HALF_UP);
    }

    private BigDecimal rate(String currency) {
        String c = normalize(currency);
        return usdRates.getOrDefault(c, FALLBACK_USD_RATES.getOrDefault(c, BigDecimal.ONE));
    }

    @Scheduled(initialDelayString = "15000", fixedDelayString = "${ka.crypto.fx-refresh-ms:3600000}")
    public void refresh() {
        if (!props.getCrypto().isFxAutoRefresh()) return;
        try {
            String body = restClient.get().uri(props.getCrypto().getFxRateUrl())
                    .retrieve().body(String.class);
            JsonNode rates = jsonMapper.readTree(body).path("rates");
            JsonNode cny = rates.path("CNY");
            if (!cny.isNumber()) {
                log.warn("fx refresh: unexpected payload, keep rate {}", rate);
                return;
            }
            BigDecimal fetched = new BigDecimal(cny.asText()).setScale(4, RoundingMode.HALF_UP);
            if (fetched.compareTo(MIN_SANE) < 0 || fetched.compareTo(MAX_SANE) > 0) {
                log.warn("fx refresh: insane rate {} rejected, keep {}", fetched, rate);
                return;
            }
            rate = fetched;
            usdRates.put("USD", BigDecimal.ONE);
            for (String code : supportedCurrencies()) {
                JsonNode n = rates.path(code);
                if (n.isNumber()) {
                    usdRates.put(code, new BigDecimal(n.asText()).setScale(6, RoundingMode.HALF_UP));
                }
            }
            usdRates.put("CNY", fetched);
            log.info("fx rate refreshed: 1 USD = {} CNY, site currency={}", fetched, siteCurrency());
        } catch (Exception e) {
            log.warn("fx refresh failed, keep rate {}: {}", rate, e.getMessage());
        }
    }

    private String configCurrency() {
        return normalize(configService.all().getOrDefault("site.currency", "CNY"));
    }

    private String normalize(String currency) {
        if (currency == null || currency.isBlank()) return "CNY";
        String c = currency.trim().toUpperCase();
        return supportedCurrencies().contains(c) ? c : "CNY";
    }

    private java.util.Set<String> supportedCurrencies() {
        return java.util.Set.of("CNY", "USD", "EUR", "GBP", "JPY", "CHF", "HKD", "TWD", "SGD");
    }
}
