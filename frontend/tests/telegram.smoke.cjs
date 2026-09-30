// All API responses are fixtures. No real Telegram messages, orders or payments.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4178';
const output = mkdtempSync(join(tmpdir(), 'ka-telegram-'));
const ticket = 'a'.repeat(43);
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let exchanges = 0;
    let queries = 0;
    let expired = false;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === '/api/store/site') data = { siteName: 'Ka Store', currency: 'CNY', theme: 'mint', mode: 'light', captchaEnabled: '0' };
      else if (path === '/api/telegram/ticket') {
        exchanges++;
        assert.equal(route.request().method(), 'POST');
        assert.equal(route.request().postDataJSON().ticket, ticket);
        if (expired) return route.fulfill({ json: { code: 400, message: '链接已使用或过期，请在 Bot 中重新查看订单获取新链接。' } });
        data = { orderNo: 'TGTEST', contact: 'tg@example.com', productName: '测试卡密', amount: '7.20', createdAt: new Date().toISOString(), queryToken: 'private-query-token' };
      } else if (path === '/api/orders/query') {
        queries++;
        assert.equal(route.request().postDataJSON().queryToken, 'private-query-token');
        data = { orderNo: 'TGTEST', contact: 'tg@example.com', productName: '测试卡密', amount: '7.20', quantity: 1, status: 'DELIVERED', deliveryMode: 'AUTO_CARD', createdAt: new Date().toISOString(), cards: ['TEST-CARD-ONLY'], usageNote: '测试领取' };
      }
      await route.fulfill({ json: { code: 0, data } });
    });
    await page.goto(base + '/tg/order#' + ticket);
    await page.getByRole('button', { name: '安全查看订单' }).waitFor();
    assert.equal(new URL(page.url()).hash, '', 'ticket cleared from URL');
    assert.equal(exchanges, 0, 'rendering/link preview does not consume ticket');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['light', 'dark']) {
        await page.evaluate(mode => { document.documentElement.dataset.mode = mode; }, mode);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${mode}: overflow`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(output, 'telegram-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: '安全查看订单' }).click();
    await page.waitForURL('**/order');
    await page.getByText('TEST-CARD-ONLY', { exact: true }).waitFor();
    assert.equal(exchanges, 1, 'single exchange');
    assert.equal(queries, 1, 'order loaded using verified credential');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ka.order.history')));
    assert.equal(saved[0].orderNo, 'TGTEST');
    assert.equal(saved[0].queryToken, 'private-query-token');
    assert(!page.url().includes('private-query-token'));
    expired = true;
    await page.goto(base + '/tg/order#' + ticket);
    await page.getByRole('button', { name: '安全查看订单' }).click();
    await page.getByRole('alert').filter({ hasText: '链接已使用或过期' }).waitFor();
    await page.goto(base + '/tg/order');
    await page.getByRole('alert').filter({ hasText: '缺少有效凭证' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '安全查看订单' }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('Telegram browser smoke passed. Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
