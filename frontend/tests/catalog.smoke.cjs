// Large-catalog regression; all API responses and images are local fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const output = mkdtempSync(join(tmpdir(), 'ka-catalog-'));
const categories = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: i === 1 ? '影音订阅与超长分类名称展示测试' : `商品分类 ${i + 1}` }));
const products = Array.from({ length: 157 }, (_, i) => ({
  id: i + 1, categoryId: i % 40 + 1,
  name: `商品 ${String(i + 1).padStart(3, '0')}` + (i % 3 ? '' : ' · 多地区通用专业版年度订阅含升级服务与完整售后使用说明'),
  brief: i % 4 ? '购买前确认适用地区与使用范围。支付后请查看订单中的交付说明。' : null,
  coverImage: i % 3 ? null : `/mock-image-${i}.svg`,
  price: ((158 - i) * 1.25).toFixed(2), stock: i % 5 ? 20 : 0, minBuy: 1, maxBuy: 10,
  minOrderAmount: '0', deliveryMode: 'AUTO_CARD',
}));
products[1].deliveryMode = 'MANUAL'; products[1].stock = 0;
products[2].deliveryMode = 'PRESALE_VOUCHER'; products[2].stock = 0;
products[2].presaleSaleEndAt = '2099-01-01T00:00:00Z';
products[3].deliveryMode = 'PRESALE_VOUCHER'; products[3].presaleSaleEndAt = '2000-01-01T00:00:00Z';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/mock-image-*.svg', (route) => {
      const n = Number(route.request().url().match(/mock-image-(\d+)/)[1]);
      return n % 9 === 0 ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${n % 2 ? 120 : 60}" height="${n % 2 ? 60 : 120}"><rect width="100%" height="100%" fill="#e2e8e4"/><text x="12" y="35" fill="#213c2e">KA</text></svg>` });
    });
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/store/site' ? { siteName: 'Ka Store', theme: 'mint', mode: 'light', currency: 'CNY' }
        : path === '/api/store/categories' ? categories : path === '/api/store/products' ? products
        : path.startsWith('/api/store/products/') ? { ...products[Number(path.split('/').pop()) - 1], description: '商品详情' } : {};
      return route.fulfill({ json: { code: 0, data } });
    });
    await page.goto(base + '/');
    const cards = page.locator('.catalog-product');
    await cards.first().waitFor();
    assert.equal(await cards.count(), 12, 'render only one page');
    assert.equal(await page.locator('.catalog-category').count(), 41);
    const sortBox = page.getByRole('combobox', { name: '商品排序' });
    await sortBox.focus(); await sortBox.press('Enter'); await sortBox.press('ArrowDown'); await sortBox.press('Enter');
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'price-asc', 'keyboard selection');
    await sortBox.press('Enter'); await sortBox.press('Home'); await sortBox.press('Enter');
    await sortBox.click(); await sortBox.press('Escape'); assert.equal(await page.getByRole('listbox').count(), 0);
    await sortBox.click(); await page.getByRole('heading', { name: '全部商品' }).click(); assert.equal(await page.getByRole('listbox').count(), 0);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
      const next = page.getByRole('button', { name: '下一张', exact: true });
      const initial = await next.boundingBox(); const hero = await page.locator('.store-hero').boundingBox();
      for (let i = 0; i < 3; i++) {
        await next.click(); const current = await next.boundingBox(); const box = await page.locator('.store-hero').boundingBox();
        assert(Math.abs(current.x - initial.x) < 1 && Math.abs(current.y - initial.y) < 1, 'carousel controls stay fixed');
        assert(Math.abs(box.height - hero.height) < 1, 'carousel height stays fixed');
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    assert((await cards.first().getAttribute('href')).endsWith('/13'));
    await cards.first().click(); await page.getByRole('heading', { level: 1 }).waitFor();
    await page.goBack(); await cards.first().waitFor();
    assert((await cards.first().getAttribute('href')).endsWith('/13'), 'back retains page');
    await page.getByRole('combobox', { name: '商品排序' }).click(); await page.getByRole('option', { name: '价格从低到高', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('page'), null);
    assert((await cards.first().getAttribute('href')).endsWith('/157'), 'numeric price sort');
    await page.getByRole('combobox', { name: '每页商品数量' }).click(); await page.getByRole('option', { name: '48', exact: true }).click();
    assert.equal(await cards.count(), 48);
    await page.getByRole('button', { name: '第 4 页', exact: true }).click();
    assert.equal(await cards.count(), 13, 'partial last page');
    await page.getByRole('searchbox').fill('商品 001'); assert.equal(await cards.count(), 1);
    await page.getByRole('checkbox', { name: '仅看可购买' }).check();
    await page.getByText('没有找到匹配的商品', { exact: true }).waitFor();
    await page.getByRole('button', { name: '查看全部商品', exact: true }).click();
    await page.getByRole('checkbox', { name: '仅看可购买' }).check();
    await page.getByRole('searchbox').fill('商品 002'); assert.equal(await cards.count(), 1, 'manual without stock');
    await page.getByRole('searchbox').fill('商品 003'); assert.equal(await cards.count(), 1, 'active presale');
    await page.getByRole('searchbox').fill('商品 004'); assert.equal(await cards.count(), 0, 'expired presale');
    await page.getByRole('button', { name: '查看全部商品', exact: true }).click();
    await page.getByRole('combobox', { name: '每页商品数量' }).click(); await page.getByRole('option', { name: '12', exact: true }).click();
    await page.getByRole('combobox', { name: '商品排序' }).click(); await page.getByRole('option', { name: '默认排序', exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#products').evaluate((el) => el.scrollIntoView());
      for (const mode of ['light', 'dark']) {
        await page.evaluate((mode) => { document.documentElement.dataset.mode = mode; }, mode);
        await page.waitForTimeout(350); // Let the existing theme color transition settle before visual QA.
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${mode}: no overflow`);
        const boxes = await cards.evaluateAll((els) => els.map((el) => ({ top: el.offsetTop, height: el.getBoundingClientRect().height })));
        for (const box of boxes) assert(boxes.filter((b) => b.top === box.top).every((b) => Math.abs(b.height - box.height) < 1), 'aligned rows');
        if ([390, 1440].includes(width)) {
          await page.getByRole('combobox', { name: '商品排序' }).click();
          await page.screenshot({ path: join(output, `${width}-${mode}.png`) });
          await page.getByRole('combobox', { name: '商品排序' }).press('Escape');
        }
      }
      if (width === 390) {
        await page.getByRole('combobox', { name: '商品分类', exact: true }).click(); await page.getByRole('option', { name: '商品分类 40 (3)', exact: true }).click();
        assert.equal(await cards.count(), 3, 'last category reachable on mobile');
        await page.getByRole('combobox', { name: '商品分类', exact: true }).click(); await page.getByRole('option', { name: '全部分类 (157)', exact: true }).click();
      }
    }
    await page.goto(base + '/?page=999999&size=12'); await cards.first().waitFor();
    assert.equal(await cards.count(), 1, 'out-of-range page clamps');
    assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true);
    await page.goto(base + '/?page=-1&size=999'); await cards.first().waitFor();
    assert.equal(await cards.count(), 12, 'invalid params use bounded defaults');
    assert.deepEqual(errors, []);
    console.log('PASS: 157 products, 40 categories, paging/back, sort, availability, 5 widths, both modes, aligned rows, URL bounds.');
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
