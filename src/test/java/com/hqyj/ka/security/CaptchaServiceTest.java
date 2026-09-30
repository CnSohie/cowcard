package com.hqyj.ka.security;

import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.sysconfig.repo.SysConfigRepository;
import com.hqyj.ka.sysconfig.service.ConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CaptchaServiceTest {
    private ConfigService configService;
    private CaptchaService service;
    private Map<String, String> config;

    @BeforeEach
    void setUp() {
        config = new HashMap<>();
        config.put("security.captcha.enabled", "1");
        config.put("security.captcha.provider", "builtin");
        configService = new InMemoryConfigService(config);
        service = new CaptchaService(configService, JsonMapper.builder().build());
    }

    private static final class InMemoryConfigService extends ConfigService {
        private final Map<String, String> values;

        private InMemoryConfigService(Map<String, String> values) {
            super((SysConfigRepository) null);
            this.values = values;
        }

        @Override
        public Map<String, String> all() {
            return values;
        }
    }

    @Test
    void builtinProofIsBoundToIpAndActionAndConsumedOnce() {
        var challenge = service.createBuiltinChallenge("order_create", "203.0.113.8", "ABCD5");
        assertTrue(challenge.imageDataUrl().startsWith("data:image/png;base64,"));

        String proof = service.solveBuiltinChallenge(challenge.challengeId(), "abcd5",
                "order_create", "203.0.113.8");
        assertNotNull(proof);
        assertTrue(service.verify(proof, "203.0.113.8", "order_create"));
        assertFalse(service.verify(proof, "203.0.113.8", "order_create"), "proof must be one-time");
    }

    @Test
    void wrongAnswerConsumesChallenge() {
        var challenge = service.createBuiltinChallenge("order_query", "203.0.113.9", "ABCDE");
        assertNull(service.solveBuiltinChallenge(challenge.challengeId(), "WRONG", "order_query", "203.0.113.9"));
        assertNull(service.solveBuiltinChallenge(challenge.challengeId(), "ABCDE", "order_query", "203.0.113.9"));
    }

    @Test
    void scopesControlIndividualForms() {
        config.put("security.captcha.scopes", "order_create,order_query");
        assertTrue(service.requiredFor("order_create"));
        assertFalse(service.requiredFor("member_login"));
    }

    @Test
    void enabledExternalProviderRequiresBothKeys() {
        config.put("security.captcha.provider", "turnstile");
        assertThrows(BusinessException.class, () -> service.validateConfiguration(config));
        config.put("security.captcha.site_key", "site");
        config.put("security.captcha.secret_key", "secret");
        assertDoesNotThrow(() -> service.validateConfiguration(config));
    }
}
