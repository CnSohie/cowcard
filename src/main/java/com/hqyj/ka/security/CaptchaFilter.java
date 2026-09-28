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
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class CaptchaFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Captcha-Token";

    private final CaptchaService captchaService;

    private static final Map<String, String> PROTECTED_EXACT = exactActions();

    private static Map<String, String> exactActions() {
        Map<String, String> actions = new LinkedHashMap<>();
        actions.put("/api/auth/login", "admin_login");
        actions.put("/api/member/auth/login", "member_login");
        actions.put("/api/member/auth/register", "member_register");
        actions.put("/api/orders", "order_create");
        actions.put("/api/orders/query", "order_query");
        actions.put("/api/orders/presale-token", "order_query");
        actions.put("/api/pay/create", "payment");
        actions.put("/api/member/presale/redeem", "presale_redeem");
        actions.put("/api/member/wallet/recharge", "wallet_recharge");
        actions.put("/api/member/wallet/withdraw", "wallet_withdraw");
        actions.put("/api/member/wallet/gift-cards/redeem", "gift_card_redeem");
        actions.put("/api/member/support-tickets", "support_ticket");
        return Map.copyOf(actions);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        String action = actionFor(path);
        return action == null || !captchaService.requiredFor(action);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = request.getHeader(HEADER);
        String ip = RateLimitFilter.clientIp(request);
        String action = actionFor(request.getRequestURI());
        if (action == null || !captchaService.verify(token, ip, action)) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":" + ErrorCode.CAPTCHA_INVALID.getCode()
                    + ",\"message\":\"" + ErrorCode.CAPTCHA_INVALID.getMessage() + "\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    static String actionFor(String path) {
        String exact = PROTECTED_EXACT.get(path);
        if (exact != null) return exact;
        if (path.startsWith("/api/pay/crypto/intent/") && path.endsWith("/tx")) return "payment";
        if (path.startsWith("/api/member/articles/") && path.endsWith("/purchase")) return "article_purchase";
        if (path.startsWith("/api/member/support-tickets/")) return "support_ticket";
        return null;
    }
}
