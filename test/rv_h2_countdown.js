'use strict';
/* H2: countdown hits 0 on the client a moment before the server flips to 'open' (client clock/SKEW estimate slightly ahead)
   -> refresh() gets phase 'before' -> applyPublic only calls headerFor() -> countdown frozen at 00:00:00, no retry */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const who of ['public', 'remembered']) {
    const t = R.H.backend(vn('2026-10-18', '06:00') - 4000);
    const page = await R.open(t, R.DESK, 'H2' + who, { noGoto: true });
    if (who === 'remembered') {
      /* make a remembered member: verify via API directly with the page's device id */
      await page.goto(R.server.url);
      await page.waitForSelector('.pg-closed');
      const dev = await page.evaluate(() => localStorage.getItem('lt_dev'));
      const f = t.env.ltDoPost_({ action: 'lt_find', q: 'duc nam', dev });
      const v = t.env.ltDoPost_({ action: 'lt_verify', id: f.results[0].id, pin: '0001', remember: true, dev });
      await page.evaluate(v => { localStorage.setItem('lt_tok', v.tok); localStorage.setItem('lt_tokExp', String(v.tokExp)); }, v);
      await page.reload();
    } else {
      await page.goto(R.server.url);
    }
    await page.waitForSelector('.pg-closed');
    /* server answers 'before' for the refresh fired at client-zero (server is ~1 s behind the client's estimate) */
    let n0 = t.calls.length;
    await page.waitForFunction(() => document.querySelector('#cdv') && document.querySelector('#cdv')._s === '00:00:00', null, { timeout: 15000 });
    for (let i = 0; i < 60 && t.calls.length === n0; i++) await R.sleep(100);   /* wait for the zero-refresh to be answered with 'before' */
    await R.sleep(1500);
    R.info(who + ': calls after countdown hit zero', t.calls.slice(n0));
    /* now the server is open */
    t.clock.now = vn('2026-10-18', '06:00') + 2000;
    n0 = t.calls.length;
    await R.sleep(12000);
    const st = await page.evaluate(() => ({ view: window.__lt.S.view, cd: document.querySelector('#cdv') && document.querySelector('#cdv')._s, h1: document.querySelector('h1') && document.querySelector('h1').textContent }));
    R.info(who + ': 12 s after server opened', { st, newCalls: t.calls.slice(n0) });
    R.ok('H2 ' + who + ': page leaves the closed screen once the server opens (retry after a "before" answer)', st.view !== 'closed', st);
    await R.shot(page, 'H2-' + who, 100);
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
