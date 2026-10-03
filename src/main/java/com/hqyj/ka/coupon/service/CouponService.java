package com.hqyj.ka.coupon.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.coupon.entity.Coupon;
import com.hqyj.ka.coupon.repo.CouponRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class CouponService {

    private static final BigDecimal MIN_PAYABLE = new BigDecimal("0.01");

    private final CouponRepository couponRepository;

    /** 只算不核销(前台预览)。返回折扣金额。 */
    @Transactional(readOnly = true)
    public BigDecimal preview(String code, BigDecimal orderAmount, Long productId) {
        return calc(load(code, orderAmount, productId), orderAmount);
    }

    /** 校验 + 原子核销(订单事务内调用)。返回折扣金额。 */
    @Transactional
    public BigDecimal redeem(String code, BigDecimal orderAmount, Long productId) {
        Coupon coupon = load(code, orderAmount, productId);
        if (couponRepository.redeem(coupon.getId(), productId, LocalDateTime.now()) == 0) {
            throw new BusinessException(ErrorCode.COUPON_INVALID);
        }
        return calc(coupon, orderAmount);
    }

    /** 待支付订单关闭/超时后释放优惠券占用;已支付订单不调用。 */
    @Transactional
    public void release(String code) {
        if (code == null || code.isBlank()) return;
        couponRepository.release(code.trim().toUpperCase());
    }

    /** 过期订单被确认迟到支付并人工补单时,恢复原订单的优惠券用量统计。 */
    @Transactional
    public void restoreUsage(String code) {
        if (code == null || code.isBlank()) return;
        couponRepository.restoreUsage(code.trim().toUpperCase());
    }

    private Coupon load(String code, BigDecimal orderAmount, Long productId) {
        Coupon coupon = couponRepository.findByCodeAndEnabledTrue(code.trim().toUpperCase())
                .orElseThrow(() -> new BusinessException(ErrorCode.COUPON_INVALID));
        if (coupon.getExpireAt() != null && !coupon.getExpireAt().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.COUPON_INVALID);
        }
        if (coupon.getProductId() != null && !coupon.getProductId().equals(productId)) {
            throw new BusinessException(ErrorCode.COUPON_INVALID, "该优惠码不适用于此商品");
        }
        if (coupon.getTotalLimit() > 0 && coupon.getUsedCount() >= coupon.getTotalLimit()) {
            throw new BusinessException(ErrorCode.COUPON_INVALID);
        }
        if (orderAmount.compareTo(coupon.getMinAmount()) < 0) {
            throw new BusinessException(ErrorCode.COUPON_MIN_NOT_MET);
        }
        return coupon;
    }

    /** 折扣封顶到 应付-0.01:支付渠道均不支持 0 元单,免单场景走后台手工发货。 */
    private BigDecimal calc(Coupon coupon, BigDecimal orderAmount) {
        BigDecimal discount = coupon.getType() == Coupon.Type.FIXED
                ? coupon.getValue()
                : orderAmount.multiply(coupon.getValue())
                    .divide(new BigDecimal("100"), 2, RoundingMode.DOWN);
        BigDecimal cap = orderAmount.subtract(MIN_PAYABLE);
        if (discount.compareTo(cap) > 0) discount = cap;
        return discount.max(BigDecimal.ZERO);
    }
}
