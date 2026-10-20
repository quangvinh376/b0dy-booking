/* Thẻ thông báo + tia viền "border beam" cho thẻ kích cầu ghép cặp 1:2 (1.3.0). Chế độ QC (dữ liệu bịa), desktop + mobile.
   node test/ui_notice.js
   Bối cảnh: 1.2.x có vòng sáng quanh biểu tượng + vạch quét mép trên cho MỌI thẻ — chủ studio 20/10: bỏ (thiếu thẩm mỹ, yếu tương phản),
   thay bằng tia viền (libraries.dev/beam) chỉ cho thẻ mời / được mời tập đôi; dải sàn desktop có lời mời: tia chỉ ở viền trên.
   1. Uyển Nhi (có lời mời): thẻ vào cùng cảnh trang trượt vào → tia chưa chạy · gắn .sig-in SAU khi trang vào xong ≥ 150 ms, B0B nhìn
      đúng lúc · mobile: thẻ mời có tia (vành + quầng, chạy vô hạn 2,4 s / vòng) · toán học đầu tia: đúng vị trí trên cả 4 cạnh, liền qua
      góc, dài không đổi · desktop: sàn có tia viền trên (vạch 2 px + quầng, 3,1 s / lượt) · chạy liên tục: không dừng khi đã đọc (rê chuột /
      chạm thẻ) · kênh live hỏi lại → cùng phần tử, tia không chạy lại từ đầu · không còn vòng sáng / vạch quét / vạch dưới toast cũ
   2. Minh Khôi chọn T5 09:00, người khác đặt trước (thẻ cảnh báo, không phải ghép cặp): không có tia (thẻ lẫn sàn) · mobile: cửa sổ báo
      đang che → chờ, đóng rồi mới gắn · B0B nhìn thẻ cảnh báo đúng lúc
   3. Thục Quyên đặt 2 buổi 1:2 → phiếu: dòng Tập đôi "… · Mời bạn" có tia, gắn sau khi trang vào xong
   4. Tab ẩn lúc thẻ vào → chưa gắn; mở lại tab → gắn
   5. Giảm chuyển động → gắn ngay, không tia chạy: viền Mực 1,5 px đứng yên thay tia */
'use strict';
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
  const vis = e => e.getClientRects().length > 0, SELS = '#floor .nt, #mNote .mnt, #prLine .prl';
  const card = e => e.nodeType === 1 && e.matches && e.matches(SELS);
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'childList') m.addedNodes.forEach(n => {
      const cs = n.nodeType === 1 ? [n].filter(card).concat(Array.from(n.querySelectorAll(SELS))) : [];
      cs.forEach(c => { if (!vis(c)) return; c.__id = c.__id || Math.random().toString(36).slice(2);
        const s = c.querySelector('.bm-s');
        L.push({ k: 'in', at: t(), id: c.__id, warn: c.classList.contains('warn'), sig: c.classList.contains('sig-in'), bm: s ? getComputedStyle(s).opacity : null }); });
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
/* trạng thái thẻ đang hiện: tia (lớp vành / quầng) · animation đang chạy · sàn (viền trên) */
async function state(page, sel) {
  return page.evaluate(s => {
    const e = Array.from(document.querySelectorAll(s)).filter(x => x.getClientRects().length)[0]; if (!e) return null;
    const an = e.getAnimations({ subtree: true }), run = an.filter(a => a.animationName === 'bmrun')[0], bs = e.querySelector('.bm-s');
    const fl = document.querySelector('#floor'), fa = fl.getAnimations().concat(document.getAnimations().filter(a => a.effect && a.effect.target === fl));
    const rail = Array.from(new Set(fa)).filter(a => a.effect.pseudoElement === '::before' && a.animationName === 'bmrail')[0];
    const fb = getComputedStyle(fl, '::before');
    return { id: e.__id, sig: e.classList.contains('sig-in'), beam: e.classList.contains('beam'), pair: e.classList.contains('pair'),
             layers: e.querySelectorAll('.bm-s, .bm-g').length, bm: bs ? +getComputedStyle(bs).opacity : null, bmDisp: bs ? getComputedStyle(bs).display : null,
             shadow: getComputedStyle(e).boxShadow,
             running: an.filter(a => a.playState === 'running').map(a => a.animationName).sort().join(','),
             run: run ? { dur: run.effect.getTiming().duration, it: run.effect.getTiming().iterations, start: run.startTime } : null,
             rail: rail ? { dur: rail.effect.getTiming().duration, it: rail.effect.getTiming().iterations, state: rail.playState } : null,
             floorBefore: fb.content, floorTop: fb.top, floorH: fb.height,
             oldRing: getComputedStyle(e.querySelector('.nt-ic') || e, '::after').content, oldLine: getComputedStyle(e, '::before').content };
  }, sel);
}
/* toán học đầu tia: dừng bmrun ở các phân số của vòng, đọc background-position 5 lớp của .bm-s::before, so với công thức
   (W, H = cỡ thẻ, L = 160, P = 2W + 2H, p = phân số × P): trên (p − L, 0) · phải (W − 2, p − W − L) · dưới (2W + H − p, H − 2) ·
   trái (0, P − p) · trái vòng sau (0, −p) → đầu tia nằm đúng một chỗ trên chu vi, liền qua góc, dài không đổi */
async function geometry(page, sel) {
  return page.evaluate(async s => {
    const e = document.querySelector(s), bs = e.querySelector('.bm-s'), r = bs.getBoundingClientRect(), W = r.width, H = r.height, P = 2 * (W + H), L = 160;
    const a = bs.getAnimations({ subtree: true }).filter(x => x.animationName === 'bmrun')[0];
    const D = a.effect.getTiming().duration, out = [];
    a.pause();
    for (const f of [0, .05, .2, .3, W / P, .35, .5, .6, (2 * W + H) / P, .8, .9, .97]) {
      a.currentTime = f * D;
      const pos = getComputedStyle(bs, '::before').backgroundPosition.split(',').map(x => x.trim().split(/\s+/).map(parseFloat)), p = f * P;
      const want = [[p - L, 0], [W - 2, p - W - L], [2 * W + H - p, H - 2], [0, P - p], [0, -p]];
      const err = Math.max.apply(null, want.map((w, i) => Math.max(Math.abs(w[0] - pos[i][0]), Math.abs(w[1] - pos[i][1]))));
      out.push({ f: +f.toFixed(3), err: +err.toFixed(2) });
    }
    a.play();
    return { W: W, H: H, out: out, max: Math.max.apply(null, out.map(x => x.err)) };
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

async function invitee(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' · được mời (Uyển Nhi) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  const bob = await login('uyen nhi', '5555'); await waitView(page, 'book');
  ok('Có B0B để theo dõi (B0B.emit)', bob);
  const s0 = await state(page, SEL);
  if (mobile) ok('Thẻ mời mobile có tia: lớp vành + lớp quầng', !!s0 && s0.beam && s0.layers === 2, s0);
  else ok('Thẻ mời trên sàn desktop đánh dấu ghép cặp (.pair), không tia quanh thẻ (chỉ viền trên của sàn)', !!s0 && s0.pair && !s0.beam && s0.layers === 0, s0);
  await armedOn(page, SEL); await sleep(60);
  let l = await log(page);
  const i1 = lastIn(l), g1 = l.filter(x => x.k === 'sig' && i1 && x.id === i1.id)[0], st1 = l.filter(x => x.k === 'settle' && i1 && x.at >= i1.at - 1).pop();
  ok('Thẻ vào cùng cảnh trang trượt vào: lúc đó chưa gắn, tia còn ẩn', !!i1 && !i1.sig && (mobile ? i1.bm === '0' : i1.bm === null), i1);
  ok('Gắn .sig-in SAU khi trang vào xong, lặng ≥ 150 ms (≤ 900 ms)', !!g1 && !!st1 && g1.at - st1.at >= 150 && g1.at - st1.at <= 900,
     [st1 && Math.round(st1.at - i1.at), g1 && Math.round(g1.at - i1.at)]);
  const b1 = l.filter(x => x.k === 'bob' && i1 && x.id === i1.id);
  ok('B0B nhìn thẻ đúng lúc gắn (không trước) · thẻ thường → "toast"', b1.length === 1 && !!g1 && b1[0].at >= g1.at - SAME && b1[0].at - g1.at <= 200 && b1[0].type === 'toast',
     b1.map(x => [x.type, Math.round(x.at - (g1 ? g1.at : 0))]));
  await sleep(800);
  const s1 = await state(page, SEL);
  if (mobile) {
    ok('Tia quanh thẻ: mờ vào xong (vành hiện hẳn), chạy vô hạn 2,4 s / vòng (vành + quầng)', !!s1 && s1.bm === 1 && /bmglow/.test(s1.running) && /bmrun/.test(s1.running) &&
       !!s1.run && s1.run.dur === 2400 && s1.run.it === Infinity, s1);
    const geo = await geometry(page, SEL);
    ok('Đầu tia đúng vị trí trên cả 4 cạnh, liền qua góc, dài không đổi (12 mốc, sai ≤ 0,6 px)', geo.max <= 0.6, geo);
  } else {
    ok('Sàn desktop: tia viền trên (vạch 2 px ở mép trên), chạy vô hạn 3,1 s / lượt', !!s1 && s1.floorBefore !== 'none' && s1.floorTop === '-1px' && s1.floorH === '2px' &&
       !!s1.rail && s1.rail.dur === 3100 && s1.rail.it === Infinity && s1.rail.state === 'running', s1);
  }
  ok('Không còn hiệu ứng cũ: vòng sáng quanh biểu tượng, vạch quét mép trên', !!s1 && s1.oldRing === 'none' && s1.oldLine === 'none', s1);
  /* đã đọc: rê chuột dừng trên thẻ (desktop) / chạm thẻ → cửa sổ chi tiết → đóng (mobile) — tia vẫn chạy */
  if (!mobile) {
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, SEL);
    await page.mouse.move(box.x, box.y); await sleep(1200); await page.mouse.move(box.x, 120); await sleep(200);
    const s2 = await state(page, SEL);
    ok('Rê chuột dừng trên thẻ 1,2 s → tia viền trên vẫn chạy (gây chú ý liên tục, không dừng khi đã đọc)', !!s2 && !!s2.rail && s2.rail.state === 'running', s2);
  } else {
    await page.locator(SEL).tap(); await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {});
    const open = await page.evaluate(() => !!document.querySelector('#sheet.on'));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#sheet').hidden, null, { timeout: 4000 }).catch(() => {});
    await sleep(300);
    const s2 = await state(page, SEL);
    ok('Chạm thẻ → cửa sổ chi tiết · đóng lại → tia vẫn chạy (không dừng khi đã đọc)', open && !!s2 && /bmrun/.test(s2.running) && s2.bm === 1, [open, s2]);
  }
  /* kênh live */
  const before = await state(page, SEL), f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s3 = await state(page, SEL);
  ok('Kênh live hỏi lại, thẻ không đổi → cùng phần tử, tia không chạy lại từ đầu', !!s3 && !!before && s3.id === before.id && s3.sig &&
     (mobile ? !!s3.run && s3.run.start === before.run.start : !!s3.rail && s3.rail.state === 'running'), [before && before.run, s3 && s3.run]);
  /* toast cũ: vạch Acid mép dưới đã bỏ */
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
  ok('Thẻ cảnh báo không phải ghép cặp → không tia (thẻ lẫn sàn), không animation nào chạy', !!s && !s.beam && !s.pair && s.layers === 0 && s.floorBefore === 'none' && !s.running, s);
  ok('B0B nhìn thẻ cảnh báo đúng lúc gắn · "error"', b.length === 1 && !!g && b[0].at >= g.at - SAME && b[0].at - g.at <= 200 && b[0].type === 'error',
     b.map(x => [x.type, Math.round(x.at - (g ? g.at : 0))]));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function ticketLine(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile' : 'desktop') + ' · phiếu: dòng Tập đôi "Mời bạn" (Thục Quyên) ==');
  const { ctx, page, errs, login } = await newPage(browser, server, mobile);
  await login('thuc quyen', '1212'); await waitView(page, 'book'); await sleep(700);
  for (const [d, h] of [['2026-10-21', 11], ['2026-10-22', 11]]) { await page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first().click(); await sleep(200); }
  await page.locator(mobile ? '#ctaM' : '#cta').click();
  await waitView(page, 'ticket');
  await armedOn(page, '#prLine .prl');
  /* trang phiếu nặng (vẽ tờ phiếu) → animation có thể bắt đầu muộn hơn lúc gắn lớp: chờ tia mờ vào xong thay vì đợi cố định */
  await until(async () => { const x = await state(page, '#prLine .prl'); return x && x.bm === 1; }, 4000);
  const l = await log(page), i = l.filter(x => x.k === 'in').pop(), g = l.filter(x => x.k === 'sig' && i && x.id === i.id)[0], st = l.filter(x => x.k === 'settle' && i && x.at >= i.at - 1).pop();
  const s = await state(page, '#prLine .prl');
  const txt = await page.evaluate(() => document.querySelector('#prLine .prl').textContent);
  ok('Dòng "… đang chờ bạn tập · Mời bạn" có tia, chạy vô hạn', /Mời bạn/.test(txt) && !!s && s.beam && s.layers === 2 && s.bm === 1 && /bmrun/.test(s.running) && !!s.run && s.run.it === Infinity, [txt, s]);
  ok('… gắn sau khi trang phiếu vào xong (≥ 150 ms)', !!g && !!st && g.at - st.at >= 150 && g.at - st.at <= 900, [st && Math.round(st.at - i.at), g && Math.round(g.at - i.at)]);
  const geo = await geometry(page, '#prLine .prl');
  ok('Đầu tia đúng vị trí trên chu vi dòng Tập đôi (sai ≤ 0,6 px)', geo.max <= 0.6, geo);
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
  ok('Tab ẩn lúc thẻ vào → chưa gắn, sàn chưa có tia', !!s0 && !s0.sig && s0.floorBefore === 'none', s0);
  const t0 = await page.evaluate(() => performance.now());
  await hide(false); await armedOn(page, '#floor .nt');
  const g = (await log(page)).filter(x => x.k === 'sig').pop();
  ok('Mở lại tab → gắn sau ≥ 150 ms lặng (≤ 900 ms), tia viền trên bắt đầu', !!g && g.at - t0 >= 150 && g.at - t0 <= 900 && (await state(page, '#floor .nt')).floorBefore !== 'none', g && Math.round(g.at - t0));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function reduced(browser, server) {
  console.log('\n== mobile · giảm chuyển động ==');
  const { ctx, page, errs, login } = await newPage(browser, server, true, { rm: true });
  await login('uyen nhi', '5555'); await waitView(page, 'book'); await armedOn(page, '#mNote .mnt'); await sleep(150);
  const l = await log(page), i = lastIn(l), g = l.filter(x => x.k === 'sig').pop(), s = await state(page, '#mNote .mnt');
  ok('Giảm chuyển động: gắn ngay (≤ 250 ms sau khi thẻ vào), không chờ', !!i && !!g && g.at - i.at <= 250, [i, g]);
  ok('… tia không chạy: lớp tia ẩn, viền Mực 1,5 px đứng yên thay tia, không animation nào chạy', !!s && s.bmDisp === 'none' && /rgb\(10, 10, 10\) 0px 0px 0px 1\.5px inset/.test(s.shadow) && !s.running, s);
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
    await reduced(browser, server);
  } catch (e) { fail++; console.log('  FAIL  lỗi chạy test: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
