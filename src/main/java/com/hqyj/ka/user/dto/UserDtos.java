package com.hqyj.ka.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public final class UserDtos {
    private UserDtos() {}

    public record CreateUserRequest(
            @NotBlank @Size(min = 3, max = 64) String username,
            @NotBlank @Size(min = 10, max = 128, message = "密码至少 10 位") String password,
            @Size(max = 64) String nickname,
            @NotEmpty List<String> roleCodes,
            String authPassword,
            String totpCode) {}

    public record UpdateUserRequest(
            @Size(max = 64) String nickname,
            Boolean enabled,
            List<String> roleCodes,
            /** 传值则重置密码 */
            @Size(min = 10, max = 128) String newPassword,
            String authPassword,
            String totpCode) {}

    public record UserView(Long id, String username, String nickname, boolean enabled,
                           List<String> roles, LocalDateTime lastLoginAt, String lastLoginIp,
                           LocalDateTime createdAt) {}

    public record RoleView(Long id, String code, String name, String description,
                           boolean builtin, List<String> permissionCodes) {}

    public record SaveRoleRequest(
            @NotBlank @Size(max = 32) String code,
            @NotBlank @Size(max = 64) String name,
            @Size(max = 255) String description,
            @NotEmpty List<String> permissionCodes,
            String authPassword,
            String totpCode) {}
}
