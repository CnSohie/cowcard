package com.hqyj.ka.user.controller;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** TOTP 两步验证自助管理(需登录;/api/auth/totp/** 不在 permitAll 白名单内)。 */
@RestController
@RequestMapping("/api/auth/totp")
@RequiredArgsConstructor
public class TotpController {

    private final AuthService authService;

    /** 2FA 自助管理一律先验管理员密码:防止旁人利用未锁屏的已登录会话绑定/解绑认证器。 */
    public record SetupRequest(@NotBlank String password) {}
    public record CodeRequest(@NotBlank String password, @NotBlank String code) {}
    public record SetupResponse(String secret, String otpauthUri) {}

    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> status(HttpServletRequest http) {
        Long uid = uid(http);
        var trustedUntil = authService.sensitiveTrustedUntil(uid);
        return ApiResponse.ok(Map.of(
                "enabled", authService.totpEnabled(uid),
                "trusted", trustedUntil != null,
                "trustedUntil", trustedUntil == null ? "" : trustedUntil.toString(),
                "graceMinutes", authService.sensitiveGraceMinutes()));
    }

    @PostMapping("/setup")
    public ApiResponse<SetupResponse> setup(@Valid @RequestBody SetupRequest req, HttpServletRequest http) {
        String[] r = authService.totpSetup(uid(http), req.password(), RateLimitFilter.clientIp(http));
        return ApiResponse.ok(new SetupResponse(r[0], r[1]));
    }

    @PostMapping("/enable")
    public ApiResponse<Void> enable(@Valid @RequestBody CodeRequest req, HttpServletRequest http) {
        authService.totpEnable(uid(http), req.password(), req.code().trim(), RateLimitFilter.clientIp(http));
        return ApiResponse.ok();
    }

    @PostMapping("/disable")
    public ApiResponse<Void> disable(@Valid @RequestBody CodeRequest req, HttpServletRequest http) {
        authService.totpDisable(uid(http), req.password(), req.code().trim(), RateLimitFilter.clientIp(http));
        return ApiResponse.ok();
    }

    private Long uid(HttpServletRequest http) {
        return (Long) http.getAttribute("uid");
    }
}
