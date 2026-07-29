package com.hqyj.ka.payment.controller;

import com.hqyj.ka.payment.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 支付网关异步通知入口(支付宝 POST 表单 / 易支付 GET|POST)。
 * 安全:策略内验签 + 金额核对 + 幂等入账;本接口无认证(网关无法带 JWT),验签即认证。
 */
@RestController
@RequestMapping("/api/pay/notify")
@RequiredArgsConstructor
public class PaymentCallbackController {

    private final PaymentService paymentService;

    @RequestMapping(value = "/{channelCode}", method = {RequestMethod.GET, RequestMethod.POST},
            produces = "text/plain;charset=UTF-8")
    public String notify(@PathVariable String channelCode, HttpServletRequest request) {
        return paymentService.handleCallback(channelCode, request);
    }
}
