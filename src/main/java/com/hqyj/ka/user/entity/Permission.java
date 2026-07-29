package com.hqyj.ka.user.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 细粒度权限点,如 product:write / card:read / payment:config。 */
@Entity
@Table(name = "sys_permission")
@Getter @Setter @NoArgsConstructor
public class Permission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(length = 32)
    private String groupName;

    public Permission(String code, String name, String groupName) {
        this.code = code; this.name = name; this.groupName = groupName;
    }
}
