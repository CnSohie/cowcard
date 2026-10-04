package com.hqyj.ka.payment.crypto.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 每条链的扫描游标:崩溃重启后从上次高度续扫,不漏账。同时留下最近成功时间和连续失败次数。 */
@Entity
@Table(name = "chain_cursor")
@Getter @Setter @NoArgsConstructor
public class ChainCursor {

    @Id
    @Column(length = 16)
    private String chainCode;

    @Column(nullable = false)
    private long scannedBlock;

    private LocalDateTime lastSuccessAt;

    private LocalDateTime lastFailureAt;

    @Column(nullable = false)
    private int consecutiveFailures;

    @Column(length = 180)
    private String lastError;

    /** 上次成功扫描时链头减去已扫高度。页面只读这个数,不再为刷新去打 RPC。 */
    private Long lastBlockLag;

    public ChainCursor(String chainCode, long scannedBlock) {
        this.chainCode = chainCode;
        this.scannedBlock = scannedBlock;
    }
}
