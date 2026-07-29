# Ka 安全防御体系(纵深防御)

> 安全不是单点,而是分层。下表按"攻击流量从外到内"排列,每一层挡掉一部分,越往内成本越高。
> **一句实话:应用代码挡不住容量型 DDoS。** 打满你带宽/连接数的洪水,必须靠第 0 层(网络/CDN)。
> 本项目把第 1~3 层(Nginx、应用限流、业务加固)做实,第 0 层给出方案与配置。

---

## 分层总览

| 层 | 位置 | 挡什么 | 本项目状态 |
|---|---|---|---|
| 0 网络/清洗 | Cloudflare / 高防 IP / 云 WAF | 容量型 DDoS(SYN Flood、UDP、放大攻击)、大规模 CC | ⚠️ 需你接入(见 §1) |
| 1 边缘反代 | Nginx | 慢速攻击、单 IP 洪水、畸形请求、超大请求 | ✅ `nginx.conf.example` |
| 2 应用限流 | Spring 过滤器 | 应用层 CC、接口爆刷、撞库 | ✅ `RateLimitFilter` |
| 3 业务加固 | 应用代码 | 注入、XSS、越权、爆破、超卖、重放 | ✅ 见 §4 |
| 4 数据/密钥 | MySQL / 环境变量 | 拖库、密钥泄露 | ✅ 见 §5 |

---

## 1. 第 0 层:真正的 DDoS 防御(必须外部方案)

容量型 DDoS 的本质是"流量比你的带宽大",这在你自己的服务器上无解——包还没到应用就已经把管道占满了。可行方案(择一):

- **Cloudflare(推荐,有免费档)**:域名 DNS 托管到 CF,开启橙色云代理,真实源站 IP 被隐藏。CF 自动清洗 L3/L4 洪水,可开 "Under Attack Mode" 对 L7 CC 加 JS 挑战/验证码。接入后:Nginx 限流改用 CF 回源真实 IP 头(`CF-Connecting-IP`),并只放行 CF 的回源 IP 段(其余直连一律拒绝,防绕过)。
- **云厂商高防 IP / DDoS 高防包**:阿里云/腾讯云等,套餐按防护峰值计费,适合已在云上、预算充足。
- **最低要求**:即使暂不接 CDN,也务必用云安全组只放行 80/443,隐藏 SSH 端口、禁 root 密码登录。

> 判断标准:如果你担心的是"有人 T 我服务器让它下线",那是第 0 层的事,应用再怎么改也没用,先接 Cloudflare。
> 如果担心的是"有人狂刷我下单/登录接口耗资源、撞库、薅优惠券",那是第 1~2 层,本项目已覆盖。

## 2. 第 1 层:Nginx(网络层限流,已配)

`docs/nginx.conf.example` 已包含:

- `limit_req`:API 20r/s、登录 1r/s(令牌桶,突发 burst 平滑)
- `limit_conn`:单 IP 并发连接封顶,克制连接耗尽
- 慢速攻击防护:`client_body_timeout` / `client_header_timeout` / `send_timeout` 全部 10s,Slowloris 与 Slow POST 打不动
- `client_max_body_size 2m`:超大请求直接拒
- 只放行 GET/POST/PUT/DELETE/OPTIONS,畸形方法 405
- `server_tokens off`:隐藏版本号
- **关键**:反代覆盖式写 `X-Forwarded-For $remote_addr`,杜绝客户端伪造 XFF 绕过应用限流

## 3. 第 2 层:应用限流(CC 防御,已实现)

`RateLimitFilter`(令牌桶 + 自动封禁,纯 Caffeine 进程内,2C2G 无需 Redis):

- **分档令牌桶**:登录 5/min、下单 10/min、支付 30/min、其余 240/min,按 (档位, IP) 独立计量,兼顾突发与持续速率
- **递增封禁**:连续触发限流累计到阈值(默认 5 次)→ 临时封禁该 IP;重复封禁时长按 2 的幂递增(10→20→40…封顶 240 分钟),惩罚复发者
- **快速拒绝**:封禁命中直接 429,不进业务线程、不查库,慢接口被刷也不塌
- **IP 解析防伪造**:`ka.security.trust-forward-header` 控制——生产在 Nginx 后设 `true`,直接暴露设 `false`(只认 TCP 源 IP)
- 全部参数在 `application-prod.yml` 的 `ka.security.rate-limit` 下可调
- 升级路线:多节点部署时,把令牌桶与封禁表迁到 Redis(接口已隔离),单机无需

## 4. 第 3 层:业务加固(已实现)

| 威胁 | 措施 |
|---|---|
| **SQL 注入** | 全量 JPA 参数化查询;唯一一处原生 SQL(卡密 `FOR UPDATE SKIP LOCKED`)也是命名参数绑定,无字符串拼接 |
| **XSS** | 前端 React 默认转义所有插值,不用 `dangerouslySetInnerHTML`;API 侧 CSP `default-src 'none'` |
| **参数校验** | 全部入参 Jakarta Validation(邮箱格式、长度、范围、券码正则白名单),非法直接 400 |
| **越权 / 遍历** | 管理接口方法级 `@PreAuthorize` 细粒度权限;游客查单需 订单号+邮箱(+可选查询密码)双因子,防遍历 |
| **登录爆破** | 失败 5 次锁账户 15 分钟 + 登录接口 IP 限流 5/min 双重;bcrypt(12) 抗离线爆破;可选 TOTP 两步验证 |
| **支付重放 / 刷单** | 回调验签 + 金额逐位核对 + `channel_trade_no`/`tx_hash` 数据库唯一约束幂等;订单状态 CAS |
| **超卖** | 库存原子扣减 + 卡密 `SKIP LOCKED` 分配双闸 |
| **优惠券超发** | `usedCount` 原子递增核销,并发不超发 |
| **请求头/参数污染** | Tomcat `max-http-request-header-size` 16KB、`max-parameter-count` 512、`max-http-form-post-size` 256KB |
| **路径穿越 / 畸形请求** | Spring Security `StrictHttpFirewall` 默认拦截(`..`、编码斜杠、非法字符) |
| **敏感信息泄露** | 全局异常兜底不返回堆栈;渠道密钥查询接口不回显密文;日志脱敏 |

## 5. 第 4 层:数据与密钥

- 卡密、渠道密钥 AES-256-GCM 静态加密,主密钥仅环境变量 `KA_AES_KEY`,仓库零明文
- 数据库应用账号最小权限(生产只授 SELECT/INSERT/UPDATE/DELETE,不给 DROP/GRANT)
- 全站 HTTPS,HSTS 强制;`.env` 在 `.gitignore`
- 审计日志只插不改,管理端写操作全留痕(操作者/IP/UA/资源快照)

---

## 上线安全检查清单

- [ ] 域名接入 Cloudflare(或高防),源站 IP 不暴露,Nginx 只放行 CDN 回源 IP 段
- [ ] `application-prod.yml`:`trust-forward-header: true`(仅在确有 Nginx/CDN 时)
- [ ] 云安全组只开 80/443;SSH 改非标端口 + 密钥登录 + 禁 root
- [ ] `KA_JWT_SECRET` / `KA_AES_KEY` 用 `openssl rand` 现生成,妥善备份 AES 主密钥
- [ ] 首次启动打印的 admin 初始密码已改,并绑定 TOTP 两步验证
- [ ] 压测校准限流阈值(`ka.security.rate-limit.*`),既不误伤正常用户又能挡刷
- [ ] MySQL 每日备份异地留存;应用日志轮转
- [ ] 定期 `mvn dependency:tree` 审计依赖 CVE
