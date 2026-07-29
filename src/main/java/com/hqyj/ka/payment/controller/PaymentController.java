package com.hqyj.ka.payment.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.dto.OrderDtos.PaySummary;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.PayCreationResult;
import com.hqyj.ka.payment.service.PaymentService;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 前台支付接口(游客)。 */
@RestController
@RequestMapping("/api/pay")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final OrderRepository orderRepository;

    public record CreatePayRequest(@NotBlank String orderNo, @NotBlank String channelCode,
                                   Map<String, String> extras) {}

    @GetMapping("/channels")
    public ApiResponse<List<Map<String, Object>>> channels() {
        return ApiResponse.ok(paymentService.enabledChannels());
    }

    @PostMapping("/create")
    public ApiResponse<PayCreationResult> create(@Valid @RequestBody CreatePayRequest req, HttpServletRequest http) {
        return ApiResponse.ok(paymentService.create(req.orderNo(), req.channelCode(),
                new PayContext(RateLimitFilter.clientIp(http), (Long) http.getAttribute("mid"), req.extras())));
    }

    /** 支付结果轮询(前端 3s 一次) */
    @GetMapping("/status/{orderNo}")
    public ApiResponse<String> status(@PathVariable String orderNo) {
        return ApiResponse.ok(orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND))
                .getStatus().name());
    }

    /** 收银台摘要:商品/金额/状态/过期时间(倒计时用)。凭高熵订单号获取,不含敏感字段。 */
    @GetMapping("/summary/{orderNo}")
    public ApiResponse<PaySummary> summary(@PathVariable String orderNo) {
        Order o = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        return ApiResponse.ok(new PaySummary(o.getOrderNo(), o.getOrderType().name(),
                o.getProductName(), o.getAmount(), o.getStatus().name(), o.getExpireAt(),
                o.getWalletPaidAmount(), o.getDeliveryMode().name()));
    }
}
