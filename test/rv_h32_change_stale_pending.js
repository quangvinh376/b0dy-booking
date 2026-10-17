'use strict';
/* H32: Back during an in-flight change keeps S.pending; after the failure, a NEW change selection is ignored and the OLD change is sent */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.DESK, 'H32');
  await R.login(page, 'duc nam', '0001', true);
  await page.waitForSelector('.pg-book');
  for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await R.cell(page, d, h);
  await R.tap(page, '#cta'); await page.waitForSelector('.pg-tk'); await R.sleep(400);
  await R.tap(page, '[data-a="tkdone"]'); await page.waitForSelector(R.vis('[data-a="gochg"]')); await R.sleep(500);
  await R.tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
  await R.cell(page, '2026-10-21', 18); await R.cell(page, '2026-10-22', 18);      /* change A: Wed 18 -> Thu 18 */
  t.fail = b => (b.action === 'lt_change' ? 'net' : null);
  t.delayFor = b => (b.action === 'lt_change' ? 1200 : 0);
  await R.tap(page, '#cta');
  await R.sleep(200);
  await page.goBack();                                                            /* browser Back while "Đang gửi…" */
  await page.waitForSelector(R.vis('[data-a="gochg"]'));
  await R.sleep(1600);                                                            /* write fails silently */
  t.fail = null; t.delayFor = null;
  R.info('after silent failure', await page.evaluate(() => ({ view: window.__lt.S.view, pending: window.__lt.S.pending && window.__lt.S.pending.body.from.date + '->' + window.__lt.S.pending.body.to.date, notice: window.__lt.S.notice })));
  await R.tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg'); await R.sleep(300);
  await R.cell(page, '2026-10-23', 19); await R.cell(page, '2026-10-24', 19);      /* change B: Fri 19 -> Sat 19 */
  const sel = await page.evaluate(() => window.__lt.S.chg.from.date + '->' + window.__lt.S.chg.to.date);
  await R.tap(page, '#cta');
  await page.waitForSelector('.pg-tk'); await R.sleep(500);
  const rows = t.rows().filter(r => r[16] === 'B901DY');
  const moved = rows.filter(r => r[12] === 'Đổi').map(r => r[13]);
  R.info('selected', sel); R.info('server applied', moved);
  R.ok('H32: the change the member selected (Fri->Sat) is the one applied', moved.length === 1 && /T6 23\.10/.test(moved[0]), moved);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
