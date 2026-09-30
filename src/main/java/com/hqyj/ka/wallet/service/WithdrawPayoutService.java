package com.hqyj.ka.wallet.service;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.payment.crypto.FxRateService;
import com.hqyj.ka.wallet.entity.WithdrawRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
@RequiredArgsConstructor
public class WithdrawPayoutService {
    private final FxRateService fxRateService;

    public void snapshot(WithdrawRequest request) {
        if (request.getChannel().startsWith("USDT_")) {
            BigDecimal rate = fxRateService.getRate();
            if (rate == null || rate.signum() <= 0) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "提现汇率暂不可用,请稍后重试");
            }
            rate = rate.setScale(8, RoundingMode.HALF_UP);
            // 两条网络统一使用 6 位 USDT 小数,向下取整,不超出扣费后的人民币净额。
            BigDecimal payout = request.getNetAmount().divide(rate, 6, RoundingMode.DOWN);
            if (payout.signum() <= 0) throw new BusinessException(ErrorCode.BAD_REQUEST, "扣费后的 USDT 金额过小");
            request.setPayoutFxRate(rate);
            request.setPayoutCurrency("USDT");
            request.setPayoutAmount(payout.toPlainString());
        } else {
            request.setPayoutCurrency("CNY");
            request.setPayoutAmount(request.getNetAmount().setScale(2).toPlainString());
        }
    }
}
