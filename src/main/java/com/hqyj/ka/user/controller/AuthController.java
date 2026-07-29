package com.hqyj.ka.user.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.dto.AuthDtos.*;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ApiResponse<TokenResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        return ApiResponse.ok(authService.login(req, RateLimitFilter.clientIp(http)));
    }

    @PostMapping("/refresh")
    public ApiResponse<TokenResponse> refresh(@Valid @RequestBody RefreshRequest req) {
        return ApiResponse.ok(authService.refresh(req.refreshToken()));
    }

    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest req, HttpServletRequest http) {
        Long uid = (Long) http.getAttribute("uid");
        authService.changePassword(uid, req.oldPassword(), req.newPassword(), RateLimitFilter.clientIp(http));
        return ApiResponse.ok();
    }
}
