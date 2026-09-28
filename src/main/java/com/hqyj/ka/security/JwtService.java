package com.hqyj.ka.security;

import com.hqyj.ka.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * JWT:Access(短) + Refresh(长,jti 轮换)。HS256,密钥 ≥256bit 由环境变量注入。
 * 无状态设计 → 多节点水平扩展无需改造。
 */
@Service
public class JwtService {

    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    /**
     * 令牌阵营("kind" 声明):admin=管理端(sys_user)/ member=会员(member 表)。
     * 两套账号体系共用一把签名密钥,靠 kind 硬隔离 —— 缺失视为 admin(兼容存量令牌)。
     * 安全关键:两侧 refresh 接口都必须校验 kind,否则会员刷新令牌可能凭同号 ID 换出管理令牌。
     */
    public static final String CLAIM_KIND = "kind";
    public static final String KIND_ADMIN = "admin";
    public static final String KIND_MEMBER = "member";

    private final SecretKey key;
    private final AppProperties props;

    public JwtService(AppProperties props) {
        this.props = props;
        this.key = Keys.hmacShaKeyFor(Base64.getDecoder().decode(props.getSecurity().getJwtSecret()));
    }

    public String createAccessToken(Long userId, String username, List<String> authorities, String tokenVersion) {
        return buildAccessToken(userId, username, authorities, KIND_ADMIN, tokenVersion);
    }

    public String createRefreshToken(Long userId, String tokenVersion) {
        return buildRefreshToken(userId, tokenVersion, KIND_ADMIN);
    }

    public String createMemberAccessToken(Long memberId, String nickname, String tokenVersion) {
        return buildAccessToken(memberId, nickname, List.of(), KIND_MEMBER, tokenVersion);
    }

    public String createMemberRefreshToken(Long memberId, String tokenVersion) {
        return buildRefreshToken(memberId, tokenVersion, KIND_MEMBER);
    }

    private String buildAccessToken(Long id, String name, List<String> authorities, String kind, String tokenVersion) {
        long ttl = props.getSecurity().getAccessTokenTtlMinutes() * 60_000;
        return Jwts.builder()
                .subject(String.valueOf(id))
                .claim("username", name)
                .claim("auth", authorities)
                .claim("typ", TYPE_ACCESS)
                .claim(CLAIM_KIND, kind)
                .claim("ver", tokenVersion)
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ttl))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    private String buildRefreshToken(Long id, String tokenVersion, String kind) {
        long ttl = props.getSecurity().getRefreshTokenTtlDays() * 86_400_000L;
        return Jwts.builder()
                .subject(String.valueOf(id))
                .claim("typ", TYPE_REFRESH)
                .claim("ver", tokenVersion)
                .claim(CLAIM_KIND, kind)
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ttl))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /** 令牌阵营:缺失(存量令牌)按 admin 处理。 */
    public static String kindOf(Claims claims) {
        String kind = claims.get(CLAIM_KIND, String.class);
        return kind == null ? KIND_ADMIN : kind;
    }

    /** 解析并校验签名与过期;失败返回 null(调用方按未认证处理)。 */
    public Claims parse(String token) {
        try {
            return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
