# Ka 发卡平台 — 架构设计文档

> 版本:v1.1 · 目标环境:2 vCPU / 2 GB RAM 单机 · 技术栈:Spring Boot 4.0.6 (Java 17+) + MySQL 8 + React 18
> (v1.1 勘误:原文写 Spring Boot 4.1,但 4.1.0 尚无正式版——Maven Central 只有 4.1.0-M1~M4/RC1,曾导致父 POM 解析失败、全部依赖缺失;现锁定最新 GA 4.0.6,待 4.1.0 GA 后仅需改父版本号)
> 定位:自动发卡平台(职能对标独角数卡),支持 USDC(Base / Polygon)、USDT(BEP20)加密支付与支付宝支付,企业级安全基线,预留水平扩展空间。

---

## 1. 总体架构

### 1.1 部署拓扑(2C2G 单机)

```
                        ┌──────────────────────────────────────────┐
                        │              2C2G 服务器                  │
  用户/买家  ──HTTPS──▶ │  Nginx (≈20MB)                           │
  管理员    ──HTTPS──▶ │   ├─ /            → 前端静态文件(React 构建产物)│
                        │   ├─ /api/**      → 127.0.0.1:8080        │
                        │   └─ gzip/缓存/限速/TLS 终结               │
                        │                                          │
                        │  Spring Boot 单进程 (JVM 堆 1G,总 ≈1.3G)  │
                        │   ├─ REST API(前台 + 管理后台)             │
                        │   ├─ 支付策略引擎(支付宝/易支付/加密货币)     │
                        │   ├─ 链上扫描调度器(15s 轮询,免费公共 RPC)   │
                        │   └─ Caffeine 进程内缓存(代替 Redis)       │
                        │                                          │
                        │  MySQL 8 (buffer_pool 256M,总 ≈450M)     │
                        └──────────────────────────────────────────┘
                                    │ JSON-RPC(出站)
                        Base RPC ── Polygon RPC ── BSC RPC(Alchemy/Ankr/官方公共节点)
```

内存预算(总 2048 MB):

| 组件 | 预算 |
|---|---|
| 内核 + 系统服务 | ~200 MB |
| Nginx | ~20 MB |
| JVM(-Xmx1g,含元空间/栈/直接内存) | ~1300 MB |
| MySQL(buffer_pool 256M + 连接开销) | ~450 MB |
| 余量 | ~80 MB |

**关键决策:不部署 Redis。** 单机场景下 Caffeine 进程内缓存完成同样职能(商品缓存、配置缓存、限流计数、金额占位),省下 100~200MB 内存。缓存层通过 Spring Cache 抽象接入,未来扩容时改一行配置切到 Redis(见 §8 升级路线)。

### 1.2 前后端分离

- 前端:React 18 + Vite + TypeScript + Tailwind CSS,构建为纯静态文件由 Nginx 托管(**不占后端内存**)。
- 前台商城(买家,免注册游客下单)与管理后台(员工,JWT 登录)同一个 React 工程、两个路由域(`/` 与 `/admin`)。
- 钱包支付使用 wagmi + viem 在浏览器端连接钱包(MetaMask / WalletConnect / OKX 等),链上交互全部发生在买家浏览器,后端只做验证,零私钥风险。
- 前台同页操作（首页筛选、排序、搜索、分页、语言/明暗）不重建页面、不重复请求整份商品目录。顶层 `AppErrorBoundary` 使用 `resetKey=pathname+search` 仅复位错误；`StoreLayout` 的 `Outlet` 仅以 `pathname` 作 key，真正切换商品/订单/页面时才重置页面级状态，共享导航保持挂载。手机分类仅横向滚动 chip rail；底部面板跨到桌面断点时关闭并释放滚动锁。

---

## 2. 后端模块划分

按业务域垂直切分(package by feature),模块间只通过 Service 接口与 Spring 领域事件通信,为未来拆分微服务预留边界:

```
com.hqyj.ka
├─ common          统一响应 ApiResponse / 错误码 / 全局异常 / 工具(AES-GCM、ID 生成)
├─ config          Security、缓存、异步线程池、CORS、应用配置属性(AppProperties)
├─ security        JWT 签发解析、认证过滤器、限流过滤器、登录用户模型
├─ user            用户 + RBAC(角色/权限)、认证服务、账户锁定
├─ catalog         商品分类、商品
├─ card            卡密(静态加密存储、悲观锁分配、批量导入)
├─ order           订单生命周期、游客查单、OrderPaidEvent → 自动发卡
├─ payment         支付策略引擎
│   ├─ alipay      支付宝官方(当面付/电脑网站)策略
│   ├─ epay        易支付协议聚合策略
│   └─ crypto      加密货币:唯一金额法 + 钱包直付法、链扫描调度、RPC 客户端
├─ audit           审计日志(异步落库)
├─ sysconfig       站点配置(K/V,带缓存)
└─ dashboard       管理后台统计
```

### 2.1 订单核心闭环

```
创建订单(校验库存,预占) → 选择支付方式 → 支付策略生成支付凭据
  → [异步] 支付回调/链上确认 → PaymentService.markPaid(幂等)
  → 发布 OrderPaidEvent → 监听器分配卡密(SELECT ... FOR UPDATE SKIP LOCKED)
  → 订单 DELIVERED,买家凭订单号+查询密码提取卡密
超时未付(默认 15 分钟) → 定时任务关单,释放库存与金额占位
```

发卡采用**事件驱动**:支付成功与发卡解耦,未来接入邮件通知、Telegram 通知、风控复核,只需新增监听器,不改支付代码。

---

## 3. 数据库设计(MySQL 8,utf8mb4,InnoDB)

| 表 | 职责 | 关键设计 |
|---|---|---|
| `sys_user` | 后台用户 | bcrypt(12) 密码;`failed_attempts`/`locked_until` 防爆破;`totp_secret` 预留 2FA |
| `sys_role` / `sys_permission` / `sys_user_role` / `sys_role_permission` | RBAC | 权限为细粒度资源码(`product:write`);角色聚合权限;用户多角色 |
| `category` | 商品分类 | 排序 + 显隐 |
| `product` | 商品 | 价格 DECIMAL(20,6);`stock_cached` 冗余库存计数;乐观锁 `version` |
| `card_secret` | 卡密 | **AES-256-GCM 加密存储**;状态 AVAILABLE/LOCKED/SOLD;`order_id` 回溯;`(product_id,status)` 索引供发卡 |
| `orders` | 订单 | 雪花样式订单号;游客查询密码 bcrypt;金额快照;状态机;`(status,expire_at)` 索引供关单 |
| `payment_channel` | 支付渠道配置 | 渠道编码→策略绑定;敏感配置 JSON 加密存储;启停/排序 |
| `payment_transaction` | 支付流水 | 每次支付尝试一条;`channel_trade_no` 唯一防重复回调;金额核对字段 |
| `crypto_payment_intent` | 链上收款意向 | 链/代币/期望金额(最小单位 BigInteger 字符串)/唯一尾数金额/`tx_hash` 唯一/确认数/过期时间;`(token,unique_amount,status)` 唯一约束保证金额占位互斥 |
| `chain_cursor` | 扫描游标 | 每条链已扫描到的区块高度,崩溃后续扫不丢单 |
| `audit_log` | 审计 | 操作者/动作/资源/IP/UA/前后快照,只插不改 |
| `sys_config` | 站点配置 | K/V + 缓存 |

要点:

- **金额一律 `DECIMAL(20,6)` + 代币最小单位用字符串存 BigInteger**,杜绝浮点误差;USDC/USDT 均为 6 位小数,天然匹配。
- 所有回调/扫描入账路径依赖**数据库唯一约束兜底幂等**(`tx_hash` 唯一、`channel_trade_no` 唯一),应用层状态机 + DB 约束双保险。
- 卡密分配用 `FOR UPDATE SKIP LOCKED`,2 核下高并发抢卡不排队、不超卖。

---

## 4. 支付架构

### 4.1 策略模式

```java
public interface PaymentStrategy {
    String channelCode();                                  // ALIPAY_OFFICIAL / EPAY / CRYPTO_TRANSFER / CRYPTO_WALLET
    PayCreationResult create(Order order, PaymentChannel ch, PayContext ctx);
    CallbackResult handleCallback(HttpServletRequest req, PaymentChannel ch); // 验签+金额核对
}
```

`PaymentStrategyRegistry` 启动时收集全部策略 Bean,按渠道编码路由。**新增任何支付方式 = 新增一个策略类 + 后台配一条渠道记录**,零侵入。

### 4.2 支付宝(双通道预留)

| 通道 | 说明 |
|---|---|
| `ALIPAY_OFFICIAL` | 官方开放平台 SDK,当面付(扫码)/电脑网站支付;RSA2 异步通知验签;需企业资质 |
| `EPAY` | 易支付(Epay)协议适配器:`pay_type=alipay`,MD5 签名,标准 notify/return;适配所有兼容聚合商 |

两者共用同一回调安全规范:验签 → 核对订单号与金额(分毫不差)→ 核对 app_id/商户号 → 幂等落账。

### 4.3 加密货币(双模式)

支持代币矩阵(配置驱动,`application.yml` 中声明,加链/加币不改代码):

| 链 | chainId | 代币 | 合约 | 确认数 |
|---|---|---|---|---|
| Base | 8453 | USDC | `0x8335…2913` | 6 |
| Polygon | 137 | USDC | `0x3c49…3359` | 30 |
| BSC | 56 | USDT | `0x55d3…7955` | 5 |

三个加密收款选项（USDC@Base、USDC@Polygon、USDT@BSC）统一使用自动刷新的最新缓存汇率并加价 0.5%（转账、钱包直付均适用）：站点应付金额 × 1.005 ÷ 基础汇率，向上取整到 2 位，再分配唯一尾数。例如 72 CNY、汇率 7.20 时，三者基础应收均为 10.05 代币，另加各自唯一尾数。汇率每小时自动获取，失败保留上次成功值；有效收款意向仍复用原金额，提现不受影响。

**模式 A:唯一金额法(转账直付,任何钱包/交易所提现均可)**

```
下单 → UniqueAmountAllocator 在 [应付, 应付+0.009999] 内分配唯一尾数
     (如 10.003917 USDC,DB 唯一约束保证同代币并发互斥,15 分钟过期释放)
 → 前端展示 收款地址 + 精确金额 + 二维码(EIP-681)+ 倒计时
 → ChainScanJob 每 15s:eth_getLogs 扫描代币合约 Transfer(to=商户地址) 事件
 → 金额精确匹配意向单 → 记录 txHash(唯一) → 追踪确认数 → 达标 → markPaid
```

- 服务器**不保存任何私钥**,收款地址为商户冷钱包地址,资金零托管风险。
- 扫描游标持久化(`chain_cursor`),宕机重启续扫,不漏账;区块回滚保护:确认数达标才入账。
- RPC 多节点配置,失败自动切换下一个;免费公共 RPC(Ankr/Alchemy free tier)足够 15s 轮询量。

**模式 B:钱包直付(Stripe 式体验,连接钱包点击支付)**

```
下单 → 前端 wagmi 连接钱包(MetaMask/WalletConnect/OKX)
 → 买家点击支付 → 浏览器发起 ERC-20 transfer(商户地址, 精确金额) 交易签名
 → 前端将 txHash 提交后端 → 后端 RPC 校验:
     receipt.status=success ∧ 合约地址=配置代币 ∧ Transfer(to=商户地址, value=应付金额)
     ∧ txHash 全局唯一(防一笔交易核销多单) → 追踪确认数 → markPaid
 → 同时链扫描兜底:即使前端没提交 txHash(用户关页),扫描仍能按金额匹配入账
```

> 升级预留:USDC 原生支持 EIP-2612 permit(离线签名授权),后续可上"签名即扣款"网关模式(需 relayer 代付 gas);USDT BEP20 无 permit,保持 transfer 模式。接口层已按 `mode` 字段区分,升级不动存量代码。

### 4.4 入账安全红线(全渠道统一)

1. 金额核对:回调/链上金额与订单应付**逐位比对**,不足额不入账(多付照常发货并记录差额)。
2. 幂等:`tx_hash` / `channel_trade_no` DB 唯一约束 + 订单状态机 CAS 更新。
3. 只信任服务端验证:前端提交的任何数据(含 txHash)只作为线索,入账依据一律是链上/支付宝服务端可验证事实。
4. 回调接口限流 + 失败重试容忍(支付宝会重发 8 次,处理必须幂等)。

---

## 5. 安全设计(企业级基线)

| 域 | 措施 |
|---|---|
| 认证 | JWT(HS256,密钥 ≥256bit 由环境变量注入):Access 30min + Refresh 7d 轮换;登录失败 5 次锁定 15 分钟;密码 bcrypt cost=12;TOTP 2FA 字段与接口预留 |
| 授权 | RBAC 三层(用户-角色-权限),接口级 `@PreAuthorize("hasAuthority('card:write')")`;内置角色:超级管理员/运营/财务/客服,权限最小化分配 |
| 数据 | 卡密 AES-256-GCM 静态加密(每条随机 IV,主密钥仅环境变量);渠道密钥同样加密落库;买家查询密码 bcrypt;日志脱敏 |
| 传输 | 全站 HTTPS(Nginx 终结,TLS1.2+);HSTS/CSP/X-Frame-Options/nosniff 响应头 |
| 接口 | 全量参数校验(Jakarta Validation);统一错误码不泄露堆栈;分层限流(登录 5/min·IP,下单 10/min·IP,全局 100/min·IP,Caffeine 滑动窗口);管理后台可配 IP 白名单 |
| 审计 | 管理端全部写操作异步审计落库(操作者/IP/UA/资源快照);登录成功失败留痕;审计表只插不改 |
| 注入/越权 | JPA 参数化查询杜绝 SQL 注入;所有管理接口二次鉴权;订单查询需 订单号+联系方式/查询密码 双因子,防遍历 |
| 密钥管理 | 仓库零密钥:JWT 密钥、AES 主密钥、数据库口令、RPC Key、支付宝私钥全部环境变量/挂载文件注入,`.env.example` 提供清单 |
| 供应链 | 依赖锁定 Spring Boot BOM;上线前 `mvn dependency:tree` 审计;镜像最小化(JRE 17-slim) |

---

## 6. 2C2G 性能调优

### 6.1 JVM(启动脚本已带)

```
-Xms512m -Xmx1g -XX:MaxMetaspaceSize=192m -Xss512k
-XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UseStringDeduplication
-XX:ActiveProcessorCount=2 -Dspring.profiles.active=prod
```

### 6.2 应用层(application-prod.yml 已配)

- Tomcat:`max-threads=50`(2 核 IO 密集足够)、`accept-count=100`、禁用不必要的 MBean。
- HikariCP:`maximum-pool-size=8`、`minimum-idle=2`(2 核经验公式 cores*2+磁盘数,余量给定时任务)。
- JPA:`open-in-view=false`(避免连接被视图层长占);批量写 `batch_size=50`(卡密导入)。
- Caffeine:商品/分类/配置缓存 5min TTL;限流窗口 1min;上限条目数硬性封顶防内存膨胀。
- 调度线程池 2、异步线程池 2~4(审计/通知),全部有界队列 + 丢弃策略告警,防 OOM。
- 链扫描:单线程调度,三条链串行扫,每次 `eth_getLogs` 限定区块窗口 ≤2000,常态开销 <1% CPU。

### 6.3 MySQL(docs/my.cnf.example)

```
innodb_buffer_pool_size=256M   performance_schema=OFF
max_connections=60             innodb_flush_log_at_trx_commit=1(资金数据不降级)
skip_name_resolve=ON           tmp_table_size=32M
```

### 6.4 Nginx

前端静态文件强缓存(带 hash 文件名 `max-age=31536000`)+ gzip;`/api` 反代加 `limit_req` 二道限流;支付回调路径单独放宽。

---

## 7. 目录结构(交付物)

```
Ka/
├─ docs/            本文档、部署手册、my.cnf/nginx 示例、.env 清单
├─ src/main/java/com/hqyj/ka/…   后端(见 §2 模块图)
├─ src/main/resources/
│   ├─ application.yml / application-prod.yml
│   └─ db/migration/V*.sql(Flyway 迁移;RBAC 由 DataInitializer 幂等初始化)
├─ frontend/        React 18 + Vite + TS + Tailwind(前台商城 + 管理后台)
└─ CLAUDE.md        项目约定(供后续 AI 会话延续上下文)
```

---

## 8. 升级路线图(预留空间)

| 阶段 | 触发条件 | 动作 | 代码预留 |
|---|---|---|---|
| L1(现在) | 2C2G 单机 | 单体 + Caffeine + 单 MySQL | — |
| L2 | 并发 >200 QPS | 加 Redis(改 `spring.cache.type=redis`),限流迁 Redis;JVM 堆随机器加大 | 缓存走 Spring Cache 抽象,限流器接口化 |
| L3 | 发卡/通知延迟敏感 | 引入轻量 MQ(Redis Stream),事件监听器改投递 | 领域事件已解耦,监听器可平移 |
| L4 | 多节点 | 无状态化(JWT 已无会话)、Nginx upstream 负载均衡、链扫描任务加分布式锁(ShedLock) | 扫描任务单入口,加锁点唯一 |
| 支付扩展 | 新渠道/新链 | 新增策略类 / yml 里加链加币 | 策略注册表 + 配置驱动链矩阵 |
| 功能扩展 | 优惠券/分站/邮件/TG 通知/风控 | 独立模块 + 订阅 OrderPaidEvent | 事件总线、`sys_config` 开关位 |
| 钱包支付升级 | 需要"签名即扣"体验 | USDC EIP-2612 permit + relayer | intent 表已含 `mode` 字段 |

---

## 9. 独立社区系统

社区定位为 Discuz/NodeSeek 风格的中心化论坛，使用独立 Spring Boot、MySQL、Redis、Elasticsearch 和 React 应用部署，不属于本 Spring Boot 单体，也不受本章 2C2G 资源预算约束。Ka 与社区不共享数据库、JWT、Cookie、缓存或业务事务，只允许通过导航、OIDC 和签名事件集成；完整设计见 [COMMUNITY_ARCHITECTURE.md](COMMUNITY_ARCHITECTURE.md)。

数据库结构统一使用 Flyway 管理，开发和生产均为 Hibernate `validate`。存量接入和恢复流程见 [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md)。

## 10. 数量批发价与人工会员等级

- 商品编辑中的「数量批发价」支持最多 50 档，保存于 `product.wholesale_rules`。每档包含起购件数、每件单价、可选会员等级；等级为空表示所有买家（含游客），指定等级仅匹配该等级，不按权重继承。无档位表示关闭。
- 下单、商品价格查询与优惠券预览统一由 `MemberLevelService.priceFor(memberId, product, quantity)` 定价。标价、会员折扣/专享价、所有达到门槛的批发价取最低单价，再计算优惠券；批发价与会员折扣不叠乘。起购金额继续按标价小计判断。买家只收到自己适用的档位，不公开其他等级价格。
- `member_level.manual_only` 表示仅人工授予（例如代理）：禁止设为注册默认等级；自动升级跳过此类目标等级，持有此类等级的会员也不会自动变更到其他等级。人工分配继续使用原有权限、2FA 与审计。
- Flyway V6 新增以上字段，旧商品默认无批发价、旧等级默认保留自动升级行为；升级应同时部署前后端。
- 支付成功时页面回到顶部并聚焦成功提示；自动发卡订单保留 3 秒提示后进入查单。卡密、人工交付内容共用 `SecretBlock`，完整原文换行、限高滚动，复制按钮复制全部原文。

支付后持本机 `queryToken` 的查单/预售提货码领取使用 `POST /api/orders/query-by-token` 与 `POST /api/orders/presale-token-by-token`。这些入口不重复要求验证码，但必须提交下单时签发的 256-bit 随机令牌（后端校验订单 bcrypt 哈希及七天期限），或人工验证后签发的七天 historyToken，不能用邮箱降级替代；原人工查单入口继续受验证码保护，所有订单 POST 请求仍走订单档限流。

本地与生产均已启用 Flyway，启动新版后端时自动执行尚未应用的迁移；无需额外手动执行 V6 SQL，已执行的版本不会重复执行。

后台概览的近七天图表使用数据库按已付款商品订单聚合的成交额（含余额抵扣、扣除已退余额，不含充值及已退款订单），按付款日期分组、空日期补零。成功支付流水仅用于迟到收款异常提示，不混入商品成交额。前端每分钟刷新并显示更新时间、失败提示和逐日金额明细。

历史免验证码查单有效期为 7 天：下单原始 queryToken 按订单创建时间到期；人工查单通过后签发绑定单号的 historyToken（JWT，独立 typ/kind，含到期时间）。历史查询返回原凭证，不续期；过期或旧记录无凭证时回到人工查单。预售领取也验证同一凭证，避免重复消费验证码。无需数据库迁移。

## 11. 维护模式与每日下班

后台「站点设置 → 维护与下班时段」使用现有配置权限、敏感操作验证及审计保存，无需数据库迁移。默认两项均关闭：

- `site.maintenance.enabled`：`0/1`，手动维护优先于每日下班；`site.maintenance.message` 为公开提示（最多 500 字）。
- `site.off_hours.enabled`：`0/1`；`site.off_hours.start/end` 为 `HH:mm`，默认 `22:00/09:00`，固定 `Asia/Shanghai`，支持同日及跨午夜，包含开始、不包含结束，拒绝相同时间；`site.off_hours.message` 为公开提示。
- `/api/store/availability` 返回当前状态及下次恢复时间，禁止 HTTP 缓存。后端每次新商品订单、充值订单、文章购买在副作用之前计算状态，维护或下班时返回业务码 `9001`，不依赖定时任务或浏览器时间。配置读取沿用 Caffeine，保存即失效缓存。
- 前台每 15 秒、切换页面和窗口重新聚焦时刷新状态；维护/下班时商城及文章页面展示状态页，保留会员售后、已有订单付款、查单及提货入口。已购文章在恢复营业后可继续阅读。已有支付回调、扫链、发货、关单和后台操作不受影响。此模式用于暂停新交易，不是停机或隔离数据库的替代措施。

维护与下班页面使用 `AvailabilityPanel` 共用组件：商城关闭状态展示完整页面，查单等保留入口展示简洁提示；后台站点设置提供维护/下班两种即时预览，预览不会保存配置或影响真实营业状态。颜色均采用语义主题令牌，布局适配移动端与深浅色主题。

安全设置新增管理员登录名自助修改（`GET /api/auth/profile`、`POST /api/auth/change-username`）。仅操作当前认证账号，用户名为 4–32 位、字母开头、允许字母/数字/下划线/短横线，不允许默认 `admin`，忽略大小写检查重名，数据库唯一约束兜底并发。每次要求当前密码，已有 TOTP 则要求有效动态码，不复用敏感操作宽限。错误密码计入锁定并提交失败计数；修改成功轮换 tokenVersion、清除敏感验证宽限、审计旧名与新名，前端退出并引导新名登录。权限、昵称、密码与 TOTP 密钥保持不变，启动初始化仅在用户表为空时创建默认管理员，不会因改名重新创建 admin。

## 12. 优惠券有效期与商品范围

单张和批量优惠券均支持日期时间选择器及今天、7 天、30 天、长期有效快捷填入，按北京时间显示，提交自动补齐秒。`coupon.product_id` 为空表示全商品通用，非空仅限该商品；Flyway V7 添加可空字段，旧券保持通用。后台校验目标商品存在，通过优惠券权限获取仅含 ID/名称的商品选项；预览和下单统一传入实际商品 ID 验证范围，原子核销再次校验启用、未过期、范围和剩余次数。发布时需同步前后端并重启后端执行迁移。
