package com.hqyj.ka.order.service;

import com.hqyj.ka.card.service.CardService;
import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.common.util.OrderNoGenerator;
import com.hqyj.ka.coupon.service.CouponService;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.catalog.service.InventoryService;
import com.hqyj.ka.catalog.service.ManualDeliveryFormService;
import com.hqyj.ka.order.dto.OrderDtos.CreateOrderRequest;
import com.hqyj.ka.order.dto.OrderDtos.OrderView;
import com.hqyj.ka.order.dto.OrderDtos.PresaleVoucherClaimResponse;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.entity.OrderDeliveryRecord;
import com.hqyj.ka.order.entity.PresaleVoucher;
import com.hqyj.ka.order.event.OrderPaidEvent;
import com.hqyj.ka.order.repo.OrderDeliveryRecordRepository;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.member.service.MemberLevelService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.service.CommissionService;
import com.hqyj.ka.wallet.service.WalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {
    private static final SecureRandom TOKEN_RANDOM = new SecureRandom();

    private final OrderRepository orderRepository;
    private final OrderDeliveryRecordRepository deliveryRecordRepository;
    private final ProductRepository productRepository;
    private final CardService cardService;
    private final InventoryService inventoryService;
    private final PasswordEncoder passwordEncoder;
    private final CouponService couponService;
    private final AppProperties props;
    private final ApplicationEventPublisher eventPublisher;
    private final WalletService walletService;
    private final CommissionService commissionService;
    private final MemberLevelService memberLevelService;
    private final PresaleVoucherService presaleVoucherService;
    private final ConfigService configService;
    private final CacheManager cacheManager;
    private final ManualDeliveryFormService manualDeliveryFormService;

    /** sys_config 整型参数(带合法区间校验),非法/缺省回落默认值。 */
    private int cfgInt(String key, int def, int min, int max) {
        String v = configService.all().get(key);
        if (v != null && !v.isBlank()) {
            try {
                int i = Integer.parseInt(v.trim());
                if (i >= min && i <= max) return i;
            } catch (NumberFormatException ignored) { /* 非法配置回落默认 */ }
        }
        return def;
    }

    /** 订单支付超时分钟数:后台可配(order.expire_minutes,1~1440),未配置回落 yml 默认。 */
    private int expireMinutes() {
        return cfgInt("order.expire_minutes", props.getOrder().getExpireMinutes(), 1, 1440);
    }

    public record CreatedOrder(Order order, String queryToken, String presaleVoucherToken) {}

    /** 下单:校验 → 自动卡密商品原子预占库存 → 建单。memberId 可空(游客单)。 */
    @Transactional
    public CreatedOrder create(CreateOrderRequest req, String buyerIp, Long memberId) {
        Product product = productRepository.findByIdAndVisibleTrue(req.productId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_OFF_SHELF));
        boolean autoCard = product.getDeliveryMode() == Product.DeliveryMode.AUTO_CARD;
        boolean presale = product.getDeliveryMode() == Product.DeliveryMode.PRESALE_VOUCHER;
        if (presale) {
            if (product.getPresaleEndAt() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "预售商品必须配置最晚交付保障时间");
            }
            // 兼容升级前的预售商品:未配置独立停售时间时仍以保障时间停止销售。
            LocalDateTime saleEndAt = product.getPresaleSaleEndAt() == null
                    ? product.getPresaleEndAt() : product.getPresaleSaleEndAt();
            if (LocalDateTime.now().isAfter(saleEndAt)) {
                throw new BusinessException(ErrorCode.ORDER_EXPIRED, "该预售已停止销售,不可继续下单");
            }
        }
        if (req.quantity() < product.getMinBuy() || req.quantity() > product.getMaxBuy()
                || req.quantity() > props.getOrder().getMaxQuantityPerOrder()) {
            throw new BusinessException(ErrorCode.QUANTITY_LIMIT);
        }
        if (!meetsMinimumOrderAmount(product, req.quantity())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "该商品单笔最低订购金额为 " + product.getMinOrderAmount().setScale(2) + " 元，请增加购买数量");
        }
        String manualSubmission = null;
        if (!autoCard && !presale) {
            manualSubmission = manualDeliveryFormService.validateSubmission(
                    product.getManualFormSchema(), req.buyerNote());
        }

        // 反库存挤占:同邮箱 / 同 IP 未支付订单数上限(后台可调;未付订单超时自动释放,配合短超时效果最佳)
        String contactNorm = req.contact().trim().toLowerCase();
        if (orderRepository.countByStatusAndContact(Order.Status.PENDING, contactNorm)
                >= cfgInt("order.max_pending_per_contact", 3, 1, 100)) {
            throw new BusinessException(ErrorCode.ORDER_PENDING_LIMIT);
        }
        if (buyerIp != null && !buyerIp.isBlank()
                && orderRepository.countByStatusAndBuyerIp(Order.Status.PENDING, buyerIp)
                >= cfgInt("order.max_pending_per_ip", 5, 1, 200)) {
            throw new BusinessException(ErrorCode.ORDER_PENDING_LIMIT);
        }

        if (autoCard && productRepository.reserveStock(product.getId(), req.quantity()) == 0) {
            throw new BusinessException(ErrorCode.STOCK_NOT_ENOUGH);
        }
        if (autoCard) evictProductCache();

        Order order = new Order();
        order.setOrderNo(OrderNoGenerator.next());
        order.setMemberId(memberId);
        order.setOrderType(Order.OrderType.GOODS);
        order.setDeliveryMode(autoCard ? Order.DeliveryMode.AUTO_CARD
                : presale ? Order.DeliveryMode.PRESALE_VOUCHER : Order.DeliveryMode.MANUAL);
        order.setProductId(product.getId());
        order.setProductName(product.getName());
        var memberPrice = memberLevelService.priceFor(memberId, product, req.quantity());
        order.setOriginalUnitPrice(product.getPrice());
        order.setUnitPrice(memberPrice.unitPrice());
        order.setMemberLevelId(memberPrice.levelId());
        order.setMemberLevelName(memberPrice.levelName());
        order.setQuantity(req.quantity());
        BigDecimal baseAmount = memberPrice.unitPrice().multiply(BigDecimal.valueOf(req.quantity()));
        BigDecimal memberDiscount = memberPrice.discountPerUnit().multiply(BigDecimal.valueOf(req.quantity()));
        order.setMemberDiscountAmount(memberDiscount);
        if (memberDiscount.signum() > 0) order.setDiscountAmount(memberDiscount);
        if (req.couponCode() != null && !req.couponCode().isBlank()) {
            BigDecimal discount = couponService.redeem(req.couponCode(), baseAmount);
            order.setCouponCode(req.couponCode().trim().toUpperCase());
            order.setDiscountAmount(order.getDiscountAmount().add(discount));
            baseAmount = baseAmount.subtract(discount);
        }
        order.setAmount(baseAmount);
        order.setContact(req.contact().trim().toLowerCase());
        if (req.queryPassword() != null && !req.queryPassword().isBlank()) {
            order.setQueryPasswordHash(passwordEncoder.encode(req.queryPassword()));
        }
        if (!autoCard && !presale) order.setBuyerNote(manualSubmission);
        String queryToken = newQueryToken();
        order.setQueryTokenHash(passwordEncoder.encode(queryToken));
        order.setExpireAt(LocalDateTime.now().plusMinutes(expireMinutes()));
        order.setBuyerIp(buyerIp);
        order = orderRepository.save(order);
        if (presale) {
            presaleVoucherService.createForOrder(order, product);
        }
        if (Boolean.TRUE.equals(req.useWallet()) && memberId != null) {
            BigDecimal walletUse = walletService.balance(memberId)
                    .min(baseAmount.subtract(new BigDecimal("0.01"))).max(BigDecimal.ZERO);
            if (walletUse.signum() > 0) {
                walletService.debit(memberId, walletUse, WalletTxn.Type.PURCHASE,
                        "ORDER", order.getId(), "下单钱包抵扣 " + order.getOrderNo());
                order.setWalletPaidAmount(walletUse);
                order.setAmount(baseAmount.subtract(walletUse));
            }
        }
        return new CreatedOrder(order, queryToken, null);
    }

    static boolean meetsMinimumOrderAmount(Product product, int quantity) {
        BigDecimal minimum = product.getMinOrderAmount() == null ? BigDecimal.ZERO : product.getMinOrderAmount();
        return minimum.signum() <= 0
                || product.getPrice().multiply(BigDecimal.valueOf(quantity)).compareTo(minimum) >= 0;
    }

    /**
     * 钱包充值单:复用订单 + 全部支付渠道(支付页 /pay/{orderNo} 零改动)。
     * productId=0 占位(列 NOT NULL 且 ddl-auto=update 不放开约束),不占库存、不发卡。
     */
    @Transactional
    public Order createRecharge(Long memberId, BigDecimal amount, String ip, String email) {
        if (amount == null || amount.scale() > 2
                || amount.compareTo(BigDecimal.ONE) < 0
                || amount.compareTo(new BigDecimal("50000")) > 0) {
            throw new BusinessException(ErrorCode.RECHARGE_AMOUNT_INVALID);
        }
        Order order = new Order();
        order.setOrderNo(OrderNoGenerator.next());
        order.setOrderType(Order.OrderType.RECHARGE);
        order.setDeliveryMode(Order.DeliveryMode.AUTO_CARD);
        order.setMemberId(memberId);
        order.setProductId(0L);
        order.setProductName("钱包余额充值");
        order.setUnitPrice(amount);
        order.setQuantity(1);
        order.setAmount(amount);
        order.setContact(email);
        order.setExpireAt(LocalDateTime.now().plusMinutes(expireMinutes()));
        order.setBuyerIp(ip);
        return orderRepository.save(order);
    }

    /**
     * 人工补单:正常路径 PENDING → PAID;订单已超时(EXPIRED)时也允许补单 ——
     * 先 CAS EXPIRED → PAID,再回占库存(商品单;不足则抛错整体回滚,订单退回 EXPIRED)。
     * 场景:买家迟付/渠道掉单,钱实际到账但订单已被定时任务关闭。
     */
    @Transactional
    public boolean markPaidManually(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (markPaid(order.getId(), "MANUAL")) return true;

        int updated = orderRepository.casStatus(order.getId(), Order.Status.EXPIRED, Order.Status.PAID);
        if (updated != 1) return false; // 非 PENDING/EXPIRED(已支付/已关闭等),不可补
        restoreReleasedHoldsForManualPaid(order);
        orderRepository.findById(order.getId()).ifPresent(o -> {
            o.setPaidAt(LocalDateTime.now());
            o.setPaidChannel("MANUAL");
        });
        if (order.getOrderType() != Order.OrderType.RECHARGE
                && order.getDeliveryMode() == Order.DeliveryMode.AUTO_CARD
                && productRepository.reserveStock(order.getProductId(), order.getQuantity()) == 0) {
            // 库存已被卖光,无法补发:回滚整个事务(状态退回 EXPIRED),提示先补卡密/库存
            throw new BusinessException(ErrorCode.STOCK_NOT_ENOUGH);
        }
        evictProductCache();
        eventPublisher.publishEvent(new OrderPaidEvent(order.getId()));
        return true;
    }

    /** 人工关单:待支付单释放占用;超时单已释放,仅 CAS 终止后续补单。 */
    @Transactional
    public boolean closeManually(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getStatus() == Order.Status.EXPIRED) {
            // 超时处理已退还钱包/优惠券和库存,不得重复释放。
            return orderRepository.casStatus(order.getId(), Order.Status.EXPIRED, Order.Status.CLOSED) == 1;
        }
        if (order.getStatus() != Order.Status.PENDING) return false;
        int updated = orderRepository.casStatus(order.getId(), Order.Status.PENDING, Order.Status.CLOSED);
        if (updated == 1 && order.getOrderType() != Order.OrderType.RECHARGE
                && order.getDeliveryMode() == Order.DeliveryMode.AUTO_CARD) {
            productRepository.releaseStock(order.getProductId(), order.getQuantity());
            evictProductCache();
        }
        if (updated == 1) refundWalletHold(order, "订单关闭退回钱包抵扣");
        if (updated == 1) releaseCouponHold(order);
        if (updated == 1 && order.getDeliveryMode() == Order.DeliveryMode.PRESALE_VOUCHER) {
            presaleVoucherService.voidByOrder(order.getId());
        }
        return updated == 1;
    }

    /** 撤销充值:仅充值单;已入账则从会员可用余额扣回,余额不足时拒绝避免负数。 */
    @Transactional
    public boolean refundRechargeManually(String orderNo) {
        Order order = orderRepository.lockByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getOrderType() != Order.OrderType.RECHARGE) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "只有充值订单可以撤销充值");
        }
        if (order.getStatus() == Order.Status.REFUNDED) return false;
        if (order.getStatus() == Order.Status.DELIVERED) {
            walletService.debit(order.getMemberId(), order.getAmount(), WalletTxn.Type.RECHARGE_REVERSAL,
                    "ORDER", order.getId(), "撤销充值 " + order.getOrderNo());
        } else if (order.getStatus() != Order.Status.PAID) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID);
        }
        order.setStatus(Order.Status.REFUNDED);
        return true;
    }

    /** 管理员退款到会员钱包:支持部分多次退款,累计不超过订单实付总额。 */
    @Transactional
    public void refundToWallet(String orderNo, BigDecimal amount, String actor, String note) {
        Order order = orderRepository.lockByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getMemberId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "游客订单不支持退款到钱包");
        }
        if (order.getStatus() != Order.Status.PAID && order.getStatus() != Order.Status.DELIVERED) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "只有已支付订单可以退款到钱包");
        }
        if (amount == null || amount.scale() > 2 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "退款金额无效");
        }
        BigDecimal paidTotal = paidTotal(order);
        BigDecimal refunded = order.getWalletRefundedAmount() == null ? BigDecimal.ZERO : order.getWalletRefundedAmount();
        if (refunded.add(amount).compareTo(paidTotal) > 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "退款累计金额不能超过订单实付金额");
        }
        walletService.credit(order.getMemberId(), amount, WalletTxn.Type.ADMIN_REFUND,
                "ORDER", order.getId(), "订单退款到钱包 " + order.getOrderNo() + (note == null || note.isBlank() ? "" : ": " + note.trim()));
        order.setWalletRefundedAmount(refunded.add(amount));
    }

    /** 商品单补发:支付已确认但首次发卡失败时,补卡后从 PAID 重试分配卡密。 */
    @Transactional
    public boolean retryDeliverGoodsManually(String orderNo) {
        Order order = orderRepository.lockByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getOrderType() != Order.OrderType.GOODS) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "只有商品订单可以补发卡密");
        }
        if (order.getDeliveryMode() != Order.DeliveryMode.AUTO_CARD) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "人工发货订单请填写交付内容");
        }
        if (order.getStatus() != Order.Status.PAID) return false;
        cardService.allocate(order.getProductId(), order.getQuantity(), order.getId());
        order.setStatus(Order.Status.DELIVERED);
        order.setDeliveredAt(LocalDateTime.now());
        syncProductStock(order.getProductId());
        BigDecimal paidTotal = paidTotal(order);
        recordSpendSideEffects(order, paidTotal, "人工补发 " + order.getOrderNo());
        return true;
    }

    /** 人工发货:已支付商品单 → DELIVERED,交付内容写入订单快照供买家查单查看。 */
    @Transactional
    public boolean manualDeliver(String orderNo, String content, String staffNote, String operator) {
        Order order = orderRepository.lockByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (order.getOrderType() != Order.OrderType.GOODS
                || order.getDeliveryMode() != Order.DeliveryMode.MANUAL) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "只有人工发货商品订单可以人工交付");
        }
        if (order.getStatus() != Order.Status.PAID) return false;
        if (content == null || content.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "交付内容不能为空");
        }
        order.setManualDeliveryContent(content.trim());
        order.setStatus(Order.Status.DELIVERED);
        order.setDeliveredAt(LocalDateTime.now());
        OrderDeliveryRecord record = new OrderDeliveryRecord();
        record.setOrderId(order.getId());
        record.setOrderNo(order.getOrderNo());
        record.setContent(content.trim());
        record.setStaffNote(staffNote == null ? null : staffNote.trim());
        record.setOperator(operator);
        deliveryRecordRepository.save(record);
        BigDecimal paidTotal = paidTotal(order);
        recordSpendSideEffects(order, paidTotal, "人工发货 " + order.getOrderNo());
        return true;
    }

    /**
     * 幂等入账:CAS 更新状态,竞争回调只有一个成功;成功后发布 OrderPaidEvent 触发发卡。
     * 所有支付渠道(支付宝/易支付/链上)最终汇聚到这里。
     */
    @Transactional
    public boolean markPaid(Long orderId, String channelCode) {
        int updated = orderRepository.markPaidCas(orderId, LocalDateTime.now(), channelCode,
                Order.Status.PAID, Order.Status.PENDING);
        if (updated == 1) {
            eventPublisher.publishEvent(new OrderPaidEvent(orderId));
            return true;
        }
        return false;
    }

    /** 支付成功监听器:充值单入账钱包;商品单分配卡密 → DELIVERED(失败停留 PAID 可人工补发)。 */
    @EventListener
    @Transactional
    public void onPaid(OrderPaidEvent event) {
        Order order = orderRepository.findById(event.orderId()).orElseThrow();
        if (order.getStatus() != Order.Status.PAID) return;

        if (order.getOrderType() == Order.OrderType.RECHARGE) {
            // 充值:入账余额即交付。credit 幂等性由 markPaidCas 保证(同单只会走到这一次)
            walletService.credit(order.getMemberId(), order.getAmount(), WalletTxn.Type.RECHARGE,
                    "ORDER", order.getId(), "在线充值 " + order.getOrderNo());
            order.setStatus(Order.Status.DELIVERED);
            order.setDeliveredAt(LocalDateTime.now());
            recordRechargeSideEffects(order);
            return;
        }

        if (order.getDeliveryMode() == Order.DeliveryMode.MANUAL) {
            // 人工发货商品:支付确认即进入待后台处理状态,不尝试分配卡密。
            return;
        }
        if (order.getDeliveryMode() == Order.DeliveryMode.PRESALE_VOUCHER) {
            presaleVoucherService.activate(order.getId());
            order.setStatus(Order.Status.DELIVERED);
            order.setDeliveredAt(LocalDateTime.now());
            recordSpendSideEffects(order, paidTotal(order), "预售凭证 " + order.getOrderNo());
            return;
        }

        try {
            cardService.allocate(order.getProductId(), order.getQuantity(), order.getId());
            order.setStatus(Order.Status.DELIVERED);
            order.setDeliveredAt(LocalDateTime.now());
            syncProductStock(order.getProductId());
            // 推广佣金:仅商品消费产生,随发卡成功结算一次(重试补发不会重复,因状态已 DELIVERED)
            BigDecimal paidTotal = paidTotal(order);
            recordSpendSideEffects(order, paidTotal, "好友下单 " + order.getOrderNo());
        } catch (BusinessException e) {
            // 库存被并发买空:订单保持 PAID,后台告警人工处理(补卡后可重触发)
            log.error("deliver failed for order {}: {}", order.getOrderNo(), e.getMessage());
        }
    }

    /** 游客查单:订单号 + 联系方式(+ 可选查询密码)双凭证,防遍历。 */
    @Transactional(readOnly = true)
    public OrderView query(String orderNo, String contact, String queryPassword, String queryToken) {
        Order order = authorizeOrder(orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND)), contact, queryPassword, queryToken);
        return toView(order, order.getStatus() == Order.Status.DELIVERED);
    }

    /** 游客创建支付前必须证明自己持有订单凭证,避免仅凭订单号占用或操作他人支付流程。 */
    @Transactional(readOnly = true)
    public void authorizePayment(String orderNo, String contact, String queryPassword, String queryToken) {
        authorizeOrder(orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND)),
                contact, queryPassword, queryToken);
    }

    /** 收银台与加密支付接口共用：会员严格校验归属，游客校验订单凭证。 */
    @Transactional(readOnly = true)
    public Order authorizePaymentAccess(String orderNo, Long memberId, String contact,
                                        String queryPassword, String queryToken) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND));
        if (memberId != null) {
            if (!memberId.equals(order.getMemberId())) throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
            return order;
        }
        return authorizeOrder(order, contact, queryPassword, queryToken);
    }

    @Transactional
    public PresaleVoucherClaimResponse claimPresaleVoucherToken(String orderNo, String contact,
                                                               String queryPassword, String queryToken) {
        Order order = authorizeOrder(orderRepository.lockByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORDER_NOT_FOUND)), contact, queryPassword, queryToken);
        PresaleVoucherService.IssuedVoucher issued = presaleVoucherService.issueForPaidOrder(order);
        PresaleVoucher voucher = issued.voucher();
        return new PresaleVoucherClaimResponse(issued.token(), voucher.getTokenHint(), voucher.getStatus().name());
    }

    private Order authorizeOrder(Order order, String contact, String queryPassword, String queryToken) {
        if (queryToken != null && !queryToken.isBlank()) {
            if (order.getQueryTokenHash() != null && passwordEncoder.matches(queryToken, order.getQueryTokenHash())) {
                return order;
            }
            throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
        }
        if (contact == null || contact.isBlank()
                || !order.getContact().equalsIgnoreCase(contact.trim())) {
            throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
        }
        if (order.getQueryPasswordHash() != null) {
            if (queryPassword == null || !passwordEncoder.matches(queryPassword, order.getQueryPasswordHash())) {
                throw new BusinessException(ErrorCode.ORDER_NOT_FOUND);
            }
        }
        return order;
    }

    private static String newQueryToken() {
        byte[] bytes = new byte[32];
        TOKEN_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 关单任务:每分钟批量过期未支付订单并释放库存(200/批,避免长事务)。 */
    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void expireStaleOrders() {
        List<Order> stale = orderRepository.findTop200ByStatusAndExpireAtBefore(
                Order.Status.PENDING, LocalDateTime.now());
        int expired = 0;
        boolean releasedAutoStock = false;
        for (Order order : stale) {
            if (orderRepository.casStatus(order.getId(), Order.Status.PENDING, Order.Status.EXPIRED) != 1) {
                continue;
            }
            expired++;
            if (order.getOrderType() != Order.OrderType.RECHARGE
                    && order.getDeliveryMode() == Order.DeliveryMode.AUTO_CARD) { // 充值/人工单无库存可释放
                productRepository.releaseStock(order.getProductId(), order.getQuantity());
                releasedAutoStock = true;
            }
            if (order.getDeliveryMode() == Order.DeliveryMode.PRESALE_VOUCHER) {
                presaleVoucherService.voidByOrder(order.getId());
            }
            refundWalletHold(order, "订单超时退回钱包抵扣");
            releaseCouponHold(order);
        }
        if (releasedAutoStock) {
            evictProductCache();
        }
        if (expired > 0) log.info("expired {} stale orders", expired);
    }

    /** 会员中心「我的订单」:仅本人;已交付的商品单附带卡密。 */
    @Transactional(readOnly = true)
    public Page<OrderView> listByMember(Long memberId, int page, int size) {
        return orderRepository.findByMemberIdOrderByIdDesc(memberId,
                        PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 50)))
                .map(o -> toView(o, o.getStatus() == Order.Status.DELIVERED
                        && o.getOrderType() == Order.OrderType.GOODS));
    }

    public OrderView toView(Order order, boolean withCards) {
        boolean delivered = order.getStatus() == Order.Status.DELIVERED;
        boolean autoCard = order.getDeliveryMode() == Order.DeliveryMode.AUTO_CARD;
        boolean manual = order.getDeliveryMode() == Order.DeliveryMode.MANUAL;
        List<String> cards = withCards && autoCard ? cardService.decryptForOrder(order.getId()) : List.of();
        String usageNote = withCards ? productRepository.findById(order.getProductId())
                .map(Product::getUsageNote).orElse(null) : null;
        String deliveryContent = withCards && manual && delivered ? order.getManualDeliveryContent() : null;
        var voucher = order.getDeliveryMode() == Order.DeliveryMode.PRESALE_VOUCHER
                ? presaleVoucherService.findByOrder(order.getId()) : null;
        boolean showVoucher = voucher != null && delivered;
        return new OrderView(order.getOrderNo(), order.getProductName(), order.getUnitPrice(),
                order.getQuantity(), order.getAmount(), order.getDiscountAmount(), order.getWalletPaidAmount(),
                order.getStatus().name(), order.getPaidChannel(),
                order.getCreatedAt(), order.getExpireAt(), order.getPaidAt(), cards, usageNote,
                order.getDeliveryMode().name(), order.getBuyerNote(), deliveryContent,
                showVoucher ? voucher.getTokenHint() : null,
                showVoucher ? voucher.getStatus().name() : null,
                showVoucher ? voucher.getFulfillmentNote() : null,
                showVoucher ? voucher.getPresaleStartAt() : null,
                showVoucher ? voucher.getPresaleEndAt() : null);
    }

    private void refundWalletHold(Order order, String remark) {
        if (order.getMemberId() != null && order.getWalletPaidAmount() != null
                && order.getWalletPaidAmount().signum() > 0) {
            walletService.credit(order.getMemberId(), order.getWalletPaidAmount(), WalletTxn.Type.WALLET_ORDER_REFUND,
                    "ORDER", order.getId(), remark + " " + order.getOrderNo());
        }
    }

    private void releaseCouponHold(Order order) {
        if (order.getCouponCode() != null && !order.getCouponCode().isBlank()) {
            couponService.release(order.getCouponCode());
        }
    }

    private void restoreReleasedHoldsForManualPaid(Order order) {
        if (order.getMemberId() != null && order.getWalletPaidAmount() != null
                && order.getWalletPaidAmount().signum() > 0) {
            try {
                walletService.debit(order.getMemberId(), order.getWalletPaidAmount(), WalletTxn.Type.PURCHASE,
                        "ORDER", order.getId(), "过期订单补单重新扣回钱包抵扣 " + order.getOrderNo());
            } catch (BusinessException e) {
                if (e.getErrorCode() == ErrorCode.BALANCE_NOT_ENOUGH) {
                    throw new BusinessException(ErrorCode.BALANCE_NOT_ENOUGH,
                            "该超时订单的钱包抵扣已退回,但会员当前可用余额不足以重新扣回;请先让用户充值或人工调整余额后再补单");
                }
                throw e;
            }
        }
        if (order.getCouponCode() != null && !order.getCouponCode().isBlank()) {
            couponService.restoreUsage(order.getCouponCode());
        }
    }

    private void evictProductCache() {
        Cache cache = cacheManager.getCache("products");
        if (cache != null) cache.clear();
    }

    private BigDecimal paidTotal(Order order) {
        BigDecimal onlinePaid = order.getAmount() == null ? BigDecimal.ZERO : order.getAmount();
        BigDecimal walletPaid = order.getWalletPaidAmount() == null ? BigDecimal.ZERO : order.getWalletPaidAmount();
        return onlinePaid.add(walletPaid);
    }

    private void recordRechargeSideEffects(Order order) {
        try {
            memberLevelService.addRecharge(order.getMemberId(), order.getAmount());
        } catch (RuntimeException e) {
            log.warn("member recharge accounting failed, orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }
    }

    private void recordSpendSideEffects(Order order, BigDecimal paidTotal, String what) {
        try {
            memberLevelService.addSpend(order.getMemberId(), paidTotal);
        } catch (RuntimeException e) {
            log.warn("member spend accounting failed, orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }
        try {
            commissionService.onSpend(order.getMemberId(), paidTotal, "ORDER", order.getId(), what);
        } catch (RuntimeException e) {
            log.warn("commission accounting failed, orderNo={}: {}", order.getOrderNo(), e.getMessage());
        }
    }

    private void syncProductStock(Long productId) {
        inventoryService.syncAutoCardStock(productId);
    }
}
