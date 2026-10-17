'use strict';
/* H4: an lt_boot response that was already in flight when the member tapped "Không phải bạn?" re-applies the previous member's state */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open(t, R.MOB, 'H4');
  await R.login(page, 'duc nam', '0001', false);
  await page.waitForSelector('.pg-book');
  await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
  await R.tap(page, '#ctaM');
  await page.waitForSelector('.pg-tk');
  /* reopen the app (remembered device -> ticket from cache instantly) with a slow network for lt_boot */
  t.delay = 1500;
  await page.reload();
  await page.waitForSelector('.pg-tk');
  await page.locator('[data-a="notyou"] >> visible=true').first().click();
  await page.waitForSelector('.pg-find');
  const mid = await page.evaluate(() => ({ view: window.__lt.S.view, st: !!window.__lt.S.st, tok: localStorage.getItem('lt_tok') }));
  R.info('right after "Không phải bạn?"', mid);
  await R.sleep(2500);
  const st = await page.evaluate(() => ({ view: window.__lt.S.view, who: window.__lt.S.st && window.__lt.S.st.me.short, tok: localStorage.getItem('lt_tok'), lsSt: !!localStorage.getItem('lt_st'), ssSt: !!sessionStorage.getItem('lt_st'), h1: document.querySelector('.page:last-child h1') && document.querySelector('.page:last-child h1').textContent }));
  R.info('after the in-flight lt_boot landed', st);
  R.ok('H4: after "Không phải bạn?" the previous member is not shown again', st.view === 'find' && !st.who, st);
  await R.shot(page, 'H4-after', 100);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
