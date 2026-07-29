package com.hqyj.ka.wallet.service;

import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.wallet.entity.WalletTxn;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 推广佣金:被邀请会员的「消费」(商品单/付费文章)按比例入邀请人钱包;充值绝不计佣。
 * 警示:不得把 walletService.credit 包进 try/catch —— credit 的 @Transactional 代理里抛出的
 * 异常已把当前事务标记 rollback-only,吞掉后提交时会 UnexpectedRollbackException 连累支付结算。
 * 仅费率解析允许容错(配置错写不应打断结算)。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CommissionService {

    public static final String CFG_RATE = "commission.rate";

    private final MemberRepository memberRepository;
    private final WalletService walletService;
    private final ConfigService configService;

    /** 佣金比例(百分数,0~100;默认 0 = 关闭)。 */
    public BigDecimal rate() {
        try {
            BigDecimal r = new BigDecimal(configService.all().getOrDefault(CFG_RATE, "0").trim());
            return (r.signum() < 0 || r.compareTo(new BigDecimal("100")) > 0) ? BigDecimal.ZERO : r;
        } catch (NumberFormatException e) {
            log.warn("commission.rate 配置无法解析,按 0 处理");
            return BigDecimal.ZERO;
        }
    }

    /**
     * 消费结算钩子(与支付结算同事务:佣金与订单交付原子一致)。
     * memberId 为消费者(可空=游客,无佣金);金额 × 费率 ÷ 100,保留 2 位向下取整。
     */
    public void onSpend(Long memberId, BigDecimal amount, String refType, Long refId, String what) {
        if (memberId == null || amount == null || amount.signum() <= 0) return;
        BigDecimal r = rate();
        if (r.signum() <= 0) return;
        Member consumer = memberRepository.findById(memberId).orElse(null);
        if (consumer == null || consumer.getInviterId() == null) return;
        Member inviter = memberRepository.findById(consumer.getInviterId())
                .filter(Member::isEnabled).orElse(null);
        if (inviter == null) return;
        BigDecimal commission = amount.multiply(r).divide(new BigDecimal("100"), 2, RoundingMode.DOWN);
        if (commission.signum() <= 0) return;
        walletService.credit(inviter.getId(), commission, WalletTxn.Type.COMMISSION,
                refType, refId, "推广佣金:" + what);
    }
}
