package com.hqyj.ka.order.service;

import com.hqyj.ka.card.service.CardService;
import com.hqyj.ka.catalog.entity.Product;
import com.hqyj.ka.catalog.repo.ProductRepository;
import com.hqyj.ka.catalog.service.InventoryService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.entity.Order;
import com.hqyj.ka.order.entity.PresaleVoucher;
import com.hqyj.ka.order.repo.OrderRepository;
import com.hqyj.ka.order.repo.PresaleVoucherRepository;
import com.hqyj.ka.wallet.entity.WalletTxn;
import com.hqyj.ka.wallet.service.WalletService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PresaleVoucherService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PENDING_TOKEN_HINT = "付款后签发";

    private final PresaleVoucherRepository voucherRepository;
    private final OrderRepository orderRepository;
    private final CardService cardService;
    private final ProductRepository productRepository;
    private final WalletService walletService;
    private final InventoryService inventoryService;

    public record IssuedVoucher(PresaleVoucher voucher, String token) {}
    public record RedeemResult(String status, String message, List<String> cards, String workNo) {}
    public record VoucherView(String workNo, String orderNo, String productName, int quantity,
                              String status, String tokenHint, String redeemContact, String fulfillmentNote,
                              LocalDateTime presaleStartAt, LocalDateTime presaleEndAt,
                              LocalDateTime redeemedAt, LocalDateTime fulfilledAt,
                              List<String> cards) {}

    @Transactional
    public PresaleVoucher createForOrder(Order order, Product product) {
        PresaleVoucher v = new PresaleVoucher();
        v.setOrderId(order.getId());
        v.setOrderNo(order.getOrderNo());
        v.setProductId(order.getProductId());
        v.setQuantity(order.getQuantity());
        // 未付款阶段只创建不可兑换的占位哈希,不向前端签发明文提货码。
        v.setTokenHash(sha256("pending:" + order.getOrderNo() + ":" + newToken()));
        v.setTokenHint(PENDING_TOKEN_HINT);
        v.setPresaleStartAt(product.getPresaleStartAt());
        v.setPresaleEndAt(product.getPresaleEndAt());
        v.setSettlementMode(product.getPresaleSettlementMode());
        return voucherRepository.save(v);
    }

    @Transactional
    public IssuedVoucher issueForPaidOrder(Order order) {
        if (order.getOrderType() != Order.OrderType.GOODS
                || order.getDeliveryMode() != Order.DeliveryMode.PRESALE_VOUCHER
                || order.getStatus() != Order.Status.DELIVERED) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "订单尚未完成付款,不能签发提货码");
        }
        PresaleVoucher existing = voucherRepository.findLockedByOrderId(order.getId()).orElse(null);
        if (existing != null) {
            if (existing.getStatus() == PresaleVoucher.Status.ACTIVE && existing.getTokenClaimedAt() == null) {
                String token = newToken();
                existing.setTokenHash(sha256(token));
                existing.setTokenHint(hint(token));
                existing.setTokenClaimedAt(LocalDateTime.now());
                return new IssuedVoucher(existing, token);
            }
            return new IssuedVoucher(existing, null);
        }
        Product product = productRepository.findById(order.getProductId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "商品不存在"));
        LocalDateTime now = LocalDateTime.now();
        if (product.getPresaleEndAt() != null && now.isAfter(product.getPresaleEndAt())) {
            throw new BusinessException(ErrorCode.ORDER_EXPIRED, "已超过最晚提货截止时间,请联系售后处理");
        }
        String token = newToken();
        PresaleVoucher v = new PresaleVoucher();
        v.setOrderId(order.getId());
        v.setOrderNo(order.getOrderNo());
        v.setProductId(order.getProductId());
        v.setQuantity(order.getQuantity());
        v.setTokenHash(sha256(token));
        v.setTokenHint(hint(token));
        v.setTokenClaimedAt(LocalDateTime.now());
        v.setPresaleStartAt(product.getPresaleStartAt());
        v.setPresaleEndAt(product.getPresaleEndAt());
        v.setSettlementMode(product.getPresaleSettlementMode());
        v.setStatus(PresaleVoucher.Status.ACTIVE);
        return new IssuedVoucher(voucherRepository.save(v), token);
    }

    @Transactional
    public void activate(Long orderId) {
        voucherRepository.findByOrderId(orderId).ifPresent(v -> {
            if (v.getStatus() == PresaleVoucher.Status.WAITING_PAYMENT || v.getStatus() == PresaleVoucher.Status.VOID) {
                v.setStatus(PresaleVoucher.Status.ACTIVE);
            }
        });
    }

    @Transactional
    public void voidByOrder(Long orderId) {
        voucherRepository.findByOrderId(orderId).ifPresent(v -> {
            if (v.getStatus() == PresaleVoucher.Status.WAITING_PAYMENT || v.getStatus() == PresaleVoucher.Status.ACTIVE) {
                v.setStatus(PresaleVoucher.Status.VOID);
            }
        });
    }

    @Transactional(readOnly = true)
    public PresaleVoucher findByOrder(Long orderId) {
        return voucherRepository.findByOrderId(orderId).orElse(null);
    }

    @Transactional
    public RedeemResult redeem(String token, Long memberId, String contact) {
        if (memberId == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "请先注册或登录会员账号后再核销提货码");
        }
        String cleaned = token == null ? "" : token.trim();
        if (cleaned.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "请输入电子预售提货码");
        PresaleVoucher v = voucherRepository.findByTokenHash(sha256(cleaned))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "提货码不存在或已失效"));
        LocalDateTime now = LocalDateTime.now();
        if (v.getStatus() == PresaleVoucher.Status.WAITING_PAYMENT) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "该提货码对应订单尚未完成付款");
        }
        if (v.getPresaleEndAt() != null && now.isAfter(v.getPresaleEndAt())) {
            v.setStatus(PresaleVoucher.Status.EXPIRED);
            throw new BusinessException(ErrorCode.ORDER_EXPIRED, "提货码已超过最晚提货截止时间");
        }
        if (v.getStatus() != PresaleVoucher.Status.ACTIVE) {
            throw new BusinessException(ErrorCode.ORDER_STATE_INVALID, "提货码已核销或已失效");
        }
        v.setStatus(PresaleVoucher.Status.REDEEMED);
        v.setRedeemMemberId(memberId);
        v.setRedeemContact(contact == null ? null : contact.trim());
        v.setRedeemedAt(now);
        if (v.getPresaleStartAt() != null && now.isBefore(v.getPresaleStartAt())) {
            v.setFulfillmentNote("已提前核销并绑定会员,等待开放提货时间后自动尝试交付");
            return new RedeemResult("REDEEMED", "提货码已提前核销并绑定当前会员,请在会员中心查看发货状态。", List.of(), workNo(v));
        }
        return tryFulfill(v, "提货码已锁定并销毁,当前等待补货交付。");
    }

    @Transactional(readOnly = true)
    public List<VoucherView> listForMember(Long memberId) {
        if (memberId == null) return List.of();
        return voucherRepository.findByRedeemMemberIdOrderByIdDesc(memberId).stream()
                .map(v -> toView(v, v.getStatus() == PresaleVoucher.Status.FULFILLED))
                .toList();
    }

    private VoucherView toView(PresaleVoucher v, boolean withCards) {
        Order order = orderRepository.findById(v.getOrderId()).orElse(null);
        List<String> cards = withCards ? cardService.decryptForOrder(v.getOrderId()) : List.of();
        return new VoucherView(workNo(v), v.getOrderNo(), order == null ? "预售商品" : order.getProductName(),
                v.getQuantity(), v.getStatus().name(), v.getTokenHint(), v.getRedeemContact(),
                v.getFulfillmentNote(), v.getPresaleStartAt(), v.getPresaleEndAt(),
                v.getRedeemedAt(), v.getFulfilledAt(), cards);
    }

    private RedeemResult tryFulfill(PresaleVoucher v, String pendingMessage) {
        try {
            cardService.allocate(v.getProductId(), v.getQuantity(), v.getOrderId());
            List<String> cards = cardService.decryptForOrder(v.getOrderId());
            v.setStatus(PresaleVoucher.Status.FULFILLED);
            v.setFulfilledAt(LocalDateTime.now());
            v.setFulfillmentNote("核销即刻交付");
            syncProductStock(v.getProductId());
            return new RedeemResult("FULFILLED", "提货成功,凭证已销毁。", cards, workNo(v));
        } catch (BusinessException e) {
            v.setFulfillmentNote("已核销,等待商家补货后定向交付");
            return new RedeemResult("REDEEMED", pendingMessage, List.of(), workNo(v));
        }
    }

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void expireUnredeemed() {
        LocalDateTime now = LocalDateTime.now();
        for (PresaleVoucher v : voucherRepository.findTop100ByStatusAndPresaleStartAtBeforeOrderByIdAsc(
                PresaleVoucher.Status.REDEEMED, now)) {
            tryFulfill(v, "已核销,等待商家补货后定向交付。");
        }
        for (PresaleVoucher v : voucherRepository.findTop200ByStatusInAndPresaleEndAtBefore(
                List.of(PresaleVoucher.Status.ACTIVE, PresaleVoucher.Status.REDEEMED), now)) {
            settleExpired(v);
        }
    }

    private void settleExpired(PresaleVoucher v) {
        Order order = orderRepository.findById(v.getOrderId()).orElse(null);
        boolean redeemedButNotFulfilled = v.getStatus() == PresaleVoucher.Status.REDEEMED;
        String mode = v.getSettlementMode() == null ? "BALANCE" : v.getSettlementMode();
        v.setStatus(PresaleVoucher.Status.EXPIRED);

        if (order == null) {
            v.setFulfillmentNote("超过最晚提货截止时间,订单不存在,请人工核对");
            return;
        }
        if (order.getStatus() == Order.Status.REFUNDED) {
            v.setFulfillmentNote("超过最晚提货截止时间,订单已退款");
            return;
        }

        BigDecimal paidTotal = order.getAmount().add(order.getWalletPaidAmount());
        if ("BALANCE".equals(mode) || redeemedButNotFulfilled) {
            Long refundMemberId = redeemedButNotFulfilled ? v.getRedeemMemberId() : order.getMemberId();
            if (refundMemberId != null) {
                walletService.credit(refundMemberId, paidTotal, WalletTxn.Type.ADMIN_REFUND,
                        "ORDER", order.getId(), (redeemedButNotFulfilled ? "预售履约超时退回余额 " : "预售过期清算转余额 ") + order.getOrderNo());
                order.setStatus(Order.Status.REFUNDED);
                v.setFulfillmentNote(redeemedButNotFulfilled
                        ? "已核销但超过最晚提货截止时间仍未交付,已按履约违约退回会员余额"
                        : "超过最晚提货截止时间未核销,已按清算规则转入会员余额");
            } else {
                v.setFulfillmentNote(redeemedButNotFulfilled
                        ? "已核销但超过最晚提货截止时间仍未交付,游客订单需管理员人工退款/补偿"
                        : "超过最晚提货截止时间未核销,游客订单无法自动转余额,需管理员人工清算");
            }
            return;
        }

        if ("REFUND".equals(mode)) {
            v.setFulfillmentNote("超过最晚提货截止时间未核销,已进入原路退款待处理队列");
        } else {
            v.setFulfillmentNote("超过最晚提货截止时间未核销,按沉淀清算规则关闭凭证");
        }
    }

    private String workNo(PresaleVoucher v) {
        return "PV-" + v.getId();
    }

    private void syncProductStock(Long productId) {
        inventoryService.syncAutoCardStock(productId);
    }

    private String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return "PV-" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hint(String token) {
        return token.substring(0, 8) + "..." + token.substring(token.length() - 4);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
