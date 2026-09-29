package com.hqyj.ka.order.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.order.dto.OrderDtos.AdminOrderView;
import com.hqyj.ka.order.dto.OrderDtos.OrderView;
import com.hqyj.ka.order.dto.OrderDtos.SensitiveAuthRequest;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final AuditService auditService;
    private final AuthService authService;
    private final PaymentTransactionRepository transactionRepository;

    public record ManualDeliverRequest(String password, String totpCode, String content, String staffNote) {}
    public record RefundToWalletRequest(String password, String totpCode, BigDecimal amount, String note) {}

    /** 列表:支持状态筛选 + 订单号/联系方式模糊搜索;返回 DTO,不泄漏内部字段。 */
    @GetMapping
    @PreAuthorize("hasAuthority('order:read')")
    public ApiResponse<PageResult<AdminOrderView>> list(@RequestParam(required = false) String status,
                                                        @RequestParam(required = false) String q,
                                                        @RequestParam(defaultValue = "false") boolean latePaid,
                                                        @RequestParam(defaultValue = "0") int page,
                                                        @RequestParam(defaultValue = "20") int size) {
        Order.Status st = null;
        if (status != null && !status.isBlank()) {
            try {
                st = Order.Status.valueOf(status.trim().toUpperCase());
            } catch (IllegalArgumentException ignored) { /* 非法状态按全部处理 */ }
        }
        String kw = (q == null || q.isBlank()) ? null : q.trim();
        PageRequest pr = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100),
                Sort.by(Sort.Direction.DESC, "id"));
        Page<Order> result;
        if (latePaid) {
            result = orderRepository.findLatePaidOrders(
                    List.of(Order.Status.EXPIRED, Order.Status.CLOSED), kw, pr);
        } else if (st != null && kw != null) {
            result = orderRepository.findByStatusAndOrderNoContainingIgnoreCaseOrStatusAndContactContainingIgnoreCase(
                    st, kw, st, kw, pr);
        } else if (st != null) {
            result = orderRepository.findByStatus(st, pr);
        } else if (kw != null) {
            result = orderRepository.findByOrderNoContainingIgnoreCaseOrContactContainingIgnoreCase(kw, kw, pr);
        } else {
            result = orderRepository.findAll(pr);
        }
        return ApiResponse.ok(PageResult.of(result.map(AdminOrderController::toView)));
    }

    /** 各状态订单数(筛选栏计数;status,expireAt 复合索引左前缀覆盖,查询很轻)。 */
    @GetMapping("/stats")
    @PreAuthorize("hasAuthority('order:read')")
    public ApiResponse<Map<String, Long>> stats() {
        Map<String, Long> m = new LinkedHashMap<>();
        m.put("ALL", orderRepository.count());
        for (Order.Status s : Order.Status.values()) {
            m.put(s.name(), orderRepository.countByStatus(s));
        }
        m.put("LATE_PAID", transactionRepository.countSuccessfulTxWithOrderStatusIn(
                PaymentTransaction.Status.SUCCESS, List.of(Order.Status.EXPIRED, Order.Status.CLOSED)));
        return ApiResponse.ok(m);
    }

    /** 订单详情(完整字段,含时间线/买家 IP/优惠信息)。 */
    @GetMapping("/{orderNo}")
    @PreAuthorize("hasAuthority('order:read')")
    public ApiResponse<AdminOrderView> detail(@PathVariable String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        return ApiResponse.ok(toView(order));
    }

    /** 管理端查看订单卡密(高敏操作,独立权限 + 2FA 信任期 + 审计) */
    @GetMapping("/{orderNo}/cards")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<OrderView> cards(@PathVariable String orderNo, HttpServletRequest http) {
        requireSensitiveTrusted(http);
        return ApiResponse.ok(cardView(orderNo, http));
    }

    /** 管理端查看订单卡密:未在 2FA 信任期内时,通过密码 + TOTP 复核后返回明文。 */
    @PostMapping("/{orderNo}/cards/view")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<OrderView> cardsWithAuth(@PathVariable String orderNo,
                                                @RequestBody SensitiveAuthRequest auth,
                                                HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "order-view-cards:" + orderNo, RateLimitFilter.clientIp(http));
        return ApiResponse.ok(cardView(orderNo, http));
    }

    private OrderView cardView(String orderNo, HttpServletRequest http) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        auditService.record((String) http.getAttribute("uname"), "ORDER_VIEW_CARDS",
                "order:" + orderNo, RateLimitFilter.clientIp(http), null);
        return orderService.toView(order, order.getStatus() == Order.Status.DELIVERED);
    }

    private void requireSensitiveTrusted(HttpServletRequest http) {
        if (!authService.sensitiveTrusted((Long) http.getAttribute("uid"))) {
            throw new BusinessException(ErrorCode.TOTP_REQUIRED, "请先完成 2FA 验证后查看订单卡密");
        }
    }

    /**
     * 人工补单(渠道掉单/买家迟付时,凭渠道流水核实后操作;支持超时单回占库存补发)。
     * 财务级操作:管理员密码 + TOTP 双因子复核,未启用 2FA 直接拒绝;全程审计。
     */
    @PostMapping("/{orderNo}/mark-paid")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Boolean> markPaid(@PathVariable String orderNo,
                                         @RequestBody SensitiveAuthRequest auth, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "order-mark-paid:" + orderNo, RateLimitFilter.clientIp(http));
        boolean ok = orderService.markPaidManually(orderNo);
        auditService.record((String) http.getAttribute("uname"), "ORDER_MANUAL_PAID",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"result\":" + ok + "}");
        return ApiResponse.ok(ok);
    }

    /** 手动关单(PENDING 释放占用;EXPIRED 仅改状态,CAS 防竞态)。同为敏感操作,双因子复核。 */
    @PostMapping("/{orderNo}/close")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Boolean> close(@PathVariable String orderNo,
                                      @RequestBody SensitiveAuthRequest auth, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "order-close:" + orderNo, RateLimitFilter.clientIp(http));
        boolean ok = orderService.closeManually(orderNo);
        auditService.record((String) http.getAttribute("uname"), "ORDER_MANUAL_CLOSE",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"result\":" + ok + "}");
        return ApiResponse.ok(ok);
    }

    /** 撤销充值订单:已入账则扣回会员可用余额;财务级操作,双因子复核。 */
    @PostMapping("/{orderNo}/refund-recharge")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Boolean> refundRecharge(@PathVariable String orderNo,
                                               @RequestBody SensitiveAuthRequest auth, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "order-refund-recharge:" + orderNo, RateLimitFilter.clientIp(http));
        boolean ok = orderService.refundRechargeManually(orderNo);
        auditService.record((String) http.getAttribute("uname"), "ORDER_RECHARGE_REFUND",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"result\":" + ok + "}");
        return ApiResponse.ok(ok);
    }

    /** 商品订单补发卡密:用于支付已确认但首次发卡失败的 PAID 单;财务级操作,双因子复核。 */
    @PostMapping("/{orderNo}/deliver")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Boolean> deliver(@PathVariable String orderNo,
                                        @RequestBody SensitiveAuthRequest auth, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), auth.password(), auth.totpCode(),
                "order-deliver:" + orderNo, RateLimitFilter.clientIp(http));
        boolean ok = orderService.retryDeliverGoodsManually(orderNo);
        auditService.record((String) http.getAttribute("uname"), "ORDER_RETRY_DELIVER",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"result\":" + ok + "}");
        return ApiResponse.ok(ok);
    }

    /** 人工发货订单交付:填写交付内容并标记已发货;财务级操作,双因子复核。 */
    @PostMapping("/{orderNo}/manual-deliver")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Boolean> manualDeliver(@PathVariable String orderNo,
                                              @RequestBody ManualDeliverRequest req, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "order-manual-deliver:" + orderNo, RateLimitFilter.clientIp(http));
        boolean ok = orderService.manualDeliver(orderNo, req.content(), req.staffNote(),
                String.valueOf(http.getAttribute("uname")));
        auditService.record((String) http.getAttribute("uname"), "ORDER_MANUAL_DELIVER",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"result\":" + ok + "}");
        return ApiResponse.ok(ok);
    }

    @PostMapping("/{orderNo}/refund-wallet")
    @PreAuthorize("hasAuthority('order:write')")
    public ApiResponse<Void> refundToWallet(@PathVariable String orderNo,
                                            @RequestBody RefundToWalletRequest req, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "order-refund-wallet:" + orderNo, RateLimitFilter.clientIp(http));
        orderService.refundToWallet(orderNo, req.amount(), String.valueOf(http.getAttribute("uname")), req.note());
        auditService.record((String) http.getAttribute("uname"), "ORDER_REFUND_WALLET",
                "order:" + orderNo, RateLimitFilter.clientIp(http), "{\"amount\":\"" + req.amount() + "\"}");
        return ApiResponse.ok();
    }

    private static AdminOrderView toView(Order o) {
        return new AdminOrderView(o.getId(), o.getOrderNo(), o.getOrderType().name(), o.getMemberId(),
                o.getProductName(), o.getUnitPrice(), o.getQuantity(), o.getAmount(),
                o.getDiscountAmount(), o.getWalletPaidAmount(), o.getCouponCode(), o.getContact(), o.getStatus().name(),
                o.getPaidChannel(), o.getBuyerIp(), o.getCreatedAt(), o.getExpireAt(),
                o.getPaidAt(), o.getDeliveredAt(), o.getDeliveryMode().name(),
                o.getBuyerNote(), o.getManualDeliveryContent());
    }
}
