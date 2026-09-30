package com.hqyj.ka.payment.balance;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.PayContext;
import com.hqyj.ka.payment.PayCreationResult;
import com.hqyj.ka.payment.PaymentStrategy;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.service.WalletService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/** 会员余额支付:扣钱包余额后进入统一订单入账/发卡闭环。 */
@Component
@RequiredArgsConstructor
public class BalancePaymentStrategy implements PaymentStrategy {

    public static final String CODE = "BALANCE";

    private final WalletService walletService;
    private final OrderService orderService;

    @Override
    public String channelCode() {
        return CODE;
    }

    @Override
    public PayCreationResult create(Order order, Map<String, String> config, PayContext ctx) {
        if (ctx.memberId() == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "请登录下单会员后使用余额支付");
        }
        if (order.getMemberId() == null) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "游客订单不能使用余额支付，请登录后重新下单");
        }
        if (!order.getMemberId().equals(ctx.memberId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "请使用下单会员账号支付该订单");
        }
        if (order.getOrderType() != Order.OrderType.GOODS) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "充值订单不能使用余额支付");
        }
        walletService.debit(order.getMemberId(), order.getAmount(), WalletTxn.Type.PURCHASE,
                "ORDER", order.getId(), "余额购买 " + order.getOrderNo());
        if (!orderService.markPaid(order.getId(), CODE)) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID);
        }
        return new PayCreationResult("BALANCE", Map.of("status", "PAID"));
    }
}
