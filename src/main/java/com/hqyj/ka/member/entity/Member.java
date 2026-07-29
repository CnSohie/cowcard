package com.hqyj.ka.member.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.math.BigDecimal;

/**
 * 前台会员(与后台 sys_user 完全独立的账号体系,JWT 用 kind=member 硬隔离)。
 * 注意表名 "members":MEMBER 是 MySQL 8.0.17+ 保留字,用单数会建表失败。
 */
@Entity
@Table(name = "members", indexes = {
        @Index(name = "idx_member_email", columnList = "email", unique = true),
        @Index(name = "idx_member_invite", columnList = "inviteCode", unique = true),
        @Index(name = "idx_member_inviter", columnList = "inviterId")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 登录邮箱(存小写) */
    @Column(nullable = false, length = 128)
    private String email;

    /** bcrypt(12) */
    @Column(nullable = false, length = 100)
    private String password;

    @Column(length = 64)
    private String nickname;

    @Column(nullable = false)
    private boolean enabled = true;

    /** 防爆破:连续失败计数 + 锁定截止时间(与后台同策略) */
    @Column(nullable = false)
    private int failedAttempts = 0;

    private LocalDateTime lockedUntil;

    /** 刷新令牌版本:禁用/改密时轮换可强制下线 */
    @Column(nullable = false, length = 36)
    private String tokenVersion = "v1";

    /** 我的推广码(注册即生成,唯一) */
    @Column(nullable = false, length = 16)
    private String inviteCode;

    /** 推荐人(可空);佣金入其钱包 */
    private Long inviterId;

    /** 当前会员等级;为空时按默认等级兜底。 */
    private Long levelId;

    /** 自动升级指标:累计充值金额,只增不减。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal totalRecharge = BigDecimal.ZERO;

    /** 自动升级指标:累计商品/内容消费金额,只增不减。 */
    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal totalSpend = BigDecimal.ZERO;

    private LocalDateTime lastLoginAt;

    @Column(length = 45)
    private String lastLoginIp;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
