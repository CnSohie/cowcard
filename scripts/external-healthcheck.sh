#!/bin/sh
# 在 Ka 服务器以外的机器上跑。服务器、后台页面和本机 Telegram 一起挂掉时，这个检查仍然会失败。
# 只判断进程还在不在，不代替后台里的扫链和发货告警。
# cron 示例: */2 * * * * /opt/external-healthcheck.sh https://shop.example.com/actuator/health
set -u
URL=${1:-}
if [ -z "$URL" ]; then
  echo "usage: external-healthcheck.sh https://your-shop/actuator/health" >&2
  exit 2
fi
body=$(curl -fsS --max-time 8 "$URL") || {
  echo "UNREACHABLE $URL"
  exit 1
}
printf '%s' "$body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"(UP|DEGRADED)"' || {
  echo "NOT_UP $body"
  exit 1
}
echo "OK"
exit 0
