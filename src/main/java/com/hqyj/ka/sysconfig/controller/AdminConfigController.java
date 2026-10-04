package com.hqyj.ka.sysconfig.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.sysconfig.service.SiteAvailabilityService;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.order.dto.OrderDtos.SensitiveAuthRequest;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.security.CaptchaService;
import com.hqyj.ka.sysconfig.entity.SysConfig;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.sysconfig.service.HeroSlideConfigValidator;
import com.hqyj.ka.sysconfig.service.SiteIconRules;
import com.hqyj.ka.order.service.EmailNotifier;
import com.hqyj.ka.user.service.AuthService;
import com.hqyj.ka.wallet.service.WithdrawMethodService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/config")
@RequiredArgsConstructor
public class AdminConfigController {
    private final SiteAvailabilityService siteAvailabilityService;

    private final ConfigService configService;
    private final RateLimitFilter rateLimitFilter;
    private final AuditService auditService;
    private final EmailNotifier emailNotifier;
    private final AuthService authService;
    private final HeroSlideConfigValidator heroSlideConfigValidator;
    private final WithdrawMethodService withdrawMethodService;
    private final CaptchaService captchaService;

    public record MailTestRequest(@NotBlank @Email String to) {}
    public record SaveConfigRequest(Map<String, String> configs, String password, String totpCode) {}
    public record CaptchaTestRequest(@NotBlank @Size(max = 4096) String token) {}

    @GetMapping
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Map<String, String>> all() {
        Map<String, String> stored = configService.all();
        Map<String, String> safe = new LinkedHashMap<>(stored);
        CaptchaService.ConfigurationStatus status = captchaService.configurationStatus(stored);
        // Secret 只能写入，绝不通过管理 API 回显；前端用单独状态展示是否已配置。
        safe.remove("security.captcha.secret_key");
        safe.put("security.captcha.secret_configured", status.secretConfigured() ? "1" : "0");
        safe.put("security.captcha.configured", status.configured() ? "1" : "0");
        safe.put("security.captcha.status", status.message());
        return ApiResponse.ok(safe);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> save(@RequestBody SaveConfigRequest req, HttpServletRequest http) {
        if (req.configs() == null) throw new BusinessException(ErrorCode.BAD_REQUEST, "配置内容不能为空");
        Map<String, String> incoming = new LinkedHashMap<>(req.configs());
        incoming.remove("security.captcha.secret_configured");
        incoming.remove("security.captcha.configured");
        incoming.remove("security.captcha.status");
        // 空 Secret 表示保留原值，防止管理页面保存其它设置时误清空密钥。
        if (incoming.getOrDefault("security.captcha.secret_key", "").isBlank()) {
            incoming.remove("security.captcha.secret_key");
        }
        Map<String, String> merged = new LinkedHashMap<>(configService.all());
        merged.putAll(incoming);
        captchaService.validateConfiguration(merged);
        siteAvailabilityService.validateConfiguration(merged);
        if (incoming.containsKey(SiteIconRules.KEY)) {
            incoming.put(SiteIconRules.KEY, SiteIconRules.normalize(incoming.get(SiteIconRules.KEY)));
        }
        if (incoming.containsKey(HeroSlideConfigValidator.CONFIG_KEY)) {
            heroSlideConfigValidator.validate(incoming.get(HeroSlideConfigValidator.CONFIG_KEY));
        }
        if (incoming.containsKey(WithdrawMethodService.CONFIG_KEY)) {
            withdrawMethodService.validateConfig(incoming.get(WithdrawMethodService.CONFIG_KEY));
        }
        withdrawMethodService.validateFeeConfig(incoming);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "config-save", RateLimitFilter.clientIp(http));
        configService.saveAll(incoming.entrySet().stream()
                .map(e -> new SysConfig(e.getKey(), e.getValue())).toList());
        auditService.record((String) http.getAttribute("uname"), "CONFIG_SAVE",
                "config", RateLimitFilter.clientIp(http),
                "{\"keys\":" + incoming.keySet().stream().sorted().toList() + "}");
        return ApiResponse.ok();
    }

    /** 保存后做一次真实端到端验证，第三方模式会实际请求供应商 siteverify。 */
    @PostMapping("/captcha/test")
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> testCaptcha(@Valid @RequestBody CaptchaTestRequest req, HttpServletRequest http) {
        CaptchaService.ConfigurationStatus status = captchaService.configurationStatus(configService.all());
        if (!status.enabled() || !status.configured()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请先保存并启用有效的人机验证配置");
        }
        if (!captchaService.verify(req.token(), RateLimitFilter.clientIp(http), "admin_captcha_test")) {
            throw new BusinessException(ErrorCode.CAPTCHA_INVALID, "验证失败，请检查域名白名单、密钥和服务商网络");
        }
        return ApiResponse.ok();
    }

    /** 一键解除全部临时封禁并重置限流计数(误封自救;审计留痕)。 */
    @PostMapping("/rate-limit/reset")
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> resetRateLimit(@RequestBody SensitiveAuthRequest req, HttpServletRequest http) {
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "rate-limit-reset", RateLimitFilter.clientIp(http));
        rateLimitFilter.resetAll();
        auditService.record((String) http.getAttribute("uname"), "RATE_LIMIT_RESET",
                "security:rate-limit", RateLimitFilter.clientIp(http), null);
        return ApiResponse.ok();
    }

    @PostMapping("/mail/test")
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> testMail(@Valid @RequestBody MailTestRequest req, HttpServletRequest http) {
        emailNotifier.sendTest(req.to());
        auditService.record((String) http.getAttribute("uname"), "MAIL_TEST",
                "config:mail", RateLimitFilter.clientIp(http), req.to());
        return ApiResponse.ok();
    }
}
