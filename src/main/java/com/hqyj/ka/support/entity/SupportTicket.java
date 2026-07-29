package com.hqyj.ka.support.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "support_ticket", indexes = {
        @Index(name = "idx_ticket_member", columnList = "memberId,id"),
        @Index(name = "idx_ticket_status", columnList = "status,updatedAt")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class SupportTicket {
    public enum Status { OPEN, WAITING_USER, ANSWERED, CLOSED }
    public enum Priority { LOW, NORMAL, HIGH }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long memberId;

    @Column(nullable = false, length = 128)
    private String subject;

    @Column(length = 32)
    private String category;

    @Column(length = 64)
    private String relatedOrderNo;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(columnDefinition = "TEXT")
    private String reply;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Priority priority = Priority.NORMAL;

    @Column(length = 64)
    private String repliedBy;

    private LocalDateTime repliedAt;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
