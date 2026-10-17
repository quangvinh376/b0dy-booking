'use strict';
/* H6: lt_book written by the server but response lost (or timed out); member edits the selection before the 4 s re-check
   -> pending + rid discarded -> new rid -> server treats the 2nd request as an "add" -> member ends up with 4 sessions */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const [k, o] of [['d', R.DESK], ['m', R.MOB]]) {
    const desk = k === 'd';
    const t = R.H.backend(vn('2026-10-18', '20:15'));
    const page = await R.open2(t, o, 'H6' + k);
    await R.login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
    t.fail = b => (b.action === 'lt_book' ? 'net-after' : null);
    await R.tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForFunction(() => { const b = document.querySelector(window.innerWidth >= 960 ? '#cta' : '#ctaM'); return b && /Gửi lại/.test(b.textContent); });
    t.fail = null;
    R.info(k + ' rows after lost response', t.rows().filter(r => r[16] === 'B901DY').map(r => r[4] + ' ' + r[6]));
    /* member changes their mind within a couple of seconds: Tue + Thu instead of Mon + Wed */
    await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
    await R.cell(page, '2026-10-20', 18); await R.cell(page, '2026-10-22', 18);
    await R.tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk');
    await R.sleep(800);
    const rows = t.rows().filter(r => r[16] === 'B901DY' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6]);
    const h1 = await page.textContent('.pg-tk h1');
    R.info(k + ' final', { rows, h1, rids: [...new Set(t.rows().filter(r => r[16] === 'B901DY').map(r => r[15]))].length });
    R.ok('H6 ' + k + ': changing the selection after an unknown-outcome send does not leave the member with both selections booked', rows.length === 2, rows);
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
