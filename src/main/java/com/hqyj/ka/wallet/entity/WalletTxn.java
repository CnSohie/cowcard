package com.hqyj.ka.wallet.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 钱包流水(append-only 账本,不可修改;amount 带符号,balanceAfter 供对账)。 */
@Entity
@Table(name = "wallet_txn", indexes = {
        @Index(name = "idx_txn_member", columnList = "memberId,id")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class WalletTxn {

    /**
     * RECHARGE=在线充值入账;PURCHASE=消费(买文章);COMMISSION=推广佣金入账;
     * WITHDRAW_FREEZE=提现申请冻结(出可用);WITHDRAW_REJECT=提现驳回解冻(回可用);
     * ADMIN_FREEZE/ADMIN_UNFREEZE=管理员风控冻结/解冻;RECHARGE_REVERSAL=撤销充值;
     * WALLET_ORDER_REFUND=订单未完成退回钱包抵扣;ADMIN_REFUND=管理员退款到钱包;GIFT_CARD=礼品卡兑换。
     * ADJUST=管理员手工调账。提现打款成功不再记流水(WithdrawRequest 即打款凭证)。
     */
    public enum Type {
        RECHARGE, PURCHASE, COMMISSION, WITHDRAW_FREEZE, WITHDRAW_REJECT,
        ADMIN_FREEZE, ADMIN_UNFREEZE, RECHARGE_REVERSAL, WALLET_ORDER_REFUND,
        ADMIN_REFUND, GIFT_CARD, ADJUST
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    /** 带符号金额:入账为正,出账为负 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal amount;

    /** 本笔完成后的可用余额快照 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal balanceAfter;

    /** 两个可用钱包的本笔变动;历史流水留 NULL,保持历史账本不改写。 */
    @Column(precision = 20, scale = 2)
    private BigDecimal shoppingAmount;

    @Column(precision = 20, scale = 2)
    private BigDecimal withdrawableAmount;

    @Column(precision = 20, scale = 2)
    private BigDecimal shoppingBalanceAfter;

    @Column(precision = 20, scale = 2)
    private BigDecimal withdrawableBalanceAfter;

    /** 关联单据类型(ORDER / ARTICLE / WITHDRAW / MANUAL) */
    @Column(length = 16)
    private String refType;

    private Long refId;

    @Column(length = 255)
    private String remark;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
