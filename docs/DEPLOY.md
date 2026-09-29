# 部署手册(2C2G 单机)

## 1. 系统准备(Ubuntu 22.04+ 示例)

```bash
apt update && apt install -y openjdk-17-jre-headless mysql-server nginx
# 建议开启 1G swap 兜底(防峰值 OOM,常态不应使用)
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' >> /etc/sysctl.conf && sysctl -p
```

## 2. MySQL

```bash
mysql -e "CREATE DATABASE ka CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -e "CREATE USER 'ka'@'localhost' IDENTIFIED BY '<强密码>';
          GRANT SELECT,INSERT,UPDATE,DELETE ON ka.* TO 'ka'@'localhost';"
# 应用 2C2G 配置
cp docs/my.cnf.example /etc/mysql/conf.d/ka.cnf && systemctl restart mysql
```

迁移使用独立 DDL 账号，通过 `SPRING_FLYWAY_USER` / `SPRING_FLYWAY_PASSWORD` 注入，运行账号保留上述 DML 权限。建号授权、已有库首次接入及备份恢复见 [数据库迁移手册](DATABASE_MIGRATIONS.md)。

## 3. 后端

```bash
cp .env.example .env && vim .env      # 填齐全部密钥(生成命令见文件内注释)
./mvnw -DskipTests package
./run.sh                               # 或配 systemd(见下)
```

systemd 单元 `/etc/systemd/system/ka.service`:

```ini
[Unit]
Description=Ka
After=mysql.service
[Service]
User=ka
WorkingDirectory=/opt/ka
ExecStart=/opt/ka/run.sh
Restart=always
RestartSec=5
MemoryMax=1400M
[Install]
WantedBy=multi-user.target
```

## 4. 前端

```bash
cd frontend && npm ci && npm run build   # 产物 dist/ 由 Nginx 托管
```

## 5. Nginx

`cp docs/nginx.conf.example /etc/nginx/sites-available/ka` 后按注释改域名与证书(certbot 免费签发),`nginx -s reload`。

## 6. 上线检查清单

- [ ] .env 全部密钥已填且已备份(尤其 KA_AES_KEY)
- [ ] 首次启动日志中的初始管理员密码已修改
- [ ] 后台 → 支付渠道:配置并启用所需渠道
- [ ] KA_MERCHANT_ADDRESS 为冷钱包地址,小额转账实测三条链到账
- [ ] 支付宝/易支付 notify URL 可公网访问(https://域名/api/pay/notify/{渠道码})
- [ ] HTTPS 生效,HTTP 强制跳转
- [ ] MySQL 每日备份(mysqldump + 异地),日志轮转
