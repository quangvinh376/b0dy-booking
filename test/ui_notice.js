/* Thẻ thông báo + tia viền "border beam" cho thẻ kích cầu ghép cặp 1:2 (1.4.0). Chế độ QC (dữ liệu bịa), desktop + mobile.
   node test/ui_notice.js
   Bối cảnh: chủ studio 20/10 — "tia viền rất tệ, thiếu đồng nhất; 2 thiết kế thẻ; chuyển màn khựng giật; dải sàn thiếu đầu tư" → 1.4.0
   dựng lại tia chỉ chạy trên compositor (beamMount: hạt / cửa sổ chạy bằng Web Animations, chỉ transform; trường màu 9 đốm vẽ một lần)
   và gộp thẻ về một mặt (.mnt = .prl: nền Giấy 2, không viền, icon ghép, tiêu đề / giờ + nhãn).
   1. Uyển Nhi (có lời mời): thẻ vào cùng cảnh trang trượt vào → .sig-in gắn SAU khi trang vào xong ≥ 150 ms, B0B nhìn đúng lúc ·
      mobile: thẻ mời = lớp tia .bm (vành + mặt thẻ + quầng, 9 đốm, KHÔNG hoà trộn): 4 cạnh × cửa sổ trượt + trường màu trượt ngược,
      16 animation chỉ transform, vô hạn, linear, đi đều + liền qua góc 360 px/s · mặt thẻ thống nhất · desktop: sàn có tia viền trên (ray + 2 cửa sổ vạch + 2 cửa sổ quầng),
      9 màu theo sắc độ, luôn đúng một đầu tia trên màn, màu đứng yên theo hoành độ · 0 Paint trên luồng chính khi tia chạy · cửa sổ /
      ngăn kéo che → tia dừng tại chỗ, đóng → chạy tiếp từ đúng chỗ · kênh live hỏi lại → cùng phần tử, tia không chạy lại từ đầu
   2. Minh Khôi chọn T5 09:00, người khác đặt trước (thẻ cảnh báo, không phải ghép cặp): không tia, không viền Mực · mobile: cửa sổ báo
      đang che → chờ, đóng rồi mới gắn · B0B nhìn thẻ cảnh báo đúng lúc
   3. Thục Quyên đặt 2 buổi 1:2 → phiếu: dòng Tập đôi "… · Mời bạn" có tia, cùng mặt thẻ với thẻ mời mobile; đổi cỡ màn → đường đi đo lại,
      pha giữ nguyên · kênh live → cùng phần tử
   4. Tab ẩn lúc thẻ vào → chưa gắn; mở lại tab → gắn
   5. Giảm chuyển động → gắn ngay; viền màu tĩnh thở chậm (chỉ opacity), không hạt, không chạy */
'use strict';
const zlib = require('zlib');
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');
const EXE = require('./pw_exe'), ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } }
async function waitView(page, v) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: 10000 }); }
async function until(f, ms) { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; }

/* nhật ký trong trang: thẻ vào · trang vào xong · gắn .sig-in · cửa sổ đóng · B0B nhìn thẻ */
function instrument() {
  const L = window.__sg = [], t = () => performance.now();
  const A = window.__an = [], oa = Element.prototype.animate;   /* gom mọi Web Animation để soi animation mồ côi (phần tử đã rời trang) */
  Element.prototype.animate = function () { const a = oa.apply(this, arguments); A.push(a); return a; };
  const vis = e => e.getClientRects().length > 0, SELS = '#floor .nt, #mNote .mnt, #prLine .prl';
  const card = e => e.nodeType === 1 && e.matches && e.matches(SELS);
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'childList') m.addedNodes.forEach(n => {
      const cs = n.nodeType === 1 ? [n].filter(card).concat(Array.from(n.querySelectorAll(SELS))) : [];
      cs.forEach(c => { if (!vis(c)) return; c.__id = c.__id || Math.random().toString(36).slice(2);
        L.push({ k: 'in', at: t(), id: c.__id, warn: c.classList.contains('warn'), sig: c.classList.contains('sig-in') }); });
    });
    if (m.type === 'attributes' && m.target.nodeType === 1) {
      const e = m.target, was = m.oldValue || '';
      if (e.classList.contains('page') && /enter-(fwd|back)/.test(was) && !/enter-(fwd|back)/.test(e.className)) L.push({ k: 'settle', at: t() });
      if (card(e) && vis(e) && e.classList.contains('sig-in') && !/\bsig-in\b/.test(was)) L.push({ k: 'sig', at: t(), id: e.__id });
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
/* B0B được gọi ngay trong lượt gắn .sig-in, MutationObserver ghi mốc "sig" sau đó một nhịp vi tác vụ → cho lệch ≤ SAME ms */
const SAME = 30;
const log = page => page.evaluate(() => window.__sg.slice());
const lastIn = (l, warn) => l.filter(x => x.k === 'in' && (warn == null || x.warn === warn)).pop();
/* trạng thái thẻ đang hiện + lớp tia của nó (chính thẻ data-beam="card", hay lớp phủ sàn .flb data-beam="strip" của thẻ .pair) */
async function state(page, sel) {
  return page.evaluate(s => {
    const e = Array.from(document.querySelectorAll(s)).filter(x => x.getClientRects().length)[0]; if (!e) return null;
    const b = e.hasAttribute('data-beam') ? e : e.classList.contains('pair') ? document.querySelector('#floor > .flb') : null, bm = b && b.querySelector(':scope > .bm');
    const an = Array.from(new Set(e.getAnimations({ subtree: true }).concat(b ? b.getAnimations({ subtree: true }) : [])));
    const wa = an.filter(a => !a.animationName), p0 = bm && bm.querySelector('.bm-k, .bm-w'), a0 = p0 && p0.getAnimations().filter(a => !a.animationName)[0], B = b && b._bm, now = document.timeline.currentTime;
    const props = Array.from(new Set(wa.flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !/^(offset|easing|composite|computedOffset)$/.test(x))))));
    return { id: e.__id, sig: e.classList.contains('sig-in'), card: e.hasAttribute('data-beam'), pair: e.classList.contains('pair'), beam: b ? b.getAttribute('data-beam') : null,
             flb: !!document.querySelector('#floor > .flb'), still: !!bm && bm.classList.contains('still'), bmEl: bm ? (bm.__id = bm.__id || Math.random().toString(36).slice(2)) : null,
             n: wa.length, props: props.sort().join(','), inf: wa.length > 0 && wa.every(a => a.effect.getTiming().iterations === Infinity),
             lin: wa.every(a => a.effect.getTiming().easing === 'linear'), run: wa.length > 0 && wa.every(a => a.playState === 'running'),
             paused: wa.length > 0 && wa.every(a => a.playState === 'paused'), a0: a0 ? { start: a0.startTime, cur: a0.currentTime, dur: a0.effect.getTiming().duration } : null,
             frac: B && B.T ? ((now - B.o) / B.T % 1 + 1) % 1 : null, T: B ? B.T : null, now: now, pre: wa.some(a => a.playState === 'running' && a.currentTime < 0),
             css: an.filter(a => a.animationName && a.playState === 'running').map(a => a.animationName).filter((x, i, a) => a.indexOf(x) === i).sort().join(','),
             shadow: getComputedStyle(e).boxShadow, bg: getComputedStyle(e).backgroundColor };
  }, sel);
}
/* cấu tạo lớp tia của thẻ ("cửa sổ trượt theo chu vi"): vành + mặt thẻ + quầng + lớp rê chuột; không hoà trộn / filter nào; 16 Web Animations
   (2 lớp × 4 cạnh × cửa sổ + trường màu) chỉ transform. Hình học dựng lại ĐỘC LẬP trong test (chu vi P = 2W + 2H − 4R, chỗ bắt đầu từng
   cạnh): dừng ở 8 mốc trong vòng → đúng một cạnh chứa đầu tia, ở đúng s = phần vòng × P (đi đều, liền qua góc); cửa sổ + trường màu = 0 */
async function cardBeam(page, sel) {
  return page.evaluate(s => {
    const e = document.querySelector(s), bm = e && e.querySelector(':scope > .bm'); if (!bm) return { err: 'không có .bm' };
    const cs = x => getComputedStyle(x), W = e.offsetWidth, H = e.offsetHeight, r = 4, P = 2 * W + 2 * H - 4 * r, L = Math.max(180, Math.min(320, .3 * P)), n = 8;
    const sa = [0, W, W + H - 2 * r, 2 * W + H - 2 * r], len = [W, H - 2 * r, W, H - 2 * r];
    const ring = Array.from(bm.querySelectorAll(':scope > .bm-ring > .bm-e')), glow = Array.from(bm.querySelectorAll(':scope > .bm-gl > .bm-gf > .bm-gx > .bm-e'));
    const COL = ['rgb(220, 0, 77)', 'rgb(2, 109, 214)', 'rgb(0, 128, 39)', 'rgb(5, 124, 114)', 'rgb(100, 70, 255)', 'rgb(184, 79, 5)', 'rgb(208, 1, 153)', 'rgb(174, 29, 234)'];
    const imgs = ring.map(x => cs(x.querySelector('.bm-f')).backgroundImage).join(' ');
    const wa = el => el.getAnimations().filter(a => !a.animationName)[0], all = ring.concat(glow).flatMap(x => [wa(x.querySelector('.bm-k')), wa(x.querySelector('.bm-f'))]);
    const T = all[0].effect.getTiming().duration, tr = el => { const m = new DOMMatrix(cs(el).transform); return m.m41 || m.m42; };
    const st = all.map(a => a.startTime), B = e._bm, out = [], sum = [];
    const headAt = () => ring.map((x, i) => { const u = tr(x.querySelector('.bm-k')) + L; return u >= 0 && u < len[i] ? sa[i] + u : null; }).filter(v => v != null);
    /* đang dừng (cửa sổ che): kiểm đúng trạng thái đứng yên — một đầu tia, ở đúng phần vòng đã lưu (b.hf) */
    const held = all.every(a => a.playState === 'paused'), h0 = headAt();
    const heldOk = held ? h0.length === 1 && B.hf != null && Math.abs(((h0[0] - B.hf * P) % P + P + P / 2) % P - P / 2) <= 1 : null;
    if (held) return { held: true, heldOk, h0, hf: B.hf, P, n: all.length };
    all.forEach(a => a.pause());
    for (let k = 0; k < 8; k++) {
      const tau = k * T / 8;                                     /* thời gian kể từ gốc pha của thẻ */
      all.forEach((a, i) => { a.currentTime = ((tau - (st[i] - B.o)) % T + T) % T; });
      const hit = headAt();
      out.push(hit.length === 1 ? +(((hit[0] - tau / T * P) % P + P + P / 2) % P - P / 2).toFixed(2) : 'n=' + hit.length);
      sum.push(Math.max.apply(null, ring.concat(glow).map(x => Math.abs(tr(x.querySelector('.bm-k')) + tr(x.querySelector('.bm-f'))))));
    }
    all.forEach((a, i) => { a.startTime = st[i]; });
    const shape = cs(ring[0].querySelector('.bm-k')).maskImage || cs(ring[0].querySelector('.bm-k')).webkitMaskImage || '';
    return { kids: Array.from(bm.children).map(x => x.className).join('|'), nEdge: [ring.length, glow.length].join(','), n: all.length,
             blend: Array.from(bm.querySelectorAll('*')).concat([bm]).every(x => cs(x).mixBlendMode === 'normal' && cs(x).filter === 'none'),
             colors: COL.every(c => imgs.includes(c)), banned: /rgb\(10, 10, 10\)|rgb\(74, 74, 74\)/.test(imgs),
             D: +T.toFixed(1), Dexp: +(P / 360 * 1000).toFixed(1), err8: out, ok8: out.every(v => typeof v === 'number' && Math.abs(v) <= 1),
             fixed: +Math.max.apply(null, sum).toFixed(2), win: Math.round(ring[0].querySelector('.bm-k').offsetWidth), winExp: Math.round(L + n), shape: /linear-gradient/.test(shape),
             clip: cs(bm).clipPath, hv: !!bm.querySelector(':scope > .bm-hv'), w: W, h: H };
  }, sel);
}
/* animation vô hạn còn "chạy" trên phần tử đã rời trang (tia cũ không huỷ → rò bộ nhớ, luồng chính lấy mẫu mỗi khung) */
const orphans = page => page.evaluate(() => (window.__an || []).filter(a => a.playState === 'running' && a.effect && a.effect.target && !a.effect.target.isConnected).length);
/* x nằm trong cung [a, b] của vòng tròn đơn vị (phần vòng, mod 1) */
const inArc = (x, a, b) => { const m = v => (v % 1 + 1) % 1, d = m(x - a); return b - a >= 1 || d <= m(b - a) + 1e-9; };
/* pha (phần vòng) của tia trên thẻ, theo đồng hồ của trang */
const phase = (page, sel) => page.evaluate(s => { const e = document.querySelector(s), b = e && e._bm, t = document.timeline.currentTime; return b && b.T ? { f: ((t - b.o) / b.T % 1 + 1) % 1, T: b.T, t } : null; }, sel);
/* dải sàn: ray tĩnh + vạch + quầng; mỗi nhóm 2 cửa sổ cách nhau đúng 1 bề ngang; trường màu trượt ngược (màu đứng yên theo hoành độ);
   dừng ở 12 mốc trong vòng → đúng MỘT đầu tia nằm trên màn */
async function stripBeam(page) {
  return page.evaluate(() => {
    const f = document.querySelector('#floor > .flb[data-beam="strip"]'), bm = f && f.querySelector(':scope > .bm'); if (!bm) return { err: 'không có .flb > .bm' };
    const cs = x => getComputedStyle(x), w = f.offsetWidth, L = Math.round(Math.max(320, Math.min(640, w * .3)));
    const z = cls => bm.querySelector(':scope > .bm-z.' + cls), ws = cls => Array.from(z(cls).querySelectorAll(':scope > .bm-w'));
    const line = cs(z('bm-r').querySelector('.bm-f')).backgroundImage;
    const ORD = ['rgb(0, 128, 39)', 'rgb(5, 124, 114)', 'rgb(2, 109, 214)', 'rgb(2, 109, 214)', 'rgb(100, 70, 255)', 'rgb(174, 29, 234)', 'rgb(208, 1, 153)', 'rgb(220, 0, 77)', 'rgb(184, 79, 5)'];
    const got = (line.match(/rgb\([^)]*\)/g) || []);
    const wa = el => el.getAnimations().filter(a => !a.animationName)[0];   /* .bm-w còn animation CSS mờ vào (bmin) — chỉ lấy Web Animation */
    const A = ws('bm-l').concat(ws('bm-h')).map(x => [x, x.querySelector('.bm-f')]), an = A.flatMap(([x, y]) => [wa(x), wa(y)]);
    const D = an[0].effect.getTiming().duration, tx = el => new DOMMatrix(cs(el).transform).m41, st = an.map(a => a.startTime), heads = [], fixed = [];
    an.forEach(a => a.pause());
    for (let k = 0; k < 12; k++) {
      an.forEach(a => { a.currentTime = (k + .5) * D / 12; });
      const [la, fa] = A[0], [lb, fb] = A[1];
      heads.push([tx(la) + L, tx(lb) + L].filter(x => x >= 0 && x < w).length);
      fixed.push(Math.max(Math.abs(tx(la) + tx(fa)), Math.abs(tx(lb) + tx(fb))));   /* cửa sổ + trường màu = 0 → màu đứng yên */
    }
    an.forEach((a, i) => { a.startTime = st[i]; });
    return { groups: Array.from(bm.children).map(x => x.className).join('|'), nw: [ws('bm-l').length, ws('bm-h').length], v: ws('bm-h').every(x => !!x.querySelector(':scope > .bm-v')),
             gap: +(tx(A[1][0]) - tx(A[0][0])).toFixed(1), w, L, D: +D.toFixed(1), Dexp: +(w / 360 * 1000).toFixed(1), order: got.join('|') === ORD.join('|'), got: got.length,
             top: cs(f).top, rail: [cs(z('bm-r')).height, +cs(z('bm-r')).opacity], lineH: cs(z('bm-l')).height, heads: heads.join(''), fixed: +Math.max.apply(null, fixed).toFixed(2),
             blend: Array.from(bm.querySelectorAll('*')).every(x => cs(x).mixBlendMode === 'normal'),
             boxes: ['bm-r', 'bm-l', 'bm-h'].map(c => { const r = z(c).querySelector('.bm-f').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) };
  });
}
/* chi phí luồng chính: ghi trace khi tia đang chạy, đếm sự kiện Paint và tra phần tử gốc của từng lần vẽ — tia chỉ compositor → không
   lần vẽ nào thuộc lớp tia / thẻ có tia (lần vẽ của phần khác, vd chữ đồng hồ, liệt kê riêng để đọc) */
async function paints(page, ms) {
  const cdp = await page.context().newCDPSession(page), ev = [];
  await cdp.send('DOM.getDocument', { depth: -1 });
  cdp.on('Tracing.dataCollected', d => ev.push(...d.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  await sleep(ms);
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); await done;
  const who = [];
  for (const e of ev.filter(x => x.name === 'Paint')) {
    const id = e.args && e.args.data && e.args.data.nodeId; let w = 'không rõ';
    if (id) try {
      const o = await cdp.send('DOM.resolveNode', { backendNodeId: id });
      w = (await cdp.send('Runtime.callFunctionOn', { objectId: o.object.objectId, returnByValue: true, functionDeclaration:
        'function(){var e=this.nodeType===1?this:this.parentElement;if(!e)return this.nodeName;return e.closest("[data-beam],.bm,.flb")?"TIA":e.nodeName+(e.id?"#"+e.id:"")+(typeof e.className==="string"&&e.className?"."+e.className.split(" ").join("."):"")}' })).result.value;
    } catch (x) { w = 'đã gỡ'; }
    who.push(w);
  }
  await cdp.detach();
  return { paint: who.length, beam: who.filter(w => w === 'TIA').length, who };
}
/* điểm ảnh THẬT trên màn (ảnh chụp PNG, giải nén tại chỗ): đếm điểm ảnh có màu rực (max − min kênh > 60) trong vùng — bắt lỗi kiểu
   "test đọc style thấy đúng nhưng trên màn không hiện gì" (1.4.0: trường màu dải sàn là <i> inline → rộng 0) */
function pngRGBA(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const n = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.slice(p + 8, p + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break; p += 12 + n; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, out = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], src = y * (st + 1) + 1, dst = y * st;
    for (let x = 0; x < st; x++) { const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - st + x] : 0, c = x >= bpp && y ? out[dst - st + x - bpp] : 0, v = raw[src + x];
      let r = v; if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + x] = r & 255; } }
  return { w, h, bpp, d: out };
}
async function vivid(page, clip) {
  const im = pngRGBA(await page.screenshot({ clip })); let n = 0;
  for (let i = 0; i < im.w * im.h; i++) { const o = i * im.bpp, r = im.d[o], g = im.d[o + 1], b = im.d[o + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) > 60) n++; }
  return n;
}
/* lấy mẫu nhiều lần trong một vòng (tia chạy thật, không dừng): số lần có điểm ảnh rực / tổng */
async function vividRun(page, clipFn, arg, times, gap) {
  const clip = await page.evaluate(clipFn, arg), r = [];
  for (let i = 0; i < times; i++) { r.push(await vivid(page, clip)); await sleep(gap); }
  return r;
}
/* mặt thẻ chung (.mnt / .prl): nền Giấy 2, không viền, bo 4, icon ghép 20 px, chữ tiêu đề 16 px bắt đầu ở x = 46 trong thẻ;
   mobile (.w): tiêu đề dòng 1 · giờ + nhãn dòng 2 */
async function face(page, sel) {
  return page.evaluate(s => {
    const e = document.querySelector(s); if (!e) return null;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), ic = e.querySelector(':scope > svg.ic'), pt = e.querySelector('.pt'), pw = e.querySelector('.pw'), c = e.querySelector('.prl-c');
    const R = x => x ? x.getBoundingClientRect() : null, tr = R(pt), wr = R(pw), cr = R(c);
    return { bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, pair: !!ic && ic.querySelectorAll('circle').length === 2, ic: ic ? Math.round(R(ic).width) : 0,
             fs: pt ? getComputedStyle(pt).fontSize : '', x: tr ? Math.round(tr.left - r.left) : null, two: !!wr && wr.top >= tr.bottom - 1, row2: !!wr && !!cr && Math.abs(wr.top - cr.top) < 3,
             label: c ? c.textContent : '', txt: e.textContent };
  }, sel);
}
async function newPage(browser, server, mobile, opt) {
  opt = opt || {};
  const ctx = await browser.newContext(Object.assign(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } },
                                                     opt.rm ? { reducedMotion: 'reduce' } : {}));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.route(API + '**', r => r.abort());
  await page.goto(server.url + 'img/favicon.svg'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(server.url + '?qc&tk3d=0'); await page.waitForSelector('.qc-tab');
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
  return { ctx, page, errs, qc, login };
}
const armedOn = (page, sel) => until(async () => { const s = await state(page, sel); return s && s.sig; }, 6000);
/* tia đã chạy và mờ vào xong (animation mờ vào hữu hạn đã kết thúc → chỉ còn các animation vô hạn) */
const beamUp = (page, sel) => until(async () => { const s = await state(page, sel); return s && s.n > 0 && s.run && s.inf; }, 6000);

async function invitee(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' · được mời (Uyển Nhi) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  const bob = await login('uyen nhi', '5555'); await waitView(page, 'book');
  ok('Có B0B để theo dõi (B0B.emit)', bob);
  await armedOn(page, SEL); await sleep(60);
  let l = await log(page);
  const i1 = lastIn(l), g1 = l.filter(x => x.k === 'sig' && i1 && x.id === i1.id)[0], st1 = l.filter(x => x.k === 'settle' && i1 && x.at >= i1.at - 1).pop();
  ok('Thẻ vào cùng cảnh trang trượt vào: lúc đó chưa gắn .sig-in', !!i1 && !i1.sig, i1);
  ok('Gắn .sig-in SAU khi trang vào xong, lặng ≥ 150 ms (≤ 900 ms)', !!g1 && !!st1 && g1.at - st1.at >= 150 && g1.at - st1.at <= 900,
     [st1 && Math.round(st1.at - i1.at), g1 && Math.round(g1.at - i1.at)]);
  const b1 = l.filter(x => x.k === 'bob' && i1 && x.id === i1.id);
  ok('B0B nhìn thẻ đúng lúc gắn (không trước) · thẻ thường → "toast"', b1.length === 1 && !!g1 && b1[0].at >= g1.at - SAME && b1[0].at - g1.at <= 200 && b1[0].type === 'toast',
     b1.map(x => [x.type, Math.round(x.at - (g1 ? g1.at : 0))]));
  await beamUp(page, SEL);
  const s1 = await state(page, SEL);
  ok('Không còn CSS tia của gói (data-active / @property / beam-*) — chỉ Web Animations', !!s1 && !/beam-/.test(s1.css) &&
     await page.evaluate(() => !document.querySelector('[data-active], [data-beam-bloom], [data-beam="b0"], [data-beam="b0l"]')), s1);
  if (mobile) {
    ok('Thẻ mời mobile: data-beam="card", lớp tia .bm, 16 Web Animations chỉ transform, vô hạn, linear, đang chạy (không cạnh nào chờ tới lượt — đứng yên)', !!s1 && s1.card && s1.beam === 'card' && !s1.still &&
       s1.n === 16 && s1.props === 'transform' && s1.inf && s1.lin && s1.run && !s1.pre, s1);
    const cb = await cardBeam(page, SEL);
    ok('Lớp tia thẻ: vành · mặt thẻ · quầng · lớp rê chuột; 4 cạnh × 2 lớp; KHÔNG hoà trộn / filter nào; góc bo cắt một lần (clip-path)', cb.kids === 'bm-ring|bm-sf|bm-gl|bm-hv' &&
       cb.nEdge === '4,4' && cb.n === 16 && cb.blend && /inset\(0/.test(cb.clip) && cb.hv, cb);
    ok('Trường màu: đủ 8 màu khác nhau của 9 đốm, không Than / Mực', cb.colors && !cb.banned, cb);
    ok('Nhịp: 1 vòng = chu vi / 360 px/s · tia dài 30 % chu vi (180–320 px) + mũi 8 px', Math.abs(cb.D - cb.Dexp) < 1 && cb.win === cb.winExp && cb.shape, cb);
    ok('8 mốc trong vòng: đúng một cạnh chứa đầu tia, ở đúng chỗ (đi đều, liền qua góc, lệch ≤ 1 px) · màu đứng yên theo vị trí', cb.ok8 && cb.fixed < .01, cb);
    const vc = await vividRun(page, s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4 }; }, SEL, 6, 380);
    ok('Trên màn thật: viền thẻ có điểm ảnh màu rực ở MỌI lần chụp trong ~2,3 s (tia luôn hiện, không cạnh nào đứng chờ)', vc.every(n => n >= 20), vc);
    const fc = await face(page, SEL);
    ok('Mặt thẻ chung: nền Giấy 2, không viền Mực, bo 4, icon ghép 20 px, tiêu đề 16 px ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' && fc.radius === '4px' &&
       fc.pair && fc.ic === 20 && fc.fs === '16px' && fc.x === 46, fc);
    ok('Mobile: tiêu đề dòng 1 · "T3 17:00" + nhãn "Xem" dòng 2 · chữ đọc liền "Tuấn Kiệt mời bạn tập đôi · T3 17:00"', !!fc && fc.two && fc.row2 && fc.label === 'Xem' &&
       /Tuấn Kiệt mời bạn tập đôi · T3 17:00/.test(fc.txt), fc);
  } else {
    ok('Sàn desktop có lời mời: lớp phủ .flb data-beam="strip" + lớp tia; thẻ trên sàn không tia quanh thẻ', !!s1 && s1.pair && !s1.card && s1.beam === 'strip' && !s1.still, s1);
    ok('Tia sàn: 8 Web Animations (2 cửa sổ × vạch / quầng, mỗi cửa sổ + trường màu) chỉ transform, vô hạn, linear, đang chạy', !!s1 && s1.n === 8 && s1.props === 'transform' && s1.inf && s1.lin && s1.run, s1);
    const sb = await stripBeam(page);
    ok('Lớp sàn: ray 1 px (.28) + vạch 2 px + quầng (có .bm-v), mỗi nhóm 2 cửa sổ cách nhau đúng 1 bề ngang, không hoà trộn, đè đúng đường kẻ viền (top -1px)',
       sb.groups === 'bm-z bm-r|bm-z bm-l|bm-z bm-h' && sb.nw.join() === '2,2' && sb.v && sb.gap === sb.w && sb.blend && sb.top === '-1px' &&
       sb.rail[0] === '1px' && sb.rail[1] === 0.28 && sb.lineH === '2px', sb);
    ok('9 màu theo sắc độ trái → phải (lục · ngọc · lam · lam · chàm · tím · tím hồng · đỏ hồng · cam)', sb.order, sb);
    ok('Nhịp: 1 lượt = bề ngang / 360 px/s (cùng tốc độ với tia thẻ) · tia dài 30 % bề ngang (320–640 px)', Math.abs(sb.D - sb.Dexp) < 1 && sb.L === 432, sb);
    ok('12 mốc trong vòng: luôn đúng MỘT đầu tia trên màn (không quãng chết) · màu đứng yên theo hoành độ', sb.heads === '111111111111' && sb.fixed < .01, sb);
    ok('Trường màu dải sàn là hộp thật (rộng = bề ngang sàn, cao > 0) ở ray / vạch / quầng', sb.boxes.every(b => Math.abs(b[0] - sb.w) < 1 && b[1] > 0), sb.boxes);
    const vs = await vividRun(page, () => { const r = document.querySelector('#floor').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 1), width: innerWidth, height: 6 }; }, null, 8, 450);
    ok('Trên màn thật: mép trên sàn có điểm ảnh màu rực ở MỌI lần chụp trong ~3,6 s (tia luôn hiện, không quãng chết)', vs.every(n => n >= 20), vs);
  }
  const pt = await paints(page, 2000);
  if (pt.paint) console.log('        (lần vẽ ngoài tia: ' + pt.who.join(', ') + ')');
  ok('Tia chạy 2 s: 0 lần vẽ (Paint) nào thuộc lớp tia / thẻ có tia — chỉ compositor', pt.beam === 0, pt);
  /* đã đọc: rê chuột dừng trên thẻ (desktop) / chạm thẻ → cửa sổ chi tiết: tia dừng tại chỗ → đóng: chạy tiếp từ đúng chỗ */
  if (!mobile) {
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, SEL);
    await page.mouse.move(box.x, box.y); await sleep(1200); await page.mouse.move(box.x, 120); await sleep(200);
    const s2 = await state(page, SEL);
    ok('Rê chuột dừng trên thẻ 1,2 s → tia vẫn chạy (gây chú ý liên tục, không dừng khi đã đọc)', !!s2 && s2.run, s2);
    await page.locator('#floor [data-a="info"]').click(); await page.waitForSelector('#drawer.on', { timeout: 4000 }).catch(() => {}); await sleep(400);
  } else {
    await page.locator(SEL).tap(); await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {}); await sleep(400);
  }
  const h1 = await state(page, SEL); await sleep(500); const h2 = await state(page, SEL), hold = await page.evaluate(s => { const e = document.querySelector(s), b = (e.hasAttribute('data-beam') ? e : document.querySelector('#floor > .flb'))._bm; return b.hf; }, SEL);
  ok('Mở ' + (mobile ? 'cửa sổ chi tiết' : 'ngăn kéo Gói & luật') + ' (trang inert) → tia dừng tại chỗ', !!h1 && h1.paused && !!h2 && h2.paused && h1.a0.cur === h2.a0.cur && hold != null, [h1 && h1.a0, h2 && h2.a0, hold]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#sheet').hidden && document.querySelector('#drawer').hidden, null, { timeout: 4000 }).catch(() => {});
  await sleep(300);
  const s2 = await state(page, SEL);
  const df = s2 && s2.frac != null ? ((s2.frac - hold) % 1 + 1) % 1 : null;
  ok('Đóng lại → tia chạy tiếp từ đúng chỗ đã dừng (phần vòng chỉ tiến thêm ≤ 0,5 vòng, không về đầu), vẫn cùng lớp tia', !!s2 && s2.run && s2.bmEl === h1.bmEl && df != null && df < .5,
     [hold, s2 && s2.frac, df]);
  const g2 = mobile ? await cardBeam(page, SEL) : await stripBeam(page);
  ok('… sau khi chạy tiếp, hình học còn nguyên: ' + (mobile ? 'đúng một đầu tia đi liền qua 4 cạnh' : 'luôn đúng một đầu tia trên sàn'), mobile ? g2.ok8 && g2.fixed < .01 : g2.heads === '111111111111' && g2.fixed < .01,
     mobile ? g2.err8 : g2.heads);
  /* kênh live */
  const before = await state(page, SEL), f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s3 = await state(page, SEL);
  ok('Kênh live hỏi lại, thẻ không đổi → cùng phần tử, cùng lớp tia, tia không chạy lại từ đầu', !!s3 && !!before && s3.id === before.id && s3.bmEl === before.bmEl && s3.run &&
     s3.a0.start === before.a0.start, [before && before.a0, s3 && s3.a0]);
  const toast = await page.evaluate(() => { const t = document.querySelector('#toast') || Object.assign(document.createElement('div'), { className: 'toast on' }); if (!t.isConnected) document.body.appendChild(t);
    const c = getComputedStyle(t, '::after').content; if (!t.id) t.remove(); return c; });
  ok('Toast: không còn vạch Acid quét mép dưới', toast === 'none', toast);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function warnCard(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile' : 'desktop') + ' · thẻ cảnh báo (không ghép cặp) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  await login('minh khoi', '1111'); await waitView(page, 'book'); await sleep(900);
  await page.locator('#wkb .c[data-d="2026-10-22"][data-h="9"] >> visible=true').first().click(); await sleep(200);
  await qc('[data-qc="other"]');
  await page.waitForFunction(() => window.__lt.S.notice && window.__lt.S.notice.type === 'gone', null, { timeout: 6000 }).catch(() => {});
  if (mobile) {
    await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {});
    await sleep(1200);
    const s = await state(page, SEL);
    ok('Mobile: thẻ cảnh báo mới vào khi cửa sổ báo đang che → chưa gắn', !!s && !s.sig && await page.evaluate(() => !document.querySelector('#sheet').hidden), s);
    await page.keyboard.press('Escape');
  }
  const okArm = await until(async () => { const s = await state(page, SEL + '.warn'); return s && s.sig; }, 6000);
  await sleep(700);
  const l = await log(page), i = lastIn(l, true), g = l.filter(x => x.k === 'sig' && i && x.id === i.id)[0], b = l.filter(x => x.k === 'bob' && i && x.id === i.id);
  if (mobile) {
    const off = l.filter(x => x.k === 'sheetoff').pop();
    ok('… đóng cửa sổ → gắn sau khi cửa sổ khuất ≥ 150 ms', okArm && !!g && !!off && g.at - off.at >= 150 && g.at - off.at <= 900, [off && Math.round(off.at - i.at), g && Math.round(g.at - i.at)]);
  } else {
    ok('Desktop: thẻ cảnh báo mới trên sàn → gắn sau khi sàn hiện xong (≥ 220 + 150 ms sau khi thẻ vào)', okArm && !!i && !!g && g.at - i.at >= 370 && g.at - i.at <= 1400, [i, g && Math.round(g.at - i.at)]);
  }
  const s = await state(page, SEL + '.warn');
  ok('Thẻ cảnh báo không phải ghép cặp → không tia (thẻ lẫn sàn), không animation nào chạy', !!s && !s.card && !s.pair && !s.beam && !s.flb && !s.n && !s.css, s);
  if (mobile) { const fc = await face(page, SEL + '.warn');
    ok('Thẻ cảnh báo cùng mặt thẻ: nền Giấy 2, KHÔNG viền Mực, bo 4, tiêu đề ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' && fc.radius === '4px' && fc.x === 46, fc); }
  ok('B0B nhìn thẻ cảnh báo đúng lúc gắn · "error"', b.length === 1 && !!g && b[0].at >= g.at - SAME && b[0].at - g.at <= 200 && b[0].type === 'error',
     b.map(x => [x.type, Math.round(x.at - (g ? g.at : 0))]));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function ticketLine(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile' : 'desktop') + ' · phiếu: dòng Tập đôi "Mời bạn" (Thục Quyên) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  await login('thuc quyen', '1212'); await waitView(page, 'book'); await sleep(700);
  for (const [d, h] of [['2026-10-21', 11], ['2026-10-22', 11]]) { await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first().click(); await sleep(200); }
  await page.locator(mobile ? '#ctaM' : '#cta').click();
  await waitView(page, 'ticket');
  await beamUp(page, '#prLine .prl');
  const s = await state(page, '#prLine .prl'), fc = await face(page, '#prLine .prl');
  ok('Dòng "2 buổi đang chờ bạn tập · Mời bạn" có tia: data-beam="card", 16 Web Animations chỉ transform, vô hạn, đang chạy', !!fc && /2 buổi đang chờ bạn tập/.test(fc.txt) && fc.label === 'Mời bạn' &&
     !!s && s.card && s.beam === 'card' && s.n === 16 && s.props === 'transform' && s.inf && s.run && !s.pre, [fc, s]);
  ok('Cùng mặt thẻ với thẻ mời mobile: nền Giấy 2, không viền, bo 4, icon ghép 20 px, tiêu đề 16 px ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' &&
     fc.radius === '4px' && fc.pair && fc.ic === 20 && fc.fs === '16px' && fc.x === 46, fc);
  const cb = await cardBeam(page, '#prLine .prl');
  ok('Tia trên dòng: cùng tốc độ 360 px/s (1 vòng = chu vi / 360), đi đều + liền qua góc (8 mốc ≤ 1 px), không hoà trộn', Math.abs(cb.D - cb.Dexp) < 1 && cb.ok8 && cb.fixed < .01 &&
     cb.blend && cb.win === cb.winExp, cb);
  /* đổi cỡ màn → ResizeObserver đo lại đường đi + nhịp, giữ nguyên startTime (không giật, không chạy lại) */
  const a0 = s.a0, vw = mobile ? 360 : 1280, p1 = await phase(page, '#prLine .prl');
  await page.setViewportSize({ width: vw, height: mobile ? 800 : 860 }); await sleep(500);
  const cb2 = await cardBeam(page, '#prLine .prl'), s2 = await state(page, '#prLine .prl'), p2 = await phase(page, '#prLine .prl');
  const dp = p1 && p2 ? ((p2.f - p1.f - (p2.t - p1.t) / p2.T) % 1 + 1.5) % 1 - .5 : null;
  ok('Đổi cỡ màn → đo lại đường đi + nhịp theo cỡ mới (vẫn đều, liền), cùng lớp tia, đầu tia không nhảy (giữ phần vòng)', (mobile ? cb2.w !== cb.w : true) && Math.abs(cb2.D - cb2.Dexp) < 1 && cb2.ok8 &&
     !!s2 && s2.bmEl === s.bmEl && s2.run && dp != null && Math.abs(dp) < .03, [cb.w, cb2.w, cb2.D, cb2.Dexp, dp]);
  const f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s3 = await state(page, '#prLine .prl');
  ok('Kênh live hỏi lại trên phiếu, dòng không đổi → cùng phần tử, cùng lớp tia, không chạy lại từ đầu', !!s3 && s3.id === s.id && s3.bmEl === s.bmEl && s3.a0.start === s2.a0.start && s3.run, [s2.a0, s3 && s3.a0]);
  /* đổi trạng thái tại chỗ (tin live mang lời mời mới — chèn vào câu trả lời của máy chủ giả): dòng thành "Thảo Vy mời bạn tập đôi · T4 11:00"
     ngay trên phiếu → chữ mờ vào nhẹ (.swap), tia chạy tiếp: KHÔNG mờ vào lại (.bm-now), cùng pha theo đồng hồ chung */
  await page.evaluate(() => { const f = window.QCB.fetch; window.QCB.fetch = (u, i) => f(u, i).then(async r => { const j = await r.clone().json();
    if (!j || !j.duo) return r; j.duo.invIn = [{ from: 'Thảo Vy', date: '2026-10-21', h: 11 }];
    return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }); }); });
  const f3 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f3, { timeout: 6000 }).catch(() => {});
  await until(async () => /Thảo Vy/.test(await page.textContent('#prLine')), 3000); await sleep(300);
  const s4 = await state(page, '#prLine .prl'), sw = await page.evaluate(() => { const e = document.querySelector('#prLine .prl'), t = e.querySelector('.prl-t'),
      op = e.querySelector(':scope > .bm').getAnimations({ subtree: true }).filter(a => !a.animationName && a.effect.getKeyframes().some(k => 'opacity' in k));
    return { cls: e.className, q: op.length ? 'opacity' : 'none', bm: getComputedStyle(e.querySelector(':scope > .bm')).animationName, t: getComputedStyle(t.querySelector('.pt')).animationName,
             w: getComputedStyle(t.querySelector('.pw')).animationName, c: getComputedStyle(e.querySelector(':scope > .prl-c')).animationName }; });
  ok('Tin live đổi trạng thái → dòng lời mời "Thảo Vy mời bạn tập đôi · T4 11:00 · Xem" thay tại chỗ', /Thảo Vy mời bạn tập đôi · T4 11:00/.test(await page.textContent('#prLine')) && /\binv\b/.test(sw.cls), [await page.textContent('#prLine'), sw]);
  if (!mobile) { const f4 = await face(page, '#prLine .prl'), hh = await page.evaluate(() => Math.round(document.querySelector('#prLine .prl').getBoundingClientRect().height));
    ok('Desktop: dòng lời mời một dòng ("… · T4 11:00" liền tiêu đề), cao 48', !!f4 && !f4.two && hh === 48 && /Thảo Vy mời bạn tập đôi · T4 11:00/.test(f4.txt), [f4, hh]); }
  ok('… chữ mờ vào nhẹ (.swap), tia KHÔNG mờ vào lại (.bm-now), chạy tiếp cùng pha (startTime theo đồng hồ chung)', /\bswap\b/.test(sw.cls) && /\bbm-now\b/.test(sw.cls) && sw.q === 'none' && sw.bm === 'none' && sw.t === 'bmin' && sw.w === 'bmin' && sw.c === 'bmin' &&
     !!s4 && s4.bmEl !== s.bmEl && s4.run && s4.n === 16 && s3.frac != null && s4.frac != null && inArc(s4.frac, s3.frac + (s4.now - s3.now) / Math.max(s3.T, s4.T) - .01,
     s3.frac + (s4.now - s3.now) / Math.min(s3.T, s4.T) + .01), [sw, s3 && [s3.frac, s3.now, s3.T], s4 && [s4.frac, s4.now, s4.T]]);
  /* làm mới lặng tiếp, dòng không đổi → KHÔNG vẽ lại (so chuỗi bỏ lớp chạy .swap / .bm-now): cùng phần tử, cùng lớp tia, không mờ vào lại */
  const f5 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f5, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s5 = await state(page, '#prLine .prl');
  ok('… làm mới lặng tiếp, dòng không đổi → không vẽ lại: cùng phần tử, cùng lớp tia, cùng pha (không nháy chữ)', !!s5 && !!s4 && s5.id === s4.id && s5.bmEl === s4.bmEl &&
     s5.a0.start === s4.a0.start && s5.run, [s4 && s4.id, s5 && s5.id]);
  /* tập đôi đủ cả tuần (chèn duo.pairs, bỏ lời mời): "Tập đôi cả 2 buổi · cùng Uyển Nhi" — KHÔNG tia (việc đã xong) */
  await page.evaluate(() => { const f = window.QCB.__f || window.QCB.fetch; window.QCB.__f = f; window.QCB.fetch = (u, i) => f(u, i).then(async r => { const j = await r.clone().json();
    if (!j || !j.duo) return r; j.duo.invIn = []; j.duo.invOut = {}; j.duo.pairs = { '2026-10-21|11': 'Uyển Nhi', '2026-10-22|11': 'Uyển Nhi' };
    return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }); }); });
  const f6 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f6, { timeout: 6000 }).catch(() => {});
  await until(async () => /Tập đôi cả 2 buổi/.test(await page.textContent('#prLine')), 3000); await sleep(400);
  const dn = await page.evaluate(() => { const e = document.querySelector('#prLine .prl'); return e ? { txt: e.textContent, beam: e.hasAttribute('data-beam'), bm: !!e.querySelector('.bm'), lbl: !!e.querySelector('.prl-c'),
    over: Math.round(e.querySelector('.chev').getBoundingClientRect().right - e.getBoundingClientRect().right) } : null; });
  ok('Tập đôi đủ cả tuần → "Tập đôi cả 2 buổi · cùng Uyển Nhi", KHÔNG tia, không nhãn, chevron nằm trong thẻ', !!dn && /Tập đôi cả 2 buổi · cùng Uyển Nhi/.test(dn.txt) && !dn.beam && !dn.bm && !dn.lbl && dn.over <= -12, dn);
  await sleep(300);
  ok('Mọi tia cũ đã bị gỡ khỏi trang đều được huỷ (0 Web Animation mồ côi còn chạy)', await orphans(page) === 0, await orphans(page));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

/* thẻ mobile #mNote bị ẩn ở desktop (0 × 0, chưa có nhịp) → mở ngăn kéo (trang inert, tia dừng) → thu cửa sổ xuống mobile: thẻ hiện, đo lần
   đầu TRONG lúc dừng → phải đứng yên + lệch pha đúng 4 cạnh; đóng ngăn kéo → chạy, đầu tia đi liền */
async function holdResize(browser, server) {
  console.log('\n== desktop → mobile khi ngăn kéo đang mở (thẻ đo lần đầu lúc tia dừng) ==');
  const { ctx, page, errs, login } = await newPage(browser, server, false);
  await login('uyen nhi', '5555'); await waitView(page, 'book'); await sleep(900);
  const z = await page.evaluate(() => { const e = document.querySelector('#mNote .mnt'); return e ? [e.offsetWidth, e.offsetHeight, e._bm ? e._bm.anims.length : -1] : null; });
  ok('Desktop: thẻ mời mobile có lớp tia nhưng 0 × 0, chưa animation nào', !!z && z[0] === 0 && z[1] === 0 && z[2] === 0, z);
  await page.locator('#floor [data-a="info"]').click(); await page.waitForSelector('#drawer.on', { timeout: 4000 }).catch(() => {}); await sleep(300);
  await page.setViewportSize({ width: 800, height: 900 }); await sleep(700);
  const s1 = await state(page, '#mNote .mnt'), c1 = await cardBeam(page, '#mNote .mnt');
  ok('Thu xuống 800 px khi ngăn kéo còn mở → thẻ hiện, 16 animation ĐỨNG YÊN đúng pha (đúng một đầu tia, ở đúng phần vòng đã lưu)', !!s1 && s1.n === 16 && s1.paused && c1.held && c1.heldOk,
     [s1 && [s1.n, s1.paused], c1]);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#drawer').hidden && document.querySelector('#sheet').hidden, null, { timeout: 4000 }).catch(() => {});
  await sleep(400);
  const s2 = await state(page, '#mNote .mnt'), c2 = await cardBeam(page, '#mNote .mnt');
  ok('Đóng ngăn kéo → tia chạy, vẫn đúng một đầu tia đi liền qua 4 cạnh', !!s2 && s2.run && c2.ok8, [s2 && s2.run, c2.err8]);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function hiddenTab(browser, server) {
  console.log('\n== desktop · tab ẩn lúc thẻ vào ==');
  const { ctx, page, errs, login } = await newPage(browser, server, false);
  const hide = v => page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
    if (!h) document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  await login('uyen nhi', '5555', () => hide(true)); await waitView(page, 'book'); await sleep(1500);
  const s0 = await state(page, '#floor .nt');
  ok('Tab ẩn lúc thẻ vào → chưa gắn .sig-in (lớp tia sàn có sẵn)', !!s0 && !s0.sig && s0.flb, s0);
  const t0 = await page.evaluate(() => performance.now());
  await hide(false); await armedOn(page, '#floor .nt');
  const g = (await log(page)).filter(x => x.k === 'sig').pop();
  ok('Mở lại tab → gắn sau ≥ 150 ms lặng (≤ 900 ms), tia viền trên đang chạy', !!g && g.at - t0 >= 150 && g.at - t0 <= 900 && (await state(page, '#floor .nt')).run, g && Math.round(g.at - t0));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function reduced(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile' : 'desktop') + ' · giảm chuyển động ==');
  const { ctx, page, errs, login } = await newPage(browser, server, mobile, { rm: true });
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  await login('uyen nhi', '5555'); await waitView(page, 'book'); await armedOn(page, SEL); await sleep(300);
  const l = await log(page), i = lastIn(l), g = l.filter(x => x.k === 'sig').pop(), s = await state(page, SEL);
  ok('Giảm chuyển động: gắn ngay (≤ 250 ms sau khi thẻ vào), không chờ', !!i && !!g && g.at - i.at <= 250, [i, g]);
  const r = await page.evaluate(m => {
    const host = m ? document.querySelector('#mNote .mnt') : document.querySelector('#floor > .flb'), bm = host && host.querySelector(':scope > .bm');
    if (!bm) return null;
    const an = host.getAnimations({ subtree: true }).filter(a => !a.animationName), a = an[0], t = a && a.effect.getTiming(), tg = a && a.effect.target;
    const vis = Array.from(bm.querySelectorAll(':scope > *')).filter(x => getComputedStyle(x).display !== 'none').map(x => x.className);
    return { still: bm.classList.contains('still'), parts: bm.querySelectorAll('.bm-k, .bm-w').length, n: an.length, vis: vis.join('|'), tg: tg ? tg.className : '',
             props: a ? Object.keys(a.effect.getKeyframes()[0]).filter(x => !/^(offset|easing|composite|computedOffset)$/.test(x)).join() : '',
             dur: t && t.duration, dir: t && t.direction, it: t && t.iterations, run: !!a && a.playState === 'running', shadow: getComputedStyle(m ? host : document.querySelector('#floor')).boxShadow };
  }, mobile);
  ok('… không hạt, không cửa sổ chạy; chỉ còn viền màu ' + (mobile ? '(vành)' : '(ray)') + ' — không viền Mực', !!r && r.still && r.parts === 0 && r.vis === (mobile ? 'bm-ring|bm-sf|bm-hv' : 'bm-z bm-r') && r.shadow === 'none', r);
  ok('… viền màu thở chậm: một animation opacity 3,2 s qua lại, vô hạn (nhẹ hơn, không bằng không)', !!r && r.n === 1 && r.props === 'opacity' && r.dur === 3200 && r.dir === 'alternate' &&
     r.it === Infinity && r.run && r.tg === (mobile ? 'bm-ring' : 'bm-z bm-r'), r);
  const bx = await page.evaluate(m => { const host = m ? document.querySelector('#mNote .mnt') : document.querySelector('#floor > .flb');
    return Array.from(host.querySelectorAll(m ? ':scope > .bm > .bm-ring .bm-f' : ':scope > .bm > .bm-r > .bm-f')).map(f => { const r = f.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); }, mobile);
  ok('… trường màu tĩnh là hộp thật (rộng, cao > 0)', bx.length >= 1 && bx.every(b => b[0] > 0 && b[1] > 0), bx);
  const vr = await vividRun(page, m => { const r = (m ? document.querySelector('#mNote .mnt') : document.querySelector('#floor')).getBoundingClientRect();
    return m ? { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 4 } : { x: 0, y: Math.max(0, r.top - 1), width: innerWidth, height: 6 }; }, mobile, 3, 600);
  ok('… trên màn thật viền màu có hiện (điểm ảnh rực ở mọi lần chụp)', vr.every(n => n >= 20), vr);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch(Object.assign({ args: ARGS }, EXE ? { executablePath: EXE } : {}));
  try {
    await invitee(browser, server, false);
    await invitee(browser, server, true);
    await warnCard(browser, server, false);
    await warnCard(browser, server, true);
    await ticketLine(browser, server, true);
    await ticketLine(browser, server, false);
    await hiddenTab(browser, server);
    await holdResize(browser, server);
    await reduced(browser, server, true);
    await reduced(browser, server, false);
  } catch (e) { fail++; console.log('  FAIL  lỗi chạy test: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
