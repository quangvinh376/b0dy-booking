/* Chế độ QC (?qc): trang thật + máy chủ giả trong trình duyệt (qc.js chạy đúng BookingCore của Worker) với dữ liệu giả.
   Kiểm: không một lệnh nào ra máy chủ thật · bộ nhớ máy tách tiền tố qc: (mã nhớ máy thật không bị đụng) · nút QC không đè header ·
   đặt lịch ghi vào sổ giả · tải lại vẫn nhớ máy · gây lỗi (mất phản hồi, người khác giữ khung, mất mạng hoàn toàn) · chưa có SĐT ·
   kịch bản giữa tuần (điểm danh, luật 24 giờ) · trước giờ mở tự mở lúc 06:00 · bảng QC dùng được bằng bàn phím, không bị ngăn kéo
   của trang khoá · thoát QC xoá sạch khoá qc: / qcsrv: · desktop + mobile · 0 lỗi console.
   node test/ui_qc.js */
'use strict';
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');

const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); }
}
/* mã nhớ máy + lịch "thật" giả lập: chế độ QC không được đọc / sửa / xoá */
const REAL = { lt_tok: 'REAL-token-khong-duoc-dung', lt_tokExp: '9999999999999', lt_dev: 'realDEVICEaaaaaaaaaaaa', lt_st: '{"that":1}', lt_skew: '0' };

async function open(browser, server, mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
                                              : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const t = { page, ctx, errs: [], hits: 0, watch: true, desk: !mobile };
  page.on('pageerror', e => { if (t.watch) t.errs.push('pageerror: ' + e.message); });
  page.on('console', m => { if (t.watch && m.type() === 'error') t.errs.push('console: ' + m.text()); });
  await page.route(API + '**', r => { t.hits++; r.abort(); });
  /* đặt khoá "thật" trên cùng origin trước khi mở ?qc */
  await page.goto(server.url + 'img/favicon.svg');
  await page.evaluate(real => { localStorage.clear(); sessionStorage.clear(); Object.keys(real).forEach(k => localStorage.setItem(k, real[k])); }, REAL);
  await page.goto(server.url + '?qc');
  await page.waitForSelector('.qc-tab');
  return t;
}
const view = page => page.evaluate(() => window.__lt.S.view);
async function waitView(page, v, ms) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: ms || 8000 }); }
async function panel(page, on) {
  const hidden = await page.evaluate(() => document.querySelector('#qcp').hidden);
  if (hidden === !on) return;
  if (on) { await page.click('.qc-tab'); await page.waitForSelector('#qcp:not([hidden])'); }
  else { await page.focus('#qcT'); await page.keyboard.press('Escape'); await page.waitForSelector('#qcp', { state: 'hidden' }); }
}
/** bấm một nút trong bảng QC; reload=true: nút làm trang tải lại */
async function qc(page, sel, reload) {
  await panel(page, true);
  if (reload) { await Promise.all([page.waitForEvent('load'), page.click('#qcp ' + sel)]); await page.waitForSelector('.qc-tab'); await sleep(300); }
  else await page.click('#qcp ' + sel);
}
/** đăng xuất trang QC (như "Không phải bạn?") rồi tải lại */
async function signOut(page) {
  await page.evaluate(() => { [localStorage, sessionStorage].forEach(s => Object.keys(s).filter(k => k.indexOf('qc:') === 0 && k !== 'qc:lt_dev').forEach(k => s.removeItem(k))); });
  await page.reload(); await page.waitForSelector('.qc-tab');
}
async function login(t, q, pick, pin) {
  const page = t.page;
  await waitView(page, 'find');
  await page.fill('#q', q);
  await page.waitForSelector('.rrow');
  const rows = await page.$$eval('.rrow .nm', els => els.map(e => e.textContent));
  const i = rows.indexOf(pick);
  await page.locator('.rrow').nth(i < 0 ? 0 : i).click();
  await waitView(page, 'verify');
  await page.focus('#pin');
  await page.keyboard.type(pin);
  await page.locator(t.desk ? '#vgo' : '#vgoM').click();
  return rows;
}
async function book(t, picks) {
  const page = t.page;
  await waitView(page, 'book');
  for (const [d, h] of picks) await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first().click();
  await page.locator(t.desk ? '#cta' : '#ctaM').click();
}
/** dòng sổ giả tuần 43 của một mã KH (đọc thẳng bảng tính giả đã lưu) */
async function soOf(page, kh) {
  return page.evaluate(kh => {
    const g = JSON.parse(localStorage.getItem('qcsrv:g')), rows = g['qc-out'].find(x => x.title === 'Sổ đặt lịch').rows;
    return rows.slice(4).filter(r => r && r[16] === kh && r[3] === '2026-W43').map(r => ({ d: r[4], h: r[6], st: r[11], act: r[12], rid: r[15] }));
  }, kh);
}
/** số mục nhật ký ghi sau còn chờ lên sổ giả (khoá 'j:' trong storage giả của Durable Object) */
async function pending(page) { return page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qcsrv:do') || '{}')).filter(k => k.indexOf('j:') === 0).length); }
async function flushed(page) { for (let i = 0; i < 40 && (await pending(page)) > 0; i++) await sleep(100); }
function overlap(a, b) { return a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height; }
/** khung chữ nhật của các phần tử đang hiện (ẩn → null) */
async function boxes(page, sels) {
  return page.evaluate(ss => ss.map(s => { const e = document.querySelector(s), r = e && e.getBoundingClientRect(); return r && r.width && r.height ? { s, x: r.x, y: r.y, width: r.width, height: r.height } : null; }), sels);
}
async function realKeys(page) { return page.evaluate(real => Object.keys(real).every(k => localStorage.getItem(k) === real[k]), REAL); }
async function strayKeys(page) {
  return page.evaluate(real => [localStorage, sessionStorage].flatMap(s => Object.keys(s)).filter(k => !(k in real) && k.indexOf('qc:') !== 0 && k.indexOf('qcsrv:') !== 0 && k !== 'tk3d'), REAL);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();

  console.log('\n== desktop 1440×900 ==');
  const t = await open(browser, server, false), page = t.page;
  await waitView(page, 'find');
  ok('Lần đầu mở ?qc: kịch bản CN 18.10 07:00, trang tìm tên', (await page.textContent('#clock')).indexOf('CN 18.10 · 07:0') >= 0, await page.textContent('#clock'));
  const bx = await boxes(page, ['.qc-tab', '.wm', '#sig', '#steps', '#clock']);
  ok('Nút QC ở mép trên giữa, cao ≈ 18 px, không đè wordmark / tín hiệu / các bước / đồng hồ',
     bx[0] && bx[0].y === 0 && Math.abs(bx[0].height - 18) < 1 && bx.slice(1).every(b => !b || !overlap(bx[0], b)), bx);

  /* đặt lịch: Trịnh Minh Khôi · 1111 → T2 18:00 + T4 07:00 */
  await login(t, 'minh khoi', 'T. Minh Khôi', '1111');
  ok('Khách tập thử T3 07:00 do Quyết tiếp nhận → Minh Khôi (Quyết) thấy khung đó "Coach bận", phòng 1 suất',
     await page.evaluate(() => { const s = window.__lt.S.st; return s.coachAt['2026-10-20|7'] === 'busy' && s.taken['2026-10-20|7'] === 1; }));
  await book(t, [['2026-10-19', 18], ['2026-10-21', 7]]);
  await waitView(page, 'ticket');
  await flushed(page);
  let rows = await soOf(page, 'B801DY');
  ok('Đặt 2 buổi → phiếu · sổ giả có đúng 2 dòng "Đã đặt" (máy chủ giả đã ghi nhật ký lên sổ)', rows.length === 2 && rows.every(r => r.st === 'Đã đặt' && r.act === 'Đặt'), rows);
  await panel(page, true);
  const tbl = await page.textContent('#qcTbl');
  ok('Bảng QC hiện 2 dòng mới trong sổ giả', (tbl.match(/Trịnh Minh Khôi/g) || []).length === 2, tbl.slice(0, 200));
  ok('Bảng QC: hàng chờ ghi = 0', /chờ ghi lên sổ: 0/.test(await page.textContent('#qcMeta')), await page.textContent('#qcMeta'));
  await panel(page, false);
  ok('Esc trong bảng QC → đóng, tiêu điểm về nút QC', await page.evaluate(() => document.activeElement === document.querySelector('.qc-tab')));
  await page.reload(); await page.waitForSelector('.qc-tab');
  await waitView(page, 'ticket');
  ok('Tải lại → nhớ máy (bộ nhớ qc:) → vào thẳng phiếu', true);
  ok('Mã nhớ máy / lịch THẬT trên máy không bị đọc, sửa hay xoá', await realKeys(page));
  ok('Không có khoá nào ngoài qc: / qcsrv: được ghi thêm', (await strayKeys(page)).length === 0, await strayKeys(page));

  /* tua +1 giờ: giữ dữ liệu + phiên · phòng nghỉ T7: bật → ngày 24.10 đóng, tắt → mở lại */
  await qc(page, '[data-qc="tua"][data-ms="3600000"]', true);
  await waitView(page, 'ticket');
  ok('Tua +1 giờ → đồng hồ CN 18.10 · 08:0x, vẫn nhớ máy, phiếu giữ nguyên', /CN 18\.10 · 08:0/.test(await page.textContent('#clock')) && (await soOf(page, 'B801DY')).length === 2, await page.textContent('#clock'));
  await qc(page, '[data-qc="nghi"]', true);
  await waitView(page, 'ticket');
  ok('Bật "T7 24.10 phòng nghỉ" → máy chủ giả báo ngày 24.10 đóng', await page.evaluate(() => window.__lt.S.st.week.closed['2026-10-24'] === 'Bảo trì phòng tập'));
  await qc(page, '[data-qc="nghi"]', true);
  await waitView(page, 'ticket');
  ok('Tắt → ngày 24.10 mở lại', await page.evaluate(() => !('2026-10-24' in window.__lt.S.st.week.closed)));
  await panel(page, false);

  /* mất phản hồi · đã ghi: Hà Minh Quân (trùng tên với Lục Minh Quân) */
  await signOut(page);
  await qc(page, '[data-qc="fault"][data-k="lost"]');
  ok('Gây lỗi "Mất phản hồi · đã ghi" bật', (await page.getAttribute('#qcp [data-k="lost"]', 'aria-pressed')) === 'true');
  await panel(page, false);
  const found = await login(t, 'minh quan', 'H. Minh Quân', '9999');
  ok('Gõ "minh quan" → hai người trùng tên (H. và L. Minh Quân)', found.length === 2 && found.indexOf('H. Minh Quân') >= 0 && found.indexOf('L. Minh Quân') >= 0, found);
  /* bảng QC khi ngăn kéo "Gói & luật" của trang đang mở: vẫn bấm được, Tab không bị kéo ra, Esc chỉ đóng bảng QC */
  await waitView(page, 'book');
  await page.locator('[data-a="info"] >> visible=true').first().click();
  await page.waitForSelector('#drawer.on');
  await qc(page, '[data-qc="slow"]');
  ok('Ngăn kéo của trang đang mở: bảng QC vẫn bấm được (Mạng chậm bật)', (await page.getAttribute('#qcp [data-qc="slow"]', 'aria-pressed')) === 'true');
  await page.focus('#qcp [data-qc="slow"]');
  await page.keyboard.press('Tab');
  ok('Tab trong bảng QC không bị ngăn kéo của trang kéo ra ngoài', await page.evaluate(() => document.querySelector('#qcp').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#qcp', { state: 'hidden' });
  ok('Esc đóng bảng QC, ngăn kéo của trang vẫn mở', await page.evaluate(() => document.querySelector('#drawer').classList.contains('on')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await qc(page, '[data-qc="slow"]');
  ok('Tắt mạng chậm', (await page.getAttribute('#qcp [data-qc="slow"]', 'aria-pressed')) === 'false');
  await panel(page, false);

  await book(t, [['2026-10-20', 6], ['2026-10-22', 6]]);
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'net', null, { timeout: 8000 });
  ok('Phản hồi rơi → trang báo chưa xác nhận (Gửi lại)', true);
  await waitView(page, 'ticket', 15000);
  await flushed(page);
  rows = await soOf(page, 'B809DY');
  ok('Trang tự nhận ra lệnh đã vào sổ → phiếu · sổ giả đúng 2 dòng, không ghi trùng', rows.length === 2 && new Set(rows.map(r => r.rid)).size === 1, rows);
  await panel(page, true);
  ok('Bảng QC ghi lại lỗi vừa áp dụng, nút về trạng thái tắt', /Vừa áp dụng: Mất phản hồi/.test(await page.textContent('#qcLast')) && (await page.getAttribute('#qcp [data-k="lost"]', 'aria-pressed')) === 'false');
  await panel(page, false);

  /* người khác vừa giữ khung: Lục Minh Quân chọn T3 06:00 (Hà Minh Quân đã có 1) + T6 06:00 */
  await signOut(page);
  await qc(page, '[data-qc="fault"][data-k="taken"]');
  await panel(page, false);
  await login(t, 'luc minh quan', 'L. Minh Quân', '1010');
  await book(t, [['2026-10-20', 6], ['2026-10-23', 6]]);
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'gone', null, { timeout: 8000 });
  ok('Người khác vừa giữ khung → E04 "vừa có người đặt trước"', /vừa có người đặt trước/.test(await page.textContent('body')));
  await flushed(page);
  const slot = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('qcsrv:g')), rows = g['qc-out'].find(x => x.title === 'Sổ đặt lịch').rows;
    return rows.slice(4).filter(r => r && r[3] === '2026-W43' && r[4] === '2026-10-20' && r[6] === '06:00' && r[11] === 'Đã đặt').length;
  });
  ok('Khung T3 06:00 kín 4/4 · Lục Minh Quân chưa có dòng nào', slot === 4 && (await soOf(page, 'B810DY')).length === 0, { slot });

  /* gói 1:2 (chủ studio chốt 18/10): Tạ Uyển Nhi · khung ghép, lời mời của Tuấn Kiệt → Tập cùng → máy chủ bận → gửi lại → phiếu ·
     mời Thục Quyên · từ chối lời mời của Thảo Vy · Thục Quyên mở trang thấy lời mời → Tập cùng → tập đôi */
  await signOut(page);
  await qc(page, '[data-qc="fault"][data-k="busy"]');
  await panel(page, false);
  await login(t, 'uyen nhi', 'T. Uyển Nhi', '5555');
  await waitView(page, 'book');
  const hrs = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#wkb .c')).map(c => +c.dataset.h))));
  ok('Gói 1:2 → bảng chỉ các khung ghép 09 · 11 · 15 · 17 · 19', hrs.join() === '9,11,15,17,19', hrs);
  ok('Lời mời của Tuấn Kiệt hiện ở sàn: "Tuấn Kiệt mời bạn tập đôi." + Tập cùng / Không, cảm ơn',
     /Tuấn Kiệt mời bạn tập đôi/.test(await page.textContent('.floor')) && (await page.locator('.floor [data-a="invok"]').count()) === 1 && (await page.locator('.floor [data-a="invno"]').count()) === 1);
  const cls = k => page.evaluate(k => { const [d, h] = k.split('|'); const c = document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]'); return c ? c.className + ' · ' + c.textContent : 'none'; }, k);
  ok('T3 17:00 phòng đầy vẫn ghép được: ô "Ghép · Tuấn Kiệt" + chấm lời mời', /join/.test(await cls('2026-10-20|17')) && /inv/.test(await cls('2026-10-20|17')) && /Tuấn Kiệt/.test(await cls('2026-10-20|17')), await cls('2026-10-20|17'));
  ok('T2 15:00 cặp 1:2 của Lâm đã đủ → ô gạch X, không chữ (không nói lý do)', /\bfull\b/.test(await cls('2026-10-19|15')) && / · $/.test(await cls('2026-10-19|15')) &&
     await page.evaluate(() => !!document.querySelector('#wkb .c[data-d="2026-10-19"][data-h="15"] svg.gx')), await cls('2026-10-19|15'));
  ok('T2 10:00 (ngoài khung ghép) không có trên bảng', (await cls('2026-10-19|10')) === 'none');
  await page.locator('.floor [data-a="invok"]').click();
  ok('Tập cùng → chọn sẵn T3 17:00', JSON.stringify(await page.evaluate(() => window.__lt.S.picks)) === '[{"date":"2026-10-20","h":17}]', await page.evaluate(() => window.__lt.S.picks));
  const next = await page.waitForFunction(() => /Thảo Vy mời bạn tập đôi/.test(document.querySelector('.floor').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  ok('Lời mời kế tiếp (Thảo Vy · T7 15:00) lên sàn', next, await page.textContent('.floor'));
  await book(t, [['2026-10-21', 9]]);
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'busy', null, { timeout: 8000 });
  ok('Máy chủ bận → trang báo bận, chưa ghi gì', (await soOf(page, 'B805DY')).length === 0);
  await page.locator('#cta').click();
  await waitView(page, 'ticket');
  await flushed(page);
  ok('Gửi lại → phiếu · sổ giả đúng 2 dòng', (await soOf(page, 'B805DY')).length === 2);
  ok('Phiếu: T3 17:00 tập đôi cùng Tuấn Kiệt', await page.evaluate(() => window.__lt.S.st.duo.pairs['2026-10-20|17'] === 'Tuấn Kiệt'));
  ok('Dòng Tập đôi trên phiếu báo lời mời của Thảo Vy', /Thảo Vy mời bạn tập đôi/.test(await page.textContent('#prLine')));
  await page.locator('#prLine .prl').click();
  await page.waitForSelector('#drawer.on');
  await page.locator('#drawer [data-a="invpick"][data-d="2026-10-21"]').click();
  await page.locator('#drawer .pr-opt:has-text("Thục Quyên")').click();
  ok('Chọn người mời: Thục Quyên được chọn (radio)', (await page.getAttribute('#drawer .pr-opt:has-text("Thục Quyên")', 'aria-checked')) === 'true');
  await page.locator('#drawer [data-a="invsend"]').click();
  await page.waitForFunction(() => /Đã mời Thục Quyên/.test(document.querySelector('#drawer').textContent), null, { timeout: 8000 });
  await flushed(page);
  rows = await soOf(page, 'B805DY');
  ok('Mời → sổ giả thêm dòng "Mời", phiếu không đổi bản', rows.length === 3 && rows[2].st === 'Mời' && rows[2].act === 'Mời' && await page.evaluate(() => window.__lt.S.st.mine.ver === 1), rows);
  ok('Tiêu điểm về nút "Đổi người" của buổi vừa mời', await page.evaluate(() => document.activeElement && document.activeElement.dataset.a === 'invpick' && document.activeElement.dataset.d === '2026-10-21'));
  await page.locator('#drawer [data-a="invno"]').click();
  await page.waitForFunction(() => !document.querySelector('#drawer [data-a="invno"]'), null, { timeout: 8000 });
  await flushed(page);
  rows = await soOf(page, 'B805DY');
  ok('Không, cảm ơn → sổ giả thêm dòng "Từ chối" (lời mời của Thảo Vy hết hiện)', rows.length === 4 && rows[3].st === 'Từ chối' && rows[3].d === '2026-10-24', rows);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#drawer', { state: 'hidden' });
  await signOut(page);
  await login(t, 'thuc quyen', 'M. Thục Quyên', '1212');
  await waitView(page, 'book');
  const seen = await page.waitForFunction(() => { const t = document.querySelector('.floor').textContent; return /Uyển Nhi mời bạn tập đôi/.test(t) && /Thứ Tư 21\.10 · 09:00/.test(t); }, null, { timeout: 4000 }).then(() => true, () => false);
  ok('Thục Quyên mở trang → thấy lời mời của Uyển Nhi (T4 21.10 · 09:00)', seen, await page.textContent('.floor'));
  await page.locator('.floor [data-a="invok"]').click();
  await book(t, [['2026-10-22', 11]]);
  await waitView(page, 'ticket');
  await flushed(page);
  ok('Thục Quyên đặt → T4 09:00 tập đôi cùng Uyển Nhi', await page.evaluate(() => window.__lt.S.st.duo.pairs['2026-10-21|9'] === 'Uyển Nhi'), await page.evaluate(() => window.__lt.S.st.duo));

  /* mất mạng · chưa ghi: Đặng Quốc Bảo (hết hạn T4 21.10) → báo lỗi → gửi lại → phiếu */
  await signOut(page);
  await qc(page, '[data-qc="fault"][data-k="drop"]');
  await panel(page, false);
  await login(t, 'quoc bao', 'Đ. Quốc Bảo', '3333');
  await waitView(page, 'book');
  const exp = await page.evaluate(() => ['2026-10-21|8', '2026-10-22|8', '2026-10-24|8'].map(k => { const [d, h] = k.split('|'); return document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').getAttribute('aria-disabled'); }));
  ok('Gói hết hạn T4 21.10 → T4 còn đặt được, T5 và T7 khoá (E06)', exp[0] !== 'true' && exp[1] === 'true' && exp[2] === 'true', exp);
  await book(t, [['2026-10-19', 8], ['2026-10-21', 8]]);
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'net', null, { timeout: 8000 });
  ok('Mất mạng · chưa ghi → trang báo, sổ giả chưa có dòng nào', (await soOf(page, 'B803DY')).length === 0);
  await page.locator('#cta').click();
  await waitView(page, 'ticket');
  await flushed(page);
  ok('Gửi lại → phiếu · sổ giả đúng 2 dòng', (await soOf(page, 'B803DY')).length === 2);

  /* gói bắt đầu giữa tuần: Lương Thùy Dung → T2, T3 khoá */
  await signOut(page);
  await login(t, 'thuy dung', 'L. Thùy Dung', '4444');
  await waitView(page, 'book');
  const st0 = await page.evaluate(() => ['2026-10-19|8', '2026-10-20|8', '2026-10-21|8'].map(k => { const [d, h] = k.split('|'); return document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').getAttribute('aria-disabled'); }));
  ok('Gói bắt đầu T4 21.10 → T2, T3 khoá, T4 đặt được', st0[0] === 'true' && st0[1] === 'true' && st0[2] !== 'true', st0);

  /* hồ sơ chưa có SĐT */
  await signOut(page);
  await login(t, 'gia huy', 'C. Gia Huy', '1234');
  await page.waitForFunction(() => document.querySelector('#perr') && document.querySelector('#perr').textContent.length > 0, null, { timeout: 8000 });
  ok('Hồ sơ chưa có SĐT → "chưa có số điện thoại để xác minh"', /chưa có số điện thoại/.test(await page.textContent('#perr')), await page.textContent('#perr'));

  /* mất mạng hoàn toàn: đã đăng nhập (Trịnh Minh Khôi) → tải lại → phiếu từ bộ nhớ + header "Mất kết nối" */
  await signOut(page);
  await login(t, 'minh khoi', 'T. Minh Khôi', '1111');
  await waitView(page, 'ticket');
  await qc(page, '[data-qc="offline"]', true);
  await waitView(page, 'ticket');
  await page.waitForFunction(() => /Mất kết nối/.test(document.querySelector('#sigD').textContent), null, { timeout: 8000 });
  ok('Mất mạng hoàn toàn → phiếu từ bộ nhớ máy + header "Mất kết nối"', true);
  await qc(page, '[data-qc="offline"]', true);
  await page.waitForFunction(() => /Đang mở đặt/.test(document.querySelector('#sigD').textContent), null, { timeout: 8000 });
  ok('Có mạng lại → header "Đang mở đặt · Tuần 43"', true);

  /* kịch bản giữa tuần: T4 21.10 08:30 */
  await qc(page, '[data-qc="scn"][data-k="giua"]', true);
  await waitView(page, 'find');
  ok('Đổi kịch bản → trang đăng xuất, đồng hồ T4 21.10 · 08:3x', /T4 21\.10 · 08:3/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  ok('Đổi kịch bản → sổ giả làm lại (Trịnh Minh Khôi chưa có dòng nào)', (await soOf(page, 'B801DY')).length === 0);
  await login(t, 'dieu linh', 'P. Diệu Linh', '7777');
  await waitView(page, 'ticket');
  const ses = await page.evaluate(() => window.__lt.S.st.mine.sessions.map(s => s.date + ' ' + s.h + ' ' + s.st));
  ok('Đặt sẵn 3 buổi → vào thẳng phiếu · T2 07:00 đã điểm danh "Đã tập"', ses.length === 3 && ses[0] === '2026-10-19 7 done' && ses[1] === '2026-10-21 18 on', ses);
  await signOut(page);
  await login(t, 'minh khoi', 'T. Minh Khôi', '1111');
  await waitView(page, 'book');
  const lock = await page.evaluate(() => ['2026-10-21|18', '2026-10-22|8', '2026-10-22|16'].map(k => { const [d, h] = k.split('|'); const c = document.querySelector('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]'); return c ? c.getAttribute('aria-disabled') : 'none'; }));
  ok('Luật 24 giờ: T4 18:00 và T5 08:00 khoá, T5 16:00 đặt được', lock[0] === 'true' && lock[1] === 'true' && lock[2] !== 'true', lock);

  /* kịch bản cuối tuần: không còn khung nào cách ≥ 24 giờ → màn chưa mở, đếm tới 06:00 CN 25.10 */
  await qc(page, '[data-qc="scn"][data-k="cuoi"]', true);
  await waitView(page, 'closed');
  ok('T7 24.10 21:00 → màn chưa mở, lịch tuần sau mở 06:00 Chủ Nhật 25.10', /Chủ Nhật 25\.10/.test(await page.textContent('main')), await page.textContent('main'));

  /* kịch bản trước giờ mở: đếm ngược 30 giây rồi tự mở */
  await qc(page, '[data-qc="scn"][data-k="truoc"]', true);
  await waitView(page, 'closed');
  ok('05:59:30 → màn chưa mở + đồng hồ đếm', /Chưa tới giờ đặt/.test(await page.textContent('main')));
  await waitView(page, 'find', 45000);
  ok('Tới 06:00 → trang tự mở tìm tên', /Đang mở đặt · Tuần 43/.test(await page.textContent('#sigD')), await page.textContent('#sigD'));

  ok('Không một lệnh nào ra máy chủ thật trong chế độ QC', t.hits === 0, t.hits);
  ok('0 lỗi console / pageerror (desktop)', t.errs.length === 0, t.errs);

  /* thoát QC */
  t.watch = false;                                         /* trang thật sau khi thoát gọi máy chủ (bị chặn trong test) */
  await panel(page, true);
  await Promise.all([page.waitForURL(u => !/qc/.test(u.search)), page.click('#qcp [data-qc="exit"]')]);
  const left = await page.evaluate(() => [localStorage, sessionStorage].flatMap(s => Object.keys(s)).filter(k => k.indexOf('qc:') === 0 || k.indexOf('qcsrv:') === 0));
  ok('Thoát QC → về "/" · mọi khoá qc: / qcsrv: đã xoá', left.length === 0 && new URL(page.url()).pathname === '/' && !new URL(page.url()).search, { left, url: page.url() });
  ok('Thoát QC → khoá thật vẫn nguyên', await realKeys(page));
  await t.ctx.close();

  console.log('\n== mobile 393×852 ==');
  const m = await open(browser, server, true), mp = m.page;
  await waitView(mp, 'find');
  const mb = await boxes(mp, ['.qc-tab', '.wm', '#sig', '#stepn']);
  ok('Mobile: nút QC không đè wordmark / tín hiệu / số bước', mb[0] && mb.slice(1).every(b => !b || !overlap(mb[0], b)), mb);
  await panel(mp, true);
  const pb = await mp.evaluate(() => { const r = document.querySelector('#qcp').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight }; });
  ok('Mobile: bảng QC là tấm trượt đáy, cao ≤ 80 % màn, cuộn được', Math.abs(pb.bottom - pb.vh) < 1 && pb.h <= pb.vh * 0.8 + 1, pb);
  await panel(mp, false);
  await login(m, 'thanh hang', 'V. Thanh Hằng', '2222');
  await book(m, [['2026-10-24', 8]]);
  await waitView(mp, 'ticket');
  await flushed(mp);
  ok('Mobile: còn 1 buổi → đặt đúng 1 buổi → phiếu, sổ giả 1 dòng', (await soOf(mp, 'B802DY')).length === 1);
  /* mobile · gói 1:2: lời mời trong cửa sổ đáy → Tập cùng → đặt → dòng Tập đôi trên phiếu → cửa sổ Tập đôi */
  await signOut(mp);
  await login(m, 'uyen nhi', 'T. Uyển Nhi', '5555');
  await waitView(mp, 'book');
  await mp.waitForSelector('#mNote .mnt');
  ok('Mobile: lời mời hiện ở dòng thông báo trên bảng', /Tuấn Kiệt mời bạn tập đôi · T3 17:00/.test(await mp.textContent('#mNote')), await mp.textContent('#mNote'));
  await mp.locator('#mNote .mnt').click();
  await mp.waitForSelector('#sheet.on [data-a="invok"]');
  await mp.locator('#sheet [data-a="invok"]').click();
  await mp.waitForSelector('#sheet', { state: 'hidden' });
  ok('Mobile: Tập cùng → cửa sổ đóng, chọn sẵn T3 17:00', JSON.stringify(await mp.evaluate(() => window.__lt.S.picks)) === '[{"date":"2026-10-20","h":17}]');
  await book(m, [['2026-10-21', 9]]);
  await waitView(mp, 'ticket');
  await flushed(mp);
  ok('Mobile: phiếu có dòng Tập đôi (lời mời của Thảo Vy)', /Thảo Vy mời bạn tập đôi/.test(await mp.textContent('#prLine')));
  await mp.locator('#prLine .prl').click();
  await mp.waitForSelector('#sheet.on');
  ok('Mobile: cửa sổ Tập đôi: lời mời + 2 buổi (T3 tập đôi cùng Tuấn Kiệt · T4 chờ bạn tập)',
     await mp.evaluate(() => { const t = document.querySelector('#sheet').textContent; return /Tập đôi tuần 43/.test(t) && /Tập đôi cùng Tuấn Kiệt/.test(t) && /Chờ bạn tập/.test(t) && document.querySelectorAll('#sheet [data-a="invok"]').length === 1; }));
  await mp.locator('#sheet .sh-h [data-a="closesheet"]').click();
  await mp.waitForSelector('#sheet', { state: 'hidden' });
  ok('Mobile: không lệnh nào ra máy chủ thật', m.hits === 0, m.hits);
  ok('Mobile: khoá thật nguyên vẹn', await realKeys(mp));
  ok('0 lỗi console / pageerror (mobile)', m.errs.length === 0, m.errs);
  await m.ctx.close();

  console.log('\n== hai tab ?qc dùng chung bộ nhớ · tab đời cũ ghi đè ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    const pageOf = async () => {
      const pg = await ctx.newPage();
      pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
      await pg.route(API + '**', r => r.abort());
      await pg.goto(server.url + '?qc'); await pg.waitForSelector('.qc-tab');
      return pg;
    };
    const a = await pageOf();
    await waitView(a, 'find');
    const b = await pageOf();
    await waitView(b, 'find');
    await a.waitForSelector('.qc-stale', { timeout: 5000 }).catch(() => {});
    ok('Mở tab ?qc thứ hai → tab trước thôi ghi bộ nhớ chung, hiện "Chế độ QC đang mở ở một tab khác" + nút Tải lại',
       await a.evaluate(() => { const x = document.querySelector('.qc-stale'); return !!x && /tab khác/.test(x.textContent) && !!x.querySelector('button'); }) &&
       !(await b.evaluate(() => !!document.querySelector('.qc-stale'))));
    const before = await b.evaluate(() => localStorage.getItem('qcsrv:do'));
    await a.evaluate(() => window.QCB.fetch('/', { method: 'POST', body: JSON.stringify({ action: 'lt_find', q: 'uyen', dev: 'qcTabAaaaaaaaaaaaaaa1' }) }));
    await sleep(300);
    ok('… tab trước gọi máy chủ giả vẫn trả lời nhưng không ghi đè storage của tab sau', (await b.evaluate(() => localStorage.getItem('qcsrv:do'))) === before);
    await a.close();
    /* tab đời cũ (không biết mã thế giới) còn mở ghi đè storage DO bằng ảnh chụp BA cũ (như máy chủ studio 18/10: thiếu hội viên thử mới,
       khung 1:2 cũ) → tải lại: bỏ storage đó, đọc lại từ bảng tính giả; bảng tính còn đúng mã thì giữ nguyên thế giới */
    const wid1 = await b.evaluate(() => JSON.parse(localStorage.getItem('qcsrv:clock')).wid);
    await b.evaluate(() => { const d = JSON.parse(localStorage.getItem('qcsrv:do')); delete d._wid; d['snap:ba'] = { at: Date.now(), members: [], layout: {}, trialRows: [], closed: {}, cap: 4, trialRt: Date.now() }; localStorage.setItem('qcsrv:do', JSON.stringify(d)); });
    await b.reload(); await b.waitForSelector('.qc-tab'); await waitView(b, 'find');
    await b.fill('#q', 'thuc quyen'); await b.waitForSelector('.rrow');
    const s1 = await b.evaluate(() => ({ wid: JSON.parse(localStorage.getItem('qcsrv:clock')).wid, d: JSON.parse(localStorage.getItem('qcsrv:do'))._wid }));
    ok('Storage DO bị tab cũ ghi đè → tải lại bỏ storage đó, giữ thế giới (cùng mã), tìm thấy Mẫn Thục Quyên', s1.wid === wid1 && s1.d === wid1 && /Thục Quyên/.test(await b.textContent('.res')), s1);
    await b.fill('#q', '');
    await b.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('qcsrv:do')); delete d._wid; d['snap:ba'] = { at: 1, members: [] }; localStorage.setItem('qcsrv:do', JSON.stringify(d));
      const g = JSON.parse(localStorage.getItem('qcsrv:g')); delete g.wid; localStorage.setItem('qcsrv:g', JSON.stringify(g));
    });
    const wid0 = await b.evaluate(() => JSON.parse(localStorage.getItem('qcsrv:clock')).wid);
    await b.reload(); await b.waitForSelector('.qc-tab'); await waitView(b, 'find');
    const w = await b.evaluate(() => ({ wid: JSON.parse(localStorage.getItem('qcsrv:clock')).wid, g: JSON.parse(localStorage.getItem('qcsrv:g')).wid, d: JSON.parse(localStorage.getItem('qcsrv:do'))._wid }));
    ok('Bảng tính giả bị tab cũ ghi đè (không mã thế giới) → tải lại dựng thế giới mới, bảng tính + storage cùng mã', w.wid && w.wid !== wid0 && w.g === w.wid && w.d === w.wid, [wid0, w]);
    await b.fill('#q', 'thuc quyen'); await b.waitForSelector('.rrow');
    ok('… hội viên thử mới (Mẫn Thục Quyên) có trong thế giới dựng lại', /Thục Quyên/.test(await b.textContent('.res')));
    ok('0 lỗi console / pageerror (hai tab)', errs.length === 0, errs);
    await ctx.close();
  }

  console.log('\n== qc.js không tải được ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage();
    let hits = 0;
    await pg.route(API + '**', r => { hits++; r.abort(); });
    await pg.route('**/qc.js*', r => r.fulfill({ status: 404, body: 'không có' }));
    await pg.goto(server.url + '?qc');
    await pg.waitForFunction(() => /Không mở được chế độ QC/.test(document.querySelector('main').textContent), null, { timeout: 8000 });
    await sleep(1500);
    ok('qc.js lỗi → báo "Không mở được chế độ QC.", không lui về máy chủ thật', hits === 0, hits);
    await ctx.close();
  }

  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
