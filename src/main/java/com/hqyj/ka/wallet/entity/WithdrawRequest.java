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

    /** 收款渠道(ALIPAY / USDT / BANK…,自由文本) */
    @Column(nullable = false, length = 32)
    private String channel;

    /** 收款账号 */
    @Column(nullable = false, length = 128)
    private String account;

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
