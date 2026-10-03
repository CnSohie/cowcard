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

    public record ProfileResponse(String username) {}

    public record ChangeUsernameRequest(
            @NotBlank @jakarta.validation.constraints.Pattern(regexp = "[A-Za-z][A-Za-z0-9_-]{3,31}",
                    message = "用户名须为 4–32 位，以字母开头，仅含字母、数字、下划线或短横线") String username,
            @NotBlank @Size(max = 128) String password,
            @Size(max = 6) String totpCode) {}

    public record ChangePasswordRequest(
            @NotBlank String oldPassword,
            @NotBlank @Size(min = 10, max = 128, message = "新密码至少 10 位") String newPassword) {}
}
