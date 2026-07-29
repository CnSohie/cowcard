package com.hqyj.ka.payment.alipay;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayClient;
import com.alipay.api.DefaultAlipayClient;
import com.alipay.api.internal.util.AlipaySignature;
import com.alipay.api.request.AlipayTradePagePayRequest;
import com.alipay.api.request.AlipayTradePrecreateRequest;
import com.alipay.api.response.AlipayTradePrecreateResponse;
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

import java.math.BigDecimal;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

/**
 * 支付宝官方(开放平台,需企业资质签约)。
 * config:appId, privateKey(应用私钥), alipayPublicKey(支付宝公钥), notifyUrl,
 *         gateway(默认 https://openapi.alipay.com/gateway.do), mode(qr=当面付扫码 | page=电脑网站)
 * 安全:RSA2 异步通知验签 + app_id 核对 + 金额逐位核对;通知需应答 "success" 否则支付宝重发 8 次。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AlipayOfficialStrategy implements PaymentStrategy {

    public static final String CODE = "ALIPAY_OFFICIAL";

    private final FxRateService fxRateService;
    private final ConfigService configService;

    @Override
    public String channelCode() { return CODE; }

    @Override
    public PayCreationResult create(Order order, Map<String, String> config, PayContext ctx) {
        String gateway = config.getOrDefault("gateway", "https://openapi.alipay.com/gateway.do");
        String mode = config.getOrDefault("mode", "qr");
        BigDecimal payAmount = fxRateService.siteToCny(order.getAmount());
        AlipayClient client = new DefaultAlipayClient(gateway, config.get("appId"), config.get("privateKey"),
                "json", "UTF-8", config.get("alipayPublicKey"), "RSA2");
        try {
            if ("page".equals(mode)) {
                // 电脑网站支付:返回收银台 HTML 表单跳转
                AlipayTradePagePayRequest request = new AlipayTradePagePayRequest();
                request.setNotifyUrl(config.get("notifyUrl"));
                String returnUrl = returnUrl(order, config, ctx);
                if (returnUrl != null && !returnUrl.isBlank()) request.setReturnUrl(returnUrl);
                request.setBizContent("{\"out_trade_no\":\"" + order.getOrderNo() + "\"," +
                        "\"total_amount\":\"" + payAmount.toPlainString() + "\"," +
                        "\"subject\":\"" + safeSubject(order.getProductName()) + "\"," +
                        "\"product_code\":\"FAST_INSTANT_TRADE_PAY\"}");
                String form = client.pageExecute(request).getBody();
                return new PayCreationResult("HTML_FORM", Map.of("html", form));
            }
            // 当面付:预下单生成二维码
            AlipayTradePrecreateRequest request = new AlipayTradePrecreateRequest();
            request.setNotifyUrl(config.get("notifyUrl"));
            request.setBizContent("{\"out_trade_no\":\"" + order.getOrderNo() + "\"," +
                    "\"total_amount\":\"" + payAmount.toPlainString() + "\"," +
                    "\"subject\":\"" + safeSubject(order.getProductName()) + "\"}");
            AlipayTradePrecreateResponse response = client.execute(request);
            if (!response.isSuccess()) {
                log.error("alipay precreate failed: {} {}", response.getCode(), response.getSubMsg());
                throw new BusinessException(ErrorCode.PAY_CREATE_FAILED);
            }
            return PayCreationResult.qrcode(response.getQrCode());
        } catch (AlipayApiException e) {
            log.error("alipay api error", e);
            throw new BusinessException(ErrorCode.PAY_CREATE_FAILED);
        }
    }

    @Override
    public CallbackResult handleCallback(HttpServletRequest request, Map<String, String> config) {
        Map<String, String> params = new HashMap<>();
        request.getParameterMap().forEach((k, v) -> params.put(k, String.join(",", v)));
        try {
            boolean signOk = AlipaySignature.rsaCheckV1(params, config.get("alipayPublicKey"), "UTF-8", "RSA2");
            if (!signOk) return CallbackResult.fail("failure");
        } catch (AlipayApiException e) {
            return CallbackResult.fail("failure");
        }
        // 验签通过后仍需核对:app_id、交易状态、金额(PaymentService 内逐位核对)
        if (!config.get("appId").equals(params.get("app_id"))) return CallbackResult.fail("failure");
        String status = params.get("trade_status");
        if (!"TRADE_SUCCESS".equals(status) && !"TRADE_FINISHED".equals(status)) {
            return CallbackResult.fail("success"); // 非成功态直接应答,避免无意义重发
        }
        return CallbackResult.success(params.get("out_trade_no"), params.get("trade_no"),
                new BigDecimal(params.get("total_amount")), "success");
    }

    private String safeSubject(String name) {
        return name.replaceAll("[\"\\\\]", "").trim();
    }

    private String returnUrl(Order order, Map<String, String> config, PayContext ctx) {
        String tpl = config.get("returnUrl");
        if (tpl == null || tpl.isBlank()) {
            String siteUrl = configService.all().get("site.url");
            String base = (siteUrl == null || siteUrl.isBlank()) ? safeBase(ctx.extra("returnBase")) : siteUrl;
            if (base == null || base.isBlank()) return null;
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
}
