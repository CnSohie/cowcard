const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let delay = 700, fail = false, requests = 0;
    await page.addInitScript(() => {
      localStorage.setItem('ka.order.history', JSON.stringify([
        { orderNo: 'DEMO1', productName: '数字会员月卡', contact: 'demo@example.com', amount: '29.90', createdAt: new Date().toISOString(), queryToken: 'demo-token' },
        { orderNo: 'DEMO2', productName: '云存储兑换码', contact: 'demo@example.com', amount: '19.00', createdAt: new Date().toISOString() }
      ]));
    });
    await page.route('**/api/**', async route => {
      if (new URL(route.request().url()).pathname === '/api/orders/query') {
        requests++; await new Promise(resolve => setTimeout(resolve, delay));
        const { orderNo } = route.request().postDataJSON();
        return route.fulfill({ json: fail ? { code: 3001 } : { code: 0, data: {
          orderNo, productName: orderNo === 'DEMO1' ? '数字会员月卡' : '云存储兑换码', quantity: 1,
          amount: '29.90', status: 'DELIVERED', deliveryMode: 'AUTO_CARD', cards: ['DEMO-CODE-1234'], createdAt: new Date().toISOString(),
        } } });
      }
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
    console.log('PASS: immediate loading, visible result, Esc/focus restore, late response stays closed, error/retry, missing credentials form, no stale order.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
