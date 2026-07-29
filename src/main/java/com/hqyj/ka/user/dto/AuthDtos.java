package com.hqyj.ka.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class AuthDtos {
    private AuthDtos() {}

    public record LoginRequest(
            @NotBlank @Size(max = 64) String username,
            @NotBlank @Size(max = 128) String password,
            /** TOTP 验证码,启用 2FA 后必填(预留) */
            String totpCode) {}

    public record TokenResponse(String accessToken, String refreshToken, String username,
                                String nickname, List<String> authorities) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record ChangePasswordRequest(
            @NotBlank String oldPassword,
            @NotBlank @Size(min = 10, max = 128, message = "新密码至少 10 位") String newPassword) {}
}
