package com.hqyj.ka.sysconfig.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.sysconfig.entity.SysConfig;
import com.hqyj.ka.sysconfig.service.ConfigService;
import com.hqyj.ka.order.service.EmailNotifier;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/config")
@RequiredArgsConstructor
public class AdminConfigController {

    private final ConfigService configService;
    private final RateLimitFilter rateLimitFilter;
    private final AuditService auditService;
    private final EmailNotifier emailNotifier;

    public record MailTestRequest(@NotBlank @Email String to) {}

    @GetMapping
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Map<String, String>> all() {
        return ApiResponse.ok(configService.all());
    }

    @PostMapping
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> save(@RequestBody Map<String, String> configs) {
        configService.saveAll(configs.entrySet().stream()
                .map(e -> new SysConfig(e.getKey(), e.getValue())).toList());
        return ApiResponse.ok();
    }

    /** 一键解除全部临时封禁并重置限流计数(误封自救;审计留痕)。 */
    @PostMapping("/rate-limit/reset")
    @PreAuthorize("hasAuthority('config:write')")
    public ApiResponse<Void> resetRateLimit(HttpServletRequest http) {
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
