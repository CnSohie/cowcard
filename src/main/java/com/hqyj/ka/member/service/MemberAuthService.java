package com.hqyj.ka.member.service;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.member.dto.MemberDtos.LoginRequest;
import com.hqyj.ka.member.dto.MemberDtos.MemberTokenResponse;
import com.hqyj.ka.member.dto.MemberDtos.MemberView;
import com.hqyj.ka.member.dto.MemberDtos.RegisterRequest;
import com.hqyj.ka.member.entity.Member;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.security.JwtService;
import com.hqyj.ka.wallet.service.WalletService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;

/**
 * 会员注册/登录/刷新。与后台 AuthService 同级安全策略:bcrypt(12)、失败锁定、
 * 刷新令牌版本轮换;kind=member 硬隔离,刷新绝不接受 admin 令牌(防同号越权)。
 */
@Service
@RequiredArgsConstructor
public class MemberAuthService {

    /** 推广码字符集:去 0/O/1/I 易混字符 */
    private static final char[] CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final WalletService walletService;
    private final AppProperties props;
    private final AuditService auditService;
    private final MemberLevelService memberLevelService;

    /** 注册即登录;钱包账户同事务创建(注册无并发冲突,天然无竞态)。 */
    @Transactional
    public MemberTokenResponse register(RegisterRequest req, String ip) {
        String email = req.email().trim().toLowerCase();
        if (memberRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.MEMBER_EXISTS);
        }
        Long inviterId = null;
        if (req.ref() != null && !req.ref().isBlank()) {
            inviterId = memberRepository.findByInviteCode(req.ref().trim().toUpperCase())
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_CODE_INVALID))
                    .getId();
        }
        Member member = new Member();
        member.setEmail(email);
        member.setPassword(passwordEncoder.encode(req.password()));
        member.setNickname(req.nickname() != null && !req.nickname().isBlank()
                ? req.nickname().trim() : email.substring(0, email.indexOf('@')));
        member.setInviteCode(generateInviteCode());
        member.setInviterId(inviterId);
        member.setLevelId(memberLevelService.ensureDefaultLevel().getId());
        member.setLastLoginAt(LocalDateTime.now());
        member.setLastLoginIp(ip);
        member = memberRepository.save(member);
        walletService.ensureAccount(member.getId());
        auditService.record(email, "MEMBER_REGISTER", "member:" + member.getId(), ip,
                inviterId != null ? "推荐人 #" + inviterId : null);
        return tokens(member);
    }

    @Transactional
    public MemberTokenResponse login(LoginRequest req, String ip) {
        Member member = memberRepository.findByEmail(req.email().trim().toLowerCase())
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_CREDENTIALS));

        if (member.getLockedUntil() != null && member.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }
        if (!member.isEnabled()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        if (!passwordEncoder.matches(req.password(), member.getPassword())) {
            int failures = member.getFailedAttempts() + 1;
            member.setFailedAttempts(failures);
            if (failures >= props.getSecurity().getLoginMaxFailures()) {
                member.setLockedUntil(LocalDateTime.now().plusMinutes(props.getSecurity().getLoginLockMinutes()));
                member.setFailedAttempts(0);
            }
            auditService.record(member.getEmail(), "MEMBER_LOGIN_FAILED", "member", ip, null);
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }
        member.setFailedAttempts(0);
        member.setLockedUntil(null);
        member.setLastLoginAt(LocalDateTime.now());
        member.setLastLoginIp(ip);
        auditService.record(member.getEmail(), "MEMBER_LOGIN", "member", ip, null);
        return tokens(member);
    }

    @Transactional(readOnly = true)
    public MemberTokenResponse refresh(String refreshToken) {
        Claims claims = jwtService.parse(refreshToken);
        if (claims == null || !JwtService.TYPE_REFRESH.equals(claims.get("typ", String.class))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        // 安全关键:必须是 member 阵营令牌(admin 令牌同号 ID 不得换出会员令牌,反向同理)
        if (!JwtService.KIND_MEMBER.equals(JwtService.kindOf(claims))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        Member member = memberRepository.findById(Long.valueOf(claims.getSubject()))
                .filter(Member::isEnabled)
                .orElseThrow(() -> new BusinessException(ErrorCode.REFRESH_INVALID));
        if (!member.getTokenVersion().equals(claims.get("ver", String.class))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        return tokens(member);
    }

    private MemberTokenResponse tokens(Member member) {
        return new MemberTokenResponse(
                jwtService.createMemberAccessToken(member.getId(), member.getNickname(), member.getTokenVersion()),
                jwtService.createMemberRefreshToken(member.getId(), member.getTokenVersion()),
                MemberView.of(member));
    }

    private String generateInviteCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(8);
            for (int i = 0; i < 8; i++) sb.append(CODE_CHARS[RANDOM.nextInt(CODE_CHARS.length)]);
            String code = sb.toString();
            if (!memberRepository.existsByInviteCode(code)) return code;
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR);
    }
}
