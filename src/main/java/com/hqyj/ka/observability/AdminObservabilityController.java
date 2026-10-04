package com.hqyj.ka.observability;

import com.hqyj.ka.common.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 与概览同一权限,不新增权限码,避免管理员为了看运行状态重新登录。 */
@RestController
@RequestMapping("/api/admin/observability")
public class AdminObservabilityController {

    private final OpsQueryService ops;

    public AdminObservabilityController(OpsQueryService ops) {
        this.ops = ops;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('dashboard:read')")
    public ApiResponse<OpsSnapshot> snapshot() {
        return ApiResponse.ok(ops.snapshot());
    }
}
