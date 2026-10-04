package com.hqyj.ka.monitor;

import com.hqyj.ka.common.ApiResponse;
import com.hqyj.ka.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 交易运行监测。技术细节只给 monitor:read,不跟营收看板共用权限。 */
@RestController
@RequestMapping("/api/admin/monitor")
public class AdminMonitorController {

    private final MonitorFactsLoader loader;
    private final MonitorAlertService alerts;

    public AdminMonitorController(MonitorFactsLoader loader, MonitorAlertService alerts) {
        this.loader = loader;
        this.alerts = alerts;
    }

    @GetMapping("/overview")
    @PreAuthorize("hasAuthority('monitor:read')")
    public ApiResponse<MonitorView.Overview> overview() {
        return ApiResponse.ok(MonitorOverviewBuilder.build(loader.load()).overview());
    }

    @GetMapping("/alerts")
    @PreAuthorize("hasAuthority('monitor:read')")
    public ApiResponse<List<MonitorView.AlertItem>> alerts() {
        return ApiResponse.ok(alerts.list());
    }

    @PostMapping("/alerts/{id}/ack")
    @PreAuthorize("hasAuthority('monitor:read')")
    public ApiResponse<MonitorView.AlertItem> ack(@PathVariable long id, HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String actor = authentication == null ? "unknown" : authentication.getName();
        return ApiResponse.ok(alerts.ack(id, actor, RateLimitFilter.clientIp(request)));
    }
}
