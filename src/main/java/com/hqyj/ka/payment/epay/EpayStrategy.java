package com.hqyj.ka.payment.epay;

import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.payment.CallbackResult;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.PayCreationResult;
import com.hqyj.ka.payment.PaymentStrategy;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;

/**
 * 易支付(Epay)协议适配器:兼容主流聚合支付平台的支付宝通道。
 * config:gateway(如 https://pay.example.com), pid, key, notifyUrl, returnUrl, payType(默认 alipay)
 * 协议:参数 ASCII 升序拼接 + 商户密钥 → MD5 小写;notify 同规则验签。
 * 注意:MD5 为协议规定,安全性依赖 key 保密与服务端金额核对,勿用于其他场景。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EpayStrategy implements PaymentStrategy {

    public static final String CODE = "EPAY";

    private final FxRateService fxRateService;
    private final ConfigService configService;

    @Override
    public String channelCode() { return CODE; }

    @Override
    public PayCreationResult create(Order order, Map<String, String> config, PayContext ctx) {
        Map<String, String> params = new TreeMap<>();
        params.put("pid", config.get("pid"));
        params.put("type", config.getOrDefault("payType", "alipay"));
        params.put("out_trade_no", order.getOrderNo());
        params.put("notify_url", notifyUrl(config));
        params.put("return_url", returnUrl(order, config, ctx));
        params.put("name", order.getProductName());
        params.put("money", config.getOrDefault("_expectedAmount", fxRateService.siteToCny(order.getAmount()).toPlainString()));
        String sign = md5Sign(params, config.get("key"));

        String gateway = config.get("gateway").replaceAll("/+$", "");
        StringBuilder url = new StringBuilder(gateway);
        if (url.indexOf("?") >= 0) url.append('&');
        else if (gateway.endsWith("/submit.php")) url.append('?');
        else url.append("/submit.php?");
        params.forEach((k, v) -> url.append(k).append('=')
                .append(URLEncoder.encode(v, StandardCharsets.UTF_8)).append('&'));
        url.append("sign=").append(sign).append("&sign_type=MD5");
        return PayCreationResult.redirect(url.toString());
    }

    @Override
    public CallbackResult handleCallback(HttpServletRequest request, Map<String, String> config) {
        Map<String, String> params = new HashMap<>();
        request.getParameterMap().forEach((k, v) -> params.put(k, String.join(",", v)));

        try {
            String givenSign = params.get("sign");
            String expectedSign = md5Sign(params, config.get("key"));
            if (givenSign == null || !MessageDigest.isEqual(
                    givenSign.toLowerCase().getBytes(StandardCharsets.US_ASCII),
                    expectedSign.getBytes(StandardCharsets.US_ASCII))) {
                return CallbackResult.fail("fail");
            }
            if (!config.get("pid").equals(params.get("pid"))) return CallbackResult.fail("fail");
            if (!"TRADE_SUCCESS".equals(params.get("trade_status"))) return CallbackResult.fail("success");
            String orderNo = params.get("out_trade_no");
            String tradeNo = params.get("trade_no");
            String amount = params.get("money");
            if (orderNo == null || orderNo.isBlank() || tradeNo == null || tradeNo.isBlank() || amount == null) {
                return CallbackResult.fail("fail");
            }
            return CallbackResult.success(orderNo, tradeNo, new BigDecimal(amount), "success");
        } catch (RuntimeException e) {
            log.warn("epay callback parse failed: {}", e.getMessage());
            return CallbackResult.fail("fail");
        }
    }

    /** ASCII 升序,跳过 sign/sign_type/空值,k=v&…&key → md5 小写 */
    static String md5Sign(Map<String, String> params, String key) {
        String joined = joinForSign(params);
        if (joined.isEmpty() || key == null || key.isBlank()) return "";
        return md5(joined + key);
    }

    static String joinForSign(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        new TreeMap<>(params).forEach((k, v) -> {
            if (k.equals("sign") || k.equals("sign_type") || v == null || v.isEmpty()) return;
            sb.append(k).append('=').append(v).append('&');
        });
        if (sb.length() == 0) return "";
        sb.setLength(sb.length() - 1);
        return sb.toString();
    }

    static String md5(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String returnUrl(Order order, Map<String, String> config, PayContext ctx) {
        String tpl = config.get("returnUrl");
        if (tpl == null || tpl.isBlank()) {
            String siteUrl = configService.all().get("site.url");
            String base = (siteUrl == null || siteUrl.isBlank()) ? safeBase(ctx.extra("returnBase")) : siteUrl;
            if (base == null || base.isBlank()) return config.getOrDefault("notifyUrl", "");
            tpl = base.replaceAll("/+$", "") + "/pay/{{orderNo}}";
        }
        return tpl.replace("{{orderNo}}", order.getOrderNo());
    }

    private String notifyUrl(Map<String, String> config) {
        String configured = config.get("notifyUrl");
        if (configured != null && !configured.isBlank()) return configured;
        String siteUrl = configService.all().get("site.url");
        if (siteUrl == null || siteUrl.isBlank()) return "";
        return siteUrl.replaceAll("/+$", "") + "/api/pay/notify/" + CODE;
    }

    private String safeBase(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            URI uri = URI.create(raw.trim());
            if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (uri.getHost() == null) return null;
            String siteUrl = configService.all().get("site.url");
            if (siteUrl != null && !siteUrl.isBlank()) {
                URI allowed = URI.create(siteUrl.trim());
                if (!uri.getScheme().equalsIgnoreCase(allowed.getScheme())
                        || !uri.getHost().equalsIgnoreCase(allowed.getHost())
                        || uri.getPort() != allowed.getPort()) return null;
            } else if (!("localhost".equalsIgnoreCase(uri.getHost())
                    || "127.0.0.1".equals(uri.getHost())
                    || "[::1]".equals(uri.getHost()))) return null;
            return uri.getScheme() + "://" + uri.getAuthority();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
