'use strict';
/* seeded monkey: random taps on [data-a] / grid cells / back / resize / failures / clock jumps; collect pageerrors */
const R = require('./rv_common');
const { vn } = R.H;
let seed = +(process.argv[2] || 7);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
(async () => {
  await R.start();
  const errs = [];
  for (let run = 0; run < 4; run++) {
    const t = R.H.backend(vn('2026-10-18', '20:15'));
    t.fill([['Một', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]], ['Hai', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]], ['Ba', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]]]);
    const page = await R.open2(t, run % 2 ? R.MOB : R.DESK, 'mk' + run);
    page.on('pageerror', e => errs.push('run' + run + ': ' + e.message + ' @' + (e.stack || '').split('\n')[1]));
    await R.login(page, run < 2 ? 'duc nam' : 'khai linh', run < 2 ? '0001' : '0002', run % 2 === 0);
    await page.waitForSelector('.pg-book');
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'], hs = [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20];
    for (let i = 0; i < 140; i++) {
      const r = rnd();
      try {
        t.fail = rnd() < 0.15 ? (b => (b.action === 'lt_book' || b.action === 'lt_change') ? (rnd() < 0.5 ? 'net' : 'net-after') : null) : null;
        t.delayFor = rnd() < 0.2 ? (() => Math.floor(rnd() * 900)) : null;
        if (r < 0.45) { await page.evaluate(([d, h]) => { const c = document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]'); if (c) c.click(); }, [days[Math.floor(rnd() * 6)], hs[Math.floor(rnd() * 13)]]); }
        else if (r < 0.8) { const n = await page.evaluate(() => Array.from(document.querySelectorAll('[data-a]')).filter(e => e.offsetParent && !e.disabled && !/notyou|png|ics|remind/.test(e.dataset.a)).length); if (n) await page.evaluate(k => { const els = Array.from(document.querySelectorAll('[data-a]')).filter(e => e.offsetParent && !e.disabled && !/notyou|png|ics|remind/.test(e.dataset.a)); els[k % els.length].click(); }, Math.floor(rnd() * 100)); }
        else if (r < 0.86) { await page.goBack().catch(() => {}); await R.sleep(150); if (!(await page.evaluate(() => !!window.__lt).catch(() => false))) { await page.goForward().catch(() => {}); await R.sleep(300); if (!(await page.evaluate(() => !!window.__lt).catch(() => false))) { await page.goto(R.server.url); await R.sleep(500); } } }
        else if (r < 0.9) await page.keyboard.press(['Escape', 'ArrowDown', 'ArrowRight', 'Enter', 'Tab'][Math.floor(rnd() * 5)]);
        else if (r < 0.94) await page.setViewportSize(rnd() < 0.5 ? { width: 1280, height: 800 } : { width: 390, height: 760 });
        else if (r < 0.97) { t.clock.now += Math.floor(rnd() * 2 * 864e5); await page.evaluate(() => { if (!window.__lt) return; window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); }); }
        else await page.evaluate(() => window.dispatchEvent(new Event('online')));
      } catch (e) { errs.push('driver: ' + String(e).slice(0, 160)); }
      await R.sleep(30 + Math.floor(rnd() * 250));
    }
    await R.sleep(1500);
    const st = await page.evaluate(() => ({ view: window.__lt && window.__lt.S.view, pages: document.querySelectorAll('#main > .page').length }));
    R.info('run ' + run + ' end', st);
    await page._ctx.close();
  }
  R.info('pageerrors', errs.length ? errs : 'none');
  R.ok('monkey: no page errors', errs.filter(e => !/^driver/.test(e)).length === 0, errs);
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
