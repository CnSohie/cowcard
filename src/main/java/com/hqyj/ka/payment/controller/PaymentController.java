package com.hqyj.ka.payment.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.dto.OrderDtos.PaySummary;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
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
    private final OrderService orderService;

    public record CreatePayRequest(@NotBlank String orderNo, @NotBlank String channelCode,
                                   Map<String, String> extras, String contact,
                                   String queryPassword, String queryToken) {}

    @GetMapping("/channels")
    public ApiResponse<List<Map<String, Object>>> channels() {
        return ApiResponse.ok(paymentService.enabledChannels());
    }

    @PostMapping("/create")
    public ApiResponse<PayCreationResult> create(@Valid @RequestBody CreatePayRequest req, HttpServletRequest http) {
        Long memberId = (Long) http.getAttribute("mid");
        if (memberId == null) {
            orderService.authorizePayment(req.orderNo(), req.contact(), req.queryPassword(), req.queryToken());
        }
        return ApiResponse.ok(paymentService.create(req.orderNo(), req.channelCode(),
                new PayContext(RateLimitFilter.clientIp(http), memberId, req.extras())));
    }

    /** 支付结果轮询(前端 3s 一次) */
    @GetMapping("/status/{orderNo}")
    public ApiResponse<String> status(@PathVariable String orderNo,
                                      @RequestParam(required = false) String contact,
                                      @RequestParam(required = false) String queryPassword,
                                      @RequestParam(required = false) String queryToken,
                                      HttpServletRequest http) {
        return ApiResponse.ok(authorizedOrder(orderNo, contact, queryPassword, queryToken, http)
                .getStatus().name());
    }

    /** 收银台摘要:商品/金额/状态/过期时间(倒计时用),必须通过会员身份或订单凭证校验。 */
    @GetMapping("/summary/{orderNo}")
    public ApiResponse<PaySummary> summary(@PathVariable String orderNo,
                                           @RequestParam(required = false) String contact,
                                           @RequestParam(required = false) String queryPassword,
                                           @RequestParam(required = false) String queryToken,
                                           HttpServletRequest http) {
        Order o = authorizedOrder(orderNo, contact, queryPassword, queryToken, http);
        return ApiResponse.ok(new PaySummary(o.getOrderNo(), o.getOrderType().name(),
                o.getProductName(), o.getAmount(), o.getStatus().name(), o.getExpireAt(),
                o.getWalletPaidAmount(), o.getDeliveryMode().name()));
    }

    private Order authorizedOrder(String orderNo, String contact, String queryPassword,
                                  String queryToken, HttpServletRequest http) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        Long memberId = (Long) http.getAttribute("mid");
        if (memberId != null) {
            if (!memberId.equals(order.getMemberId())) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
        } else {
            orderService.authorizePayment(orderNo, contact, queryPassword, queryToken);
        }
        return order;
    }
}
