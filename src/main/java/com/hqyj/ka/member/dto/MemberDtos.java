package com.hqyj.ka.member.dto;

import com.hqyj.ka.member.entity.Member;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class MemberDtos {

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 128) String email,
            @NotBlank @Size(min = 8, max = 64) String password,
            @Size(max = 32) String nickname,
            /** 推荐码(可空) */
            @Size(max = 16) String ref) {}

    public record LoginRequest(
            @NotBlank @Email @Size(max = 128) String email,
            @NotBlank @Size(max = 64) String password) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record MemberView(Long id, String email, String nickname, String inviteCode,
                             Long levelId, BigDecimal totalRecharge, BigDecimal totalSpend,
                             LocalDateTime createdAt) {
        public static MemberView of(Member m) {
            return new MemberView(m.getId(), m.getEmail(), m.getNickname(), m.getInviteCode(),
                    m.getLevelId(), m.getTotalRecharge(), m.getTotalSpend(),
                    m.getCreatedAt());
        }
    }

    public record MemberTokenResponse(String accessToken, String refreshToken, MemberView member) {}
}
