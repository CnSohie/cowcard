package com.hqyj.ka.payment;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 启动时收集全部策略 Bean,按渠道编码路由。 */
@Component
public class PaymentStrategyRegistry {

    private final Map<String, PaymentStrategy> strategies;

    public PaymentStrategyRegistry(List<PaymentStrategy> beans) {
        this.strategies = beans.stream()
                .collect(Collectors.toMap(PaymentStrategy::channelCode, Function.identity()));
    }

    public PaymentStrategy get(String channelCode) {
        PaymentStrategy s = strategies.get(channelCode);
        if (s == null) throw new BusinessException(ErrorCode.CHANNEL_DISABLED);
        return s;
    }
}
