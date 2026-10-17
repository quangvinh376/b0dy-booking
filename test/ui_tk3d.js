/* Phiếu giấy thật (tk3d.js · WebGL2) trên giao diện thật + máy chủ giả. Trình duyệt kiểm thử vẽ WebGL bằng CPU (SwiftShader) → bật tay
   ?tk3d=1. Kiểm:
   · desktop + mobile: vé DOM vào xong → bản WebGL thay chỗ (vé DOM trong suốt, giữ role="img" + aria-label) → thả lỏng thành giấy 3D
   · dáng phẳng trùng vé DOM: lệch ≤ 0,5 px từng vùng (số buổi, B0DY, tên, mã vạch, ô giờ, dòng "· MỚI"…), sai khác điểm ảnh nhỏ
   · dáng 3D khác hẳn dáng phẳng (đầu xa lùi theo phối cảnh) mà chữ vẫn sắc
   · đứng yên → không vẽ thêm khung nào, vòng chuyển động của app dừng
   · đủ 4 dạng phiếu: đã đặt · lịch tuần · đã thêm · đã đổi; làm mới ngầm không diễn lại; rời phiếu → trả canvas + texture
   · đổi cỡ desktop ↔ mobile → gắn sang vé kia, vẫn ở dáng 3D
   · mất ngữ cảnh WebGL → về vé DOM; có lại → giấy 3D lại
   · giảm chuyển động → dáng cuối ngay, không thả lỏng
   · ?tk3d=0 và WebGL bằng CPU (mặc định) → chỉ vé DOM
   · 0 lỗi console, không tràn ngang
   node test/ui_tk3d.js [desktop|mobile|rm|off|all]   → ảnh ra SHOTS/tk3d */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startServer, backend, attach, vn } = require('./ui_harness');

const SHOTS = path.join(process.env.SHOTS || path.join(require('os').tmpdir(), 'b0dy-ui'), 'tk3d');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOB = { viewport: { width: 393, height: 764 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0, browser, server, ana;
const ERRS = [];
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); }
}
const vis = sel => sel + ' >> visible=true';
const r2 = x => Math.round(x * 100) / 100;

async function open(t, ctxOpt, name, q) {
  const ctx = await browser.newContext(ctxOpt);
  /* đếm số lần vòng chuyển động của app (function tick) xin khung hình — để biết nó đã dừng hẳn khi đứng yên */
  await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window); window.__ticks = 0;
    window.requestAnimationFrame = function (f) { if (f && f.name === 'tick') window.__ticks++; return raf(f); };
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => ERRS.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') ERRS.push(name + ' console: ' + m.text()); });
  await attach(page, t);
  await page.goto(server.url + (q || ''));
  page._ctx = ctx; page._name = name;
  return page;
}
async function tap(page, sel) { await page.locator(vis(sel)).first().click(); }
async function login(page, desk) {
  await page.waitForSelector('#q');
  await page.fill('#q', 'duc nam');
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await page.waitForSelector('#pin');
  await page.keyboard.type('0001');
  await tap(page, desk ? '#vgo' : '#vgoM');
  await page.waitForSelector('.pg-book');
}
async function cells(page, list) { for (const [d, h] of list) await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]').click(); }
const dbg = page => page.evaluate(() => { const d = window.TK3D && TK3D._dbg(); if (d) delete d.V; return d; });
async function waitGL(page, ms) {
  await page.waitForFunction(() => { const d = window.TK3D && TK3D._dbg(); return d && d.shown && d.p >= 1 && d.cls; }, null, { timeout: ms || 90000 });
  await settle(page);
}
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
/* trạng thái DOM của phiếu đang hiện */
const state = page => page.evaluate(() => {
  const pg = document.querySelector('.page:last-of-type') || document;
  const tk = window.innerWidth >= 960 ? pg.querySelector('#tkW') : pg.querySelector('#tkT');
  const cv = document.querySelectorAll('canvas.tk3d'), c = cv[0];
  return { el: tk ? tk.id : '', gl: !!(tk && tk.classList.contains('gl')), op: tk ? +getComputedStyle(tk).opacity : -1, role: tk ? tk.getAttribute('role') : '', aria: tk ? (tk.getAttribute('aria-label') || '').length : 0,
    canvases: cv.length, inStage: !!(c && tk && c.parentNode === tk.closest('.tk-stage')), over: document.documentElement.scrollWidth - window.innerWidth,
    mainOver: (() => { const m = document.querySelector('#main'); return m ? m.scrollHeight - m.clientHeight : 0; })(), ticks: window.__ticks };
});
/* vùng cần so (px ảnh chụp) lấy từ chính vé DOM */
const windows = page => page.evaluate(() => {
  const desk = window.innerWidth >= 960, tk = document.querySelector('.page:last-of-type ' + (desk ? '#tkW' : '#tkT')), d = window.devicePixelRatio || 1;
  const sel = { num: '.tk-big .num', unit: '.tk-big .unit', wm: '.tk-wm', name: '.tk-ppl .kv .v', bc: '.bc', cell: '.mc.on', stat: '.tk-stat .v.big', mid: '.tk-stat .v.mid',
    lbl: desk ? '.tk-code .lbl' : '.tkm-stub > .lbl', hd: '.tk-name .b', day: '.wk7 .d7 .b', list: '.tk-list span.new', list0: '.tk-list span' };
  const out = {};
  for (const k in sel) { const e = tk.querySelector(sel[k]); if (!e) continue; const r = e.getBoundingClientRect(); if (r.width < 2) continue; out[k] = [r.left - 3, r.top - 3, r.right + 3, r.bottom + 3].map(v => Math.round(v * d)); }
  const r = tk.getBoundingClientRect(); out.tk = [r.left - 40, r.top - 30, r.right + 40, r.bottom + 50].map(v => Math.max(0, Math.round(v * d)));
  return { d, w: out };
});
async function snap(page, mode) { await page.evaluate(m => TK3D._view(m), mode); await settle(page); return (await page.screenshot()).toString('base64'); }

/* so ảnh trong một trang trống: lệch dưới điểm ảnh (Lucas–Kanade lặp, nội suy song tuyến), sai khác trung bình, độ sắc, trọng tâm mực */
async function analyze(a, b, W) {
  return ana.evaluate(async ({ a, b, W }) => {
    async function load(s) {
      const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, L = new Float32Array(c.width * c.height);
      for (let i = 0; i < L.length; i++) L[i] = .2126 * d[i * 4] + .7152 * d[i * 4 + 1] + .0722 * d[i * 4 + 2];
      return { w: c.width, h: c.height, L };
    }
    const A = await load(a), B = await load(b), w = A.w, h = A.h;
    const at = (I, x, y) => { x = Math.max(0, Math.min(w - 1.001, x)); y = Math.max(0, Math.min(h - 1.001, y)); const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * w + x0;
      return I[i] * (1 - fx) * (1 - fy) + I[i + 1] * fx * (1 - fy) + I[i + w] * (1 - fx) * fy + I[i + w + 1] * fx * fy; };
    function lk(r) {
      let dx = 0, dy = 0;
      for (let it = 0; it < 10; it++) {
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) {
          const gx = (at(B.L, x + dx + 1, y + dy) - at(B.L, x + dx - 1, y + dy)) / 2, gy = (at(B.L, x + dx, y + dy + 1) - at(B.L, x + dx, y + dy - 1)) / 2, e = at(B.L, x + dx, y + dy) - A.L[y * w + x];
          a11 += gx * gx; a12 += gx * gy; a22 += gy * gy; b1 += gx * e; b2 += gy * e;
        }
        const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-6) break;
        const ux = -(a22 * b1 - a12 * b2) / det, uy = -(a11 * b2 - a12 * b1) / det; dx += ux; dy += uy;
        if (Math.abs(ux) < 1e-3 && Math.abs(uy) < 1e-3) break;
      }
      return [dx, dy];
    }
    function stats(I, r) {   /* sai khác với A · độ sắc (gradient / mực) · trọng tâm mực */
      let s = 0, n = 0, mx = 0, g = 0, ink = 0, cx = 0, cy = 0;
      for (let y = Math.max(1, r[1]); y < Math.min(h - 1, r[3]); y++) for (let x = Math.max(1, r[0]); x < Math.min(w - 1, r[2]); x++) {
        const i = y * w + x, dd = Math.abs(I[i] - A.L[i]); s += dd; n++; if (dd > mx) mx = dd;
        const k = Math.max(0, 235 - I[i]); ink += k; cx += k * x; cy += k * y;
        g += Math.hypot(I[i + 1] - I[i - 1], I[i + w] - I[i - w]) / 2;
      }
      return { mean: s / Math.max(1, n), max: mx, sharp: g / Math.max(1, ink), cen: [cx / Math.max(1e-9, ink), cy / Math.max(1e-9, ink)], ink };
    }
    const out = {};
    for (const k in W) {
      const r = [Math.max(2, W[k][0]), Math.max(2, W[k][1]), Math.min(w - 2, W[k][2]), Math.min(h - 2, W[k][3])];
      if (r[2] - r[0] < 3 || r[3] - r[1] < 3) continue;
      const sa = stats(A.L, r), sb = stats(B.L, r);
      out[k] = { shift: k === 'tk' ? null : lk(r), mean: sb.mean, max: sb.max, sharpA: sa.sharp, sharpB: sb.sharp, cenA: sa.cen, cenB: sb.cen, inkA: sa.ink, inkB: sb.ink };
    }
    return out;
  }, { a, b, W });
}

/* một phiếu đang hiện bản WebGL: kiểm đủ bộ + lưu ảnh */
async function checkTicket(page, tag, opt) {
  opt = opt || {};
  /* vé nghiêng theo con trỏ + lắc gợi ý sau 3,6 s (app.js · TILT) xoay giấy 3D còn vé DOM thì không → cho vé đứng yên trước khi so */
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const L = window.__lt, T = L && L.tilt; if (T) { T.touched = true; T.hint = 0; T.hov = null; L.tiltKick(); } });
  await page.waitForFunction(() => { const T = window.__lt && window.__lt.tilt; return !T || (!T.raf && !T.drag); }, null, { timeout: 15000 });
  await settle(page);
  const st = await state(page), D = await dbg(page);
  ok(tag + ': bản WebGL đang hiện (canvas trong khung phiếu, vé DOM trong suốt, vẫn role="img" + aria-label)',
    D.shown && D.p >= 1 && st.gl && st.op === 0 && st.inStage && st.canvases === 1 && st.role === 'img' && st.aria > 20 && D.el === st.el, { st, D: { shown: D.shown, p: D.p, el: D.el, err: D.err } });
  ok(tag + ': không tràn ngang' + (opt.desk ? ', khung chính không phát sinh cuộn' : ''), st.over <= 0 && (!opt.desk || st.mainOver <= 0), st);
  const { d, w } = await windows(page);
  const dom = await snap(page, 'dom'), flat = await snap(page, 0), d3 = await snap(page, 1);
  fs.mkdirSync(SHOTS, { recursive: true });
  [['dom', dom], ['flat', flat], ['3d', d3]].forEach(([n, b]) => fs.writeFileSync(path.join(SHOTS, tag + '-' + n + '.png'), Buffer.from(b, 'base64')));
  /* dáng phẳng ↔ vé DOM */
  const F = await analyze(dom, flat, w), bad = [], sh = {};
  for (const k in F) {
    if (k === 'tk') continue;
    const s = F[k].shift.map(v => v / d); sh[k] = s.map(r2);
    if (Math.abs(s[0]) > .5 || Math.abs(s[1]) > .5) bad.push(k);
  }
  ok(tag + ': dáng phẳng trùng vé DOM — lệch ≤ 0,5 px ở ' + Object.keys(sh).length + ' vùng (' + Object.keys(sh).map(k => k + ' ' + sh[k].join('/')).join(' · ') + ')', !bad.length && Object.keys(sh).length >= 6, { bad, sh });
  ok(tag + ': dáng phẳng ↔ DOM sai khác trung bình ' + r2(F.tk.mean) + ' mức (≤ 2) cả vé lẫn bóng', F.tk.mean <= 2, F.tk);
  if (opt.mustHave) opt.mustHave.forEach(k => ok(tag + ': có vùng "' + k + '" để so (vẽ cả ' + k + ')', !!F[k] && Math.abs(F[k].shift[0] / d) <= .5 && Math.abs(F[k].shift[1] / d) <= .5 && F[k].inkB > F[k].inkA * .85 && F[k].inkB < F[k].inkA * 1.2, F[k]));
  /* dáng 3D ↔ dáng phẳng */
  const T = await analyze(flat, d3, w);
  const mv = Math.hypot(T.wm.cenB[0] - T.wm.cenA[0], T.wm.cenB[1] - T.wm.cenA[1]) / d;
  ok(tag + ': dáng 3D khác dáng phẳng — chữ B0DY ở đầu cong lùi theo phối cảnh ' + r2(mv) + ' px, sai khác trung bình ' + r2(T.tk.mean) + ' mức', mv >= 1.5 && T.tk.mean >= 1, { mv, mean: T.tk.mean });
  const cr = ['num', 'name', 'stat', 'bc'].filter(k => T[k]).map(k => [k, T[k].sharpB / T[k].sharpA]);
  ok(tag + ': chữ trên giấy 3D vẫn sắc (độ sắc so với dáng phẳng: ' + cr.map(x => x[0] + ' ' + r2(x[1])).join(' · ') + ')', cr.length >= 3 && cr.every(x => x[1] >= .8), cr);
  /* đứng yên: không vẽ thêm, vòng chuyển động của app dừng */
  await sleep(1500);
  const f0 = (await dbg(page)).frames, k0 = (await state(page)).ticks;
  await sleep(1500);
  const f1 = (await dbg(page)).frames, k1 = (await state(page)).ticks;
  ok(tag + ': đứng yên 1,5 s → 0 khung WebGL mới, vòng chuyển động của app dừng', f1 === f0 && k1 === k0, { f0, f1, k0, k1 });
}

async function deskFlow() {
  console.log('\n== desktop 1440×900 · ?tk3d=1 ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const page = await open(t, DESK, 'desk', '?tk3d=1');
  await login(page, true);
  await cells(page, [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]);
  await tap(page, '#cta');
  await page.waitForSelector('.pg-tk');
  /* lúc vé DOM còn đang vào: chưa thay chỗ */
  await sleep(300);
  const early = await state(page);
  ok('Đặt xong → vé DOM vào trước (0,3 s: chưa thay bằng WebGL, chưa có canvas)', !early.gl && early.canvases === 0, early);
  await waitGL(page);
  const D0 = await dbg(page);
  ok('Hết nhịp vào → bản WebGL phẳng thay chỗ rồi thả lỏng thành giấy 3D (dáng 1, đã vẽ ' + D0.frames + ' khung, dựng 1 lần)', D0.shown && D0.p === 1 && D0.frames >= 3 && D0.builds === 1, D0);
  await checkTicket(page, 'd-booked', { desk: true, mustHave: ['num', 'wm', 'bc', 'cell', 'list0'] });

  /* làm mới ngầm (quay lại tab sau 45 s): vẽ lại tức thì → không diễn lại, dùng lại texture.
     Từ 1.0.5 vé nghiêng theo con trỏ + lắc gợi ý một lần (app.js · TILT): cho vé đứng yên trước khi đếm khung */
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const L = window.__lt, T = L && L.tilt; if (T) { T.touched = true; T.hint = 0; T.hov = null; L.tiltKick(); } });
  await page.waitForFunction(() => { const T = window.__lt && window.__lt.tilt; return !T || (!T.raf && !T.drag); }, null, { timeout: 15000 });
  const b0 = await dbg(page);
  await page.evaluate(() => { if (window.__lt && window.__lt.S) window.__lt.S.lastFetch = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(2500);
  const b1 = await dbg(page), s1 = await state(page);
  ok('Làm mới ngầm khi đang hiện 3D → vẫn dáng 3D, không thả lỏng lại, không vẽ chữ lại (' + (b1.frames - b0.frames) + ' khung)', b1.shown && b1.p === 1 && s1.gl && b1.builds === b0.builds && b1.frames - b0.frames <= 2, { b0: b0.frames, b1: b1.frames, builds: [b0.builds, b1.builds], s1 });

  /* phiếu → phiếu (Xong → lịch tuần): trang cũ rời màn với khung cuối, trang mới dựng lại */
  await tap(page, '[data-a="tkdone"]');
  await page.waitForSelector(vis('[data-a="gochg"]'));
  await waitGL(page);
  await checkTicket(page, 'd-home', { desk: true });

  /* thêm buổi → phiếu "đã thêm" (4 buổi) */
  await tap(page, '[data-a="goadd"]');
  await page.waitForSelector('.pg-book');
  await sleep(900);
  const rel = await dbg(page);
  ok('Rời trang phiếu → trả canvas + texture (canvas ra khỏi DOM, thu về 1×1)', !rel.on && !rel.inDom && rel.cv && rel.cv[0] === 1 && rel.cv[1] === 1, rel);
  await cells(page, [['2026-10-24', 10]]);
  await tap(page, '#cta');
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /thêm/i.test(document.querySelector('.pg-tk h1').textContent));
  await waitGL(page);
  await checkTicket(page, 'd-added', { desk: true });

  /* đổi cỡ: desktop → mobile → desktop */
  await page.setViewportSize({ width: 393, height: 764 });
  await page.waitForFunction(() => { const d = TK3D._dbg(); return d.el === 'tkT' && d.shown && d.p >= 1; }, null, { timeout: 60000 });
  await settle(page);
  const sm = await state(page);
  ok('Thu cửa sổ về 393 px → gắn sang vé dọc #tkT, vẫn dáng 3D, không tràn ngang', sm.el === 'tkT' && sm.gl && sm.inStage && sm.over <= 0 && sm.canvases === 1, sm);
  fs.writeFileSync(path.join(SHOTS, 'd-resize-393.png'), await page.screenshot());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => { const d = TK3D._dbg(); return d.el === 'tkW' && d.shown && d.p >= 1; }, null, { timeout: 60000 });
  await settle(page);
  const sd = await state(page);
  ok('Mở lại 1440 px → về vé ngang #tkW, vẫn dáng 3D', sd.el === 'tkW' && sd.gl && sd.inStage && sd.over <= 0 && sd.mainOver <= 0, sd);

  /* mất ngữ cảnh WebGL → vé DOM; có lại → giấy 3D */
  await page.evaluate(() => TK3D._lose());
  await page.waitForFunction(() => TK3D._dbg().lost, null, { timeout: 10000 });
  await settle(page);
  const sl = await state(page);
  ok('Mất ngữ cảnh WebGL → về vé DOM (hiện rõ, canvas gỡ khỏi khung)', !sl.gl && sl.op === 1 && sl.canvases === 0, sl);
  await page.evaluate(() => TK3D._restore());
  await page.waitForFunction(() => { const d = TK3D._dbg(); return !d.lost && d.shown && d.p >= 1; }, null, { timeout: 60000 });
  await settle(page);
  const sr = await state(page);
  ok('Có lại ngữ cảnh → giấy 3D lại ngay (không diễn lại)', sr.gl && sr.inStage && sr.op === 0, sr);

  /* giữa tuần: tải lại (vào thẳng phiếu, vẽ tức thì) → đổi T6 19:00 → T5 19:00 → phiếu "đã đổi" có "· MỚI" */
  t.clock.now = vn('2026-10-21', '09:30');
  await page.reload();
  await page.waitForSelector('.pg-tk');
  await waitGL(page);
  ok('Tải lại → phiếu vẽ tức thì, WebGL thay chỗ ngay khi dựng xong rồi thả lỏng', true);
  await page.waitForSelector(vis('[data-a="gochg"]'));
  await tap(page, '[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await cells(page, [['2026-10-23', 19], ['2026-10-22', 19]]);
  await tap(page, '#cta');
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /đổi/i.test(document.querySelector('.pg-tk h1').textContent));
  await waitGL(page);
  await checkTicket(page, 'd-changed', { desk: true, mustHave: ['list'] });
  await page._ctx.close();
}

async function mobFlow() {
  console.log('\n== mobile 393×764 @2x · ?tk3d=1 ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const page = await open(t, MOB, 'mob', '?tk3d=1');
  await login(page, false);
  await cells(page, [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]);
  await tap(page, '#ctaM');
  await page.waitForSelector('.pg-tk');
  await waitGL(page);
  await checkTicket(page, 'm-booked', { mustHave: ['num', 'wm', 'bc', 'cell', 'day'] });
  await tap(page, '[data-a="tkdone"]');
  await page.waitForSelector(vis('[data-a="gochg"]'));
  await waitGL(page);
  await checkTicket(page, 'm-home', {});
  await tap(page, '[data-a="goadd"]');
  await page.waitForSelector('.pg-book');
  await cells(page, [['2026-10-24', 10]]);
  await tap(page, '#ctaM');
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /thêm/i.test(document.querySelector('.pg-tk h1').textContent));
  await waitGL(page);
  await checkTicket(page, 'm-added', {});
  t.clock.now = vn('2026-10-21', '09:30');
  await page.reload();
  await page.waitForSelector(vis('[data-a="gochg"]'));
  await waitGL(page);
  await tap(page, '[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await cells(page, [['2026-10-23', 19], ['2026-10-22', 19]]);
  await tap(page, '#ctaM');
  await page.waitForFunction(() => document.querySelector('.pg-tk h1') && /đổi/i.test(document.querySelector('.pg-tk h1').textContent));
  await waitGL(page);
  await checkTicket(page, 'm-changed', {});
  await page._ctx.close();
}

async function reducedFlow() {
  console.log('\n== giảm chuyển động · ?tk3d=1 ==');
  const t = backend(vn('2026-10-18', '20:15'));
  const page = await open(t, Object.assign({ reducedMotion: 'reduce' }, DESK), 'rm', '?tk3d=1');
  await login(page, true);
  await cells(page, [['2026-10-19', 18], ['2026-10-21', 18]]);
  await page.click('#cta');
  await page.waitForSelector('.pg-tk');
  /* bắt trạng thái đầu tiên có bản WebGL (dò mỗi khung): phải là dáng cuối luôn */
  const first = await page.waitForFunction(() => { const d = window.TK3D && TK3D._dbg(); return d && d.shown ? { p: d.p, frames: d.frames } : null; }, null, { timeout: 90000, polling: 'raf' });
  const f = await first.jsonValue();
  await sleep(1200);
  const D = await dbg(page), st = await state(page);
  ok('Giảm chuyển động → hiện thẳng dáng cuối (lần đầu thấy: dáng ' + f.p + ', ' + f.frames + ' khung; sau 1,2 s: ' + D.frames + ' khung)', f.p === 1 && D.p === 1 && D.frames <= f.frames + 1 && st.gl, { f, D: { p: D.p, frames: D.frames }, st });
  /* phiếu → phiếu khi đã khởi động: dựng ngay trong cú bấm (không có khoảnh khắc vé phẳng) */
  await tap(page, '[data-a="tkdone"]');
  await page.waitForSelector(vis('[data-a="gochg"]'));
  const st2 = await state(page), D2 = await dbg(page);
  ok('Giảm chuyển động, phiếu → phiếu → bản WebGL dáng cuối ngay khi trang mới hiện', D2.shown && D2.p === 1 && st2.gl && st2.inStage, { st2, D2: { shown: D2.shown, p: D2.p } });
  await page._ctx.close();
}

async function offFlow() {
  for (const [q, name, why] of [['?tk3d=0', 'off', 'tắt tay ?tk3d=0'], ['', 'soft', 'mặc định trên WebGL chạy bằng CPU (SwiftShader)']]) {
    console.log('\n== ' + why + ' ==');
    const t = backend(vn('2026-10-18', '20:15'));
    const page = await open(t, DESK, name, q);
    await login(page, true);
    await cells(page, [['2026-10-19', 18], ['2026-10-21', 18]]);
    await tap(page, '#cta');
    await page.waitForSelector('.pg-tk');
    await sleep(3500);
    const st = await state(page), D = await dbg(page);
    ok(why + ' → chỉ vé DOM (không canvas, vé hiện rõ' + (D.err ? ', lý do: ' + D.err : '') + ')', st.canvases === 0 && !st.gl && st.op === 1 && !D.on && D.ok !== true, { st, D: { ok: D.ok, err: D.err, on: D.on } });
    await page._ctx.close();
  }
}

(async () => {
  browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  server = await startServer();
  ana = await browser.newPage();
  const only = process.argv[2] || 'all';
  const all = { desktop: deskFlow, mobile: mobFlow, rm: reducedFlow, off: offFlow };
  process.on('unhandledRejection', e => { console.error(e); process.exit(2); });
  for (const k of Object.keys(all)) if (only === 'all' || only.split(',').indexOf(k) >= 0) await all[k]();
  console.log('\n  console/pageerror:', ERRS.length ? ERRS : 'none');
  ok('0 lỗi console / pageerror', ERRS.length === 0, ERRS);
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
