package com.hqyj.ka.payment.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.service.OrderService;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 入账核心(全渠道汇聚):金额核对 → 渠道流水唯一 → 订单状态 CAS → 发卡事件。
 * 独立成服务以打破「策略 → 支付编排」的循环依赖,也方便未来事务消息化改造。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SettlementService {

    private final OrderRepository orderRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final OrderService orderService;
    private final FxRateService fxRateService;

    @Transactional
    public void settle(String orderNo, String channelCode, String channelTradeNo,
                       BigDecimal paidAmount, boolean exactAmount) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));

        BigDecimal amount = paidAmount != null ? paidAmount : order.getAmount();
        BigDecimal expected = expectedAmount(order, channelCode);
        if (exactAmount && expected.compareTo(amount) != 0) {
            throw new BusinessException(ErrorCode.AMOUNT_MISMATCH);
        }

        if (transactionRepository.findByChannelTradeNo(channelTradeNo).isPresent()) {
            log.info("duplicate settlement ignored, tradeNo={}", channelTradeNo);
            return;
        }
        PaymentTransaction tx = new PaymentTransaction();
        tx.setOrderId(order.getId());
        tx.setOrderNo(orderNo);
        tx.setChannelCode(channelCode);
        tx.setAmount(amount);
        tx.setChannelTradeNo(channelTradeNo);
        tx.setStatus(PaymentTransaction.Status.SUCCESS);
        tx.setPaidAt(LocalDateTime.now());
        try {
            transactionRepository.saveAndFlush(tx);
        } catch (DataIntegrityViolationException e) {
            log.info("duplicate settlement raced, tradeNo={}", channelTradeNo);
            return;
        }
        boolean ok = orderService.markPaid(order.getId(), channelCode);
        if (!ok) {
            // 订单已不是待支付(常见:迟到支付,订单已被定时任务关为 EXPIRED)。
            // 渠道流水已留证(payment_transaction),后台订单详情用「人工补单」可一键恢复发货。
            log.warn("settlement recorded but order not pending, orderNo={} channel={} tradeNo={} — 请在后台订单页人工补单",
                    orderNo, channelCode, channelTradeNo);
        }
    }

    private BigDecimal expectedAmount(Order order, String channelCode) {
        if ("ALIPAY_OFFICIAL".equals(channelCode) || "EPAY".equals(channelCode)) {
            return fxRateService.siteToCny(order.getAmount());
        }
        return order.getAmount();
    }
}
