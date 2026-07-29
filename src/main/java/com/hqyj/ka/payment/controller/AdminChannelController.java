package com.hqyj.ka.payment.controller;

import com.hqyj.ka.audit.service.AuditService;
import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.order.service.TelegramNotifier;
import com.hqyj.ka.payment.entity.PaymentChannel;
import com.hqyj.ka.payment.service.PaymentService;
import com.hqyj.ka.security.RateLimitFilter;
import com.hqyj.ka.user.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 支付渠道配置(payment:config)。
 * 收款配置 = 资金流向,是被篡改后果最重的入口:
 *  ① 保存/启停一律「管理员密码 + TOTP」双因子复核(未启用 2FA 直接拒绝);
 *  ② 查询接口绝不回显密钥(仅返回「已配置」占位);
 *  ③ 任何变更即时 Telegram 告警 + 审计留痕 —— 被盗号/漏洞篡改也能第一时间发现。
 */
@RestController
@RequestMapping("/api/admin/channels")
@RequiredArgsConstructor
public class AdminChannelController {

    private final PaymentService paymentService;
    private final AuditService auditService;
    private final AuthService authService;
    private final TelegramNotifier telegramNotifier;

    public record SaveChannelRequest(@NotNull Long id, String displayName, Boolean enabled,
                                     Integer sortOrder,
                                     /** 明文 JSON,服务端加密落库;查询接口绝不回显 */
                                     String configJson,
                                     /** 双因子凭证 */
                                     String password, String totpCode) {}

    @GetMapping
    @PreAuthorize("hasAuthority('payment:config')")
    public ApiResponse<List<PaymentChannel>> list() {
        List<PaymentChannel> channels = paymentService.allChannelsEnsured();
        channels.forEach(c -> c.setConfigEnc(c.getConfigEnc() == null ? null : "[已配置]")); // 不回显密文
        return ApiResponse.ok(channels);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('payment:config')")
    public ApiResponse<Void> save(@Valid @RequestBody SaveChannelRequest req, HttpServletRequest http) {
        String ip = RateLimitFilter.clientIp(http);
        authService.verifySensitive((Long) http.getAttribute("uid"), req.password(), req.totpCode(),
                "channel-config:" + req.id(), ip);

        boolean configChanged = req.configJson() != null && !req.configJson().isBlank();
        paymentService.saveChannelConfig(req.id(), req.displayName(), req.enabled(), req.sortOrder(), req.configJson());

        String operator = (String) http.getAttribute("uname");
        auditService.record(operator, "CHANNEL_UPDATE", "channel:" + req.id(), ip,
                "{\"enabled\":" + req.enabled() + ",\"configChanged\":" + configChanged + "}");
        // 高危变更即时告警:密钥被换、渠道被启停,第一时间知道
        telegramNotifier.notifyAdmin("⚠️ 支付渠道配置变更\n"
                + "渠道 ID:" + req.id()
                + (req.enabled() != null ? "\n启用状态:" + (req.enabled() ? "启用" : "停用") : "")
                + "\n收款配置:" + (configChanged ? "已更新(密钥变更!)" : "未改动")
                + "\n操作人:" + operator + "\nIP:" + ip
                + "\n若非本人操作,请立即修改密码并检查渠道配置!");
        return ApiResponse.ok();
    }
}
