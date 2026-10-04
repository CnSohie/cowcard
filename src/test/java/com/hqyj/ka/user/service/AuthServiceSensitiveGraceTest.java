package com.hqyj.ka.user.service;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.util.AesGcmUtil;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.security.JwtService;
import com.hqyj.ka.security.TotpService;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.user.entity.User;
import com.hqyj.ka.user.repo.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthServiceSensitiveGraceTest {
    private final ConfigService config = mock(ConfigService.class);
    private AuthService auth;
    private final LocalDateTime verifiedAt = LocalDateTime.of(2026, 9, 30, 10, 0);

    @BeforeEach
    void setup() {
        var users = mock(UserRepository.class);
        var passwords = mock(PasswordEncoder.class);
        var totp = mock(TotpService.class);
        var props = new AppProperties();
        props.getSecurity().setAesKey(Base64.getEncoder().encodeToString(new byte[32]));
        var user = new User();
        user.setUsername("admin");
        user.setPassword("hash");
        user.setTotpEnabled(true);
        user.setTotpSecret(AesGcmUtil.encrypt("secret", props.getSecurity().aesKeyBytes()));
        when(users.findById(1L)).thenReturn(Optional.of(user));
        when(passwords.matches("password", "hash")).thenReturn(true);
        when(totp.verify("secret", "123456")).thenReturn(true);
        auth = new AuthService(users, passwords, mock(JwtService.class), totp, props,
                mock(AuditService.class), config, new com.hqyj.ka.monitor.SecuritySignals());
        grace(5);
    }

    private void grace(int minutes) {
        when(config.all()).thenReturn(Map.of("security.sensitive_grace_minutes", String.valueOf(minutes)));
    }

    @Test
    void savingSixtyMinutesUpdatesExistingVerificationAndReuseDoesNotExtendIt() {
        var afterSixMinutes = verifiedAt.plusMinutes(6);
        var deadline = verifiedAt.plusMinutes(60);
        try (var time = mockStatic(LocalDateTime.class, CALLS_REAL_METHODS)) {
            time.when(LocalDateTime::now).thenReturn(verifiedAt);
            auth.verifySensitive(1L, "password", "123456", "config-save", "127.0.0.1");
            grace(60); // 保存前按旧配置验证,保存后应立即使用新时长。
            time.when(LocalDateTime::now).thenReturn(afterSixMinutes);
            assertTrue(auth.sensitiveTrusted(1L));
            auth.verifySensitive(1L, "", "", "order-close", "127.0.0.1");
            assertEquals(deadline, auth.sensitiveTrustedUntil(1L));
            time.when(LocalDateTime::now).thenReturn(deadline);
            assertFalse(auth.sensitiveTrusted(1L));
            assertThrows(BusinessException.class,
                    () -> auth.verifySensitive(1L, "", "", "order-close", "127.0.0.1"));
        }
    }

    @Test
    void shorteningGraceExpiresExistingVerificationAndDoesNotReviveExpiredEntry() {
        var afterSixMinutes = verifiedAt.plusMinutes(6);
        grace(60);
        try (var time = mockStatic(LocalDateTime.class, CALLS_REAL_METHODS)) {
            time.when(LocalDateTime::now).thenReturn(verifiedAt);
            auth.verifySensitive(1L, "password", "123456", "config-save", "127.0.0.1");
            time.when(LocalDateTime::now).thenReturn(afterSixMinutes);
            grace(5);
            assertNull(auth.sensitiveTrustedUntil(1L));
            grace(60);
            assertFalse(auth.sensitiveTrusted(1L));
        }
    }

    @Test
    void zeroRequiresVerificationForEveryOperation() {
        try (var time = mockStatic(LocalDateTime.class, CALLS_REAL_METHODS)) {
            time.when(LocalDateTime::now).thenReturn(verifiedAt);
            auth.verifySensitive(1L, "password", "123456", "config-save", "127.0.0.1");
            grace(0);
            assertFalse(auth.sensitiveTrusted(1L));
            assertThrows(BusinessException.class,
                    () -> auth.verifySensitive(1L, "", "", "order-close", "127.0.0.1"));
            auth.verifySensitive(1L, "password", "123456", "order-close", "127.0.0.1");
            assertFalse(auth.sensitiveTrusted(1L));
        }
    }
}
