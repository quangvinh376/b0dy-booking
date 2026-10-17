'use strict';
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.MOB, 'find');
  await page.waitForSelector('#q');
  await page.fill('#q', 'thi thao'); await page.waitForSelector('#miss:not([hidden])');
  const a = await page.evaluate(() => ({ miss: !document.querySelector('#miss').hidden, hint: document.querySelector('#qhint').textContent, st: window.__lt.S.qState }));
  await page.type('#q', 'x'); await R.sleep(600);
  await page.press('#q', 'Backspace'); await R.sleep(600);
  const b = await page.evaluate(() => ({ q: document.querySelector('#q').value, miss: !document.querySelector('#miss').hidden, hint: document.querySelector('#qhint').textContent, st: window.__lt.S.qState, rows: document.querySelectorAll('.rrow').length }));
  R.info('first time', a); R.info('same query again (from cache)', b);
  R.ok('find: a cached empty result still shows "Không tìm thấy tên của bạn"', b.miss, b);
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
