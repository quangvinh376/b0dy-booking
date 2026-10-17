'use strict';
/* Tìm tên gõ tới đâu ra tới đó (01 · TÌM TÊN) — trang thật + máy chủ giả (logic LichTuan.gs, dữ liệu bịa của ui_harness):
   1 ký tự đã ra danh sách · gõ riêng họ không ra ai · tô phần khớp (span.hit đúng chữ, đúng màu, một độ đậm, có esc) ·
   nhắc "Gõ thêm" khi more · danh sách cũ giữ nguyên khi đang chờ (không chớp) · phản hồi về muộn không đè, vẫn vào bộ nhớ ·
   máy chủ cũ (need: 2) vẫn chạy như trước · gõ nhanh không dồn lệnh (đợi ngừng gõ 120 ms) · bàn phím · mobile.
   node test/rv_find_dynamic.js */
const R = require('./rv_common');
const { dateIn } = require('./gas_env');
const { vn } = R.H;
const IDLE = 'Gõ vài chữ trong tên của bạn, ví dụ Nam', OLD = 'Gõ tên đệm và tên của bạn, ví dụ Đức Nam', MORE = 'Gõ thêm để thu hẹp danh sách';
const MISS = 'Thử gõ tên gọi, ví dụ Nam, hoặc tên đệm và tên, ví dụ Đức Nam.<br>Gói đã hết hạn hoặc chưa kích hoạt sẽ không có trong danh sách.';
const finds = t => (t.bodies || []).filter(b => b.action === 'lt_find');
const rows = page => page.$$eval('#res .rrow', els => els.map(e => ({ t: e.querySelector('.nm').textContent, hits: Array.from(e.querySelectorAll('.nm .hit')).map(h => h.textContent), on: e.classList.contains('on') })));
const names = async page => (await rows(page)).map(r => r.t);
const hint = page => page.evaluate(() => { const h = document.querySelector('#qhint'); return h.hidden ? '' : h.textContent; });
const missOn = page => page.evaluate(() => !document.querySelector('#miss').hidden);
/** đợi danh sách đúng các tên này (theo thứ tự) */
async function waitNames(page, want, ms) {
  try { await page.waitForFunction(w => Array.from(document.querySelectorAll('#res .rrow .nm')).map(e => e.textContent).join('|') === w, want.join('|'), { timeout: ms || 5000 }); return true; } catch (e) { return false; }
}
async function until(cond, ms) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > (ms || 5000)) return false; await R.sleep(5); } return true; }
/** máy chủ cũ (lt_find trước bản này): cần ≥ 2 chữ (need: 2), khớp phần cuối họ tên, tối đa 5 người, không có more */
function oldServer(t) {
  const real = t.env.ltDoPost_, e = t.env;
  t.env.ltDoPost_ = function (p) {
    if (!p || p.action !== 'lt_find') return real(p);
    const now = t.clock.now, q = e.ltName_(String(p.q || '').slice(0, 60)).split(' ').filter(Boolean);
    if (q.length < 2) return { ok: true, now: now, results: [], need: 2 };
    const res = e.ltPersonsNow_(e.ltWeekCtx_(now), false).filter(x => e.ltMatch_(q, x.toks));
    res.sort((a, b) => a.short.localeCompare(b.short, 'vi'));
    return { ok: true, now: now, results: res.slice(0, 5).map(x => ({ id: e.ltIdOf_(x.key), short: x.short, coach: x.coach })) };
  };
}
(async () => {
  await R.start();
  const NOW = vn('2026-10-18', '20:15');

  console.log('\n== desktop · gõ 1 ký tự · tô phần khớp · chỉ gõ họ · more ==');
  {
    const t = R.H.backend(NOW);
    /* thêm một hội viên bịa có ký tự HTML trong tên để kiểm esc */
    const LA = 'America/Los_Angeles';
    t.files.BA.getSheetByName('MEMBERS').rows.push(['', '999', 'Khách Thử <i>&"Lan', '24 buổi', 24, '1:1', 300000, 'Hiền Mai', '0910009999', '', '', '', 0, 10, '',
      dateIn(LA, '2026-08-01'), '', dateIn(LA, '2027-01-01'), 'B999DY', 'x']);
    const page = await R.open2(t, R.DESK, 'dyn-d');
    await page.waitForSelector('#q');
    await R.sleep(300);
    const a = await page.evaluate(() => ({ aria: document.querySelector('#q').getAttribute('aria-label'), miss: document.querySelector('#miss .b14').innerHTML }));
    R.ok('Mở trang: lời nhắc "' + IDLE + '"', (await hint(page)) === IDLE, await hint(page));
    R.ok('Ô nhập: aria-label "Gõ tên của bạn" · hộp không thấy: lời mới', a.aria === 'Gõ tên của bạn' && a.miss === MISS, a);

    await page.fill('#q', 'n');
    const n1 = await waitNames(page, ['H. Đức Nam', 'H. Đức Nam', 'K. Thử Năm', 'L. Mỹ Ngọc']);
    let rs = await rows(page);
    R.ok('Gõ 1 ký tự "n" → 4 người có tên gọi bắt đầu bằng N (họ "Nguyễn" không tính)', n1, rs);
    R.ok('… tô đúng chữ N của tên gọi ở mọi dòng', rs.length === 4 && rs.every(r => r.hits.join() === 'N'), rs);
    R.ok('… gửi đúng 1 lượt tìm "n"', finds(t).length === 1 && finds(t)[0].q === 'n', finds(t).map(b => b.q));
    const st = await page.evaluate(() => {
      const css = (el, p) => el ? getComputedStyle(el)[p] : null, r = document.querySelectorAll('#res .rrow');
      const pick = row => ({ nm: css(row.querySelector('.nm'), 'color'), hit: css(row.querySelector('.hit'), 'color'), hl: row.querySelector('.nm').classList.contains('hl'),
        w: [css(row.querySelector('.nm'), 'fontWeight'), css(row.querySelector('.hit'), 'fontWeight')], u: css(row.querySelector('.hit'), 'textDecorationLine') });
      return { on: pick(r[0]), off: pick(r[1]) };
    });
    R.ok('Màu: dòng thường chữ Graphite #4A4A4A, phần khớp Ink #0A0A0A', st.off.hl && st.off.nm === 'rgb(74, 74, 74)' && st.off.hit === 'rgb(10, 10, 10)', st.off);
    R.ok('Màu: dòng đang chọn (nền Ink) chữ 70 % Paper, phần khớp Paper', st.on.nm === 'rgba(250, 250, 250, 0.7)' && st.on.hit === 'rgb(250, 250, 250)', st.on);
    R.ok('Một độ đậm 500, không gạch chân', [st.on, st.off].every(x => x.w.every(v => v === '500') && x.u === 'none'), st);

    await page.fill('#q', 'duc n'); await waitNames(page, ['H. Đức Nam', 'H. Đức Nam']);
    rs = await rows(page);
    R.ok('"duc n" → tô "Đức" + "N"', rs.length === 2 && rs.every(r => r.hits.join('+') === 'Đức+N'), rs);
    await page.fill('#q', 'hoang duc nam'); await waitNames(page, ['H. Đức Nam', 'H. Đức Nam']);
    await R.sleep(200);
    rs = await rows(page);
    R.ok('Đủ họ tên → tô chữ cái họ "H" + "Đức" + "Nam"', rs.every(r => r.hits.join('+') === 'H+Đức+Nam'), rs);
    await page.fill('#q', 'ai'); await waitNames(page, ['K. Thử Hai', 'K. Thử Mười Hai', 'N. Khải Linh']);
    rs = await rows(page);
    R.ok('Giữa chữ "ai" → Hai, Mười Hai (tên gọi) rồi Khải; tô đúng đoạn giữa chữ', rs.map(r => r.hits.join()).join('|') === 'ai|ai|ải', rs);
    await page.fill('#q', 'lan'); await waitNames(page, ['K. Thử <i>&"Lan']);
    const x = await page.evaluate(() => { const s = document.querySelector('#res .rrow .nm'); return { html: s.innerHTML, el: s.querySelectorAll('i,b').length }; });
    R.ok('Tên có ký tự HTML → hiện nguyên chữ, không thành thẻ', x.el === 0 && x.html === 'K. Thử &lt;i&gt;&amp;"<span class="hit">Lan</span>', x);

    for (const q of ['khach', 'hoang', 'nguyen']) {
      await page.fill('#q', q);
      await page.waitForSelector('#miss:not([hidden])', { timeout: 5000 }).catch(() => {});
      R.ok('Chỉ gõ họ "' + q + '" → không ai, hộp "Không tìm thấy"', (await rows(page)).length === 0 && await missOn(page), await names(page));
    }
    await page.fill('#q', 'thu');
    await page.waitForFunction(m => document.querySelector('#qhint').textContent === m, MORE, { timeout: 5000 }).catch(() => {});
    rs = await rows(page);
    R.ok('"thu" → 16 người: hiện 6 dòng + "' + MORE + '"', rs.length === 6 && (await hint(page)) === MORE && rs.every(r => r.hits.join() === 'Thử'), { n: rs.length, h: await hint(page) });
    await page.fill('#q', 'thu muoi m'); await waitNames(page, ['K. Thử Mười Một']);
    R.ok('Gõ thêm → còn 1 người, hết lời nhắc', (await names(page)).join() === 'K. Thử Mười Một' && (await hint(page)) === '', await hint(page));

    /* bàn phím: ↓ chọn dòng 2, Enter mở xác minh đúng người; Esc xoá ô */
    await page.fill('#q', 'n'); await waitNames(page, ['H. Đức Nam', 'H. Đức Nam', 'K. Thử Năm', 'L. Mỹ Ngọc']);
    await page.focus('#q'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    rs = await rows(page);
    R.ok('↓ ↓ → dòng 3 được chọn', rs.map(r => r.on).join() === 'false,false,true,false', rs.map(r => r.on));
    await page.keyboard.press('Escape');
    R.ok('Esc → xoá ô, về lời nhắc ban đầu, không còn dòng', (await page.inputValue('#q')) === '' && (await rows(page)).length === 0 && (await hint(page)) === IDLE);
    await page.keyboard.type('n'); await waitNames(page, ['H. Đức Nam', 'H. Đức Nam', 'K. Thử Năm', 'L. Mỹ Ngọc']);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForSelector('.pg-verify', { timeout: 5000 }).catch(() => {});
    const who = await page.evaluate(() => { const w = document.querySelector('.pg-verify .who .h22'); return w && w.textContent; });
    R.ok('Enter → màn xác minh của đúng người đang chọn (K. Thử Năm)', who === 'K. Thử Năm', who);
    await page._ctx.close();
  }

  console.log('\n== danh sách cũ giữ nguyên khi đang chờ · phản hồi về muộn không đè ==');
  {
    const t = R.H.backend(NOW);
    t.delayFor = b => (b.action === 'lt_find' && b.q === 'ng' ? 1500 : b.action === 'lt_find' && b.q === 'kh' ? 1200 : 0);
    const page = await R.open2(t, R.DESK, 'dyn-wait');
    await page.waitForSelector('#q');
    await page.fill('#q', 'n'); await waitNames(page, ['H. Đức Nam', 'H. Đức Nam', 'K. Thử Năm', 'L. Mỹ Ngọc']);
    await page.fill('#q', 'ng');
    const inflight = await until(() => finds(t).some(b => b.q === 'ng'));
    const mid = { names: await names(page), miss: await missOn(page), hint: await hint(page) };
    R.ok('Đang chờ "ng" (1,5 s): 4 dòng của "n" vẫn nguyên, không hộp "không thấy", không chữ "Đang tìm…"', inflight && mid.names.length === 4 && !mid.miss && mid.hint === '', mid);
    R.ok('… rồi đổi sang kết quả "ng" (đầu chữ Ngọc trước, rồi giữa chữ Hưng, Không)', await waitNames(page, ['L. Mỹ Ngọc', 'Đ. Văn Hưng', 'B. Không Số'], 6000), await names(page));
    await page.fill('#q', 'kh');
    await until(() => finds(t).some(b => b.q === 'kh'));
    await page.fill('#q', 'khai');
    R.ok('Gõ "khai" khi "kh" còn đang chờ → ra N. Khải Linh ngay', await waitNames(page, ['N. Khải Linh']), await names(page));
    const delivered = await until(() => (t.tl || []).filter(e => e[1] === 'out' && e[2] === 'lt_find').length === finds(t).length, 6000);
    await R.sleep(250);
    const late = await page.evaluate(() => ({ q: document.querySelector('#q').value, shown: window.__lt.S.qShown, names: Array.from(document.querySelectorAll('#res .rrow .nm')).map(e => e.textContent) }));
    R.ok('Phản hồi "kh" về muộn (1,2 s) không đè danh sách "khai"', delivered && late.q === 'khai' && late.shown === 'khai' && late.names.join() === 'N. Khải Linh', late);
    const n0 = finds(t).length;
    await page.fill('#q', 'kh');
    R.ok('… nhưng vẫn vào bộ nhớ: gõ lùi "kh" ra ngay, không hỏi lại máy chủ', await waitNames(page, ['B. Không Số', 'N. Khải Linh'], 1500) && finds(t).length === n0, { n: finds(t).length - n0, names: await names(page) });
    await page._ctx.close();
  }

  console.log('\n== máy chủ cũ (need: 2) — trang mới lên trước Worker ==');
  {
    const t = R.H.backend(NOW);
    oldServer(t);
    const page = await R.open2(t, R.DESK, 'dyn-old');
    await page.waitForSelector('#q');
    await page.fill('#q', 'nam');
    await page.waitForFunction(m => document.querySelector('#qhint').textContent === m, OLD, { timeout: 5000 }).catch(() => {});
    R.ok('1 chữ → máy chủ cũ trả need: 2 → lời nhắc cũ "' + OLD + '", không dòng, không hộp "không thấy"',
         (await hint(page)) === OLD && (await rows(page)).length === 0 && !(await missOn(page)), { h: await hint(page), r: await names(page) });
    const n0 = finds(t).length;
    await page.fill('#q', 'na'); await R.sleep(500);
    R.ok('… từ đó gõ 1 chữ không gửi lượt tìm nào nữa (như trang cũ)', finds(t).length === n0 && (await hint(page)) === OLD, finds(t).length - n0);
    await page.fill('#q', 'duc nam');
    const ok2 = await waitNames(page, ['H. Đức Nam', 'H. Đức Nam']);
    const rs = await rows(page);
    R.ok('2 chữ → ra như cũ, vẫn tô phần khớp', ok2 && rs.every(r => r.hits.join('+') === 'Đức+Nam'), rs);
    await page.keyboard.press('Escape');
    R.ok('Esc → lời nhắc cũ (máy chủ cần 2 chữ)', (await hint(page)) === OLD);
    await page._ctx.close();
  }

  console.log('\n== gõ nhanh không dồn lệnh (đợi ngừng gõ 120 ms) ==');
  {
    const t = R.H.backend(NOW);
    const page = await R.open2(t, R.DESK, 'dyn-burst');
    await page.waitForSelector('#q');
    /* 9 lần gõ trong cùng một nhịp (nhanh hơn mọi người gõ) → đúng 1 lượt tìm, cho cả chữ cuối */
    await page.evaluate(() => { const i = document.querySelector('#q'), s = 'khai linh'; for (let k = 1; k <= s.length; k++) { i.value = s.slice(0, k); i.dispatchEvent(new Event('input', { bubbles: true })); } });
    const got = await waitNames(page, ['N. Khải Linh']);
    await R.sleep(500);
    R.ok('9 ký tự liền một nhịp → đúng 1 lượt tìm "khai linh"', got && finds(t).length === 1 && finds(t)[0].q === 'khai linh', finds(t).map(b => b.q));
    /* gõ phím thật, 30 ms/phím: số lượt tìm ≤ 1 + số khoảng nghỉ ≥ 120 ms đo ngay trên trang (không phụ thuộc máy nhanh / chậm) */
    await page.fill('#q', ''); await R.sleep(200);
    const before = finds(t).length;
    await page.evaluate(() => { window.__ti = []; document.querySelector('#q').addEventListener('input', () => window.__ti.push(performance.now())); });
    await page.focus('#q');
    await page.keyboard.type('gia bao l', { delay: 30 });
    const got2 = await waitNames(page, ['T. Gia Bảo Linh']);
    await R.sleep(500);
    const ti = await page.evaluate(() => window.__ti), gaps = ti.slice(1).map((v, i) => v - ti[i]), slow = gaps.filter(g => g >= 120).length;
    const sent = finds(t).slice(before);
    R.info('gõ "gia bao l": ' + ti.length + ' lần gõ, khoảng nghỉ dài nhất ' + Math.round(Math.max.apply(null, gaps)) + ' ms, ' + slow + ' khoảng ≥ 120 ms, ' + sent.length + ' lượt tìm', sent.map(b => b.q));
    R.ok('Gõ 9 ký tự (30 ms/phím) → ' + sent.length + ' lượt tìm (≤ 1 + ' + slow + ' khoảng nghỉ ≥ 120 ms), lượt cuối là cả chữ',
         got2 && ti.length === 9 && sent.length >= 1 && sent.length <= 1 + slow && sent[sent.length - 1].q === 'gia bao l', { sent: sent.map(b => b.q), slow });
    await page._ctx.close();
  }

  console.log('\n== mobile 393 ==');
  {
    const t = R.H.backend(NOW);
    const page = await R.open2(t, R.MOB, 'dyn-m');
    await page.waitForSelector('#q');
    await page.fill('#q', 'n');
    const ok1 = await waitNames(page, ['H. Đức Nam', 'H. Đức Nam', 'K. Thử Năm', 'L. Mỹ Ngọc']);
    const g = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, hits: document.querySelectorAll('#res .rrow .hit').length }));
    R.ok('Mobile: 1 ký tự ra 4 dòng có tô, không tràn ngang', ok1 && g.hits === 4 && g.over <= 0, g);
    await R.tap(page, '#res .rrow:nth-child(3)');
    await page.waitForSelector('.pg-verify', { timeout: 5000 }).catch(() => {});
    const who = await page.evaluate(() => { const w = document.querySelector('.pg-verify .who .h22'); return w && w.textContent; });
    R.ok('Mobile: chạm dòng 3 → xác minh K. Thử Năm', who === 'K. Thử Năm', who);
    await page._ctx.close();
  }

  R.ok('Không lỗi trang / console', R.ERRS.length === 0, R.ERRS);
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
