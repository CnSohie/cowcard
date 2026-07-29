#!/usr/bin/env bash
# ============================================================
# Ka 生产启动脚本(2C2G 调优)
# 前置:.env 已就位(见 .env.example),jar 已构建(./mvnw -DskipTests package)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

set -a; source ./.env; set +a

exec java \
  -Xms512m -Xmx1g \
  -XX:MaxMetaspaceSize=192m \
  -Xss512k \
  -XX:+UseG1GC -XX:MaxGCPauseMillis=100 \
  -XX:+UseStringDeduplication \
  -XX:ActiveProcessorCount=2 \
  -XX:+ExitOnOutOfMemoryError \
  -Dfile.encoding=UTF-8 \
  -Duser.timezone=Asia/Shanghai \
  -Dspring.profiles.active=prod \
  -jar target/Ka-0.0.1-SNAPSHOT.jar
