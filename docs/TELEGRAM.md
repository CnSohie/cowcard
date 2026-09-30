# Telegram 自助转账下单

## 已实现的第一版

买家在私聊中选择自动发卡商品 → 输入数量、邮箱、优惠码（无则 `-`）→ 选择网络/币种 → 点击确认 → 收到地址、合约、精确金额、有效期 → 现有链扫描确认付款并发卡 → Bot 通知交付。`/orders` 查看本人 Bot 订单，点击网页查单按钮可打开现有查单页领取卡密。网页后台直接管理同一个 `orders` 记录，没有第二套交易或库存。

支持矩阵来自现有 `ka.crypto.chains`；默认 USDC/Base、USDC/Polygon、USDT/BSC。BSC USDT 保持 18 位最小单位，Bot 显示支付服务返回的精确字符串，不能自行换算、舍入或去尾数。渠道手续费与优惠码由现有服务计算。

第一版仅自动卡密商品、游客订单；未实现会员绑定、钱包抵扣、人工表单、预售及 Mini App。不同邮箱不能绕过同一 TG 用户最多 3 个待支付订单的限制。`/cancel` 只取消当前填写，不关已有订单；已有订单沿用原超时释放流程。

## 配置与启用

1. 在 Telegram 官方 BotFather 创建独立商城 Bot。不要复用已有管理员告警 Bot，避免通知职责混杂或覆盖它已有的 Webhook。
2. 配置以下环境变量（`.env.example` 有占位；应用不会自动加载任意 `.env` 文件，应由部署工具或启动环境注入）：

```text
KA_TG_ENABLED=true
KA_TG_BOT_TOKEN=<BotFather 提供的 token>
KA_TG_WEBHOOK_SECRET=<openssl rand -hex 32 生成的独立秘密>
KA_TG_SITE_URL=https://你的域名
```

Token 与 Webhook secret 仅保存在环境变量，不经普通 `sys_config` 管理接口返回。消息内容、下单草稿、查单凭证均使用现有 `KA_AES_KEY` 加密落库，须备份该主密钥。正式启用前已有 `CRYPTO_TRANSFER` 渠道必须启用且收款地址配置完整，链扫描/RPC 必须可用。

3. 正常启动应用，让 Flyway 执行 `V4__telegram_storefront.sql`。旧库须先遵循 `DATABASE_MIGRATIONS.md` 接入迁移，不得盲目 baseline。V4 只增表，无订单表数据改写。关闭开关后 Bot 接口与调度任务不加载。
4. 构建并部署前端，确保 `/tg/order` 可以回退到 `index.html`。
5. Nginx 在一般 `/api/` location 外添加精确路径配置；保持 TLS、真实 IP 头和网络层限流，不对它加浏览器验证码挑战：

```nginx
location = /api/telegram/webhook {
    client_max_body_size 64k;
    limit_req zone=api burst=40 nodelay;
    proxy_pass http://ka_backend;
    include /etc/nginx/ka_proxy_params.conf;
}
```

不记录请求体或 `X-Telegram-Bot-Api-Secret-Token`。应用只对经过正确 Webhook secret 验证的请求豁免共享 IP 的普通买家限流，未认证请求仍限流；Bot 按 Telegram 用户独立限制每分钟 30 次已处理操作。

6. 环境变量就绪后，在可信终端执行 `python3 scripts/setup_telegram.py` 注册 Webhook 与命令菜单。脚本会调用 Telegram 修改该 Bot 的配置，不能对已有其他用途的 Bot 随意执行。不会删除待处理更新，也不会在输出中打印秘密。Webhook URL 固定为 `https://你的域名/api/telegram/webhook`，`allowed_updates` 为 `message`、`callback_query`，`max_connections=1`。不自动在应用启动时反复注册。
7. 自己私聊 Bot 发送 `/start`，以低金额测试商品走一遍真实转账，再核对后台订单、支付流水、卡密分配与网页查询。这一步需要真实 Bot 和 HTTPS 部署，单元/集成测试不能代替。

## 可靠性与权限

- Webhook 认证后先提交加密 inbox，成功落库才返回 200；`(bot_id,update_id)` 主键去重。队列超过约 5000 条时拒收新更新并返回 503，让 Telegram 重试。事务处理、订单创建、支付意向与 Bot 归属、响应 outbox 一起提交；失败整体回滚。
- 同一用户行锁串行化草稿确认；随机草稿 nonce 防旧按钮/重复点击建第二单。Bot 不信任客户端传来的邮箱、订单号或 username 作为 TG 身份，仅以认证请求中的私聊 `from.id == chat.id` 为准。
- Bot 不生成链上付款结果，不使用自报 txHash 直接入账；资金确认仍由现有扫链、交易哈希唯一约束和订单 CAS 完成。
- 入站暂时异常 30 秒后重试，最多 8 次；业务错误回滚后发送明确提示。出站网络超时/5xx/429 重试（遵循 `retry_after`，指数退避），最多 8 次。永久失败/用尽次数保留记录并打印无秘密的 ID 日志。7 天后清除未完成消息内容，去重键仍保留。
- Bot 的专用单线程调度器与链扫描线程池隔离。出站 HTTP 连接超时 3 秒、读取超时 5 秒；一次最多发 4 条，发送前 CAS 获取 60 秒租约。提交状态前崩溃可能导致消息重复发送（Telegram sendMessage 不提供业务幂等键），不会导致重复建单或发卡。
- 每 10 秒核对实际订单状态并将变化与通知 outbox 原子提交，宕机后可补通知。`PAID` 显示待交付，只有 `DELIVERED` 显示已交付；补单同样可被检测到。
- 不在 TG 消息中直接发送卡密明文。网页链接包含 5 分钟有效的一次性随机票据，数据库只存哈希；票据放 URL fragment，页面立即清除，买家主动确认才以 POST 核销。核销后沿用现有订单查询令牌；令牌保存在当前浏览器的订单历史中。失效时回 Bot 查看订单获取新链接。持有链接即有取单权限，禁止转发或在共享设备领取。
- 未绑定会员，不会自动把 TG 订单按填写邮箱归入网站会员账号（邮箱不是账号所有权证明）。网页查单用 Bot 提供的链接；后台仍可按订单号/邮箱查询。

## 运维检查

使用只读查询检查积压/失败，不输出 payload 或凭证：

```sql
SELECT bot_id, done, attempts, COUNT(*) FROM telegram_inbox GROUP BY bot_id, done, attempts;
SELECT bot_id, done, attempts, COUNT(*) FROM telegram_outbox GROUP BY bot_id, done, attempts;
```

`done=false AND attempts>=8` 需要检查日志中的 ID、Bot 网络连接/封禁和当前渠道配置。修复后人工重放应限制到已核查的单个记录；不要批量归零或删除 inbox 去重键。Webhook 或 token 泄露应立即通过 BotFather 轮换 token、更换 secret 并重新注册。更换为另一个 Bot（bot ID 变化）不会继承旧 Bot 的买家归属。

Webhooks/队列具备数据库去重与租约，但这不代表整个 Ka 已经多实例安全；现有扫链、限流和其他定时任务仍需按集群改造方案处理。

## 验证命令

```bash
./mvnw -Dtest=TelegramControllerTest,TelegramFlowTest,DatabaseMigrationTest test
./mvnw -Pmysql-it verify
cd frontend
npm run build
# 另开本地预览后，设置 UI_BASE_URL（默认 http://127.0.0.1:4178）
# Playwright 可通过 PLAYWRIGHT_MODULE 指向已有安装，全部接口使用模拟数据。
node tests/telegram.smoke.cjs
```

TelegramFlowTest 使用真实迁移结构、真实订单 Service 和数据库事务，付款创建与网络为受控替身；覆盖重复更新/并发确认、支付失败回滚、用户归属、单次票据、过期票据、状态通知及发送重试。MySQL profile 需 Docker，以验证 MySQL 8 行锁与迁移。H2 模式的 LONGTEXT 类型元数据与 Hibernate H2 方言不一致，因此此 H2 流程测试不执行全实体类型 validate；生产与 MySQL 测试保持 validate。

平台规则背景已与使用者确认：Telegram 官方要求 Bot/Mini App 内数字商品使用 Stars。本实现按要求接入独立链上转账，不接 Stars；这不会改变 Telegram 的平台规则。参考：[Bot API](https://core.telegram.org/bots/api)、[数字商品支付规则](https://core.telegram.org/bots/payments-stars)。
