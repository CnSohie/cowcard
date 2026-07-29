package com.hqyj.ka.user.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 后台用户。买家为游客模式,不建账户(降低攻击面与存储成本)。 */
@Entity
@Table(name = "sys_user")
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    /** bcrypt(12) */
    @Column(nullable = false, length = 100)
    private String password;

    @Column(length = 64)
    private String nickname;

    @Column(nullable = false)
    private boolean enabled = true;

    /** 防爆破:连续失败计数 + 锁定截止时间 */
    @Column(nullable = false)
    private int failedAttempts = 0;

    private LocalDateTime lockedUntil;

    /** 刷新令牌版本号:改密/强制下线时轮换,旧 refresh 全部失效 */
    @Column(nullable = false, length = 36)
    private String tokenVersion = "v1";

    /** TOTP 2FA 预留(加密存储),升级点 */
    @Column(length = 128)
    private String totpSecret;

    @Column(nullable = false)
    private boolean totpEnabled = false;

    private LocalDateTime lastLoginAt;

    @Column(length = 45)
    private String lastLoginIp;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "sys_user_role",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    /** 角色码(ROLE_ 前缀)+ 全部权限码,构成认证主体的 authorities。 */
    public List<String> allAuthorityCodes() {
        List<String> codes = new ArrayList<>();
        for (Role r : roles) {
            codes.add("ROLE_" + r.getCode());
            r.getPermissions().forEach(p -> codes.add(p.getCode()));
        }
        return codes.stream().distinct().toList();
    }
}
