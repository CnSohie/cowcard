package com.hqyj.ka.user.service;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.security.JwtService;
import com.hqyj.ka.security.TotpService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.user.dto.AuthDtos.LoginRequest;
import com.hqyj.ka.user.dto.AuthDtos.TokenResponse;
import com.hqyj.ka.user.entity.User;
import com.hqyj.ka.user.repo.UserRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;

/**
 * 登录安全:失败计数 → 阈值锁定;成功后轮换刷新令牌版本可强制下线。
 * TOTP 2FA 接口预留:totpEnabled 用户校验 totpCode(升级点,见 docs/ARCHITECTURE.md §8)。
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TotpService totpService;
    private final AppProperties props;
    private final AuditService auditService;
    private final ConfigService configService;
    private final Map<Long, LocalDateTime> sensitiveTrustedUntil = new ConcurrentHashMap<>();

    @Transactional
    public TokenResponse login(LoginRequest req, String ip) {
        User user = userRepository.findByUsername(req.username())
                .orElseThrow(() -> new BusinessException(ErrorCode.BAD_CREDENTIALS));

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }
        if (!user.isEnabled()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            int failures = user.getFailedAttempts() + 1;
            user.setFailedAttempts(failures);
            if (failures >= props.getSecurity().getLoginMaxFailures()) {
                user.setLockedUntil(LocalDateTime.now().plusMinutes(props.getSecurity().getLoginLockMinutes()));
                user.setFailedAttempts(0);
            }
            auditService.record(user.getUsername(), "LOGIN_FAILED", "auth", ip, null);
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }

        // 两步验证:启用后必须携带动态码
        if (user.isTotpEnabled()) {
            if (req.totpCode() == null || req.totpCode().isBlank()) {
                throw new BusinessException(ErrorCode.TOTP_REQUIRED);
            }
            String secret = AesGcmUtil.decrypt(user.getTotpSecret(), props.getSecurity().aesKeyBytes());
            if (!totpService.verify(secret, req.totpCode().trim())) {
                auditService.record(user.getUsername(), "LOGIN_TOTP_FAILED", "auth", ip, null);
                throw new BusinessException(ErrorCode.TOTP_INVALID);
            }
        }

        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        user.setLastLoginIp(ip);
        auditService.record(user.getUsername(), "LOGIN_SUCCESS", "auth", ip, null);

        List<String> authorities = user.allAuthorityCodes();
        return new TokenResponse(
                jwtService.createAccessToken(user.getId(), user.getUsername(), authorities, user.getTokenVersion()),
                jwtService.createRefreshToken(user.getId(), user.getTokenVersion()),
                user.getUsername(), user.getNickname(), authorities);
    }

    @Transactional(readOnly = true)
    public TokenResponse refresh(String refreshToken) {
        Claims claims = jwtService.parse(refreshToken);
        if (claims == null || !JwtService.TYPE_REFRESH.equals(claims.get("typ", String.class))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        // 安全关键:会员刷新令牌绝不允许在管理端换发令牌(会员 ID 与管理员 ID 可能同号)
        if (!JwtService.KIND_ADMIN.equals(JwtService.kindOf(claims))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        User user = userRepository.findById(Long.valueOf(claims.getSubject()))
                .filter(User::isEnabled)
                .orElseThrow(() -> new BusinessException(ErrorCode.REFRESH_INVALID));
        if (!user.getTokenVersion().equals(claims.get("ver", String.class))) {
            throw new BusinessException(ErrorCode.REFRESH_INVALID);
        }
        List<String> authorities = user.allAuthorityCodes();
        return new TokenResponse(
                jwtService.createAccessToken(user.getId(), user.getUsername(), authorities, user.getTokenVersion()),
                jwtService.createRefreshToken(user.getId(), user.getTokenVersion()),
                user.getUsername(), user.getNickname(), authorities);
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword, String ip) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setTokenVersion(UUID.randomUUID().toString()); // 全端强制重新登录
        auditService.record(user.getUsername(), "CHANGE_PASSWORD", "auth", ip, null);
    }

    /**
     * 密码复核(带锁定检查与失败计数,和登录共用防爆破):
     * 2FA 自助管理与财务级敏感操作共用 —— 防止「走开没锁屏」被旁人利用已登录会话操作。
     */
    private User requirePassword(Long userId, String password, String action, String ip) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }
        if (password == null || password.isBlank() || !passwordEncoder.matches(password, user.getPassword())) {
            int failures = user.getFailedAttempts() + 1;
            user.setFailedAttempts(failures);
            if (failures >= props.getSecurity().getLoginMaxFailures()) {
                user.setLockedUntil(LocalDateTime.now().plusMinutes(props.getSecurity().getLoginLockMinutes()));
                user.setFailedAttempts(0);
            }
            auditService.record(user.getUsername(), "PASSWORD_RECHECK_FAILED", action, ip, null);
            throw new BusinessException(ErrorCode.BAD_CREDENTIALS);
        }
        user.setFailedAttempts(0);
        return user;
    }

    /**
     * 敏感操作双因子复核(财务/订单审批类):管理员密码 + TOTP 动态码,缺一不可。
     * 未启用 2FA → TOTP_NOT_ENABLED,前端据此引导先去「安全设置」开启;全部失败路径均留审计。
     */
    @Transactional
    public void verifySensitive(Long userId, String password, String totpCode, String action, String ip) {
        User probe = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (!probe.isTotpEnabled()) {
            throw new BusinessException(ErrorCode.TOTP_NOT_ENABLED);
        }
        if (sensitiveTrusted(userId)) {
            auditService.record(probe.getUsername(), "SENSITIVE_TRUSTED_REUSE", action, ip, null);
            return;
        }
        User user = requirePassword(userId, password, action, ip);
        String secret = AesGcmUtil.decrypt(user.getTotpSecret(), props.getSecurity().aesKeyBytes());
        if (totpCode == null || !totpService.verify(secret, totpCode.trim())) {
            auditService.record(user.getUsername(), "SENSITIVE_TOTP_FAILED", action, ip, null);
            throw new BusinessException(ErrorCode.TOTP_INVALID);
        }
        sensitiveTrustedUntil.put(userId, LocalDateTime.now().plusMinutes(sensitiveGraceMinutes()));
    }

    // ---------- TOTP 两步验证管理(登录后自助操作,均有审计) ----------

    @Transactional(readOnly = true)
    public boolean totpEnabled(Long userId) {
        return userRepository.findById(userId).map(User::isTotpEnabled).orElse(false);
    }

    public boolean sensitiveTrusted(Long userId) {
        LocalDateTime until = sensitiveTrustedUntil.get(userId);
        if (until == null) return false;
        if (until.isAfter(LocalDateTime.now())) return true;
        sensitiveTrustedUntil.remove(userId);
        return false;
    }

    public LocalDateTime sensitiveTrustedUntil(Long userId) {
        return sensitiveTrusted(userId) ? sensitiveTrustedUntil.get(userId) : null;
    }

    public int sensitiveGraceMinutes() {
        String raw = configService.all().getOrDefault("security.sensitive_grace_minutes", "5");
        try {
            int v = Integer.parseInt(raw.trim());
            return Math.min(Math.max(v, 0), 60);
        } catch (NumberFormatException e) {
            return 5;
        }
    }

    /** 生成新密钥(密文落库,未启用状态),返回 secret + otpauth URI 供扫码。需先验管理员密码。 */
    @Transactional
    public String[] totpSetup(Long userId, String password, String ip) {
        User user = requirePassword(userId, password, "totp-setup", ip);
        String secret = totpService.generateSecret();
        user.setTotpSecret(AesGcmUtil.encrypt(secret, props.getSecurity().aesKeyBytes()));
        user.setTotpEnabled(false);
        return new String[]{secret, totpService.provisioningUri("Ka", user.getUsername(), secret)};
    }

    /** 校验管理员密码 + 动态码后正式启用。 */
    @Transactional
    public void totpEnable(Long userId, String password, String code, String ip) {
        User user = requirePassword(userId, password, "totp-enable", ip);
        if (user.getTotpSecret() == null) throw new BusinessException(ErrorCode.BAD_REQUEST, "请先生成密钥");
        String secret = AesGcmUtil.decrypt(user.getTotpSecret(), props.getSecurity().aesKeyBytes());
        if (!totpService.verify(secret, code)) throw new BusinessException(ErrorCode.TOTP_INVALID);
        user.setTotpEnabled(true);
        auditService.record(user.getUsername(), "TOTP_ENABLED", "auth", ip, null);
    }

    /** 校验管理员密码 + 动态码后关闭并清除密钥。 */
    @Transactional
    public void totpDisable(Long userId, String password, String code, String ip) {
        User user = requirePassword(userId, password, "totp-disable", ip);
        if (!user.isTotpEnabled()) return;
        String secret = AesGcmUtil.decrypt(user.getTotpSecret(), props.getSecurity().aesKeyBytes());
        if (!totpService.verify(secret, code)) throw new BusinessException(ErrorCode.TOTP_INVALID);
        user.setTotpEnabled(false);
        user.setTotpSecret(null);
        auditService.record(user.getUsername(), "TOTP_DISABLED", "auth", ip, null);
    }
}
