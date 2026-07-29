package com.hqyj.ka.security;

import com.hqyj.ka.common.ErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.List;

@Component
@RequiredArgsConstructor
public class CaptchaFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Captcha-Token";

    private final CaptchaService captchaService;

    private static final Set<String> PROTECTED_EXACT = Set.of(
            "/api/orders",
            "/api/member/support-tickets"
    );

    private static final List<String> PROTECTED_PREFIXES = List.of(
            "/api/auth/login",
            "/api/member/auth/login",
            "/api/member/auth/register",
            "/api/pay/create",
            "/api/pay/crypto/intent/",
            "/api/member/presale/redeem",
            "/api/member/wallet/recharge",
            "/api/member/wallet/withdraw",
            "/api/member/wallet/gift-cards/redeem",
            "/api/member/articles/"
    );

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!captchaService.enabled()) return true;
        if (!"POST".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        if (path.contains("/refresh") || path.startsWith("/api/pay/notify/") || path.startsWith("/api/admin/")) {
            return true;
        }
        return !PROTECTED_EXACT.contains(path) && PROTECTED_PREFIXES.stream().noneMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = request.getHeader(HEADER);
        String ip = RateLimitFilter.clientIp(request);
        if (!captchaService.verify(token, ip)) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":" + ErrorCode.CAPTCHA_INVALID.getCode()
                    + ",\"message\":\"" + ErrorCode.CAPTCHA_INVALID.getMessage() + "\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
