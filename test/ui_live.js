/* Kênh live (1.2.0) trên trang thật + máy chủ giả của chế độ QC (qc.js: kênh live giả, cùng mã Worker), desktop + mobile.
   node test/ui_live.js
   1. Khôi mở bảng · QC "Người khác vừa đặt" → trang tự hỏi lại (không tải lại trang), phòng thêm đúng 1 suất
   2. Khôi chọn T5 09:00 (còn 1) · người khác đặt đúng khung đó → báo "vừa có người đặt trước" NGAY, trước khi bấm Đặt lịch
   3. "Thêm 2 người đang xem" → dưới chân B0B "3 người đang xem" · tắt → ẩn
   4. Phiếu đang mở · người khác đặt → không dựng lại vé (cùng phần tử), vẫn hỏi lại
   5. Đường kết nối thật của trang (không QC) với máy chủ live giả của ui_harness: nối · bump → hỏi lại (gom tin dồn) · máy chủ đóng →
      nối lại + hỏi lại · ẩn tab → đóng, hiện lại → nối lại · máy chủ không có kênh (Worker cũ) → thử tối đa 4 lần rồi thôi */
'use strict';
const { chromium } = require('playwright');
const { startServer, backend, attach, vn, API } = require('./ui_harness');
const EXE = require('./pw_exe'), ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } }
async function waitView(page, v) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: 10000 }); }
async function run(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' ==');
  const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.route(API + '**', r => r.abort());
  let sockets = 0; page.on('websocket', () => { sockets++; });
  await page.goto(server.url + 'img/favicon.svg'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(server.url + '?qc&tk3d=0'); await page.waitForSelector('.qc-tab');
  const qc = async sel => {
    await page.click('.qc-tab'); await page.waitForSelector('#qcp:not([hidden])');
    await page.click('#qcp ' + sel); await sleep(150);
    await page.focus('#qcT'); await page.keyboard.press('Escape'); await page.waitForSelector('#qcp', { state: 'hidden' });
  };
  const login = async (q, pin) => {
    await waitView(page, 'find');
    await page.fill('#q', q); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
    await waitView(page, 'verify'); await page.focus('#pin'); await page.keyboard.type(pin);
    await page.locator(mobile ? '#vgoM' : '#vgo').click();
  };
  const seats = () => page.evaluate(() => Object.values(window.__lt.S.st.taken || {}).reduce((a, b) => a + b, 0));
  const fetched = () => page.evaluate(() => window.__lt.S.lastFetch);

  /* 1 */
  await login('minh khoi', '1111'); await waitView(page, 'book'); await sleep(900);
  const loads = await page.evaluate(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin);
  const s0 = await seats(), f0 = await fetched();
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f0, { timeout: 6000 }).catch(() => {});
  const s1 = await seats(), last = await page.evaluate(() => (document.querySelector('#qcLast') || {}).textContent || '');
  ok('Người khác vừa đặt → trang tự hỏi lại, phòng thêm đúng 1 suất (không tải lại trang)',
     s1 === s0 + 1 && (await page.evaluate(() => performance.getEntriesByType('navigation').length + ':' + performance.timeOrigin)) === loads, [s0, s1, last]);
  ok('Chế độ QC không mở kết nối mạng thật nào', sockets === 0, sockets);

  /* 2 */
  const free = await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-22"][data-h="9"]'); return c ? [c.className, c.textContent] : null; });
  await page.locator('#wkb .c[data-d="2026-10-22"][data-h="9"] >> visible=true').first().click(); await sleep(200);
  const picked = await page.evaluate(() => window.__lt.S.picks.map(p => p.date + ' ' + p.h));
  await qc('[data-qc="other"]');
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'gone', null, { timeout: 6000 }).catch(() => {});
  const n2 = await page.evaluate(() => ({ n: window.__lt.S.notice, picks: window.__lt.S.picks.length, cell: (document.querySelector('#wkb .c[data-d="2026-10-22"][data-h="9"]') || {}).className }));
  ok('Đang chọn T5 09:00 (còn 1) · người khác đặt đúng khung đó → "vừa có người đặt trước" ngay, bỏ khỏi lựa chọn, chưa bấm Đặt lịch',
     !!free && /Còn 1|1/.test(free[1]) && picked.join() === '2026-10-22 9' && n2.n && n2.n.type === 'gone' && /09:00 vừa có người đặt trước/.test(n2.n.title) && n2.picks === 0, [free, picked, n2]);
  if (mobile) { await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {}); await page.keyboard.press('Escape'); await sleep(400); }

  /* 3 */
  await qc('[data-qc="watch"]');
  await page.waitForFunction(() => { const c = document.querySelector('.bob-cap.on'); return c && c.textContent === '3 người đang xem'; }, null, { timeout: 4000 }).catch(() => {});
  const cap = await page.evaluate(m => { const h = document.querySelector(m ? '.bob-m' : '#bobD'), c = h && h.querySelector('.bob-cap'); if (!c) return null;
    const r = c.getBoundingClientRect(), b = h.getBoundingClientRect(); return { on: c.classList.contains('on'), t: c.textContent, below: r.top >= b.bottom - 1, inView: r.left >= 0 && r.right <= innerWidth + 0.5 }; }, mobile);
  ok('Thêm 2 người đang xem → dưới chân B0B "3 người đang xem" (nằm dưới B0B, trong màn hình)', !!cap && cap.on && cap.t === '3 người đang xem' && cap.below && cap.inView, cap);
  await qc('[data-qc="watch"]');
  await page.waitForFunction(() => !document.querySelector('.bob-cap.on'), null, { timeout: 4000 }).catch(() => {});
  ok('Tắt → chỉ còn mình → câu ẩn', await page.evaluate(() => !document.querySelector('.bob-cap.on')));

  /* 4 */
  await page.locator('#wkb .c[data-d="2026-10-19"][data-h="18"] >> visible=true').first().click();
  await page.locator('#wkb .c[data-d="2026-10-21"][data-h="7"] >> visible=true').first().click();
  await page.locator(mobile ? '#ctaM' : '#cta').click();
  await waitView(page, 'ticket'); await sleep(1500);
  await page.evaluate(() => { window.__tkEl = document.querySelector('#tkW, #tkT'); });
  const f4 = await fetched();
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f4, { timeout: 6000 }).catch(() => {});
  await sleep(400);
  const same = await page.evaluate(f => ({ fetched: window.__lt.S.lastFetch > f, same: !!window.__tkEl && window.__tkEl === document.querySelector('#tkW, #tkT') && window.__tkEl.isConnected, view: window.__lt.S.view }), f4);
  ok('Phiếu đang mở · người khác đặt → vẫn hỏi lại nhưng không dựng lại vé (cùng phần tử)', same.fetched && same.same && same.view === 'ticket', same);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}
async function until(f, ms) { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; }
async function real(browser, server) {
  console.log('\n== kết nối thật của trang · máy chủ live giả (ui_harness) ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await attach(page, t);
  await page.goto(server.url + 'img/favicon.svg'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(server.url + '?live'); await waitView(page, 'find');
  const urls = t.liveUrls;
  ok('Mở trang → một kết nối live tới wss://…/live?dev=<mã máy>', await until(() => t.liveWs.length === 1, 4000) &&
     /^wss:\/\/b0dy-booking-api\.[^/]+\/live\?dev=[A-Za-z0-9_-]{16,64}$/.test(urls[0] || ''), urls);
  await page.fill('#q', 'thu mot'); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
  await waitView(page, 'verify'); await page.focus('#pin'); await page.keyboard.type('0001'); await page.locator('#vgo').click();
  await waitView(page, 'book'); await sleep(800);
  const boots = () => t.calls.filter(a => a === 'lt_boot').length;
  let b0 = boots();
  t.liveSend({ t: 'bump', r: 1 });
  ok('Tin bump → trang hỏi lại state (lt_boot) trong < 1,5 s', await until(() => boots() === b0 + 1, 1500), [b0, boots()]);
  await sleep(900); b0 = boots();
  t.liveSend({ t: 'bump', r: 2 }); t.liveSend({ t: 'bump', r: 3 }); t.liveSend({ t: 'bump', r: 4 });
  await sleep(1500);
  ok('Ba tin dồn dập → chỉ hỏi lại một lần', boots() === b0 + 1, [b0, boots()]);
  t.liveSend({ t: 'n', n: 3 });
  ok('Tin n: 3 → dưới chân B0B "3 người đang xem"', await until(() => page.evaluate(() => { const c = document.querySelector('#bobD .bob-cap.on'); return !!c && c.textContent === '3 người đang xem'; }), 2000));
  b0 = boots(); const c0 = t.liveConns;
  t.liveWs[0].close({ code: 1001, reason: 'tat' });
  ok('Máy chủ đóng kết nối → trang nối lại (~1 s) rồi hỏi lại vì có thể đã lỡ tin', await until(() => t.liveConns === c0 + 1 && t.liveWs.length === 1, 4000) && await until(() => boots() > b0, 2000), [t.liveConns, boots()]);
  ok('Mất kết nối thì câu "đang xem" ẩn tới khi máy chủ báo lại', await page.evaluate(() => !document.querySelector('#bobD .bob-cap.on')));
  const vis = v => page.evaluate(v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await vis('hidden');
  ok('Ẩn tab → đóng kết nối', await until(() => t.liveWs.length === 0, 2000));
  const c1 = t.liveConns;
  await vis('visible');
  ok('Hiện lại → nối lại', await until(() => t.liveConns === c1 + 1 && t.liveWs.length === 1, 3000), [c1, t.liveConns]);
  t.liveRefuse = true; const c2 = t.liveConns;
  t.liveWs[0].close({ code: 1001, reason: 'tat' });
  await sleep(34000);                                       /* lui 1 · 3 · 8 · 20 s → lần thử thứ 4 ở giây ~32 */
  const tries = t.liveConns - c2;
  await sleep(6000);
  ok('Máy chủ không có kênh (Worker cũ) → thử đúng 4 lần rồi thôi, không thử tiếp', tries === 4 && t.liveConns - c2 === 4, [tries, t.liveConns - c2]);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  await run(browser, server, false);
  await run(browser, server, true);
  await real(browser, server);
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
