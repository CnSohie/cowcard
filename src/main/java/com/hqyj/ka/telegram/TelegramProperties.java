package com.hqyj.ka.telegram;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Separate storefront bot. Credentials are environment properties, never returned by site config APIs. */
@Getter @Setter
@Component
@ConfigurationProperties(prefix = "ka.telegram")
public class TelegramProperties {
    private boolean enabled;
    private String botToken = "";
    private String webhookSecret = "";
    private String siteUrl = "";

    @PostConstruct
    public void validate() {
        if (!enabled) return;
        if (!botToken.matches("[0-9]+:[A-Za-z0-9_-]{20,}"))
            throw new IllegalStateException("KA_TG_BOT_TOKEN is required");
        if (!webhookSecret.matches("[A-Za-z0-9_-]{32,256}"))
            throw new IllegalStateException("KA_TG_WEBHOOK_SECRET must contain 32-256 URL-safe characters");
        URI uri = URI.create(siteUrl);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
            throw new IllegalStateException("KA_TG_SITE_URL must be an HTTPS origin");
        siteUrl = siteUrl.replaceAll("/+$", "");
    }

    public long botId() { return Long.parseLong(botToken.substring(0, botToken.indexOf(':'))); }

    public boolean accepts(String secret) {
        return enabled && secret != null && !webhookSecret.isBlank()
                && MessageDigest.isEqual(webhookSecret.getBytes(StandardCharsets.UTF_8),
                secret.getBytes(StandardCharsets.UTF_8));
    }
}
