package com.hqyj.ka.payment.stripe;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
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
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Stripe Checkout 信用卡支付。
 * config: secretKey, webhookSecret, currency(可选,默认站点币种), successUrl/cancelUrl(可选,支持 {{orderNo}})。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StripeStrategy implements PaymentStrategy {

    public static final String CODE = "STRIPE";
    private static final long SIGNATURE_TOLERANCE_SECONDS = 300;

    private final FxRateService fxRateService;
    private final ConfigService configService;
    private final JsonMapper jsonMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Override
    public String channelCode() {
        return CODE;
    }

    @Override
    public PayCreationResult create(Order order, Map<String, String> config, PayContext ctx) {
        String secretKey = required(config, "secretKey");
        String currency = normalizeCurrency(config.getOrDefault("currency", fxRateService.siteCurrency()));
        BigDecimal stripeAmount = fxRateService.siteTo(order.getAmount(), currency);
        long unitAmount = minorAmount(stripeAmount, currency);

        Map<String, String> form = new HashMap<>();
        form.put("mode", "payment");
        form.put("payment_method_types[0]", "card");
        form.put("client_reference_id", order.getOrderNo());
        form.put("success_url", pageUrl(order, config, ctx, "successUrl"));
        form.put("cancel_url", pageUrl(order, config, ctx, "cancelUrl"));
        form.put("locale", "auto");
        form.put("line_items[0][quantity]", "1");
        form.put("line_items[0][price_data][currency]", currency.toLowerCase(Locale.ROOT));
        form.put("line_items[0][price_data][unit_amount]", String.valueOf(unitAmount));
        form.put("line_items[0][price_data][product_data][name]", order.getProductName());
        form.put("metadata[orderNo]", order.getOrderNo());
        form.put("metadata[siteAmount]", order.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString());
        form.put("payment_intent_data[metadata][orderNo]", order.getOrderNo());

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.stripe.com/v1/checkout/sessions"))
                    .header("Authorization", "Bearer " + secretKey)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(formEncode(form)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("stripe checkout create failed: status={} body={}", response.statusCode(), response.body());
                throw new BusinessException(ErrorCode.PAY_CREATE_FAILED);
            }
            Map<?, ?> body = jsonMapper.readValue(response.body(), Map.class);
            Object url = body.get("url");
            if (url == null || String.valueOf(url).isBlank()) {
                throw new BusinessException(ErrorCode.PAY_CREATE_FAILED);
            }
            return PayCreationResult.redirect(String.valueOf(url));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("stripe checkout create error: {}", e.getMessage());
            throw new BusinessException(ErrorCode.PAY_CREATE_FAILED);
        }
    }

    @Override
    public CallbackResult handleCallback(HttpServletRequest request, Map<String, String> config) {
        String webhookSecret = required(config, "webhookSecret");
        String payload;
        try {
            payload = new String(request.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return CallbackResult.fail("fail");
        }
        if (!verifySignature(payload, request.getHeader("Stripe-Signature"), webhookSecret)) {
            return CallbackResult.fail("fail");
        }
        try {
            Map<?, ?> event = jsonMapper.readValue(payload, Map.class);
            if (!"checkout.session.completed".equals(String.valueOf(event.get("type")))) {
                return CallbackResult.fail("ok");
            }
            Map<?, ?> session = nested(event, "data", "object");
            if (!"paid".equals(String.valueOf(session.get("payment_status")))) {
                return CallbackResult.fail("ok");
            }
            String sessionId = String.valueOf(session.get("id"));
            String orderNo = string(session.get("client_reference_id"));
            Map<?, ?> metadata = asMap(session.get("metadata"));
            if ((orderNo == null || orderNo.isBlank()) && metadata != null) {
                orderNo = string(metadata.get("orderNo"));
            }
            String siteAmount = metadata == null ? null : string(metadata.get("siteAmount"));
            if (orderNo == null || orderNo.isBlank() || siteAmount == null || siteAmount.isBlank()) {
                return CallbackResult.fail("fail");
            }
            return CallbackResult.success(orderNo, sessionId, new BigDecimal(siteAmount), "ok");
        } catch (Exception e) {
            log.warn("stripe callback parse failed: {}", e.getMessage());
            return CallbackResult.fail("fail");
        }
    }

    private boolean verifySignature(String payload, String header, String secret) {
        if (header == null || header.isBlank()) return false;
        String timestamp = null;
        String signature = null;
        for (String part : header.split(",")) {
            int idx = part.indexOf('=');
            if (idx <= 0) continue;
            String key = part.substring(0, idx).trim();
            String value = part.substring(idx + 1).trim();
            if ("t".equals(key)) timestamp = value;
            if ("v1".equals(key)) signature = value;
        }
        if (timestamp == null || signature == null) return false;
        try {
            long ts = Long.parseLong(timestamp);
            if (Math.abs(Instant.now().getEpochSecond() - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
            String expected = hmacSha256(timestamp + "." + payload, secret);
            return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private String hmacSha256(String value, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private long minorAmount(BigDecimal amount, String currency) {
        int scale = zeroDecimal(currency) ? 0 : 2;
        return amount.setScale(scale, RoundingMode.HALF_UP)
                .movePointRight(scale)
                .longValueExact();
    }

    private boolean zeroDecimal(String currency) {
        return "JPY".equalsIgnoreCase(currency);
    }

    private String pageUrl(Order order, Map<String, String> config, PayContext ctx, String key) {
        String tpl = config.get(key);
        if (tpl == null || tpl.isBlank()) {
            String siteUrl = configService.all().get("site.url");
            String base = (siteUrl == null || siteUrl.isBlank()) ? safeBase(ctx.extra("returnBase")) : siteUrl;
            if (base == null || base.isBlank()) base = "http://localhost:5173";
            tpl = base.replaceAll("/+$", "") + "/pay/{{orderNo}}";
        }
        return tpl.replace("{{orderNo}}", order.getOrderNo());
    }

    private String safeBase(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            URI uri = URI.create(raw.trim());
            if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (uri.getHost() == null) return null;
            return uri.getScheme() + "://" + uri.getAuthority();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String formEncode(Map<String, String> form) {
        StringJoiner joiner = new StringJoiner("&");
        form.forEach((k, v) -> joiner.add(URLEncoder.encode(k, StandardCharsets.UTF_8)
                + "=" + URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8)));
        return joiner.toString();
    }

    private String required(Map<String, String> config, String key) {
        String v = config.get(key);
        if (v == null || v.isBlank()) throw new BusinessException(ErrorCode.CHANNEL_DISABLED, "Stripe 配置缺少 " + key);
        return v.trim();
    }

    private String normalizeCurrency(String raw) {
        return (raw == null || raw.isBlank() ? fxRateService.siteCurrency() : raw).trim().toUpperCase(Locale.ROOT);
    }

    @SuppressWarnings("unchecked")
    private Map<?, ?> nested(Map<?, ?> root, String first, String second) {
        Object a = root.get(first);
        if (!(a instanceof Map<?, ?> m)) throw new IllegalArgumentException("missing " + first);
        Object b = m.get(second);
        if (!(b instanceof Map<?, ?> n)) throw new IllegalArgumentException("missing " + second);
        return n;
    }

    @SuppressWarnings("unchecked")
    private Map<?, ?> asMap(Object value) {
        return value instanceof Map<?, ?> m ? m : null;
    }

    private String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
