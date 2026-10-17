'use strict';
const R = require('./rv_common');
const { vn } = R.H;
const ae = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.tagName + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ').join('.') : '') + (a.dataset && a.dataset.a ? '[' + a.dataset.a + ']' : '')) : null; });
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await R.open2(t, R.DESK, 'a11y');
  await page.waitForSelector('#q');
  R.info('find: focus', await ae(page));
  await page.keyboard.type('duc nam'); await page.waitForSelector('.rrow');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#pin');
  R.info('verify: focus', await ae(page));
  await page.keyboard.type('0001'); await page.keyboard.press('Enter');
  await page.waitForSelector('.pg-book'); await R.sleep(600);
  const fb = await ae(page);
  R.info('book (after verify): focus', fb);
  R.ok('a11y: focus lands inside the new view after verify', !/^BODY/.test(fb || 'BODY'), fb);
  /* Tab order from body: how many tabs to reach the grid? */
  await page.focus('#wkb .c[tabindex="0"]');
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.click('#cta');
  await page.waitForSelector('.pg-tk'); await R.sleep(800);
  const ft = await ae(page);
  R.info('ticket (after booking via keyboard/click): focus', ft);
  R.ok('a11y: focus lands inside the ticket view after booking', !/^BODY/.test(ft || 'BODY'), ft);
  /* cửa sổ / ngăn kéo: xem rv_a11y2.js (phiếu không có nút Gói & luật) */
  await page._ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
