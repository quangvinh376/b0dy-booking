/* Gói 1:2 · ghép lớp (chủ studio chốt 18/10) — ca biên trên trang thật + máy chủ giả của chế độ QC (qc.js = mã Worker), desktop + mobile.
   node test/ui_duo.js
   1. Thục Quyên đặt T4 11:00 + T5 11:00 (một mình) · Uyển Nhi đặt T4 09:00 + T6 09:00, mời Thục Quyên T4 09:00
   2. Thục Quyên mở → phiếu: dòng Tập đôi báo lời mời → bảng → Tập cùng → đổi lịch chọn sẵn T4 11:00 → T4 09:00, nút "Dời vào cặp"
   3. Gửi → phiếu "Đã ghép tập đôi!" · lượt đổi còn 2 · sổ: dòng "Ghép" · Uyển Nhi thấy T4 09:00 tập đôi cùng Thục Quyên
   4. Uyển Nhi đổi T6 09:00 (đang lẻ) sang T5 11:00 (Thục Quyên đang chờ) → "Dời vào cặp" khác ngày, không tính lượt
   5. Thục Quyên đổi T4 09:00 (đang tập đôi) ra T4 11:00 → không được (cùng ngày, rời cặp) · sang T6 19:00 → "Xác nhận đổi" (tính lượt)
   6. Thục Quyên mời Uyển Nhi T6 19:00 → Uyển Nhi "Không, cảm ơn" → Thục Quyên thấy "Uyển Nhi đã từ chối tham gia" + "Mời bạn khác" */
'use strict';
const { chromium } = require('playwright');
const { startServer, API } = require('./ui_harness');
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
  await page.goto(server.url + '?qc'); await page.waitForSelector('.qc-tab');
  const login = async (q, pin) => {
    await waitView(page, 'find');
    await page.fill('#q', q); await page.waitForSelector('.rrow'); await page.locator('.rrow').first().click();
    await waitView(page, 'verify'); await page.focus('#pin'); await page.keyboard.type(pin);
    await page.locator(mobile ? '#vgoM' : '#vgo').click();
  };
  const signOut = async () => {
    await page.evaluate(() => { [localStorage, sessionStorage].forEach(s => Object.keys(s).filter(k => k.indexOf('qc:') === 0 && k !== 'qc:lt_dev').forEach(k => s.removeItem(k))); });
    await page.reload(); await page.waitForSelector('.qc-tab');
  };
  const flushed = async () => { for (let i = 0; i < 50; i++) { const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qcsrv:do') || '{}')).filter(k => k.indexOf('j:') === 0).length); if (!n) return; await sleep(100); } };
  const so = kh => page.evaluate(kh => { const g = JSON.parse(localStorage.getItem('qcsrv:g')), rows = g['qc-out'].find(x => x.title === 'Sổ đặt lịch').rows;
    return rows.slice(4).filter(r => r && r[16] === kh && r[3] === '2026-W43').map(r => [r[4], r[6], r[11], r[12], r[13]].join(' | ')); }, kh);
  const cell = (d, h) => page.locator('#wkb .c[data-d="' + d + '"][data-h="' + h + '"] >> visible=true').first();
  const cta = () => page.locator((mobile ? '#ctaM' : '#cta')).first();
  /* nút chốt đổi chữ kiểu fade-through + thanh đáy mobile thay sau ~100 ms → đợi tới khi đúng (tối đa 4 s) thay vì đọc một lần */
  const ctaIs = (re, on) => page.waitForFunction(([m, src, on]) => { const b = document.querySelector(m ? '#ctaM' : '#cta'); return !!b && new RegExp(src).test(b.textContent) && (!on || !b.disabled); },
    [mobile, re.source, !!on], { timeout: 4000 }).then(() => true, () => false);
  const book = async picks => { await waitView(page, 'book'); for (const [d, h] of picks) await cell(d, h).click(); await cta().click(); await waitView(page, 'ticket'); await flushed(); };
  /* tia viền trên dòng Tập đôi (1.3.0): đã gắn (.sig-in), đủ 2 lớp, vòng tia đang chạy vô hạn */
  const beamOn = async raw => {
    await page.waitForSelector('#prLine .prl.beam.sig-in', { timeout: 4000 }).catch(() => {});
    const b = await page.evaluate(() => { const e = document.querySelector('#prLine .prl'); if (!e) return null;
      const a = e.getAnimations({ subtree: true }).filter(x => x.animationName === 'bmrun')[0];
      return { beam: e.classList.contains('beam'), sig: e.classList.contains('sig-in'), layers: e.querySelectorAll('.bm-s, .bm-g').length, run: !!a && a.playState === 'running' && a.effect.getTiming().iterations === Infinity }; });
    return raw ? b : !!b && b.beam && b.sig && b.layers === 2 && b.run;
  };
  const openPairs = async () => { await page.locator('#prLine .prl').click(); await page.waitForSelector(mobile ? '#sheet.on' : '#drawer.on'); await sleep(300); };
  const host = mobile ? '#sheet' : '#drawer';

  /* 0 · state lưu trên máy từ trước khi máy chủ có gói 1:2 (lần mở đầu sau khi deploy Worker): bảng 13 giờ từ bộ nhớ, làm mới xong
       phải dựng lại 5 khung ghép (tô lại ô thôi là còn thừa hàng) — mạng chậm 2 s để thấy được cả hai lúc */
  await login('uyen nhi', '5555'); await waitView(page, 'book');
  await page.evaluate(() => { for (const s of [localStorage, sessionStorage]) { const v = s.getItem('qc:lt_st'); if (v) { const o = JSON.parse(v); delete o.st.duo; s.setItem('qc:lt_st', JSON.stringify(o)); } } });
  const qcSlow = async () => { await page.click('.qc-tab'); await page.waitForSelector('#qcp:not([hidden])'); await page.click('#qcp [data-qc="slow"]'); await page.focus('#qcT'); await page.keyboard.press('Escape'); await page.waitForSelector('#qcp', { state: 'hidden' }); };
  await qcSlow();
  await page.reload(); await page.waitForSelector('.qc-tab'); await waitView(page, 'book');
  const hrs = () => page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#wkb .c')).map(c => +c.dataset.h))).join(','));
  const rows0 = await hrs();
  await page.waitForFunction(() => Array.from(new Set(Array.from(document.querySelectorAll('#wkb .c')).map(c => +c.dataset.h))).join(',') === '9,11,15,17,19', null, { timeout: 8000 }).catch(() => {});
  const rows1 = await hrs();
  ok('State cũ trên máy (chưa có gói 1:2): bảng 13 giờ → làm mới xong dựng lại đúng 5 khung ghép', rows0.split(',').length === 13 && rows1 === '9,11,15,17,19', [rows0, rows1]);
  await qcSlow();
  await signOut();
  /* 1 */
  await login('thuc quyen', '1212'); await book([['2026-10-21', 11], ['2026-10-22', 11]]);
  ok('Thục Quyên đặt T4 11:00 + T5 11:00', (await so('B811DY')).length === 2, await so('B811DY'));
  await signOut(); await login('uyen nhi', '5555');
  await book([['2026-10-21', 9], ['2026-10-23', 9]]);
  await openPairs();
  await page.locator(host + ' [data-a="invpick"][data-d="2026-10-21"]').click();
  await page.locator(host + ' .pr-opt:has-text("Thục Quyên")').click();
  await page.locator(host + ' [data-a="invsend"]').click();
  await page.waitForFunction(h => /Đã mời Thục Quyên/.test(document.querySelector(h).textContent), host, { timeout: 8000 });
  await flushed();
  ok('Uyển Nhi mời Thục Quyên T4 09:00', (await so('B805DY')).some(r => /Mời M\. Thục Quyên/.test(r)), await so('B805DY'));
  await page.keyboard.press('Escape'); await sleep(300);
  /* 2 */
  await signOut(); await login('thuc quyen', '1212'); await waitView(page, 'ticket'); await sleep(800);
  ok('Thục Quyên: dòng Tập đôi báo "Uyển Nhi mời bạn tập đôi · T4 09:00"', /Uyển Nhi mời bạn tập đôi · T4 09:00/.test(await page.textContent('#prLine')), await page.textContent('#prLine'));
  ok('… dòng lời mời có tia viền (border beam) đang chạy', await beamOn(), await beamOn(true));
  await openPairs();
  await page.locator(host + ' [data-a="invok"]').click();
  await waitView(page, 'change'); await sleep(600);
  const chg = await page.evaluate(() => window.__lt.S.chg);
  ok('Tập cùng (cùng ngày có buổi đang chờ) → đổi lịch chọn sẵn T4 11:00 → T4 09:00', chg.from && chg.from.date === '2026-10-21' && chg.from.h === 11 && chg.to && chg.to.date === '2026-10-21' && chg.to.h === 9, chg);
  ok('Nút chốt "Dời vào cặp" bật', await ctaIs(/Dời vào cặp/, true));
  await cta().click();
  await waitView(page, 'ticket'); await flushed(); await sleep(800);
  const st = await page.evaluate(() => ({ v: window.__lt.S.tkVariant, left: window.__lt.S.st.mine.changesLeft, pairs: window.__lt.S.st.duo.pairs, h1: document.querySelector('#pg-tk h1, .pg-tk h1') ? document.querySelector('.pg-tk h1').textContent : '' }));
  ok('Gửi → phiếu "Đã ghép tập đôi!" · lượt đổi còn 2 · T4 09:00 tập đôi cùng Uyển Nhi', st.v === 'paired' && st.left === 2 && st.pairs['2026-10-21|9'] === 'Uyển Nhi' && /Đã ghép tập đôi/.test(st.h1), st);
  const rq = await so('B811DY');
  ok('Sổ: dòng mới "Ghép" (Ghép từ T4 21.10 · 11:00) + dòng cũ "Đã đổi" (Ghép sang …)', rq.some(r => /\| 09:00 \| Đã đặt \| Ghép \| Ghép từ T4 21\.10 · 11:00/.test(r)) && rq.some(r => /\| 11:00 \| Đã đổi \|/.test(r) && /Ghép sang T4 21\.10 · 09:00/.test(r)), rq);
  /* 4 */
  await signOut(); await login('uyen nhi', '5555'); await waitView(page, 'ticket'); await sleep(500);
  ok('Uyển Nhi: T4 09:00 tập đôi cùng Thục Quyên', await page.evaluate(() => window.__lt.S.st.duo.pairs['2026-10-21|9'] === 'Thục Quyên'));
  await page.locator('[data-a="gochg"] >> visible=true').first().click(); await waitView(page, 'change'); await sleep(400);
  await cell('2026-10-23', 9).click(); await sleep(200);
  const jn = await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-22"][data-h="11"]'); return c ? c.className + ' · ' + c.textContent : 'none'; });
  ok('Chọn T6 09:00 (đang lẻ) → T5 11:00 hiện ô Ghép · Thục Quyên', /join/.test(jn) && /Thục Quyên/.test(jn), jn);
  await cell('2026-10-22', 11).click(); await sleep(300);
  ok('Nút chốt "Dời vào cặp"', await ctaIs(/Dời vào cặp/, true));
  await cta().click(); await waitView(page, 'ticket'); await flushed(); await sleep(600);
  const s2 = await page.evaluate(() => ({ v: window.__lt.S.tkVariant, left: window.__lt.S.st.mine.changesLeft, pairs: window.__lt.S.st.duo.pairs }));
  ok('Uyển Nhi: Ghép khác ngày → phiếu "paired" · lượt đổi còn 2 · T5 11:00 cùng Thục Quyên', s2.v === 'paired' && s2.left === 2 && s2.pairs['2026-10-22|11'] === 'Thục Quyên', s2);
  /* 5 */
  await signOut(); await login('thuc quyen', '1212'); await waitView(page, 'ticket'); await sleep(500);
  await page.locator('[data-a="gochg"] >> visible=true').first().click(); await waitView(page, 'change'); await sleep(400);
  const pre = await page.evaluate(() => window.__lt.S.chg.from);
  if (!pre || pre.date !== '2026-10-21') await cell('2026-10-21', 9).click();
  await sleep(200);
  const same = await page.evaluate(() => { const c = document.querySelector('#wkb .c[data-d="2026-10-21"][data-h="11"]'); return c ? c.className + ' ' + c.getAttribute('aria-disabled') : 'none'; });
  ok('Thục Quyên chọn T4 09:00 (đang tập đôi) → T4 11:00 khoá (rời cặp trong ngày không được)', /lock/.test(same) && /true/.test(same), same);
  await cell('2026-10-23', 19).click(); await sleep(300);
  ok('T4 09:00 → T6 19:00: nút "Xác nhận đổi" (tính lượt)', await ctaIs(/Xác nhận đổi/, true));
  await cta().click(); await waitView(page, 'ticket'); await flushed(); await sleep(600);
  const s3 = await page.evaluate(() => ({ v: window.__lt.S.tkVariant, left: window.__lt.S.st.mine.changesLeft }));
  ok('Rời cặp → "Đổi" · lượt đổi còn 1', s3.v === 'changed' && s3.left === 1, s3);
  await signOut(); await login('uyen nhi', '5555'); await waitView(page, 'ticket'); await sleep(500);
  ok('Uyển Nhi: T4 09:00 thành chờ bạn tập', await page.evaluate(() => !window.__lt.S.st.duo.pairs['2026-10-21|9']));
  await openPairs();
  ok('Bảng Tập đôi của Uyển Nhi: T4 09:00 "Chờ bạn tập" + nút Mời bạn', await page.evaluate(h => { const r = Array.from(document.querySelectorAll(h + ' .pr-row')).find(x => /21\.10/.test(x.textContent)); return !!r && /Chờ bạn tập/.test(r.textContent) && !!r.querySelector('[data-a="invpick"]'); }, host));
  /* 6 · từ chối (chủ studio 19/10): người mời thấy "<tên> đã từ chối tham gia" + nút "Mời bạn khác" — ở dòng Tập đôi trên phiếu và ở bảng.
       Thục Quyên (không có lời mời đến nên dòng Tập đôi không bị lời mời chiếm chỗ) mời Uyển Nhi T6 19:00 → Uyển Nhi từ chối */
  await page.keyboard.press('Escape'); await sleep(300);
  await signOut(); await login('thuc quyen', '1212'); await waitView(page, 'ticket'); await sleep(600);
  await openPairs();
  await page.locator(host + ' [data-a="invpick"][data-d="2026-10-23"]').click();
  await page.locator(host + ' .pr-opt:has-text("Uyển Nhi")').click();
  await page.locator(host + ' [data-a="invsend"]').click();
  await page.waitForFunction(h => /Đã mời Uyển Nhi/.test(document.querySelector(h).textContent), host, { timeout: 8000 });
  await flushed(); await page.keyboard.press('Escape'); await sleep(300);
  await signOut(); await login('uyen nhi', '5555'); await waitView(page, 'ticket'); await sleep(600);
  await openPairs();
  /* mobile: "Không, cảm ơn" đóng cửa sổ ngay rồi mới gửi → đợi dòng sổ, không đợi nút biến mất */
  await page.locator(host + ' [data-a="invno"][data-d="2026-10-23"]').click();
  const dec = r => /\| Từ chối \| Từ chối \| Từ chối lời mời của M\. Thục Quyên/.test(r);
  for (let i = 0; i < 80 && !(await so('B805DY')).some(dec); i++) await sleep(100);
  ok('Uyển Nhi: Không, cảm ơn → sổ thêm dòng "Từ chối" lời mời của Thục Quyên', (await so('B805DY')).some(dec), await so('B805DY'));
  await page.keyboard.press('Escape'); await sleep(300);
  await signOut(); await login('thuc quyen', '1212'); await waitView(page, 'ticket'); await sleep(600);
  const ln = await page.evaluate(() => { const b = document.querySelector('#prLine .prl'); return b ? [b.querySelector('.prl-t').textContent, (b.querySelector('.prl-c') || {}).textContent || '', b.dataset.d || '', b.dataset.h || ''] : null; });
  ok('Thục Quyên: dòng Tập đôi "Uyển Nhi đã từ chối tham gia · T6 19:00" + "Mời bạn khác"',
     !!ln && ln[0] === 'Uyển Nhi đã từ chối tham gia · T6 19:00' && ln[1] === 'Mời bạn khác' && ln[2] === '2026-10-23' && ln[3] === '19', ln);
  ok('… dòng "Mời bạn khác" có tia viền (border beam) đang chạy', await beamOn(), await beamOn(true));
  await openPairs();
  const pk = await page.evaluate(h => ({ pick: window.__lt.S.invPick, open: !!document.querySelector(h + ' .pr-pick .pr-opt'), q: (document.querySelector(h + ' #prQ') || {}).textContent || '' }), host);
  ok('Bấm dòng đó → bảng Tập đôi mở sẵn phần chọn bạn cho T6 19:00', pk.pick && pk.pick.date === '2026-10-23' && pk.pick.h === 19 && pk.open && /23\.10/.test(pk.q), pk);
  await page.locator(host + ' [data-a="invpickoff"]').click(); await sleep(300);
  const rw = await page.evaluate(h => { const r = Array.from(document.querySelectorAll(h + ' .pr-row')).find(x => /23\.10/.test(x.textContent)); return r ? [r.querySelector('.pr-s').textContent, (r.querySelector('[data-a="invpick"]') || {}).textContent || ''] : null; }, host);
  ok('Bảng Tập đôi: T6 19:00 "Uyển Nhi đã từ chối tham gia" + nút "Mời bạn khác"', !!rw && rw[0] === 'Uyển Nhi đã từ chối tham gia' && rw[1] === 'Mời bạn khác', rw);
  ok('0 lỗi console / pageerror', errs.length === 0, errs);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  await run(browser, server, false);
  await run(browser, server, true);
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
