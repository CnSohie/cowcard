package com.hqyj.ka.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.hqyj.ka.config.AppProperties;
import com.hqyj.ka.sysconfig.service.ConfigService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 应用层 CC(Challenge Collapsar,应用层洪水)防御:
 *  ① 令牌桶按 (接口档位, IP) 平滑限流,兼顾突发与持续速率;
 *  ② 连续触发限流累计到阈值 → 临时封禁该 IP,重复封禁时长按 2 的幂递增(惩罚复发者);
 *  ③ 封禁命中直接快速拒绝,不进入业务线程 / 不查库,抵消慢接口被刷爆资源。
 * 全部 Caffeine 进程内实现,零外部依赖(2C2G 友好);多节点扩容时同一接口切 Redis 令牌桶即可。
 *
 * 参数可在后台「站点设置」运行时调整(sys_config 的 security.rl.* 键,保存即生效),
 * 未配置的项回落 yml / AppProperties 默认值;配置读取走 Caffeine 缓存,零额外查库。
 *
 * 重要:真实客户端 IP 依赖 ka.security.trust-forward-header。
 *  - 生产在 Nginx/CDN 之后设 true(Nginx 需覆盖式写 X-Forwarded-For,防伪造);
 *  - 直接暴露设 false,只认 TCP 源 IP,否则攻击者伪造 XFF 可绕过限流或嫁祸封禁他人。
 */
@Slf4j
@Component
@Order(1) // 最前置:限流/封禁先于认证,拒绝流量成本最低
public class RateLimitFilter extends OncePerRequestFilter {

    public static final String CLIENT_IP_ATTR = "ka.clientIp";

    private final AppProperties props;
    private final ConfigService configService;

    /** 令牌桶:key = 档位:IP */
    private final Cache<String, TokenBucket> buckets = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(10)).maximumSize(200_000).build();
    /** 违规计数:key = IP,窗口 2 分钟 */
    private final Cache<String, AtomicInteger> violations = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(2)).maximumSize(200_000).build();
    /** 封禁到期时间戳(毫秒):key = IP */
    private final Cache<String, Long> banned = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(24)).maximumSize(200_000).build();
    /** 历史封禁次数(用于递增时长),24h 窗口 */
    private final Cache<String, AtomicInteger> banCount = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(24)).maximumSize(200_000).build();

    public RateLimitFilter(AppProperties props, ConfigService configService) {
        this.props = props;
        this.configService = configService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain chain)
            throws ServletException, IOException {
        String ip = resolveClientIp(req);
        req.setAttribute(CLIENT_IP_ATTR, ip);

        AppProperties.RateLimit cfg = props.getSecurity().getRateLimit();
        Map<String, String> db = dbConfig();
        if (!enabled(db, cfg)) {
            chain.doFilter(req, resp);
            return;
        }

        // ① 封禁快速拒绝
        Long until = banned.getIfPresent(ip);
        if (until != null && until > System.currentTimeMillis()) {
            reject(resp, "访问过于频繁,已被临时限制,请稍后再试");
            return;
        }

        // ② 令牌桶限流(后台改参数后,旧桶按新容量原地重建)
        String uri = req.getRequestURI();
        String tier = tierKey(uri, req.getMethod());
        int perMinute = tierLimit(tier, db, cfg);
        String key = tier + ":" + ip;
        TokenBucket bucket = buckets.get(key, k -> new TokenBucket(perMinute));
        if (bucket.perMinute != perMinute) {
            bucket = new TokenBucket(perMinute);
            buckets.put(key, bucket);
        }

        if (!bucket.tryConsume()) {
            int v = violations.get(ip, k -> new AtomicInteger()).incrementAndGet();
            // 本机回环不递增封禁(开发/同机压测保护;生产走反代时务必 trust-forward-header=true 以取真实 IP)
            if (v >= cfgInt(db, "security.rl.ban_threshold", cfg.getBanThreshold()) && !isLoopback(ip)) {
                ban(ip, cfgInt(db, "security.rl.ban_minutes", cfg.getBanMinutes()), cfg.getMaxBanMinutes());
                violations.invalidate(ip);
            }
            reject(resp, "请求过于频繁,请稍后再试");
            return;
        }

        chain.doFilter(req, resp);
    }

    private void ban(String ip, int baseMinutes, int maxMinutes) {
        int count = banCount.get(ip, k -> new AtomicInteger()).incrementAndGet();
        long minutes = Math.min((long) maxMinutes,
                (long) baseMinutes * (1L << Math.min(count - 1, 20)));
        banned.put(ip, System.currentTimeMillis() + minutes * 60_000L);
        log.warn("IP {} 触发第 {} 次封禁,时长 {} 分钟", ip, count, minutes);
    }

    /** 后台「解除全部封禁 / 重置限流状态」:清空封禁名单、违规计数与令牌桶。 */
    public void resetAll() {
        banned.invalidateAll();
        violations.invalidateAll();
        banCount.invalidateAll();
        buckets.invalidateAll();
        log.info("限流状态已由管理员重置(封禁/违规/令牌桶全部清空)");
    }

    /** sys_config 覆盖参数(Caffeine 缓存);DB 异常时回落 yml 默认,防御链路永不因配置读挂掉。 */
    private Map<String, String> dbConfig() {
        try {
            return configService.all();
        } catch (Exception e) {
            return Map.of();
        }
    }

    private boolean enabled(Map<String, String> db, AppProperties.RateLimit cfg) {
        String v = db.get("security.rl.enabled");
        if (v == null || v.isBlank()) return cfg.isEnabled();
        return !("0".equals(v.trim()) || "false".equalsIgnoreCase(v.trim()) || "off".equalsIgnoreCase(v.trim()));
    }

    private static int cfgInt(Map<String, String> db, String key, int def) {
        String v = db.get(key);
        if (v == null || v.isBlank()) return def;
        try {
            int i = Integer.parseInt(v.trim());
            return i > 0 ? i : def;
        } catch (NumberFormatException e) {
            return def;
        }
    }

    /** 各接口档位每分钟上限(sys_config 可覆盖)。 */
    private int tierLimit(String tier, Map<String, String> db, AppProperties.RateLimit c) {
        return switch (tier) {
            case "login" -> cfgInt(db, "security.rl.login_per_minute", c.getLoginPerMinute());
            case "mauth" -> cfgInt(db, "security.rl.login_per_minute", c.getLoginPerMinute()); // 会员注册/登录同登录档,防撞库与批量注册
            case "order" -> cfgInt(db, "security.rl.order_per_minute", c.getOrderPerMinute());
            case "notify" -> 120;      // 支付回调:留足重发余量,不误伤网关
            case "pay" -> cfgInt(db, "security.rl.pay_per_minute", c.getPayPerMinute());
            case "captcha" -> 30;    // 图形验证码生成/校验，限制枚举与图片生成开销
            case "admin" -> cfgInt(db, "security.rl.admin_per_minute", c.getAdminPerMinute());
            default -> cfgInt(db, "security.rl.global_per_minute", c.getGlobalPerMinute());
        };
    }

    private String tierKey(String uri, String method) {
        if (uri.startsWith("/api/auth/login")) return "login";
        if (uri.startsWith("/api/member/auth") && "POST".equals(method)) return "mauth";
        if (uri.startsWith("/api/orders") && "POST".equals(method)) return "order";
        if (uri.startsWith("/api/pay/notify")) return "notify";
        if (uri.startsWith("/api/store/captcha/")) return "captcha";
        if (uri.startsWith("/api/pay")) return "pay";
        if (uri.startsWith("/api/admin/")) return "admin"; // 后台操作独立档位:密集操作不挤占买家全局档
        return "g";
    }

    private static boolean isLoopback(String ip) {
        return "127.0.0.1".equals(ip) || "::1".equals(ip) || "0:0:0:0:0:0:0:1".equals(ip);
    }

    private void reject(HttpServletResponse resp, String msg) throws IOException {
        resp.setStatus(429);
        resp.setContentType(MediaType.APPLICATION_JSON_VALUE);
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write("{\"code\":429,\"message\":\"" + msg + "\",\"data\":null}");
    }

    /** 解析真实客户端 IP(受 trust-forward-header 约束,防 XFF 伪造)。 */
    private String resolveClientIp(HttpServletRequest req) {
        if (props.getSecurity().isTrustForwardHeader()) {
            String xff = req.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
            String real = req.getHeader("X-Real-IP");
            if (real != null && !real.isBlank()) return real.trim();
        }
        return req.getRemoteAddr();
    }

    /** 供控制器/服务复用:优先取过滤器已解析并校验过的 IP,避免各处重复读 XFF 造成不一致。 */
    public static String clientIp(HttpServletRequest req) {
        Object v = req.getAttribute(CLIENT_IP_ATTR);
        return v != null ? v.toString() : req.getRemoteAddr();
    }

    /** 令牌桶:容量 = 每分钟上限,按毫秒匀速回填,允许短时突发。 */
    static final class TokenBucket {
        final int perMinute;
        private final double capacity;
        private final double refillPerMs;
        private double tokens;
        private long last;

        TokenBucket(int perMinute) {
            this.perMinute = perMinute;
            this.capacity = Math.max(1, perMinute);
            this.refillPerMs = capacity / 60_000.0;
            this.tokens = capacity;
            this.last = System.currentTimeMillis();
        }

        synchronized boolean tryConsume() {
            long now = System.currentTimeMillis();
            tokens = Math.min(capacity, tokens + (now - last) * refillPerMs);
            last = now;
            if (tokens >= 1) {
                tokens -= 1;
                return true;
            }
            return false;
        }
    }
}
