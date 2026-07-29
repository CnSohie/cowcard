package com.hqyj.ka.user.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.dto.UserDtos.RoleView;
import com.hqyj.ka.user.dto.UserDtos.SaveRoleRequest;
import com.hqyj.ka.user.entity.Permission;
import com.hqyj.ka.user.service.AuthService;
import com.hqyj.ka.user.service.UserAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
public class AdminRoleController {

    private final UserAdminService userAdminService;
    private final AuthService authService;
    private final AuditService auditService;

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAnyAuthority('role:manage','user:manage')")
    public ApiResponse<List<RoleView>> roles() {
        return ApiResponse.ok(userAdminService.roles());
    }

    @GetMapping("/permissions")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('role:manage')")
    public ApiResponse<List<Permission>> permissions() {
        return ApiResponse.ok(userAdminService.permissions());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('role:manage')")
    public ApiResponse<RoleView> save(@Valid @RequestBody SaveRoleRequest req, HttpServletRequest http) {
        String ip = RateLimitFilter.clientIp(http);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.authPassword(), req.totpCode(),
                "role-save:" + req.code(), ip);
        RoleView view = userAdminService.saveRole(req);
        auditService.record((String) http.getAttribute("uname"), "ROLE_SAVE", "role", ip, req.code());
        return ApiResponse.ok(view);
    }
}
