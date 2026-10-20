/* Thẻ thông báo + tia viền "border beam" cho thẻ kích cầu ghép cặp 1:2 (1.3.1). Chế độ QC (dữ liệu bịa), desktop + mobile.
   node test/ui_notice.js
   Bối cảnh: chủ studio 20/10 — tia viền y hệt ví dụ libraries.dev/beam, chỉ đổi màu; CSS sinh từ chính gói border-beam 1.4.1
   (tools/beam_css.mjs): thẻ = lớp bọc data-beam="b0" (kiểu md) + [data-beam-bloom]; dải sàn desktop = lớp phủ .flb data-beam="b0l"
   (kiểu line, lật lên viền trên). Chạy khi có data-active.
   1. Uyển Nhi (có lời mời): thẻ vào cùng cảnh trang trượt vào → chưa bật · gắn .sig-in + data-active SAU khi trang vào xong ≥ 150 ms,
      B0B nhìn đúng lúc · mobile: thẻ mời có tia (mờ vào 0,6 s rồi quay vô hạn 1,96 s / vòng như gói) · góc quay đúng theo thời gian, mặt
      nạ lớp viền bám đúng góc · desktop: sàn có tia viền trên (kiểu line 3,1 s / lượt, lật lên trên) · chạy liên tục: không dừng khi đã
      đọc (rê chuột / chạm thẻ) · kênh live hỏi lại → cùng phần tử, tia không chạy lại từ đầu · không còn vòng sáng cũ / vạch dưới toast
   2. Minh Khôi chọn T5 09:00, người khác đặt trước (thẻ cảnh báo, không phải ghép cặp): không tia (thẻ lẫn sàn) · mobile: cửa sổ báo
      đang che → chờ, đóng rồi mới gắn · B0B nhìn thẻ cảnh báo đúng lúc
   3. Thục Quyên đặt 2 buổi 1:2 → phiếu: dòng Tập đôi "… · Mời bạn" có tia, bật sau khi trang vào xong
   4. Tab ẩn lúc thẻ vào → chưa bật; mở lại tab → bật
   5. Giảm chuyển động → gắn ngay, không bật tia: viền Mực 1,5 px đứng yên thay tia */
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
  const host = c => c.hasAttribute('data-beam') ? c : c.classList.contains('pair') ? document.querySelector('#floor > .flb') : null;
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'childList') m.addedNodes.forEach(n => {
      const cs = n.nodeType === 1 ? [n].filter(card).concat(Array.from(n.querySelectorAll(SELS))) : [];
      cs.forEach(c => { if (!vis(c)) return; c.__id = c.__id || Math.random().toString(36).slice(2);
        const b = host(c);
        L.push({ k: 'in', at: t(), id: c.__id, warn: c.classList.contains('warn'), sig: c.classList.contains('sig-in'), beam: !!b, act: b ? b.hasAttribute('data-active') : null }); });
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
/* trạng thái thẻ đang hiện + lớp bọc tia của nó (thẻ có data-beam, hay lớp phủ sàn .flb của thẻ .pair) */
async function state(page, sel) {
  return page.evaluate(s => {
    const e = Array.from(document.querySelectorAll(s)).filter(x => x.getClientRects().length)[0]; if (!e) return null;
    const b = e.hasAttribute('data-beam') ? e : e.classList.contains('pair') ? document.querySelector('#floor > .flb') : null, id = b ? b.getAttribute('data-beam') : '';
    const an = Array.from(new Set(e.getAnimations({ subtree: true }).concat(b ? b.getAnimations({ subtree: true }) : [])));
    const sp = an.filter(a => a.animationName === 'beam-spin-' + id || a.animationName === 'beam-travel-' + id)[0];
    return { id: e.__id, sig: e.classList.contains('sig-in'), card: e.hasAttribute('data-beam'), pair: e.classList.contains('pair'), beam: id || null,
             act: !!b && b.hasAttribute('data-active'), bloom: b ? b.querySelectorAll('[data-beam-bloom]').length : 0,
             op: b ? +getComputedStyle(b).getPropertyValue('--beam-opacity-' + id) : null, flb: !!document.querySelector('#floor > .flb'),
             running: an.filter(a => a.playState === 'running').map(a => a.animationName).filter((x, i, a) => a.indexOf(x) === i).sort().join(','),
             spin: sp ? { name: sp.animationName, dur: sp.effect.getTiming().duration, it: sp.effect.getTiming().iterations, start: sp.startTime, state: sp.playState } : null,
             flip: b && id === 'b0l' ? [getComputedStyle(b, '::before').transform, getComputedStyle(b, '::after').transform, getComputedStyle(b.querySelector('[data-beam-bloom]')).transform] : null,
             shadow: getComputedStyle(e).boxShadow, oldRing: getComputedStyle(e.querySelector('.nt-ic') || e, '::after').content };
  }, sel);
}
/* góc quay: dừng beam-spin-b0 ở các phân số của vòng → --beam-angle-b0 = phân số × 360° (đúng nhịp của gói), và mặt nạ conic của
   lớp viền ::after quay theo đúng góc đó (lớp viền bám tia) */
async function spinCheck(page, sel) {
  return page.evaluate(s => {
    const e = document.querySelector(s), a = e.getAnimations().filter(x => x.animationName === 'beam-spin-b0')[0];
    if (!a) return { err: 'không có beam-spin-b0' };
    const D = a.effect.getTiming().duration, out = [];
    a.pause();
    for (const f of [0, .125, .25, .5, .75, .9]) {
      a.currentTime = f * D;
      const ang = parseFloat(getComputedStyle(e).getPropertyValue('--beam-angle-b0')), m = getComputedStyle(e, '::after').maskImage || getComputedStyle(e, '::after').webkitMaskImage || '';
      /* trình duyệt bỏ "from 0deg" khi in ra (mặc định) → không có "from" = 0° */
      const mm = /conic-gradient\(from ([\d.]+)deg/.exec(m), m0 = /^conic-gradient\((?!from)/.test(m);
      out.push({ f: f, ang: +ang.toFixed(2), mask: mm ? +(+mm[1]).toFixed(2) : m0 ? 0 : null });
    }
    a.play();
    return { D: D, out: out, max: Math.max.apply(null, out.map(x => Math.max(Math.abs(x.ang - x.f * 360), x.mask == null ? 99 : Math.abs(x.mask - x.f * 360)))) };
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
/* chờ tia mờ vào xong (trang nặng → animation có thể bắt đầu muộn hơn lúc gắn) */
const faded = (page, sel) => until(async () => { const s = await state(page, sel); return s && s.op === 1; }, 4000);

async function invitee(browser, server, mobile) {
  console.log('\n== ' + (mobile ? 'mobile 393×852' : 'desktop 1440×900') + ' · được mời (Uyển Nhi) ==');
  const { ctx, page, errs, qc, login } = await newPage(browser, server, mobile);
  const SEL = mobile ? '#mNote .mnt' : '#floor .nt';
  const bob = await login('uyen nhi', '5555'); await waitView(page, 'book');
  ok('Có B0B để theo dõi (B0B.emit)', bob);
  const s0 = await state(page, SEL);
  if (mobile) ok('Thẻ mời mobile là lớp bọc tia data-beam="b0" + một lớp loé [data-beam-bloom] (như component của gói)', !!s0 && s0.card && s0.beam === 'b0' && s0.bloom === 1, s0);
  else ok('Sàn desktop có lời mời: lớp phủ .flb data-beam="b0l" + lớp loé; thẻ trên sàn không tia quanh thẻ', !!s0 && s0.pair && !s0.card && s0.beam === 'b0l' && s0.bloom === 1, s0);
  await armedOn(page, SEL); await sleep(60);
  let l = await log(page);
  const i1 = lastIn(l), g1 = l.filter(x => x.k === 'sig' && i1 && x.id === i1.id)[0], st1 = l.filter(x => x.k === 'settle' && i1 && x.at >= i1.at - 1).pop();
  ok('Thẻ vào cùng cảnh trang trượt vào: lúc đó chưa gắn, tia chưa bật', !!i1 && !i1.sig && i1.beam && i1.act === false, i1);
  ok('Gắn .sig-in SAU khi trang vào xong, lặng ≥ 150 ms (≤ 900 ms)', !!g1 && !!st1 && g1.at - st1.at >= 150 && g1.at - st1.at <= 900,
     [st1 && Math.round(st1.at - i1.at), g1 && Math.round(g1.at - i1.at)]);
  const b1 = l.filter(x => x.k === 'bob' && i1 && x.id === i1.id);
  ok('B0B nhìn thẻ đúng lúc gắn (không trước) · thẻ thường → "toast"', b1.length === 1 && !!g1 && b1[0].at >= g1.at - SAME && b1[0].at - g1.at <= 200 && b1[0].type === 'toast',
     b1.map(x => [x.type, Math.round(x.at - (g1 ? g1.at : 0))]));
  await faded(page, SEL);
  const s1 = await state(page, SEL);
  if (mobile) {
    ok('Tia quanh thẻ: data-active, mờ vào xong, quay vô hạn 1,96 s / vòng + lớp sắc độ của gói', !!s1 && s1.act && s1.op === 1 && !!s1.spin && s1.spin.name === 'beam-spin-b0' &&
       s1.spin.dur === 1960 && s1.spin.it === Infinity && /beam-hue-shift-b0/.test(s1.running), s1);
    const sp = await spinCheck(page, SEL);
    ok('Góc quay đúng theo thời gian, mặt nạ lớp viền bám đúng góc (6 mốc, sai ≤ 0,5°)', sp.max <= 0.5, sp);
  } else {
    ok('Sàn desktop: tia kiểu line (beam-travel-b0l 3,1 s / lượt, vô hạn), lật lên viền trên (3 lớp scaleY(-1))', !!s1 && s1.act && s1.op === 1 && !!s1.spin &&
       s1.spin.name === 'beam-travel-b0l' && s1.spin.dur === 3100 && s1.spin.it === Infinity && !!s1.flip && s1.flip.every(x => x === 'matrix(1, 0, 0, -1, 0, 0)'), s1);
  }
  ok('Không còn vòng sáng cũ quanh biểu tượng', !!s1 && s1.oldRing === 'none', s1);
  /* đã đọc: rê chuột dừng trên thẻ (desktop) / chạm thẻ → cửa sổ chi tiết → đóng (mobile) — tia vẫn chạy */
  if (!mobile) {
    const box = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, SEL);
    await page.mouse.move(box.x, box.y); await sleep(1200); await page.mouse.move(box.x, 120); await sleep(200);
    const s2 = await state(page, SEL);
    ok('Rê chuột dừng trên thẻ 1,2 s → tia viền trên vẫn chạy (gây chú ý liên tục, không dừng khi đã đọc)', !!s2 && s2.act && !!s2.spin && s2.spin.state === 'running', s2);
  } else {
    await page.locator(SEL).tap(); await page.waitForSelector('#sheet.on', { timeout: 4000 }).catch(() => {});
    const open = await page.evaluate(() => !!document.querySelector('#sheet.on'));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.querySelector('#sheet').hidden, null, { timeout: 4000 }).catch(() => {});
    await sleep(300);
    const s2 = await state(page, SEL);
    ok('Chạm thẻ → cửa sổ chi tiết · đóng lại → tia vẫn chạy (không dừng khi đã đọc)', open && !!s2 && s2.act && !!s2.spin && s2.spin.state === 'running' && s2.op === 1, [open, s2]);
  }
  /* kênh live */
  const before = await state(page, SEL), f2 = await page.evaluate(() => window.__lt.S.lastFetch);
  await qc('[data-qc="other"]');
  await page.waitForFunction(f => window.__lt.S.lastFetch > f, f2, { timeout: 6000 }).catch(() => {});
  await sleep(500);
  const s3 = await state(page, SEL);
  ok('Kênh live hỏi lại, thẻ không đổi → cùng phần tử, tia không chạy lại từ đầu', !!s3 && !!before && s3.id === before.id && s3.act && !!s3.spin && s3.spin.start === before.spin.start,
     [before && before.spin, s3 && s3.spin]);
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
  ok('Thẻ cảnh báo không phải ghép cặp → không tia (thẻ lẫn sàn), không animation nào chạy', !!s && !s.card && !s.pair && !s.beam && !s.flb && !s.running, s);
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
  await faded(page, '#prLine .prl');
  const l = await log(page), i = l.filter(x => x.k === 'in').pop(), g = l.filter(x => x.k === 'sig' && i && x.id === i.id)[0], st = l.filter(x => x.k === 'settle' && i && x.at >= i.at - 1).pop();
  const s = await state(page, '#prLine .prl');
  const txt = await page.evaluate(() => document.querySelector('#prLine .prl').textContent);
  ok('Dòng "… đang chờ bạn tập · Mời bạn" có tia (data-beam="b0", mờ vào xong, quay vô hạn)', /Mời bạn/.test(txt) && !!s && s.card && s.beam === 'b0' && s.bloom === 1 && s.act && s.op === 1 &&
     !!s.spin && s.spin.name === 'beam-spin-b0' && s.spin.it === Infinity, [txt, s]);
  ok('… bật sau khi trang phiếu vào xong (≥ 150 ms)', !!g && !!st && g.at - st.at >= 150 && g.at - st.at <= 900, [st && Math.round(st.at - i.at), g && Math.round(g.at - i.at)]);
  const sp = await spinCheck(page, '#prLine .prl');
  ok('Góc quay + mặt nạ lớp viền đúng theo thời gian (sai ≤ 0,5°)', sp.max <= 0.5, sp);
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
  ok('Tab ẩn lúc thẻ vào → chưa gắn, tia sàn chưa bật', !!s0 && !s0.sig && s0.flb && !s0.act, s0);
  const t0 = await page.evaluate(() => performance.now());
  await hide(false); await armedOn(page, '#floor .nt');
  const g = (await log(page)).filter(x => x.k === 'sig').pop();
  ok('Mở lại tab → gắn sau ≥ 150 ms lặng (≤ 900 ms), tia viền trên bật', !!g && g.at - t0 >= 150 && g.at - t0 <= 900 && (await state(page, '#floor .nt')).act, g && Math.round(g.at - t0));
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}

async function reduced(browser, server) {
  console.log('\n== mobile · giảm chuyển động ==');
  const { ctx, page, errs, login } = await newPage(browser, server, true, { rm: true });
  await login('uyen nhi', '5555'); await waitView(page, 'book'); await armedOn(page, '#mNote .mnt'); await sleep(300);
  const l = await log(page), i = lastIn(l), g = l.filter(x => x.k === 'sig').pop(), s = await state(page, '#mNote .mnt');
  ok('Giảm chuyển động: gắn ngay (≤ 250 ms sau khi thẻ vào), không chờ', !!i && !!g && g.at - i.at <= 250, [i, g]);
  ok('… không bật tia (không data-active), viền Mực 1,5 px đứng yên thay tia, không animation nào chạy', !!s && s.card && !s.act && /rgb\(10, 10, 10\) 0px 0px 0px 1\.5px inset/.test(s.shadow) && !s.running, s);
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
