/* Trạng thái biên trên giao diện thật + máy chủ giả (logic LichTuan.gs): E01 E03 E04 E06 E07 E08 E09 E10 E11 E12,
   ngăn kéo / cửa sổ chi tiết, tràn ngang ở mọi cỡ màn, bàn phím, giảm chuyển động, 0 lỗi console.
   node test/ui_states.js   → ảnh ra SHOTS/states */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startServer, backend, attach, vn } = require('./ui_harness');

const SHOTS = path.join(process.env.SHOTS || path.join(require('os').tmpdir(), 'b0dy-ui'), 'states');
const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); }
}
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOB = { viewport: { width: 393, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let browser, server;
const ERRS = [];

async function open(t, ctxOpt, name) {
  const ctx = await browser.newContext(ctxOpt);
  const page = await ctx.newPage();
  page.on('pageerror', e => ERRS.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !(/^E11/.test(name) && /net::ERR_FAILED/.test(m.text()))) ERRS.push(name + ' console: ' + m.text()); });   /* E11 cố ý cắt mạng */
  await attach(page, t);
  await page.goto(server.url);
  page._ctx = ctx;
  return page;
}
const vis = sel => sel + ' >> visible=true';
async function tap(page, sel) { await page.locator(vis(sel)).first().click(); }
async function shot(page, name, wait) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(wait == null ? 900 : wait); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function login(page, q, pin, desk) {
  await page.waitForSelector('#q');
  await page.fill('#q', q);
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await page.waitForSelector('#pin');
  await page.keyboard.type(pin);
  await tap(page, desk ? '#vgo' : '#vgoM');
}
async function cell(page, d, h, force) { await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').click(force ? { force: true } : undefined); }
const close = async page => { await page._ctx.close(); };

async function E01() {
  console.log('\n== E01 · chưa mở đặt (T7 22:40) ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-17', '22:40'));
    const page = await open(t, o, 'E01' + k);
    await page.waitForSelector('.pg-closed');
    const txt = await page.textContent('.pg-closed h1');
    ok('E01 ' + k + ': tiêu đề "Chưa tới giờ đặt."', txt.trim() === 'Chưa tới giờ đặt.', txt);
    await sleep(1500);
    const cd = await page.evaluate(() => document.querySelector('#cdv')._s);
    ok('E01 ' + k + ': đồng hồ đếm 07:19:5x → 06:00 CN', /^07:1[89]:\d\d$/.test(cd), cd);
    const sig = await page.textContent(k === 'd' ? '#sigD' : '#sigM');
    ok('E01 ' + k + ': header "CHƯA MỞ … 43", chấm rỗng', /chưa mở/i.test(sig) && /43/.test(sig) && await page.evaluate(() => document.querySelector('#sig').classList.contains('off')), sig);
    /* Figma E01 (17/10): không dãy bước · nút "Đặt hẹn nhắc lịch" (desktop dưới đồng hồ L56, mobile thanh đáy M48 rộng hết, kẻ 10 %) ·
       đồng hồ mỗi ký tự .57em (khoảng chữ −3 %) */
    const g = await page.evaluate(() => {
      const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const btns = Array.from(document.querySelectorAll('[data-a="remind"]')).filter(vis);
      const b = btns[0], r = b && b.getBoundingClientRect(), mb = document.querySelector('#mbar');
      const dg = document.querySelector('#cdv .dg'), fs = parseFloat(getComputedStyle(document.querySelector('#cdv')).fontSize);
      return { steps: document.querySelectorAll('#steps .step').length, n: btns.length, txt: b && b.textContent.trim(), inBar: !!b && mb.contains(b),
               w: r && Math.round(r.width), h: r && Math.round(r.height), vw: innerWidth, ke: mb.classList.contains('mb-ke'),
               line: getComputedStyle(mb).borderTopColor, dgw: dg && +(dg.getBoundingClientRect().width / fs).toFixed(3) };
    });
    ok('E01 ' + k + ': header không còn dãy bước', g.steps === 0, g);
    ok('E01 ' + k + ': đúng một nút "Đặt hẹn nhắc lịch" đang hiện', g.n === 1 && g.txt === 'Đặt hẹn nhắc lịch', g);
    if (k === 'd') ok('E01 d: nút dưới đồng hồ, cao 56, không ở thanh đáy', !g.inBar && g.h === 56, g);
    else ok('E01 m: nút ở thanh đáy, cao 48, rộng hết màn trừ lề 16, kẻ trên 10 %', g.inBar && g.h === 48 && g.w === g.vw - 32 && g.ke && /0\.1\)$/.test(g.line), g);
    ok('E01 ' + k + ': đồng hồ mỗi ký tự rộng .57em', g.dgw === 0.57, g);
    await shot(page, 'E01-' + k, 1200);
    await close(page);
  }
  /* 06:00 CN: E01 → Tìm tên — dãy bước hiện lại, thanh đáy mobile hết kẻ 10 % */
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-18', '06:00') - 3000);
    const page = await open(t, o, 'E01open' + k);
    await page.waitForSelector('.pg-closed');
    t.clock.now = vn('2026-10-18', '06:00') + 1000;
    /* đợi ĐÚNG màn Tìm tên đang hiện: chạy test sau 06:00 CN 18.10 (giờ máy thật) thì lúc khởi động trang tự tính tuần theo giờ máy →
       vào Tìm tên trước, máy chủ (đồng hồ giả 05:59:57) trả "chưa mở" → sang Chưa mở; màn Tìm tên đang rời đi còn trong DOM ~230 ms
       nên chờ '.pg-find' trúng ngay màn đó (18/10 12:40 đã gặp) */
    await page.waitForFunction(() => window.__lt && window.__lt.S.view === 'find' && !document.querySelector('.page.leave-fwd,.page.leave-back'), null, { timeout: 15000 });
    await sleep(900);
    const g = await page.evaluate(() => ({ steps: document.querySelectorAll('#steps .step').length, ke: document.querySelector('#mbar').classList.contains('mb-ke') }));
    ok('E01 ' + k + ' → 06:00 mở: sang Tìm tên, dãy bước 4 mục hiện lại, thanh đáy bỏ kẻ 10 %', g.steps === 4 && !g.ke, g);
    await close(page);
  }
}
async function E03() {
  console.log('\n== E03 · sai mã 5 lần → khoá ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const page = await open(t, DESK, 'E03');
  await login(page, 'khai linh', '1111', true);
  for (let i = 0; i < 4; i++) { await page.waitForFunction(() => !document.querySelector('#vgo').classList.contains('sending')); await page.click('#pin'); await page.keyboard.type('1111'); await page.click('#vgo'); await sleep(250); }
  await page.waitForSelector('.pg-lock');
  ok('E03: lần sai thứ 5 → màn khoá 15 phút', true);
  await shot(page, 'E03-d', 1300);
  const cd = await page.evaluate(() => document.querySelector('#cdv')._s);
  ok('E03: đếm ngược 14:5x', /^1[45]:\d\d$/.test(cd), cd);
  await page.reload();
  await page.fill('#q', 'khai linh'); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
  await page.waitForSelector('.pg-lock');
  ok('E03: tải lại rồi chọn tên → vẫn màn khoá (nhớ trên máy)', true);
  await close(page);
}
async function E04() {
  console.log('\n== E04 · vừa hết chỗ khi xác nhận ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-18', '20:15'));
    t.fill([['Một', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]], ['Hai', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]],
            ['Ba', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 6 }]]]);
    const page = await open(t, o, 'E04' + k);
    await login(page, 'duc nam', '0001', k === 'd');
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await cell(page, d, h);
    t.fill([['Bốn', '2026-W43', [{ date: '2026-10-21', h: 18 }, { date: '2026-10-22', h: 7 }]]]);   /* người khác chốt trước vài giây */
    await tap(page, k === 'd' ? '#cta' : '#ctaM');
    await page.waitForSelector('#wkb .c.gone');
    ok('E04 ' + k + ': ô T4 18:00 thành "vừa hết", bỏ khỏi lựa chọn (còn 2)', await page.evaluate(() => window.__lt.S.picks.length === 2));
    ok('E04 ' + k + ': chưa ghi dòng nào cho B901DY', t.rows().filter(r => r[16] === 'B901DY').length === 0);
    if (k === 'd') {
      await page.waitForSelector('#floor [data-a="sug"]');
      const sugs = await page.locator('#floor [data-a="sug"]').allTextContents();
      ok('E04 d: 3 giờ gợi ý gần 18:00 nhất của T4: 17:00 · 19:00 · 20:00', sugs.join(',') === '17:00,19:00,20:00', sugs);
      await shot(page, 'E04-d', 1100);
      await page.locator('#floor [data-a="sug"]').nth(1).click();
    } else {
      await page.waitForSelector('#sheet.on');
      await shot(page, 'E04-m', 1000);
      await page.locator('#sheet [data-a="sug"]').nth(1).click();
    }
    await sleep(500);
    ok('E04 ' + k + ': chọn gợi ý 19:00 → lại đủ 3 buổi', await page.evaluate(() => window.__lt.S.picks.map(p => p.date.slice(8) + '@' + p.h).join(',') === '19@18,21@19,23@19'));
    await tap(page, k === 'd' ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk');
    ok('E04 ' + k + ': gửi lại → phiếu 3 buổi', t.rows().filter(r => r[16] === 'B901DY').length === 3);
    await close(page);
  }
}
const ctaSel = desk => desk ? '#cta' : '#ctaM';
const h1 = async page => (await page.textContent('.pg-tk h1')).trim();
const pendOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('lt_pend') || 'null'));
async function waitResend(page) { await page.waitForFunction(() => { const b = document.querySelector(window.innerWidth >= 960 ? '#cta' : '#ctaM'); return b && /Gửi lại/.test(b.textContent) && !b.disabled; }); }
async function E11() {
  console.log('\n== E11 · mất kết nối khi gửi · gửi lại không trùng ==');
  /* A · mạng rớt trước khi tới máy chủ → tải lại trang → lựa chọn còn nguyên → Gửi lại */
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const desk = k === 'd';
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, o, 'E11a' + k);
    await login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await cell(page, d, h);
    t.fail = b => b.action === 'lt_book' ? 'net' : null;
    await tap(page, ctaSel(desk));
    await waitResend(page);
    ok('E11a ' + k + ': nút chốt thành "Gửi lại", header MẤT KẾT NỐI', /mất kết nối/i.test(await page.textContent(desk ? '#sigD' : '#sigM')));
    const pend = await pendOf(page);
    ok('E11a ' + k + ': lệnh chờ lưu trên máy (3 buổi, có mã yêu cầu)', pend && pend.body && pend.body.picks.length === 3 && /^[\w-]{16,}$/.test(pend.body.rid), pend && pend.body);
    await shot(page, 'E11-' + k, 700);
    await page.reload();
    await page.waitForSelector('.pg-book');
    await waitResend(page);
    ok('E11a ' + k + ': tải lại → vẫn màn đặt, 3 buổi đã chọn, nút Gửi lại', await page.evaluate(() => window.__lt.S.picks.length === 3));
    await sleep(4600);   /* lần hỏi lại tự động sau 4 giây: chưa vào sổ → vẫn chờ */
    ok('E11a ' + k + ': chưa vào sổ thì không tự ra phiếu', !!(await page.$('.pg-book')) && t.rows().length === 0);
    t.fail = null;
    await tap(page, ctaSel(desk));
    await page.waitForSelector('.pg-tk');
    const rows = t.rows().filter(r => r[16] === 'B901DY');
    ok('E11a ' + k + ': Gửi lại → "Đã đặt lịch tập!", đúng 3 dòng, cùng mã yêu cầu của lần đầu', /Đã đặt lịch tập/.test(await h1(page)) && rows.length === 3 && rows.every(r => r[15] === pend.body.rid), rows.map(r => r[15]));
    ok('E11a ' + k + ': xoá lệnh chờ sau khi xong', (await pendOf(page)) === null);
    await close(page);
  }
  /* B · máy chủ ghi xong nhưng phản hồi rơi giữa đường */
  for (const [k, o, how] of [['d', DESK, 'doi'], ['m', MOB, 'reload']]) {
    const desk = k === 'd';
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, o, 'E11b' + k);
    await login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await cell(page, d, h);
    t.fail = b => b.action === 'lt_book' ? 'net-after' : null;
    await tap(page, ctaSel(desk));
    await waitResend(page);
    t.fail = null;
    if (how === 'reload') await page.reload();
    await page.waitForSelector('.pg-tk', { timeout: 9000 });
    const rows = t.rows().filter(r => r[16] === 'B901DY');
    ok('E11b ' + k + ' (' + how + '): tự nhận ra lịch đã vào sổ → "Đã đặt lịch tập!", 3 dòng, không gửi lại', /Đã đặt lịch tập/.test(await h1(page)) && rows.length === 3 && t.calls.filter(a => a === 'lt_book').length === 1, { h1: await h1(page), n: rows.length, calls: t.calls });
    ok('E11b ' + k + ': xoá lệnh chờ', (await pendOf(page)) === null);
    await close(page);
  }
  /* C · thêm buổi + đổi lịch mất mạng → tải lại → mở lại đúng màn với lựa chọn cũ */
  {
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, DESK, 'E11c');
    await login(page, 'duc nam', '0001', true);
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18]]) await cell(page, d, h);
    await tap(page, '#cta'); await page.waitForSelector('.pg-tk'); await sleep(300);
    await tap(page, '[data-a="tkdone"]'); await page.waitForSelector(vis('[data-a="goadd"]')); await sleep(400);
    await tap(page, '[data-a="goadd"]'); await page.waitForSelector('.pg-book');
    await cell(page, '2026-10-23', 19);
    t.fail = b => b.action === 'lt_book' ? 'net' : null;
    await tap(page, '#cta'); await waitResend(page);
    await page.reload();
    await page.waitForSelector('.pg-book'); await waitResend(page);
    ok('E11c: thêm buổi mất mạng → tải lại → lại màn thêm buổi, buổi T6 19:00 còn chọn', await page.evaluate(() => window.__lt.S.addMode && window.__lt.S.picks.length === 1 && window.__lt.S.picks[0].h === 19));
    t.fail = null;
    await tap(page, '#cta');
    await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /thêm/i.test(document.querySelector('.pg-tk h1').textContent));
    ok('E11c: Gửi lại → phiếu "đã thêm", 3 buổi', t.rows().filter(r => r[16] === 'B901DY' && r[11] === 'Đã đặt').length === 3);
    await tap(page, '[data-a="tkdone"]'); await page.waitForSelector(vis('[data-a="gochg"]')); await sleep(400);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await cell(page, '2026-10-21', 18); await cell(page, '2026-10-22', 18);
    t.fail = b => b.action === 'lt_change' ? 'net' : null;
    await tap(page, '#cta'); await waitResend(page);
    await page.reload();
    await page.waitForSelector('.pg-chg'); await waitResend(page);
    ok('E11c: đổi lịch mất mạng → tải lại → lại màn đổi, T4 18:00 → T5 18:00 còn nguyên', await page.evaluate(() => { const c = window.__lt.S.chg; return c.from && c.to && c.from.date === '2026-10-21' && c.to.date === '2026-10-22' && c.to.h === 18; }));
    await shot(page, 'E11-chg-d', 600);
    t.fail = null;
    await tap(page, '#cta');
    await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /đổi/i.test(document.querySelector('.pg-tk h1').textContent));
    const rows = t.rows().filter(r => r[16] === 'B901DY');
    ok('E11c: Gửi lại → phiếu "đã đổi", dòng cũ Đã đổi, đúng 1 dòng mới', rows.filter(r => r[11] === 'Đã đổi').length === 1 && rows.filter(r => r[12] === 'Đổi').length === 1, rows.map(r => r.slice(4, 14)));
    /* thoát màn đổi bằng nút quay lại của trình duyệt → bỏ lệnh chờ */
    await tap(page, '[data-a="tkdone"]'); await page.waitForSelector(vis('[data-a="gochg"]')); await sleep(400);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await cell(page, '2026-10-23', 19); await cell(page, '2026-10-24', 19);
    t.fail = b => b.action === 'lt_change' ? 'net' : null;
    await tap(page, '#cta'); await waitResend(page);
    await page.goBack(); await page.waitForSelector(vis('[data-a="gochg"]'));
    ok('E11c: bấm quay lại của trình duyệt → về phiếu, bỏ lệnh chờ', (await pendOf(page)) === null);
    t.fail = null;
    await close(page);
  }
}
async function E08() {
  console.log('\n== E08 · đặt muộn (T3 08:01 · báo trước 12 giờ) ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-20', '08:01'));
    const page = await open(t, o, 'E08' + k);
    await login(page, 'duc nam', '0001', k === 'd');
    await page.waitForSelector('.pg-book');
    await sleep(500);
    const lock = await page.getAttribute('#wkb .c[data-d="2026-10-20"][data-h="20"]', 'aria-disabled');
    const can = await page.getAttribute('#wkb .c[data-d="2026-10-21"][data-h="6"]', 'aria-disabled');
    ok('E08 ' + k + ': T3 20:00 (11 giờ 59) khoá · T4 06:00 (21 giờ 59 — luật cũ 24 giờ khoá) chọn được', lock === 'true' && can === null, [lock, can]);
    const lbl = await page.textContent('#wkb .c[data-d="2026-10-20"][data-h="9"]');
    ok('E08 ' + k + ': ô khoá đầu tiên của T3 ghi "Dưới 12 giờ"', /Dưới 12 giờ/.test(lbl), lbl);
    const n = k === 'd' ? await page.textContent('#floor .nt-t') : await page.textContent('.mnt-t');
    ok('E08 ' + k + ': thông báo đặt muộn', /Đặt muộn/.test(n), n);
    const sig = await page.textContent(k === 'd' ? '#sigD' : '#sigM');
    ok('E08 ' + k + ': header ĐẶT MUỘN', /đặt muộn/i.test(sig), sig);
    await shot(page, 'E08-' + k, 900);
    if (k === 'm') {
      ok('E08 m: có thông báo → ẩn dòng gói dưới lời chào (như Figma)', !(await page.isVisible('.hello .info')));
      await tap(page, '.mnt');
      await page.waitForSelector('#sheet.on');
      ok('E08 m: chạm thông báo → cửa sổ chi tiết', /Đặt muộn/.test(await page.textContent('#sheetT')));
      await shot(page, 'E08-m-sheet', 600);
      await tap(page, '#sheet [data-a="info"]');
      await page.waitForFunction(() => /Gói & luật/.test(document.querySelector('#sheetT') && document.querySelector('#sheetT').textContent));
      ok('E08 m: nút chữ "Gói & luật đặt lịch" đổi cửa sổ sang gói & luật', true);
      await sleep(400);
      await shot(page, 'E08-m-info', 300);
      await tap(page, '#sheet .sh-h [data-a="closesheet"]');
      await page.waitForFunction(() => document.querySelector('#sheet').hidden);
      ok('E08 m: đóng cửa sổ, trả tiêu điểm về thông báo', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('mnt')));
    }
    await close(page);
  }
}
async function E10() {
  console.log('\n== E10 · ngày lễ (tuần 53) ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-12-27', '20:15'), { closures: [['01/01/27', 'Tết Dương lịch']] });
    const page = await open(t, o, 'E10' + k);
    await login(page, 'my ngoc', '0004', k === 'd');
    await page.waitForSelector('.pg-book');
    await sleep(500);
    const dis = await page.$$eval('#wkb .c[data-d="2027-01-01"]', bs => bs.every(b => b.getAttribute('aria-disabled') === 'true'));
    ok('E10 ' + k + ': cả ngày 01.01 khoá', dis);
    const n = k === 'd' ? await page.textContent('#floor .nt-t') : await page.textContent('.mnt-t');
    ok('E10 ' + k + ': thông báo phòng nghỉ 01.01', k === 'd' ? n.trim() === 'Thứ Sáu 01.01 phòng nghỉ Tết Dương lịch.' : /01\.01 phòng nghỉ/.test(n), n);
    if (k === 'd') ok('E10 d: thân thông báo "Ngày nghỉ lễ đã khoá trên bảng…"', /^Ngày nghỉ lễ đã khoá trên bảng\./.test((await page.textContent('#floor .nt-b')).trim()));
    await shot(page, 'E10-' + k, 900);
    await close(page);
  }
  /* bảng B0B bỏ trống lý do → không lặp "phòng nghỉ · Phòng nghỉ" */
  const t = backend(vn('2026-12-27', '20:15'), { closures: [['01/01/27', '']] });
  const page = await open(t, DESK, 'E10b');
  await login(page, 'my ngoc', '0004', true);
  await page.waitForSelector('.pg-book'); await sleep(400);
  const n = (await page.textContent('#floor .nt-t')).trim();
  ok('E10b: lý do trống → "Thứ Sáu 01.01 phòng nghỉ."', n === 'Thứ Sáu 01.01 phòng nghỉ.', n);
  ok('E10b: ô ngày nghỉ ghi "PHÒNG NGHỈ"', /phòng nghỉ/i.test(await page.textContent('#wkb .c[data-d="2027-01-01"][data-h="6"]')));
  await close(page);
}
async function E06E07() {
  console.log('\n== E06 hết hạn giữa tuần · E07 gói 1:2 ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    let t = backend(vn('2026-10-18', '20:15'));
    let page = await open(t, o, 'E06' + k);
    await login(page, 'bao linh', '0003', k === 'd');
    await page.waitForSelector('.pg-book');
    await sleep(500);
    const lim = await page.evaluate(() => window.__lt.S.st.limits);
    ok('E06 ' + k + ': gói hết hạn T4 21.10 → tối đa 3 buổi', lim.max === 3, lim);
    const n = k === 'd' ? await page.textContent('#floor .nt-t') : await page.textContent('.mnt-t');
    ok('E06 ' + k + ': thông báo "Gói hết hạn … 21.10"', /hết hạn/.test(n) && /21\.10/.test(n), n);
    for (const [d, h] of [['2026-10-19', 15], ['2026-10-20', 15], ['2026-10-21', 15]]) await cell(page, d, h);
    await cell(page, '2026-10-22', 15, true);
    ok('E06 ' + k + ': ô sau hạn (T5) không chọn được', await page.evaluate(() => window.__lt.S.picks.length === 3));
    await shot(page, 'E06-' + k, 900);
    await close(page);
    t = backend(vn('2026-10-18', '20:15'));
    page = await open(t, o, 'E07' + k);
    await login(page, 'khai linh', '0002', k === 'd');
    await page.waitForSelector('.pg-book');
    const n7 = k === 'd' ? await page.textContent('#floor .nt-t') : await page.textContent('.mnt-t');
    ok('E07 ' + k + ': thông báo gói 1:2', /1:2/.test(n7), n7);
    await shot(page, 'E07-' + k, 900);
    await close(page);
  }
}
async function E12chg() {
  /* đổi lịch theo luật 22/10: buổi muốn đổi còn < 24 giờ → khoá "Dưới 24 giờ"; khung mới chỉ cần ≥ 12 giờ (luật cũ 24 giờ khoá) */
  console.log('\n== E12 · đổi lịch: buổi muốn đổi ≥ 24 giờ, khung mới ≥ 12 giờ (T3 07:00) ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, o, 'E12' + k);
    const desk = k === 'd';
    await login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    for (const [d, h] of [['2026-10-20', 19], ['2026-10-23', 18]]) await cell(page, d, h);
    await tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk');
    t.clock.now = vn('2026-10-20', '07:00');
    await page.reload();
    await page.waitForSelector(vis('[data-a="gochg"]'));
    await sleep(600);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await sleep(500);
    const src = await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-20"][data-h="19"]'); return [c.getAttribute('aria-disabled'), c.textContent]; });
    ok('E12 ' + k + ': buổi T3 19:00 (còn 12 giờ) khoá "Dưới 24 giờ"', src[0] === 'true' && /Dưới 24 giờ/.test(src[1]), src);
    /* chỉ còn MỘT buổi đổi được (T3 19:00 dưới 24 giờ) → trang tự chọn sẵn T6 18:00; bấm lại là bỏ chọn (bẫy trong runbook) */
    const from0 = await page.evaluate(() => window.__lt.S.chg.from);
    ok('E12 ' + k + ': chỉ T6 18:00 đổi được → trang chọn sẵn làm buổi cần đổi', from0 && from0.date === '2026-10-23' && from0.h === 18, from0);
    if (!from0) await cell(page, '2026-10-23', 18);
    const dst = await page.evaluate(() => ['2026-10-21|6', '2026-10-21|7'].map(x => { const [d, h] = x.split('|'); return document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').getAttribute('aria-disabled'); }));
    ok('E12 ' + k + ': từ T6 18:00 → T4 06:00 (23 giờ) · 07:00 chọn được', dst[0] === null && dst[1] === null, dst);
    await cell(page, '2026-10-21', 6);
    await tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk'); await sleep(400);
    const ses = await page.evaluate(() => window.__lt.S.st.mine.sessions.map(s => s.date + ' ' + s.h).join(','));
    ok('E12 ' + k + ': máy chủ nhận đổi T6 18:00 → T4 06:00', ses === '2026-10-20 19,2026-10-21 6', ses);
    await shot(page, 'E12-' + k, 600);
    await close(page);
  }
}
async function E09drawer() {
  console.log('\n== E09 hết lượt đổi · ngăn kéo / cửa sổ · bàn phím ==');
  for (const [k, o] of [['d', DESK], ['m', MOB]]) {
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, o, 'E09' + k);
    const desk = k === 'd';
    await login(page, 'duc nam', '0001', desk);
    await page.waitForSelector('.pg-book');
    if (desk) {
      /* bàn phím: Tab vào bảng, mũi tên, Enter */
      await page.focus('#wkb .c[tabindex="0"]');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      ok('E09 d: bàn phím — mũi tên + Enter chọn được ô', await page.evaluate(() => window.__lt.S.picks.length === 1), await page.evaluate(() => window.__lt.S.picks));
      await page.keyboard.press('Enter');
      ok('E09 d: Enter lần nữa bỏ chọn', await page.evaluate(() => window.__lt.S.picks.length === 0));
      await tap(page, '[data-a="info"]');
      await page.waitForSelector('#drawer.on');
      await shot(page, '03i-d', 700);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#drawer').hidden);
      ok('E09 d: ngăn kéo Gói & luật mở / Esc đóng', true);
    } else {
      await tap(page, '.info [data-a="info"]');
      await page.waitForSelector('#sheet.on');
      await shot(page, '03i-m', 700);
      await tap(page, '#sheet .sh-h [data-a="closesheet"]');
      await page.waitForFunction(() => document.querySelector('#sheet').hidden);
      ok('E09 m: cửa sổ Gói & luật mở / đóng', true);
    }
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await cell(page, d, h);
    await tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk');
    t.clock.now = vn('2026-10-20', '09:00');
    await page.reload();
    await page.waitForSelector(vis('[data-a="gochg"]'));
    await sleep(600);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await cell(page, '2026-10-21', 18); await cell(page, '2026-10-22', 19);
    await tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk'); await sleep(400);
    await tap(page, '[data-a="tkdone"]'); await page.waitForSelector(vis('[data-a="gochg"]')); await sleep(500);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await cell(page, '2026-10-22', 19); await cell(page, '2026-10-24', 18);
    await tap(page, desk ? '#cta' : '#ctaM');
    await page.waitForSelector('.pg-tk'); await sleep(400);
    await tap(page, '[data-a="tkdone"]'); await page.waitForSelector(vis('[data-a="gochg"]')); await sleep(500);
    await tap(page, '[data-a="gochg"]'); await page.waitForSelector('.pg-chg');
    await sleep(700);
    const trail = desk ? await page.textContent('.trail') : await page.textContent('#mbL');
    ok('E09 ' + k + ': hết lượt đổi, vết đổi T4 18:00 → T5 19:00 → T7 18:00', /T4 18:00 → T5 19:00 → T7 18:00/.test(trail), trail);
    ok('E09 ' + k + ': không còn nút Xác nhận đổi', await page.locator(vis(desk ? '#cta' : '#ctaM')).count() === 0);
    await shot(page, 'E09-' + k, 900);
    /* back về phiếu bằng nút header */
    await tap(page, desk ? '.step.go' : '#stepn');
    await page.waitForSelector(vis('[data-a="gochg"]'));
    ok('E09 ' + k + ': nút quay lại phiếu (header) hoạt động', true);
    await close(page);
  }
}
async function overflow() {
  console.log('\n== Tràn ngang ở mọi cỡ màn ==');
  for (const w of [320, 360, 375, 393, 430, 768, 820, 1024, 1280, 1440, 1920]) {
    const t = backend(vn('2026-10-18', '20:15'));
    const mob = w < 960;
    const page = await open(t, { viewport: { width: w, height: mob ? 740 : 820 }, deviceScaleFactor: 1, isMobile: mob, hasTouch: mob }, 'ov' + w);
    const over = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.waitForSelector('#q');
    const a = await over();
    await login(page, 'duc nam', '0001', !mob);
    await page.waitForSelector('.pg-book'); await sleep(600);
    const b = await over();
    for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18]]) await cell(page, d, h);
    await tap(page, mob ? '#ctaM' : '#cta');
    await page.waitForSelector('.pg-tk'); await sleep(1800);
    const c = await over();
    ok('Rộng ' + w + 'px: không tràn ngang (tìm tên ' + a + ' · bảng ' + b + ' · phiếu ' + c + ')', a <= 0 && b <= 0 && c <= 0);
    if ([320, 768, 1024].indexOf(w) >= 0) { await shot(page, 'w' + w + '-phieu', 200); }
    await close(page);
  }
}
async function reduced() {
  console.log('\n== Giảm chuyển động ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const page = await open(t, Object.assign({ reducedMotion: 'reduce' }, DESK), 'rm');
  await login(page, 'duc nam', '0001', true);
  await page.waitForSelector('.pg-book');
  for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18]]) await cell(page, d, h);
  await page.click('#cta');
  await page.waitForSelector('.pg-tk');
  ok('Giảm chuyển động: đi hết luồng, không lỗi', true);
  await close(page);
}

(async () => {
  browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  server = await startServer();
  const only = process.argv[2];
  const all = { E01, E03, E04, E11, E08, E12chg, E10, E06E07, E09drawer, overflow, reduced };
  process.on('unhandledRejection', e => { console.error(e); process.exit(2); });
  for (const k of Object.keys(all)) if (!only || only.split(',').indexOf(k) >= 0) await all[k]();
  console.log('\n  console/pageerror:', ERRS.length ? ERRS : 'none');
  ok('0 lỗi console / pageerror', ERRS.length === 0, ERRS);
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
