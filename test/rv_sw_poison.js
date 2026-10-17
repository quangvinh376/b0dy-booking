'use strict';
/* SW: any in-scope 200 navigation is cached as the app shell ('./') */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const ctx = await R.browser.newContext(R.MOB);
  const page = await ctx.newPage();
  await R.attach2(page, t);
  await page.goto(R.server.url);
  await page.waitForSelector('#q');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.goto(R.server.url + 'test/b0b_demo.html');
  await R.sleep(800);
  const cached = await page.evaluate(async () => { const r = await caches.match('/'); const tx = r ? await r.text() : ''; return { title: (tx.match(/<title>([^<]*)/) || [])[1] }; });
  R.info('cached shell after visiting /test/b0b_demo.html', cached);
  await ctx.setOffline(true);
  await page.goto(R.server.url).catch(e => R.info('goto offline err', String(e).slice(0, 120)));
  await R.sleep(800);
  const title = await page.title();
  R.info('offline open of / serves', title);
  R.ok('SW: offline shell is still the booking app after visiting another in-scope page', /Đặt lịch tập/.test(title), title);
  await ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
