package com.hqyj.ka.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/** 应用配置(application.yml 的 ka.* 段),链/代币矩阵配置驱动,加链加币零代码。 */
@Getter
@Setter
@ConfigurationProperties(prefix = "ka")
public class AppProperties {

    private Security security = new Security();
    private Order order = new Order();
    private Crypto crypto = new Crypto();
    private Upload upload = new Upload();

    /** 图片上传(本地磁盘存储,经 /files/** 静态映射对外服务)。 */
    @Getter @Setter
    public static class Upload {
        /** 存储根目录(相对工作目录或绝对路径) */
        private String dir = "./data/upload";
        /** 单文件大小上限(MB),与 spring.servlet.multipart 上限双闸 */
        private int maxSizeMb = 5;
    }

    @Getter @Setter
    public static class Security {
        /** JWT HS256 密钥,base64,≥32 字节。环境变量 KA_JWT_SECRET */
        private String jwtSecret;
        private long accessTokenTtlMinutes = 30;
        private long refreshTokenTtlDays = 7;
        /** AES-256-GCM 主密钥,base64 的 32 字节。环境变量 KA_AES_KEY */
        private String aesKey;
        private int loginMaxFailures = 5;
        private int loginLockMinutes = 15;
        /** 管理后台 IP 白名单(空=不限制),支持精确 IP */
        private List<String> adminIpAllowlist = new ArrayList<>();
        /**
         * 是否信任 X-Forwarded-For 取真实客户端 IP。
         * 生产在 Nginx/CDN 之后 = true;直接暴露(无反代)= false,否则攻击者可伪造 XFF 绕过限流/嫁祸封禁。
         */
        private boolean trustForwardHeader = false;
        private RateLimit rateLimit = new RateLimit();

        public byte[] aesKeyBytes() { return Base64.getDecoder().decode(aesKey); }
    }

    /**
     * 应用层 CC 防御参数(令牌桶 + 自动封禁,全部 Caffeine 进程内,2C2G 无需 Redis)。
     * 以下为默认值;后台「站点设置」可用 sys_config 的 security.rl.* 键运行时覆盖,保存即生效。
     */
    @Getter @Setter
    public static class RateLimit {
        private boolean enabled = true;
        /** 单 IP 全局每分钟请求上限(令牌桶容量,兼顾突发) */
        private int globalPerMinute = 480;
        /** 后台管理接口每分钟上限(独立档位,后台密集操作不挤占买家档) */
        private int adminPerMinute = 600;
        /** 登录/注册接口每分钟上限 */
        private int loginPerMinute = 10;
        /** 下单接口每分钟上限 */
        private int orderPerMinute = 20;
        /** 支付创建/状态轮询每分钟上限(收银台 3 秒一轮询,需留足余量) */
        private int payPerMinute = 90;
        /** 连续触发限流多少次后临时封禁该 IP */
        private int banThreshold = 5;
        /** 首次封禁时长(分钟),重复封禁按 2 的幂递增 */
        private int banMinutes = 10;
        /** 封禁时长上限(分钟) */
        private int maxBanMinutes = 240;
    }

    @Getter @Setter
    public static class Order {
        /** 未支付订单过期分钟数 */
        private int expireMinutes = 15;
        private int maxQuantityPerOrder = 100;
    }

    @Getter @Setter
    public static class Crypto {
        /** 商户收款地址(冷钱包,服务器不持有私钥) */
        private String merchantAddress;
        /** 链上确认轮询间隔(毫秒) */
        private long scanIntervalMs = 15000;
        /** 每次扫描最大区块窗口 */
        private int maxBlockRange = 2000;
        /** 意向单有效分钟数 */
        private int intentExpireMinutes = 15;
        /** 初始/兜底汇率(1 USD = fxRate CNY);开启自动刷新后仅作为启动初值与降级值 */
        private java.math.BigDecimal fxRate = new java.math.BigDecimal("7.20");
        /** 汇率自动刷新开关(FxRateService,每小时,免费接口无需 Key) */
        private boolean fxAutoRefresh = true;
        private String fxRateUrl = "https://open.er-api.com/v6/latest/USD";
        private long fxRefreshMs = 3_600_000;
        private List<Chain> chains = new ArrayList<>();
    }

    @Getter @Setter
    public static class Chain {
        /** BASE / POLYGON / BSC */
        private String code;
        private long chainId;
        private boolean enabled = true;
        /** 达到该确认数才入账 */
        private int confirmations = 12;
        /** 多个 RPC 端点,故障自动切换 */
        private List<String> rpcUrls = new ArrayList<>();
        private List<Token> tokens = new ArrayList<>();
    }

    @Getter @Setter
    public static class Token {
        private String symbol;
        private String contract;
        private int decimals = 6;
    }
}
