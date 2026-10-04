package com.hqyj.ka.monitor;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 告警事件。只在打开、冷却后提醒和恢复时更新,不记录每次指标采样。 */
@Entity
@Table(name = "monitor_alert", indexes = {
        @Index(name = "idx_monitor_alert_status", columnList = "status,lastSeenAt"),
        @Index(name = "idx_monitor_alert_key", columnList = "alertKey,status")
})
@Getter
@Setter
@NoArgsConstructor
public class MonitorAlert {

    public enum Status { OPEN, RECOVERED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String alertKey;

    @Column(nullable = false, length = 80)
    private String title;

    @Column(nullable = false, length = 300)
    private String summary;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.OPEN;

    @Column(nullable = false)
    private LocalDateTime firstSeenAt;

    @Column(nullable = false)
    private LocalDateTime lastSeenAt;

    private LocalDateTime recoveredAt;

    private LocalDateTime ackedAt;

    @Column(length = 64)
    private String ackedBy;

    private LocalDateTime notifiedAt;

    private LocalDateTime recoveryNotifiedAt;
}
