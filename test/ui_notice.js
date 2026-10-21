/* Thẻ thông báo + hào quang Acid cho thẻ kích cầu ghép cặp 1:2 (1.5.0 — Figma 00e). Chế độ QC (dữ liệu bịa), desktop + mobile.
   node test/ui_notice.js
   Bối cảnh: 1.4.0 dựng lại tia viền chỉ compositor + thống nhất mặt thẻ (.mnt = .prl); 21/10 chủ studio duyệt "Hào quang Acid" trên
   Figma (section 00e) → 1.5.0 thay phần hình của tia, GIỮ chuẩn compositor và vòng đời (dừng khi che, nối mốc khi vẽ lại).
   Hình học / nhịp được dựng lại ĐỘC LẬP trong test (chu vi, chỗ bắt đầu cạnh, cubic-bezier riêng) rồi so với lớp thật ở các mốc dừng:
   1. Uyển Nhi (có lời mời): .sig-in gắn SAU khi trang vào xong ≥ 150 ms, B0B nhìn đúng lúc · mobile: thẻ mời = .bm (viền nền 6 đoạn ·
      lõi 4 vùng × 2 nguồn sáng · mặt thẻ · rê chuột) + .bmx (bóng 4 vùng × 2) + .bma (hào quang), 27 Web Animations chỉ transform /
      opacity, một đồng hồ chung · 2 nguồn sáng lệch nửa vòng, 1 vòng / 8 s, đi đều + liền qua góc (≤ 1 px) · viền nền kẻ / xoá đúng
      cubic-bezier(.65, 0, .35, 1) từ giữa mép trên · hào quang thở đúng mốc Figma, phổ xoay 180° / chu kỳ · desktop: sàn = viền nền kẻ từ
      giữa thông báo + tia Acid trái / Bạc hà phải 380 px/s, hai lượt · hồ sáng dưới nội dung trang, tâm ở mép trên sàn giữa thông báo ·
      0 Paint của lớp hào quang · cửa sổ / ngăn kéo che → mọi lớp đứng đúng một mốc, đóng → chạy tiếp từ đúng mốc · ra khỏi khung nhìn →
      dừng · kênh live hỏi lại → cùng phần tử, không chạy lại · hết 3 chu kỳ → trạng thái tĩnh (viền nền + hào quang 45 %, 0 animation)
   2. Minh Khôi (thẻ cảnh báo, không ghép cặp): không hào quang · mobile: cửa sổ báo đang che → chờ, đóng rồi mới gắn
   3. Thục Quyên đặt 2 buổi 1:2 → phiếu: dòng Tập đôi "… · Mời bạn" có hào quang; đổi cỡ màn → đo lại, mốc giữ nguyên · đổi trạng thái tại
      chỗ → chạy tiếp từ đúng mốc (.bm-now) · đã đứng yên mà thông báo đổi → bật lại từ đầu · xong cả tuần → không hào quang
   4. Tab ẩn lúc thẻ vào → chưa gắn, hào quang chưa chạy; mở lại tab → gắn + chạy
   5. Thẻ mobile ẩn ở desktop đo lần đầu lúc ngăn kéo còn mở → đứng ở mốc 0; đóng → chạy
   6. Giảm chuyển động → gắn ngay; trạng thái tĩnh, 0 animation */
'use strict';
const zlib = require('zlib');
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');
const EXE = require('./pw_exe'), ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + label); } else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 900) : '')); } }
async function waitView(page, v) { await page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: 10000 }); }
async function until(f, ms) { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; }
const T = 8000, N = 3, SEQ = T * N;

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
/* trạng thái thẻ đang hiện + hào quang của nó (chính thẻ data-beam="card", hay lớp phủ sàn .flb data-beam="strip" của thẻ .pair).
   Animation của hào quang = mọi Web Animation trong phần tử data-beam + hồ sáng (.flp, nằm ngoài sàn) */
async function state(page, sel) {
  return page.evaluate(s => {
    const e = Array.from(document.querySelectorAll(s)).filter(x => x.getClientRects().length)[0]; if (!e) return null;
    const h = e.hasAttribute('data-beam') ? e : e.classList.contains('pair') ? document.querySelector('#floor > .flb') : null, B = h && h._bm;
    const lay = h ? Array.from(h.querySelectorAll(':scope > .hq')).concat(B && B.pool ? [B.pool] : []) : [];
    const an = h ? h.getAnimations({ subtree: true }).concat(B && B.pool ? B.pool.getAnimations() : []).filter(a => !a.animationName) : [];
    const props = Array.from(new Set(an.flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !/^(offset|easing|composite|computedOffset)$/.test(x))))));
    const st = Array.from(new Set(an.map(a => a.startTime))), cur = Array.from(new Set(an.map(a => Math.round(a.currentTime * 10) / 10)));
    return { id: e.__id, sig: e.classList.contains('sig-in'), card: e.hasAttribute('data-beam'), pair: e.classList.contains('pair'), beam: h ? h.getAttribute('data-beam') : null,
             flb: !!document.querySelector('#floor > .flb'), lay: lay.map(x => x.className).join('|'), still: lay.length > 0 && lay.every(x => x.classList.contains('still')),
             bmEl: lay[0] ? (lay[0].__id = lay[0].__id || Math.random().toString(36).slice(2)) : null, n: an.length, props: props.sort().join(','),
             run: an.length > 0 && an.every(a => a.playState === 'running'), paused: an.length > 0 && an.every(a => a.playState === 'paused'),
             oneStart: st.length === 1, start: st.length === 1 ? st[0] : null, oneCur: cur.length === 1, cur: cur.length === 1 ? cur[0] : cur.slice(0, 4),
             e: B ? (B.done ? 'done' : B.run ? document.timeline.currentTime - B.o : B.e) : null, done: !!B && B.done, brun: !!B && B.run, vis: !!B && B.vis,
             dur: an.length ? Array.from(new Set(an.map(a => { const t = a.effect.getTiming(); return t.duration * t.iterations; }))).join(',') : '',
             css: Array.from(new Set((h ? h.getAnimations({ subtree: true }) : []).filter(a => a.animationName && a.playState === 'running').map(a => a.animationName))).join(','),
             shadow: getComputedStyle(e).boxShadow, bg: getComputedStyle(e).backgroundColor };
  }, sel);
}
/* đồng hồ của hào quang lùi / tiến tới mốc ms (giữ đúng cơ chế của trang: gốc b.o = bây giờ − mốc, mọi animation startTime = b.o) */
const seek = (page, host, ms) => page.evaluate(([s, ms]) => { const b = document.querySelector(s)._bm; if (!b || !b.run) return false;
  b.o = document.timeline.currentTime - ms; b.anims.forEach(a => { a.startTime = b.o; }); return true; }, [host, ms]);

/* thẻ: dừng mọi lớp ở các mốc τ của chuỗi, đọc lại vị trí THẬT (transform tính toán) rồi so với hình học dựng độc lập:
   · lõi: mỗi nguồn sáng đúng MỘT vùng chứa mũi, ở s = W/2 + k·P/2 + P·τ/T (mod P) — P = 2W + 2H − 4R, trải theo chiều kim đồng hồ từ góc
     trên trái, vùng trên / dưới trọn bề ngang, trái / phải giữa hai góc · bóng: mũi trùng mũi lõi
   · viền nền: phần hiện của từng đoạn = đúng chỗ mặt trước kẻ / xoá trên nửa chu vi theo cubic-bezier(.65, 0, .35, 1)
   · hào quang / nhóm nguồn sáng: opacity, góc xoay đúng mốc Figma */
async function cardProbe(page, sel, taus) {
  return page.evaluate(([s, taus]) => {
    const e = document.querySelector(s), B = e && e._bm; if (!B) return { err: 'không có hào quang' };
    const cs = x => getComputedStyle(x), W = parseFloat(cs(e).width), H = parseFloat(cs(e).height), R = 4, G = 18, T = 8000, LC = 130, LAG = 4, P = 2 * W + 2 * H - 4 * R, Ph = P / 2;
    const bm = e.querySelector(':scope > .bm'), bx = e.querySelector(':scope > .bmx'), ba = e.querySelector(':scope > .bma');
    const core = Array.from(bm.querySelectorAll(':scope > .bm-cr > .bm-e')), glow = Array.from(bx.querySelectorAll(':scope > .bm-gw > .bm-g')), base = Array.from(bm.querySelectorAll(':scope > .bm-b'));
    const csa = [0, W, W + H - 2 * R, 2 * W + H - 2 * R], gsa = [-G, W, W + H - 2 * R - G, 2 * W + H - 2 * R], clen = [W, H - 2 * R, W, H - 2 * R], glen = [W + 2 * G, H - 2 * R, W + 2 * G, H - 2 * R];
    /* đoạn viền nền: [đầu trên nửa chu vi, dài, trục] — phải: trên phải · phải · dưới phải; trái: đối xứng */
    const seg = [[0, W / 2, 'X'], [W / 2, H - 2 * R, 'Y'], [W / 2 + H - 2 * R, W / 2, 'X'], [0, W / 2, 'X'], [W / 2, H - 2 * R, 'Y'], [W / 2 + H - 2 * R, W / 2, 'X']];
    const bez = (x1, y1, x2, y2) => x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 12; i++) { const u = 1 - t,
      fx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x, d = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); if (Math.abs(d) < 1e-9) break; t = Math.min(1, Math.max(0, t - fx / d)); }
      const u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; };
    const E = bez(.65, 0, .35, 1), mod = (a, m) => (a % m + m) % m, wrap = v => mod(v + P / 2, P) - P / 2;
    const M = el => new DOMMatrix(cs(el).transform === 'none' ? undefined : cs(el).transform);
    const an = e.getAnimations({ subtree: true }).filter(a => !a.animationName), was = an.map(a => [a.playState, a.startTime, a.currentTime]);
    an.forEach(a => a.pause());
    const out = [];
    for (const tau of taus) {
      an.forEach(a => { a.currentTime = tau; });
      const c = tau % T, cyc = Math.floor(tau / T), last = cyc === 2, r = { tau };
      /* lõi + bóng: mũi của từng nguồn sáng */
      r.heads = [0, 1].map(k => {
        const exp = mod(W / 2 + k * P / 2 + P * c / T, P), hc = [], hg = [];
        core.forEach((x, i) => { const m = M(x.children[k]), u = (i % 2 ? m.m42 : m.m41) + LC; if (u >= 0 && u < clen[i]) hc.push(csa[i] + u); });
        glow.forEach((x, i) => { const m = M(x.children[k]), u = (i % 2 ? m.m42 : m.m41) + LAG + LC; if (u >= 0 && u < glen[i]) hg.push(gsa[i] + u); });
        const ec = hc.length === 1 ? +Math.abs(wrap(hc[0] - exp)).toFixed(2) : 'n=' + hc.length;
        /* bóng: vùng trên / dưới rộng hơn 2G → tới 2 vùng cùng chứa mũi ở góc; mọi mũi tìm thấy phải trùng mũi lõi */
        const eg = hg.length >= 1 ? +Math.max.apply(null, hg.map(v => Math.abs(wrap(v - exp)))).toFixed(2) : 'n=0';
        return [ec, eg];
      });
      /* viền nền: phần hiện (scale × dài) + chỗ bắt đầu (translate) từng đoạn so với mặt trước kẻ / xoá */
      const dr = c >= 150 && c <= 1150 ? Ph * E((c - 150) / 1000) : c > 1150 ? Ph : 0, er = !last && c >= 7000 ? Ph * E(Math.min(1, (c - 7000) / 850)) : 0;
      r.ring = Math.max.apply(null, base.map((x, i) => {
        const q = seg[i], m = M(x), sc = q[2] === 'X' ? m.a : m.d, tr = Math.abs(q[2] === 'X' ? m.m41 : m.m42);
        const a = Math.max(0, Math.min(q[1], dr - q[0])), d = Math.max(0, Math.min(q[1], er - q[0]));
        return Math.max(Math.abs(sc * q[1] - (a - d)), Math.abs(tr - d));
      })).toFixed(2) * 1;
      r.ao = +(+cs(ba).opacity).toFixed(3);
      const rm = M(ba.querySelector('.bm-ac')); r.rot = +(Math.atan2(rm.b, rm.a) * 180 / Math.PI).toFixed(1);
      r.co = +(+cs(bm.querySelector('.bm-cr')).opacity).toFixed(3); r.go = +(+cs(bx.querySelector('.bm-gw')).opacity).toFixed(3);
      out.push(r);
    }
    an.forEach((a, i) => { if (was[i][0] === 'running') a.startTime = was[i][1]; else a.currentTime = was[i][2]; });
    const fx = Array.from(e.querySelectorAll('.hq, .hq *')).every(x => cs(x).mixBlendMode === 'normal' && cs(x).filter === 'none');
    return { W, H, P, out, fx, kids: [bm, bx, ba].map(x => Array.from(x.children).map(c => c.className).join(',')).join(' | '), clip: cs(bm).clipPath,
             cores: core.length + '×' + core[0].children.length, glows: glow.length + '×' + glow[0].children.length, bases: base.length };
  }, [sel, taus]);
}
/* dải sàn: m = giữa thông báo (mép trái biểu tượng → hết chữ); viền nền hai nửa kẻ từ m ra; mũi Acid / Bạc hà ở m ∓ 380·(τ − mốc lượt);
   hồ sáng tâm ở (m, mép trên sàn), trong #app trước <main> */
async function stripProbe(page, taus) {
  return page.evaluate(taus => {
    const h = document.querySelector('#floor > .flb[data-beam="strip"]'), B = h && h._bm; if (!B) return { err: 'không có .flb' };
    const cs = x => getComputedStyle(x), fl = document.querySelector('#floor'), nt = fl.querySelector('.nt'), hr = h.getBoundingClientRect(), W = hr.width, LS = 150, LAG = 4, V = .38;
    const m = (nt.querySelector('.nt-ic').getBoundingClientRect().left + nt.querySelector('.nt-tx').getBoundingClientRect().right) / 2 - hr.left;
    const bez = (x1, y1, x2, y2) => x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 12; i++) { const u = 1 - t,
      fx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t - x, d = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2); if (Math.abs(d) < 1e-9) break; t = Math.min(1, Math.max(0, t - fx / d)); }
      const u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; };
    const E = bez(.65, 0, .35, 1), M = el => new DOMMatrix(cs(el).transform === 'none' ? undefined : cs(el).transform);
    const base = Array.from(h.querySelectorAll(':scope > .bm > .bm-b')), sd = Array.from(h.querySelectorAll(':scope > .bm > .bm-cr > .bm-sd'));
    const an = h.getAnimations({ subtree: true }).concat(B.pool ? B.pool.getAnimations() : []).filter(a => !a.animationName), was = an.map(a => [a.playState, a.startTime, a.currentTime]);
    an.forEach(a => a.pause());
    const out = [];
    for (const tau of taus) {
      an.forEach(a => { a.currentTime = tau; });
      const c = tau % 8000, last = Math.floor(tau / 8000) === 2, r = { tau };
      const dr = c >= 150 && c <= 1400 ? E((c - 150) / 1250) : c > 1400 ? 1 : 0, er = !last && c >= 7000 ? E(Math.min(1, (c - 7000) / 850)) : 0, L = [m, W - m];
      r.ring = Math.max.apply(null, base.map((x, k) => { const mm = M(x); return Math.max(Math.abs(mm.a * L[k] - (dr - er) * L[k]), Math.abs(Math.abs(mm.m41) - er * L[k])); })).toFixed(2) * 1;
      /* mũi trên màn: phía k = 0 lật gương (x = m − u), k = 1 (x = m + u); chỉ đếm mũi nằm trong phía */
      r.heads = sd.map((s, k) => Array.from(s.querySelectorAll('.bm-k.c')).map(w => M(w).m41 + LS).filter(u => u >= 0 && u < L[k]).map(u => +(k ? m + u : m - u).toFixed(1)));
      r.exp = [0, 1].map(k => [900, 4500].map(p => c >= p ? V * (c - p) : -1).filter(u => u >= 0 && u < L[k]).map(u => +(k ? m + u : m - u).toFixed(1)));
      r.glow = sd.map((s, k) => Array.from(s.querySelectorAll('.bm-k.g')).map(w => M(w).m41 + LAG + LS).filter(u => u >= 0 && u < L[k]).map(u => +(k ? m + u : m - u).toFixed(1)));
      r.side = sd.map(s => +(+cs(s).opacity).toFixed(3));
      if (B.pool) { const pr = B.pool.getBoundingClientRect(), fr = fl.getBoundingClientRect(); r.pool = [+(pr.left + pr.width / 2 - hr.left - m).toFixed(1), +(pr.top + pr.height / 2 - fr.top).toFixed(1), +(+cs(B.pool).opacity).toFixed(3)]; }
      out.push(r);
    }
    an.forEach((a, i) => { if (was[i][0] === 'running') a.startTime = was[i][1]; else a.currentTime = was[i][2]; });
    const app = document.querySelector('#app'), pool = B.pool;
    return { W, m: +m.toFixed(1), out, top: cs(h).top, height: cs(h).height, kids: Array.from(h.querySelector(':scope > .bm').children).map(c => c.className).join(','),
             pool: pool ? { parent: pool.parentElement === app, beforeMain: !!(pool.compareDocumentPosition(document.querySelector('#main')) & Node.DOCUMENT_POSITION_FOLLOWING),
                            pos: cs(pool).position, z: cs(pool).zIndex, pe: cs(pool).pointerEvents, cls: pool.className } : null,
             fx: Array.from(h.querySelectorAll('*')).concat(pool ? [pool] : []).every(x => cs(x).mixBlendMode === 'normal' && cs(x).filter === 'none') };
  }, taus);
}
/* animation còn "chạy" trên phần tử đã rời trang (hào quang cũ không huỷ → rò bộ nhớ, luồng chính lấy mẫu mỗi khung) */
const orphans = page => page.evaluate(() => (window.__an || []).filter(a => a.playState === 'running' && a.effect && a.effect.target && !a.effect.target.isConnected).length);
/* chi phí luồng chính: ghi trace khi hào quang đang chạy, đếm sự kiện Paint và tra phần tử gốc của từng lần vẽ — chỉ compositor → không
   lần vẽ nào thuộc lớp hào quang (lần vẽ của phần khác, vd chữ đồng hồ, liệt kê riêng để đọc) */
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
        'function(){var e=this.nodeType===1?this:this.parentElement;if(!e)return this.nodeName;return e.closest("[data-beam],.hq,.flb")?"HQ":e.nodeName+(e.id?"#"+e.id:"")+(typeof e.className==="string"&&e.className?"."+e.className.split(" ").join("."):"")}' })).result.value;
    } catch (x) { w = 'đã gỡ'; }
    who.push(w);
  }
  await cdp.detach();
  return { paint: who.length, beam: who.filter(w => w === 'HQ').length, who };
}
/* điểm ảnh THẬT trên màn (ảnh chụp PNG, giải nén tại chỗ): đếm điểm ảnh có sắc (max − min kênh > ng) trong vùng — bắt lỗi kiểu
   "test đọc style thấy đúng nhưng trên màn không hiện gì" */
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
async function vivid(page, clip, ng) {
  const im = pngRGBA(await page.screenshot({ clip })); let n = 0;
  for (let i = 0; i < im.w * im.h; i++) { const o = i * im.bpp, r = im.d[o], g = im.d[o + 1], b = im.d[o + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) > (ng || 60)) n++; }
  return n;
}
/* lấy mẫu nhiều lần (hào quang chạy thật, không dừng): số điểm ảnh có sắc mỗi lần */
async function vividRun(page, clipFn, arg, times, gap, ng) {
  const clip = await page.evaluate(clipFn, arg), r = [];
  for (let i = 0; i < times; i++) { r.push(await vivid(page, clip, ng)); await sleep(gap); }
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
/* hào quang đang chạy (đã vào khung nhìn, không bị che) */
const beamUp = (page, sel) => until(async () => { const s = await state(page, sel); return s && s.n > 0 && s.run && s.brun; }, 6000);
/* mốc kiểm hình học: trong chu kỳ đầu (kẻ · hiện · duy trì sát góc · xoá) + chu kỳ cuối */
const TAUS = [0, 400, 650, 900, 1150, 1700, 2600, 3333, 4000, 5100, 6555, 7300, 7425, 7700, 7900, 8000 + 3050, 16000 + 4321, 16000 + 7500, 16000 + 7990];
function checkCard(cb, label) {
  const bad = cb.out.filter(r => !(r.heads.every(h => typeof h[0] === 'number' && h[0] <= 1 && typeof h[1] === 'number' && h[1] <= 1) && r.ring <= 1.5));
  ok(label + ': ở ' + cb.out.length + ' mốc — mỗi nguồn sáng đúng một mũi, đúng chỗ (lệch ≤ 1 px, đi đều + liền qua góc, lệch nửa vòng), bóng trùng mũi · viền nền kẻ / xoá đúng đường cong (≤ 1,5 px)',
     !cb.err && bad.length === 0, cb.err || bad.slice(0, 3));
}

async function invitee(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' · được mời (Uyển Nhi) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt', HOST = mobile ? '#mNote .mnt' : '#floor > .flb';
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
  ok('Không còn tia 9 màu của 1.4.0 / CSS của gói (data-active / @property / beam-*) — chỉ Web Animations', !!s1 && !s1.css &&
     await page.evaluate(() => !document.querySelector('[data-active], [data-beam-bloom], .bm-ring, .bm-gl, .bm-z, .bm-w')), s1);
  ok('Hào quang chạy MỘT đồng hồ: mọi animation cùng startTime, dài đúng 3 chu kỳ × 8 s, chỉ transform / opacity, đang chạy, vừa bắt đầu (< 3 s)', !!s1 && s1.oneStart && s1.dur === String(SEQ) &&
     s1.props === 'opacity,transform' && s1.run && s1.brun && typeof s1.e === 'number' && s1.e >= 0 && s1.e < 3000, s1);
  if (mobile) {
    ok('Thẻ mời mobile: data-beam="card", 3 lớp (.bm mặt thẻ · .bmx bóng · .bma hào quang), 27 Web Animations', !!s1 && s1.card && s1.beam === 'card' && !s1.still &&
       s1.lay === 'hq bm|hq bmx|hq bma' && s1.n === 27, s1);
    const cb = await cardProbe(page, SEL, TAUS);
    ok('Cấu tạo: viền nền 6 đoạn · nắp · lõi 4 vùng × 2 · mặt thẻ · rê chuột │ bóng 4 vùng × 2 │ hào quang (mặt nạ ngang › dọc › phổ) · KHÔNG filter / hoà trộn · góc bo cắt một lần',
       !cb.err && cb.bases === 6 && cb.cores === '4×2' && cb.glows === '4×2' && cb.fx && /inset\(0/.test(cb.clip) &&
       /^bm-b,bm-b,bm-b,bm-b,bm-b,bm-b,bm-bc,bm-cr,bm-sf,bm-hv \| bm-gw \| bm-as$/.test(cb.kids), cb);
    checkCard(cb, 'Hình học thẻ mời');
    ok('Hào quang đúng mốc Figma: 0 trước 0,35 s · 0,62 lúc 1,25 s · thở 0,3 ↔ 0,5 · tắt về 0 ở chu kỳ thường · chu kỳ cuối đứng ở 0,45', cb.out[0].ao === 0 &&
       cb.out.find(r => r.tau === 7900).ao === 0 && cb.out.find(r => r.tau === 23500).ao === .45 && cb.out.find(r => r.tau === 23990).ao === .45 &&
       (await cardProbe(page, SEL, [1250, 2900, 3900])).out.map(r => r.ao).join() === '0.62,0.3,0.5', cb.out.map(r => [r.tau, r.ao]));
    const rot = (await cardProbe(page, SEL, [0, 4000, 8000, 12000, 23990])).out.map(r => r.rot);
    ok('Phổ hào quang xoay đúng 180° mỗi chu kỳ (0 · 90 · 180 · −90 ở 0 · 4 · 8 · 12 s), 2 s cuối giảm tốc, dừng ở 517,5° ≡ 157,5°', Math.abs(rot[0]) < .5 && Math.abs(rot[1] - 90) < .5 &&
       Math.abs(Math.abs(rot[2]) - 180) < .5 && Math.abs(rot[3] + 90) < .5 && Math.abs(rot[4] - 157.5) < .3, rot);
    ok('Nguồn sáng hiện 0,7–1,3 s, tắt 7,1–7,8 s (lõi + bóng cùng nhịp)', cb.out.filter(r => [0, 400, 650, 7900].includes(r.tau)).every(r => r.co === 0 && r.go === 0) &&
       cb.out.filter(r => [1700, 4000, 6555, 11050].includes(r.tau)).every(r => r.co === 1 && r.go === 1), cb.out.map(r => [r.tau, r.co, r.go]));
    await seek(page, HOST, 1800);
    const vc = await vividRun(page, s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: Math.max(0, r.top - 24), width: r.width, height: 22 }; }, SEL, 6, 380, 30);
    ok('Trên màn thật: dải ngay trên thẻ có điểm ảnh sắc Acid (hào quang) ở MỌI lần chụp trong ~2,3 s', vc.every(n => n >= 200), vc);
    const fc = await face(page, SEL);
    ok('Mặt thẻ chung: nền Giấy 2, không viền Mực, bo 4, icon ghép 20 px, tiêu đề 16 px ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' && fc.radius === '4px' &&
       fc.pair && fc.ic === 20 && fc.fs === '16px' && fc.x === 46, fc);
    ok('Mobile: tiêu đề dòng 1 · "T3 17:00" + nhãn "Xem" dòng 2 · chữ đọc liền "Tuấn Kiệt mời bạn tập đôi · T3 17:00"', !!fc && fc.two && fc.row2 && fc.label === 'Xem' &&
       /Tuấn Kiệt mời bạn tập đôi · T3 17:00/.test(fc.txt), fc);
    /* ra khỏi khung nhìn (IntersectionObserver) → dừng đúng mốc; vào lại → chạy tiếp */
    await page.evaluate(() => { document.querySelector('#mNote').style.display = 'none'; }); await sleep(400);
    const o1 = await state(page, SEL === '#mNote .mnt' ? '#mNote .mnt' : SEL).catch(() => null), oh = await page.evaluate(() => { const b = document.querySelector('#mNote .mnt')._bm; return { run: b.run, vis: b.vis, e: b.e,
      cur: Array.from(new Set(b.anims.map(a => a.playState + Math.round(a.currentTime)))) }; });
    await page.evaluate(() => { document.querySelector('#mNote').style.display = ''; }); await sleep(300);
    const o2 = await page.evaluate(() => { const b = document.querySelector('#mNote .mnt')._bm; return { run: b.run, e: document.timeline.currentTime - b.o, all: b.anims.every(a => a.playState === 'running') }; });
    ok('Ra khỏi khung nhìn → mọi lớp dừng ở cùng một mốc; vào lại → chạy tiếp từ đúng mốc đó', !oh.run && !oh.vis && oh.cur.length === 1 && /^paused/.test(oh.cur[0]) &&
       o2.run && o2.all && o2.e - oh.e >= 0 && o2.e - oh.e < 700, [o1 && o1.n, oh, o2]);
  } else {
    ok('Sàn desktop có lời mời: lớp phủ .flb data-beam="strip" + hồ sáng; thẻ trên sàn không có hào quang quanh thẻ; 14 Web Animations', !!s1 && s1.pair && !s1.card && s1.beam === 'strip' &&
       !s1.still && s1.lay === 'hq bm|hq flp d' && s1.n === 14, s1);
    const sp = await stripProbe(page, [0, 400, 1000, 1400, 1800, 2500, 4600, 5200, 6100, 7300, 7700, 7900, 16000 + 1000, 16000 + 7900]);
    ok('Lớp sàn: viền nền 2 nửa + 2 phía nguồn sáng · hộp trùm đường kẻ ±18 px (top −19 px, cao 37) · không filter / hoà trộn', !sp.err && sp.kids === 'bm-b,bm-b,bm-cr' && sp.top === '-19px' &&
       sp.height === '37px' && sp.fx, sp);
    ok('Viền nền kẻ từ giữa thông báo ra hai phía đúng cubic-bezier 0,15–1,4 s, xoá cùng chiều 7–7,85 s, chu kỳ cuối giữ nguyên (≤ 1,5 px)', !sp.err && sp.out.every(r => r.ring <= 1.5),
       sp.out && sp.out.map(r => [r.tau, r.ring]));
    const hb = sp.out ? sp.out.filter(r => JSON.stringify(r.heads) !== JSON.stringify(r.exp) && !r.heads.every((h, k) => h.length === r.exp[k].length && h.every((x, i) => Math.abs(x - r.exp[k][i]) <= 1))) : ['err'];
    ok('Tia Acid sang trái, Bạc hà sang phải từ giữa thông báo, 380 px/s, hai lượt mỗi chu kỳ (0,9 s · 4,5 s), mũi đúng chỗ ≤ 1 px · bóng trùng mũi', hb.length === 0 &&
       sp.out.every(r => r.glow.every((g, k) => g.length === r.heads[k].length && g.every((x, i) => Math.abs(x - r.heads[k][i]) <= 1))), hb.slice(0, 3));
    ok('Hồ sáng: trong #app TRƯỚC <main> (vẽ dưới nội dung trang), absolute, z-index auto, không bắt chuột, ẩn ở mobile (.d)', !!sp.pool && sp.pool.parent && sp.pool.beforeMain &&
       sp.pool.pos === 'absolute' && sp.pool.z === 'auto' && sp.pool.pe === 'none' && /\bd\b/.test(sp.pool.cls), sp.pool);
    const pa = sp.out.find(r => r.tau === 1800), pz = sp.out.find(r => r.tau === 7900), pe = sp.out.find(r => r.tau === 23900);
    ok('Hồ sáng tâm ở (giữa thông báo, mép trên sàn) ±1 px · thở / tắt đúng mốc · chu kỳ cuối đứng ở 0,45', !!pa && Math.abs(pa.pool[0]) <= 1 && Math.abs(pa.pool[1]) <= 1 &&
       pz.pool[2] === 0 && pe.pool[2] === .45 && sp.out[0].pool[2] === 0, sp.out.map(r => [r.tau, r.pool]));
    await seek(page, HOST, 1800);
    const vs = await vividRun(page, () => { const r = document.querySelector('#floor').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 60), width: 700, height: 58 }; }, null, 6, 450, 30);
    ok('Trên màn thật: phía trên mép sàn quanh thông báo có điểm ảnh sắc (hồ sáng) ở MỌI lần chụp trong ~2,7 s', vs.every(n => n >= 400), vs);
  }
  const pt = await paints(page, 2000);
  if (pt.paint) console.log('        (lần vẽ ngoài hào quang: ' + pt.who.join(', ') + ')');
  ok('Hào quang chạy 2 s: 0 lần vẽ (Paint) nào thuộc lớp hào quang / thẻ có hào quang — chỉ compositor', pt.beam === 0, pt);
  /* rê chuột dừng trên thẻ (desktop) → vẫn chạy · mở cửa sổ chi tiết / ngăn kéo (trang inert) → dừng đúng mốc → đóng: chạy tiếp từ mốc đó */
  if (!mobile) {
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, SEL);
    await page.mouse.move(box.x, box.y); await sleep(1200); await page.mouse.move(box.x, 120); await sleep(200);
    const s2 = await state(page, SEL);
    ok('Rê chuột dừng trên thẻ 1,2 s → hào quang vẫn chạy', !!s2 && s2.run, s2);
    await page.locator('#floor [data-a="info"]').click(); await page.waitForSelector('#drawer.on', { timeout: 4000 }).catch(() => {}); await sleep(400);
  } else {
    await page.locator(SEL).tap(); await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {}); await sleep(400);
  }
  const h1 = await state(page, SEL); await sleep(500); const h2 = await state(page, SEL);
  ok('Mở ' + (mobile ? 'cửa sổ chi tiết' : 'ngăn kéo Gói & luật') + ' (trang inert) → mọi lớp dừng ở CÙNG một mốc, đứng yên', !!h1 && h1.paused && h1.oneCur && !!h2 && h2.paused &&
     h1.cur === h2.cur && Math.abs(h1.e - h1.cur) < .2, [h1 && [h1.cur, h1.e], h2 && h2.cur]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#sheet').hidden && document.querySelector('#drawer').hidden, null, { timeout: 4000 }).catch(() => {});
  await sleep(300);
  const s3 = await state(page, SEL);
  ok('Đóng lại → chạy tiếp từ đúng mốc đã dừng (tiến < 1,5 s gồm cảnh đóng cửa sổ, không về đầu), cùng lớp, một đồng hồ', !!s3 && s3.run && s3.oneStart && s3.bmEl === h1.bmEl && s3.e - h1.cur >= 0 && s3.e - h1.cur < 1500,
     [h1 && h1.cur, s3 && s3.e]);
  if (mobile) checkCard(await cardProbe(page, SEL, TAUS), '… sau khi chạy tiếp, hình học còn nguyên');
  /* kênh live */
  const before = await state(page, SEL), f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s4 = await state(page, SEL);
  ok('Kênh live hỏi lại, thẻ không đổi → cùng phần tử, cùng lớp, không chạy lại từ đầu (cùng startTime)', !!s4 && !!before && s4.id === before.id && s4.bmEl === before.bmEl && s4.run &&
     s4.start === before.start, [before && before.start, s4 && s4.start]);
  /* hết 3 chu kỳ → trạng thái tĩnh: 0 animation, viền nền đủ, hào quang / hồ sáng 45 %, không nguồn sáng */
  await seek(page, HOST, SEQ - 400);
  await until(async () => { const x = await state(page, SEL); return x && x.done; }, 3000); await sleep(100);
  const z = await state(page, SEL), zs = await page.evaluate(([h, m]) => { const e = document.querySelector(h), b = e._bm, cs = x => getComputedStyle(x);
    const bm = e.querySelector(':scope > .bm'), base = Array.from(bm.querySelectorAll(':scope > .bm-b'));
    return { base: base.map(x => cs(x).transform).join(), full: base.every(x => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().height > 0), cr: cs(bm.querySelector('.bm-cr')).display,
             halo: m ? +cs(e.querySelector(':scope > .bma')).opacity : +cs(b.pool).opacity, gw: m ? cs(e.querySelector(':scope > .bmx .bm-gw')).display : '',
             rot: m ? (() => { const x = new DOMMatrix(cs(e.querySelector('.bm-ac')).transform); return +(Math.atan2(x.b, x.a) * 180 / Math.PI).toFixed(2); })() : 157.5 }; }, [HOST, mobile]);
  ok('Hết 3 chu kỳ → trạng thái tĩnh: 0 animation, mọi lớp .still, viền nền đủ (không transform), ' + (mobile ? 'hào quang' : 'hồ sáng') + ' 0,45, không nguồn sáng', !!z && z.n === 0 && z.done && z.still &&
     zs.base.split(',').every(x => x === 'none') && zs.full && zs.cr === 'none' && zs.halo === .45 && (!mobile || zs.gw === 'none') && Math.abs(zs.rot - 157.5) < .05, [z, zs]);
  const vz = await vividRun(page, (a) => { const r = document.querySelector(a[0]).getBoundingClientRect();
    return a[1] ? { x: r.left, y: Math.max(0, r.top - 22), width: r.width, height: 20 } : { x: 0, y: Math.max(0, document.querySelector('#floor').getBoundingClientRect().top - 60), width: 700, height: 58 }; }, [SEL, mobile], 2, 300, 30);
  ok('… trên màn thật trạng thái tĩnh vẫn có ' + (mobile ? 'hào quang' : 'hồ sáng') + ' (điểm ảnh sắc)', vz.every(n => n >= 150), vz);
  const f3 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f3, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const z2 = await state(page, SEL);
  ok('… kênh live hỏi lại sau đó → vẫn tĩnh, không bật lại', !!z2 && z2.n === 0 && z2.done, z2);
  if (!mobile) {
    /* nhận lời mời ngay trên sàn ("Tập cùng") → sàn thay nội dung, không còn dải: hồ sáng (nằm ngoài sàn) tắt dần cùng sàn rồi gỡ — không
       tắt phụt, không bao giờ hai hồ cùng lúc, không sót */
    await page.locator('#floor [data-a="invok"]').click();
    const fz = await page.evaluate(() => new Promise(res => { const out = [], t0 = performance.now();
      (function tick() { const p = document.querySelector('.flp'); out.push([Math.round(performance.now() - t0), document.querySelectorAll('.flp').length, !!document.querySelector('[data-beam="strip"]'),
        p ? +(+getComputedStyle(p).opacity).toFixed(2) : -1]); if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else res(out); })(); }));
    const gone = fz.find(x => !x[2]), mid = fz.filter(x => gone && x[0] >= gone[0] && x[1] === 1);
    ok('Nhận lời mời trên sàn → dải gỡ, hồ sáng tắt dần (≤ 0,45 → 0 trong ~160 ms) rồi gỡ hẳn; không lúc nào 2 hồ', !!gone && fz.every(x => x[1] <= 1) && fz[fz.length - 1][1] === 0 &&
       mid.every(x => x[3] <= .45) && mid.length > 0 && await orphans(page) === 0, fz.filter((x, i) => i % 4 === 0).slice(0, 30));
  }
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
  ok('Thẻ cảnh báo không phải ghép cặp → không hào quang (thẻ lẫn sàn, không hồ sáng), không animation nào chạy', !!s && !s.card && !s.pair && !s.beam && !s.flb && !s.n && !s.css &&
     await page.evaluate(() => !document.querySelector('.flp, .hq')), s);
  if (mobile) { const fc = await face(page, SEL + '.warn');
    ok('Thẻ cảnh báo cùng mặt thẻ: nền Giấy 2, KHÔNG viền Mực, bo 4, tiêu đề ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' && fc.radius === '4px' && fc.x === 46, fc); }
  ok('B0B nhìn thẻ cảnh báo đúng lúc gắn · "error"', b.length === 1 && !!g && b[0].at >= g.at - SAME && b[0].at - g.at <= 200 && b[0].type === 'error',
     b.map(x => [x.type, Math.round(x.at - (g ? g.at : 0))]));
  ok('Mọi hào quang cũ đã bị gỡ đều được huỷ (0 Web Animation mồ côi còn chạy)', await orphans(page) === 0, await orphans(page));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function ticketLine(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile' : 'desktop') + ' · phiếu: dòng Tập đôi "Mời bạn" (Thục Quyên) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = '#prLine .prl';
  await login('thuc quyen', '1212'); await waitView(page, 'book'); await sleep(700);
  for (const [d, h] of [['2026-10-21', 11], ['2026-10-22', 11]]) { await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first().click(); await sleep(200); }
  await page.locator(mobile ? '#ctaM' : '#cta').click();
  await waitView(page, 'ticket');
  await beamUp(page, SEL);
  const s = await state(page, SEL), fc = await face(page, SEL);
  ok('Dòng "2 buổi đang chờ bạn tập · Mời bạn" có hào quang: data-beam="card", 3 lớp, 27 Web Animations một đồng hồ, đang chạy', !!fc && /2 buổi đang chờ bạn tập/.test(fc.txt) && fc.label === 'Mời bạn' &&
     !!s && s.card && s.beam === 'card' && s.lay === 'hq bm|hq bmx|hq bma' && s.n === 27 && s.props === 'opacity,transform' && s.oneStart && s.run, [fc, s]);
  ok('Cùng mặt thẻ với thẻ mời mobile: nền Giấy 2, không viền, bo 4, icon ghép 20 px, tiêu đề 16 px ở x = 46', !!fc && fc.bg === 'rgb(242, 242, 242)' && fc.shadow === 'none' &&
     fc.radius === '4px' && fc.pair && fc.ic === 20 && fc.fs === '16px' && fc.x === 46, fc);
  const cb = await cardProbe(page, SEL, TAUS);
  checkCard(cb, 'Hình học trên dòng ' + Math.round(cb.W) + ' × ' + Math.round(cb.H));
  /* đổi cỡ màn → ResizeObserver đo lại hình học + keyframe; đồng hồ (startTime) giữ nguyên */
  const vw = mobile ? 360 : 1280;
  await page.setViewportSize({ width: vw, height: mobile ? 800 : 860 }); await sleep(500);
  const cb2 = await cardProbe(page, SEL, TAUS), s2 = await state(page, SEL);
  ok('Đổi cỡ màn → đo lại theo cỡ mới, cùng lớp, cùng startTime (mốc không nhảy)', (mobile ? cb2.W !== cb.W : true) && !!s2 && s2.bmEl === s.bmEl && s2.run && s2.start === s.start && s2.oneStart,
     [cb.W, cb2.W, s.start, s2 && s2.start]);
  checkCard(cb2, '… hình học theo cỡ mới');
  const f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s3 = await state(page, SEL);
  ok('Kênh live hỏi lại trên phiếu, dòng không đổi → cùng phần tử, cùng lớp, không chạy lại từ đầu', !!s3 && s3.id === s.id && s3.bmEl === s.bmEl && s3.start === s2.start && s3.run, [s2.start, s3 && s3.start]);
  /* đổi trạng thái tại chỗ (tin live mang lời mời mới — chèn vào câu trả lời của máy chủ giả): dòng thành "Thảo Vy mời bạn tập đôi · T4 11:00"
     ngay trên phiếu → chữ mờ vào nhẹ (.swap), hào quang chạy tiếp từ đúng mốc (.bm-now): không kẻ lại, không bừng lại */
  const inv = who => page.evaluate(w => { const f = window.QCB.__f0 || window.QCB.fetch; window.QCB.__f0 = f; window.QCB.fetch = (u, i) => f(u, i).then(async r => { const j = await r.clone().json();
    if (!j || !j.duo) return r; j.duo.invIn = [{ from: w, date: '2026-10-21', h: 11 }];
    return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }); }); }, who);
  await inv('Thảo Vy');
  const e3 = await state(page, SEL), f3 = await page.evaluate(() => window.__lt.S.lastFetch), t3 = Date.now();
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f3, { timeout: 6000 }).catch(() => {});
  await until(async () => /Thảo Vy/.test(await page.textContent('#prLine')), 3000); await sleep(300);
  const s4 = await state(page, SEL), t4 = Date.now(), sw = await page.evaluate(() => { const e = document.querySelector('#prLine .prl'), t = e.querySelector('.prl-t');
    return { cls: e.className, t: getComputedStyle(t.querySelector('.pt')).animationName, w: getComputedStyle(t.querySelector('.pw')).animationName, c: getComputedStyle(e.querySelector(':scope > .prl-c')).animationName }; });
  ok('Tin live đổi trạng thái → dòng lời mời "Thảo Vy mời bạn tập đôi · T4 11:00 · Xem" thay tại chỗ', /Thảo Vy mời bạn tập đôi · T4 11:00/.test(await page.textContent('#prLine')) && /\binv\b/.test(sw.cls), [await page.textContent('#prLine'), sw]);
  if (!mobile) { const f4 = await face(page, SEL), hh = await page.evaluate(() => Math.round(document.querySelector('#prLine .prl').getBoundingClientRect().height));
    ok('Desktop: dòng lời mời một dòng ("… · T4 11:00" liền tiêu đề), cao 48', !!f4 && !f4.two && hh === 48 && /Thảo Vy mời bạn tập đôi · T4 11:00/.test(f4.txt), [f4, hh]); }
  ok('… chữ mờ vào nhẹ (.swap), hào quang chạy tiếp từ đúng mốc (.bm-now, phần tử mới, mốc tiến theo thời gian trôi — không về đầu, không nhảy)', /\bswap\b/.test(sw.cls) && /\bbm-now\b/.test(sw.cls) && sw.t === 'bmin' &&
     sw.w === 'bmin' && sw.c === 'bmin' && !!s4 && s4.bmEl !== s.bmEl && s4.run && s4.n === 27 && s4.oneStart && typeof s4.e === 'number' && typeof e3.e === 'number' &&
     s4.e - e3.e >= 0 && s4.e - e3.e <= (t4 - t3) + 600, [sw, e3 && e3.e, s4 && s4.e, t4 - t3]);
  /* làm mới lặng tiếp, dòng không đổi → KHÔNG vẽ lại (so chuỗi bỏ lớp .hq và lớp chạy .swap / .bm-now): cùng phần tử, cùng lớp */
  const f5 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f5, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s5 = await state(page, SEL);
  ok('… làm mới lặng tiếp, dòng không đổi → không vẽ lại: cùng phần tử, cùng lớp, cùng startTime (không nháy chữ)', !!s5 && !!s4 && s5.id === s4.id && s5.bmEl === s4.bmEl &&
     s5.start === s4.start && s5.run, [s4 && s4.id, s5 && s5.id]);
  /* hết 3 chu kỳ → tĩnh; rồi lời mời KHÁC tới (chữ đổi) → thông báo mới: bật lại từ đầu (kẻ lại, bừng lại) */
  await seek(page, SEL, SEQ - 300);
  await until(async () => { const x = await state(page, SEL); return x && x.done; }, 3000);
  const z = await state(page, SEL);
  ok('Dòng đứng yên sau 3 chu kỳ (0 animation, .still)', !!z && z.n === 0 && z.done && z.still, z);
  await inv('Bảo Linh');
  const f6 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f6, { timeout: 6000 }).catch(() => {});
  await until(async () => /Bảo Linh/.test(await page.textContent('#prLine')), 3000); await sleep(200);
  const s6 = await state(page, SEL);
  ok('… lời mời khác tới khi đã đứng yên → bật lại từ đầu (27 animation, mốc < 1,2 s, không .bm-now)', !!s6 && s6.n === 27 && s6.run && !s6.done && typeof s6.e === 'number' && s6.e < 1200 &&
     !(await page.evaluate(() => document.querySelector('#prLine .prl').classList.contains('bm-now'))), s6);
  /* tập đôi đủ cả tuần (chèn duo.pairs, bỏ lời mời): "Tập đôi cả 2 buổi · cùng Uyển Nhi" — KHÔNG hào quang (việc đã xong) */
  await page.evaluate(() => { const f = window.QCB.__f0 || window.QCB.fetch; window.QCB.__f0 = f; window.QCB.fetch = (u, i) => f(u, i).then(async r => { const j = await r.clone().json();
    if (!j || !j.duo) return r; j.duo.invIn = []; j.duo.invOut = {}; j.duo.pairs = { '2026-10-21|11': 'Uyển Nhi', '2026-10-22|11': 'Uyển Nhi' };
    return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }); }); });
  const f7 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f7, { timeout: 6000 }).catch(() => {});
  await until(async () => /Tập đôi cả 2 buổi/.test(await page.textContent('#prLine')), 3000); await sleep(400);
  const dn = await page.evaluate(() => { const e = document.querySelector('#prLine .prl'); return e ? { txt: e.textContent, beam: e.hasAttribute('data-beam'), hq: !!e.querySelector('.hq'), lbl: !!e.querySelector('.prl-c'),
    over: Math.round(e.querySelector('.chev').getBoundingClientRect().right - e.getBoundingClientRect().right) } : null; });
  ok('Tập đôi đủ cả tuần → "Tập đôi cả 2 buổi · cùng Uyển Nhi", KHÔNG hào quang, không nhãn, chevron nằm trong thẻ', !!dn && /Tập đôi cả 2 buổi · cùng Uyển Nhi/.test(dn.txt) && !dn.beam && !dn.hq && !dn.lbl && dn.over <= -12, dn);
  await sleep(300);
  ok('Mọi hào quang cũ đã bị gỡ đều được huỷ (0 Web Animation mồ côi còn chạy)', await orphans(page) === 0, await orphans(page));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

/* thẻ mobile #mNote bị ẩn ở desktop (0 × 0, chưa có nhịp) → mở ngăn kéo (trang inert) → thu cửa sổ xuống mobile: thẻ hiện, đo lần đầu
   TRONG lúc che → đứng ở mốc 0 (chưa kẻ viền nền, chưa có hào quang); đóng ngăn kéo → chạy từ đầu */
async function holdResize(browser, server) {
  console.log('\n== desktop → mobile khi ngăn kéo đang mở (thẻ đo lần đầu lúc che) ==');
  const { ctx, page, errs, login } = await newPage(browser, server, false);
  await login('uyen nhi', '5555'); await waitView(page, 'book'); await sleep(900);
  const z = await page.evaluate(() => { const e = document.querySelector('#mNote .mnt'); return e ? [e.offsetWidth, e.offsetHeight, e._bm ? e._bm.anims.length : -1, e._bm ? e._bm.vis : null] : null; });
  ok('Desktop: thẻ mời mobile có lớp hào quang nhưng 0 × 0, chưa animation nào, ngoài khung nhìn', !!z && z[0] === 0 && z[1] === 0 && z[2] === 0 && z[3] === false, z);
  await page.locator('#floor [data-a="info"]').click(); await page.waitForSelector('#drawer.on', { timeout: 4000 }).catch(() => {}); await sleep(300);
  await page.setViewportSize({ width: 800, height: 900 }); await sleep(700);
  const s1 = await state(page, '#mNote .mnt');
  ok('Thu xuống 800 px khi ngăn kéo còn mở → thẻ hiện, 27 animation ĐỨNG YÊN ở mốc 0', !!s1 && s1.n === 27 && s1.paused && s1.oneCur && s1.cur === 0 && s1.e === 0, s1);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#drawer').hidden && document.querySelector('#sheet').hidden, null, { timeout: 4000 }).catch(() => {});
  await sleep(400);
  const s2 = await state(page, '#mNote .mnt');
  ok('Đóng ngăn kéo → chạy từ đầu (mốc < 1,5 s gồm cảnh đóng ngăn kéo), một đồng hồ', !!s2 && s2.run && s2.oneStart && typeof s2.e === 'number' && s2.e < 1500, s2);
  checkCard(await cardProbe(page, '#mNote .mnt', TAUS), '… hình học thẻ 768 px');
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function hiddenTab(browser, server) {
  console.log('\n== desktop · tab ẩn lúc thẻ vào ==');
  const { ctx, page, errs, login } = await newPage(browser, server, false);
  const hide = v => page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  await login('uyen nhi', '5555', () => hide(true)); await waitView(page, 'book'); await sleep(1500);
  const s0 = await state(page, '#floor .nt');
  ok('Tab ẩn lúc thẻ vào → chưa gắn .sig-in, hào quang sàn có sẵn nhưng ĐỨNG ở mốc 0', !!s0 && !s0.sig && s0.flb && s0.paused && s0.cur === 0 && !s0.brun, s0);
  const t0 = await page.evaluate(() => performance.now());
  await hide(false); await armedOn(page, '#floor .nt');
  const g = (await log(page)).filter(x => x.k === 'sig').pop(), s1 = await state(page, '#floor .nt');
  ok('Mở lại tab → gắn sau ≥ 150 ms lặng (≤ 900 ms), hào quang chạy từ đầu', !!g && g.at - t0 >= 150 && g.at - t0 <= 900 && !!s1 && s1.run && s1.e < 1500, [g && Math.round(g.at - t0), s1 && s1.e]);
  await hide(true); await sleep(300); const s2 = await state(page, '#floor .nt'); await sleep(400); const s3 = await state(page, '#floor .nt');
  ok('Ẩn tab giữa chừng → dừng đúng một mốc, đứng yên', !!s2 && s2.paused && s2.oneCur && !!s3 && s3.cur === s2.cur, [s2 && s2.cur, s3 && s3.cur]);
  await hide(false); await sleep(200); const s4 = await state(page, '#floor .nt');
  ok('… mở lại → chạy tiếp từ mốc đó', !!s4 && s4.run && s4.e - s2.cur >= 0 && s4.e - s2.cur < 600, [s2 && s2.cur, s4 && s4.e]);
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
    const host = m ? document.querySelector('#mNote .mnt') : document.querySelector('#floor > .flb'), b = host && host._bm; if (!b) return null;
    const cs = x => getComputedStyle(x), bm = host.querySelector(':scope > .bm'), base = Array.from(bm.querySelectorAll(':scope > .bm-b'));
    return { still: b.lay.every(x => x.classList.contains('still')), n: host.getAnimations({ subtree: true }).length + (b.pool ? b.pool.getAnimations().length : 0),
             cr: cs(bm.querySelector('.bm-cr')).display, base: base.length && base.every(x => cs(x).transform === 'none' && x.getBoundingClientRect().width > 0),
             halo: m ? +cs(host.querySelector(':scope > .bma')).opacity : +cs(b.pool).opacity, shadow: cs(m ? host : document.querySelector('#floor')).boxShadow };
  }, mobile);
  ok('… trạng thái tĩnh ngay từ đầu: 0 animation, không nguồn sáng, viền nền đủ, ' + (mobile ? 'hào quang' : 'hồ sáng') + ' 0,45 — không viền Mực', !!r && r.still && r.n === 0 && r.cr === 'none' &&
     r.base && r.halo === .45 && r.shadow === 'none' && !!s && s.n === 0, r);
  const vr = await vividRun(page, m => { const r = (m ? document.querySelector('#mNote .mnt') : document.querySelector('#floor')).getBoundingClientRect();
    return m ? { x: r.left, y: Math.max(0, r.top - 22), width: r.width, height: 20 } : { x: 0, y: Math.max(0, r.top - 60), width: 700, height: 58 }; }, mobile, 2, 300, 30);
  ok('… trên màn thật có hiện (điểm ảnh sắc)', vr.every(n => n >= 150), vr);
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
