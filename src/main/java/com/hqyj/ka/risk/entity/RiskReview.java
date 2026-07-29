package com.hqyj.ka.risk.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "risk_review", indexes = {
        @Index(name = "idx_risk_status", columnList = "status,severity"),
        @Index(name = "idx_risk_source", columnList = "sourceType,sourceId")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class RiskReview {
    public enum Status { PENDING, APPROVED, REJECTED, CLOSED }
    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String sourceType;

    @Column(length = 64)
    private String sourceId;

    @Column(nullable = false, length = 128)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Severity severity = Severity.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.PENDING;

    @Column(length = 64)
    private String createdBy;

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
