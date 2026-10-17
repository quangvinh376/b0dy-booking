'use strict';
/* H5: lt_boot sent just before lt_book, answered after it (pre-write state) -> overwrites S.st/lt_st and bounces the member from the new ticket back to the empty booking grid */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.MOB, 'H5', { init: () => { const f = window.fetch; window.__fl = []; window.fetch = function (u, o) { const b = o && o.body && JSON.parse(o.body); const t0 = Date.now(); return f.apply(this, arguments).then(r => { r.clone().json().then(j => window.__fl.push({ a: b && b.action, t0: t0 % 100000, t1: Date.now() % 100000, mode: j.mode, ok: j.ok, auth: j.auth, view: window.__lt && window.__lt.S.view })); return r; }, e => { window.__fl.push({ a: b && b.action, err: String(e) }); throw e; }); }; } });
  await R.login(page, 'duc nam', '0001', false);
  await page.waitForSelector('.pg-book');
  await R.cell(page, '2026-10-19', 18); await R.cell(page, '2026-10-21', 18);
  t.delayFor = b => (b.action === 'lt_boot' ? 2000 : 150);
  /* periodic / visibility refresh fires, then the member taps "Đặt lịch" a moment later */
  await page.evaluate(() => { window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await R.sleep(100);
  await R.tap(page, '#ctaM');
  await page.waitForSelector('.pg-tk');
  R.info('after write', await page.evaluate(() => ({ view: window.__lt.S.view, n: window.__lt.S.st.mine.sessions.length, refreshing: window.__lt.S.refreshing }))); R.info('calls', t.calls); R.info('timeline', t.tl);
  await page.waitForFunction(() => window.__fl.some(x => x.a === 'lt_boot' && x.t0 > 0 && window.__fl.indexOf(x) > 1)); await R.sleep(600);
  const st = await page.evaluate(() => ({ view: window.__lt.S.view, sessions: window.__lt.S.st.mine.sessions.length, mode: window.__lt.S.st.mode, cached: JSON.parse(localStorage.getItem('lt_st')).st.mine.sessions.length }));
  R.info('after the stale lt_boot landed', st); R.info('timeline2', t.tl.slice(-4)); R.info('page fetch log', await page.evaluate(() => window.__fl.slice(-3)));
  R.ok('H5: stale pre-write lt_boot does not undo the shown booking', st.view === 'ticket' && st.sessions === 2 && st.cached === 2, st);
  await R.shot(page, 'H5-after', 300);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
