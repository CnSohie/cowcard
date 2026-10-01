package com.hqyj.ka.payment.crypto.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.order.service.OrderService;
import jakarta.servlet.http.HttpServletRequest;
import com.hqyj.ka.payment.crypto.CryptoPaymentService;
import com.hqyj.ka.payment.crypto.entity.CryptoPaymentIntent;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 加密支付前台接口(游客)。 */
@RestController
@RequestMapping("/api/pay/crypto")
@RequiredArgsConstructor
public class CryptoController {

    private final CryptoPaymentService cryptoPaymentService;
    private final OrderService orderService;

    public record SubmitTxRequest(@NotBlank String txHash, String contact,
                                  String queryPassword, String queryToken) {}

    /** 可用链/代币矩阵(前端渲染选择器) */
    @GetMapping("/options")
    public ApiResponse<List<Map<String, Object>>> options() {
        return ApiResponse.ok(cryptoPaymentService.options());
    }

    /** 意向单状态轮询(等待转账/确认进度) */
    @GetMapping("/intent/{orderNo}")
    public ApiResponse<Map<String, Object>> intent(@PathVariable String orderNo,
                                                   @RequestParam(required = false) CryptoPaymentIntent.Mode mode,
                                                   @RequestParam(required = false) String chain,
                                                   @RequestParam(required = false) String token,
                                                   @RequestParam(required = false) String contact,
                                                   @RequestParam(required = false) String queryPassword,
                                                   @RequestParam(required = false) String queryToken,
                                                   HttpServletRequest http) {
        orderService.authorizePaymentAccess(orderNo, (Long) http.getAttribute("mid"),
                contact, queryPassword, queryToken);
        if (mode != null && chain != null && !chain.isBlank() && token != null && !token.isBlank()) {
            return ApiResponse.ok(cryptoPaymentService.intentView(orderNo, mode, chain, token));
        }
        return ApiResponse.ok(cryptoPaymentService.intentView(orderNo));
    }

    /** 钱包直付:提交 txHash(仅线索,服务端链上回查为准) */
    @PostMapping("/intent/{orderNo}/tx")
    public ApiResponse<Map<String, Object>> submitTx(@PathVariable String orderNo,
                                                     @Valid @RequestBody SubmitTxRequest req,
                                                     HttpServletRequest http) {
        orderService.authorizePaymentAccess(orderNo, (Long) http.getAttribute("mid"),
                req.contact(), req.queryPassword(), req.queryToken());
        var intent = cryptoPaymentService.verifyWalletTx(orderNo, req.txHash());
        return ApiResponse.ok(cryptoPaymentService.intentView(intent));
    }
}
