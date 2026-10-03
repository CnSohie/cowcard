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

    @GetMapping("/profile")
    public ApiResponse<ProfileResponse> profile(HttpServletRequest http) {
        return ApiResponse.ok(new ProfileResponse(authService.currentUsername((Long) http.getAttribute("uid"))));
    }

    @PostMapping("/change-username")
    public ApiResponse<Void> changeUsername(@Valid @RequestBody ChangeUsernameRequest req, HttpServletRequest http) {
        try {
            authService.changeUsername((Long) http.getAttribute("uid"), req.username(), req.password(),
                    req.totpCode(), RateLimitFilter.clientIp(http));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new com.hqyj.ka.common.BusinessException(com.hqyj.ka.common.ErrorCode.BAD_REQUEST, "该用户名不可用，请换一个重试");
        }
        return ApiResponse.ok();
    }

    @PostMapping("/change-password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest req, HttpServletRequest http) {
        Long uid = (Long) http.getAttribute("uid");
        authService.changePassword(uid, req.oldPassword(), req.newPassword(), RateLimitFilter.clientIp(http));
        return ApiResponse.ok();
    }
}
