/* Ca 12:00 (nghỉ trưa còn 13:00–14:00) + gói thấp điểm (MEMBERS cột "Khung giờ", chủ studio chốt 31/10) — trang thật + máy chủ giả
   của chế độ QC (qc.js = mã Worker), desktop + mobile. node test/ui_peak.js
   1. Trịnh Minh Khôi (toàn thời gian): bảng đủ 14 khung, có 12:00, dải "Nghỉ trưa · 13:00–14:00" nằm giữa hàng 12:00 và 14:00,
      đặt T2 12:00 + T3 12:00 → sổ giả ghi "12:00"
   2. Văn Thục Đoan (thấp điểm 1:1): bảng chỉ 09 · 10 · 11 · 12 · 14, thông báo + Gói & luật nói rõ 09:00–15:00, đặt T2 12:00 + T3 14:00
   3. Tiêu Hạ Miên (1:2 · Lâm · thấp điểm): bảng chỉ 09 · 11 (khung ghép trong gói)
   4. Tạ Uyển Nhi (1:2 · Lâm · toàn thời gian) đặt T4 19:00 + T5 09:00: mời ở 19:00 không có Hạ Miên, ở 09:00 có → mời được,
      Hạ Miên thấy lời mời */
'use strict';
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');
const EXE = require('./pw_exe'), ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } }
async function waitView(page, v) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: 10000 }); }

async function run(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' ==');
  const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  let hits = 0;
  await page.route(API + '**', r => { hits++; r.abort(); });
  await page.goto(server.url + '?qc'); await page.waitForSelector('.qc-tab');
  const login = async (q, pin) => {
    await waitView(page, 'find');
    await page.fill('#q', q); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
    await waitView(page, 'verify'); await page.focus('#pin'); await page.keyboard.type(pin);
    await page.locator(mobile ? '#vgoM' : '#vgo').click();
  };
  const signOut = async () => {
    await page.evaluate(() => { [localStorage, sessionStorage].forEach(s => Object.keys(s).filter(k => k.indexOf('qc:') === 0 && k !== 'qc:lt_dev').forEach(k => s.removeItem(k))); });
    await page.reload(); await page.waitForSelector('.qc-tab');
  };
  const flushed = async () => { for (let i = 0; i < 50; i++) { const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qcsrv:do') || '{}')).filter(k => k.indexOf('j:') === 0).length); if (!n) return; await sleep(100); } };
  const so = kh => page.evaluate(kh => { const g = JSON.parse(localStorage.getItem('qcsrv:g')), rows = g['qc-out'].find(x => x.title === 'Sổ đặt lịch').rows;
    return rows.slice(4).filter(r => r && r[16] === kh && r[3] === '2026-W43' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6]).sort(); }, kh);
  const cell = (d, h) => page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first();
  const book = async picks => { await waitView(page, 'book'); for (const [d, h] of picks) await cell(d, h).click(); await page.locator(mobile ? '#ctaM' : '#cta').first().click(); await waitView(page, 'ticket'); await flushed(); };
  /* bảng đang hiện: giờ các hàng (data-rows), có phải bảng con, chữ dải nghỉ trưa, vị trí dải so với hàng 12:00 / 14:00 / hàng cuối buổi sáng */
  const grid = () => page.evaluate(() => {
    const wk = document.querySelector('#wk'), lu = document.querySelector('#wkb .lunch'), day = '2026-10-19';
    const box = h => { const c = document.querySelector('#wkb .c[data-d="' + day + '"][data-h="' + h + '"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    const lb = lu ? lu.getBoundingClientRect() : null, rows = (wk.getAttribute('data-rows') || '').split(',').map(Number);
    const am = rows.filter(h => h < 13), pm = rows.filter(h => h > 13);
    const lastAm = am.length ? box(am[am.length - 1]) : null, firstPm = pm.length ? box(pm[0]) : null;
    return { rows: rows.join(','), sub: wk.classList.contains('sub'), lunch: lu ? lu.textContent : '', lunchOk: !!lb && (!lastAm || lb.top >= lastAm.bottom - 0.5) && (!firstPm || lb.bottom <= firstPm.top + 0.5),
             tl: Array.from(document.querySelectorAll('#wkb .tl .d, #wkb .tl .m')).filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent).join(' '),
             hscroll: document.documentElement.scrollWidth > window.innerWidth + 0.5, offpeak: window.__lt.S.st.offpeak || null };
  });
  const pageText = () => page.evaluate(() => document.body.innerText);

  /* 1 · toàn thời gian: bảng đủ 14 khung */
  await login('minh khoi', '1111'); await waitView(page, 'book');
  let g = await grid();
  ok('Minh Khôi (toàn thời gian): bảng đủ 14 khung 06–12 · 14–20, không phải bảng con', g.rows === '6,7,8,9,10,11,12,14,15,16,17,18,19,20' && !g.sub && !g.offpeak, g);
  ok('… dải "Nghỉ trưa · 13:00–14:00" nằm giữa hàng 12:00 và hàng 14:00', /Nghỉ trưa · 13:00–14:00/i.test(g.lunch) && g.lunchOk, g);
  ok('… cột giờ có 12:00 (desktop) / 12 (mobile)', mobile ? / 12 14 /.test(' ' + g.tl + ' ') : /12:00 14:00/.test(g.tl), g.tl);
  ok('… không cuộn ngang', !g.hscroll, g);
  ok('… T2 12:00 là ô trống chọn được', await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-19"][data-h="12"]'); return !!c && c.getAttribute('aria-disabled') !== 'true' && /12:00/.test(c.getAttribute('aria-label')); }));
  await book([['2026-10-19', 12], ['2026-10-20', 12]]);
  ok('Đặt T2 12:00 + T3 12:00 → phiếu, sổ giả ghi "12:00"', JSON.stringify(await so('B801DY')) === JSON.stringify(['2026-10-19 12:00', '2026-10-20 12:00']), await so('B801DY'));
  await signOut();

  /* 2 · gói thấp điểm 1:1 */
  await login('thuc doan', '1313'); await waitView(page, 'book');
  g = await grid();
  ok('Thục Đoan (thấp điểm): bảng con chỉ 09 · 10 · 11 · 12 · 14 (state offpeak.hours)', g.rows === '9,10,11,12,14' && g.sub && g.offpeak && g.offpeak.hours.join(',') === '9,10,11,12,14', g);
  ok('… dải nghỉ trưa vẫn nằm giữa 12:00 và 14:00', /13:00–14:00/.test(g.lunch) && g.lunchOk, g);
  let tx = await pageText();
  ok('… thông báo "Gói thấp điểm · 09:00–15:00."', /Gói thấp điểm · 09:00–15:00\./.test(tx), tx.slice(0, 400));
  ok('… không cuộn ngang', !g.hscroll, g);
  if (mobile) {
    /* mobile: chạm thẻ thông báo → cửa sổ chi tiết (thân thông báo) → nút chữ "Gói & luật đặt lịch" */
    await page.locator('.mnt >> visible=true').first().click(); await page.waitForSelector('#sheet.on'); await sleep(300);
    const nb = await page.evaluate(() => document.querySelector('#sheet').innerText);
    ok('… cửa sổ thông báo: "Đặt ở 09:00, 10:00, 11:00, 12:00 hoặc 14:00."', /Đặt ở 09:00, 10:00, 11:00, 12:00 hoặc 14:00\./.test(nb), nb.slice(0, 300));
    await page.locator('#sheet [data-a="info"]').click();
    await page.waitForFunction(() => /Gói & luật/.test((document.querySelector('#sheetT') || {}).textContent || '')); await sleep(300);
  } else { await page.locator('#floor [data-a="info"]').click(); await page.waitForSelector('#drawer.on'); await sleep(300); }
  const info = await page.evaluate(m => document.querySelector(m ? '#sheet' : '#drawer').innerText, mobile);
  ok('… Gói & luật: dòng "Khung giờ · Thấp điểm · 09:00–15:00" + luật gói thấp điểm', /Khung giờ\s*Thấp điểm · 09:00–15:00/i.test(info) && /Gói thấp điểm đặt trong 09:00–15:00: khung 09:00, 10:00, 11:00, 12:00 hoặc 14:00\./.test(info), info.slice(0, 600));
  if (mobile) { await page.locator('#sheet .sh-h [data-a="closesheet"]').click(); await page.waitForFunction(() => document.querySelector('#sheet').hidden); }
  else { await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#drawer').hidden); }
  await sleep(300);
  await book([['2026-10-19', 12], ['2026-10-20', 14]]);
  ok('Đặt T2 12:00 + T3 14:00 → phiếu, sổ giả đúng 2 dòng', JSON.stringify(await so('B812DY')) === JSON.stringify(['2026-10-19 12:00', '2026-10-20 14:00']), await so('B812DY'));
  await signOut();

  /* 3 · gói 1:2 thấp điểm: khung ghép trong gói = 09 · 11 */
  await login('ha mien', '1414'); await waitView(page, 'book');
  g = await grid();
  ok('Hạ Miên (1:2 · thấp điểm): bảng con chỉ 09 · 11, dải nghỉ trưa sau 11:00', g.rows === '9,11' && g.sub && /13:00–14:00/.test(g.lunch) && g.lunchOk, g);
  tx = await pageText();
  ok('… thông báo "Gói 1:2 thấp điểm"', mobile ? /Gói 1:2 · khung ghép 09 · 11/.test(tx) : /Gói 1:2 thấp điểm · tập theo khung ghép/.test(tx), tx.slice(0, 400));
  await signOut();

  /* 4 · mời tập đôi: bạn gói thấp điểm chỉ hiện ở khung trong gói của bạn ấy */
  await login('uyen nhi', '5555'); await waitView(page, 'book');
  await book([['2026-10-21', 19], ['2026-10-22', 9]]);
  await page.locator('#prLine .prl').click(); await page.waitForSelector(mobile ? '#sheet.on' : '#drawer.on'); await sleep(300);
  const host = mobile ? '#sheet' : '#drawer';
  await page.locator(host + ' [data-a="invpick"][data-d="2026-10-21"]').click(); await sleep(200);
  const o19 = await page.$$eval(host + ' .pr-opt', els => els.map(e => e.textContent));
  ok('Uyển Nhi mời ở T4 19:00: có Thục Quyên, không có Hạ Miên (thấp điểm)', o19.some(x => /Thục Quyên/.test(x)) && !o19.some(x => /Hạ Miên/.test(x)), o19);
  await page.locator(host + ' [data-a="invpickoff"]').click(); await sleep(300);
  await page.locator(host + ' [data-a="invpick"][data-d="2026-10-22"]').click(); await sleep(200);
  const o9 = await page.$$eval(host + ' .pr-opt', els => els.map(e => e.textContent));
  ok('… ở T5 09:00: có Hạ Miên', o9.some(x => /Hạ Miên/.test(x)), o9);
  await page.locator(host + ' .pr-opt:has-text("Hạ Miên")').click();
  await page.locator(host + ' [data-a="invsend"]').click();
  await page.waitForFunction(() => !!document.querySelector('.toast') && /Đã mời/.test(document.querySelector('.toast').textContent), null, { timeout: 6000 }).catch(() => {});
  await flushed();
  const inv = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('qcsrv:g')), rows = g['qc-out'].find(x => x.title === 'Sổ đặt lịch').rows;
    return rows.slice(4).filter(r => r && r[16] === 'B805DY' && r[11] === 'Mời').map(r => r[4] + ' ' + r[6] + ' ' + r[13]); });
  ok('… gửi lời mời T5 09:00 → sổ giả có dòng "Mời" tới Hạ Miên', inv.length === 1 && /^2026-10-22 09:00 Mời .*B813DY$/.test(inv[0]), inv);
  await page.keyboard.press('Escape'); await sleep(300);
  await signOut();
  await login('ha mien', '1414'); await waitView(page, 'book');
  const invIn = await page.evaluate(() => (window.__lt.S.st.duo || {}).invIn || []);
  ok('Hạ Miên thấy lời mời T5 09:00 của Uyển Nhi', invIn.length === 1 && invIn[0].date === '2026-10-22' && +invIn[0].h === 9 && invIn[0].from === 'Uyển Nhi', invIn);

  ok('Không một lệnh nào ra máy chủ thật', hits === 0, hits);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  try { await run(browser, server, false); await run(browser, server, true); }
  catch (e) { fail++; console.log('  FAIL  ngoại lệ: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
