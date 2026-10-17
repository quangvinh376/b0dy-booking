'use strict';
/* H1: "Xong" (ticket -> ticket) runs tkFit/tkPaper/animateTicket against the LEAVING page (document.querySelector finds the old page first) */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const [k, o] of [['d', Object.assign({}, R.DESK, { viewport: { width: 1100, height: 700 } })], ['m', R.MOB]]) {
    const desk = k === 'd';
    const t = R.H.backend(vn('2026-10-18', '20:15'));
    const page = await R.open(t, o, 'H1' + k);
    await R.login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18]]) await R.cell(page, d, h);
    await R.tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk');
    await R.sleep(1200);
    const before = await page.evaluate(() => {
      const pg = document.querySelectorAll('.pg-tk'); const p = pg[pg.length - 1];
      return { pages: pg.length, pathW: !!p.querySelector('#tkPaperW path'), pathT: !!p.querySelector('#tkPaperT path'), tks: p.querySelector('#tkfit').style.getPropertyValue('--tks') };
    });
    R.info(k + ' booked ticket (first render)', before);
    await R.tap(page, '[data-a="tkdone"]');
    await R.sleep(1500);
    const after = await page.evaluate(() => {
      const pg = document.querySelectorAll('.pg-tk'); const p = pg[pg.length - 1];
      return { pages: pg.length, title: p.querySelector('h1').textContent, pathW: !!p.querySelector('#tkPaperW path'), pathT: !!p.querySelector('#tkPaperT path'), tks: p.querySelector('#tkfit').style.getPropertyValue('--tks') };
    });
    R.info(k + ' home ticket after "Xong"', after);
    if (desk) {
      R.ok('H1 d: home ticket after Xong has paper path (#tkPaperW path)', after.pathW, after);
      R.ok('H1 d: home ticket after Xong has --tks fit scale set', after.tks !== '', after);
    } else {
      R.ok('H1 m: home ticket after Xong has paper path (#tkPaperT path)', after.pathT, after);
    }
    console.log('  shot', await R.shot(page, 'H1-after-xong-' + k, 200));
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
