package com.hqyj.ka.user.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.common.PageResult;
import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.dto.UserDtos.*;
import com.hqyj.ka.user.service.AuthService;
import com.hqyj.ka.user.service.UserAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final UserAdminService userAdminService;
    private final AuthService authService;
    private final AuditService auditService;

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('user:manage')")
    public ApiResponse<PageResult<UserView>> list(@RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(PageResult.of(
                userAdminService.list(PageRequest.of(page, Math.min(size, 100), Sort.by(Sort.Direction.DESC, "id")))));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('user:manage')")
    public ApiResponse<UserView> create(@Valid @RequestBody CreateUserRequest req, HttpServletRequest http) {
        String ip = RateLimitFilter.clientIp(http);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.authPassword(), req.totpCode(),
                "admin-user-create:" + req.username(), ip);
        UserView view = userAdminService.create(req);
        auditService.record((String) http.getAttribute("uname"), "ADMIN_USER_CREATE", "user", ip, req.username());
        return ApiResponse.ok(view);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasAuthority('user:manage')")
    public ApiResponse<UserView> update(@PathVariable Long id, @Valid @RequestBody UpdateUserRequest req,
                                        HttpServletRequest http) {
        String ip = RateLimitFilter.clientIp(http);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.authPassword(), req.totpCode(),
                "admin-user-update:" + id, ip);
        UserView view = userAdminService.update(id, req);
        auditService.record((String) http.getAttribute("uname"), "ADMIN_USER_UPDATE", "user", ip, String.valueOf(id));
        return ApiResponse.ok(view);
    }
}
