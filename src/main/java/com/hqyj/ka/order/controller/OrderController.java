package com.hqyj.ka.order.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.order.dto.OrderDtos.*;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.order.service.OrderService.CreatedOrder;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/** 前台订单接口(游客,无需登录;有 IP 限流)。 */
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ApiResponse<CreateOrderResponse> create(@Valid @RequestBody CreateOrderRequest req, HttpServletRequest http) {
        // 会员携带令牌下单则关联会员(享推广佣金归属);游客为 null
        Long memberId = (Long) http.getAttribute("mid");
        CreatedOrder created = orderService.create(req, RateLimitFilter.clientIp(http), memberId);
        return ApiResponse.ok(new CreateOrderResponse(created.order().getOrderNo(),
                created.order().getAmount(), created.order().getExpireAt(), created.queryToken(),
                created.order().getWalletPaidAmount(), created.order().getMemberDiscountAmount(),
                created.presaleVoucherToken()));
    }

    /** POST 查单:凭证不进 URL/访问日志 */
    @PostMapping("/query")
    public ApiResponse<OrderView> query(@Valid @RequestBody QueryOrderRequest req) {
        return ApiResponse.ok(orderService.query(req.orderNo(), req.contact(), req.queryPassword(), req.queryToken()));
    }
}
