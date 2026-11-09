/* "Để B0DY kể về bạn" (1.9.0) — chạy trên chế độ QC (?qc · máy chủ giả = mã Worker thật · tab "Kể về bạn" giả của qc-ke.js).
   Header L3: không còn tín hiệu tuần / dãy bước · ngày giờ cạnh logo (desktop) · thẻ H4 góc phải đúng kích thước Figma, căn giữa header,
   không đè cụm trái · chấm Cam khi chưa mở · câu gợi ý lần đầu (một lần) · nút "← Phiếu" trong luồng đổi lịch.
   Hành trình: mở từ thẻ → ke.html?qc · 22 khoảnh khắc (Minh Khôi = bộ số artifact) / 18 (Diệu Linh) · câu hỏi chặn khi chưa chốt ·
   phản ứng đúng · đi tới biệt danh → nhãn thẻ = biệt danh, hết chấm · thẻ chia sẻ PNG 1080 × 1920 · PDF A4 hợp lệ (xref đúng byte) ·
   "Đặt lịch tuần 43" về trang đặt lịch · mở thẳng ke.html không có dữ liệu → về trang đặt lịch · hội viên không có câu chuyện → không thẻ ·
   "Không phải bạn?" → thẻ biến mất · 0 lỗi console / CSP · không lệnh nào ra máy chủ thật. Desktop 1440 × 900 + mobile 393 × 852.
   node test/ui_ke.js */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const { startServer, API } = require('./ui_harness');

const EXE = require('./pw_exe');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); }
}
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { if (await fn()) return true; } catch (e) { /* trang đang chuyển */ } await sleep(100); } return false; }

async function open(browser, server, mobile) {
  const ctx = await browser.newContext(Object.assign(mobile ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
                                                            : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, { acceptDownloads: true }));
  const page = await ctx.newPage();
  const t = { page, ctx, errs: [], hits: 0, desk: !mobile };
  page.on('pageerror', e => t.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused to/.test(m.text())) t.errs.push(m.type() + ': ' + m.text()); });
  await page.route(API + '**', r => { t.hits++; r.abort(); });
  await page.goto(server.url + 'img/favicon.svg');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(server.url + '?qc');
  await page.waitForSelector('.qc-tab');
  return t;
}
const waitView = (page, v, ms) => page.waitForFunction(x => window.__lt && window.__lt.S.view === x && !document.querySelector('.page.leave-fwd,.page.leave-back'), v, { timeout: ms || 8000 });
async function login(t, q, pin) {
  const page = t.page;
  await waitView(page, 'find');
  await page.fill('#q', q);
  await page.waitForSelector('.rrow');
  await page.locator('.rrow').first().click();
  await waitView(page, 'verify');
  await page.focus('#pin'); await page.keyboard.type(pin);
  await page.locator(t.desk ? '#vgo' : '#vgoM').click();
}
async function notMe(t) {
  const page = t.page;
  await page.locator('[data-a="notyou"] >> visible=true').first().click();
  await waitView(page, 'find');
}
const hdGeo = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const chip = document.querySelector('#kchip'), dot = chip && chip.querySelector('.kc-dot'), cs = chip && getComputedStyle(chip), t = chip && chip.querySelector('.kc-t');
  return { hd: r('#hd'), wm: r('.wm'), clock: r('#clock'), hm: r('.hd-m'), chip: r('#kchip'), dot: dot ? r('#kchip .kc-dot') : null, tab: r('#kchip .kc-tab'), ar: r('#kchip .kc-ar'),
           label: t ? t.textContent : '', aria: chip ? chip.getAttribute('aria-label') : '', bg: cs ? cs.backgroundColor : '', font: t ? getComputedStyle(t).fontFamily + '|' + getComputedStyle(t).fontWeight + '|' + getComputedStyle(t).fontSize : '',
           old: !!document.querySelector('#sig,#steps,#stepn,#sigD,#sigM'), vw: innerWidth, back: !!document.querySelector('#hdR .hd-back') };
});

async function run(browser, server, mobile) {
  const tag = mobile ? 'mobile' : 'desktop';
  console.log('\n== ' + tag + ' ==');
  const t = await open(browser, server, mobile), page = t.page;

  /* chưa xác minh: góc phải trống */
  await waitView(page, 'find');
  let g = await hdGeo(page);
  ok(tag + ': header L3 — không tín hiệu tuần / dãy bước; chưa xác minh → không có thẻ', !g.old && !g.chip, g);
  if (!mobile) ok(tag + ': ngày giờ Hà Nội ngay cạnh logo (khoảng 32 px)', g.clock && g.wm && Math.abs(g.clock.x - g.wm.r - 32) <= 1, g);

  /* hội viên không có câu chuyện → không thẻ */
  await login(t, 'thanh hang', '2222');
  await waitView(page, 'book'); await sleep(1500);
  ok(tag + ': Vũ Thanh Hằng (không có câu chuyện) → không thẻ', !(await hdGeo(page)).chip);
  await notMe(t);

  /* Minh Khôi: có câu chuyện (bộ số artifact) */
  await login(t, 'minh khoi', '1111');
  await waitView(page, 'book');
  ok(tag + ': Minh Khôi → thẻ "Để B0DY kể về bạn" hiện ở góc phải', await until(() => page.evaluate(() => !!document.querySelector('#kchip')), 4000));
  await sleep(500);
  g = await hdGeo(page);
  const H = mobile ? 36 : 40, W = mobile ? 159 : 181, M = mobile ? 16 : 48;
  ok(tag + ': thẻ H4 — cao ' + H + ', rộng ≈ ' + W + ' (Figma), mép phải cách ' + M + ' px, giữa chiều cao header', g.chip && Math.abs(g.chip.h - H) < .5 && Math.abs(g.chip.w - W) <= 3 &&
     Math.abs(g.vw - g.chip.r - M) < 1 && Math.abs((g.chip.y + g.chip.h / 2) - (g.hd.y + g.hd.h / 2)) <= 1, g);
  ok(tag + ': khối Chàm, dải Cam ' + (mobile ? 6 : 8) + ' px, nhãn Archivo XC 800 ' + (mobile ? 18 : 20) + ' px, mũi tên ' + (mobile ? 14 : 16) + ' px',
     g.bg === 'rgb(42, 31, 168)' && g.tab && Math.round(g.tab.w) === (mobile ? 6 : 8) && /Archivo XC/.test(g.font) && g.font.indexOf('|800|' + (mobile ? 18 : 20) + 'px') > 0 && g.ar && Math.round(g.ar.w) === (mobile ? 14 : 16), g);
  ok(tag + ': chưa mở → chấm Cam ở góc trên phải (lệch ra 4 px) · nhãn đọc to có "Mới"', g.dot && Math.abs(g.dot.r - (g.chip.r + 4)) < 1 && Math.abs(g.dot.y - (g.chip.y - 4)) < 1 && /Mới$/.test(g.aria) && /33 tuần/.test(g.aria), g);
  ok(tag + ': cụm trái không chạm thẻ', g.hm && g.hm.r <= g.chip.x - 8, g);
  /* câu gợi ý lần đầu */
  ok(tag + ': câu gợi ý lần đầu sau ~1,2 s, đúng chữ, dưới thẻ', await until(() => page.evaluate(() => { const h = document.querySelector('#khint'), c = document.querySelector('#kchip'); if (!h || !c) return false; const a = h.getBoundingClientRect(), b = c.getBoundingClientRect(); return h.textContent === 'Khôi ơi, mình kể lại 33 tuần tập của bạn rồi. Bấm vào xem nhé.' && a.top >= b.bottom + 6 && a.right <= innerWidth; }), 3000));
  ok(tag + ': câu gợi ý tự tắt sau 6 giây', await until(() => page.evaluate(() => !document.querySelector('#khint')), 7500));
  await page.reload(); await page.waitForSelector('.qc-tab'); await waitView(page, 'book'); await sleep(2600);
  ok(tag + ': tải lại → không gợi ý lần nữa (mỗi hội viên / phiên bản một lần), thẻ vẫn có chấm', await page.evaluate(() => !document.querySelector('#khint') && !!document.querySelector('#kchip .kc-dot')));
  if (!mobile) {
    await page.hover('#kchip'); await sleep(400);
    const hv = await hdGeo(page);
    ok(tag + ': rê chuột → dải Cam 14 px, thẻ rộng thêm 14 px (giãn sang trái), mép phải đứng yên', Math.round(hv.tab.w) === 14 && Math.abs(hv.chip.w - (g.chip.w + 14)) <= 1 && Math.abs(hv.chip.r - g.chip.r) < .5, [hv.tab, hv.chip, g.chip]);
    await page.mouse.move(700, 500);
  }

  /* mở hành trình */
  await page.click('#kchip');
  await page.waitForURL(/\/ke\.html\?qc$/);
  await page.waitForFunction(() => window.__ke && document.querySelector('.scr.on'));
  await sleep(800);
  const k0 = await page.evaluate(() => ({ n: window.__ke.L.length, ids: window.__ke.L.map(x => x.id), cover: [...document.querySelectorAll('.scr.on h1 .ln')].map(x => x.textContent),
    lb: document.querySelector('.scr.on .lb').textContent, say: document.querySelector('.scr.on .say').textContent.replace(/ /g, ' '), segs: document.querySelectorAll('#segs i').length,
    hidden: [...document.querySelectorAll('.scr')].filter(s => !s.classList.contains('on')).every(s => s.inert && s.getAttribute('aria-hidden') === 'true') }));
  ok(tag + ': ke.html — 22 khoảnh khắc (bộ số artifact), bìa "Minh / Khôi", nhãn "33 tuần · 03.03 → 16.10"', k0.n === 22 && k0.segs === 22 && k0.cover.join('|') === 'Minh|Khôi' && k0.lb === '33 tuần · 03.03 → 16.10' &&
     k0.say === 'Để B0DY kể về 33 tuần tập luyện chăm chỉ vừa qua của Khôi nhé.' && k0.hidden, k0);
  /* chơi hết bằng bàn phím / chạm như khách */
  /* máy test vẽ WebGL bằng CPU: B0B lớn làm khung hình chậm → đợi hết chuyển cảnh trước mỗi lần bấm, rồi đợi đã sang khoảnh khắc mới */
  const idle = () => until(() => page.evaluate(() => !window.__ke.busy()), 5000);
  const next = async () => {
    await idle(); const c = await page.evaluate(() => window.__ke.cur());
    if (mobile) await page.mouse.click(382, 300); else await page.keyboard.press('ArrowRight');   /* chạm mép phải (ngoài thẻ chia sẻ) */
    await until(() => page.evaluate(c => window.__ke.cur() !== c || !!document.querySelector('.scr.on .nudge'), c), 4000); await idle(); await sleep(150);
  };
  const curId = () => page.evaluate(() => window.__ke.L[window.__ke.cur()].id);
  await next(); ok(tag + ': → luật chơi', await curId() === 'rules');
  await page.click('.scr.on [data-next]'); await sleep(300); await idle();
  ok(tag + ': "Chơi luôn" → câu 1 / 4', (await page.textContent('.scr.on .lb')) === 'Câu 1 / 4');
  await next();
  ok(tag + ': chưa chốt → không qua được câu hỏi (rung nhắc)', await curId() === 'q' && await page.evaluate(() => !!document.querySelector('.scr.on .guess.nudge')));
  await page.locator('.scr.on .rng').fill('80'); await sleep(100);
  ok(tag + ': kéo thanh → số đoán đổi theo ("80")', (await page.textContent('.scr.on .val .num')) === '80');
  await page.click('.scr.on .guess .btn'); await sleep(2400);
  const a1 = await page.evaluate(() => ({ r: document.querySelector('.scr.on .say').textContent.replace(/ /g, ' '), n: document.querySelector('.scr.on .spill .num').textContent }));
  ok(tag + ': chốt 80 → "Suýt trúng…", số đếm tới 86', a1.r === 'Thiếu mất 6 buổi rùi. Bạn chăm chỉ hơn bạn nghĩ nhiều.' && a1.n === '86', a1);
  await next(); ok(tag + ': đồng hồ 24 giờ', await curId() === 'clock' && await page.evaluate(() => document.querySelectorAll('.scr.on .dial .w').length === 4));
  await next(); await page.click('.scr.on .opt[data-v="T4"]'); await sleep(1200);
  ok(tag + ': chọn T4 → "NHẦM TO, ĐÓ LÀ NGÀY" · Thứ Hai', await curId() === 'days' && (await page.textContent('.scr.on .lb')) === 'NHẦM TO, ĐÓ LÀ NGÀY' && (await page.textContent('.scr.on h2')) === 'Thứ Hai');
  for (const id of ['gap', 'room', 'streak']) { await next(); ok(tag + ': → ' + id, await curId() === id); }
  await next(); await page.locator('.scr.on .rng').fill('200'); await page.click('.scr.on .guess .btn'); await sleep(2500);
  ok(tag + ': chốt 200 tấn → "Sát sàn sạt…" · 214,6', await curId() === 'mtn' && /Sát sàn sạt/.test(await page.textContent('#stage .scr.on .say.dim')) && (await page.textContent('.scr.on .nu .num')) === '214,6');
  await next(); await sleep(1600);
  ok(tag + ': thanh tạ 115 kg (2 đĩa mới rơi vào, 1 đĩa trượt mỗi bên)', await page.evaluate(() => document.querySelectorAll('.scr.on .bbs .add').length === 4 && document.querySelectorAll('.scr.on .bbs .keep').length === 2 && document.querySelector('.scr.on .nu .num').textContent === '115'));
  await next(); await page.locator('.scr.on .rng').fill('4.2'); await sleep(100);
  ok(tag + ': ô đoán cân hiện "4,2"', (await page.textContent('.scr.on .val .num')) === '4,2');
  await page.click('.scr.on .guess .btn'); await sleep(900);
  ok(tag + ': chốt 4,2 → "Đoán sát đấy" · Giảm 4,4 kg', (await page.textContent('.scr.on .lb')) === 'Đoán sát đấy' && (await page.textContent('.scr.on .nu .num')) === '4,4');
  for (const id of ['pull', 'coach', 'lead', 'nick']) { await next(); ok(tag + ': → ' + id, await curId() === id); }
  const done = await page.evaluate(() => Object.keys(localStorage).filter(k => /^qc:ke_done:/.test(k)).map(k => localStorage.getItem(k)));
  ok(tag + ': tới biệt danh → ghi ke_done = "Người giữ hẹn" (khoá qc:)', done.length === 1 && done[0] === 'Người giữ hẹn', done);
  await next(); ok(tag + ': → bảng màu', await curId() === 'bands');
  await next(); await sleep(900);
  /* thẻ chia sẻ */
  const c0 = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.scr.on .pick-c')].map(b => b.textContent + (b.classList.contains('sel') ? '*' : '')) }));
  ok(tag + ': thẻ chia sẻ — 12 chip, chọn sẵn 6 như artifact', c0.chips.join(',') === '86 buổi*,Giờ quen*,Chuỗi 6 tuần,214,6 tấn*,Deadlift*,Squat*,Bench press,Cân nặng,Vòng eo*,Vòng hông,Vòng ngực,Vòng đùi', c0);
  await page.click('.scr.on .pick-c >> nth=2'); await sleep(200);
  ok(tag + ': chọn chip thứ 7 → bỏ chip chọn sớm nhất, vẫn 6', await page.evaluate(() => document.querySelectorAll('.scr.on .pick-c.sel').length === 6 && document.querySelector('.scr.on .pick-c:nth-child(3)').classList.contains('sel')));
  if (!mobile) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#saveimg')]);
    const p = await dl.path(), b = fs.readFileSync(p);
    ok(tag + ': "Lưu ảnh" → tải B0DY-nguoi-giu-hen.png, PNG 1080 × 1920', dl.suggestedFilename() === 'B0DY-nguoi-giu-hen.png' && b.slice(1, 4).toString() === 'PNG' && b.readUInt32BE(16) === 1080 && b.readUInt32BE(20) === 1920, [dl.suggestedFilename(), b.length]);
    await page.click('#printv'); await page.waitForSelector('.sheet'); await sleep(600);
    const [dp] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('.sheet .btn:not(.ghost)')]);
    const pdf = fs.readFileSync(await dp.path()), txt = pdf.toString('latin1');
    const sx = +/startxref\n(\d+)\n%%EOF\n$/.exec(txt)[1], offs = [...txt.slice(sx).matchAll(/(\d{10}) 00000 n /g)].map(m => +m[1]);
    const objOk = offs.length === 5 && offs.every((o, i) => txt.startsWith((i + 1) + ' 0 obj\n', o));
    const im = /\/Width (\d+) \/Height (\d+)[^>]*\/Length (\d+)/.exec(txt), so = txt.indexOf('stream\n', txt.indexOf('4 0 obj')) + 7;
    ok(tag + ': "Xem bản in" → "Lưu PDF" → B0DY-B801DY-ke-ve-ban.pdf, một trang A4, xref đúng byte, ảnh JPEG đủ độ dài',
       dp.suggestedFilename() === 'B0DY-B801DY-ke-ve-ban.pdf' && /^%PDF-1\.4/.test(txt) && txt.slice(sx, sx + 4) === 'xref' && objOk && /\/MediaBox \[0 0 595\.28 841\.89\]/.test(txt) &&
       im && +im[1] === 1588 && +im[2] === 2246 && pdf[so] === 0xFF && pdf[so + 1] === 0xD8 && pdf[so + +im[3] - 2] === 0xFF && pdf[so + +im[3] - 1] === 0xD9, { f: dp.suggestedFilename(), offs, im: im && im.slice(1) });
    await page.keyboard.press('Escape'); await sleep(200);
    ok(tag + ': Escape đóng bản in, tiêu điểm về nút "Xem bản in"', await page.evaluate(() => !document.querySelector('.sheet') && document.activeElement && document.activeElement.id === 'printv'));
  }
  await next();
  const nx = await page.evaluate(() => ({ lb: document.querySelector('.scr.on .lb').textContent, h: document.querySelector('.scr.on h2').textContent, btn: document.querySelector('#book').textContent,
    slot: document.querySelector('.scr.on .slot') && document.querySelector('.scr.on .slot').textContent }));
  ok(tag + ': tuần sau — "Lịch tuần sau đã mở." · ô 18:00 Thứ Hai · "Đặt lịch tuần 43"', nx.lb === 'Tuần sau · 19.10 → 25.10' && nx.h.replace(/ /g, ' ') === 'Lịch tuần sau đã mở.' && nx.btn === 'Đặt lịch tuần 43' &&
     /Thứ Hai · 19\.10/.test(nx.slot) && /18:00/.test(nx.slot) && /Coach Quyết Hán/.test(nx.slot) && /Còn 30 buổi · hết hạn 01\.03/.test(nx.slot), nx);
  await page.click('#book');
  await page.waitForURL(u => !/ke\.html/.test(u)); await page.waitForSelector('.qc-tab'); await waitView(page, 'book');
  await sleep(600);
  g = await hdGeo(page);
  ok(tag + ': "Đặt lịch tuần 43" → về trang đặt lịch; thẻ thành "Người giữ hẹn", hết chấm', g.label === 'Người giữ hẹn' && !g.dot && /^Người giữ hẹn: xem lại/.test(g.aria), g);

  /* mở thẳng ke.html không có dữ liệu → về trang đặt lịch */
  const saved = await page.evaluate(() => sessionStorage.getItem('qc:ke_payload'));
  await page.evaluate(() => sessionStorage.removeItem('qc:ke_payload'));
  await page.goto(server.url + 'ke.html?qc');
  await page.waitForURL(u => !/ke\.html/.test(u)); await page.waitForSelector('.qc-tab');
  ok(tag + ': mở thẳng ke.html không có dữ liệu → về trang đặt lịch', /\?qc$/.test(page.url()));
  await waitView(page, 'book');

  /* "Không phải bạn?" → thẻ biến mất */
  await notMe(t);
  ok(tag + ': "Không phải bạn?" → không còn thẻ, không còn câu chuyện / dữ liệu hành trình trong phiên', await page.evaluate(() => !document.querySelector('#kchip') && !sessionStorage.getItem('qc:ke_story') && !sessionStorage.getItem('qc:ke_payload')));
  /* máy dùng chung: dữ liệu hành trình còn sót (giả lập) mà phiên đã đổi → ke.html không hiện, về trang đặt lịch */
  ok(tag + ': (dữ liệu hành trình của Minh Khôi đã có trước khi đăng xuất)', !!saved && JSON.parse(saved).story.sessions.length === 86 && JSON.parse(saved).tk.length === 16);
  await page.evaluate(v => sessionStorage.setItem('qc:ke_payload', v), saved);
  await page.goto(server.url + 'ke.html?qc');
  await page.waitForURL(u => !/ke\.html/.test(u)); await page.waitForSelector('.qc-tab');
  ok(tag + ': đã đăng xuất, mở ke.html (Tiến / gõ đường dẫn) → không hiện câu chuyện của người trước', /\?qc$/.test(page.url()));
  await waitView(page, 'find');

  /* Diệu Linh: đã đặt sẵn → phiếu; dạng câu chuyện khác */
  await login(t, 'dieu linh', '7777');
  await waitView(page, 'ticket');
  ok(tag + ': Diệu Linh (phiếu) → thẻ hiện', await until(() => page.evaluate(() => !!document.querySelector('#kchip')), 4000));
  if (mobile) await page.evaluate(() => { const h = document.querySelector('#khint'); if (h) h.remove(); });
  /* luồng đổi lịch: góc phải thành "← Phiếu" */
  await page.locator('[data-a="gochg"] >> visible=true').first().click();
  await waitView(page, 'change'); await sleep(400);
  g = await hdGeo(page);
  ok(tag + ': đổi lịch → góc phải là nút "← Phiếu", không phải thẻ', g.back && !g.chip, g);
  await page.click('#hdR .hd-back'); await waitView(page, 'ticket'); await sleep(400);
  ok(tag + ': "← Phiếu" → về phiếu, thẻ trở lại', !!(await hdGeo(page)).chip);
  await page.click('#kchip');
  await page.waitForURL(/\/ke\.html\?qc$/); await page.waitForFunction(() => window.__ke && document.querySelector('.scr.on'));
  const kl = await page.evaluate(() => ({ ids: window.__ke.L.map(x => x.id).join(','), last: window.__ke.L[window.__ke.L.length - 1] }));
  ok(tag + ': Diệu Linh — 18 khoảnh khắc (không số đo cơ thể / hít xà / bảng màu), cuối "Xem phiếu tuần 43" T2 07:00',
     kl.ids === 'cover,rules,q,a1,clock,pick,days,gap,room,streak,q,mtn,lift,coach,lead,nick,card,next' && kl.last.btn === 'Xem phiếu tuần 43' && kl.last.slot.time === '07:00' && /Thứ Hai · 19\.10/.test(kl.last.slot.lb), kl);
  await page.evaluate(() => window.__ke.go(window.__ke.L.length - 1)); await sleep(700);
  await page.click('#close');
  await page.waitForURL(u => !/ke\.html/.test(u)); await page.waitForSelector('.qc-tab'); await waitView(page, 'ticket');
  ok(tag + ': "← Đặt lịch" → về phiếu', true);

  ok(tag + ': không một lệnh nào ra máy chủ thật', t.hits === 0, t.hits);
  ok(tag + ': 0 lỗi console / pageerror / CSP (trang đặt lịch + ke.html)', t.errs.length === 0, t.errs);
  await t.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const server = await startServer();
  try { await run(browser, server, false); await run(browser, server, true); }
  catch (e) { fail++; console.log('  FAIL  lỗi chạy test: ' + (e && e.stack || e)); }
  await browser.close(); server.srv.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
