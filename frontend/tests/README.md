# Storefront browser regression

`storefront.smoke.cjs` uses Playwright and a local Google Chrome installation. Run the frontend (`npm run dev`), then run:

```sh
node frontend/tests/storefront.smoke.cjs
```

Playwright must be available to Node. If supplied by a separate tooling environment, set `PLAYWRIGHT_MODULE` to that environment's `playwright` module directory. Set `UI_BASE_URL` to use a different local preview port. No application runtime dependency is added.

Every `/api/**` request is intercepted with test fixtures; the script does not create real orders, connect a wallet, or make payments. It checks search/filter reset and browser-back persistence, public site request deduplication, mobile overflow in four themes and both modes, fee totals, payment creation locks, retaining an intent when reselecting its channel/network, hidden-page polling suspension/resumption, expiry, and product-load retry. Screenshots are written to a temporary directory printed on completion.

2026-09-28 validation: TypeScript check, Vite production build and browser regression passed. Home JavaScript import closure (entry + Home + static dependencies) measured approximately 101 KB gzip, versus 216 KB before route splitting. This compares build resource sizes, not live network timings. Payment providers and blockchain settlement still require integration testing against their respective test environments.

## Large product catalogs

Run `node frontend/tests/catalog.smoke.cjs` with the same Playwright and preview configuration. The fixtures contain 157 products and 40 categories, long/short titles, absent descriptions, missing and differently proportioned images, sold-out stock, manual delivery, and open/expired presales. Checks cover 12/24/48-page-size controls (12 and 48 exercised), numeric price sorting, page reset after filtering, browser-back page persistence, mobile category selection, malformed URL bounds, equal-height rows and no horizontal overflow at 320/390/768/1024/1440 px in both modes.

Catalog pagination currently limits browser rendering. The existing public API still returns the full product list; this change does not implement server-side pagination or change the store's default product ordering.

2026-09-29: 回归新增首页前后箭头、成功下单后的邮箱 Cookie 回填，以及加密支付切换渠道/网络、刷新后自动恢复与过期意向不恢复；验证恢复过程没有新增支付创建请求。

查单回归覆盖：默认最近订单入口、邮箱筛选、一键携带本机凭证查询、手动查单折叠与邮箱回填、删除记录后的空状态，以及移动端无横向溢出。

2026-09-29 文案调整：查单页验证中英文即时切换、英文查询表单、待支付状态、预售提示与凭证状态、错误提示。商品名称和商家填写的内容保持原文。

首页控件回归：320/390/1440px 下轮播切换前后按钮坐标与容器高度不变；分类、排序、每页数量使用主题下拉菜单，覆盖键盘选择、Esc/外部点击关闭及 40 分类滚动选择。

## 2026-09-30 会员会话与查单滚动

`member-session.smoke.cjs`（与上文相同的 Playwright 配置）模拟访问令牌过期后续期、续期网络/服务故障、游客或他人订单拒付、并发旧请求延迟返回，以及刷新令牌失效。确认临时故障和订单权限错误不清除会员登录，真正失效才清除。所有支付请求均拦截，不扣真实余额。

`storefront.smoke.cjs` 另验证首次及重复查单不会主动调用滚动 API。后端 `JwtAuthenticationFilterTest` 与 `BalancePaymentStrategyTest` 覆盖过期身份不能落成游客订单、无令牌游客仍可下单、登录入口不受旧令牌阻断，以及余额拒付不误报登录过期。

查单结果现通过原生模态详情框展示。`order-dialog.smoke.cjs` 覆盖点击后立即加载、结果位于手机视口内、Esc 关闭与焦点归还、请求未结束时关闭不被迟到响应重开、错误重试、缺少本机查询凭证时在弹层内填表，以及新查询不显示旧结果。截图输出到 `/tmp/ka-order-query-*.png`。
