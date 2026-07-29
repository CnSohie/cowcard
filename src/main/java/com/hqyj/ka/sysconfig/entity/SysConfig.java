package com.hqyj.ka.sysconfig.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 站点 K/V 配置(站名、公告、TG 客服等),带缓存。 */
@Entity
@Table(name = "sys_config")
@Getter @Setter @NoArgsConstructor
public class SysConfig {

    @Id
    @Column(length = 64)
    private String cfgKey;

    @Column(columnDefinition = "TEXT")
    private String cfgValue;

    public SysConfig(String k, String v) { this.cfgKey = k; this.cfgValue = v; }
}
