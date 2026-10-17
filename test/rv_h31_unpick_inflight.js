'use strict';
/* H31: × (unpick) is not blocked while sending; after a network failure "Gửi lại" resends the ORIGINAL picks (incl. the removed one) */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.DESK, 'H31');
  await R.login(page, 'duc nam', '0001', true);
  await page.waitForSelector('.pg-book');
  for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await R.cell(page, d, h);
  t.fail = b => (b.action === 'lt_book' ? 'net' : null);
  t.delayFor = b => (b.action === 'lt_book' ? 1500 : 0);
  await R.tap(page, '#cta');
  await R.sleep(300);
  /* member tries to remove Fri while "Đang gửi…": × is disabled during sending (pointer-events none), so the click lands right
     after the failure. Picks then differ from the failed request → CTA is a NEW request ("Đặt lịch 2 buổi"), not "Gửi lại". */
  await page.locator('#pkList [data-a="unpick"][data-d="2026-10-23"]').click();
  await page.waitForFunction(() => !document.body.classList.contains('is-sending') && !document.querySelector('#cta').disabled &&
    window.__lt.S.picks.length === 2 && !!window.__lt.S.pending);
  await R.sleep(600);   /* CTA đổi chữ bằng cross-fade */
  const cta = await page.evaluate(() => document.querySelector('#cta').textContent.trim());
  R.ok('H31: after removing a pick the CTA is a new booking, not "Gửi lại"', /Đặt lịch 2 buổi/.test(cta) && !/Gửi lại/.test(cta), cta);
  const ui = await page.evaluate(() => ({ picks: window.__lt.S.picks.map(p => p.date.slice(8) + '@' + p.h), pend: window.__lt.S.pending.body.picks.map(p => p.date.slice(8) + '@' + p.h), mb: document.querySelector('.grp-h .v').textContent }));
  R.info('UI vs pending after failure', ui);
  t.fail = null; t.delayFor = null;
  await R.tap(page, '#cta');
  await page.waitForSelector('.pg-tk'); await R.sleep(500);
  const rows = t.rows().filter(r => r[16] === 'B901DY' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6]);
  R.info('booked', rows);
  R.ok('H31: the slot removed before "Gửi lại" is not booked', rows.length === 2 && !rows.some(r => /2026-10-23/.test(r)), rows);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
