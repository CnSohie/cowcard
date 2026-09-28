package com.hqyj.ka.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.member.repo.MemberRepository;
import com.hqyj.ka.user.repo.UserRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** 无状态 JWT 认证:仅接受 access 型令牌;权限取自令牌,并用账户状态/版本号即时撤销旧令牌。 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final MemberRepository memberRepository;
    private final UserRepository userRepository;
    private static final Set<String> SUPER_ADMIN_PERMISSIONS = Set.of(
            "dashboard:read", "product:read", "product:write", "card:read", "card:write",
            "order:read", "order:write", "payment:config", "user:manage", "role:manage",
            "audit:read", "config:write", "article:read", "article:write", "member:manage",
            "withdraw:review", "risk:review", "support:manage", "coupon:read", "coupon:manage",
            "gift-card:read", "gift-card:manage", "member:read", "member:status",
            "member-level:manage", "wallet:freeze", "security:manage");

    @Override
    @SuppressWarnings("unchecked")
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            Claims claims = jwtService.parse(header.substring(7));
            if (claims != null && JwtService.TYPE_ACCESS.equals(claims.get("typ", String.class))) {
                boolean isMember = JwtService.KIND_MEMBER.equals(JwtService.kindOf(claims));
                List<String> auth = claims.get("auth", List.class);
                var authorities = new ArrayList<SimpleGrantedAuthority>();
                if (auth != null) auth.forEach(a -> authorities.add(new SimpleGrantedAuthority(a)));
                if (auth != null && auth.contains("ROLE_SUPER_ADMIN")) {
                    SUPER_ADMIN_PERMISSIONS.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
                }
                // 阵营合成权限:URL 级硬隔离(/api/member/** vs /api/admin/**),见 SecurityConfig
                authorities.add(new SimpleGrantedAuthority(isMember ? "KIND_MEMBER" : "KIND_ADMIN"));
                if (!tokenActive(claims, isMember)) {
                    SecurityContextHolder.clearContext();
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"code\":" + ErrorCode.ACCOUNT_DISABLED.getCode()
                            + ",\"message\":\"" + ErrorCode.ACCOUNT_DISABLED.getMessage() + "\"}");
                    return;
                }
                var token = new UsernamePasswordAuthenticationToken(claims.getSubject(), null, authorities);
                SecurityContextHolder.getContext().setAuthentication(token);
                if (isMember) {
                    request.setAttribute("mid", Long.valueOf(claims.getSubject()));
                    request.setAttribute("mname", claims.get("username", String.class));
                } else {
                    request.setAttribute("uid", Long.valueOf(claims.getSubject()));
                    request.setAttribute("uname", claims.get("username", String.class));
                }
            }
        }
        chain.doFilter(request, response);
    }

    private boolean tokenActive(Claims claims, boolean member) {
        String subject = claims.getSubject();
        String version = claims.get("ver", String.class);
        if (version == null || version.isBlank()) return false;
        try {
            Long id = Long.valueOf(subject);
            if (member) {
                return memberRepository.findById(id)
                        .filter(m -> m.isEnabled())
                        .map(m -> version.equals(m.getTokenVersion()))
                        .orElse(false);
            }
            return userRepository.findById(id)
                    .filter(u -> u.isEnabled())
                    .map(u -> version.equals(u.getTokenVersion()))
                    .orElse(false);
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
