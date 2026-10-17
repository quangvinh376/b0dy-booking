'use strict';
/* H2b: the refresh fired at 00:00:00 fails (network error / he_thong_ban under the 06:00 spike) -> no retry, frozen at 00:00:00 */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const mode of ['net', 'busy']) {
    const t = R.H.backend(vn('2026-10-18', '06:00') - 4000);
    const page = await R.open(t, R.MOB, 'H2b' + mode);
    await page.waitForSelector('.pg-closed');
    await R.sleep(500);
    const n0 = t.calls.length;
    t.clock.now = vn('2026-10-18', '06:00') + 1000;   /* server is open on time */
    let first = true;
    t.fail = b => { if (b.action === 'lt_boot' && first) { first = false; return mode === 'net' ? 'net' : null; } return null; };
    if (mode === 'busy') { const orig = t.env.ltDoPost_; let once = true; t.env.ltDoPost_ = b => { if (b.action === 'lt_boot' && once) { once = false; return { ok: false, error: 'he_thong_ban', now: t.clock.now }; } return orig(b); }; }
    await R.sleep(20000);
    const st = await page.evaluate(() => ({ view: window.__lt.S.view, cd: document.querySelector('#cdv') && document.querySelector('#cdv')._s, sig: document.querySelector('#sigM').textContent }));
    R.info(mode + ': 20 s after 06:00', { st, calls: t.calls.slice(n0) });
    R.ok('H2b ' + mode + ': a failed zero-refresh is retried and the page opens', st.view !== 'closed', st);
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
