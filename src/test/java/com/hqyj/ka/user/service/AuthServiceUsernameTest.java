package com.hqyj.ka.user.service;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
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

import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthServiceUsernameTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final TotpService totp = mock(TotpService.class);
    private final AuditService audit = mock(AuditService.class);
    private final ConfigService config = mock(ConfigService.class);
    private final AppProperties props = new AppProperties();
    private final User user = new User();
    private AuthService auth;

    @BeforeEach void setup() {
        props.getSecurity().setAesKey(Base64.getEncoder().encodeToString(new byte[32]));
        user.setId(1L);
        user.setUsername("admin");
        user.setPassword("hash");
        when(users.findById(1L)).thenReturn(Optional.of(user));
        when(passwords.matches("correct", "hash")).thenReturn(true);
        when(config.all()).thenReturn(Map.of());
        auth = new AuthService(users, passwords, mock(JwtService.class), totp, props, audit, config);
    }

    @Test void renamesOwnAccountAndInvalidatesSessions() {
        auth.changeUsername(1L, "shop_owner", "correct", null, "127.0.0.1");
        assertEquals("shop_owner", user.getUsername());
        assertNotEquals("v1", user.getTokenVersion());
        assertEquals("hash", user.getPassword());
        verify(users).saveAndFlush(user);
        verify(audit).record("admin", "CHANGE_USERNAME", "auth", "127.0.0.1", "newUsername=shop_owner");
    }

    @Test void wrongPasswordCountsTowardsLockAndDoesNotRename() {
        for (int i = 0; i < props.getSecurity().getLoginMaxFailures(); i++) {
            assertThrows(BusinessException.class, () -> auth.changeUsername(1L, "shop_owner", "wrong", null, "ip"));
        }
        assertNotNull(user.getLockedUntil());
        assertEquals(ErrorCode.ACCOUNT_LOCKED, assertThrows(BusinessException.class,
                () -> auth.changeUsername(1L, "shop_owner", "correct", null, "ip")).getErrorCode());
        assertEquals("admin", user.getUsername());
        assertEquals("v1", user.getTokenVersion());
        verify(users, never()).saveAndFlush(any());
    }

    @Test void rejectsDuplicatesDefaultAndMalformedNames() {
        when(users.existsByUsernameIgnoreCase("taken")).thenReturn(true);
        for (String name : new String[]{"taken", "ADMIN", "a", "1234", "space name", "<script>", "a".repeat(33)}) {
            assertThrows(BusinessException.class, () -> auth.changeUsername(1L, name, "correct", null, "ip"));
        }
        assertEquals("admin", user.getUsername());
        verify(users, never()).saveAndFlush(any());
    }

    @Test void enabledTotpAlwaysRequiresFreshVerificationEvenDuringGrace() {
        user.setTotpEnabled(true);
        user.setTotpSecret(AesGcmUtil.encrypt("secret", props.getSecurity().aesKeyBytes()));
        when(totp.verify("secret", "123456")).thenReturn(true);
        auth.verifySensitive(1L, "correct", "123456", "test", "ip");
        assertTrue(auth.sensitiveTrusted(1L));
        assertThrows(BusinessException.class, () -> auth.changeUsername(1L, "shop_owner", "", "123456", "ip"));
        assertThrows(BusinessException.class, () -> auth.changeUsername(1L, "shop_owner", "correct", null, "ip"));
        assertThrows(BusinessException.class, () -> auth.changeUsername(1L, "shop_owner", "correct", "000000", "ip"));
        auth.changeUsername(1L, "shop_owner", "correct", "123456", "ip");
        assertTrue(user.isTotpEnabled());
        assertEquals("secret", AesGcmUtil.decrypt(user.getTotpSecret(), props.getSecurity().aesKeyBytes()));
        assertFalse(auth.sensitiveTrusted(1L));
    }
}
