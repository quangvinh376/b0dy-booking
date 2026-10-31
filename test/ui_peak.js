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
const { startServer, API, backend, attach, vn } = require('./ui_harness');
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

/* ── Giao thoa (máy chủ giả = LichTuan.gs, dữ liệu riêng từng kịch bản): khách thấp điểm của Bích Ngọc khi coach bận / nghỉ chính các
   khung trong gói, khi vừa bị người khác lấy khung, khi có buổi cũ ngoài gói ── */
const GT = { no: '981', name: 'Khách Giờ Thấp', coach: 'Bích Ngọc', phone: '0900000081', code: 'B981DY', tier: 'Thấp điểm' };
const NG = { no: '982', name: 'Khách Ngọc Gấp', coach: 'Bích Ngọc', phone: '0900000082', code: 'B982DY' };
const THU = { '2026-10-19': 'T2', '2026-10-20': 'T3', '2026-10-21': 'T4', '2026-10-22': 'T5', '2026-10-23': 'T6', '2026-10-24': 'T7', '2026-10-25': 'CN' };
let rn = 0;
const srow = (kh, name, short, date, h) => [kh + '-W43', 1, '2026-W43', date, THU[date], (h < 10 ? '0' : '') + h + ':00', name, short, 'Bích Ngọc', '1:1', 'Đã đặt', 'Đặt', '',
  '2026-10-18 06:30:00', 'riduipeak' + String(++rn).padStart(4, '0'), kh, short + ' · BN'];
const other = (n, date, h) => srow('B7' + n + 'DY', 'Khách Sổ ' + n, 'K. Sổ ' + n, date, h);
const OFFH = [9, 10, 11, 12, 14], WD = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const D7 = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], HRS = [6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20];
const schedNgoc = on => [['', '— LỊCH COACH'], [], ['', 'Bích Ngọc'].concat(D7)].concat(HRS.map(h => ['', (h < 10 ? '0' : '') + h + ':00'].concat(D7.map((_, i) => on(i, h)))));

async function runMix(browser, server, mobile) {
  console.log('\n== giao thoa · ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' ==');
  const errs = [];
  const open = async opt => {
    const t = backend(vn('2026-10-18', '07:00'), Object.assign({ extra: [GT, NG], closures: [['24/10/26', 'Nghỉ lễ thử']] }, opt));
    const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await attach(page, t); await page.goto(server.url); await page.waitForSelector('#q');
    await page.fill('#q', 'gio thap'); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
    await page.waitForSelector('#pin'); await page.focus('#pin'); await page.keyboard.type('0081');
    await page.locator(mobile ? '#vgoM' : '#vgo').click();
    return { t, ctx, page };
  };
  const st = page => page.evaluate(() => { const S = window.__lt.S, wk = document.querySelector('#wk');
    return { view: S.view, rows: wk ? wk.getAttribute('data-rows') : '', mode: S.st && S.st.mode, limits: S.st && S.st.limits }; });
  const cls = (page, d, h) => page.evaluate(k => { const c = document.querySelector('#wkb .c[data-d="' + k[0] + '"][data-h="' + k[1] + '"]'); return c ? c.className + (c.getAttribute('aria-disabled') === 'true' ? ' dis' : '') : null; }, [d, h]);

  /* 1 · coach bận 3 / 5 khung trong gói của T2 → ô X trên bảng con; vừa bị lấy T2 12:00 → chỉ gợi ý khung trong gói còn trống */
  {
    const { t, ctx, page } = await open({ log: [other(51, '2026-10-19', 9), other(52, '2026-10-19', 10), other(53, '2026-10-19', 11)] });
    await waitView(page, 'book');
    let s = await st(page);
    ok('Giờ Thấp (Ngọc · thấp điểm): bảng con 09 · 10 · 11 · 12 · 14', s.rows === '9,10,11,12,14', s);
    const c = await Promise.all([9, 10, 11, 12, 14].map(h => cls(page, '2026-10-19', h)));
    ok('… T2 09 · 10 · 11 (coach bận) là ô X, T2 12 · 14 chọn được', c.slice(0, 3).every(x => /\bfull\b/.test(x)) && c.slice(3).every(x => x !== null && !/\bfull\b|dis/.test(x)), c);
    await page.locator('#wkb .c[data-d="2026-10-19"][data-h="12"] >> visible=true').first().click();
    await page.locator('#wkb .c[data-d="2026-10-20"][data-h="9"] >> visible=true').first().click();
    /* khách khác của Ngọc lấy T2 12:00 ngay trước khi Giờ Thấp bấm đặt */
    const f = t.env.ltDoPost_({ action: 'lt_find', q: 'ngoc gap', dev: 'uipeakDEV0000000000001' });
    const v = t.env.ltDoPost_({ action: 'lt_verify', id: f.results[0].id, pin: '0082', remember: true, dev: 'uipeakDEV0000000000001' });
    const b = t.env.ltDoPost_({ action: 'lt_book', tok: v.tok, dev: 'uipeakDEV0000000000001', rid: 'uipeakrid0001', week: '2026-W43', picks: [{ date: '2026-10-19', h: 12 }, { date: '2026-10-21', h: 6 }] });
    ok('… (khách khác của Ngọc đặt T2 12:00 trước)', b.ok, b.error);
    await page.locator(mobile ? '#ctaM' : '#cta').first().click();
    await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'gone', null, { timeout: 8000 });
    const sugs = await page.evaluate(() => window.__lt.S.notice.sugs);
    ok('… bấm đặt → "vừa có người đặt trước": gợi ý chỉ T2 14:00 (khung trong gói còn trống), không gợi ý 08:00 / 15:00', JSON.stringify(sugs) === JSON.stringify([{ date: '2026-10-19', h: 14 }]), sugs);
    await page.waitForSelector('[data-a="sug"] >> visible=true', { timeout: 5000 }); await sleep(300);
    const sb = await page.$$eval('[data-a="sug"]', els => els.filter(e => e.offsetParent).map(e => e.textContent));
    ok('… nút gợi ý trên màn: chỉ "14:00"', sb.length === 1 && sb[0] === '14:00', sb);
    await page.locator('[data-a="sug"] >> visible=true').first().click(); await sleep(400);
    await page.locator(mobile ? '#ctaM' : '#cta').first().click(); await waitView(page, 'ticket');
    const rows = t.rows().filter(r => r[16] === 'B981DY' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6]).sort();
    ok('… chọn 14:00 rồi đặt → phiếu, sổ: T2 14:00 + T3 09:00', JSON.stringify(rows) === JSON.stringify(['2026-10-19 14:00', '2026-10-20 09:00']), rows);
    await ctx.close();
  }
  /* 2 · Ngọc kín cả 5 khung trong gói T2–T5 → còn T6: tối thiểu / tối đa 1, đặt được một buổi */
  {
    const log = []; WD.slice(0, 4).forEach((d, i) => OFFH.forEach((h, j) => log.push(other(60 + i * 5 + j, d, h))));
    const { t, ctx, page } = await open({ log });
    await waitView(page, 'book');
    const s = await st(page);
    ok('Ngọc kín T2–T5 trong gói → Giờ Thấp còn T6: tối thiểu 1 / tối đa 1', s.limits && s.limits.min === 1 && s.limits.max === 1, s.limits);
    const cta0 = await page.locator((mobile ? '#ctaM' : '#cta') + ' >> visible=true').first().textContent();
    await page.locator('#wkb .c[data-d="2026-10-23"][data-h="11"] >> visible=true').first().click(); await sleep(250);
    const cta1 = await page.locator((mobile ? '#ctaM' : '#cta') + ' >> visible=true').first().textContent();
    ok('… nút chốt: "Chọn 1 buổi" → chọn T6 11:00 → "Đặt lịch 1 buổi"', /Chọn 1 buổi/.test(cta0) && /Đặt lịch 1 buổi/.test(cta1), [cta0, cta1]);
    await page.locator(mobile ? '#ctaM' : '#cta').first().click(); await waitView(page, 'ticket');
    ok('… đặt → phiếu, sổ đúng 1 dòng T6 11:00', JSON.stringify(t.rows().filter(r => r[16] === 'B981DY' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6])) === JSON.stringify(['2026-10-23 11:00']));
    await ctx.close();
  }
  /* 3 · Ngọc kín cả 5 khung trong gói T2–T6 → màn "kín lịch" nói đúng gói thấp điểm (phòng vẫn còn khung khác) */
  {
    const log = []; WD.forEach((d, i) => OFFH.forEach((h, j) => log.push(other(60 + i * 5 + j, d, h))));
    const { ctx, page } = await open({ log });
    await waitView(page, 'closed');
    const tx = await page.evaluate(() => document.querySelector('.pg-closed').innerText);
    ok('Ngọc kín mọi khung trong gói cả tuần → màn "Tuần này đã kín lịch." + "Các khung trong gói thấp điểm (09:00–15:00) đã kín."', /Tuần này đã kín lịch\./.test(tx) && /Các khung trong gói thấp điểm \(09:00–15:00\) đã kín\./.test(tx) && !/Không còn khung trống nào/.test(tx), tx.slice(0, 300));
    await ctx.close();
  }
  /* 4 · Lịch coach: Ngọc không nhận khách 09–15 (T2–T7 chỉ sáng sớm + chiều tối, CN nghỉ) → màn nói coach nghỉ, không nói "kín" */
  {
    const { ctx, page } = await open({ sched: schedNgoc((i, h) => i < 6 && (h < 9 || h >= 15)) });
    await waitView(page, 'closed');
    const tx = await page.evaluate(() => document.querySelector('.pg-closed').innerText);
    ok('Ngọc không nhận 09:00–15:00 cả tuần → "Coach nghỉ trong giờ thấp điểm." + "Tuần này coach của bạn không nhận khách trong 09:00–15:00."', /Coach nghỉ trong giờ thấp điểm\./.test(tx) && /Tuần này coach của bạn không nhận khách trong 09:00–15:00\./.test(tx) && !/kín lịch/.test(tx), tx.slice(0, 300));
    await ctx.close();
  }
  /* 5 · buổi đặt trước khi chuyển sang gói thấp điểm (T2 18:00, T3 07:00): phiếu giữ, bảng đổi lịch có thêm 2 hàng đó, dời được vào gói */
  {
    const mine = (date, h) => srow('B981DY', 'Khách Giờ Thấp', 'K. Giờ Thấp', date, h);
    const { t, ctx, page } = await open({ log: [mine('2026-10-19', 18), mine('2026-10-20', 7)] });
    await waitView(page, 'ticket');
    await page.waitForSelector('[data-a="gochg"] >> visible=true'); await sleep(400);
    await page.locator('[data-a="gochg"] >> visible=true').first().click(); await waitView(page, 'change');
    let s = await st(page);
    ok('Buổi cũ ngoài gói (T2 18:00, T3 07:00) → bảng đổi lịch: 07 · 09 · 10 · 11 · 12 · 14 · 18 (không có 15–17, 19–20)', s.rows === '7,9,10,11,12,14,18', s);
    const own = await Promise.all([cls(page, '2026-10-19', 18), cls(page, '2026-10-20', 7)]);
    ok('… hai buổi đó hiện đúng ô của mình', own.every(x => x !== null && !/\bfull\b/.test(x)), own);
    const from = await page.evaluate(() => window.__lt.S.chg && window.__lt.S.chg.from);
    if (!from || from.date !== '2026-10-19') { await page.locator('#wkb .c[data-d="2026-10-19"][data-h="18"] >> visible=true').first().click(); await sleep(250); }
    await page.locator('#wkb .c[data-d="2026-10-21"][data-h="10"] >> visible=true').first().click(); await sleep(250);
    await page.locator(mobile ? '#ctaM' : '#cta').first().click(); await waitView(page, 'ticket');
    const rows = t.rows().filter(r => r[16] === 'B981DY' && r[11] === 'Đã đặt').map(r => r[4] + ' ' + r[6]).sort();
    ok('… dời T2 18:00 → T4 10:00 → sổ: T3 07:00 + T4 10:00', JSON.stringify(rows) === JSON.stringify(['2026-10-20 07:00', '2026-10-21 10:00']), rows);
    await ctx.close();
  }
  ok('0 lỗi console / pageerror (giao thoa)', errs.length === 0, errs);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  try { await run(browser, server, false); await run(browser, server, true); await runMix(browser, server, false); await runMix(browser, server, true); }
  catch (e) { fail++; console.log('  FAIL  ngoại lệ: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
