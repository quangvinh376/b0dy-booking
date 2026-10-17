'use strict';
/* H1b: book -> book animated transition (tuan_doi / week rollover) paints the LEAVING grid; the new grid stays unpainted */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const [k, o, how] of [['d', R.DESK, 'tuan_doi'], ['d', R.DESK, 'rollover']]) {
    const desk = k === 'd';
    const t = R.H.backend(vn('2026-10-18', '20:15'));   /* CN 18.10 20:15 -> W43 open */
    const page = await R.open(t, o, 'H1b' + how);
    await R.login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
    /* a week later: CN 25.10 07:00 -> W44 open */
    t.clock.now = vn('2026-10-25', '07:00');
    if (how === 'tuan_doi') await R.tap(page, '#cta');
    else await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__lt.S.st && window.__lt.S.st.week.key === '2026-W44');
    await R.sleep(1500);
    const st = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#wkb .c'));
      return { pages: document.querySelectorAll('.pg-book').length, week: window.__lt.S.st.week.key, firstDay: cells[0] && cells[0].dataset.d,
        unpainted: cells.filter(c => c.className === 'c').length, total: cells.length, ariaLabelled: cells.filter(c => c.hasAttribute('aria-label')).length,
        tabbable: cells.filter(c => c.tabIndex === 0).length };
    });
    R.info(how + ' state 1.5 s after week change', st);
    R.ok('H1b ' + how + ': new-week grid cells are painted (state classes + aria-label)', st.unpainted === 0 && st.ariaLabelled === st.total, st);
    console.log('  shot', await R.shot(page, 'H1b-' + how, 100));
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
