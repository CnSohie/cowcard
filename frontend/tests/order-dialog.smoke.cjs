const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let delay = 700, fail = false, requests = 0, longContent = false, manualDelivery = false;
    const secret = ('DEMO-LONG-UNBROKEN-CODE-'.repeat(120) + '\n').repeat(30);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('ka.order.history', JSON.stringify([
        { orderNo: 'DEMO1', productName: '数字会员月卡', contact: 'demo@example.com', amount: '29.90', createdAt: new Date().toISOString(), queryToken: 'demo-token' },
        { orderNo: 'DEMO2', productName: '云存储兑换码', contact: 'demo@example.com', amount: '19.00', createdAt: new Date().toISOString() }
      ]));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.__copiedSecret = value; } } });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (['/api/orders/query', '/api/orders/query-by-token'].includes(path)) {
        requests++; await new Promise(resolve => setTimeout(resolve, delay));
        const { orderNo, queryToken, contact } = route.request().postDataJSON();
        if (path.endsWith('query-by-token')) assert.equal(queryToken, 'demo-token');
        else assert.equal(contact, 'demo@example.com');
        return route.fulfill({ json: fail ? { code: 503 } : { code: 0, data: {
          orderNo: longContent ? 'ORDER-' + '1234567890'.repeat(8) : orderNo,
          productName: longContent ? '超长商品名称与多地区数字服务'.repeat(8) : orderNo === 'DEMO1' ? '数字会员月卡' : '云存储兑换码', quantity: 1,
          amount: '29.90', status: 'DELIVERED', deliveryMode: manualDelivery ? 'MANUAL' : 'AUTO_CARD',
          cards: manualDelivery ? [] : [longContent ? secret : 'DEMO-CODE-1234'],
          deliveryContent: manualDelivery ? secret : null,
          usageNote: longContent ? 'https://example.test/' + 'long-path-without-spaces/'.repeat(150) : null,
          createdAt: new Date().toISOString(),
        } } });
      }
      if (path === '/api/store/availability') return route.fulfill({ json: { code: 0, data: { state: 'OPEN' } } });
      return route.fulfill({ json: { code: 0, data: { siteName: 'Ka Store', theme: 'mint', mode: 'light', captchaEnabled: '0' } } });
    });
    await page.goto(base + '/order');
    const trigger = page.getByRole('button', { name: '查询 数字会员月卡 DEMO1', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('status').waitFor();
    assert.equal(await dialog.locator('[data-order-result]').count(), 0, 'no stale result while loading');
    await page.screenshot({ path: '/tmp/ka-order-query-loading.png' });
    await dialog.getByRole('heading', { name: '数字会员月卡 × 1' }).waitFor();
    const bounds = await dialog.boundingBox();
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 844, 'result inside viewport');
    await page.screenshot({ path: '/tmp/ka-order-query-result.png' });
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert(await trigger.evaluate(el => document.activeElement === el), 'focus returns to selected order');
    await trigger.click(); await dialog.getByRole('status').waitFor();
    await dialog.getByRole('button', { name: '关闭订单详情' }).click();
    await page.waitForTimeout(850);
    assert.equal(await dialog.count(), 0, 'late response must not reopen dialog');
    fail = true; await trigger.click(); await dialog.getByRole('alert').waitFor();
    fail = false; delay = 20; await dialog.getByRole('button', { name: '重新查询' }).click();
    await dialog.getByRole('heading', { name: '数字会员月卡 × 1' }).waitFor();
    await page.keyboard.press('Escape');
    const before = requests;
    await page.getByRole('button', { name: '查询 云存储兑换码 DEMO2', exact: true }).click();
    await dialog.getByRole('textbox', { name: '订单号', exact: true }).waitFor();
    assert.equal(requests, before, 'missing credentials opens form in the dialog');
    await dialog.getByRole('button', { name: '查询订单', exact: true }).click();
    await dialog.getByRole('heading', { name: '云存储兑换码 × 1' }).waitFor();
    assert.equal(await dialog.getByText('数字会员月卡 × 1').count(), 0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: '/tmp/ka-order-query-desktop.png' });
    await page.keyboard.press('Escape');
    longContent = true;
    for (const manual of [false, true]) {
      manualDelivery = manual;
      await trigger.click();
      await dialog.locator('[data-order-result]').waitFor();
      assert.equal(await dialog.locator('pre').textContent(), secret, 'delivery keeps its original complete content');
      await dialog.getByRole('button', { name: '复制完整内容', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__copiedSecret), secret, 'copy is not truncated');
      for (const size of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
        { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        for (const theme of ['mint', 'ocean', 'violet', 'cow']) for (const mode of ['light', 'dark']) {
          await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; }, { theme, mode });
          const box = await dialog.boundingBox();
          assert(box.x >= 19 && box.x + box.width <= size.width - 19, 'symmetric phone gutters and bounded desktop width');
          assert(Math.abs(box.x - (size.width - box.width) / 2) < 1, 'dialog stays horizontally centered');
          assert(box.y >= 0 && box.y + box.height <= size.height, 'dialog fits short/landscape viewport');
          assert(box.width <= 576, 'desktop detail is not oversized');
          assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'dialog has no horizontal overflow');
          assert(await dialog.locator('.order-query-dialog-body').evaluate(el => el.scrollWidth <= el.clientWidth), 'long title, number and instructions wrap');
          assert(await dialog.locator('pre').evaluate(el => el.scrollWidth <= el.clientWidth), 'unbroken secrets wrap');
          assert(await dialog.locator('.order-query-dialog-body').evaluate(el => el.scrollHeight > el.clientHeight), 'long details scroll internally');
          const close = await dialog.getByRole('button', { name: '关闭订单详情' }).boundingBox();
          assert(close.y >= box.y && close.y + close.height <= box.y + box.height, 'close button remains reachable');
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'mint'; document.documentElement.dataset.mode = 'light'; });
      await page.screenshot({ path: `/tmp/ka-order-query-long-${manual ? 'manual' : 'cards'}.png` });
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: loading, focus/Esc, late response, retry, credentials, full-content copy, long cards/manual delivery, 7 viewports × 8 theme combinations, bounded scrolling and reachable close button.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
