package com.hqyj.ka.order.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/** 人工交付记录:可多次追加,用于追踪交付历史和客服备注。 */
@Entity
@Table(name = "order_delivery_record", indexes = {
        @Index(name = "idx_delivery_order", columnList = "orderId,id")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor
public class OrderDeliveryRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long orderId;

    @Column(nullable = false, length = 32)
    private String orderNo;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(columnDefinition = "TEXT")
    private String staffNote;

    @Column(length = 64)
    private String operator;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
