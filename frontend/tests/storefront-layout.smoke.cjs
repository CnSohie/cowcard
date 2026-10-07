// Layout-only regression: mocked APIs/images, no real orders or payments.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const output = mkdtempSync(join(tmpdir(), 'ka-storefront-layout-'));
const names = ['ChatGPT', 'Gemini Pro', 'Claude Pro', 'Cursor Pro', 'Outlook 邮箱', 'Spotify Premium'];
const products = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, categoryId: i % 2 + 1, name: i === 7 ? '超长商品名称用于检查两行省略与卡片高度保持紧凑' : names[i % names.length],
  brief: i === 8 ? '超长商品副标题与购买说明。'.repeat(12) : '官方订阅 · 查看套餐详情',
  coverImage: i === 2 ? '/files/layout-cover.svg' : null, price: i === 9 ? '999999.99' : '139.00',
  stock: 42, minBuy: 1, maxBuy: 10, minOrderAmount: '0', deliveryMode: 'AUTO_CARD', soldQuantity: 1280,
}));
const slides = Array.from({ length: 6 }, (_, i) => ({
  id: `layout-${i}`, enabled: true, layout: i % 3 === 0 ? 'image-right' : i % 3 === 1 ? 'payments' : 'steps', tone: 'soft',
  eyebrowZh: '数字商品商店', titleZh: i === 2 ? '一段更长的自定义幻灯片标题用于检验换行' : `找到适合你的服务 ${i + 1}`,
  highlightZh: '按需选择，轻松购买。', descriptionZh: i === 3 ? '长文案应自然撑高内容区，不与轮播进度或前后箭头发生重叠。'.repeat(3) : '查看套餐说明与交付方式。',
  ctaLabelZh: i % 2 ? '' : '开始选购', ctaUrl: i % 2 ? '' : '#products', imageUrl: i % 3 === 0 ? '/files/layout-cover.svg' : '',
}));
let heroSlides;
async function mock(page) {
  await page.route('**/files/layout-cover.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#dfefdd"/><text x="60" y="55">KA</text></svg>' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/store/site' ? { siteName: 'Ka Store', theme: 'mint', mode: 'light', currency: 'CNY', heroSlides }
      : path === '/api/store/availability' ? { state: 'OPEN' }
      : path === '/api/store/categories' ? [{ id: 1, name: '数字订阅' }, { id: 2, name: '工具服务' }]
      : path === '/api/store/products' ? products
      : path.startsWith('/api/store/products/') ? { ...products[0], description: '查看套餐与使用说明。' } : {};
    return route.fulfill({ json: { code: 0, data } });
  });
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      copy: rect(document.querySelector('.hero-copy-stack')), controls: rect(document.querySelector('.hero-controls')),
      cards: [...document.querySelectorAll('.catalog-product')].map(card => {
        const action = card.querySelector('.catalog-card-action');
        const art = rect(card.querySelector('.catalog-product-art'));
        const style = getComputedStyle(action);
        return { ...rect(card), action: rect(action), price: rect(card.querySelector('.catalog-product-price')), art,
          actionBackground: style.backgroundColor, actionRadius: style.borderRadius,
          label: getComputedStyle(card.querySelector('.catalog-card-action-label')).display,
          before: getComputedStyle(card, '::before').content, after: getComputedStyle(card, '::after').content };
      }),
    };
  });
}
function check(g, width, label) {
  assert(!g.overflow, `${label}: no horizontal overflow`);
  assert(g.controls.y >= g.copy.bottom + 8, `${label}: navigation is below all slide content`);
  const expectedColumns = width <= 340 ? 1 : width <= 1023 ? 2 : width < 1200 ? 3 : 4;
  assert.equal(g.cards.filter(card => Math.abs(card.y - g.cards[0].y) < 1).length, expectedColumns, `${label}: responsive columns`);
  for (const card of g.cards) {
    assert(Math.abs(card.art.width / card.art.height - 1.6) < 0.01, `${label}: cover remains 16:10`);
    assert(card.action.x >= card.price.right && card.action.right <= card.right - 8, `${label}: price and action do not overlap`);
    assert(card.action.bottom <= card.bottom - 8, `${label}: action fits the card`);
    assert.equal(card.before, 'none', `${label}: no legacy circular decoration`);
    assert.equal(card.after, 'none', `${label}: no legacy hover dots`);
    if (width <= 767) {
      assert.equal(card.actionBackground, 'rgba(0, 0, 0, 0)', `${label}: mobile arrow is transparent`);
      assert.equal(card.actionRadius, '0px', `${label}: no mobile circle`);
      assert.equal(card.label, 'none', `${label}: no mobile button text`);
    } else {
      assert(card.action.height <= 34, `${label}: desktop CTA is compact`);
      if (width >= 1200) assert(card.width < 310 && card.height < 390, `${label}: desktop cards are compact`);
    }
  }
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await mock(page); await page.goto(base); await page.locator('.catalog-product').first().waitFor();
    for (const width of [320, 390, 640, 767, 768, 1024, 1200, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['mint', 'ocean', 'violet', 'cow']) for (const mode of ['light', 'dark']) {
        await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; }, { theme, mode });
        check(await geometry(page), width, `${width}/${theme}/${mode}`);
        if (width <= 767) {
          await page.locator('.catalog-product').first().hover();
          check(await geometry(page), width, `${width}/${theme}/${mode}/hover`);
        }
        if ([390, 1440].includes(width) && ['mint', 'cow'].includes(theme)) {
          await page.locator('#products').evaluate(el => el.scrollIntoView());
          await page.waitForTimeout(350); // Only wait for color transitions before screenshots.
          await page.screenshot({ path: join(output, `catalog-${width}-${theme}-${mode}.png`) });
        }
      }
    }
    // Long and unequal custom slides, six progress segments, custom covers and CTAs.
    heroSlides = JSON.stringify(slides);
    await page.clock.install();
    await page.reload(); await page.locator('.hero-dot').nth(5).waitFor();
    for (const width of [320, 390, 767, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      const initial = await page.locator('.store-hero').boundingBox();
      for (let i = 0; i < 6; i++) {
        await page.getByRole('button', { name: `第 ${i + 1} 屏`, exact: true }).click();
        const g = await geometry(page);
        assert(g.controls.y >= g.copy.bottom + 8, `${width}: custom slide does not overlap navigation`);
        assert(g.controls.right <= width, `${width}: six progress segments fit`);
        const current = await page.locator('.store-hero').boundingBox();
        assert(Math.abs(initial.height - current.height) < 1, `${width}: carousel height remains stable`);
      }
    }
    const active = await page.locator('.hero-dot[aria-current="true"]').getAttribute('aria-label');
    await page.clock.fastForward(7000);
    await page.waitForFunction(active => document.querySelector('.hero-dot[aria-current="true"]').getAttribute('aria-label') !== active, active);
    assert.notEqual(await page.locator('.hero-dot[aria-current="true"]').getAttribute('aria-label'), active, 'automatic carousel still advances');
    const g = await geometry(page); assert(g.controls.y > g.copy.bottom, 'automatic change does not cover slide');
    // Real touch emulation, navigate to a product and back, then scroll and switch themes.
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await touch.newPage(); await mock(phone);
    phone.on('pageerror', e => errors.push(e.message));
    await phone.goto(base); await phone.locator('.catalog-product').first().waitFor();
    assert(await phone.evaluate(() => matchMedia('(hover: none)').matches), 'touch device emulated');
    for (const theme of ['mint', 'ocean', 'violet', 'cow']) {
      await phone.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await phone.locator('.catalog-product').first().tap(); await phone.waitForURL('**/product/1');
      await phone.goBack(); await phone.locator('.catalog-product').first().waitFor();
      await phone.locator('.catalog-product').nth(5).scrollIntoViewIfNeeded();
      await phone.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      check(await geometry(phone), 390, `touch/${theme}/after-navigation`);
    }
    await touch.close();
    assert.deepEqual(errors, []);
    console.log('PASS: 9 widths × 4 themes × 2 modes, compact desktop cards, 16:10 covers, mobile hover/touch/back without circles, six unequal slides, stable controls, automatic carousel.');
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
