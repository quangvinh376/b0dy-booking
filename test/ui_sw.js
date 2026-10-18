/* Service worker: lưu tệp tĩnh, mở lại khi mất mạng, không chặn lệnh gọi máy chủ (page.route vẫn thấy), đổi VER thì dọn bộ nhớ cũ.
   node test/ui_sw.js */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startServer, backend, attach, vn, ROOT } = require('./ui_harness');

const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  const t = backend(vn('2026-10-18', '20:15'));
  const ctx = await browser.newContext({ viewport: { width: 393, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await attach(page, t);
  await page.goto(server.url);
  await page.waitForSelector('#q');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  ok('Service worker đăng ký và điều khiển trang', true);
  const keys = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, urls: (await c.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search) }; });
  ok('Bộ nhớ lt-<VER> có đủ tệp lõi', keys.ks.length === 1 && /^lt-/.test(keys.ks[0]) && ['/', '/app.css?v=', '/app.js?v=', '/b0b.js?v=', '/fonts/SVN-Switzer-Medium.woff2', '/fonts/JetBrainsMono-Medium.woff2'].every(u => keys.urls.some(x => x.indexOf(u) === 0)), keys);

  /* đăng nhập + đặt lịch khi SW đang điều khiển: page.route vẫn chặn được lệnh gọi máy chủ */
  await page.fill('#q', 'duc nam');
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await page.waitForSelector('#pin');
  await page.keyboard.type('0001');
  await page.locator('#vgoM >> visible=true').click();
  await page.waitForSelector('.pg-book');
  for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18]]) await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').click();
  await page.locator('#ctaM >> visible=true').click();
  await page.waitForSelector('.pg-tk');
  ok('Lệnh gọi máy chủ không đi qua SW (vẫn ghi đúng 2 dòng)', t.rows().filter(r => r[16] === 'B901DY').length === 2);

  /* mất mạng hoàn toàn → mở lại trang: trang + phiếu hiện từ bộ nhớ máy */
  await ctx.setOffline(true);
  t.fail = 'net';   /* page.route vẫn trả lời khi offline → giả lệnh gọi máy chủ cũng rớt */
  const t0 = Date.now();
  await page.reload();
  await page.waitForSelector('.pg-tk', { timeout: 8000 });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { resp: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), wk: n.workerStart > 0 }; });
  ok('Mất mạng, tải lại → trang mở từ bộ nhớ, thấy ngay phiếu (' + (Date.now() - t0) + ' ms · HTML ' + nav.resp + ' ms · DOM ' + nav.dcl + ' ms)', nav.resp < 1500, nav);
  await sleep(1200);
  const sig = await page.textContent('#sigM');
  ok('Mất mạng: header báo "Mất kết nối" (đang xem bản lưu trên máy)', /mất kết nối/i.test(sig), sig);
  await ctx.setOffline(false);
  t.fail = null;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !/mất kết nối/i.test(document.querySelector('#sigM').textContent), null, { timeout: 6000 });
  ok('Có mạng lại → tự làm mới, header hết báo mất kết nối', true);

  /* đổi VER: SW mới cài, bộ nhớ cũ bị xoá */
  const swPath = path.join(ROOT, 'sw.js'), orig = fs.readFileSync(swPath, 'utf8');
  try {
    fs.writeFileSync(swPath, orig.replace(/var VER = '([^']+)';/, "var VER = '$1-thu';").replace("'app.css?v=' + VER, 'app.js?v=' + VER, 'b0b.js?v=' + VER", "'app.css?v=1.0.0', 'app.js?v=1.0.0', 'b0b.js?v=1.0.0'"));
    await page.reload();
    await page.waitForFunction(async () => { const ks = await caches.keys(); return ks.length === 1 && /-thu$/.test(ks[0]); }, null, { timeout: 15000 });
    ok('Đổi VER → SW mới kích hoạt, chỉ còn bộ nhớ mới', true);
  } finally { fs.writeFileSync(swPath, orig); }

  console.log('  errors:', errs.length ? errs : 'none');
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
