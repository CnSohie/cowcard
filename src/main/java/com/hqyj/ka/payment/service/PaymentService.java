package com.hqyj.ka.payment.service;

import tools.jackson.databind.json.JsonMapper;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.payment.*;
import com.hqyj.ka.payment.entity.PaymentChannel;
import com.hqyj.ka.payment.entity.PaymentTransaction;
import com.hqyj.ka.payment.repo.PaymentChannelRepository;
import com.hqyj.ka.payment.repo.PaymentTransactionRepository;
import com.hqyj.ka.payment.alipay.AlipayOfficialStrategy;
import com.hqyj.ka.payment.balance.BalancePaymentStrategy;
import com.hqyj.ka.payment.crypto.CryptoTransferStrategy;
import com.hqyj.ka.payment.crypto.CryptoWalletStrategy;
import com.hqyj.ka.payment.epay.EpayStrategy;
import com.hqyj.ka.payment.stripe.StripeStrategy;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 支付编排:创建支付 → 策略执行;回调 → 验签 → 金额核对 → 幂等入账。
 * 入账双保险:订单状态 CAS + channelTradeNo 唯一约束。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentChannelRepository channelRepository;
    private final PaymentTransactionRepository transactionRepository;
    private final OrderRepository orderRepository;
    private final SettlementService settlementService;
    private final PaymentStrategyRegistry registry;
    private final AppProperties props;
    // Spring Boot 4 默认 Jackson 3(tools.jackson),注入自动装配的 JsonMapper
    private final JsonMapper jsonMapper;

    /** 前台可用渠道列表 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> enabledChannels() {
        return channelRepository.findByEnabledTrueOrderBySortOrderAsc().stream()
                .<Map<String, Object>>map(c -> Map.of("code", c.getCode(), "displayName", c.getDisplayName()))
                .toList();
    }

    @Transactional
    public PayCreationResult create(String orderNo, String channelCode, PayContext ctx) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getStatus() != Order.Status.PENDING) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID);
        }
        if (order.getExpireAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.ORDER_EXPIRED);
        }
        if (order.getMemberId() != null && (ctx.memberId() == null || !order.getMemberId().equals(ctx.memberId()))) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "请登录下单会员账号后支付该订单");
        }
        PaymentChannel channel = channelRepository.findByCodeAndEnabledTrue(channelCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.CHANNEL_DISABLED));

        PaymentTransaction tx = new PaymentTransaction();
        tx.setOrderId(order.getId());
        tx.setOrderNo(order.getOrderNo());
        tx.setChannelCode(channelCode);
        tx.setAmount(order.getAmount());
        tx = transactionRepository.save(tx);

        // 策略调用必须留在当前事务内。尤其余额支付依赖同一事务同时完成:
        // 扣钱包余额 -> 订单 CAS 标记 PAID -> 发卡/入账 -> 支付流水 SUCCESS。
        PayCreationResult result = registry.get(channelCode).create(order, decryptConfig(channel), ctx);
        if (BalancePaymentStrategy.CODE.equals(channelCode) && "BALANCE".equals(result.kind())) {
            tx.setStatus(PaymentTransaction.Status.SUCCESS);
            tx.setChannelTradeNo("BALANCE:" + order.getOrderNo());
            tx.setPaidAt(LocalDateTime.now());
        }
        return result;
    }

    /** 支付网关异步回调统一入口。返回应答报文体。 */
    @Transactional
    public String handleCallback(String channelCode, HttpServletRequest request) {
        PaymentChannel channel = channelRepository.findByCodeAndEnabledTrue(channelCode)
                .orElse(null);
        if (channel == null) return "channel disabled";

        CallbackResult result = registry.get(channelCode).handleCallback(request, decryptConfig(channel));
        if (!result.ok()) {
            log.warn("callback verify failed, channel={}", channelCode);
            return result.ack();
        }
        try {
            settlementService.settle(result.orderNo(), channelCode, result.channelTradeNo(), result.amount(), true);
        } catch (BusinessException e) {
            log.error("callback settle rejected: order={} reason={}", result.orderNo(), e.getMessage());
            return "fail";
        }
        return result.ack();
    }

    Map<String, String> decryptConfig(PaymentChannel channel) {
        if (channel.getConfigEnc() == null || channel.getConfigEnc().isBlank()) return Map.of();
        try {
            String json = AesGcmUtil.decrypt(channel.getConfigEnc(), props.getSecurity().aesKeyBytes());
            Map<?, ?> raw = jsonMapper.readValue(json, Map.class);
            Map<String, String> config = new java.util.HashMap<>();
            raw.forEach((k, v) -> config.put(String.valueOf(k), v == null ? "" : String.valueOf(v)));
            return config;
        } catch (Exception e) {
            log.error("channel config decrypt failed: {}", channel.getCode());
            throw new BusinessException(ErrorCode.CHANNEL_DISABLED);
        }
    }

    /** 管理端保存渠道配置:JSON 明文入参 → AES 加密落库。 */
    @Transactional
    public void saveChannelConfig(Long channelId, String displayName, Boolean enabled, Integer sortOrder, String configJson) {
        PaymentChannel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (displayName != null) channel.setDisplayName(displayName);
        if (enabled != null) channel.setEnabled(enabled);
        if (sortOrder != null) channel.setSortOrder(sortOrder);
        if (configJson != null && !configJson.isBlank()) {
            try {
                jsonMapper.readTree(configJson); // 校验 JSON 合法
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "配置必须是合法 JSON");
            }
            channel.setConfigEnc(AesGcmUtil.encrypt(configJson, props.getSecurity().aesKeyBytes()));
        }
    }

    @Transactional(readOnly = true)
    public List<PaymentChannel> allChannels() {
        return channelRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder", "id"));
    }

    /** 老库升级兜底:打开支付渠道页时也补齐内置渠道,不只依赖应用启动种子。 */
    @Transactional
    public List<PaymentChannel> allChannelsEnsured() {
        seedChannel(AlipayOfficialStrategy.CODE, "支付宝", 1, false);
        seedChannel(EpayStrategy.CODE, "支付宝(聚合)", 2, false);
        seedChannel(CryptoTransferStrategy.CODE, "USDT/USDC 转账", 3, false);
        seedChannel(CryptoWalletStrategy.CODE, "连接钱包支付", 4, false);
        seedChannel(StripeStrategy.CODE, "信用卡支付", 5, false);
        seedChannel(BalancePaymentStrategy.CODE, "余额支付", 6, true);
        return allChannels();
    }

    private void seedChannel(String code, String name, int sort, boolean enabled) {
        channelRepository.findByCode(code).orElseGet(() -> {
            PaymentChannel channel = new PaymentChannel();
            channel.setCode(code);
            channel.setDisplayName(name);
            channel.setSortOrder(sort);
            channel.setEnabled(enabled);
            return channelRepository.save(channel);
        });
    }
}
