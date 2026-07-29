package com.hqyj.ka.security;

import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CaptchaService {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    private final ConfigService configService;

    public record PublicConfig(boolean enabled, String provider, String siteKey) {}

    public PublicConfig publicConfig() {
        Map<String, String> cfg = configService.all();
        boolean enabled = bool(cfg.get("security.captcha.enabled"));
        String provider = cfg.getOrDefault("security.captcha.provider", "turnstile").trim().toLowerCase(Locale.ROOT);
        String siteKey = cfg.getOrDefault("security.captcha.site_key", "").trim();
        return new PublicConfig(enabled, provider, enabled ? siteKey : "");
    }

    public boolean enabled() {
        return publicConfig().enabled();
    }

    public boolean verify(String token, String remoteIp) {
        if (!enabled()) return true;
        if (token == null || token.isBlank()) return false;

        Map<String, String> cfg = configService.all();
        String provider = cfg.getOrDefault("security.captcha.provider", "turnstile").trim().toLowerCase(Locale.ROOT);
        String secret = cfg.getOrDefault("security.captcha.secret_key", "").trim();
        if (secret.isBlank()) {
            log.warn("captcha enabled but security.captcha.secret_key is blank");
            return false;
        }

        try {
            String endpoint = switch (provider) {
                case "recaptcha", "google", "google_recaptcha" -> "https://www.google.com/recaptcha/api/siteverify";
                case "hcaptcha" -> "https://hcaptcha.com/siteverify";
                default -> "https://challenges.cloudflare.com/turnstile/v0/siteverify";
            };
            String body = "secret=" + enc(secret) + "&response=" + enc(token.trim())
                    + (remoteIp == null || remoteIp.isBlank() ? "" : "&remoteip=" + enc(remoteIp));
            HttpRequest req = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return resp.statusCode() >= 200 && resp.statusCode() < 300
                    && resp.body() != null
                    && resp.body().contains("\"success\":true");
        } catch (Exception e) {
            log.warn("captcha verify failed: {}", e.getMessage());
            return false;
        }
    }

    private static boolean bool(String v) {
        if (v == null) return false;
        String s = v.trim().toLowerCase(Locale.ROOT);
        return "1".equals(s) || "true".equals(s) || "yes".equals(s) || "on".equals(s);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
