package com.hqyj.ka.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.util.function.Supplier;

/** 只放行 TCP 回环上的请求。Prometheus 抓取走 127.0.0.1,不看转发头。 */
public final class LoopbackAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    @Override
    public AuthorizationResult authorize(Supplier<? extends Authentication> authentication, RequestAuthorizationContext context) {
        HttpServletRequest request = context == null ? null : context.getRequest();
        return new AuthorizationDecision(request != null && Loopback.matches(request.getRemoteAddr()));
    }
}
