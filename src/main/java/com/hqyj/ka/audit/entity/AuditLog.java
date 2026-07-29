package com.hqyj.ka.audit.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 审计日志:只插不改不删,管理端全部写操作与登录事件留痕。 */
@Entity
@Table(name = "audit_log", indexes = {
        @Index(name = "idx_audit_actor", columnList = "actor"),
        @Index(name = "idx_audit_time", columnList = "createdAt")
})
@Getter @Setter @NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String actor;

    /** 动作码,如 LOGIN_SUCCESS / PRODUCT_UPDATE / CARD_IMPORT */
    @Column(nullable = false, length = 64)
    private String action;

    @Column(nullable = false, length = 128)
    private String resource;

    @Column(length = 45)
    private String ip;

    /** 变更摘要(JSON,已脱敏) */
    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
