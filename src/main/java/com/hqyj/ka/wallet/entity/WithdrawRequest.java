package com.hqyj.ka.wallet.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 提现申请(人工审核制)。
 * 生命周期:申请(冻结余额)→ 通过(核销冻结,线下打款)/ 驳回(解冻退回)。
 * 状态流转用 CAS(WithdrawRequestRepository.casStatus)防两名管理员并发双审。
 */
@Entity
@Table(name = "withdraw_request", indexes = {
        @Index(name = "idx_withdraw_member", columnList = "memberId,id"),
        @Index(name = "idx_withdraw_status", columnList = "status,id")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class WithdrawRequest {

    public enum Status { PENDING, APPROVED, REJECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long memberId;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal amount;

    /** 手续费从申请金额中扣除;人民币净额 = amount - feeAmount;USDT 打款另存快照。 */
    @Column(precision = 20, scale = 2)
    private BigDecimal feeAmount = BigDecimal.ZERO;

    @Column(precision = 20, scale = 2)
    private BigDecimal netAmount;

    /** 申请时固定的实际打款金额(十进制字符串,避免 JSON 浮点丢失精度)。 */
    @Column(length = 64)
    private String payoutAmount;

    @Column(length = 8)
    private String payoutCurrency;

    /** 1 USDT 对应人民币金额,申请后不随汇率刷新变化。 */
    @Column(precision = 20, scale = 8)
    private BigDecimal payoutFxRate;

    /** 旧申请来自旧余额,驳回退回购物钱包;新申请只能来自可提现钱包。 */
    @Column(nullable = false)
    private boolean withdrawableSource = true;

    /** 管理员允许的固定渠道编码。 */
    @Column(nullable = false, length = 32)
    private String channel;

    /** 收款账号 */
    @Column(nullable = false, length = 128)
    private String account;

    /** 支付宝实名 / 银行卡持卡人。 */
    @Column(length = 50)
    private String accountName;

    /** 银行卡开户银行。 */
    @Column(length = 80)
    private String bankName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    /** 审核人(后台用户名) */
    @Column(length = 64)
    private String reviewedBy;

    @Column(length = 255)
    private String reviewNote;

    private LocalDateTime reviewedAt;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
