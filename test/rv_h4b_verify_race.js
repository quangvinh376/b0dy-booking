'use strict';
/* H4b: a public lt_boot (no token) answered AFTER a successful lt_verify signs the member straight out again */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.MOB, 'H4b');
  await page.waitForSelector('#q');
  await page.fill('#q', 'duc nam');
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await page.waitForSelector('#pin');
  /* member switches to another app and back (>45 s since last fetch) -> refresh(true) without token; mobile network slow for that call */
  t.delayFor = b => (b.action === 'lt_boot' ? 2500 : 200);
  await page.evaluate(() => { window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await page.click('#pin');
  await page.keyboard.type('0001');
  await R.tap(page, '#vgoM');
  await page.waitForSelector('.pg-book');
  R.info('after verify', await page.evaluate(() => ({ view: window.__lt.S.view, tok: !!localStorage.getItem('lt_tok') })));
  await R.sleep(3500);
  const st = await page.evaluate(() => ({ view: window.__lt.S.view, st: !!window.__lt.S.st, tok: !!localStorage.getItem('lt_tok') }));
  R.info('after the stale public lt_boot landed', st);
  R.ok('H4b: member stays signed in after a stale public lt_boot response', st.view === 'book' && st.st && st.tok, st);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
