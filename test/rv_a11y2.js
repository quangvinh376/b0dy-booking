'use strict';
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  for (const [k, o] of [['d', R.DESK], ['m', R.MOB]]) {
    const t = R.H.backend(vn('2026-10-18', '20:15'));
    const page = await R.open2(t, o, 'a11y2' + k);
    await R.login(page, 'duc nam', '0001', k === 'd');
    await page.waitForSelector('.pg-book'); await R.sleep(500);
    await R.tap(page, k === 'd' ? '#floor [data-a="info"]' : '.info [data-a="info"]');
    await page.waitForSelector(k === 'd' ? '#drawer.on' : '#sheet.on'); await R.sleep(300);
    const seen = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => { const a = document.activeElement; return (a.closest('#drawer,#sheet') ? 'IN:' : 'OUT:') + a.tagName + (a.dataset.a ? '[' + a.dataset.a + ']' : a.className ? '.' + String(a.className).split(' ')[0] : ''); })); }
    R.info(k + ' Tab sequence from the dialog close button', seen);
    R.ok('a11y ' + k + ': Tab stays inside the aria-modal dialog', seen.every(s => s.indexOf('IN:') === 0), seen);
    await page._ctx.close();
  }
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
