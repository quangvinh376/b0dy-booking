'use strict';
/* H26: shared device. Member A (remember unchecked) loses the network on "Đặt lịch", closes the tab.
   Member B opens the page, verifies -> A's pending (lt_pend in localStorage, holding A's session token) is restored on B's screen;
   "Gửi lại" books A's slots on A's account and shows A's ticket to B. */
const R = require('./rv_common');
const { vn } = R.H;
(async () => {
  await R.start();
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const ctx = await R.browser.newContext(R.MOB);
  const p1 = await ctx.newPage();
  await R.attach2(p1, t);
  await p1.goto(R.server.url);
  await p1.waitForSelector('#q'); await p1.fill('#q', 'khai linh'); await p1.waitForSelector('.rrow'); await p1.locator('.rrow').first().click();
  await p1.waitForSelector('#pin'); await p1.keyboard.type('0002');
  await p1.locator('.chk').click();   /* untick "Ghi nhớ máy này" */
  await p1.locator('#vgoM >> visible=true').click();
  await p1.waitForSelector('.pg-book');
  await p1.locator('#wkb .c[data-d="2026-10-19"][data-h="7"]').click(); await p1.locator('#wkb .c[data-d="2026-10-22"][data-h="7"]').click();
  t.fail = b => (b.action === 'lt_book' ? 'net' : null);
  await p1.locator('#ctaM >> visible=true').click();
  await p1.waitForFunction(() => /Gửi lại/.test(document.querySelector('#ctaM').textContent));
  t.fail = null;
  R.info('A left with pending', await p1.evaluate(() => ({ pend: !!localStorage.getItem('lt_pend'), lsTok: localStorage.getItem('lt_tok'), ssTok: !!sessionStorage.getItem('lt_tok') })));
  await p1.close();
  /* member B on the same device, a few minutes later */
  const p2 = await ctx.newPage();
  await R.attach2(p2, t);
  await p2.goto(R.server.url);
  await p2.waitForSelector('#q'); await p2.fill('#q', 'my ngoc'); await p2.waitForSelector('.rrow'); await p2.locator('.rrow').first().click();
  await p2.waitForSelector('#pin'); await p2.keyboard.type('0004');
  await p2.locator('#vgoM >> visible=true').click();
  await p2.waitForSelector('.pg-book'); await R.sleep(800);
  const s = await p2.evaluate(() => ({ hello: document.querySelector('.pg-book h1').textContent, picks: window.__lt.S.picks, cta: document.querySelector('#ctaM').textContent.trim() }));
  R.info('B sees', s);
  R.ok('H26: B does not see A\'s unsent selection', s.picks.length === 0, s);
  if (/Gửi lại/.test(s.cta)) {
    await p2.locator('#ctaM >> visible=true').click();
    await p2.waitForSelector('.pg-tk'); await R.sleep(800);
    const tk = await p2.evaluate(() => ({ h1: document.querySelector('.pg-tk h1').textContent, member: window.__lt.S.st.me.short, coach: window.__lt.S.st.me.coach }));
    R.info('after B taps Gửi lại', { tk, A_rows: t.rows().filter(r => r[16] === 'B902DY').length, B_rows: t.rows().filter(r => r[16] === 'B904DY').length });
    R.ok('H26: B tapping "Gửi lại" does not book for A / show A\'s ticket', tk.member !== 'N. Khải Linh', tk);
    await R.shot(p2, 'H26-B-sees-A', 200);
  }
  await ctx.close();
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
