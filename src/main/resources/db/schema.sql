-- ============================================================
-- Ka 发卡平台 生产建表脚本(MySQL 8, utf8mb4)
-- 开发环境由 JPA ddl-auto=update 自动建表;生产以本脚本为准(ddl-auto=validate)
-- ============================================================
CREATE DATABASE IF NOT EXISTS ka DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ka;

CREATE TABLE IF NOT EXISTS sys_user (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL UNIQUE,
  password        VARCHAR(100) NOT NULL COMMENT 'bcrypt(12)',
  nickname        VARCHAR(64),
  enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  failed_attempts INT          NOT NULL DEFAULT 0,
  locked_until    DATETIME(6),
  token_version   VARCHAR(36)  NOT NULL DEFAULT 'v1',
  totp_secret     VARCHAR(128) COMMENT '2FA 预留(加密)',
  totp_enabled    TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_at   DATETIME(6),
  last_login_ip   VARCHAR(45),
  created_at      DATETIME(6),
  updated_at      DATETIME(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sys_role (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(32) NOT NULL UNIQUE,
  name        VARCHAR(64) NOT NULL,
  description VARCHAR(255),
  builtin     TINYINT(1)  NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sys_permission (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(64) NOT NULL UNIQUE,
  name       VARCHAR(64) NOT NULL,
  group_name VARCHAR(32)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sys_user_role (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES sys_role(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sys_role_permission (
  role_id       BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES sys_role(id),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES sys_permission(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS category (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(64) NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  visible    TINYINT(1)  NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  category_id  BIGINT        NOT NULL,
  name         VARCHAR(128)  NOT NULL,
  brief        VARCHAR(255),
  description  TEXT,
  usage_note   TEXT,
  delivery_mode VARCHAR(16)   NOT NULL DEFAULT 'AUTO_CARD' COMMENT 'AUTO_CARD=自动卡密 MANUAL=人工发货 PRESALE_VOUCHER=预售提货码',
  manual_prompt TEXT COMMENT '人工发货信息收集提示',
  manual_form_schema TEXT COMMENT '人工交付结构化信息字段 JSON',
  presale_sale_end_at DATETIME(6) COMMENT '预售停止销售时间',
  presale_start_at DATETIME(6) COMMENT '预售预计开始交付时间',
  presale_end_at DATETIME(6) COMMENT '预售最晚交付保障时间',
  presale_settlement_mode VARCHAR(16) DEFAULT 'BALANCE' COMMENT 'SINK=沉淀 REFUND=原路退回 BALANCE=转余额',
  cover_image  VARCHAR(255),
  price        DECIMAL(20,2) NOT NULL,
  min_order_amount DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '优惠前商品标价小计的最低订购金额;0=不限制',
  stock_cached INT           NOT NULL DEFAULT 0,
  min_buy      INT           NOT NULL DEFAULT 1,
  max_buy      INT           NOT NULL DEFAULT 10,
  visible      TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order   INT           NOT NULL DEFAULT 0,
  version      BIGINT,
  created_at   DATETIME(6),
  updated_at   DATETIME(6),
  KEY idx_product_cat (category_id, visible)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS card_secret (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id  BIGINT      NOT NULL,
  content_enc TEXT        NOT NULL COMMENT 'AES-256-GCM 密文',
  fingerprint VARCHAR(64) NOT NULL COMMENT 'sha256(明文) 去重',
  status      VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
  order_id    BIGINT,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sold_at     DATETIME(6),
  KEY idx_card_alloc (product_id, status),
  KEY idx_card_order (order_id),
  UNIQUE KEY uk_card_product_fingerprint (product_id, fingerprint)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no            VARCHAR(32)   NOT NULL,
  order_type          VARCHAR(16)   COMMENT 'GOODS=商品 RECHARGE=钱包充值;空按 GOODS',
  delivery_mode       VARCHAR(16)   COMMENT 'AUTO_CARD=自动卡密 MANUAL=人工发货 PRESALE_VOUCHER=预售提货码;空按 AUTO_CARD',
  member_id           BIGINT        COMMENT '下单会员;游客单为空',
  product_id          BIGINT        NOT NULL COMMENT 'RECHARGE 单用 0 占位',
  product_name        VARCHAR(128)  NOT NULL,
  unit_price          DECIMAL(20,2) NOT NULL,
  original_unit_price DECIMAL(20,2),
  quantity            INT           NOT NULL,
  amount              DECIMAL(20,2) NOT NULL,
  contact             VARCHAR(128)  NOT NULL,
  coupon_code         VARCHAR(32),
  discount_amount     DECIMAL(20,2) NOT NULL DEFAULT 0,
  member_discount_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  wallet_paid_amount  DECIMAL(20,2) NOT NULL DEFAULT 0,
  wallet_refunded_amount DECIMAL(20,2) NOT NULL DEFAULT 0,
  member_level_id     BIGINT,
  member_level_name   VARCHAR(64),
  query_password_hash VARCHAR(100),
  query_token_hash    VARCHAR(100)  COMMENT '当前浏览器取卡令牌 bcrypt',
  buyer_note          TEXT COMMENT '人工发货商品:买家提交资料',
  manual_delivery_content TEXT COMMENT '人工发货商品:管理员交付内容',
  status              VARCHAR(16)   NOT NULL DEFAULT 'PENDING',
  paid_channel        VARCHAR(32),
  paid_at             DATETIME(6),
  delivered_at        DATETIME(6),
  expire_at           DATETIME(6)   NOT NULL,
  buyer_ip            VARCHAR(45),
  created_at          DATETIME(6),
  updated_at          DATETIME(6),
  UNIQUE KEY idx_order_no (order_no),
  KEY idx_order_expire (status, expire_at),
  KEY idx_order_contact (contact),
  KEY idx_order_member (member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_delivery_record (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT      NOT NULL,
  order_no    VARCHAR(32) NOT NULL,
  content     TEXT        NOT NULL,
  staff_note  TEXT,
  operator    VARCHAR(64),
  created_at  DATETIME(6),
  KEY idx_delivery_order (order_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS presale_voucher (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id         BIGINT      NOT NULL,
  order_no         VARCHAR(32) NOT NULL,
  product_id       BIGINT      NOT NULL,
  quantity         INT         NOT NULL,
  token_hash       VARCHAR(64) NOT NULL,
  token_hint       VARCHAR(20) NOT NULL,
  token_claimed_at DATETIME(6),
  status           VARCHAR(20) NOT NULL DEFAULT 'WAITING_PAYMENT',
  presale_start_at DATETIME(6),
  presale_end_at   DATETIME(6),
  settlement_mode  VARCHAR(16) DEFAULT 'BALANCE',
  redeem_contact   VARCHAR(128),
  redeem_member_id BIGINT,
  redeemed_at      DATETIME(6),
  fulfilled_at     DATETIME(6),
  fulfillment_note TEXT,
  created_at       DATETIME(6),
  updated_at       DATETIME(6),
  UNIQUE KEY idx_voucher_hash (token_hash),
  UNIQUE KEY idx_voucher_order (order_id),
  KEY idx_voucher_member (redeem_member_id, id),
  KEY idx_voucher_status (status, presale_end_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS risk_review (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(32)  NOT NULL,
  source_id   VARCHAR(64),
  subject     VARCHAR(128) NOT NULL,
  reason      TEXT         NOT NULL,
  severity    VARCHAR(16)  NOT NULL DEFAULT 'MEDIUM',
  status      VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  created_by  VARCHAR(64),
  reviewed_by VARCHAR(64),
  review_note VARCHAR(255),
  reviewed_at DATETIME(6),
  created_at  DATETIME(6),
  updated_at  DATETIME(6),
  KEY idx_risk_status (status, severity),
  KEY idx_risk_source (source_type, source_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_ticket (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id        BIGINT,
  subject          VARCHAR(128) NOT NULL,
  category         VARCHAR(32),
  related_order_no VARCHAR(64),
  message          TEXT         NOT NULL,
  reply            TEXT,
  status           VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
  priority         VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
  replied_by       VARCHAR(64),
  replied_at       DATETIME(6),
  created_at       DATETIME(6),
  updated_at       DATETIME(6),
  KEY idx_ticket_member (member_id, id),
  KEY idx_ticket_status (status, updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_channel (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(32) NOT NULL UNIQUE,
  display_name VARCHAR(64) NOT NULL,
  enabled      TINYINT(1)  NOT NULL DEFAULT 0,
  sort_order   INT         NOT NULL DEFAULT 0,
  config_enc   TEXT COMMENT '渠道配置 JSON(AES 加密)'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_transaction (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id         BIGINT        NOT NULL,
  order_no         VARCHAR(32)   NOT NULL,
  channel_code     VARCHAR(32)   NOT NULL,
  amount           DECIMAL(20,2) NOT NULL,
  fee_amount       DECIMAL(20,2) DEFAULT 0 COMMENT '站点计价币种渠道手续费',
  channel_trade_no VARCHAR(128),
  status           VARCHAR(16)   NOT NULL DEFAULT 'CREATED',
  created_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  paid_at          DATETIME(6),
  KEY idx_ptx_order (order_id),
  UNIQUE KEY uk_ptx_channel_trade (channel_trade_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crypto_payment_intent (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id                BIGINT        NOT NULL,
  order_no                VARCHAR(32)   NOT NULL,
  chain_code              VARCHAR(16)   NOT NULL,
  chain_id                BIGINT        NOT NULL,
  token_symbol            VARCHAR(16)   NOT NULL,
  token_contract          VARCHAR(64)   NOT NULL,
  decimals                INT           NOT NULL,
  amount_token            DECIMAL(20,6) NOT NULL,
  amount_minor            VARCHAR(40)   NOT NULL,
  unique_key              VARCHAR(128)  COMMENT '链:合约:金额,活跃期互斥;过期置 NULL',
  mode                    VARCHAR(16)   NOT NULL DEFAULT 'TRANSFER',
  status                  VARCHAR(16)   NOT NULL DEFAULT 'WAITING',
  merchant_address        VARCHAR(64)   NOT NULL,
  tx_hash                 VARCHAR(80),
  block_number            BIGINT,
  confirmations           INT           NOT NULL DEFAULT 0,
  required_confirmations  INT           NOT NULL,
  expire_at               DATETIME(6)   NOT NULL,
  created_at              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  confirmed_at            DATETIME(6),
  UNIQUE KEY uk_intent_unique_amount (unique_key),
  UNIQUE KEY uk_intent_tx (tx_hash),
  KEY idx_intent_order (order_no),
  KEY idx_intent_status (status, expire_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chain_cursor (
  chain_code    VARCHAR(16) PRIMARY KEY,
  scanned_block BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor      VARCHAR(64)  NOT NULL,
  action     VARCHAR(64)  NOT NULL,
  resource   VARCHAR(128) NOT NULL,
  ip         VARCHAR(45),
  detail     TEXT,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_audit_actor (actor),
  KEY idx_audit_time (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupon (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(32)   NOT NULL UNIQUE,
  type        VARCHAR(16)   NOT NULL DEFAULT 'FIXED',
  value       DECIMAL(20,2) NOT NULL,
  min_amount  DECIMAL(20,2) NOT NULL DEFAULT 0,
  total_limit INT           NOT NULL DEFAULT 0,
  used_count  INT           NOT NULL DEFAULT 0,
  expire_at   DATETIME(6),
  enabled     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sys_config (
  cfg_key   VARCHAR(64) PRIMARY KEY,
  cfg_value TEXT
) ENGINE=InnoDB;

-- ============================================================
-- v2 会员 / 余额钱包 / 媒体文章
-- 表名 members(复数):MEMBER 是 MySQL 8.0.17+ 保留字
-- 已有库升级:开发环境启动即自动加表加列(ddl-auto=update);
-- 生产手工执行本段 CREATE + 下方注释中的 ALTER
-- ============================================================

CREATE TABLE IF NOT EXISTS members (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(128) NOT NULL COMMENT '登录邮箱(小写)',
  password        VARCHAR(100) NOT NULL COMMENT 'bcrypt(12)',
  nickname        VARCHAR(64),
  enabled         TINYINT(1)   NOT NULL DEFAULT 1,
  failed_attempts INT          NOT NULL DEFAULT 0,
  locked_until    DATETIME(6),
  token_version   VARCHAR(36)  NOT NULL DEFAULT 'v1',
  invite_code     VARCHAR(16)  NOT NULL COMMENT '我的推广码',
  inviter_id      BIGINT COMMENT '推荐人,佣金入其钱包',
  level_id        BIGINT COMMENT '当前会员等级',
  total_recharge  DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '累计充值,只增不减',
  total_spend     DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '累计消费,只增不减',
  last_login_at   DATETIME(6),
  last_login_ip   VARCHAR(45),
  created_at      DATETIME(6),
  updated_at      DATETIME(6),
  UNIQUE KEY idx_member_email (email),
  UNIQUE KEY idx_member_invite (invite_code),
  KEY idx_member_inviter (inviter_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS member_level (
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(64) NOT NULL,
  slug               VARCHAR(64) NOT NULL,
  icon               VARCHAR(255),
  discount_rate      DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  recharge_threshold DECIMAL(20,2) NOT NULL DEFAULT 0,
  spend_threshold    DECIMAL(20,2) NOT NULL DEFAULT 0,
  sort_weight        INT NOT NULL DEFAULT 0,
  default_level      TINYINT(1) NOT NULL DEFAULT 0,
  enabled            TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY idx_level_slug (slug),
  KEY idx_level_enabled_sort (enabled, sort_weight)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS member_level_price (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  level_id   BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  sku_code   VARCHAR(64) NOT NULL DEFAULT '',
  price      DECIMAL(20,2) NOT NULL,
  UNIQUE KEY uk_level_product_sku (level_id, product_id, sku_code),
  KEY idx_level_price_product (product_id),
  KEY idx_level_price_level (level_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallet_account (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id  BIGINT        NOT NULL,
  balance    DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '可用余额(CNY)',
  frozen     DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '提现审核冻结',
  created_at DATETIME(6),
  updated_at DATETIME(6),
  UNIQUE KEY idx_wallet_member (member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallet_txn (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id     BIGINT        NOT NULL,
  type          VARCHAR(24)   NOT NULL COMMENT 'RECHARGE/PURCHASE/COMMISSION/WITHDRAW_FREEZE/WITHDRAW_REJECT/ADMIN_REFUND/GIFT_CARD/ADJUST',
  amount        DECIMAL(20,2) NOT NULL COMMENT '带符号:入正出负',
  balance_after DECIMAL(20,2) NOT NULL COMMENT '本笔后可用余额快照',
  ref_type      VARCHAR(16) COMMENT 'ORDER/ARTICLE/WITHDRAW/MANUAL',
  ref_id        BIGINT,
  remark        VARCHAR(255),
  created_at    DATETIME(6),
  KEY idx_txn_member (member_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gift_card (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_no    VARCHAR(32) NOT NULL,
  name        VARCHAR(64) NOT NULL,
  code        VARCHAR(64) NOT NULL,
  code_enc    VARCHAR(256) COMMENT 'AES-256-GCM 礼品卡明文密文',
  amount      DECIMAL(20,2) NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  expire_at   DATETIME(6),
  redeemed_by BIGINT,
  redeemed_at DATETIME(6),
  created_at  DATETIME(6),
  UNIQUE KEY idx_gift_code (code),
  KEY idx_gift_batch (batch_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS withdraw_request (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id   BIGINT        NOT NULL,
  amount      DECIMAL(20,2) NOT NULL,
  fee_amount  DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '提现手续费,从申请金额中扣除',
  net_amount  DECIMAL(20,2) NOT NULL COMMENT '实际打款金额',
  channel     VARCHAR(32)   NOT NULL COMMENT 'ALIPAY/BANK/USDT_TRC20/USDT_BEP20',
  account     VARCHAR(128)  NOT NULL,
  account_name VARCHAR(50) COMMENT '支付宝实名/银行卡持卡人',
  bank_name   VARCHAR(80) COMMENT '银行卡开户银行',
  status      VARCHAR(16)   NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED',
  reviewed_by VARCHAR(64),
  review_note VARCHAR(255),
  reviewed_at DATETIME(6),
  created_at  DATETIME(6),
  updated_at  DATETIME(6),
  KEY idx_withdraw_member (member_id, id),
  KEY idx_withdraw_status (status, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS article (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug           VARCHAR(160)  NOT NULL,
  title          VARCHAR(200)  NOT NULL,
  category       VARCHAR(64),
  tags           VARCHAR(255)  COMMENT '逗号分隔',
  cover_image    VARCHAR(255),
  summary        VARCHAR(500),
  content_md     LONGTEXT      COMMENT 'Markdown;<!--paywall--> 后为付费部分',
  price          DECIMAL(20,2) NOT NULL DEFAULT 0 COMMENT '0=免费',
  status         VARCHAR(16)   NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED',
  pinned         TINYINT(1)    NOT NULL DEFAULT 0,
  views          BIGINT        NOT NULL DEFAULT 0,
  purchase_count BIGINT        NOT NULL DEFAULT 0,
  published_at   DATETIME(6),
  created_at     DATETIME(6),
  updated_at     DATETIME(6),
  UNIQUE KEY idx_article_slug (slug),
  KEY idx_article_status (status, pinned, published_at),
  KEY idx_article_category (category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS article_purchase (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id  BIGINT        NOT NULL,
  article_id BIGINT        NOT NULL,
  price      DECIMAL(20,2) NOT NULL COMMENT '成交价快照',
  created_at DATETIME(6),
  UNIQUE KEY uk_purchase_member_article (member_id, article_id),
  KEY idx_purchase_member (member_id, id)
) ENGINE=InnoDB;

-- 已有 orders 表的生产库升级(开发 ddl-auto=update 自动完成,无需执行):
-- ALTER TABLE orders
--   ADD COLUMN order_type VARCHAR(16) NULL COMMENT 'GOODS=商品 RECHARGE=钱包充值;空按 GOODS',
--   ADD COLUMN member_id  BIGINT      NULL COMMENT '下单会员;游客单为空',
--   ADD COLUMN query_token_hash VARCHAR(100) NULL COMMENT '当前浏览器取卡令牌 bcrypt',
--   ADD KEY idx_order_member (member_id);
--
-- 预售停售时间(生产已有 product 表时执行;旧数据为空时应用会暂以保障时间作为停售时间):
-- ALTER TABLE product ADD COLUMN presale_sale_end_at DATETIME(6) NULL AFTER manual_prompt;
-- 商品最低订购金额(生产已有 product 表时执行):
-- ALTER TABLE product ADD COLUMN min_order_amount DECIMAL(20,2) NOT NULL DEFAULT 0 AFTER price;
--
-- 人工交付结构化表单与提现收款人字段(生产已有表时执行):
-- ALTER TABLE product ADD COLUMN manual_form_schema TEXT NULL AFTER manual_prompt;
-- ALTER TABLE withdraw_request
--   ADD COLUMN account_name VARCHAR(50) NULL AFTER account,
--   ADD COLUMN bank_name VARCHAR(80) NULL AFTER account_name;
--
-- 支付/提现手续费账务字段(生产已有表时执行):
-- ALTER TABLE payment_transaction ADD COLUMN fee_amount DECIMAL(20,2) NULL DEFAULT 0 AFTER amount;
-- ALTER TABLE withdraw_request
--   ADD COLUMN fee_amount DECIMAL(20,2) NULL DEFAULT 0 AFTER amount,
--   ADD COLUMN net_amount DECIMAL(20,2) NULL AFTER fee_amount;
-- UPDATE withdraw_request SET fee_amount = 0, net_amount = amount WHERE net_amount IS NULL;
--
-- 预售提货码一次性展示时间(生产已有 presale_voucher 表时执行):
-- ALTER TABLE presale_voucher ADD COLUMN token_claimed_at DATETIME(6) NULL AFTER token_hint;
