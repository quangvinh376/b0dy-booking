'use strict';
/* H30: ticket hides "Thêm buổi" (and says the week is over) when no session is upcoming, although the server still allows adds */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.MOB, 'H30');
  await R.login(page, 'duc nam', '0001', false);
  await page.waitForSelector('.pg-book');
  await R.cell(page, '2026-10-19', 6); await R.cell(page, '2026-10-20', 6);
  await R.tap(page, '#ctaM'); await page.waitForSelector('.pg-tk');
  t.clock.now = vn('2026-10-21', '08:30');   /* Wed: Mon/Tue sessions are past; Thu..Sat still bookable with 24 h lead */
  await page.reload();
  await page.waitForSelector('.pg-tk'); await R.sleep(1200);
  const st = await page.evaluate(() => ({ add: window.__lt.S.st.limits.add, mode: window.__lt.S.st.mode, sub: document.querySelector('.pg-tk .sub').textContent, hasAdd: !!document.querySelector('#mbar [data-a="goadd"]') }));
  R.info('Wed 08:30 ticket', st);
  R.ok('H30: server allows adds (limits.add > 0) -> ticket offers "Thêm buổi"', !(st.add > 0) || st.hasAdd, st);
  await R.shot(page, 'H30', 200);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
