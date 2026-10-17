'use strict';
/* H3: ctaSet() compares against the DOM text (old label) while a fadeSwap is still pending -> a quick pick+unpick leaves the CTA showing the stale label */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const [k, o] of [['d', R.DESK], ['m', R.MOB]]) {
    const desk = k === 'd';
    const t = R.H.backend(vn('2026-10-18', '20:15'));
    const page = await R.open(t, o, 'H3' + k);
    await R.login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
    await R.sleep(600);
    const sel = desk ? '#cta' : '#ctaM';
    const before = (await page.textContent(sel)).trim();
    /* third pick and un-pick ~60 ms apart (double tap) */
    await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-23"][data-h="19"]'); c.click(); setTimeout(() => c.click(), 60); });
    await R.sleep(800);
    const after = (await page.textContent(sel)).trim(), n = await page.evaluate(() => window.__lt.S.picks.length);
    R.info(k + ' CTA', { before, after, picks: n });
    R.ok('H3 ' + k + ': CTA label matches picks after quick pick+unpick (expect "Đặt lịch 2 buổi")', after === 'Đặt lịch 2 buổi' && n === 2, { after, n });
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
