'use strict';
/* H2c: phone unlocked at ~05:59:58 -> visibility refresh in flight (slow) -> countdown zero: refresh() dropped by S.refreshing
   -> the in-flight answer says 'before' -> frozen at 00:00:00 although the server opened 2 s later */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const open = vn('2026-10-18', '06:00');
  const t = R.H.backend(open - 5000);
  const page = await R.open2(t, R.MOB, 'H2c');
  await page.waitForSelector('.pg-closed');
  await R.sleep(1500);                                   /* client ~ 05:59:56.5 */
  t.clock.now = open - 2500;                              /* server answers 'before' for the visibility refresh */
  t.delayFor = b => (b.action === 'lt_boot' ? 3500 : 0);  /* slow mobile network on wake-up */
  await page.evaluate(() => { window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await R.sleep(500);
  t.clock.now = open + 1000;                              /* from here on the server is open */
  t.delayFor = null;
  await R.sleep(14000);
  const st = await page.evaluate(() => ({ view: window.__lt.S.view, cd: document.querySelector('#cdv') && document.querySelector('#cdv')._s }));
  R.info('15 s later', { st, calls: t.calls });
  R.ok('H2c: page opens after 06:00 even if a refresh was in flight at zero', st.view !== 'closed', st);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
