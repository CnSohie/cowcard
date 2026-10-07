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

## 2026-10-05 商城响应式布局

移动端使用顶部商品/订单导航，文章、提货和语言入口保留在辅助导航；商品卡使用标题、封面、价格与药丸按钮的紧凑布局，桌面端三列、平板两列、手机单列。所有颜色继续使用语义主题令牌，商家轮播配置、URL 筛选和分页保持可用。

订单详情为居中限宽弹层，手机两侧至少 20px 留白；固定标题与关闭按钮，内容区域独立滚动。`order-dialog.smoke.cjs` 新增超长名称、订单号、无空格卡密、使用说明、人工交付和完整原文复制测试，覆盖 320/375/390/430/768/1440px 与 844×390 横屏、四主题和两模式。`catalog.smoke.cjs` 另检查顶部导航、会员导航、商品网格、操作按钮边界和单张/六张自定义轮播。模拟接口已对齐 `/orders/query-by-token` 和营业状态接口；不调用真实支付或写入真实订单。

浏览器检查使用本地 Chrome，未替代真实 iPhone Safari 验证。此调整仅涉及前端，无数据库迁移。

## 2026-10-07 首页版面重构

首页横幅改为可选区块：后台「站点设置 → 首页横幅」可一键隐藏全部屏，也可逐屏停用。启用 1 屏渲染静态大标题（`.hero-controls` 不出现），启用 2 屏以上出现进度、页码与前后箭头（`上一张`/`下一张`），全部停用时页面不渲染 `.store-hero`。`catalog.smoke.cjs` 新增「全部停用后首页直接从分类开始」断言；`storefront.smoke.cjs` 的模板轮播断言改为分类药丸 chip 与顶栏「我的订单」入口可见性（原 `.hero-service-links` 版式已移除）。

分类从侧边栏改为顶部可横向滚动的药丸 chip，搜索/排序/仅看可购买收进一条工具行（手机隐藏「每页」）；分类多于 6 个时桌面端保留下拉选择器，手机端仅用 chip。商品卡仍是 `.catalog-product` + `.catalog-card-action`，测试选择器未变。当前环境未安装 Playwright，本次未执行浏览器回归。

同日修复 `/posts` 白屏：`PostsPage` 在接口返回体缺少 `items` 时直接读 `data.items.length` 抛错，而整棵路由树没有错误边界，异常冒泡到根节点后 `#root` 被清空，表现为整页空白。现 `PostsPage` 改用 `!data?.items?.length` 判空（异常响应回落空状态），并新增 `components/AppErrorBoundary.tsx` 包住 `App.tsx` 的整个 `Routes`，按 `pathname+search` 作 key 在路由切换时自动复位。所有前台/后台路由已逐个跑通；`/about` 有一处装饰性光斑按设计溢出视口，不算回归。

## 2026-10-07 移动端专项

移动端不再沿用双行顶栏：≤767px 顶栏固定 3.5rem 单行（品牌 + 全部商品/我的订单 + 主题/登录/更多），`MoreHorizontal` 打开底部面板 `.store-sheet`（`role="dialog"`，Esc 与遮罩关闭、打开时 `body.overflow=hidden`、链接点击后自动关闭）；文章、提货码、语言、明暗的完整入口都在面板里。原先常驻的 `.store-mobile-secondary` 会在滚动时压在卡片内容上，已改为 `display:none`。

横幅在手机上只保留文案与进度/箭头，配图 `display:none`；分类 chip rail 右侧用渐隐 mask 提示可横滑；每页数量选择器移动端隐藏。`catalog.smoke.cjs` 新增断言：移动端顶栏高度 < 70px、辅助导航行不可见、手机单列卡片宽度 > 300px、面板可开且锁滚动、Esc 可关。`storefront.smoke.cjs` 切语言前先打开「更多入口」面板。已在 390×844 逐个跑通 `/`、`/posts`、`/posts/:slug`、`/product/:id`、`/order`、`/redeem`、`/about`、`/tos`、`/pay/:orderNo`、`/login`、`/me`，页面级无横向溢出。Playwright 未安装，浏览器回归待有环境时执行。

## 2026-10-07 紧凑卡片与轮播遮挡修复

新增 `node frontend/tests/storefront-layout.smoke.cjs`，沿用 `PLAYWRIGHT_MODULE` / `UI_BASE_URL` 配置，不增加应用依赖。所有接口与封面均为本地模拟：

- 320/390/640/767/768/1024/1200/1440/1920px × 四主题 × 深浅模式，无横向溢出。
- 轮播文案与控件分处两个网格行；六张长短不一、自定义配图、含/不含 CTA 的幻灯片，切屏高度保持稳定，自动轮播仍工作。
- ≥1200px 四列紧凑商品卡，1024–1199px 三列，其他区间双列（≤340px 单列）；桌面操作提示高度 32px，价格与箭头不重叠，封面保持 16:10。
- ≤767px 操作提示为无背景/边框/圆角的裸箭头，覆盖 640–767px；CoW 旧圆形伪元素已移除，模拟鼠标悬停、真实触摸设备配置、进入商品再返回、滚动与主题切换均不产生圆圈。
- `catalog.smoke.cjs` 更新紧凑卡片断言与异步加载等待；`storefront.smoke.cjs` 改用 `.catalog-product` 与真实分类文案，避免依赖移除的装饰类。

已通过 TypeScript 检查、Vite 构建、布局专项、157 商品/40 分类目录回归，以及商城查单/模拟支付回归。浏览器为本地 Google Chrome，触摸使用 Playwright 模拟；不等同真实 iPhone Safari 验证。截图保存在测试输出的临时目录。本次仅前端，无数据库迁移。
