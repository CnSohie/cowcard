// Local UI checks; all APIs mocked, no real payments or reviews.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1400,height:1000}});
 page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('ka.access','test');localStorage.setItem('ka.m.access','test');localStorage.setItem('ka.auth','["*"]');localStorage.setItem('ka.currency','USD');});
 const row={id:1,memberId:2,memberEmail:'buyer@example.com',amount:'100.00',feeAmount:'3.50',netAmount:'96.50',payoutAmount:'13.402777',payoutCurrency:'USDT',payoutFxRate:'7.20000000',channel:'USDT_BEP20',account:'0x1111111111111111111111111111111111111111',status:'PENDING',createdAt:'2026-09-29T12:00:00'};
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;let data={};
  if(path==='/api/admin/withdrawals')data={page:{items:[row,{...row,id:2,channel:'BANK',payoutAmount:'96.50',payoutCurrency:'CNY',payoutFxRate:null,account:'4532015112830366',accountName:'测试用户',bankName:'测试银行'}],total:2,size:15,page:0},pendingCount:2};
  else if(path==='/api/auth/totp/status')data={enabled:true,trusted:true};
  else if(path==='/api/member/me')data={member:{email:'buyer@example.com',nickname:'测试用户'},balance:'100',frozen:'0'};
  else if(path==='/api/member/wallet')data={balance:'100',frozen:'0',minWithdraw:'10',commissionRate:'0',withdrawMethods:[]};
  else if(path==='/api/member/wallet/withdrawals')data={items:[{...row,status:'REJECTED',reviewNote:'收款网络填写错误。\n请使用 BSC（BEP20）地址重新申请。',reviewedAt:'2026-09-29T13:00:00'}],total:1,size:20,page:0};
  else if(path.includes('categories'))data=[];
  return route.fulfill({json:{code:0,data}});
 });
 await page.goto(base+'/admin/withdrawals');
 await page.getByText('13.402777 USDT',{exact:true}).waitFor();
 assert((await page.locator('main').innerText()).includes('¥96.50 人民币'));
 await page.waitForTimeout(600);
 await page.screenshot({path:'/tmp/ka-withdraw-list.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/ka-withdraw-admin-mobile.png',fullPage:true});
 await page.setViewportSize({width:1400,height:1000});
 await page.getByRole('button',{name:'通过',exact:true}).first().click();
 await page.getByText('通过提现申请',{exact:true}).waitFor();
 assert.equal(await page.getByText('13.402777 USDT',{exact:true}).count(),2);
 await page.screenshot({path:'/tmp/ka-withdraw-admin.png',fullPage:true});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'驳回',exact:true}).first().click();
 await page.getByRole('button',{name:'确认驳回并解冻退回',exact:true}).click();
 await page.getByText('请填写具体的驳回原因，会员将看到此说明',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/me?tab=withdrawals');
 await page.locator('[role=note]').waitFor();
 assert((await page.locator('[role=note]').innerText()).includes('¥100.00 人民币已全部退回余额'));
 assert((await page.locator('[role=note]').innerText()).includes('请使用 BSC（BEP20）地址重新申请。'));
 const box=await page.locator('[role=note]').boundingBox();assert(box.x+box.width<=391);
 await page.locator('[role=note]').scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/ka-withdraw-member.png',fullPage:false});
 for(const theme of ['mint','ocean','violet'])for(const mode of ['light','dark']) { await page.evaluate(({theme,mode})=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.mode=mode},{theme,mode}); assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
 const rejectedRows = [1,2,3].map(id=>({...row,id,status:'REJECTED',reviewNote:'收款账户信息不完整，请核对账户及网络后重新申请。\n'+(id===2?'补充说明：'.repeat(35):'手续费未收取。')}));
 await page.route('**/api/member/wallet/withdrawals*',route=>route.fulfill({json:{code:0,data:{items:rejectedRows,total:3,page:0,size:20}}}));
 await page.route('**/api/admin/withdrawals*',route=>route.fulfill({json:{code:0,data:{page:{items:rejectedRows,total:3,page:0,size:15},pendingCount:0}}}));
 for(const url of ['/me?tab=withdrawals','/admin/withdrawals']) {
  await page.goto(base+url);
  await page.getByText('拒绝原因',{exact:true}).first().waitFor();
  for(const width of [360,390,768,1400]) for(const mode of ['light','dark']) {
   await page.setViewportSize({width,height:900});
   await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;document.documentElement.dataset.theme='mint'},mode);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),url+' '+width+' '+mode+' overflow');
   assert.equal(await page.locator('main [class*="bg-red"]').count(),0,'no red rejection boxes');
   for(const el of await page.getByText('¥100.00 人民币',{exact:true}).all()) {
    assert.equal(await el.evaluate(e=>getComputedStyle(e).fontSize),'14px');
    assert.equal(await el.evaluate(e=>getComputedStyle(e).fontWeight),'400');
   }
   if(width===390 || width===1400) await page.screenshot({path:'/tmp/ka-final-'+(url.startsWith('/me')?'member':'admin')+'-'+width+'-'+mode+'.png',fullPage:true,animations:'disabled'});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: payout currencies, approval amount, required rejection reason, mobile refund notice');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
