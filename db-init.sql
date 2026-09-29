-- ============================================================
-- Ka 发卡平台 - 一键初始化脚本(开发环境)
-- 用法:mysql -u root -p < db-init.sql
-- 内容:建库 → 建应用账号 → 应用启动后由 Flyway 建表
-- 注意:账号密码与 src/main/resources/application.yml 保持一致
--       (ka / ka_dev_password);生产环境务必改强密码并用 .env 注入
-- ============================================================

-- 1. 建库
CREATE DATABASE IF NOT EXISTS ka DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 2. 应用账号(仅本机可连;开发环境给全权,生产迁移账号与运行账号分离,见 docs/DATABASE_MIGRATIONS.md)
CREATE USER IF NOT EXISTS 'ka'@'localhost' IDENTIFIED BY 'ka_dev_password';
CREATE USER IF NOT EXISTS 'ka'@'127.0.0.1' IDENTIFIED BY 'ka_dev_password';
GRANT ALL PRIVILEGES ON ka.* TO 'ka'@'localhost';
GRANT ALL PRIVILEGES ON ka.* TO 'ka'@'127.0.0.1';
FLUSH PRIVILEGES;
