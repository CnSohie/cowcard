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
 * 会员钱包(平台内统一余额:充值、买文章、佣金共用;链上不分配独立地址)。
 * 余额变动一律走仓库层原子 UPDATE(带余额充足守卫),杜绝读-改-写竞态;
 * 每笔变动同步写 WalletTxn 流水,余额可由流水完整重放对账。
 */
@Entity
@Table(name = "wallet_account", indexes = {
        @Index(name = "idx_wallet_member", columnList = "memberId", unique = true)
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class WalletAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long memberId;

    /** 可用总额(CNY),兼容购物抵扣;购物余额 = balance - withdrawableBalance。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal balance = BigDecimal.ZERO;

    /** 后台风控冻结总额,不含提现占用。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal frozen = BigDecimal.ZERO;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal withdrawableBalance = BigDecimal.ZERO;

    /** 风控冻结中属于可提现钱包的部分。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal withdrawableFrozen = BigDecimal.ZERO;

    /** 仅提现审核可操作,手工解冻不能触碰。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal withdrawalFrozen = BigDecimal.ZERO;

    public BigDecimal getShoppingBalance() { return balance.subtract(withdrawableBalance); }
    public BigDecimal getShoppingFrozen() { return frozen.subtract(withdrawableFrozen); }
    public BigDecimal getTotalFrozen() { return frozen.add(withdrawalFrozen); }

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
