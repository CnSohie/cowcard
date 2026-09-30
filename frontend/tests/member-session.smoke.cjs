// Session recovery regression. Uses only intercepted APIs; no real orders/payments.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    let mode = 'success', refreshes = 0, attempts = 0, debits = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/member/auth/refresh') {
        refreshes++;
        if (mode === 'offline') return route.abort('failed');
        if (mode === 'server') return route.fulfill({ status: 503, json: { code: 500 } });
        if (mode === 'invalid') return route.fulfill({ json: { code: 1004, message: '刷新令牌无效' } });
        await new Promise(resolve => setTimeout(resolve, 40));
        return route.fulfill({ json: { code: 0, data: { accessToken: 'fresh', refreshToken: 'refresh-fresh' } } });
      }
      if (path === '/api/pay/create' || path === '/api/orders') {
        attempts++;
        if (mode === 'forbidden' || mode === 'guest') return route.fulfill({ json: { code: mode === 'forbidden' ? 403 : 3002, message: '订单不可使用当前余额支付' } });
        if (route.request().headers().authorization !== 'Bearer fresh') {
          // Delay one stale response until after the first request has refreshed.
          if (mode === 'concurrent' && attempts === 2) await new Promise(resolve => setTimeout(resolve, 180));
          return route.fulfill({ status: 401, json: { code: 401 } });
        }
        debits++;
        return route.fulfill({ json: { code: 0, data: { kind: 'BALANCE' } } });
      }
      return route.fulfill({ json: { code: 0, data: path === '/api/store/site' ? { siteName: 'Ka', theme: 'mint', mode: 'light' } : [] } });
    });
    await page.goto(base);
    const seed = () => page.evaluate(async () => {
      const api = await import('/src/lib/memberApi.ts');
      api.setMemberTokens('expired', 'refresh-old');
      api.saveMemberInfo({ id: 7, nickname: 'Buyer', email: 'buyer@example.com', inviteCode: 'test' });
    });
    const pay = (count = 1) => page.evaluate(async count => {
      const { mPost } = await import('/src/lib/memberApi.ts');
      return Promise.all(Array.from({ length: count }, () => mPost('/pay/create', { channelCode: 'BALANCE', orderNo: 'TEST' }).then(() => 0).catch(e => e.code)));
    }, count);
    await seed();
    assert.deepEqual(await pay(), [0]);
    assert.equal(refreshes, 1); assert.equal(debits, 1);
    for (const failure of ['offline', 'server', 'forbidden', 'guest']) {
      mode = failure; await seed(); const before = debits;
      assert.notEqual((await pay())[0], 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('ka.m.access')), 'expired', `${failure} preserves session`);
      assert.equal(debits, before, `${failure} never debits`);
    }
    mode = 'concurrent'; refreshes = 0; attempts = 0; await seed();
    assert.deepEqual(await pay(2), [0, 0]); assert.equal(refreshes, 1, 'late stale response reuses new token');
    mode = 'invalid'; await seed(); assert.deepEqual(await pay(), [401]);
    assert.equal(await page.evaluate(() => localStorage.getItem('ka.m.access')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('ka.m.user')), null);
    console.log('PASS: access expiry recovery, transient errors preserve session, ownership errors preserve session, concurrent recovery, revoked refresh clears session.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
