# Ka 发卡平台 - 项目约定

## 项目定位
自动发卡平台(对标独角数卡),Spring Boot 4.1 + MySQL 8 + React 18,目标 2C2G 单机。
架构详见 docs/ARCHITECTURE.md(先读它)。

## 已定决策(用户确认,勿改)
- 前后端分离:后端纯 REST API,前端 React 18 + Vite + TS + Tailwind(要求界面美观)
- 加密支付双模式:唯一金额法(CRYPTO_TRANSFER)+ 连接钱包直付(CRYPTO_WALLET),均无服务器私钥
- 支持:USDC@Base、USDC@Polygon、USDT@BEP20(BSC 上 18 位小数!)
- 支付宝双通道预留:官方 SDK(ALIPAY_OFFICIAL)+ 易支付协议(EPAY),策略模式
- 2C2G:Caffeine 代替 Redis;无 web3j,自写 JSON-RPC 客户端;线程池全部收紧
- 买家游客模式(不注册);后台 RBAC:SUPER_ADMIN/OPS/FINANCE/SUPPORT + 细粒度权限码

## 代码约定
- Spring Boot 4 用 Jackson 3:包名是 tools.jackson.*(注入 JsonMapper),严禁 import com.fasterxml.jackson.core/databind(类路径上没有,只有 annotation 包保留 com.fasterxml)
- 包结构按业务域切分(user/catalog/card/order/payment/audit/sysconfig)
- 金额:CNY 用 DECIMAL(20,2) BigDecimal;代币最小单位用 String 存 BigInteger
- 所有入账路径:DB 唯一约束(tx_hash/channel_trade_no)+ 订单状态 CAS 双保险幂等
- 卡密与渠道配置 AES-256-GCM 加密落库,主密钥仅环境变量 KA_AES_KEY
- 管理端写操作 → AuditService.record();新支付渠道 = 实现 PaymentStrategy + 渠道记录
- DTO 用 record;Controller 只做编排,业务在 Service;异常走 BusinessException + ErrorCode

## 前端主题系统(勿破坏)
- 多主题:mint/ocean/violet × light/dark,全部走 CSS 变量(index.css),Tailwind 色板映射 rgb(var(--c-*))
- 语义令牌:base/surface/ink/primary(-dark/-contrast)/accent(-soft);新页面禁止硬编码颜色
- 后台「站点设置」写 sys_config 的 site.theme / site.mode;买家本地明暗选择存 localStorage(ka.mode)优先级最高
- darkMode 选择器为 [data-mode="dark"];状态色用 tailwind 色 + dark: 变体
- 设计基调:Gnosis Pay 风,大字排版、药丸按钮、大圆角卡片、大量留白;响应式(管理端移动抽屉)

## 已完成的完善项
- TOTP 2FA 已落地:TotpService(RFC 6238 纯 JDK)、登录校验、/api/auth/totp/* 自助开关、前端「安全设置」页
- 汇率自动刷新已落地:FxRateService(每小时,open.er-api.com,[3,15] 合理性校验,失败降级上次值)

- 优惠券已落地:FIXED/PERCENT、门槛、限量原子核销、封顶到应付-0.01;下单/预览/管理端齐全
- Telegram 成交通知已落地:TelegramNotifier(AFTER_COMMIT 异步),站点设置填 tg.bot_token/tg.chat_id 生效
- 营收看板已落地:今日/近7天营收 + 单系列柱图
- 图片上传已落地:/api/admin/files 本地存储(ka.upload.dir)+ 魔数校验,/files/** 公开访问;商品编辑改为右侧抽屉表单(drawer-panel)
- 媒体文章已落地:article 包,content_md 用 <!--paywall--> 分隔免费/付费段,price=0 免费;前台 /posts 阅读(prose-ka 排版),付费用余额解锁
- 会员体系已落地:member 包,独立 JWT(claim kind=member,前端令牌 ka.m.*),邀请码注册;封禁走 tokenVersion 失效
- 余额钱包已落地:wallet 包,平台统一余额(充值=RECHARGE 订单复用支付渠道、买付费文章、收推广佣金);流水 wallet_txn 只追加;提现冻结→审核(通过扣除/驳回退回);佣金 commission.rate(%),充值不计佣;不分配链上独立地址
- 新权限码:article:read/write、member:manage、withdraw:review(DataInitializer 启动播种,管理员需重登生效)
- 订单超时自动取消:OrderService.expireStaleOrders 每分钟批量关单释放库存;超时分钟数 sys_config order.expire_minutes(1~1440)后台可配,回落 yml 默认 15
- 限流参数后台可调:sys_config 的 security.rl.*(enabled/global/admin/login/order/pay/ban_threshold/ban_minutes)保存即生效,RateLimitFilter 每请求读缓存配置;/api/admin/** 独立 admin 档;本机回环 IP 不递增封禁;POST /api/admin/config/rate-limit/reset 一键解封
- 管理端订单:AdminOrderView DTO(勿再返回 Order 实体,防泄漏 queryPasswordHash/buyerIp 到列表);状态筛选/搜索走派生查询;手动关单 casStatus CAS
- 收银台:公开 GET /api/pay/summary/{orderNo} 供倒计时;PayPage 前端超时即拦截,后端定时关单兜底

## 安全防御(纵深,详见 docs/SECURITY.md)
- 应用层 CC:RateLimitFilter 令牌桶分档限流 + 递增自动封禁(纯 Caffeine);IP 解析受 trust-forward-header 约束防 XFF 伪造
- 安全头:CSP default-src none / Referrer-Policy / Permissions-Policy / HSTS / nosniff / frame DENY
- 慢速攻击:Tomcat connection-timeout 5s + max-swallow/form/param 限制;Nginx client_*_timeout + limit_req/limit_conn
- 注入/XSS/越权/爆破/超卖/重放/超发:见 SECURITY.md §4 表;JPA 参数化、React 默认转义、@PreAuthorize、bcrypt+TOTP、DB 唯一约束幂等
- 真正的容量型 DDoS 必须靠第 0 层(Cloudflare/高防),应用代码挡不住——已在 SECURITY.md §1 写明方案
- 限流参数全在 application-prod.yml 的 ka.security.rate-limit;勿把 trust-forward-header 在无反代时设 true

## 首页版面重构(2026-10-07)
- 首页横幅改为可选区块:后台「站点设置 → 首页横幅」逐屏启停;启用 1 屏=静态大标题(无轮播控件),启用 2 屏以上才出现进度/前后箭头,全部停用则首页不渲染横幅
- 规格文案:横幅启用时每屏固定高度(hero-copy-stack 重叠网格),关闭时不留空白
- 商品目录:分类改为顶部可横向滚动的药丸 chip(选中自动滚进视野),不再用侧边栏;搜索/排序/仅看可购买/每页收进一条工具行,手机隐藏「每页」
- 商品卡:标题 + 副标题 → 大图 → 售价 + 整行药丸按钮;品牌图标仍走 productBrand
- CSS 收口:index.css 只保留买家端共用原子(.product-image/.product-brand-mark/.hero-admin-preview/.catalog-dropdown);其余买家端样式全部在 storefront.css。别再往 index.css 加 `.storefront`/`.catalog-*`/`.hero-*` 规则,那种双份定义曾让新旧规则互相覆盖(表现为横幅被 legacy transform 顶到视口外)
- 中文导航文案:全部商品 / 我的订单 / 提货码
- 白屏兜底:App.tsx 的 Routes 外层必须有 AppErrorBoundary(按 pathname+search 复位)。页面组件读分页响应一律写 `!data?.items?.length`,别再写 `data.items.length`——2026-10-07 曾因 `/api/posts` 返回体缺 items 导致整页白屏
- 移动端(≤767px)专用规则,别退回双行顶栏:顶栏固定 3.5rem 单行 = 品牌 + 全部商品/我的订单 + 主题/登录/更多(MoreHorizontal);文章、提货码、语言、明暗的完整入口收进底部面板 `.store-sheet`(点「更多入口」打开,Esc/遮罩关闭,打开时锁 body 滚动)。`.store-mobile-secondary` 常驻一行会在滚动时盖住卡片内容,已改为 display:none
- 移动端横幅只留文案 + 进度/箭头(配图 display:none);分类 chip 右侧渐隐 mask 提示可横滑;每页数量选择器移动端隐藏
- 封面比例必须"上传画框 = 展示容器":商品封面统一 16:10(`CROP_RATIOS.wide` + `.catalog-product-art` 各断点同为 16/10),上传组件用 `aspect="wide"`。改渲染比例时必须同步改 `lib/cropImage.ts` 的 `CROP_RATIOS`,否则商家在 1:1 预览里看到的画面会被卡片二次裁掉(2026-10-07 的"自动裁切坏了"就是这个:上传存 1:1、卡片 2:1 展示)

## 待办(按优先级)
1. 邮件发货通知(需加 spring-boot-starter-mail,订阅 OrderPaidEvent)
2. 风控模块(黑名单、异常订单标记,架构文档 §8)
3. 汇率来源冗余(当前 open.er-api.com 单源)

## 敏感操作双因子(2026-07-27)
- 财务级操作(人工补单/关单、提现通过/驳回、支付渠道保存/启停)必须 管理员密码 + TOTP:AuthService.verifySensitive,未启用 2FA 抛 TOTP_NOT_ENABLED(1007),前端 SensitiveConfirm 弹层引导去「安全设置」开启;密码错误计入登录锁定;全程审计
- 2FA 自助管理(setup/enable/disable)也必须先验管理员密码(AuthService.requirePassword):防未锁屏会话被旁人绑定/解绑认证器
- 支付渠道防篡改三层:双因子门槛 + 查询不回显密钥([已配置] 占位)+ 变更即时 TelegramNotifier.notifyAdmin 告警(密钥被换第一时间发现)
- 前端统一用 components/SensitiveConfirm.tsx(禁止 window.confirm);children 可塞额外表单(如审核备注)
- 反库存挤占:下单前校验同邮箱/同 IP 未支付订单数(order.max_pending_per_contact 默认 3、order.max_pending_per_ip 默认 5,sys_config 可调),超限抛 ORDER_PENDING_LIMIT(3004)

## 加密支付要点(2026-07-27 修复)
- ChainRpcClient 的 getLogs topics 必须用 Arrays.asList(TRANSFER_TOPIC, null, …):List.of 遇 null 抛无消息 NPE,曾致扫链每轮崩溃、转账永不入账(日志表现 err=null)
- 迟到支付兜底:意向过期后仍按 (chain, contract, amountMinor) 匹配最近未支付意向复活确认;订单也超时的,后台「人工补单」支持 EXPIRED 单回占库存补发(库存不足抛错回滚)
- 公共 RPC:polygon-rpc.com 已 401(publicnode 放首位);max-block-range=800 兼容公共节点 getLogs 区间限制

## 重要教训
- 不要让多个 AI 工具同时改这个仓库:曾发生 55 文件互相覆盖导致不可编译,恢复以本会话版本为准
- zip 交付有覆盖回旧版的风险(2026-07-26 用户解压了 Downloads 里更早的旧 zip,整个项目回退):优先用桌面端直连 device_commit_files 逐文件写回;确需 zip 时文件名带精确时间戳,解压后核对关键文件大小
