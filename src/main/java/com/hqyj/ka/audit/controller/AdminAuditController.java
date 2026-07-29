package com.hqyj.ka.audit.controller;

import com.hqyj.ka.audit.entity.AuditLog;
import com.hqyj.ka.audit.repo.AuditLogRepository;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/audit")
@RequiredArgsConstructor
public class AdminAuditController {

    private final AuditLogRepository auditLogRepository;

    @GetMapping
    @PreAuthorize("hasAuthority('audit:read')")
    public ApiResponse<PageResult<AuditLog>> list(@RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "50") int size) {
        return ApiResponse.ok(PageResult.of(auditLogRepository.findAll(
                PageRequest.of(page, Math.min(size, 200), Sort.by(Sort.Direction.DESC, "id")))));
    }
}
