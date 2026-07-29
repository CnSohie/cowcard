package com.hqyj.ka.order.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 预售无记名提货凭证:数据库只保存 tokenHash,不保存明文 Token。 */
@Entity
@Table(name = "presale_voucher", indexes = {
        @Index(name = "idx_voucher_hash", columnList = "tokenHash", unique = true),
        @Index(name = "idx_voucher_order", columnList = "orderId"),
        @Index(name = "idx_voucher_status", columnList = "status,presaleEndAt")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class PresaleVoucher {
    public enum Status { WAITING_PAYMENT, ACTIVE, REDEEMED, FULFILLED, EXPIRED, VOID }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long orderId;

    @Column(nullable = false, length = 32)
    private String orderNo;

    @Column(nullable = false)
    private Long productId;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(nullable = false, length = 20)
    private String tokenHint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.WAITING_PAYMENT;

    private LocalDateTime presaleStartAt;
    private LocalDateTime presaleEndAt;

    @Column(length = 16)
    private String settlementMode = "BALANCE";

    @Column(length = 128)
    private String redeemContact;

    private Long redeemMemberId;

    private LocalDateTime redeemedAt;
    private LocalDateTime fulfilledAt;

    @Column(columnDefinition = "TEXT")
    private String fulfillmentNote;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
