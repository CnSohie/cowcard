package com.hqyj.ka.config;

import com.hqyj.ka.security.CaptchaFilter;
import com.hqyj.ka.security.JwtAuthenticationFilter;
import com.hqyj.ka.security.RateLimitFilter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * 安全基线:
 *  - 无状态 JWT,CSRF 关闭(纯 API + 无 Cookie 会话)
 *  - 公开面:商城浏览 / 下单 / 查单 / 支付回调;其余全部认证 + 方法级权限
 *  - bcrypt cost=12;安全响应头;限流过滤器前置
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties(AppProperties.class)
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           JwtAuthenticationFilter jwtFilter,
                                           CaptchaFilter captchaFilter,
                                           RateLimitFilter rateLimitFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .headers(headers -> headers
                .contentTypeOptions(cto -> {})                    // X-Content-Type-Options: nosniff
                .frameOptions(fo -> fo.deny())                    // 防点击劫持
                .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000))
                .referrerPolicy(rp -> rp.policy(
                        org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                // 同一进程同时托管 React 商城与 API：仅允许本站构建产物，
                // 并禁止对象、被内嵌及第三方脚本来源。
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; "
                                + "script-src 'self'; style-src 'self' 'unsafe-inline'; "
                                + "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:"))
                .permissionsPolicyHeader(pp -> pp.policy("geolocation=(), microphone=(), camera=(), payment=()"))
                .addHeaderWriter((request, response) -> {
                    response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
                    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
                }))
            .exceptionHandling(eh -> eh.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .authorizeHttpRequests(auth -> auth
                // 公开:商城浏览、下单、游客查单、支付创建与回调、链配置、文章浏览、图片静态资源
                .requestMatchers("/api/auth/login", "/api/auth/refresh").permitAll()
                .requestMatchers("/api/member/auth/**").permitAll()
                .requestMatchers("/api/telegram/webhook", "/api/telegram/ticket").permitAll()
                .requestMatchers("/api/store/**", "/api/orders/**", "/api/pay/**", "/api/posts/**").permitAll()
                // React 单页应用的入口与 Vite 构建产物必须在 JWT 认证前公开，
                // 否则首页与其 JS/CSS 会被 anyRequest() 返回 401。
                .requestMatchers(
                        "/", "/index.html", "/assets/**", "/favicon.ico", "/manifest.webmanifest", "/site.webmanifest",
                        "/product/**", "/pay/**", "/order", "/tg/**", "/redeem", "/posts/**", "/login", "/register", "/me", "/tos", "/about",
                        "/admin", "/admin/**").permitAll()
                .requestMatchers("/robots.txt", "/sitemap.xml").permitAll()
                .requestMatchers("/files/**").permitAll()
                .requestMatchers("/error").permitAll()
                // 会员区:仅会员令牌(kind=member)可进,与管理端令牌硬隔离
                .requestMatchers("/api/member/**").hasAuthority("KIND_MEMBER")
                // 管理端:仅管理令牌(kind=admin)可进,细粒度权限由 @PreAuthorize 控制
                .requestMatchers("/api/admin/**").hasAuthority("KIND_ADMIN")
                .requestMatchers("/api/auth/**").hasAuthority("KIND_ADMIN")
                .anyRequest().authenticated())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(rateLimitFilter, JwtAuthenticationFilter.class)
            .addFilterAfter(captchaFilter, JwtAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // 2C2G 权衡:bcrypt(12) ≈ 100ms/次,兼顾抗爆破与登录接口 CPU 占用(Argon2id 内存开销大,升级点)
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration cfg) throws Exception {
        return cfg.getAuthenticationManager();
    }
}
