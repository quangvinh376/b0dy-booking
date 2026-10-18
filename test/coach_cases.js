/* Kịch bản luật "mỗi coach một suất mỗi khung" (chủ studio chốt 18/10) — dùng chung cho test/gas_lt.js (Apps Script giả) và
   worker/test/parity.mjs (Apps Script + Worker, so từng phản hồi). Dữ liệu bịa của baSheets() trong hai file đó:
   Quyết: H. Đức Nam 1:1 · K. Thứ Một 1:1 · Ngọc Nam 1:2 · K. Cặp Một 1:2 · K. Cặp Hai 1:2
   Mai: K. Thứ Hai 1:1 · T. Thị Mỹ Linh 1:2 (hết hạn 21.10) · Khải: K. Thứ Ba 1:1 · Lâm: K. Thứ Tư 1:1 · Ngọc: P. Thị Hà 1:1 (từ 21.10)
   h = { setup(now, opts), call(t, body), login(t, q, pin), logRows(t), ok(label, cond, extra), rid(), vn(iso, hm) } — call / login
   có thể đồng bộ (Apps Script giả) hoặc trả Promise (parity): mọi chỗ đều await. */
'use strict';

async function coachCases(h) {
  const { setup, call, login, logRows, ok, rid, vn } = h;
  const W = '2026-W43';
  const book = (t, s, picks) => call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: W, picks: picks.map(p => ({ date: p[0], h: p[1] })) });
  const change = (t, s, from, to) => call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: W, from: { date: from[0], h: from[1] }, to: { date: to[0], h: to[1] } });
  const boot = async (t, s) => { const b = await call(t, { action: 'lt_boot', tok: s.tok }); b.tok = s.tok; return b; };
  const at = (r, k) => (r.coachAt || {})[k];
  const rowsAt = (t, date, hh) => logRows(t).filter(x => x[4] === date && x[6] === (hh < 10 ? '0' : '') + hh + ':00' && x[11] === 'Đã đặt');
  const fullOnly = (r, date, hh) => r.ok === false && r.error === 'het_cho' && Array.isArray(r.full) && r.full.length === 1 && r.full[0].date === date && r.full[0].h === hh;

  console.log('\n== 13. Mỗi coach một suất mỗi khung · ghép 1:2 cùng coach (luật 18/10) ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'));
    /* A · 1:1 trùng coach */
    const nam = await login(t, 'duc nam', '0001');
    let r = await book(t, nam, [['2026-10-19', 6], ['2026-10-21', 18]]);
    ok('H. Đức Nam (Quyết · 1:1) đặt T2 06:00 + T4 18:00', r.ok, r.error || r.why);
    ok('… khung của chính mình không bị đánh dấu coach bận; state có coachAt (đối tượng)', r.coachAt && typeof r.coachAt === 'object' && !at(r, '2026-10-19|6'), r.coachAt);
    const mot = await login(t, 'thu mot', '0021');
    ok('K. Thứ Một (cùng coach Quyết · 1:1) thấy T2 06:00 "busy", phòng mới 1 suất', at(mot, '2026-10-19|6') === 'busy' && mot.taken['2026-10-19|6'] === 1, [mot.coachAt, mot.taken]);
    ok('… coachAt chỉ nói về coach của chính hội viên, không lộ tên ai', JSON.stringify(mot.coachAt).indexOf('Nam') < 0 && Object.values(mot.coachAt).every(v => v === 'busy' || v === 'join'), mot.coachAt);
    r = await book(t, mot, [['2026-10-19', 6], ['2026-10-23', 6]]);
    ok('… chọn T2 06:00 + T6 06:00 → het_cho chỉ ra đúng khung coach bận', fullOnly(r, '2026-10-19', 6), r);
    ok('… không ghi buổi T6 nào (tất cả hoặc không)', logRows(t).filter(x => x[16] === 'B921DY').length === 0);
    const hai = await login(t, 'thu hai', '0022');
    ok('K. Thứ Hai (coach khác · Mai) không bị chặn ở T2 06:00', !at(hai, '2026-10-19|6'), hai.coachAt);
    r = await book(t, hai, [['2026-10-19', 6], ['2026-10-20', 6]]);
    ok('… đặt T2 06:00 → ok, phòng 2 suất (2 coach)', r.ok && r.taken['2026-10-19|6'] === 2, r.error || r.why);

    /* B · 1:2 cùng coach ghép cặp */
    const nn = await login(t, 'ngoc nam', '0002');
    ok('Ngọc Nam (Quyết · 1:2) thấy T2 06:00 "busy" (Quyết đang dạy 1:1, nhóm 1:2 không vào)', at(nn, '2026-10-19|6') === 'busy', nn.coachAt);
    r = await book(t, nn, [['2026-10-20', 7], ['2026-10-23', 7]]);
    ok('Ngọc Nam đặt T3 07:00 + T6 07:00 một mình → ok, mỗi khung 1 suất', r.ok && r.taken['2026-10-20|7'] === 1 && r.taken['2026-10-23|7'] === 1, r.error || r.why);
    const c1 = await login(t, 'cap mot', '0025');
    ok('K. Cặp Một (Quyết · 1:2) thấy T3 07:00 "join"', at(c1, '2026-10-20|7') === 'join', c1.coachAt);
    r = await book(t, c1, [['2026-10-20', 7], ['2026-10-21', 7]]);
    ok('… ghép vào T3 07:00 → ok, cặp vẫn 1 suất (2 người)', r.ok && r.taken['2026-10-20|7'] === 1 && rowsAt(t, '2026-10-20', 7).length === 2, r.error || r.why);
    const c2 = await login(t, 'cap hai', '0026');
    ok('Cặp T3 07:00 đã đủ 2 → khách 1:2 thứ ba (K. Cặp Hai) thấy "busy"', at(c2, '2026-10-20|7') === 'busy', c2.coachAt);
    r = await book(t, c2, [['2026-10-20', 7], ['2026-10-22', 7]]);
    ok('… chọn T3 07:00 → het_cho', fullOnly(r, '2026-10-20', 7), r);
    const mot2 = await boot(t, mot);
    ok('K. Thứ Một (1:1) thấy T6 07:00 "busy": Quyết có một khách 1:2 ở đó, khách 1:1 không ghép vào nhóm 1:2', at(mot2, '2026-10-23|7') === 'busy', mot2.coachAt);
    const linh = await login(t, 'my linh', '0003');
    ok('T. Thị Mỹ Linh (1:2 · Mai) không ghép với nhóm của Quyết: T3 07:00 không "join"', !at(linh, '2026-10-20|7'), linh.coachAt);
    r = await book(t, linh, [['2026-10-20', 7], ['2026-10-21', 7]]);
    ok('… đặt T3 07:00 → ok, phòng 2 suất (nhóm Quyết + Mai)', r.ok && r.taken['2026-10-20|7'] === 2, r.error || r.why);

    /* C · phòng đủ 4 coach: khách 1:2 vẫn vào nhóm có sẵn của coach mình */
    r = await book(t, c2, [['2026-10-22', 9], ['2026-10-23', 9]]);
    ok('K. Cặp Hai (Quyết · 1:2) đặt T5 09:00 + T6 09:00 → ok', r.ok, r.error || r.why);
    const hai2 = await boot(t, hai);
    r = await book(t, hai2, [['2026-10-22', 9]]);
    ok('K. Thứ Hai (Mai) thêm T5 09:00 → ok', r.ok, r.error || r.why);
    const ba = await login(t, 'thu ba', '0023');
    r = await book(t, ba, [['2026-10-22', 9], ['2026-10-23', 10]]);
    ok('K. Thứ Ba (Khải) đặt T5 09:00 → ok', r.ok, r.error || r.why);
    const tu = await login(t, 'thu tu', '0024');
    r = await book(t, tu, [['2026-10-22', 9], ['2026-10-23', 11]]);
    ok('K. Thứ Tư (Lâm) đặt T5 09:00 → ok, phòng 4 suất = đầy', r.ok && r.taken['2026-10-22|9'] === 4, r.error || r.why);
    const ha = await login(t, 'thi ha', '0007');
    ok('P. Thị Hà (Ngọc) thấy T5 09:00 đầy', ha.taken['2026-10-22|9'] === 4 && !at(ha, '2026-10-22|9'), [ha.taken['2026-10-22|9'], ha.coachAt]);
    r = await book(t, ha, [['2026-10-22', 9], ['2026-10-23', 8]]);
    ok('… chọn T5 09:00 → het_cho (phòng đầy)', fullOnly(r, '2026-10-22', 9), r);
    const c1b = await boot(t, c1);
    ok('K. Cặp Một (Quyết · 1:2) thấy T5 09:00 "join" dù phòng đầy', at(c1b, '2026-10-22|9') === 'join' && c1b.taken['2026-10-22|9'] === 4, [c1b.coachAt, c1b.taken['2026-10-22|9']]);
    r = await book(t, c1b, [['2026-10-22', 9]]);
    ok('… thêm T5 09:00 → ok: 4 coach, 5 người, vẫn 4 suất', r.ok && r.taken['2026-10-22|9'] === 4 && rowsAt(t, '2026-10-22', 9).length === 5, r.error || r.why);
    const nn2 = await boot(t, nn);
    ok('Ngọc Nam (Quyết · 1:2) thấy T5 09:00 "busy" (cặp đã đủ)', at(nn2, '2026-10-22|9') === 'busy', nn2.coachAt);
    r = await book(t, nn2, [['2026-10-22', 9]]);
    ok('… thêm T5 09:00 → het_cho', fullOnly(r, '2026-10-22', 9), r);

    /* D · đổi lịch theo cùng luật */
    r = await book(t, mot2, [['2026-10-19', 7], ['2026-10-21', 8]]);
    ok('K. Thứ Một đặt T2 07:00 + T4 08:00 → ok', r.ok, r.error || r.why);
    r = await change(t, mot2, ['2026-10-21', 8], ['2026-10-23', 7]);
    ok('K. Thứ Một (1:1) đổi T4 08:00 → T6 07:00 (Quyết có khách 1:2) → het_cho, không ghi', fullOnly(r, '2026-10-23', 7) && logRows(t).filter(x => x[16] === 'B921DY').length === 2, r);
    r = await change(t, nn2, ['2026-10-23', 7], ['2026-10-21', 7]);
    ok('Ngọc Nam (1:2) đổi T6 07:00 → T4 07:00 (K. Cặp Một 1:2 đang một mình) → ok, ghép thành cặp', r.ok && r.taken['2026-10-21|7'] === 2 && !r.taken['2026-10-23|7'], r.error || r.why);
    const mot3 = await boot(t, mot2);
    ok('Quyết rời T6 07:00 → K. Thứ Một thấy T6 07:00 rảnh', !at(mot3, '2026-10-23|7'), mot3.coachAt);
    r = await change(t, mot3, ['2026-10-21', 8], ['2026-10-23', 7]);
    ok('… đổi T4 08:00 → T6 07:00 → ok', r.ok && r.mine.sessions.some(x => x.date === '2026-10-23' && x.h === 7), r.error || r.why);
    const lim = await boot(t, c2);
    ok('Giới hạn số ngày tính theo luật mới: K. Cặp Hai còn thêm được 2 buổi', lim.limits.add === 2, lim.limits);
  }

  console.log('\n== 14. Sổ lệch luật (dòng ghi trước luật / sửa tay) · tên coach lệch dấu, hoa thường, hậu tố ==');
  {
    const row = (code, name, short, coach, kind, kh, r) => [code, 1, W, '2026-10-23', 'T6', '20:00', name, short, coach, kind, 'Đã đặt', 'Đặt', '', '2026-10-18 06:30:00', r, kh, short + ' · QH'];
    const t = await setup(vn('2026-10-18', '07:00'), { log: [
      row('B901DY-W43', 'Hoàng Đức Nam', 'H. Đức Nam', 'Quyết Hán', '1:1', 'B901DY', 'ridlegacy0001'),
      row('B921DY-W43', 'Khách Thứ Một', 'K. Thứ Một', 'quyet han', '1:1', 'B921DY', 'ridlegacy0002'),
      row('B902DY-W43', 'Ninh Ngọc Nam', 'Ngọc Nam', 'Quyết Hán (giai đoạn 2)', '1:2', 'B902DY', 'ridlegacy0003')] });
    const c1 = await login(t, 'cap mot', '0025');
    ok('Quyết có 2 khách 1:1 + 1 khách 1:2 cùng T6 20:00 (sổ lệch luật) → tính đủ 3 suất, không coi là một', c1.taken['2026-10-23|20'] === 3, c1.taken);
    ok('… "quyet han" / "Quyết Hán (giai đoạn 2)" là cùng coach Quyết → khách 1:2 của Quyết thấy "busy", không "join"', at(c1, '2026-10-23|20') === 'busy', c1.coachAt);
    const hai = await login(t, 'thu hai', '0022');
    let r = await book(t, hai, [['2026-10-23', 20], ['2026-10-22', 20]]);
    ok('K. Thứ Hai (Mai) vào suất cuối T6 20:00 → ok, phòng 4 suất', r.ok && r.taken['2026-10-23|20'] === 4, r.error || r.why);
    const ba = await login(t, 'thu ba', '0023');
    r = await book(t, ba, [['2026-10-23', 20], ['2026-10-22', 20]]);
    ok('K. Thứ Ba (Khải) chọn T6 20:00 → het_cho (không bao giờ nhét thêm người)', fullOnly(r, '2026-10-23', 20), r);
  }
}

module.exports = { coachCases };
