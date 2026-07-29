package com.hqyj.ka.member.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.member.dto.MemberDtos.LoginRequest;
import com.hqyj.ka.member.dto.MemberDtos.MemberTokenResponse;
import com.hqyj.ka.member.dto.MemberDtos.RefreshRequest;
import com.hqyj.ka.member.dto.MemberDtos.RegisterRequest;
import com.hqyj.ka.member.service.MemberAuthService;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 会员认证(permitAll;POST 走 mauth 限流档,防撞库/批量注册)。 */
@RestController
@RequestMapping("/api/member/auth")
@RequiredArgsConstructor
public class MemberAuthController {

    private final MemberAuthService memberAuthService;

    @PostMapping("/register")
    public ApiResponse<MemberTokenResponse> register(@Valid @RequestBody RegisterRequest req,
                                                     HttpServletRequest http) {
        return ApiResponse.ok(memberAuthService.register(req, RateLimitFilter.clientIp(http)));
    }

    @PostMapping("/login")
    public ApiResponse<MemberTokenResponse> login(@Valid @RequestBody LoginRequest req,
                                                  HttpServletRequest http) {
        return ApiResponse.ok(memberAuthService.login(req, RateLimitFilter.clientIp(http)));
    }

    @PostMapping("/refresh")
    public ApiResponse<MemberTokenResponse> refresh(@Valid @RequestBody RefreshRequest req) {
        return ApiResponse.ok(memberAuthService.refresh(req.refreshToken()));
    }
}
