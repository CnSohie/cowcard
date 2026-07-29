package com.hqyj.ka.payment.crypto.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 每条链的扫描游标:崩溃重启后从上次高度续扫,不漏账。 */
@Entity
@Table(name = "chain_cursor")
@Getter @Setter @NoArgsConstructor
public class ChainCursor {

    @Id
    @Column(length = 16)
    private String chainCode;

    @Column(nullable = false)
    private long scannedBlock;

    public ChainCursor(String chainCode, long scannedBlock) {
        this.chainCode = chainCode;
        this.scannedBlock = scannedBlock;
    }
}
