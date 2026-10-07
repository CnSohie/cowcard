// SPA interaction regression. Slow mocked responses make unintended reloads visible.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const categories = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `分类 ${i + 1}` }));
const products = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1, categoryId: i % 10 + 1, name: `ChatGPT 套餐 ${i + 1}`, brief: '查看套餐与交付说明', price: `${100 - i}.00`,
  coverImage: null, stock: i % 4 ? 20 : 0, minBuy: 1, maxBuy: 10, minOrderAmount: '0', deliveryMode: 'AUTO_CARD',
}));
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const requests = {}; let broken = false;
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      requests[path] = (requests[path] || 0) + 1;
      if (['/api/store/products', '/api/store/categories'].includes(path)) await new Promise(resolve => setTimeout(resolve, 400));
      const data = path === '/api/store/site' ? { siteName: 'Ka Store', theme: 'mint', mode: 'light', currency: 'CNY' }
        : path === '/api/store/availability' ? { state: 'OPEN' }
        : path === '/api/store/categories' ? categories
        : path === '/api/store/products' ? (broken ? {} : products)
        : /^\/api\/store\/products\/\d+$/.test(path) ? { ...products[Number(path.split('/').pop()) - 1], description: '商品详情' }
        : path.endsWith('/member-price') ? { unitPrice: '99.00', source: 'LIST', wholesaleTiers: [] } : {};
      return route.fulfill({ json: { code: 0, data } });
    });
    await page.goto(base); await page.locator('.catalog-product').first().waitFor();
    const baseline = { products: requests['/api/store/products'], categories: requests['/api/store/categories'] };
    await page.evaluate(() => {
      window.__header = document.querySelector('.store-header');
      window.__home = document.querySelector('.store-home');
      window.__loadingFlashes = 0; window.__scrollCalls = 0;
      const original = window.scrollTo;
      window.scrollTo = function (...args) { window.__scrollCalls++; return original.apply(this, args); };
      window.__observer = new MutationObserver(() => {
        const loading = [...document.querySelectorAll('[role="status"]')].some(el => /加载中|Loading/.test(el.textContent) && el.getClientRects().length)
          || !!document.querySelector('.catalog-grid[aria-busy="true"]');
        if (loading) window.__loadingFlashes++;
      });
      window.__observer.observe(document.getElementById('root'), { childList: true, subtree: true, attributes: true, characterData: true });
    });
    async function unchanged(label, allowScroll = false) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await page.evaluate(() => ({
        sameHome: document.querySelector('.store-home') === window.__home,
        sameHeader: document.querySelector('.store-header') === window.__header,
        loading: window.__loadingFlashes, scrolls: window.__scrollCalls,
      }));
      assert(state.sameHome && state.sameHeader, `${label}: same page/layout must not remount: ${JSON.stringify(state)}`);
      assert.equal(state.loading, 0, `${label}: no loading flashes`);
      if (!allowScroll) assert.equal(state.scrolls, 0, `${label}: no jump to top`);
      assert.equal(requests['/api/store/products'], baseline.products, `${label}: do not refetch products`);
      assert.equal(requests['/api/store/categories'], baseline.categories, `${label}: do not refetch categories`);
      await page.evaluate(() => { window.__scrollCalls = 0; });
    }
    await page.locator('#products').evaluate(el => el.scrollIntoView());
    await page.getByRole('button', { name: '分类 2', exact: false }).click();
    await page.waitForFunction(() => document.querySelector('.catalog-title')?.textContent === '分类 2' && document.querySelectorAll('.catalog-product').length === 6);
    await unchanged('category');
    await page.getByRole('button', { name: '清除筛选', exact: true }).click(); await unchanged('clear');
    await page.getByRole('combobox', { name: '商品排序' }).click();
    await unchanged('open sort');
    await page.getByRole('option', { name: '价格从低到高', exact: true }).click(); await unchanged('sort');
    await page.getByRole('checkbox', { name: '仅看可购买' }).check(); await unchanged('availability filter');
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    const search = page.getByRole('searchbox', { name: '搜索商品' });
    await search.click(); await search.pressSequentially('ChatGPT', { delay: 20 });
    assert.equal(await search.inputValue(), 'ChatGPT', 'typing keeps all characters');
    assert(await search.evaluate(el => el === document.activeElement), 'typing retains focus');
    await unchanged('typing');
    await page.getByRole('button', { name: '清空搜索' }).click(); await unchanged('clear search');
    await page.getByRole('combobox', { name: '每页商品数量' }).click();
    await page.getByRole('option', { name: '24', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.catalog-product').length === 24);
    await unchanged('page size');
    await page.getByRole('button', { name: '下一页', exact: true }).click(); await unchanged('pagination', true);
    // Same-page URL history must also retain the mounted page and the downloaded catalog.
    await page.goBack(); await unchanged('query history');
    await page.getByRole('button', { name: '切换明暗模式', exact: true }).click(); await unchanged('theme');
    await page.getByRole('button', { name: '语言', exact: true }).click(); await unchanged('language');
    await page.getByRole('button', { name: 'Language', exact: true }).click(); await unchanged('language back');
    await page.goto(base); await page.locator('.catalog-product').first().waitFor();
    // Live resizing retains state and changes the grid/nav without reloading.
    await page.evaluate(() => { window.__resizeHome = document.querySelector('.store-home'); });
    const resizeRequests = requests['/api/store/products'];
    for (const width of [320, 390, 640, 767, 768, 1024, 1200, 1440, 1920, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.evaluate(() => ({
        same: document.querySelector('.store-home') === window.__resizeHome,
        columns: getComputedStyle(document.querySelector('.catalog-grid')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        mobileNav: getComputedStyle(document.querySelector('.store-mobile-primary')).display,
      }));
      assert(layout.same && !layout.overflow, `${width}: responsive layout persists without remount/overflow`);
      assert.equal(layout.columns, width <= 340 ? 1 : width <= 1023 ? 2 : width < 1200 ? 3 : 4, `${width}: responsive columns`);
      assert.equal(layout.mobileNav === 'none', width >= 768, `${width}: matching navigation`);
      assert.equal(requests['/api/store/products'], resizeRequests, `${width}: resize does not fetch`);
    }
    assert.equal(await page.getByRole('combobox', { name: '商品分类', exact: true }).isVisible(), false, 'mobile categories only use the chip rail');
    await page.getByRole('button', { name: '更多入口' }).click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden');
    assert.equal(await page.getByRole('dialog').count(), 0, 'rotation closes hidden mobile sheet and unlocks scrolling');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#products').evaluate(el => el.scrollIntoView());
    await page.evaluate(() => { window.__beforeCategory = scrollY; });
    await page.getByRole('button', { name: '分类 10', exact: false }).click();
    await page.waitForFunction(() => document.querySelector('.catalog-title')?.textContent === '分类 10');
    // Selecting a far-away chip moves its rail horizontally, not the document vertically.
    assert(await page.evaluate(() => Math.abs(scrollY - window.__beforeCategory) < 2), 'chip selection does not move the page');
    // A real resource change still resets its page data/form, but not the shared navigation.
    await page.goto(base + '/product/1');
    await page.getByRole('heading', { name: products[0].name, exact: true }).waitFor();
    await page.evaluate(() => { window.__productHeader = document.querySelector('.store-header'); });
    await page.evaluate(() => {
      history.pushState(history.state, '', '/product/2');
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await page.getByRole('heading', { name: products[1].name, exact: true }).waitFor();
    assert(await page.evaluate(() => document.querySelector('.store-header') === window.__productHeader), 'real resource changes preserve the shared layout');
    assert.equal(await page.getByRole('heading', { name: products[0].name, exact: true }).count(), 0, 'new product must not show the previous product');
    assert.deepEqual(errors, []);
    // Error recovery resets only the failure state, including a same-path query change.
    broken = true; await page.goto(base + '/?broken=1');
    await page.getByRole('heading', { name: '页面加载失败', exact: true }).waitFor();
    await page.evaluate(() => { window.__documentToken = 'retained'; });
    broken = false;
    await page.evaluate(() => {
      history.pushState(history.state, '', '/?recovered=1');
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await page.locator('.catalog-product').first().waitFor();
    assert.equal(await page.evaluate(() => window.__documentToken), 'retained', 'error boundary recovers on URL change without document reload');
    assert.equal(await page.getByRole('heading', { name: '页面加载失败', exact: true }).count(), 0);
    console.log('PASS: slow APIs, category/sort/search/availability/page-size/paging/history/theme/language without remount/refetch/loading flash; live responsive resizing and mobile rotation; query-key error recovery.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
