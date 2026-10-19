/* "Tín hiệu đến" của thẻ thông báo (1.2.1): chạy khi thẻ THẬT SỰ được thấy — không lẫn vào cảnh trang trượt vào (1.2.0: chạy một lần ngay
   lúc thẻ vào DOM, chủ studio "không thấy hiệu ứng") — rồi LẶP mỗi 2 s tới khi người xem đã đọc thẻ (1.2.2: bỏ chấm Acid, vòng sáng
   phát ra từ chính biểu tượng, nhịp 4 s → 2 s). Chế độ QC (dữ liệu bịa), desktop + mobile.
   node test/ui_notice.js
   1. Mở bảng (Uyển Nhi: thẻ lời mời tập đôi): trước tín hiệu chấm + vạch ẩn · tín hiệu chạy SAU khi trang vào xong ≥ 150 ms · đủ chuyển động
      (vạch quét lặp · vòng sáng lặp) · không còn chấm ở góc · vòng sáng đồng tâm, bắt đầu trùng đường tròn của biểu tượng · giữa hai nhịp
      vạch + vòng tắt · nhịp thứ hai thật sự chạy (~2 s sau) · B0B nhìn
      thẻ đúng lúc tín hiệu, không trước
   2. Kênh live hỏi lại (QC "Người khác vừa đặt"), thẻ không đổi → cùng phần tử, nhịp không chạy lại từ đầu
   3. Đã đọc: desktop rê chuột qua nhanh → vẫn lặp, dừng trên thẻ ≥ 600 ms → thôi lặp (chấm ở lại), thẻ mobile cùng nội dung cũng thôi
      (thu cửa sổ về khổ mobile) · mobile chạm thẻ → mở cửa sổ chi tiết, đóng lại → thôi lặp
   4. Thẻ mới giữa phiên (Minh Khôi chọn T5 09:00, người khác đặt trước): desktop chạy sau khi sàn hiện xong · mobile: cửa sổ báo đang che →
      chờ, đóng cửa sổ rồi mới chạy · B0B nhìn thẻ cảnh báo đúng lúc · thẻ mới thì lặp
   5. Tab ẩn lúc thẻ vào → chưa chạy; mở lại tab → chạy
   6. Giảm chuyển động → gắn ngay, không lặp, về thẳng trạng thái cuối (chấm hiện, vạch tắt) */
'use strict';
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');
const EXE = require('./pw_exe'), ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } }
async function waitView(page, v) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: 10000 }); }

/* nhật ký trong trang: thẻ vào (kèm độ mờ chấm / vạch lúc đó) · trang vào xong · tín hiệu gắn (kèm tên animation) · cửa sổ đóng · B0B */
function instrument() {
  const L = window.__sg = [], t = () => performance.now();
  const vis = e => e.getClientRects().length > 0;
  const card = e => e.nodeType === 1 && e.matches && e.matches('#floor .nt, #mNote .mnt');
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'childList') m.addedNodes.forEach(n => {
      const cs = n.nodeType === 1 ? [n].filter(card).concat(Array.from(n.querySelectorAll('#floor .nt, #mNote .mnt'))) : [];
      cs.forEach(c => { if (!vis(c)) return; c.__id = c.__id || Math.random().toString(36).slice(2);
        L.push({ k: 'in', at: t(), id: c.__id, warn: c.classList.contains('warn'), sig: c.classList.contains('sig-in'),
                 ring: getComputedStyle(c.querySelector('.nt-ic'), '::after').opacity, line: getComputedStyle(c, '::before').opacity }); });
    });
    if (m.type === 'attributes' && m.target.nodeType === 1) {
      const e = m.target, was = m.oldValue || '';
      if (e.classList.contains('page') && /enter-(fwd|back)/.test(was) && !/enter-(fwd|back)/.test(e.className)) L.push({ k: 'settle', at: t() });
      if (card(e) && vis(e) && e.classList.contains('sig-in') && !/\bsig-in\b/.test(was))
        L.push({ k: 'sig', at: t(), id: e.__id, names: Array.from(new Set(e.getAnimations({ subtree: true }).map(a => a.animationName))).sort().join(',') });
      if (e.id === 'sheet' && m.attributeName === 'hidden' && e.hidden) L.push({ k: 'sheetoff', at: t() });
    }
  })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden'] });
  const o = window.B0B && window.B0B.emit;
  if (o) window.B0B.emit = function (type, d) {
    const el = d && d.el;
    if (el && el.matches && el.matches('.nt, .mnt')) L.push({ k: 'bob', at: t(), type: type, id: el.__id });
    return o.apply(this, arguments);
  };
  return !!o;
}
/* B0B được gọi ngay trong lượt gắn .sig-in, MutationObserver ghi mốc "sig" sau đó một nhịp vi tác vụ → cho lệch ≤ SAME ms
   (nhìn sớm kiểu 1.2.0 = lúc thẻ vào, sớm hơn hàng trăm ms) */
const SAME = 30;
const log = page => page.evaluate(() => window.__sg.slice());
const lastIn = (l, warn) => l.filter(x => x.k === 'in' && (warn == null || x.warn === warn)).pop();
async function until(f, ms) { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; }
async function state(page, sel) {
  return page.evaluate(s => {
    const e = Array.from(document.querySelectorAll(s)).filter(x => x.getClientRects().length)[0]; if (!e) return null;
    const an = e.getAnimations({ subtree: true }), L = an.filter(a => a.animationName === 'ntlineL')[0];
    return { id: e.__id, sig: e.classList.contains('sig-in'), loop: e.classList.contains('sig-loop'), done: e.classList.contains('sig-done'),
             ring: +getComputedStyle(e.querySelector('.nt-ic'), '::after').opacity, line: +getComputedStyle(e, '::before').opacity,
             running: an.filter(a => a.playState === 'running').map(a => a.animationName).sort().join(','),
             it: L ? L.effect.getComputedTiming().currentIteration : null, start: L ? L.startTime : null };
  }, sel);
}

async function run(browser, server, mobile, opt) {
  opt = opt || {};
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + (opt.rm ? ' · giảm chuyển động' : '') + (opt.hidden ? ' · tab ẩn lúc thẻ vào' : '') + ' ==');
  const ctx = await browser.newContext(Object.assign(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
                                                     opt.rm ? { reducedMotion: 'reduce' } : {}));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.route(API + '**', r => r.abort());
  await page.goto(server.url + 'img/favicon.svg'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(server.url + '?qc&tk3d=0'); await page.waitForSelector('.qc-tab');
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  const qc = async sel => {
    await page.click('.qc-tab'); await page.waitForSelector('#qcp:not([hidden])');
    await page.click('#qcp ' + sel); await sleep(150);
    await page.focus('#qcT'); await page.keyboard.press('Escape'); await page.waitForSelector('#qcp', { state: 'hidden' });
  };
  const login = async (q, pin, before) => {
    await waitView(page, 'find');
    await page.fill('#q', q); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
    await waitView(page, 'verify'); await page.focus('#pin'); await page.keyboard.type(pin);
    const bob = await page.evaluate(instrument);
    if (before) await before();
    await page.locator(mobile ? '#vgoM' : '#vgo').click();
    return bob;
  };
  const armed = () => until(async () => { const s = await state(page, SEL); return s && s.sig; }, 6000);

  if (opt.rm) {
    await login('uyen nhi', '5555'); await waitView(page, 'book'); await armed(); await sleep(150);
    const l = await log(page), i = lastIn(l), g = l.filter(x => x.k === 'sig').pop(), s = await state(page, SEL);
    ok('Giảm chuyển động: gắn tín hiệu ngay (≤ 250 ms sau khi thẻ vào), không chờ', !!i && !!g && g.at - i.at <= 250, [i, g]);
    ok('… không lặp, về thẳng trạng thái cuối: vạch + vòng sáng tắt, không còn chuyển động', !!s && !s.loop && s.ring === 0 && s.line === 0 && !s.running, s);
    ok('0 lỗi console / pageerror', errs.length === 0, errs);
    await ctx.close(); return;
  }
  if (opt.hidden) {
    const hide = v => page.evaluate(h => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
      if (!h) document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    await login('uyen nhi', '5555', () => hide(true)); await waitView(page, 'book'); await sleep(1500);
    const s0 = await state(page, SEL);
    ok('Tab ẩn lúc thẻ vào → chưa chạy tín hiệu', !!s0 && !s0.sig && s0.ring === 0 && !s0.running, s0);
    const t0 = await page.evaluate(() => performance.now());
    await hide(false); await armed();
    const g = (await log(page)).filter(x => x.k === 'sig').pop();
    ok('Mở lại tab → tín hiệu chạy sau ≥ 150 ms lặng (≤ 900 ms)', !!g && g.at - t0 >= 150 && g.at - t0 <= 900, g && Math.round(g.at - t0));
    ok('0 lỗi console / pageerror', errs.length === 0, errs);
    await ctx.close(); return;
  }

  /* 1 */
  const bob = await login('uyen nhi', '5555'); await waitView(page, 'book');
  ok('Có B0B để theo dõi (B0B.emit)', bob);
  await armed(); await sleep(60);
  let l = await log(page);
  const i1 = lastIn(l), g1 = l.filter(x => x.k === 'sig' && i1 && x.id === i1.id)[0], st1 = l.filter(x => x.k === 'settle' && i1 && x.at >= i1.at - 1).pop();
  ok('Thẻ vào cùng cảnh trang trượt vào: lúc đó vạch + vòng sáng còn ẩn', !!i1 && !i1.sig && i1.ring === '0' && i1.line === '0', i1);
  ok('Tín hiệu chạy SAU khi trang vào xong, lặng ≥ 150 ms (≤ 900 ms)', !!g1 && !!st1 && g1.at - st1.at >= 150 && g1.at - st1.at <= 900,
     [st1 && Math.round(st1.at - i1.at), g1 && Math.round(g1.at - i1.at)]);
  ok('Đủ chuyển động: vạch quét lặp (ntlineL) · vòng sáng lặp (ntringL)', !!g1 && g1.names === 'ntlineL,ntringL', g1);
  /* vòng sáng: ::after của khung biểu tượng (khung = đúng ô svg), lùi 12,5 % mỗi cạnh = đường tròn r 9 / 24 của "i" → đồng tâm, cùng cỡ */
  const geo = await page.evaluate(s => {
    const c = document.querySelector(s), w = c.querySelector('.nt-ic'), svg = w.querySelector('svg'), a = getComputedStyle(w, '::after');
    const rw = w.getBoundingClientRect(), rs = svg.getBoundingClientRect(), circ = svg.querySelector('circle');
    return { dots: c.querySelectorAll('.nt-sig').length, same: Math.abs(rw.left - rs.left) < .5 && Math.abs(rw.top - rs.top) < .5 && Math.abs(rw.width - rs.width) < .5 && Math.abs(rw.height - rs.height) < .5,
             inset: [a.top, a.left, a.right, a.bottom].map(parseFloat), size: rw.width, r: circ && +circ.getAttribute('r'), cx: circ && +circ.getAttribute('cx'), cy: circ && +circ.getAttribute('cy'),
             vb: svg.getAttribute('viewBox'), shadow: a.boxShadow, radius: a.borderRadius };
  }, SEL);
  ok('Không còn chấm Acid ở góc biểu tượng', geo.dots === 0, geo);
  ok('Vòng sáng đồng tâm với biểu tượng, bắt đầu trùng đường tròn r 9 / 24 của nó (lùi 12,5 % mỗi cạnh), viền Acid 2 px',
     geo.same && geo.vb === '0 0 24 24' && geo.r === 9 && geo.cx === 12 && geo.cy === 12 && geo.inset.every(v => Math.abs(v - geo.size * .125) < .01) &&
     /rgb\(212, 255, 0\) 0px 0px 0px 2px/.test(geo.shadow) && geo.radius === '50%', geo);
  const b1 = l.filter(x => x.k === 'bob' && i1 && x.id === i1.id);
  ok('B0B nhìn thẻ đúng lúc tín hiệu (không trước) · thẻ thường → "toast"', b1.length === 1 && !!g1 && b1[0].at >= g1.at - SAME && b1[0].at - g1.at <= 200 && b1[0].type === 'toast',
     b1.map(x => [x.type, Math.round(x.at - (g1 ? g1.at : 0))]));
  await sleep(1200);
  const s1 = await state(page, SEL);
  ok('Giữa hai nhịp: vạch + vòng sáng đã tắt, chỉ còn nhịp lặp chạy (vạch + vòng sáng)', !!s1 && s1.loop && s1.ring === 0 && s1.line === 0 && s1.running === 'ntlineL,ntringL', s1);
  const t1 = await page.evaluate(() => performance.now());
  const again = await until(async () => { const s = await state(page, SEL); return s && s.it >= 1 && s.line > 0.5 && s.ring > 0.3; }, 5000);
  const t1b = await page.evaluate(() => performance.now());
  ok('Lặp: ~2 s sau nhịp đầu vạch Acid quét lại, vòng sáng phát lại (nhịp thứ hai)', again && !!g1 && t1b - g1.at >= 1900 && t1b - g1.at <= 3200, [again, g1 && Math.round(t1b - g1.at), Math.round(t1b - t1)]);

  /* 2 */
  const f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s2 = await state(page, SEL), n2 = (await log(page)).filter(x => x.k === 'sig' && x.at > (g1 ? g1.at : 0)).length;
  ok('Kênh live hỏi lại, thẻ không đổi → cùng phần tử, nhịp không chạy lại từ đầu', !!s2 && !!s1 && s2.id === s1.id && s2.loop && s2.start === s1.start && n2 === 0,
     [s2, n2, await page.evaluate(f => window.__lt.S.lastFetch > f, f2)]);
  /* 3 */
  if (!mobile) {
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, SEL);
    await page.mouse.move(box.x, box.y); await sleep(250); await page.mouse.move(box.x, 120); await sleep(800);
    const s3a = await state(page, SEL);
    ok('Rê chuột qua thẻ nhanh (250 ms) → vẫn lặp', !!s3a && s3a.loop && !s3a.done, s3a);
    await page.mouse.move(box.x, box.y); await sleep(900);
    const s3b = await state(page, SEL);
    ok('Dừng chuột trên thẻ ≥ 600 ms (đã đọc) → thôi lặp: không còn chuyển động, vạch + vòng sáng tắt', !!s3b && !s3b.loop && s3b.done && !s3b.running && s3b.ring === 0 && s3b.line === 0, s3b);
    await page.mouse.move(box.x, 120);
    await page.setViewportSize({ width: 393, height: 852 }); await sleep(700);
    const s3c = await state(page, '#mNote .mnt');
    ok('Thu cửa sổ về khổ mobile: thẻ mobile cùng nội dung cũng không lặp (đã đọc theo nội dung thẻ)', !!s3c && !s3c.loop && s3c.done && !/ntlineL|ntringL/.test(s3c.running), s3c);
  } else {
    await page.locator(SEL).tap(); await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {});
    const open = await page.evaluate(() => !!document.querySelector('#sheet.on'));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#sheet').hidden, null, { timeout: 4000 }).catch(() => {});
    await sleep(300);
    const s3 = await state(page, SEL);
    ok('Chạm thẻ → mở cửa sổ chi tiết · đóng lại → thẻ thôi lặp', open && !!s3 && !s3.loop && s3.done && !s3.running && s3.ring === 0, [open, s3]);
  }
  ok('0 lỗi console / pageerror (Uyển Nhi)', errs.length === 0, errs);
  await ctx.close();

  /* 4 */
  const ctx3 = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const p3 = await ctx3.newPage(); const errs3 = [];
  p3.on('pageerror', e => errs3.push('pageerror: ' + e.message));
  p3.on('console', m => { if (m.type() === 'error') errs3.push('console: ' + m.text()); });
  await p3.route(API + '**', r => r.abort());
  await p3.goto(server.url + 'img/favicon.svg'); await p3.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p3.goto(server.url + '?qc&tk3d=0'); await p3.waitForSelector('.qc-tab');
  const qc3 = async sel => {
    await p3.click('.qc-tab'); await p3.waitForSelector('#qcp:not([hidden])');
    await p3.click('#qcp ' + sel); await sleep(150);
    await p3.focus('#qcT'); await p3.keyboard.press('Escape'); await p3.waitForSelector('#qcp', { state: 'hidden' });
  };
  await waitView(p3, 'find');
  await p3.fill('#q', 'minh khoi'); await p3.waitForSelector('.rrow'); await p3.locator('.rrow').first().click();
  await waitView(p3, 'verify'); await p3.focus('#pin'); await p3.keyboard.type('1111');
  await p3.evaluate(instrument);
  await p3.locator(mobile ? '#vgoM' : '#vgo').click(); await waitView(p3, 'book'); await sleep(900);
  await p3.locator('#wkb .c[data-d="2026-10-22"][data-h="9"] >> visible=true').first().click(); await sleep(200);
  await qc3('[data-qc="other"]');
  await p3.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'gone', null, { timeout: 6000 }).catch(() => {});
  if (mobile) {
    await p3.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {});
    await sleep(1200);
    const s3 = await state(p3, SEL);
    ok('Mobile: thẻ cảnh báo mới vào khi cửa sổ báo đang che → chưa chạy tín hiệu', !!s3 && !s3.sig && s3.ring === 0 && !s3.running && await p3.evaluate(() => !document.querySelector('#sheet').hidden), s3);
    await p3.keyboard.press('Escape');
  }
  const ok3 = await until(async () => { const s = await state(p3, SEL + '.warn'); return s && s.sig; }, 6000);
  await sleep(60);
  const l3 = await log(p3), i3 = lastIn(l3, true), g3 = l3.filter(x => x.k === 'sig' && i3 && x.id === i3.id)[0], b3 = l3.filter(x => x.k === 'bob' && i3 && x.id === i3.id);
  if (mobile) {
    const off = l3.filter(x => x.k === 'sheetoff').pop();
    ok('… đóng cửa sổ → tín hiệu chạy sau khi cửa sổ khuất ≥ 150 ms', ok3 && !!g3 && !!off && g3.at - off.at >= 150 && g3.at - off.at <= 900, [off && Math.round(off.at - i3.at), g3 && Math.round(g3.at - i3.at)]);
  } else {
    /* sàn đổi nội dung bằng fade-through: thẻ vào lúc sàn còn mờ 0 → hiện trong 220 ms → lặng 160 ms */
    ok('Desktop: thẻ cảnh báo mới trên sàn → tín hiệu chạy sau khi sàn hiện xong (≥ 220 + 150 ms sau khi thẻ vào)', ok3 && !!i3 && !!g3 && g3.at - i3.at >= 370 && g3.at - i3.at <= 1400,
       [i3, g3 && Math.round(g3.at - i3.at)]);
  }
  const s4 = await state(p3, SEL + '.warn');
  ok('Thẻ mới lặp từ đầu', !!s4 && s4.loop && /ntlineL/.test(s4.running), s4);
  ok('B0B nhìn thẻ cảnh báo đúng lúc tín hiệu · "error"', b3.length === 1 && !!g3 && b3[0].at >= g3.at - SAME && b3[0].at - g3.at <= 200 && b3[0].type === 'error',
     b3.map(x => [x.type, Math.round(x.at - (g3 ? g3.at : 0))]));
  ok('0 lỗi console / pageerror (Minh Khôi)', errs3.length === 0, errs3);
  await ctx3.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch(Object.assign({ args: ARGS }, EXE ? { executablePath: EXE } : {}));
  try {
    await run(browser, server, false);
    await run(browser, server, true);
    await run(browser, server, false, { hidden: true });
    await run(browser, server, true, { rm: true });
  } catch (e) { fail++; console.log('  FAIL  lỗi chạy test: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
