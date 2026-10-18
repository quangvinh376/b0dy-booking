/* Chạy thử toàn luồng trên Chromium với máy chủ giả (logic thật LichTuan.gs) + chụp ảnh từng màn.
   node test/ui_smoke.js [desktop|mobile|all]   → ảnh ra SHOTS (mặc định thư mục tạm của máy), in lỗi console / pageerror. */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startServer, backend, attach, vn } = require('./ui_harness');

const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'b0dy-ui');
const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); }
}

/* lịch bận giống Figma 03 (tuần 43): [ngày, giờ, số người] */
const BUSY = [['2026-10-19', 10, 4], ['2026-10-21', 10, 4], ['2026-10-21', 15, 4], ['2026-10-23', 15, 4], ['2026-10-20', 18, 4], ['2026-10-22', 18, 4], ['2026-10-23', 18, 4],
  ['2026-10-23', 7, 3], ['2026-10-22', 9, 3], ['2026-10-23', 10, 3], ['2026-10-19', 14, 3], ['2026-10-21', 14, 3], ['2026-10-22', 14, 3], ['2026-10-21', 16, 3], ['2026-10-24', 16, 3],
  ['2026-10-24', 18, 3], ['2026-10-20', 20, 3]];
const NUMS = ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Mười Một', 'Mười Hai', 'Mười Ba', 'Mười Bốn', 'Mười Lăm', 'Mười Sáu'];
/* coach của "Khách Thử <số>" trong ui_harness: ['Quyết Hán', 'Hiền Mai', 'Khải Phan', 'Lâm Nguyễn'][số % 4] */
const COACH_OF = i => (i + 1) % 4;
/** Chia khung bận cho khách thử: mỗi khung các khách KHÁC coach (luật 18/10: mỗi coach một suất mỗi khung), mỗi người ≤ 4 buổi, 1 buổi/ngày. */
function plan(busy, week) {
  const per = NUMS.map(() => ({}));
  busy.forEach(([date, h, n]) => {
    const used = new Set();
    for (let k = 0; k < n; k++) {
      let best = -1;
      per.forEach((p, i) => { const c = Object.keys(p).length; if (!p[date] && c < 4 && !used.has(COACH_OF(i)) && (best < 0 || c < Object.keys(per[best]).length)) best = i; });
      if (best < 0) throw new Error('không đủ khách thử');
      per[best][date] = h;
      used.add(COACH_OF(best));
    }
  });
  const out = [];
  per.forEach((p, i) => {
    let picks = Object.keys(p).sort().map(dd => ({ date: dd, h: p[dd] }));
    if (picks.length === 1) picks.push({ date: '2026-10-24', h: 6 + (i % 2) });   /* tối thiểu 2 buổi */
    if (picks.length) out.push([NUMS[i], week, picks]);
  });
  return out;
}

async function run(kind) {
  const desk = kind === 'desktop';
  const t = backend(vn('2026-10-18', '20:15'));
  t.fill(plan(BUSY, '2026-W43'));
  const { srv, url } = await startServer();
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const ctx = await browser.newContext(desk ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } : { viewport: { width: 393, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await attach(page, t);
  const dir = path.join(SHOTS, kind); fs.mkdirSync(dir, { recursive: true });
  const shot = async (name, settle) => { await sleep(settle == null ? 900 : settle); await page.screenshot({ path: path.join(dir, name + '.png') }); };
  const tap = async sel => { const el = page.locator(sel + ' >> visible=true').first(); await el.click(); };

  console.log('\n== ' + kind + ' ==');
  await page.goto(url);
  await page.waitForSelector('.pg-find');
  ok('Mở trang chưa đăng nhập (CN 20:15, đang mở đặt) → màn tìm tên', true);
  await shot('01A');
  await page.fill('#q', 'duc nam');
  await page.waitForSelector('.rrow');
  const rows = await page.locator('.rrow').count();
  ok('Gõ "duc nam" → 2 kết quả trùng tên rút gọn (không lộ coach)', rows === 2, rows);
  await shot('01B', 500);
  await page.fill('#q', 'thao');
  await page.fill('#q', 'thi thao');
  await page.waitForSelector('#miss:not([hidden])');
  ok('Không thấy tên → E02', await page.isVisible('#miss'));
  await shot('E02', 600);
  await page.fill('#q', 'duc nam');
  await page.waitForSelector('.rrow');
  await tap('.rrow');
  await page.waitForSelector('.pg-verify');
  await shot('02');
  await page.keyboard.type('0000');
  await tap(desk ? '#vgo' : '#vgoM');
  await page.waitForFunction(() => document.querySelector('#perr').textContent.length > 0);
  ok('Sai mã → "Chưa đúng. Còn 4 lần thử."', (await page.textContent('#perr')).indexOf('Còn 4 lần') >= 0, await page.textContent('#perr'));
  await shot('02-sai', 600);
  await page.click('#pin');
  await page.keyboard.type('0001');
  await shot('02-nhap', 200);
  await tap(desk ? '#vgo' : '#vgoM');
  await page.waitForSelector('.pg-book');
  ok('Đúng mã → màn đặt lịch', true);
  await shot('03-trong', 1200);
  for (const [dd, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) await tap('#wkb .c[data-d="' + dd + '"][data-h="' + h + '"]');
  await shot('03');
  const cta = desk ? '#cta' : '#ctaM';
  ok('Chọn 3 buổi → nút "Đặt lịch 3 buổi"', (await page.textContent(cta)).indexOf('Đặt lịch 3 buổi') >= 0, await page.textContent(cta));
  await tap(cta);
  await page.waitForSelector('.pg-tk');
  ok('Đặt xong → phiếu', true);
  const mine = t.rows().filter(r => r[16] === 'B901DY');
  ok('Sổ đặt lịch có 3 dòng của B901DY, Đã đặt, bản 1', mine.length === 3 && mine.every(r => r[11] === 'Đã đặt' && r[2] === 1), mine.map(r => r.slice(1, 13)));
  await shot('04', 1700);
  await tap('[data-a="tkdone"]');
  await page.waitForSelector('[data-a="gochg"] >> visible=true');
  await shot('05', 1700);
  await tap('[data-a="goadd"]');
  await page.waitForSelector('.pg-book');
  await shot('E12-trong', 900);
  await tap('#wkb .c[data-d="2026-10-24"][data-h="10"]');
  await shot('E12');
  await tap(cta);
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /thêm/i.test(document.querySelector('.pg-tk h1').textContent));
  ok('Thêm buổi → phiếu bản 2 (4 buổi)', t.rows().filter(r => r[16] === 'B901DY' && r[11] === 'Đã đặt').length === 4);
  await shot('E12-xong', 1700);
  /* mở lại: máy đã nhớ → hiện ngay phiếu */
  await page.reload();
  await page.waitForSelector('.pg-tk');
  ok('Tải lại trang → vào thẳng phiếu (máy đã nhớ)', true);
  await shot('05-reload', 1500);
  /* giữa tuần: đổi lịch */
  t.clock.now = vn('2026-10-21', '09:30');
  await page.reload();
  await page.waitForSelector('[data-a="gochg"] >> visible=true');
  await page.waitForTimeout(800);
  await tap('[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await shot('05A-trong', 1000);
  await tap('#wkb .c[data-d="2026-10-23"][data-h="19"]');
  await tap('#wkb .c[data-d="2026-10-22"][data-h="19"]');
  await shot('05A');
  await tap(cta);
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /đổi/i.test(document.querySelector('.pg-tk h1').textContent));
  const moved = t.rows().filter(r => r[16] === 'B901DY');
  ok('Đổi T6 19:00 → T5 19:00: dòng cũ Đã đổi, dòng mới Đổi', moved.some(r => r[4] === '2026-10-23' && r[11] === 'Đã đổi') && moved.some(r => r[4] === '2026-10-22' && r[12] === 'Đổi'), moved.map(r => r.slice(4, 14)));
  await shot('05B', 1700);
  /* hết lượt đổi */
  await tap('[data-a="tkdone"]');
  await page.waitForSelector('[data-a="gochg"] >> visible=true');
  await tap('[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await tap('#wkb .c[data-d="2026-10-24"][data-h="10"]');
  await tap('#wkb .c[data-d="2026-10-24"][data-h="10"]');
  await tap('#wkb .c[data-d="2026-10-24"][data-h="10"]');
  await shot('05A-2', 600);
  console.log('  errors:', errs.length ? errs : 'none');
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await browser.close(); srv.close();
}

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'all' || which === 'desktop') await run('desktop');
  if (which === 'all' || which === 'mobile') await run('mobile');
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
