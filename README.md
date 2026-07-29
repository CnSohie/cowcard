# cowcard

一套面向数字商品销售与交付的发卡平台，适用于卡密售卖、账号密钥交付、预售提货、人工发货、会员钱包和独立站运营场景。

项目采用前后端分离架构：后端提供纯 REST API，前台负责买家购买和会员中心，后台负责商品、订单、卡密、支付、风控、客服与系统配置。

## 核心能力

- 数字商品售卖：分类、商品、库存、自动发卡、人工发货、预售提货。
- 卡密管理：加密存储、2FA 解锁查看、TXT/CSV 批量导入、未售卡密编辑/停用/删除、已售卡密锁定追踪。
- 订单系统：游客下单、会员下单、订单查询、支付成功交付、人工补单、关闭订单、退款到钱包。
- 支付渠道：余额支付、支付宝预留、易支付协议、Stripe、加密货币转账与钱包直付。
- 钱包系统：余额充值、余额消费、提现申请、冻结余额、礼品卡兑换、完整余额流水。
- 会员体系：会员注册登录、邀请码、会员等级、等级折扣、会员专属价格。
- 优惠券：固定金额券、百分比券、门槛、限量、批量生成，批量创建需要 2FA。
- 预售凭证：一次性提货码、哈希存储、提前核销、履约状态追踪。
- 客服工单：用户提交工单、客服回复、用户跟进、后台待处理红点提醒。
- 风控审核：异常事项队列、处理记录、会员封禁、余额冻结。
- 系统运营：SEO 设置、媒体文章、邮件模板、Telegram 通知、审计日志、后台 RBAC 权限。

## 技术栈

### 后端

- Java / Spring Boot
- Spring Security + JWT
- Spring Data JPA / Hibernate
- MySQL
- Caffeine Cache
- TOTP 2FA
- AES-256-GCM 加密
- 支付策略模式

### 前端

- React 18
- Vite
- TypeScript
- Tailwind CSS
- Lucide React
- Axios

## 项目结构

```text
.
├── src/                      # Spring Boot 后端
│   ├── main/java/com/hqyj/ka
│   │   ├── article           # 媒体文章
│   │   ├── audit             # 审计日志
│   │   ├── card              # 卡密管理
│   │   ├── catalog           # 商品与分类
│   │   ├── coupon            # 优惠券
│   │   ├── member            # 会员与等级
│   │   ├── order             # 订单、交付、预售凭证
│   │   ├── payment           # 支付渠道
│   │   ├── risk              # 风控队列
│   │   ├── support           # 客服工单
│   │   ├── sysconfig         # 系统配置与 SEO
│   │   ├── user              # 后台用户、角色、权限
│   │   └── wallet            # 钱包、提现、礼品卡
│   └── main/resources
│       └── db/schema.sql     # 数据库结构
├── frontend/                 # React 前台 + 后台
├── docs/                     # 架构、安全、部署文档
├── .env.example              # 生产环境变量示例
└── run.sh                    # 后端启动脚本
```

## 快速启动

### 1. 准备数据库

```bash
mysql < src/main/resources/db/schema.sql
```

开发环境可参考 `db-init.sql` 创建本地数据库和用户。

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少需要填写：

```env
KA_DB_USER=ka
KA_DB_PASSWORD=
KA_JWT_SECRET=
KA_AES_KEY=
KA_MERCHANT_ADDRESS=
KA_ADMIN_INIT_PASSWORD=
```

生成密钥示例：

```bash
openssl rand -base64 48   # KA_JWT_SECRET
openssl rand -base64 32   # KA_AES_KEY
```

`KA_AES_KEY` 用于解密卡密和支付渠道配置，生产环境必须妥善备份。丢失后，已加密数据无法恢复。

### 3. 启动后端

```bash
./mvnw -DskipTests package
./run.sh
```

首次启动会初始化权限、内置角色、支付渠道占位和初始管理员。

### 4. 启动前端

```bash
cd frontend
npm ci
npm run dev
```

构建生产产物：

```bash
npm run build
```

## 后台安全设计

- 管理端使用角色 + 细粒度权限控制菜单和接口。
- 高敏操作需要管理员密码 + TOTP 2FA。
- 卡密内容和支付渠道密钥使用 AES-256-GCM 加密落库。
- 卡密管理入口需要 2FA 解锁，已售卡密不允许编辑或删除。
- 余额冻结、提现审核、支付配置、礼品卡生成、订单补单等操作写入审计日志。
- 用户封禁会使会员登录态失效。
- 应用层提供限流和自动封禁，但容量型 DDoS 仍需要 CDN / 高防 / WAF。

## 内置角色

- `SUPER_ADMIN`：超级管理员，拥有全部权限。
- `ADMIN`：综合管理员，适合日常运营管理。
- `OPS`：运营，负责商品、卡密、订单、优惠券和文章。
- `ORDER_MANAGER`：订单专员，负责订单处理和交付跟进。
- `FINANCE`：财务，负责支付渠道、提现审核、礼品卡和对账。
- `RISK`：风控，负责异常订单、封禁和余额冻结。
- `SUPPORT`：客服，负责查单和工单处理。
- `CONTENT`：内容运营，负责媒体文章和基础展示配置。
- `SECURITY_ADMIN`：安全管理员，负责后台账号、角色权限和审计。

## 部署

完整部署步骤见：

- [docs/DEPLOY.md](docs/DEPLOY.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

生产环境建议：

- 使用 HTTPS。
- 使用 Nginx 反向代理。
- MySQL 每日备份。
- `.env` 不入库。
- 支付渠道密钥只在后台配置，不在代码仓库保存。
- `KA_AES_KEY` 单独备份。

## 注意事项

- 本项目包含支付、钱包、卡密和后台权限模块，上线前必须完整测试支付回调、订单交付、提现审核和退款流程。
- 前端构建产物 `frontend/dist/`、后端构建产物 `target/`、本地配置 `.env` 已加入 `.gitignore`。
- 请勿提交真实卡密、真实支付密钥、数据库备份或生产环境日志。

## License

未指定开源协议。公开使用、二次分发或商业化前请先补充明确的许可证文件。
