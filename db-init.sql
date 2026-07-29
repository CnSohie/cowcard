-- ============================================================
-- Ka 发卡平台 - 一键初始化脚本(开发环境)
-- 用法:mysql -u root -p < db-init.sql
-- 内容:建库 → 建应用账号 → 建全部表
-- 注意:账号密码与 src/main/resources/application.yml 保持一致
--       (ka / ka_dev_password);生产环境务必改强密码并用 .env 注入
-- ============================================================

-- 1. 建库
CREATE DATABASE IF NOT EXISTS ka DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 2. 应用账号(仅本机可连;开发环境给全权,生产建议只留 SELECT/INSERT/UPDATE/DELETE)
CREATE USER IF NOT EXISTS 'ka'@'localhost' IDENTIFIED BY 'ka_dev_password';
CREATE USER IF NOT EXISTS 'ka'@'127.0.0.1' IDENTIFIED BY 'ka_dev_password';
GRANT ALL PRIVILEGES ON ka.* TO 'ka'@'localhost';
GRANT ALL PRIVILEGES ON ka.* TO 'ka'@'127.0.0.1';
FLUSH PRIVILEGES;

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
  cover_image  VARCHAR(255),
  price        DECIMAL(20,2) NOT NULL,
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
  KEY idx_card_order (order_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_no            VARCHAR(32)   NOT NULL,
  order_type          VARCHAR(16)   COMMENT 'GOODS=商品 RECHARGE=钱包充值;空按 GOODS',
  member_id           BIGINT        COMMENT '下单会员;游客单为空',
  product_id          BIGINT        NOT NULL COMMENT 'RECHARGE 单用 0 占位',
  product_name        VARCHAR(128)  NOT NULL,
  unit_price          DECIMAL(20,2) NOT NULL,
  quantity            INT           NOT NULL,
  amount              DECIMAL(20,2) NOT NULL,
  contact             VARCHAR(128)  NOT NULL,
  coupon_code         VARCHAR(32),
  discount_amount     DECIMAL(20,2) NOT NULL DEFAULT 0,
  query_password_hash VARCHAR(100),
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
-- 已建库升级:开发环境重启应用即自动加表加列(ddl-auto=update)
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
  last_login_at   DATETIME(6),
  last_login_ip   VARCHAR(45),
  created_at      DATETIME(6),
  updated_at      DATETIME(6),
  UNIQUE KEY idx_member_email (email),
  UNIQUE KEY idx_member_invite (invite_code),
  KEY idx_member_inviter (inviter_id)
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
  type          VARCHAR(20)   NOT NULL COMMENT 'RECHARGE/PURCHASE/COMMISSION/WITHDRAW_FREEZE/WITHDRAW_REJECT/ADJUST',
  amount        DECIMAL(20,2) NOT NULL COMMENT '带符号:入正出负',
  balance_after DECIMAL(20,2) NOT NULL COMMENT '本笔后可用余额快照',
  ref_type      VARCHAR(16) COMMENT 'ORDER/ARTICLE/WITHDRAW/MANUAL',
  ref_id        BIGINT,
  remark        VARCHAR(255),
  created_at    DATETIME(6),
  KEY idx_txn_member (member_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS withdraw_request (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  member_id   BIGINT        NOT NULL,
  amount      DECIMAL(20,2) NOT NULL,
  channel     VARCHAR(32)   NOT NULL COMMENT 'ALIPAY/USDT/BANK',
  account     VARCHAR(128)  NOT NULL,
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

-- 已有库补列(首次初始化无需执行;报 Duplicate column 说明已存在,可忽略):
-- ALTER TABLE orders
--   ADD COLUMN order_type VARCHAR(16) NULL COMMENT 'GOODS=商品 RECHARGE=钱包充值;空按 GOODS',
--   ADD COLUMN member_id  BIGINT      NULL COMMENT '下单会员;游客单为空',
--   ADD KEY idx_order_member (member_id);
