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
    let siteName = 'Ka Store';
    let heroSlides;
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/mock-image-*.svg', (route) => {
      const n = Number(route.request().url().match(/mock-image-(\d+)/)[1]);
      return n % 9 === 0 ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${n % 2 ? 120 : 60}" height="${n % 2 ? 60 : 120}"><rect width="100%" height="100%" fill="#e2e8e4"/><text x="12" y="35" fill="#213c2e">KA</text></svg>` });
    });
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path === '/api/store/availability' ? { state: 'OPEN' }
        : path === '/api/store/site' ? { siteName, heroSlides, theme: 'mint', mode: 'light', currency: 'CNY' }
        : path === '/api/store/categories' ? categories : path === '/api/store/products' ? products
        : path.startsWith('/api/store/products/') ? { ...products[Number(path.split('/').pop()) - 1], description: '商品详情' } : {};
      return route.fulfill({ json: { code: 0, data } });
    });
    await page.goto(base + '/');
    const cards = page.locator('.catalog-product');
    const expectCards = async (count, message) => {
      await page.waitForFunction((count) => !document.querySelector('.catalog-grid[aria-busy="true"]') && document.querySelectorAll('.catalog-product').length === count, count);
      assert.equal(await cards.count(), count, message);
    };
    await cards.first().waitFor();
    await expectCards(12, 'render only one page');
    assert.equal(await page.locator('.catalog-category').count(), 41);
    const sortBox = page.getByRole('combobox', { name: '商品排序' });
    await sortBox.focus(); await sortBox.press('Enter'); await sortBox.press('ArrowDown'); await sortBox.press('Enter');
    assert.equal(new URL(page.url()).searchParams.get('sort'), 'price-asc', 'keyboard selection');
    await sortBox.press('Enter'); await sortBox.press('Home'); await sortBox.press('Enter');
    await sortBox.click(); await sortBox.press('Escape'); assert.equal(await page.getByRole('listbox').count(), 0);
    await sortBox.click(); await page.locator('.catalog-title').click(); assert.equal(await page.getByRole('listbox').count(), 0);
    for (const width of [320, 390, 640, 767, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
      const next = page.getByRole('button', { name: '下一张', exact: true });
      const initial = await next.boundingBox(); const hero = await page.locator('.store-hero').boundingBox();
      for (let i = 0; i < 3; i++) {
        const copy = await page.locator('.hero-copy-stack').boundingBox();
        const controls = await page.locator('.hero-controls').boundingBox();
        assert(controls.y >= copy.y + copy.height + 8, `${width}: controls occupy their own row below all slide content`);
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
    await expectCards(48);
    await page.getByRole('button', { name: '第 4 页', exact: true }).click();
    await expectCards(13, 'partial last page');
    await page.getByRole('searchbox').fill('商品 001'); await expectCards(1);
    await page.getByRole('checkbox', { name: '仅看可购买' }).check();
    await page.getByText('没有找到匹配的商品', { exact: true }).waitFor();
    await page.getByRole('button', { name: '查看全部商品', exact: true }).click();
    await page.getByRole('checkbox', { name: '仅看可购买' }).check();
    await page.getByRole('searchbox').fill('商品 002'); await expectCards(1, 'manual without stock');
    await page.getByRole('searchbox').fill('商品 003'); await expectCards(1, 'active presale');
    await page.getByRole('searchbox').fill('商品 004'); await expectCards(0, 'expired presale');
    await page.getByRole('button', { name: '查看全部商品', exact: true }).click();
    await page.getByRole('combobox', { name: '每页商品数量' }).click(); await page.getByRole('option', { name: '12', exact: true }).click();
    await page.getByRole('combobox', { name: '商品排序' }).click(); await page.getByRole('option', { name: '默认排序', exact: true }).click();
    for (const width of [320, 390, 640, 767, 768, 1024, 1200, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#products').evaluate((el) => el.scrollIntoView());
      for (const mode of ['light', 'dark']) {
        await page.evaluate((mode) => { document.documentElement.dataset.mode = mode; }, mode);
        await page.waitForTimeout(350); // Let the existing theme color transition settle before visual QA.
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${mode}: no overflow`);
        assert(await page.locator('.store-header').evaluate(el => el.scrollWidth <= el.clientWidth), `${width}: navigation fits without clipping`);
        assert(await page.locator('.catalog-grid').evaluate(el => el.scrollWidth <= el.clientWidth), `${width}: product grid fits`);
        const actions = await page.locator('.catalog-card-action').evaluateAll(els => els.map(el => {
          const action = el.getBoundingClientRect(), card = el.closest('.catalog-product').getBoundingClientRect();
          // 整卡是点击区,桌面按钮只是紧凑提示,手机为无背景裸箭头。
          const compact = innerWidth <= 767 ? action.width >= 12 && action.width <= 20 : action.height >= 28 && action.height <= 34;
          const price = el.previousElementSibling.getBoundingClientRect();
          return compact && action.left >= price.right && action.right <= card.right
            && action.top >= card.top && action.bottom <= card.bottom;
        }));
        assert(actions.every(Boolean), `${width}: card actions stay inside cards`);
        const art = await page.locator('.catalog-product-art').first().boundingBox();
        assert(Math.abs(art.width / art.height - 1.6) < 0.01, `${width}: uploaded covers retain 16:10 aspect ratio`);
        const card = await cards.first().boundingBox();
        if (width >= 1200) assert(card.width < 310 && card.height < 390, `${width}: desktop cards are compact`);
        if (width <= 767) assert.equal(await page.locator('.catalog-card-action-label').first().isVisible(), false, `${width}: no mobile CTA label`);
        const boxes = await cards.evaluateAll((els) => els.map((el) => ({ top: el.offsetTop, height: el.getBoundingClientRect().height })));
        for (const box of boxes) assert(boxes.filter((b) => b.top === box.top).every((b) => Math.abs(b.height - box.height) < 1), 'aligned rows');
        if ([390, 1440].includes(width)) {
          await page.getByRole('combobox', { name: '商品排序' }).click();
          await page.screenshot({ path: join(output, `${width}-${mode}.png`) });
          await page.getByRole('combobox', { name: '商品排序' }).press('Escape');
        }
      }
      if (width === 390) {
        assert.equal(await page.getByRole('combobox', { name: '商品分类', exact: true }).isVisible(), false, 'mobile uses category chips, not a duplicated dropdown');
        await page.locator('.catalog-chip-rail').evaluate(el => { el.scrollLeft = el.scrollWidth; });
        await page.getByRole('button', { name: '商品分类 40 3', exact: true }).click();
        await expectCards(3, 'last category reachable on mobile');
        await page.locator('.catalog-chip-rail').evaluate(el => { el.scrollLeft = 0; });
        await page.getByRole('button', { name: '全部商品 157', exact: true }).click();
      }
    }
    await page.goto(base + '/?page=999999&size=12'); await cards.first().waitFor();
    await expectCards(1, 'out-of-range page clamps');
    assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true);
    await page.goto(base + '/?page=-1&size=999'); await cards.first().waitFor();
    await expectCards(12, 'invalid params use bounded defaults');
    for (const count of [1, 6]) {
      heroSlides = JSON.stringify(Array.from({ length: count }, (_, i) => ({
        id: `custom-${i}`, enabled: true, layout: 'illustration', tone: 'accent',
        titleZh: `自定义轮播 ${i + 1}`, highlightZh: '找到适合你的服务。',
        descriptionZh: '自定义轮播与行动按钮保持可用。', chipsZh: [],
        ctaLabelZh: '查看商品', ctaUrl: '#products',
      })));
      await page.reload(); await cards.first().waitFor();
      for (const width of [320, 390, 640, 767, 1440]) {
        await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
        const hero = await page.locator('.store-hero').boundingBox();
        const cta = await page.locator('.hero-slide[aria-hidden="false"] .btn-primary').boundingBox();
        assert(cta.x >= hero.x && cta.x + cta.width <= hero.x + hero.width, 'custom CTA fits phone');
        if (count === 1) assert.equal(await page.locator('.hero-controls').isVisible(), false, 'single slide hides controls');
        else {
          const controls = await page.locator('.hero-controls').boundingBox();
          assert(controls.x >= hero.x && controls.x + controls.width <= hero.x + hero.width, 'six-slide controls fit phone');
          assert(cta.y + cta.height <= controls.y, 'large carousel does not overlap CTA');
          for (let i = 0; i < 6; i++) {
            await page.getByRole('button', { name: '下一张', exact: true }).click();
            const current = await page.locator('.store-hero').boundingBox();
            assert(Math.abs(current.height - hero.height) < 1, 'custom carousel height stays fixed');
          }
        }
      }
    }
    // The banner is optional:停用全部屏后首页直接从分类开始。
    heroSlides = JSON.stringify([0, 1].map((i) => ({
      id: `off-${i}`, enabled: false, layout: 'illustration', tone: 'accent',
      titleZh: '已停用', highlightZh: '', descriptionZh: '', chipsZh: [], ctaLabelZh: '', ctaUrl: '', imageUrl: '',
    })));
    await page.reload(); await cards.first().waitFor();
    assert.equal(await page.locator('.store-hero').count(), 0, '全部停用时首页不出现横幅');
    const railTop = await page.locator('.catalog-chip-rail').boundingBox();
    const mainTop = await page.locator('main').boundingBox();
    assert(railTop.y - mainTop.y < 120, '无横幅时分类紧接顶栏');
    heroSlides = undefined;
    // Long branding and a logged-in nickname must not push the desktop/tablet navigation offscreen.
    await page.evaluate(() => {
      localStorage.setItem('ka.m.access', 'layout-test-token');
      localStorage.setItem('ka.m.user', JSON.stringify({ email: 'layout@example.com', nickname: '超长会员名称用于验证导航布局' }));
      const branding = JSON.parse(localStorage.getItem('ka.site.branding') || '{}');
      localStorage.setItem('ka.site.branding', JSON.stringify({ ...branding, siteName: 'Ka Store with a very long store name' }));
    });
    siteName = 'Ka Store with a very long store name';
    await page.reload(); await cards.first().waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.locator('.store-header').evaluate(el => el.scrollWidth <= el.clientWidth), `${width}: member navigation fits`);
    }
    // 移动端:顶栏保持单行,文章/提货码/语言只在底部面板里,不常驻遮挡内容。
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileHeader = await page.locator('.store-header').boundingBox();
    assert(mobileHeader.height < 70, '移动端顶栏保持单行');
    assert.equal(await page.locator('.store-mobile-secondary').isVisible(), false, '辅助导航行不再常驻');
    const cardWidth = await cards.first().boundingBox();
    assert(cardWidth.width > 150 && cardWidth.width < 190, '手机双列紧凑卡片');
    await page.getByRole('button', { name: '更多入口' }).click();
    await page.getByRole('dialog').waitFor();
    assert(await page.getByRole('button', { name: '语言', exact: true }).isVisible(), '语言入口在底部面板内可用');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', '面板打开时锁定背景滚动');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Esc 关闭面板');
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.deepEqual(errors, []);
    console.log('PASS: 157 products, 40 categories, paging/back, sort, availability, 8 widths, both modes, compact cards/actions, 16:10 covers, carousel separation, aligned rows, navigation/action bounds, URL bounds, single/six-slide custom banners.');
    console.log('Screenshots:', output);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
