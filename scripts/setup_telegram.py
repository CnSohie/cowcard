"""Register the configured storefront bot. Reads secrets only from environment; never prints API URLs."""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    token = os.environ.get("KA_TG_BOT_TOKEN", "")
    secret = os.environ.get("KA_TG_WEBHOOK_SECRET", "")
    origin = os.environ.get("KA_TG_SITE_URL", "").rstrip("/")
    url = urllib.parse.urlsplit(origin)
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}", token):
        sys.exit("Missing or invalid KA_TG_BOT_TOKEN")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret):
        sys.exit("Invalid KA_TG_WEBHOOK_SECRET (32-256 URL-safe characters required)")
    if url.scheme != "https" or not url.hostname or url.username or url.query or url.fragment or url.path:
        sys.exit("KA_TG_SITE_URL must be an HTTPS origin without path or credentials")

    def call(method, payload):
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/{method}",
            data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                result = json.load(response)
            if not result.get("ok"):
                sys.exit(f"{method} rejected; check bot configuration")
        except (urllib.error.URLError, ValueError):
            sys.exit(f"{method} failed; check network and bot configuration (secret details suppressed)")

    call("setWebhook", {"url": origin + "/api/telegram/webhook", "secret_token": secret,
                        "allowed_updates": ["message", "callback_query"], "max_connections": 1,
                        "drop_pending_updates": False})
    print("Webhook registered.")
    call("setMyCommands", {"commands": [
        {"command": "start", "description": "打开自助商城"},
        {"command": "products", "description": "浏览自动发卡商品"},
        {"command": "orders", "description": "查看我的 Bot 订单"},
        {"command": "cancel", "description": "取消当前填写，不取消已创建订单"},
        {"command": "help", "description": "使用说明"},
    ]})
    print("Commands registered. Open the bot privately and send /start.")


if __name__ == "__main__":
    main()
