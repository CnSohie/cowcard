package com.hqyj.ka.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hqyj.ka.common.BusinessException;
import com.hqyj.ka.common.ErrorCode;
import com.hqyj.ka.sysconfig.service.ConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;

/**
 * 表单人机验证。第三方验证码在服务端复核 action/hostname；站内验证码使用
 * 一次性 challenge + 一次性 proof，两者均绑定客户端 IP 与表单 action。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CaptchaService {
    public static final String BUILTIN = "builtin";
    public static final Set<String> ALL_ACTIONS = Set.of(
            "admin_login", "member_login", "member_register", "order_create", "order_query",
            "payment", "presale_redeem", "wallet_recharge", "wallet_withdraw",
            "gift_card_redeem", "article_purchase", "support_ticket"
    );

    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    /** 5x7 像素字库：纯 Java 渲染，避免 Linux/headless 环境加载 AWT 字体。 */
    private static final Map<Character, String[]> PIXEL_FONT = Map.ofEntries(
            glyph('2', "01110", "10001", "00001", "00010", "00100", "01000", "11111"),
            glyph('3', "11110", "00001", "00001", "01110", "00001", "00001", "11110"),
            glyph('4', "00010", "00110", "01010", "10010", "11111", "00010", "00010"),
            glyph('5', "11111", "10000", "10000", "11110", "00001", "00001", "11110"),
            glyph('6', "01110", "10000", "10000", "11110", "10001", "10001", "01110"),
            glyph('7', "11111", "00001", "00010", "00100", "01000", "01000", "01000"),
            glyph('8', "01110", "10001", "10001", "01110", "10001", "10001", "01110"),
            glyph('9', "01110", "10001", "10001", "01111", "00001", "00001", "01110"),
            glyph('A', "01110", "10001", "10001", "11111", "10001", "10001", "10001"),
            glyph('B', "11110", "10001", "10001", "11110", "10001", "10001", "11110"),
            glyph('C', "01111", "10000", "10000", "10000", "10000", "10000", "01111"),
            glyph('D', "11110", "10001", "10001", "10001", "10001", "10001", "11110"),
            glyph('E', "11111", "10000", "10000", "11110", "10000", "10000", "11111"),
            glyph('F', "11111", "10000", "10000", "11110", "10000", "10000", "10000"),
            glyph('G', "01111", "10000", "10000", "10111", "10001", "10001", "01110"),
            glyph('H', "10001", "10001", "10001", "11111", "10001", "10001", "10001"),
            glyph('J', "00111", "00010", "00010", "00010", "00010", "10010", "01100"),
            glyph('K', "10001", "10010", "10100", "11000", "10100", "10010", "10001"),
            glyph('L', "10000", "10000", "10000", "10000", "10000", "10000", "11111"),
            glyph('M', "10001", "11011", "10101", "10101", "10001", "10001", "10001"),
            glyph('N', "10001", "11001", "10101", "10011", "10001", "10001", "10001"),
            glyph('P', "11110", "10001", "10001", "11110", "10000", "10000", "10000"),
            glyph('Q', "01110", "10001", "10001", "10001", "10101", "10010", "01101"),
            glyph('R', "11110", "10001", "10001", "11110", "10100", "10010", "10001"),
            glyph('S', "01111", "10000", "10000", "01110", "00001", "00001", "11110"),
            glyph('T', "11111", "00100", "00100", "00100", "00100", "00100", "00100"),
            glyph('U', "10001", "10001", "10001", "10001", "10001", "10001", "01110"),
            glyph('V', "10001", "10001", "10001", "10001", "10001", "01010", "00100"),
            glyph('W', "10001", "10001", "10001", "10101", "10101", "10101", "01010"),
            glyph('X', "10001", "10001", "01010", "00100", "01010", "10001", "10001"),
            glyph('Y', "10001", "10001", "01010", "00100", "00100", "00100", "00100"),
            glyph('Z', "11111", "00001", "00010", "00100", "01000", "10000", "11111")
    );
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    private final ConfigService configService;
    private final JsonMapper jsonMapper;

    private final Cache<String, BuiltinChallenge> builtinChallenges = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(5)).maximumSize(20_000).build();
    private final Cache<String, BuiltinProof> builtinProofs = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(2)).maximumSize(20_000).build();
    private final Cache<String, Boolean> acceptedExternalTokens = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10)).maximumSize(100_000).build();

    public record PublicConfig(boolean enabled, boolean configured, String provider,
                               String siteKey, String scopes) {}
    public record BuiltinChallengeView(String challengeId, String imageDataUrl, int expiresInSeconds) {}
    public record ConfigurationStatus(boolean enabled, boolean configured, String provider,
                                      boolean secretConfigured, String message) {}

    private record BuiltinChallenge(byte[] answerHash, String remoteIp, String action) {}
    private record BuiltinProof(String remoteIp, String action) {}

    public PublicConfig publicConfig() {
        Map<String, String> cfg = configService.all();
        ConfigurationStatus status = configurationStatus(cfg);
        String siteKey = cfg.getOrDefault("security.captcha.site_key", "").trim();
        return new PublicConfig(status.enabled() && status.configured(), status.configured(), status.provider(),
                status.enabled() && status.configured() && !BUILTIN.equals(status.provider()) ? siteKey : "",
                configuredScopes(cfg));
    }

    public ConfigurationStatus configurationStatus(Map<String, String> cfg) {
        boolean requested = bool(cfg.get("security.captcha.enabled"));
        String provider = normalizeProvider(cfg.get("security.captcha.provider"));
        boolean secretConfigured = !cfg.getOrDefault("security.captcha.secret_key", "").trim().isEmpty();
        boolean configured = BUILTIN.equals(provider)
                || (!cfg.getOrDefault("security.captcha.site_key", "").trim().isEmpty() && secretConfigured);
        String message = !requested ? "人机验证当前未启用"
                : configured ? (BUILTIN.equals(provider) ? "站内图形验证可用" : "密钥已配置，可进行实际验证测试")
                : "缺少 Site Key 或 Secret Key，验证尚未生效";
        return new ConfigurationStatus(requested, configured, provider, secretConfigured, message);
    }

    /** 保存前校验，防止开启一个无法显示或无法服务端验签的配置把所有表单锁死。 */
    public void validateConfiguration(Map<String, String> cfg) {
        String provider = normalizeProviderStrict(cfg.get("security.captcha.provider"));
        validateScopes(cfg); // action 白名单始终校验，避免关闭期间保存坏配置
        if (!bool(cfg.get("security.captcha.enabled"))) return;
        if (!BUILTIN.equals(provider)) {
            if (cfg.getOrDefault("security.captcha.site_key", "").trim().isEmpty()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "开启第三方人机验证前请填写 Site Key");
            }
            if (cfg.getOrDefault("security.captcha.secret_key", "").trim().isEmpty()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "开启第三方人机验证前请填写 Secret Key");
            }
        }
    }

    public boolean enabled() {
        return publicConfig().enabled();
    }

    public boolean requiredFor(String action) {
        PublicConfig cfg = publicConfig();
        return cfg.enabled() && parseScopes(cfg.scopes()).contains(action);
    }

    /** 第三方 token 或站内 proof 的最终一次性消费。 */
    public boolean verify(String token, String remoteIp, String action) {
        PublicConfig publicConfig = publicConfig();
        if (!publicConfig.enabled()) return true;
        if (!validAction(action) || token == null || token.isBlank() || token.length() > 4096) return false;
        if (BUILTIN.equals(publicConfig.provider())) return consumeBuiltinProof(token.trim(), remoteIp, action);
        return verifyExternal(token.trim(), remoteIp, action, publicConfig.provider());
    }

    public BuiltinChallengeView createBuiltinChallenge(String action, String remoteIp) {
        PublicConfig publicConfig = publicConfig();
        boolean required = "admin_captcha_test".equals(action) ? publicConfig.enabled() : requiredFor(action);
        if (!required || !BUILTIN.equals(publicConfig.provider()) || !validAction(action)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "当前未启用站内图形验证");
        }
        int length = builtinLength(configService.all().get("security.captcha.builtin_length"));
        return createBuiltinChallenge(action, remoteIp, randomAnswer(length));
    }

    /** 包内可复用的确定性 challenge 创建入口，便于验证完整的一次性消费语义。 */
    BuiltinChallengeView createBuiltinChallenge(String action, String remoteIp, String answer) {
        String id = randomToken(18);
        builtinChallenges.put(id, new BuiltinChallenge(hash(id + ":" + answer), cleanIp(remoteIp), action));
        return new BuiltinChallengeView(id, renderPngDataUrl(answer), 300);
    }

    /** 每个 challenge 只允许尝试一次；答错后必须刷新，避免离线暴力枚举。 */
    public String solveBuiltinChallenge(String challengeId, String answer, String action, String remoteIp) {
        if (challengeId == null || challengeId.length() > 128 || answer == null || answer.length() > 12
                || !validAction(action)) return null;
        BuiltinChallenge challenge = builtinChallenges.asMap().remove(challengeId);
        if (challenge == null || !MessageDigest.isEqual(challenge.answerHash(),
                hash(challengeId + ":" + answer.trim().toUpperCase(Locale.ROOT)))
                || !challenge.remoteIp().equals(cleanIp(remoteIp)) || !challenge.action().equals(action)) {
            return null;
        }
        String proof = randomToken(32);
        builtinProofs.put(proof, new BuiltinProof(cleanIp(remoteIp), action));
        return proof;
    }

    private boolean consumeBuiltinProof(String token, String remoteIp, String action) {
        BuiltinProof proof = builtinProofs.asMap().remove(token);
        return proof != null && proof.remoteIp().equals(cleanIp(remoteIp)) && proof.action().equals(action);
    }

    private boolean verifyExternal(String token, String remoteIp, String action, String provider) {
        Map<String, String> cfg = configService.all();
        String secret = cfg.getOrDefault("security.captcha.secret_key", "").trim();
        if (secret.isBlank()) return false;

        String replayKey = Base64.getUrlEncoder().withoutPadding().encodeToString(hash(provider + ":" + token));
        if (acceptedExternalTokens.getIfPresent(replayKey) != null) return false;
        try {
            String endpoint = switch (provider) {
                case "recaptcha" -> "https://www.google.com/recaptcha/api/siteverify";
                case "hcaptcha" -> "https://api.hcaptcha.com/siteverify";
                default -> "https://challenges.cloudflare.com/turnstile/v0/siteverify";
            };
            String body = "secret=" + enc(secret) + "&response=" + enc(token)
                    + (remoteIp == null || remoteIp.isBlank() ? "" : "&remoteip=" + enc(remoteIp));
            HttpRequest req = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() < 200 || resp.statusCode() >= 300 || resp.body() == null) return false;

            JsonNode result = jsonMapper.readTree(resp.body());
            if (!result.path("success").asBoolean(false)) return false;
            String returnedAction = result.path("action").asText("").trim();
            // Turnstile 始终支持 action；其他供应商在返回 action 时同样必须匹配。
            if (("turnstile".equals(provider) || !returnedAction.isEmpty()) && !action.equals(returnedAction)) return false;
            if (!hostnameAccepted(result.path("hostname").asText(""), cfg)) return false;

            return acceptedExternalTokens.asMap().putIfAbsent(replayKey, Boolean.TRUE) == null;
        } catch (Exception e) {
            log.warn("captcha verify failed for provider {}: {}", provider, e.getMessage());
            return false;
        }
    }

    private boolean hostnameAccepted(String returned, Map<String, String> cfg) {
        Set<String> allowed = allowedHostnames(cfg);
        if (allowed.isEmpty()) return true;
        return !returned.isBlank() && allowed.contains(normalizeHostname(returned));
    }

    private Set<String> allowedHostnames(Map<String, String> cfg) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        String configured = cfg.getOrDefault("security.captcha.allowed_hostnames", "");
        for (String item : configured.split(",")) {
            String host = normalizeHostname(item);
            if (!host.isEmpty()) result.add(host);
        }
        if (result.isEmpty()) {
            String siteUrl = cfg.getOrDefault("site.url", "").trim();
            if (!siteUrl.isEmpty()) {
                try {
                    String host = URI.create(siteUrl).getHost();
                    if (host != null) result.add(normalizeHostname(host));
                } catch (IllegalArgumentException ignored) {
                    // site.url 由其它配置负责校验；验证码在无有效域名时只做供应商验签。
                }
            }
        }
        return result;
    }

    private static String configuredScopes(Map<String, String> cfg) {
        String raw = cfg.getOrDefault("security.captcha.scopes", "").trim();
        Set<String> scopes = raw.isEmpty() ? ALL_ACTIONS : parseScopes(raw);
        if (scopes.isEmpty()) throw new BusinessException(ErrorCode.BAD_REQUEST, "至少选择一个需要人机验证的表单");
        return String.join(",", scopes);
    }

    private static void validateScopes(Map<String, String> cfg) {
        if (!cfg.containsKey("security.captcha.scopes")) return; // 旧配置默认保护全部场景
        String raw = cfg.getOrDefault("security.captcha.scopes", "").trim();
        if (raw.isEmpty()) throw new BusinessException(ErrorCode.BAD_REQUEST, "至少选择一个需要人机验证的表单");
        for (String item : raw.split(",")) {
            String action = item.trim().toLowerCase(Locale.ROOT);
            if (!ALL_ACTIONS.contains(action)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "人机验证表单范围包含无效选项");
            }
        }
    }

    private static Set<String> parseScopes(String raw) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (raw != null) for (String item : raw.split(",")) {
            String action = item.trim().toLowerCase(Locale.ROOT);
            if (!action.isEmpty() && ALL_ACTIONS.contains(action)) result.add(action);
        }
        return result;
    }

    private static String normalizeProvider(String raw) {
        try {
            return normalizeProviderStrict(raw);
        } catch (BusinessException ignored) {
            return "turnstile";
        }
    }

    private static String normalizeProviderStrict(String raw) {
        String provider = raw == null ? "turnstile" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (provider) {
            case BUILTIN, "self", "local" -> BUILTIN;
            case "turnstile", "cloudflare" -> "turnstile";
            case "recaptcha", "google", "google_recaptcha" -> "recaptcha";
            case "hcaptcha" -> "hcaptcha";
            default -> throw new BusinessException(ErrorCode.BAD_REQUEST, "不支持的人机验证服务商");
        };
    }

    private static int builtinLength(String raw) {
        try {
            return Math.max(4, Math.min(6, Integer.parseInt(raw == null ? "5" : raw.trim())));
        } catch (NumberFormatException e) {
            return 5;
        }
    }

    private static String randomAnswer(int length) {
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) value.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return value.toString();
    }

    private static String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String renderPngDataUrl(String answer) {
        try {
            int width = 240, height = 72;
            int[] pixels = new int[width * height];
            java.util.Arrays.fill(pixels, 0xF7FAF8);
            for (int i = 0; i < 8; i++) {
                int color = rgb(120 + RANDOM.nextInt(90), 150 + RANDOM.nextInt(70), 135 + RANDOM.nextInt(80));
                drawLine(pixels, width, height, RANDOM.nextInt(width), RANDOM.nextInt(height),
                        RANDOM.nextInt(width), RANDOM.nextInt(height), color);
            }
            int scale = 6;
            int glyphWidth = 5 * scale;
            int gap = Math.max(5, (width - answer.length() * glyphWidth) / (answer.length() + 1));
            for (int i = 0; i < answer.length(); i++) {
                int x = gap + i * (glyphWidth + gap) + RANDOM.nextInt(5) - 2;
                int y = 13 + RANDOM.nextInt(7) - 3;
                int shear = RANDOM.nextInt(3) - 1;
                int color = rgb(25 + RANDOM.nextInt(45), 55 + RANDOM.nextInt(55), 48 + RANDOM.nextInt(55));
                drawGlyph(pixels, width, height, PIXEL_FONT.get(answer.charAt(i)), x, y, scale, shear, color);
            }
            for (int i = 0; i < 90; i++) {
                setPixel(pixels, width, height, RANDOM.nextInt(width), RANDOM.nextInt(height),
                        rgb(100 + RANDOM.nextInt(120), 100 + RANDOM.nextInt(120), 100 + RANDOM.nextInt(120)));
            }
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(encodePng(pixels, width, height));
        } catch (Exception e) {
            throw new IllegalStateException("failed to render builtin captcha", e);
        }
    }

    private static Map.Entry<Character, String[]> glyph(char value, String... rows) {
        return Map.entry(value, rows);
    }

    private static void drawGlyph(int[] pixels, int width, int height, String[] rows,
                                  int x, int y, int scale, int shear, int color) {
        for (int row = 0; row < rows.length; row++) {
            for (int col = 0; col < rows[row].length(); col++) {
                if (rows[row].charAt(col) != '1') continue;
                int px = x + col * scale + shear * (row - 3);
                int py = y + row * scale;
                for (int dy = 0; dy < scale - 1; dy++) for (int dx = 0; dx < scale - 1; dx++) {
                    setPixel(pixels, width, height, px + dx, py + dy, color);
                }
            }
        }
    }

    private static void drawLine(int[] pixels, int width, int height,
                                 int x0, int y0, int x1, int y1, int color) {
        int dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        int dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        int error = dx + dy;
        while (true) {
            setPixel(pixels, width, height, x0, y0, color);
            if (x0 == x1 && y0 == y1) break;
            int twice = 2 * error;
            if (twice >= dy) { error += dy; x0 += sx; }
            if (twice <= dx) { error += dx; y0 += sy; }
        }
    }

    private static void setPixel(int[] pixels, int width, int height, int x, int y, int color) {
        if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = color;
    }

    private static int rgb(int red, int green, int blue) {
        return ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff);
    }

    /** 最小 PNG 编码器（RGB/无滤镜），只依赖 java.base 的 Deflater。 */
    private static byte[] encodePng(int[] pixels, int width, int height) throws IOException {
        ByteArrayOutputStream raw = new ByteArrayOutputStream(height * (1 + width * 3));
        for (int y = 0; y < height; y++) {
            raw.write(0); // PNG filter: None
            for (int x = 0; x < width; x++) {
                int color = pixels[y * width + x];
                raw.write((color >>> 16) & 0xff);
                raw.write((color >>> 8) & 0xff);
                raw.write(color & 0xff);
            }
        }
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(compressed)) {
            raw.writeTo(deflater);
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        DataOutputStream data = new DataOutputStream(png);
        data.writeLong(0x89504E470D0A1A0AL);
        ByteArrayOutputStream ihdrBytes = new ByteArrayOutputStream(13);
        DataOutputStream ihdr = new DataOutputStream(ihdrBytes);
        ihdr.writeInt(width);
        ihdr.writeInt(height);
        ihdr.writeByte(8); // bit depth
        ihdr.writeByte(2); // truecolor RGB
        ihdr.writeByte(0);
        ihdr.writeByte(0);
        ihdr.writeByte(0);
        writePngChunk(data, "IHDR", ihdrBytes.toByteArray());
        writePngChunk(data, "IDAT", compressed.toByteArray());
        writePngChunk(data, "IEND", new byte[0]);
        return png.toByteArray();
    }

    private static void writePngChunk(DataOutputStream out, String type, byte[] payload) throws IOException {
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.writeInt(payload.length);
        out.write(typeBytes);
        out.write(payload);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(payload);
        out.writeInt((int) crc.getValue());
    }

    private static boolean validAction(String action) {
        return action != null && (ALL_ACTIONS.contains(action) || "admin_captcha_test".equals(action));
    }

    private static byte[] hash(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String cleanIp(String ip) {
        return ip == null ? "" : ip.trim();
    }

    private static String normalizeHostname(String value) {
        String host = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
        return host;
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
