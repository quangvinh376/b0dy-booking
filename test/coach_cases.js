/* Kịch bản luật "mỗi coach một suất mỗi khung" (chủ studio chốt 18/10 11:52) và ghép lớp 1:2 (chốt 18/10 14:13: khung ghép
   09 · 11 · 15 · 17 · 19, thấy tên bạn tập, mời bạn cùng coach, dời buổi đang lẻ vào cặp không tính lượt đổi) — dùng chung cho
   test/gas_lt.js (Apps Script giả) và worker/test/parity.mjs (Apps Script + Worker, so từng phản hồi). Dữ liệu bịa của baSheets()
   trong hai file đó:
   Quyết: H. Đức Nam 1:1 · K. Thứ Một 1:1 · Ngọc Nam 1:2 · K. Cặp Một 1:2 · K. Cặp Hai 1:2
   Mai: K. Thứ Hai 1:1 · T. T. Mỹ Linh 1:2 (hết hạn 21.10) · Khải: K. Thứ Ba 1:1 · Lâm: K. Thứ Tư 1:1 · Ngọc: P. Thị Hà 1:1 (từ 21.10)
   h = { setup(now, opts), call(t, body), login(t, q, pin), logRows(t), ok(label, cond, extra), rid(), vn(iso, hm) } — call / login
   có thể đồng bộ (Apps Script giả) hoặc trả Promise (parity): mọi chỗ đều await. */
'use strict';
const { dateIn } = require('./gas_env');

/* Tab "Lịch coach" giả (mục 18): lưới giờ × T2 … CN của từng coach. on(i, h): i = 0 (T2) … 6 (CN). timeCells: ô giờ là giá trị giờ
   (như khi gõ tay "14:00" vào ô định dạng tự động) thay vì chữ. */
const HRS = [6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20], DAYS7 = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
/* lưới Lịch coach trước 31/10 (chưa có hàng 12:00) — tab thật trước khi thêm hàng */
const HRS_OLD = [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20];
const hh = h => (h < 10 ? '0' : '') + h + ':00';
function grid(name, on, timeCells, hrs) {
  return [['', name].concat(DAYS7)].concat((hrs || HRS).map(h => ['', timeCells ? dateIn('Asia/Saigon', '1899-12-30', hh(h)) : hh(h)].concat(DAYS7.map((_, i) => on(i, h)))));
}
const SCHED = [['', '— LỊCH COACH'], ['', 'Tick = coach nhận khách giờ đó'], []]
  .concat(grid('Quyết Hán', (i, h) => i === 6 ? h >= 8 && h <= 11 : i === 1 ? false : !(i === 2 && h === 6)), [[]],
          grid('Hiền Mai (giai đoạn 1)', (i, h) => i < 6 && h >= 14, true), [[]],
          [['', 'Khải Phan', 'T2', 'T3', 'T4']]);   /* hàng tiêu đề thiếu thứ → không phải lưới: Khải theo mặc định */

async function coachCases(h) {
  const { setup, call, login, logRows, ok, rid, vn } = h;
  const W = '2026-W43';
  const book = (t, s, picks) => call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: W, picks: picks.map(p => ({ date: p[0], h: p[1] })) });
  const change = (t, s, from, to) => call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: W, from: { date: from[0], h: from[1] }, to: { date: to[0], h: to[1] } });
  const invite = (t, s, slot, id, r0) => call(t, { action: 'lt_invite', tok: s.tok, rid: r0 || rid(), week: W, date: slot[0], h: slot[1], to: id });
  const decline = (t, s, slot) => call(t, { action: 'lt_decline', tok: s.tok, rid: rid(), week: W, date: slot[0], h: slot[1] });
  const boot = async (t, s) => { const b = await call(t, { action: 'lt_boot', tok: s.tok }); b.tok = s.tok; return b; };
  const at = (r, k) => (r.coachAt || {})[k];
  const rowsAt = (t, date, hh) => logRows(t).filter(x => x[4] === date && x[6] === (hh < 10 ? '0' : '') + hh + ':00' && x[11] === 'Đã đặt');
  const fullOnly = (r, date, hh) => r.ok === false && r.error === 'het_cho' && Array.isArray(r.full) && r.full.length === 1 && r.full[0].date === date && r.full[0].h === hh;
  const duo = r => r.duo || {};
  const peer = (r, short) => ((duo(r).peers || []).find(p => p.short === short) || {}).id;
  const inv = r => JSON.stringify(duo(r).invIn || []);
  const rowsOf = (t, kh, st) => logRows(t).filter(x => x[16] === kh && (!st || x[11] === st));

  console.log('\n== 13. Mỗi coach một suất mỗi khung · ghép 1:2 cùng coach (luật 18/10) ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'));
    /* A · 1:1 trùng coach */
    const nam = await login(t, 'duc nam', '0001');
    let r = await book(t, nam, [['2026-10-19', 6], ['2026-10-21', 18]]);
    ok('H. Đức Nam (Quyết · 1:1) đặt T2 06:00 + T4 18:00', r.ok, r.error || r.why);
    ok('… khung của chính mình không bị đánh dấu coach bận; state có coachAt (đối tượng)', r.coachAt && typeof r.coachAt === 'object' && !at(r, '2026-10-19|6'), r.coachAt);
    ok('… khách 1:1 không có phần gói 1:2 (duo)', !('duo' in r), Object.keys(r));
    const mot = await login(t, 'thu mot', '0021');
    ok('K. Thứ Một (cùng coach Quyết · 1:1) thấy T2 06:00 "busy", phòng mới 1 suất', at(mot, '2026-10-19|6') === 'busy' && mot.taken['2026-10-19|6'] === 1, [mot.coachAt, mot.taken]);
    ok('… coachAt chỉ nói về coach của chính hội viên, không lộ tên ai', JSON.stringify(mot.coachAt).indexOf('Nam') < 0 && Object.values(mot.coachAt).every(v => v === 'busy' || v === 'join' || v === 'off'), mot.coachAt);
    r = await book(t, mot, [['2026-10-19', 6], ['2026-10-23', 6]]);
    ok('… chọn T2 06:00 + T6 06:00 → het_cho chỉ ra đúng khung coach bận', fullOnly(r, '2026-10-19', 6), r);
    ok('… không ghi buổi T6 nào (tất cả hoặc không)', logRows(t).filter(x => x[16] === 'B921DY').length === 0);
    const hai = await login(t, 'thu hai', '0022');
    ok('K. Thứ Hai (coach khác · Mai) không bị chặn ở T2 06:00', !at(hai, '2026-10-19|6'), hai.coachAt);
    r = await book(t, hai, [['2026-10-19', 6], ['2026-10-20', 6]]);
    ok('… đặt T2 06:00 → ok, phòng 2 suất (2 coach)', r.ok && r.taken['2026-10-19|6'] === 2, r.error || r.why);

    /* B · 1:2 cùng coach ghép cặp (khung ghép 11:00) */
    const nn = await login(t, 'ngoc nam', '0002');
    ok('Ngọc Nam (Quyết · 1:2) thấy T2 06:00 "busy" (Quyết đang dạy 1:1, nhóm 1:2 không vào)', at(nn, '2026-10-19|6') === 'busy', nn.coachAt);
    ok('… state gói 1:2 có khung ghép 09 · 11 · 15 · 17 · 19', JSON.stringify(duo(nn).duoHours) === '[9,11,15,17,19]', duo(nn).duoHours);
    r = await book(t, nn, [['2026-10-20', 11], ['2026-10-23', 11]]);
    ok('Ngọc Nam đặt T3 11:00 + T6 11:00 một mình → ok, mỗi khung 1 suất', r.ok && r.taken['2026-10-20|11'] === 1 && r.taken['2026-10-23|11'] === 1, r.error || r.why);
    const c1 = await login(t, 'cap mot', '0025');
    ok('K. Cặp Một (Quyết · 1:2) thấy T3 11:00 "join" + tên người đang chờ (Ngọc Nam)', at(c1, '2026-10-20|11') === 'join' && duo(c1).wait['2026-10-20|11'] === 'Ngọc Nam', [c1.coachAt, duo(c1).wait]);
    r = await book(t, c1, [['2026-10-20', 11], ['2026-10-21', 11]]);
    ok('… ghép vào T3 11:00 → ok, cặp vẫn 1 suất (2 người), thấy tên bạn tập', r.ok && r.taken['2026-10-20|11'] === 1 && rowsAt(t, '2026-10-20', 11).length === 2 && duo(r).pairs['2026-10-20|11'] === 'Ngọc Nam', r.error || r.why || duo(r));
    const c2 = await login(t, 'cap hai', '0026');
    ok('Cặp T3 11:00 đã đủ 2 → khách 1:2 thứ ba (K. Cặp Hai) thấy "busy", không có tên chờ', at(c2, '2026-10-20|11') === 'busy' && !duo(c2).wait['2026-10-20|11'], [c2.coachAt, duo(c2).wait]);
    r = await book(t, c2, [['2026-10-20', 11], ['2026-10-22', 11]]);
    ok('… chọn T3 11:00 → het_cho', fullOnly(r, '2026-10-20', 11), r);
    const mot2 = await boot(t, mot);
    ok('K. Thứ Một (1:1) thấy T6 11:00 "busy": Quyết có một khách 1:2 ở đó, khách 1:1 không ghép vào nhóm 1:2', at(mot2, '2026-10-23|11') === 'busy', mot2.coachAt);
    const linh = await login(t, 'my linh', '0003');
    ok('T. T. Mỹ Linh (1:2 · Mai) không ghép với nhóm của Quyết: T3 11:00 không "join", không thấy tên khách của Quyết', !at(linh, '2026-10-20|11') && !Object.keys(duo(linh).wait || {}).length, [linh.coachAt, duo(linh).wait]);
    r = await book(t, linh, [['2026-10-20', 11], ['2026-10-21', 11]]);
    ok('… đặt T3 11:00 → ok, phòng 2 suất (nhóm Quyết + Mai)', r.ok && r.taken['2026-10-20|11'] === 2, r.error || r.why);

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
    r = await change(t, mot2, ['2026-10-21', 8], ['2026-10-23', 11]);
    ok('K. Thứ Một (1:1) đổi T4 08:00 → T6 11:00 (Quyết có khách 1:2) → het_cho, không ghi', fullOnly(r, '2026-10-23', 11) && logRows(t).filter(x => x[16] === 'B921DY').length === 2, r);
    r = await change(t, nn2, ['2026-10-23', 11], ['2026-10-21', 11]);
    ok('Ngọc Nam (1:2) dời T6 11:00 (đang lẻ) → T4 11:00 (K. Cặp Một 1:2 đang một mình) → ok, ghép thành cặp, phòng T4 11:00 hai suất (cặp Quyết + Mai)',
       r.ok && r.taken['2026-10-21|11'] === 2 && r.taken['2026-10-23|11'] === 1 && duo(r).pairs['2026-10-21|11'] === 'Cặp Một', r.error || r.why || [r.taken, duo(r).pairs]);
    ok('… là "Ghép": không tính lượt đổi (còn 2), phiếu lên bản 2', r.ok && r.mine.changes === 0 && r.mine.changesLeft === 2 && r.mine.ver === 2, r.mine);
    const gh = rowsOf(t, 'B902DY').filter(x => x[4] === '2026-10-21' || x[4] === '2026-10-23');
    ok('… sổ: dòng mới "Ghép" + "Ghép từ T6 23.10 · 11:00", dòng cũ "Đã đổi" + "Ghép sang T4 21.10 · 11:00"',
       gh.some(x => x[11] === 'Đã đặt' && x[12] === 'Ghép' && x[13] === 'Ghép từ T6 23.10 · 11:00') && gh.some(x => x[11] === 'Đã đổi' && x[13] === 'Ghép sang T4 21.10 · 11:00'), gh.map(x => [x[4], x[11], x[12], x[13]]));
    const mot3 = await boot(t, mot2);
    ok('Quyết rời T6 11:00 → K. Thứ Một thấy T6 11:00 rảnh', !at(mot3, '2026-10-23|11'), mot3.coachAt);
    r = await change(t, mot3, ['2026-10-21', 8], ['2026-10-23', 11]);
    ok('… đổi T4 08:00 → T6 11:00 → ok', r.ok && r.mine.sessions.some(x => x.date === '2026-10-23' && x.h === 11), r.error || r.why);
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

  console.log('\n== 15. Ghép lớp 1:2: khung ghép · tên bạn tập · mời / từ chối · dời vào cặp không tính lượt đổi (chốt 18/10 14:13) ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'));
    const nn = await login(t, 'ngoc nam', '0002'), mot = await login(t, 'thu mot', '0021'), linh = await login(t, 'my linh', '0003');
    ok('Danh sách mời của Ngọc Nam = hai khách 1:2 khác của Quyết, xếp theo tên ngắn, chỉ id + tên (không Mã KH)',
       JSON.stringify((duo(nn).peers || []).map(p => p.short)) === '["K. Cặp Hai","K. Cặp Một"]' && duo(nn).peers.every(p => /^[A-Za-z0-9_-]{18}$/.test(p.id) && !('key' in p) && p.call) &&
       JSON.stringify(nn).indexOf('B925DY') < 0 && JSON.stringify(nn).indexOf('B926DY') < 0, duo(nn).peers);
    ok('Khách 1:1 không có danh sách / tên khách 1:2 nào', !('duo' in mot), Object.keys(mot));
    ok('Mỹ Linh (1:2 · Mai) không thấy khách 1:2 của Quyết trong danh sách mời', JSON.stringify(duo(linh).peers) === '[]', duo(linh).peers);
    let r = await book(t, nn, [['2026-10-19', 10], ['2026-10-20', 15]]);
    ok('Gói 1:2 chọn T2 10:00 (ngoài khung ghép) → gio_ghep, không ghi gì', r.error === 'khong_hop_le' && r.why === 'gio_ghep' && r.date === '2026-10-19' && r.h === 10 && !rowsOf(t, 'B902DY').length, r.why);
    r = await book(t, nn, [['2026-10-20', 15], ['2026-10-22', 15]]);
    ok('Ngọc Nam đặt T3 15:00 + T5 15:00 (một mình) → ok, chưa có cặp, chưa mời ai', r.ok && !Object.keys(duo(r).pairs).length && !Object.keys(duo(r).invOut).length, r.error || r.why || duo(r));
    const c1id = peer(r, 'K. Cặp Một'), c2id = peer(r, 'K. Cặp Hai');
    let c2 = await login(t, 'cap hai', '0026');
    ok('K. Cặp Hai thấy tên người đang chờ ghép ở T3 15:00 và T5 15:00, chưa có lời mời', duo(c2).wait['2026-10-20|15'] === 'Ngọc Nam' && duo(c2).wait['2026-10-22|15'] === 'Ngọc Nam' && inv(c2) === '[]', duo(c2));
    ok('… và chỉ khung còn tới: không hiện tên ở khung đã qua / của coach khác', Object.keys(duo(c2).wait).length === 2, duo(c2).wait);

    /* mời */
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    ok('Ngọc Nam mời K. Cặp Một vào T3 15:00 → ok, phiếu giữ bản 1, thấy "đã mời Cặp Một · chờ"', r.ok && r.mine.ver === 1 && JSON.stringify(duo(r).invOut['2026-10-20|15']) === '{"to":"Cặp Một","st":"wait"}', r.error || r.why || duo(r).invOut);
    let mv = rowsOf(t, 'B902DY', 'Mời');
    ok('… sổ: một dòng "Mời" ở T3 15:00, ghi chú "Mời K. Cặp Một · B925DY", không phải buổi tập', mv.length === 1 && mv[0][4] === '2026-10-20' && mv[0][6] === '15:00' && mv[0][12] === 'Mời' && mv[0][13] === 'Mời K. Cặp Một · B925DY', mv);
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    ok('… mời lại đúng người đang được mời → ok, không ghi thêm dòng', r.ok && rowsOf(t, 'B902DY', 'Mời').length === 1, rowsOf(t, 'B902DY', 'Mời').length);
    let c1 = await login(t, 'cap mot', '0025');
    ok('K. Cặp Một mở trang → thấy lời mời của Ngọc Nam ở T3 15:00', inv(c1) === '[{"date":"2026-10-20","h":15,"from":"Ngọc Nam"}]', duo(c1).invIn);
    c2 = await boot(t, c2);
    ok('K. Cặp Hai không thấy lời mời gửi người khác', inv(c2) === '[]', duo(c2).invIn);
    const f = await call(t, { action: 'lt_find', q: 'thu mot' }), motId = f.results && f.results[0] && f.results[0].id;
    r = await invite(t, nn, ['2026-10-20', 15], motId);
    ok('Mời khách 1:1 (K. Thứ Một, id lấy từ tìm tên) → khong_hop_le nguoi_moi', r.ok === false && r.error === 'khong_hop_le' && r.why === 'nguoi_moi', r.error || r.why);
    r = await invite(t, nn, ['2026-10-20', 15], 'khongcoaiCoIdNay123');
    ok('Mời id không tồn tại → khong_hop_le nguoi_moi', r.ok === false && r.why === 'nguoi_moi', r);
    r = await invite(t, nn, ['2026-10-21', 15], c1id);
    ok('Mời ở khung mình không có buổi → khong_co_buoi', r.ok === false && r.why === 'khong_co_buoi', r.why);
    r = await invite(t, nn, ['2026-10-20', 16], c1id);
    ok('Mời ở khung không phải khung ghép → khung', r.ok === false && r.why === 'khung', r.why);
    r = await invite(t, mot, ['2026-10-20', 15], c1id);
    ok('Khách 1:1 gửi lời mời → khong_hop_le goi', r.ok === false && r.why === 'goi', r.why);

    /* từ chối · mời lại · đổi người · huỷ */
    r = await decline(t, c1, ['2026-10-20', 15]);
    ok('K. Cặp Một bấm "Không, cảm ơn" → ok, lời mời biến mất', r.ok && inv(r) === '[]', r.error || r.why || duo(r).invIn);
    const dv = rowsOf(t, 'B925DY', 'Từ chối');
    ok('… sổ: dòng "Từ chối" của Cặp Một ở T3 15:00, ghi chú nhắc người mời + Mã KH của họ', dv.length === 1 && dv[0][4] === '2026-10-20' && dv[0][6] === '15:00' && dv[0][12] === 'Từ chối' && /^Từ chối lời mời của .\. Ngọc Nam · B902DY$/.test(dv[0][13]), dv);
    r = await decline(t, c1, ['2026-10-20', 15]);
    ok('… bấm lại → ok, không ghi thêm', r.ok && rowsOf(t, 'B925DY', 'Từ chối').length === 1);
    let nnb = await boot(t, nn);
    ok('Ngọc Nam thấy Cặp Một không tham gia (st "no") để mời người khác', JSON.stringify(duo(nnb).invOut['2026-10-20|15']) === '{"to":"Cặp Một","st":"no"}', duo(nnb).invOut);
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    c1 = await boot(t, c1);
    ok('Mời lại Cặp Một sau khi bị từ chối → ghi dòng mới, Cặp Một thấy lại lời mời', r.ok && rowsOf(t, 'B902DY', 'Mời').length === 2 && inv(c1).indexOf('"h":15') > 0, [rowsOf(t, 'B902DY', 'Mời').length, duo(c1).invIn]);
    r = await invite(t, nn, ['2026-10-20', 15], c2id);
    c1 = await boot(t, c1); c2 = await boot(t, c2);
    ok('Đổi sang mời Cặp Hai → Cặp Một hết thấy, Cặp Hai thấy lời mời', r.ok && duo(r).invOut['2026-10-20|15'].to === 'Cặp Hai' && inv(c1) === '[]' && inv(c2) === '[{"date":"2026-10-20","h":15,"from":"Ngọc Nam"}]', [duo(c1).invIn, duo(c2).invIn]);
    r = await invite(t, nn, ['2026-10-20', 15], '');
    c2 = await boot(t, c2);
    const hm = rowsOf(t, 'B902DY', 'Mời');
    ok('Huỷ lời mời → dòng "Huỷ mời", Cặp Hai hết thấy', r.ok && hm[hm.length - 1][13] === 'Huỷ mời' && inv(c2) === '[]' && !duo(r).invOut['2026-10-20|15'], [hm.map(x => x[13]), duo(c2).invIn]);
    r = await invite(t, nn, ['2026-10-20', 15], '');
    ok('… huỷ khi không còn mời ai → ok, không ghi thêm', r.ok && rowsOf(t, 'B902DY', 'Mời').length === hm.length);

    /* nhận lời bằng cách đặt */
    await invite(t, nn, ['2026-10-20', 15], c2id);
    c2 = await boot(t, c2);
    r = await book(t, c2, [['2026-10-20', 15], ['2026-10-21', 17]]);
    ok('Cặp Hai nhận lời: đặt T3 15:00 + T4 17:00 → ok, thấy tập đôi cùng Ngọc Nam, lời mời tự hết', r.ok && duo(r).pairs['2026-10-20|15'] === 'Ngọc Nam' && inv(r) === '[]', r.error || r.why || duo(r));
    nnb = await boot(t, nn);
    ok('Ngọc Nam thấy tập đôi cùng Cặp Hai ở T3 15:00, không còn "đã mời"', duo(nnb).pairs['2026-10-20|15'] === 'Cặp Hai' && !duo(nnb).invOut['2026-10-20|15'], duo(nnb));
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    ok('Mời ở buổi đã có cặp → da_ghep', r.ok === false && r.error === 'da_ghep', r.error);

    /* dời buổi đang lẻ vào cặp: trong cùng ngày, không tính lượt đổi, kể cả khi đã hết lượt */
    r = await book(t, c1, [['2026-10-22', 17], ['2026-10-23', 17]]);
    ok('Cặp Một đặt T5 17:00 + T6 17:00 (một mình) → ok', r.ok, r.error || r.why);
    ok('… thấy Ngọc Nam đang chờ ở T5 15:00 (cùng ngày)', duo(r).wait['2026-10-22|15'] === 'Ngọc Nam', duo(r).wait);
    c1 = Object.assign(r, { tok: c1.tok });
    r = await change(t, c1, ['2026-10-22', 17], ['2026-10-22', 15]);
    ok('Cặp Một dời T5 17:00 → T5 15:00 (cùng ngày, vào cặp với Ngọc Nam) → ok, "Ghép", còn 2 lượt đổi', r.ok && r.mine.changesLeft === 2 && duo(r).pairs['2026-10-22|15'] === 'Ngọc Nam' && rowsOf(t, 'B925DY').some(x => x[12] === 'Ghép' && x[13] === 'Ghép từ T5 22.10 · 17:00'), r.error || r.why || r.mine);
    r = await change(t, c1, ['2026-10-23', 17], ['2026-10-19', 17]);
    ok('Cặp Một đổi thường T6 17:00 → T2 17:00 (khung trống) → "Đổi", còn 1 lượt', r.ok && r.mine.changesLeft === 1, r.error || r.why);
    r = await change(t, c1, ['2026-10-19', 17], ['2026-10-19', 19]);
    ok('… đổi thường trong cùng ngày (T2 17:00 → T2 19:00, không phải vào cặp) → cung_ngay', r.ok === false && r.why === 'cung_ngay', r.why);
    r = await change(t, c1, ['2026-10-19', 17], ['2026-10-21', 19]);
    ok('… đổi thường T2 17:00 → T4 19:00 → ok, hết lượt đổi', r.ok && r.mine.changesLeft === 0, r.error || r.why);
    r = await change(t, c1, ['2026-10-21', 19], ['2026-10-19', 19]);
    ok('Hết lượt: đổi thường T4 19:00 → T2 19:00 → het_luot_doi', r.ok === false && r.error === 'het_luot_doi', r.error);
    r = await change(t, c1, ['2026-10-21', 19], ['2026-10-21', 10]);
    ok('Hết lượt: dời vào khung ngoài khung ghép (không thể là cặp) → het_luot_doi', r.ok === false && r.error === 'het_luot_doi', r.error || r.why);
    r = await change(t, c1, ['2026-10-21', 19], ['2026-10-21', 17]);
    ok('Hết lượt vẫn dời được buổi đang lẻ vào cặp: T4 19:00 → T4 17:00 (Cặp Hai đang chờ) → ok, vẫn 0 lượt, thấy tập đôi cùng Cặp Hai',
       r.ok && r.mine.changesLeft === 0 && r.mine.changes === 2 && duo(r).pairs['2026-10-21|17'] === 'Cặp Hai', r.error || r.why || r.mine);
    /* rời một cặp để vào cặp khác: tính lượt đổi như thường */
    c2 = await boot(t, c2);
    r = await change(t, c2, ['2026-10-20', 15], ['2026-10-19', 15]);
    ok('Cặp Hai rời cặp T3 15:00 sang T2 15:00 (trống) → "Đổi", còn 1 lượt', r.ok && r.mine.changesLeft === 1 && !rowsOf(t, 'B926DY').some(x => x[12] === 'Ghép'), r.error || r.why);
    const c2x = r;
    nnb = await boot(t, nn);
    ok('… Ngọc Nam ở T3 15:00 thành lẻ (không còn tên bạn), Cặp Hai đang chờ ở T2 15:00', !duo(nnb).pairs['2026-10-20|15'] && duo(nnb).wait['2026-10-19|15'] === 'Cặp Hai', duo(nnb));
    ok('… lời mời Ngọc Nam gửi Cặp Hai ở T3 15:00 đã xong (Cặp Hai đã vào rồi rời đi): Ngọc Nam không còn "đã mời", Cặp Hai không thấy lại lời mời',
       !duo(nnb).invOut['2026-10-20|15'] && inv(c2x).indexOf('"date":"2026-10-20"') < 0, [duo(nnb).invOut, duo(c2x).invIn]);
    r = await decline(t, c2, ['2026-10-20', 15]);
    ok('… Cặp Hai bấm "Không, cảm ơn" với lời mời đã xong → ok, không ghi dòng "Từ chối"', r.ok && !rowsOf(t, 'B926DY', 'Từ chối').length, rowsOf(t, 'B926DY', 'Từ chối').length);
    r = await invite(t, nn, ['2026-10-20', 15], c2id);
    c2 = await boot(t, c2);
    ok('… Ngọc Nam mời lại Cặp Hai → dòng "Mời" mới, "đã mời Cặp Hai · chờ", Cặp Hai thấy lại lời mời',
       r.ok && JSON.stringify(duo(r).invOut['2026-10-20|15']) === '{"to":"Cặp Hai","st":"wait"}' && inv(c2).indexOf('{"date":"2026-10-20","h":15,"from":"Ngọc Nam"}') >= 0, [duo(r).invOut, duo(c2).invIn]);
    r = await change(t, nnb, ['2026-10-22', 15], ['2026-10-19', 15]);
    ok('Ngọc Nam dời buổi ĐANG TẬP ĐÔI (T5 15:00 cùng Cặp Một) vào cặp chờ T2 15:00 → "Đổi" (tính lượt), không phải "Ghép"', r.ok && r.mine.changesLeft === 1 && duo(r).pairs['2026-10-19|15'] === 'Cặp Hai' &&
       rowsOf(t, 'B902DY').filter(x => x[12] === 'Đổi').length === 1, r.error || r.why || r.mine);
  }

  console.log('\n== 16. Lời mời cũ không sống lại · dưới 12 giờ · giới hạn số lần mời ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'));
    const nn = await login(t, 'ngoc nam', '0002');
    let r = await book(t, nn, [['2026-10-20', 15], ['2026-10-22', 15]]);
    const c1id = peer(r, 'K. Cặp Một'), c2id = peer(r, 'K. Cặp Hai');
    let c1 = await login(t, 'cap mot', '0025');
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    c1 = await boot(t, c1);
    ok('Ngọc Nam mời Cặp Một ở T3 15:00 → Cặp Một thấy lời mời', r.ok && inv(c1).indexOf('"h":15') > 0, duo(c1).invIn);
    r = await change(t, nn, ['2026-10-20', 15], ['2026-10-21', 15]);
    c1 = await boot(t, c1);
    ok('Ngọc Nam dời khỏi T3 15:00 → lời mời hết hiệu lực', r.ok && inv(c1) === '[]', duo(c1).invIn);
    r = await change(t, nn, ['2026-10-21', 15], ['2026-10-20', 15]);
    c1 = await boot(t, c1);
    ok('… dời về lại T3 15:00 → lời mời cũ KHÔNG sống lại (ghi trước lượt đặt hiện tại)', r.ok && inv(c1) === '[]' && !duo(r).invOut['2026-10-20|15'], [duo(c1).invIn, duo(r).invOut]);
    r = await invite(t, nn, ['2026-10-20', 15], c1id);
    c1 = await boot(t, c1);
    ok('… mời lại → Cặp Một thấy lời mời mới', r.ok && inv(c1).indexOf('"h":15') > 0, duo(c1).invIn);
    /* giới hạn: 20 dòng mời + từ chối / hội viên / tuần — đổi qua lại hai người cho tới đủ 20 dòng, lần sau bị chặn */
    let n = rowsOf(t, 'B902DY', 'Mời').length;
    for (let i = 0; n < 20 && i < 40; i++) { await invite(t, nn, ['2026-10-22', 15], i % 2 ? c1id : c2id); n = rowsOf(t, 'B902DY', 'Mời').length; }
    const lastNote = rowsOf(t, 'B902DY', 'Mời').slice(-1)[0][13];
    r = await invite(t, nn, ['2026-10-22', 15], lastNote.indexOf('B925DY') > 0 ? c2id : c1id);
    ok('Mời / đổi người tới 20 lần trong tuần → lần sau qua_luot_moi, không ghi thêm', n === 20 && r.ok === false && r.error === 'qua_luot_moi' && rowsOf(t, 'B902DY', 'Mời').length === 20, [n, r.error]);
    /* dưới 12 giờ (đặt muộn) */
    const t2 = await setup(vn('2026-10-19', '10:00'));
    const nn2 = await login(t2, 'ngoc nam', '0002');
    r = await book(t2, nn2, [['2026-10-20', 11], ['2026-10-21', 9]]);
    ok('T2 10:00 đặt muộn T3 11:00 + T4 09:00 → ok', r.ok, r.error || r.why);
    const c1id2 = peer(r, 'K. Cặp Một');
    t2.clock.now = vn('2026-10-19', '12:00');
    r = await invite(t2, nn2, ['2026-10-20', 11], c1id2);
    ok('T2 12:00 mời vào T3 11:00 (còn 23 giờ, luật cũ 24 giờ chặn) → ok', r.ok, r.error || r.why);
    t2.clock.now = vn('2026-10-19', '23:30');
    r = await invite(t2, nn2, ['2026-10-20', 11], c1id2);
    ok('T2 23:30 mời ở T3 11:00 (còn 11 giờ 30) → duoi_12h', r.ok === false && r.why === 'duoi_12h', r.why);
  }

  console.log('\n== 17. Khách tập thử đã có coach tiếp nhận chiếm suất của coach đó (chốt 18/10) ==');
  {
    const tr = (no, date, hh, st, coach) => ['', no, date, hh, 'Khách Thử ' + no, '09111111' + no, '', st, coach];
    const t = await setup(vn('2026-10-18', '07:00'), { trials: [
      tr('11', '2026-10-21', '20:00', 'Chờ xác nhận', 'Quyết Hán'),
      tr('12', '2026-10-22', '09:00', 'Chờ xác nhận', 'quyet han (giai đoạn 2)'),
      tr('13', '2026-10-23', '07:00', 'Đã hủy', 'Quyết Hán'),
      tr('14', '2026-10-23', '06:00', 'Chờ xác nhận', '')
    ] });
    let nam = await login(t, 'duc nam', '0001');
    ok('H. Đức Nam (Quyết · 1:1) thấy T4 20:00 "busy" — Quyết nhận khách tập thử, phòng 1 suất', at(nam, '2026-10-21|20') === 'busy' && nam.taken['2026-10-21|20'] === 1, [nam.coachAt, nam.taken]);
    ok('… dòng tập thử đã huỷ (T6 07:00) không chiếm gì', !at(nam, '2026-10-23|7') && !nam.taken['2026-10-23|7'], [nam.coachAt, nam.taken]);
    ok('… tập thử chưa giao coach (T6 06:00): một suất riêng như trước, không làm coach nào bận', !at(nam, '2026-10-23|6') && nam.taken['2026-10-23|6'] === 1, [nam.coachAt, nam.taken]);
    let r = await book(t, nam, [['2026-10-21', 20], ['2026-10-23', 20]]);
    ok('… chọn T4 20:00 + T6 20:00 → het_cho chỉ ra T4 20:00, không ghi dòng nào', fullOnly(r, '2026-10-21', 20) && rowsOf(t, 'B901DY').length === 0, r);
    r = await book(t, nam, [['2026-10-20', 20], ['2026-10-23', 20]]);
    ok('… đặt T3 20:00 + T6 20:00 → ok', r.ok, r.error || r.why);
    nam = await boot(t, nam);
    r = await change(t, nam, ['2026-10-20', 20], ['2026-10-21', 20]);
    ok('… đổi T3 20:00 → T4 20:00 (giờ tập thử của Quyết) → het_cho, không ghi thêm dòng', fullOnly(r, '2026-10-21', 20) && rowsOf(t, 'B901DY').length === 2, r);
    const hai = await login(t, 'thu hai', '0022');
    ok('K. Thứ Hai (coach Mai) không bị chặn ở T4 20:00', !at(hai, '2026-10-21|20'), hai.coachAt);
    r = await book(t, hai, [['2026-10-21', 20], ['2026-10-22', 20]]);
    ok('… đặt T4 20:00 → ok, phòng 2 suất (tập thử của Quyết + Mai)', r.ok && r.taken['2026-10-21|20'] === 2, r.error || r.why);
    r = await book(t, await login(t, 'thu ba', '0023'), [['2026-10-21', 20], ['2026-10-23', 10]]);
    ok('K. Thứ Ba (Khải) đặt T4 20:00 → ok, 3 suất', r.ok && r.taken['2026-10-21|20'] === 3, r.error || r.why);
    r = await book(t, await login(t, 'thu tu', '0024'), [['2026-10-21', 20], ['2026-10-23', 11]]);
    ok('K. Thứ Tư (Lâm) đặt T4 20:00 → ok, 4 suất = đầy (khách tập thử tính đúng một suất)', r.ok && r.taken['2026-10-21|20'] === 4, r.error || r.why);
    const nn = await login(t, 'ngoc nam', '0002');
    ok('Ngọc Nam (Quyết · 1:2) thấy T5 09:00 "busy" (coach ghi chữ thường + hậu tố vẫn là Quyết), không có ai "chờ ghép" ở đó', at(nn, '2026-10-22|9') === 'busy' && !duo(nn).wait['2026-10-22|9'], [nn.coachAt, duo(nn).wait]);
    ok('… state không mang gì của khách tập thử', JSON.stringify(nn).indexOf('Thử 1') < 0 && JSON.stringify(nn).indexOf('09111111') < 0);
    r = await book(t, nn, [['2026-10-22', 9], ['2026-10-23', 9]]);
    ok('… chọn T5 09:00 + T6 09:00 → het_cho chỉ ra T5 09:00 (khách tập thử không phải bạn ghép)', fullOnly(r, '2026-10-22', 9), r);
    r = await decline(t, nn, ['2026-10-22', 9]);
    ok('… "Từ chối" ở T5 09:00 → không có lời mời nào, không ghi', r.ok && rowsOf(t, 'B902DY', 'Từ chối').length === 0, r);
  }

  console.log('\n== 18. Lịch nhận khách của coach (tab "Lịch coach") · Chủ Nhật đặt được (chốt 19/10) ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'), { sched: SCHED });
    let nam = await login(t, 'duc nam', '0001');
    ok('H. Đức Nam (Quyết): T3 cả ngày "off", T4 06:00 "off", T4 07:00 nhận', at(nam, '2026-10-20|6') === 'off' && at(nam, '2026-10-20|18') === 'off' &&
       at(nam, '2026-10-21|6') === 'off' && !at(nam, '2026-10-21|7'), nam.coachAt);
    ok('… tuần T2 → CN 25.10; Quyết nhận CN 08–11, ngoài giờ đó "off"', nam.week.days.length === 7 && nam.week.days[6] === '2026-10-25' &&
       at(nam, '2026-10-25|6') === 'off' && !at(nam, '2026-10-25|8') && !at(nam, '2026-10-25|11') && at(nam, '2026-10-25|14') === 'off', [nam.week.days, nam.coachAt]);
    let r = await book(t, nam, [['2026-10-20', 18], ['2026-10-22', 18]]);
    ok('… chọn T3 18:00 (coach nghỉ) → khong_hop_le · coach_nghi, không ghi dòng nào', r.ok === false && r.error === 'khong_hop_le' && r.why === 'coach_nghi' && rowsOf(t, 'B901DY').length === 0, r);
    r = await book(t, nam, [['2026-10-19', 18], ['2026-10-25', 9]]);
    ok('… đặt T2 18:00 + CN 09:00 → ok, dòng sổ CN 25.10 ghi thứ "CN"', r.ok && rowsAt(t, '2026-10-25', 9).length === 1 && rowsAt(t, '2026-10-25', 9)[0][5] === 'CN', r.error || r.why);
    nam = await boot(t, nam);
    r = await change(t, nam, ['2026-10-19', 18], ['2026-10-20', 19]);
    ok('… đổi T2 18:00 → T3 19:00 (coach nghỉ) → coach_nghi, không ghi thêm dòng', r.ok === false && r.why === 'coach_nghi' && rowsOf(t, 'B901DY').length === 2, r);
    r = await change(t, nam, ['2026-10-19', 18], ['2026-10-21', 7]);
    ok('… đổi T2 18:00 → T4 07:00 → ok, còn 1 lượt đổi', r.ok && r.mine.changesLeft === 1, r.error || r.why);
    const hai = await login(t, 'thu hai', '0022');
    ok('K. Thứ Hai (Mai · lưới "Hiền Mai (giai đoạn 1)", ô giờ là giá trị giờ): sáng "off", chiều nhận, CN cả ngày "off"',
       at(hai, '2026-10-19|6') === 'off' && at(hai, '2026-10-19|11') === 'off' && !at(hai, '2026-10-19|14') && at(hai, '2026-10-25|14') === 'off', hai.coachAt);
    r = await book(t, hai, [['2026-10-19', 6], ['2026-10-20', 14]]);
    ok('… chọn T2 06:00 → coach_nghi', r.ok === false && r.why === 'coach_nghi', r);
    const ba = await login(t, 'thu ba', '0023');
    ok('K. Thứ Ba (Khải · không có lưới hợp lệ — hàng tiêu đề thiếu thứ): T2–T7 nhận đủ, CN "off" như trước khi có tab',
       !at(ba, '2026-10-20|6') && !at(ba, '2026-10-24|20') && at(ba, '2026-10-25|8') === 'off', ba.coachAt);
    r = await book(t, ba, [['2026-10-25', 8], ['2026-10-20', 6]]);
    ok('… chọn CN 08:00 → coach_nghi', r.ok === false && r.why === 'coach_nghi', r);
    const nn = await login(t, 'ngoc nam', '0002');
    ok('Ngọc Nam (Quyết · 1:2): CN 11:00 là khung ghép coach nhận, T3 09:00 "off"', !at(nn, '2026-10-25|11') && at(nn, '2026-10-20|9') === 'off', nn.coachAt);
    r = await book(t, nn, [['2026-10-25', 11], ['2026-10-22', 9]]);
    ok('… đặt CN 11:00 + T5 09:00 → ok', r.ok && rowsAt(t, '2026-10-25', 11).length === 1, r.error || r.why);
  }

  console.log('\n== 19. Báo trước: đặt mới / thêm buổi / khung mới ≥ 12 giờ · buổi đang có muốn đổi ≥ 24 giờ (chốt 22/10, khớp hợp đồng) ==');
  {
    const t = await setup(vn('2026-10-18', '07:00'));
    let nam = await login(t, 'duc nam', '0001');
    let r = await book(t, nam, [['2026-10-19', 18], ['2026-10-22', 18], ['2026-10-23', 18]]);
    ok('CN 07:00 đặt T2 18:00 · T5 18:00 · T6 18:00 → ok', r.ok, r.error || r.why);
    t.clock.now = vn('2026-10-20', '20:00');
    nam = await boot(t, nam);
    ok('T3 20:00: còn thêm được 1 buổi', nam.limits.add === 1, nam.limits);
    r = await book(t, nam, [['2026-10-21', 7]]);
    ok('Thêm T4 07:00 (11 giờ nữa) → duoi_12h, kèm đúng khung, không ghi', r.ok === false && r.why === 'duoi_12h' && r.date === '2026-10-21' && r.h === 7 && rowsOf(t, 'B901DY').length === 3, [r.why, r.date, r.h]);
    r = await change(t, nam, ['2026-10-23', 18], ['2026-10-21', 10]);
    ok('Đổi T6 18:00 (46 giờ) → T4 10:00 (14 giờ — luật cũ 24 giờ chặn) → ok, còn 1 lượt', r.ok && r.mine.changesLeft === 1 && r.mine.sessions.some(x => x.date === '2026-10-21' && x.h === 10), r.error || r.why);
    r = await change(t, nam, ['2026-10-21', 10], ['2026-10-23', 9]);
    ok('Đổi T4 10:00 (còn 14 giờ) → buoi_duoi_24h dù khung mới hợp lệ, không ghi', r.ok === false && r.why === 'buoi_duoi_24h' && rowsOf(t, 'B901DY').length === 4, [r.ok, r.why]);
    t.clock.now = vn('2026-10-21', '18:00');
    r = await change(t, nam, ['2026-10-22', 18], ['2026-10-23', 9]);
    ok('T4 18:00 đổi T5 18:00 (đúng 24 giờ) → T6 09:00 → ok, hết lượt', r.ok && r.mine.changesLeft === 0, r.error || r.why);
    r = await book(t, nam, [['2026-10-22', 6]]);
    ok('Thêm T5 06:00 (đúng 12 giờ) → ok, đủ 4 buổi', r.ok && r.mine.sessions.length === 4, r.error || r.why);
  }
  {
    /* ngày mở lịch (CN sau 06:00, phase open): lượt đặt cho tuần mới không áp dụng 12 giờ; đổi lịch vẫn theo 24 / 12 giờ */
    const t = await setup(vn('2026-10-18', '20:00'));
    const nam = await login(t, 'duc nam', '0001');
    ok('CN 20:00 → phase open, không cần báo trước', nam.week.phase === 'open' && nam.week.lead === false, nam.week);
    let r = await book(t, nam, [['2026-10-20', 6], ['2026-10-21', 18]]);
    ok('Đặt T3 06:00 + T4 18:00 trong ngày mở lịch → ok', r.ok, r.error || r.why);
    r = await change(t, nam, ['2026-10-21', 18], ['2026-10-19', 7]);
    ok('Đổi T4 18:00 sang T2 07:00 (11 giờ — khung mới theo 12 giờ, kể cả ngày mở lịch) → duoi_12h, không ghi', r.ok === false && r.why === 'duoi_12h' && rowsOf(t, 'B901DY').length === 2, r.why);
    r = await book(t, nam, [['2026-10-19', 6]]);
    ok('Thêm T2 06:00 (10 giờ nữa) trong ngày mở lịch → ok (không áp dụng 12 giờ)', r.ok, r.error || r.why);
    r = await change(t, nam, ['2026-10-19', 6], ['2026-10-22', 9]);
    ok('Đổi T2 06:00 (còn 10 giờ) → buoi_duoi_24h', r.ok === false && r.why === 'buoi_duoi_24h', r.why);
  }
  {
    /* màn công khai: "còn khung đặt được" xét lịch nhận khách của coach — tối T7, khung CN của tuần đang chạy còn ≥ 12 giờ */
    let t = await setup(vn('2026-10-17', '22:40'), { sched: SCHED });
    let r = await call(t, { action: 'lt_boot' });
    ok('T7 17.10 22:40, Quyết nhận CN 08–11 → open=true (CN 11:00 còn 12 giờ 20)', r.ok && r.auth === false && r.open === true, r.open);
    const nam = await login(t, 'duc nam', '0001');
    ok('… H. Đức Nam (Quyết) → đặt được 1 buổi CN 18.10 (10:40 / 11:00)', nam.mode === 'book' && nam.limits.max === 1, [nam.mode, nam.limits]);
    const ba = await login(t, 'thu ba', '0023');
    ok('… K. Thứ Ba (Khải, CN nghỉ) → mode closed', ba.mode === 'closed' && ba.limits.max === 0, [ba.mode, ba.limits]);
    t.clock.now = vn('2026-10-17', '23:01');
    r = await call(t, { action: 'lt_boot' });
    ok('T7 23:01 → CN 11:00 chỉ còn 11 giờ 59 → open=false (đếm tới 06:00 CN)', r.ok && r.auth === false && r.open === false, r.open);
    t = await setup(vn('2026-10-17', '22:40'));
    r = await call(t, { action: 'lt_boot' });
    ok('Không có Lịch coach (mọi coach CN nghỉ) → T7 22:40 open=false dù CN còn ≥ 12 giờ', r.ok && r.open === false, r.open);
  }
  {
    /* CN 00:00–05:59 (phase 'before'): tuần đang chạy đóng đặt dù khung chiều CN còn ≥ 12 giờ — trang hiện đếm ngược tới 06:00 */
    const ALL = [['', '— LỊCH COACH'], []].concat(grid('Quyết Hán', () => true));
    const t = await setup(vn('2026-10-17', '22:00'), { sched: ALL });
    let nam = await login(t, 'duc nam', '0001');
    const b42 = (s, d, hh) => call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W42', picks: [{ date: d, h: hh }] });
    let r = await b42(nam, '2026-10-18', 17);
    ok('T7 22:00, Quyết nhận CN cả ngày → đặt CN 18.10 17:00 (19 giờ nữa) → ok', r.ok, r.error || r.why);
    t.clock.now = vn('2026-10-18', '02:00');
    r = await call(t, { action: 'lt_boot' });
    ok('CN 02:00 (phase before) → open=false dù CN 17:00–20:00 còn ≥ 12 giờ', r.ok && r.week.phase === 'before' && r.open === false, [r.week && r.week.phase, r.open]);
    const mot = await login(t, 'thu mot', '0021');
    ok('… K. Thứ Một (Quyết, chưa đặt) → mode closed', mot.mode === 'closed' && mot.limits.max === 0, [mot.mode, mot.limits]);
    r = await b42(mot, '2026-10-18', 19);
    ok('… đặt CN 19:00 → khong_hop_le · dong_dat, không ghi', r.ok === false && r.why === 'dong_dat' && rowsOf(t, 'B921DY').length === 0, r.why);
    nam = await boot(t, nam);
    ok('… H. Đức Nam vẫn thấy phiếu (buổi CN 17:00), không thêm được', nam.mode === 'ticket' && nam.limits.add === 0, [nam.mode, nam.limits]);
  }

  console.log('\n== 20. Ca 12:00 (nghỉ trưa còn 13:00–14:00) · gói thấp điểm chỉ đặt 09:00–15:00 (chốt 31/10) ==');
  /* hội viên bịa thêm: [số, họ tên, coach, SĐT, Mã KH, loại, khung giờ] — cột "Khung giờ" của MEMBERS */
  const OFFM = [['931', 'Khách Thấp Điểm', 'Bích Ngọc', '0900000031', 'B931DY', '1:1', 'Thấp điểm'],
                ['932', 'Khách Chữ Thường', 'Khải Phan', '0900000032', 'B932DY', '1:1', '  thấp   ĐIỂM '],
                ['933', 'Khách Toàn Thời', 'Lâm Nguyễn', '0900000033', 'B933DY', '1:1', 'Toàn thời gian'],
                ['934', 'Khách Đôi Thấp', 'Quyết Hán', '0900000034', 'B934DY', '1:2', 'Thấp điểm'],
                ['935', 'Khách Gõ Sai', 'Hiền Mai', '0900000035', 'B935DY', '1:1', 'Thấp điểm 9-15']];
  const OFF_H = '[9,10,11,12,14]';
  {
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFFM });
    /* A · ca 12:00 */
    const nam = await login(t, 'duc nam', '0001');
    ok('Khung giờ trả cho trang có 12:00, không có 13:00 (14 khung)', JSON.stringify(nam.slots) === '[6,7,8,9,10,11,12,14,15,16,17,18,19,20]', nam.slots);
    ok('Ô "Khung giờ" trống → toàn thời gian: không có offpeak', !('offpeak' in nam), Object.keys(nam));
    let r = await book(t, nam, [['2026-10-19', 12], ['2026-10-21', 12]]);
    ok('H. Đức Nam đặt T2 12:00 + T4 12:00 → ok, sổ ghi giờ "12:00"', r.ok && rowsAt(t, '2026-10-19', 12).length === 1 && rowsAt(t, '2026-10-21', 12).length === 1, r.error || r.why);
    const mot = await login(t, 'thu mot', '0021');
    ok('K. Thứ Một (cùng coach Quyết) thấy T2 12:00 "busy" — ca 12:00 tính suất coach như mọi khung', at(mot, '2026-10-19|12') === 'busy' && mot.taken['2026-10-19|12'] === 1, [at(mot, '2026-10-19|12'), mot.taken['2026-10-19|12']]);
    r = await book(t, mot, [['2026-10-20', 13], ['2026-10-22', 18]]);
    ok('Khung 13:00 (nghỉ trưa) vẫn không đặt được → khung', r.ok === false && r.why === 'khung', r.why);

    /* B · gói thấp điểm 1:1 */
    const td = await login(t, 'thap diem', '0031');
    ok('K. Thấp Điểm ("Thấp điểm") → state có offpeak.hours = 09 · 10 · 11 · 12 · 14', td.offpeak && JSON.stringify(td.offpeak.hours) === OFF_H, td.offpeak);
    ok('… giờ ngoài gói không nằm trong coachAt (trang tự ẩn hàng theo offpeak.hours) — chỉ có CN "off" (Ngọc mặc định nghỉ CN)', Object.keys(td.coachAt || {}).every(k => k.indexOf('2026-10-25|') === 0 && td.coachAt[k] === 'off'), td.coachAt);
    ok('… mode book, tối thiểu 2 / tối đa 4 (6 ngày T2–T7 đều có khung trong gói)', td.mode === 'book' && td.limits.min === 2 && td.limits.max === 4, [td.mode, td.limits]);
    r = await book(t, td, [['2026-10-19', 15], ['2026-10-20', 9]]);
    ok('… chọn T2 15:00 (ngoài 09:00–15:00) → khong_hop_le · thap_diem, chỉ ra đúng khung', r.ok === false && r.why === 'thap_diem' && r.date === '2026-10-19' && r.h === 15, r);
    r = await book(t, td, [['2026-10-19', 8], ['2026-10-20', 9]]);
    ok('… T2 08:00 (trước 09:00) → thap_diem', r.ok === false && r.why === 'thap_diem' && r.h === 8, r);
    ok('… không ghi dòng nào', rowsOf(t, 'B931DY').length === 0);
    r = await book(t, td, [['2026-10-19', 9], ['2026-10-21', 14], ['2026-10-23', 12]]);
    ok('… T2 09:00 + T4 14:00 (buổi cuối 14:00–15:00) + T6 12:00 → ok', r.ok && rowsOf(t, 'B931DY', 'Đã đặt').length === 3, r.error || r.why);
    r = await change(t, td, ['2026-10-21', 14], ['2026-10-22', 17]);
    ok('… đổi T4 14:00 → T5 17:00 → thap_diem, không ghi', r.ok === false && r.why === 'thap_diem' && rowsOf(t, 'B931DY', 'Đã đặt').length === 3, r.why);
    r = await change(t, td, ['2026-10-21', 14], ['2026-10-22', 10]);
    ok('… đổi T4 14:00 → T5 10:00 → ok (còn 1 lượt)', r.ok && r.mine.changesLeft === 1, r.error || r.why);
    const ct = await login(t, 'chu thuong', '0032');
    ok('"  thấp   ĐIỂM " (hoa thường, khoảng trắng thừa) → vẫn là gói thấp điểm', ct.offpeak && JSON.stringify(ct.offpeak.hours) === OFF_H, ct.offpeak);
    const tt = await login(t, 'toan thoi', '0033');
    ok('"Toàn thời gian" → không có offpeak', !('offpeak' in tt), Object.keys(tt));
    r = await book(t, tt, [['2026-10-19', 6], ['2026-10-20', 20]]);
    ok('… đặt T2 06:00 + T3 20:00 → ok', r.ok, r.error || r.why);
    const gs = await login(t, 'go sai', '0035');
    ok('Giá trị lạ ("Thấp điểm 9-15") → toàn thời gian (chỉ đúng "Thấp điểm" mới giới hạn)', !('offpeak' in gs), gs.offpeak);

    /* C · gói 1:2 thấp điểm: khung ghép ∩ 09:00–15:00 = 09 · 11 */
    const dt = await login(t, 'doi thap', '0034');
    ok('K. Đôi Thấp (Quyết · 1:2 · thấp điểm) → duo.duoHours đủ 5 khung ghép + offpeak.hours', JSON.stringify(duo(dt).duoHours) === '[9,11,15,17,19]' && dt.offpeak && JSON.stringify(dt.offpeak.hours) === OFF_H, [duo(dt).duoHours, dt.offpeak]);
    r = await book(t, dt, [['2026-10-19', 15], ['2026-10-20', 9]]);
    ok('… T2 15:00 (khung ghép nhưng ngoài gói thấp điểm) → thap_diem', r.ok === false && r.why === 'thap_diem' && r.h === 15, r);
    r = await book(t, dt, [['2026-10-19', 10], ['2026-10-20', 9]]);
    ok('… T2 10:00 (trong gói nhưng không phải khung ghép) → gio_ghep', r.ok === false && r.why === 'gio_ghep' && r.h === 10, r);
    const nn = await login(t, 'ngoc nam', '0002');
    r = await book(t, nn, [['2026-10-22', 15], ['2026-10-23', 9]]);
    ok('Ngọc Nam (Quyết · 1:2 · toàn thời gian) đặt T5 15:00 + T6 09:00, đều một mình → ok', r.ok, r.error || r.why);
    const pDT = (duo(r).peers || []).find(x => x.short === 'K. Đôi Thấp'), pC1 = (duo(r).peers || []).find(x => x.short === 'K. Cặp Một');
    ok('… danh sách mời: K. Đôi Thấp mang khung giờ gói (hours), K. Cặp Một không — không lộ Mã KH', pDT && JSON.stringify(pDT.hours) === OFF_H && pC1 && !('hours' in pC1) && !('key' in pDT) && !!pDT.id, [pDT, pC1]);
    const dt2 = await boot(t, dt);
    ok('K. Đôi Thấp không thấy chờ ghép ở T5 15:00 (ngoài gói), thấy ở T6 09:00', !duo(dt2).wait['2026-10-22|15'] && duo(dt2).wait['2026-10-23|9'] === 'Ngọc Nam', duo(dt2).wait);
    const c1 = await login(t, 'cap mot', '0025');
    ok('K. Cặp Một (toàn thời gian) thấy cả hai khung chờ ghép', duo(c1).wait['2026-10-22|15'] === 'Ngọc Nam' && duo(c1).wait['2026-10-23|9'] === 'Ngọc Nam', duo(c1).wait);
    r = await invite(t, nn, ['2026-10-22', 15], pDT.id);
    ok('Ngọc Nam mời K. Đôi Thấp vào T5 15:00 (ngoài gói của bạn ấy) → khong_hop_le · nguoi_moi, không ghi dòng Mời', r.ok === false && r.why === 'nguoi_moi' && rowsOf(t, 'B902DY', 'Mời').length === 0, r);
    r = await invite(t, nn, ['2026-10-23', 9], pDT.id);
    ok('… mời vào T6 09:00 (trong gói) → ok, một dòng Mời', r.ok && rowsOf(t, 'B902DY', 'Mời').length === 1, r.error || r.why);
    const dt3 = await boot(t, dt);
    ok('K. Đôi Thấp thấy lời mời T6 09:00', JSON.stringify(duo(dt3).invIn) === JSON.stringify([{ date: '2026-10-23', h: 9, from: 'Ngọc Nam' }]), duo(dt3).invIn);
    r = await book(t, dt, [['2026-10-23', 9], ['2026-10-20', 11]]);
    ok('… nhận: đặt T6 09:00 (vào nhóm) + T3 11:00 → ok, tập đôi cùng Ngọc Nam', r.ok && duo(r).pairs['2026-10-23|9'] === 'Ngọc Nam', r.error || r.why || duo(r));
  }
  {
    /* D · Lịch coach: lưới cũ chưa có hàng 12:00 → coach không nhận 12:00 (Coach nghỉ) cho tới khi thêm hàng · lưới có 12:00 bỏ tick */
    const SC = [['', '— LỊCH COACH'], []]
      .concat(grid('Quyết Hán', (i, h) => i < 6, false, HRS_OLD), [[]],
              grid('Bích Ngọc', (i, h) => i < 6 && h !== 12), [[]],
              grid('Hiền Mai', (i, h) => i < 6));
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFFM, sched: SC });
    const nam = await login(t, 'duc nam', '0001');
    ok('Quyết (lưới cũ, chưa có hàng 12:00) → 12:00 T2–T7 "off", 11:00 / 14:00 vẫn nhận', ['19', '20', '21', '22', '23', '24'].every(dd => at(nam, '2026-10-' + dd + '|12') === 'off') && !at(nam, '2026-10-19|11') && !at(nam, '2026-10-19|14'), nam.coachAt);
    let r = await book(t, nam, [['2026-10-19', 12], ['2026-10-21', 18]]);
    ok('… đặt T2 12:00 → coach_nghi', r.ok === false && r.why === 'coach_nghi', r.why);
    const td = await login(t, 'thap diem', '0031');
    ok('Bích Ngọc bỏ tick 12:00 → K. Thấp Điểm thấy 12:00 "off", 09–11 · 14 nhận', at(td, '2026-10-19|12') === 'off' && !at(td, '2026-10-19|9') && !at(td, '2026-10-19|14'), td.coachAt);
    r = await book(t, td, [['2026-10-19', 12], ['2026-10-20', 9]]);
    ok('… đặt T2 12:00 → coach_nghi (lịch coach xét trước gói)', r.ok === false && r.why === 'coach_nghi', r.why);
    const hai = await login(t, 'thu hai', '0022');
    ok('Hiền Mai (lưới có 12:00, tick T2–T7) → 12:00 nhận, CN nghỉ', !at(hai, '2026-10-19|12') && at(hai, '2026-10-25|12') === 'off', [at(hai, '2026-10-19|12'), at(hai, '2026-10-25|12')]);
    r = await book(t, hai, [['2026-10-19', 12], ['2026-10-20', 12]]);
    ok('… đặt T2 12:00 + T3 12:00 → ok', r.ok, r.error || r.why);
  }
  {
    /* E · giữa tuần (đặt muộn 12 giờ) — gói thấp điểm: khung sớm nhất đặt được phải nằm trong gói */
    const t = await setup(vn('2026-10-21', '20:30'), { members: OFFM });
    const td = await login(t, 'thap diem', '0031');
    ok('T4 21.10 20:30 → K. Thấp Điểm đặt muộn: còn T5 · T6 (khung trong gói ≥ 12 giờ: T5 09:00 trở đi; T7 24.10 phòng nghỉ)', td.mode === 'book' && td.limits.max === 2, [td.mode, td.limits]);
    let r = await book(t, td, [['2026-10-22', 8], ['2026-10-23', 9]]);
    ok('… T5 08:00 → thap_diem (ngoài gói xét trước "dưới 12 giờ")', r.ok === false && r.why === 'thap_diem', r.why);
    r = await book(t, td, [['2026-10-22', 9], ['2026-10-23', 14]]);
    ok('… T5 09:00 (12 giờ 30 nữa) + T6 14:00 → ok', r.ok, r.error || r.why);
  }

  console.log('\n== 21. Giao thoa: gói thấp điểm × coach bận (khách khác / tập thử) · phòng đầy · số ngày còn lại · Lịch coach · ghép 1:2 · buổi cũ ngoài gói · hết hạn · đặt muộn ==');
  /* thêm 3 khách của Bích Ngọc: 1 toàn thời gian (so sánh) · 1 thấp điểm nữa (tranh khung) · 1 thấp điểm hết hạn T4 21.10 */
  const OFF2 = OFFM.concat([['936', 'Khách Ngọc Đủ', 'Bích Ngọc', '0900000036', 'B936DY', '1:1', 'Toàn thời gian'],
                            ['938', 'Khách Thấp Hai', 'Bích Ngọc', '0900000038', 'B938DY', '1:1', 'Thấp điểm'],
                            ['939', 'Khách Hạn Ngắn', 'Bích Ngọc', '0900000039', 'B939DY', '1:1', 'Thấp điểm', '2026-10-21']]);
  const D2T = { '2026-10-19': 'T2', '2026-10-20': 'T3', '2026-10-21': 'T4', '2026-10-22': 'T5', '2026-10-23': 'T6', '2026-10-24': 'T7', '2026-10-25': 'CN' };
  const OFFH = [9, 10, 11, 12, 14];
  let rn = 0;
  /* dòng sổ ghi sẵn (17 cột B..R) của một khách: kh · tên · tên ngắn · coach · loại · ngày · giờ */
  const srow = (kh, name, short, coach, kind, date, h) => [kh + '-W43', 1, W, date, D2T[date], (h < 10 ? '0' : '') + h + ':00', name, short, coach, kind,
    'Đã đặt', 'Đặt', '', '2026-10-18 06:30:00', 'ridgiaothoa' + String(++rn).padStart(4, '0'), kh, short + ' · X'];
  /* khách bịa chỉ có trên sổ (không có trong MEMBERS) — như khách cũ của coach: mỗi khung một người khác */
  const other = (n, coach, kind, date, h) => srow('B7' + n + 'DY', 'Khách Sổ ' + n, 'K. Sổ ' + n, coach, kind, date, h);
  /* Ngọc bận cả 5 khung trong gói (09 · 10 · 11 · 12 · 14) của các ngày `days` */
  const ngocBusy = days => { const out = []; days.forEach((d, i) => OFFH.forEach((h, j) => out.push(other(60 + i * 5 + j, 'Bích Ngọc', '1:1', d, h)))); return out; };
  const busyAll = (s, d) => OFFH.every(h => at(s, d + '|' + h) === 'busy');
  {
    /* A · coach bận cả 5 khung trong gói của T2: 4 khung do khách khác của Ngọc đã đặt, 12:00 do khách tập thử Ngọc nhận */
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2,
      log: [other(51, 'Bích Ngọc', '1:1', '2026-10-19', 9), other(52, 'Bích Ngọc', '1:1', '2026-10-19', 10), other(53, 'Bích Ngọc', '1:1', '2026-10-19', 11),
            other(54, 'Bích Ngọc', '1:1', '2026-10-19', 14)],
      trials: [['', '21', '2026-10-19', '12:00', 'Khách Thử 21', '0911111121', '', 'Chờ xác nhận', 'Bích Ngọc']] });
    const td = await login(t, 'thap diem', '0031');
    ok('A · K. Thấp Điểm (Ngọc · thấp điểm): T2 09 · 10 · 11 · 12 · 14 đều "busy" (khách khác + tập thử 12:00)', busyAll(td, '2026-10-19'), td.coachAt);
    ok('… T2 không còn khung trong gói → không tính là ngày đặt được: tối đa 4 (T3–T6; T7 phòng nghỉ, CN Ngọc nghỉ), tối thiểu 2', td.mode === 'book' && td.limits.min === 2 && td.limits.max === 4, td.limits);
    let r = await book(t, td, [['2026-10-19', 12], ['2026-10-20', 9]]);
    ok('… chọn T2 12:00 (tập thử chiếm) + T3 09:00 → het_cho chỉ ra T2 12:00, không ghi dòng nào', fullOnly(r, '2026-10-19', 12) && rowsOf(t, 'B931DY').length === 0, r);
    r = await book(t, td, [['2026-10-19', 15], ['2026-10-20', 9]]);
    ok('… chọn T2 15:00 (coach rảnh nhưng ngoài gói) → thap_diem, không phải het_cho', r.ok === false && r.why === 'thap_diem' && r.h === 15, r);
    const nd = await login(t, 'ngoc du', '0036');
    ok('K. Ngọc Đủ (cùng coach · toàn thời gian): T2 vẫn là ngày đặt được (còn khung ngoài 09–15) → tối đa 4 từ 5 ngày', nd.limits.max === 4 && !at(nd, '2026-10-19|15'), [nd.limits, at(nd, '2026-10-19|15')]);
    r = await book(t, nd, [['2026-10-19', 15], ['2026-10-20', 9]]);
    ok('… đặt T2 15:00 + T3 09:00 → ok', r.ok, r.error || r.why);
    const td2 = await boot(t, td);
    ok('K. Thấp Điểm thấy T3 09:00 "busy" (Ngọc Đủ vừa đặt), T3 10:00 trống', at(td2, '2026-10-20|9') === 'busy' && !at(td2, '2026-10-20|10'), td2.coachAt);
    r = await book(t, td2, [['2026-10-20', 9], ['2026-10-21', 9]]);
    ok('… chọn T3 09:00 → het_cho chỉ ra T3 09:00', fullOnly(r, '2026-10-20', 9), r);
    r = await book(t, td2, [['2026-10-20', 10], ['2026-10-21', 9]]);
    ok('… T3 10:00 + T4 09:00 → ok, 2 dòng', r.ok && rowsOf(t, 'B931DY', 'Đã đặt').length === 2, r.error || r.why);
    const th = await login(t, 'thap hai', '0038');
    r = await book(t, th, [['2026-10-21', 9], ['2026-10-22', 12]]);
    ok('K. Thấp Hai (Ngọc · thấp điểm) tranh T4 09:00 với K. Thấp Điểm → het_cho chỉ ra T4 09:00 (mỗi coach một suất)', fullOnly(r, '2026-10-21', 9), r);
    r = await book(t, th, [['2026-10-21', 10], ['2026-10-22', 12]]);
    ok('… T4 10:00 + T5 12:00 → ok', r.ok, r.error || r.why);
  }
  {
    /* B · Ngọc kín cả 5 khung trong gói T2–T5 → khách thấp điểm chỉ còn T6: tối thiểu / tối đa còn 1 */
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2, log: ngocBusy(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) });
    const td = await login(t, 'thap diem', '0031');
    ok('B · K. Thấp Điểm: T2–T5 kín trong gói, chỉ còn T6 → tối thiểu 1, tối đa 1, mode book', td.mode === 'book' && td.limits.min === 1 && td.limits.max === 1, [td.mode, td.limits]);
    const nd = await login(t, 'ngoc du', '0036');
    ok('… K. Ngọc Đủ (cùng coach · toàn thời gian) vẫn tối thiểu 2 / tối đa 4 (khung ngoài 09–15 còn trống)', nd.limits.min === 2 && nd.limits.max === 4, nd.limits);
    let r = await book(t, td, [['2026-10-23', 9], ['2026-10-22', 15]]);
    ok('… chọn T6 09:00 + T5 15:00 → thap_diem ở T5 15:00', r.ok === false && r.why === 'thap_diem' && r.date === '2026-10-22' && r.h === 15, r);
    r = await book(t, td, [['2026-10-23', 9], ['2026-10-21', 10]]);
    ok('… chọn 2 buổi khi tối đa 1 → qua_so_buoi (trang không cho chọn quá)', r.ok === false && r.why === 'qua_so_buoi', [r.error, r.why]);
    r = await book(t, td, [['2026-10-22', 9]]);
    ok('… chọn T5 09:00 (coach bận) → het_cho chỉ ra T5 09:00', fullOnly(r, '2026-10-22', 9), [r.error, r.why, r.full]);
    r = await book(t, td, [['2026-10-23', 9]]);
    ok('… đặt một buổi T6 09:00 → ok (đủ tối thiểu 1)', r.ok && rowsOf(t, 'B931DY', 'Đã đặt').length === 1, r.error || r.why);
    ok('… phiếu: không thêm được buổi nào (hết ngày còn khung trong gói)', r.ok && r.mode === 'ticket' && r.limits.add === 0, r.limits);
    const th = await login(t, 'thap hai', '0038');
    ok('K. Thấp Hai: T6 09:00 "busy", còn T6 10 · 11 · 12 · 14 → tối thiểu 1 / tối đa 1', at(th, '2026-10-23|9') === 'busy' && th.limits.min === 1 && th.limits.max === 1, [at(th, '2026-10-23|9'), th.limits]);
    r = await book(t, th, [['2026-10-23', 9]]);
    ok('… chọn T6 09:00 → het_cho', fullOnly(r, '2026-10-23', 9), r);
    r = await book(t, th, [['2026-10-23', 14]]);
    ok('… T6 14:00 → ok', r.ok, r.error || r.why);
  }
  {
    /* C · Ngọc kín cả 5 khung trong gói T2–T6 → khách thấp điểm của Ngọc không còn gì: mode closed; khách toàn thời gian vẫn đặt */
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2, log: ngocBusy(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) });
    const td = await login(t, 'thap diem', '0031');
    ok('C · K. Thấp Điểm: mọi khung trong gói đều kín → mode closed, tối đa 0; vẫn có offpeak để trang nói đúng lý do', td.mode === 'closed' && td.limits.max === 0 && td.offpeak && OFFH.every(h => busyAll(td, '2026-10-19')), [td.mode, td.limits]);
    let r = await book(t, td, [['2026-10-23', 9]]);
    ok('… gửi thẳng T6 09:00 (coach bận) → không ghi: tối đa 0 nên báo qua_so_buoi', r.ok === false && r.why === 'qua_so_buoi' && rowsOf(t, 'B931DY').length === 0, [r.error, r.why]);
    r = await book(t, td, [['2026-10-23', 16]]);
    ok('… gửi thẳng T6 16:00 (coach rảnh, ngoài gói) → thap_diem', r.ok === false && r.why === 'thap_diem', r);
    const nd = await login(t, 'ngoc du', '0036');
    ok('… K. Ngọc Đủ (toàn thời gian) mode book, tối đa 4', nd.mode === 'book' && nd.limits.max === 4, [nd.mode, nd.limits]);
  }
  {
    /* D · Lịch coach: Ngọc không nhận khách 09:00–15:00 ở T2–T7 (chỉ sáng sớm + chiều tối) · CN nhận 09–15 */
    const SC = [['', '— LỊCH COACH'], []].concat(grid('Bích Ngọc', (i, h) => i < 6 ? (h < 9 || h >= 15) : (h >= 9 && h <= 15)));
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2, sched: SC });
    const td = await login(t, 'thap diem', '0031');
    ok('D · K. Thấp Điểm: T2–T6 09 · 10 · 11 · 12 · 14 đều "off" (coach không nhận), CN trong gói nhận', ['19', '20', '21', '22', '23'].every(dd => OFFH.every(h => at(td, '2026-10-' + dd + '|' + h) === 'off')) && OFFH.every(h => !at(td, '2026-10-25|' + h)), td.coachAt);
    ok('… chỉ còn CN → tối thiểu 1 / tối đa 1', td.mode === 'book' && td.limits.min === 1 && td.limits.max === 1, [td.mode, td.limits]);
    let r = await book(t, td, [['2026-10-19', 9]]);
    ok('… T2 09:00 → coach_nghi (lịch coach xét trước gói)', r.ok === false && r.why === 'coach_nghi', r.why);
    r = await book(t, td, [['2026-10-25', 15]]);
    ok('… CN 15:00 (coach có tick nhưng ngoài gói) → thap_diem', r.ok === false && r.why === 'thap_diem', r.why);
    r = await book(t, td, [['2026-10-25', 14]]);
    ok('… CN 14:00 → ok', r.ok, r.error || r.why);
    const nd = await login(t, 'ngoc du', '0036');
    r = await book(t, nd, [['2026-10-19', 15], ['2026-10-20', 8]]);
    ok('K. Ngọc Đủ (toàn thời gian) đặt T2 15:00 + T3 08:00 → ok', r.ok, r.error || r.why);
    const SC2 = [['', '— LỊCH COACH'], []].concat(grid('Bích Ngọc', (i, h) => i < 6 && (h < 9 || h >= 15)));
    const t2 = await setup(vn('2026-10-18', '07:00'), { members: OFF2, sched: SC2 });
    const td2 = await login(t2, 'thap diem', '0031');
    ok('… Ngọc không nhận 09–15 cả tuần (CN nghỉ) → K. Thấp Điểm mode closed, tối đa 0', td2.mode === 'closed' && td2.limits.max === 0, [td2.mode, td2.limits]);
  }
  {
    /* E · phòng đầy · gói 1:2 thấp điểm vào nhóm có sẵn */
    const q = (kh, name, short, date, h) => srow(kh, name, short, 'Quyết Hán', '1:2', date, h);
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2, log: [
      other(71, 'Quyết Hán', '1:1', '2026-10-20', 10), other(72, 'Hiền Mai', '1:1', '2026-10-20', 10), other(73, 'Khải Phan', '1:1', '2026-10-20', 10), other(74, 'Lâm Nguyễn', '1:1', '2026-10-20', 10),
      other(75, 'Hiền Mai', '1:1', '2026-10-20', 11), other(76, 'Khải Phan', '1:1', '2026-10-20', 11), other(77, 'Lâm Nguyễn', '1:1', '2026-10-20', 11),
      q('B902DY', 'Ninh Ngọc Nam', 'Ngọc Nam', '2026-10-20', 11), q('B925DY', 'Khách Cặp Một', 'K. Cặp Một', '2026-10-20', 15),
      q('B925DY', 'Khách Cặp Một', 'K. Cặp Một', '2026-10-22', 15), q('B926DY', 'Khách Cặp Hai', 'K. Cặp Hai', '2026-10-22', 11)] });
    const td = await login(t, 'thap diem', '0031');
    ok('E · T3 10:00 phòng đủ 4 suất (4 coach khác) — K. Thấp Điểm thấy đầy, coach của mình rảnh', td.taken['2026-10-20|10'] === 4 && !at(td, '2026-10-20|10'), [td.taken['2026-10-20|10'], at(td, '2026-10-20|10')]);
    let r = await book(t, td, [['2026-10-20', 10], ['2026-10-21', 9]]);
    ok('… chọn T3 10:00 → het_cho (phòng đầy)', fullOnly(r, '2026-10-20', 10), r);
    const dt = await login(t, 'doi thap', '0034');
    ok('K. Đôi Thấp (Quyết · 1:2 · thấp điểm): T3 11:00 phòng đầy nhưng "join" (Ngọc Nam chờ) → có trong danh sách chờ', dt.taken['2026-10-20|11'] === 4 && at(dt, '2026-10-20|11') === 'join' && duo(dt).wait['2026-10-20|11'] === 'Ngọc Nam', [dt.taken['2026-10-20|11'], at(dt, '2026-10-20|11'), duo(dt).wait]);
    ok('… T3 15:00 K. Cặp Một chờ ("join" trong coachAt) nhưng ngoài gói → không nằm trong danh sách chờ', at(dt, '2026-10-20|15') === 'join' && !duo(dt).wait['2026-10-20|15'], duo(dt).wait);
    r = await book(t, dt, [['2026-10-20', 15], ['2026-10-21', 9]]);
    ok('… chọn T3 15:00 → thap_diem (không được vào nhóm ngoài gói)', r.ok === false && r.why === 'thap_diem' && r.h === 15, r);
    r = await book(t, dt, [['2026-10-20', 11], ['2026-10-21', 9]]);
    ok('… T3 11:00 (vào nhóm khi phòng đầy) + T4 09:00 → ok, tập đôi cùng Ngọc Nam, phòng T3 11:00 vẫn 4 suất', r.ok && duo(r).pairs['2026-10-20|11'] === 'Ngọc Nam' && r.taken['2026-10-20|11'] === 4, r.error || r.why || [duo(r).pairs, r.taken]);
    /* F · đổi lịch / ghép: T4 09:00 đang lẻ → T5 15:00 (nhóm chờ, ngoài gói) bị chặn kể cả kiểu "Ghép"; → T5 11:00 (nhóm chờ, trong gói) là Ghép */
    r = await change(t, dt, ['2026-10-21', 9], ['2026-10-22', 15]);
    ok('F · K. Đôi Thấp dời T4 09:00 → T5 15:00 (K. Cặp Một chờ) → thap_diem, không ghi', r.ok === false && r.why === 'thap_diem' && rowsOf(t, 'B934DY', 'Đã đặt').length === 2, r);
    r = await change(t, dt, ['2026-10-21', 9], ['2026-10-22', 11]);
    ok('… dời T4 09:00 → T5 11:00 (K. Cặp Hai chờ) → ok, là "Ghép" (không tính lượt đổi)', r.ok && duo(r).pairs['2026-10-22|11'] === 'Cặp Hai' && r.mine.changes === 0 && r.mine.changesLeft === 2, r.error || r.why || [duo(r).pairs, r.mine]);
  }
  {
    /* G · buổi đặt TRƯỚC khi chuyển sang gói thấp điểm (T2 18:00, T3 07:00) vẫn giữ; đổi / thêm phải vào khung trong gói */
    const mine = (date, h) => srow('B931DY', 'Khách Thấp Điểm', 'K. Thấp Điểm', 'Bích Ngọc', '1:1', date, h);
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2, log: [mine('2026-10-19', 18), mine('2026-10-20', 7)] });
    const td = await login(t, 'thap diem', '0031');
    ok('G · K. Thấp Điểm có sẵn T2 18:00 + T3 07:00 (ngoài gói) → mode ticket, 2 buổi vẫn còn', td.mode === 'ticket' && JSON.stringify(td.mine.sessions.map(s => s.date + ' ' + s.h)) === JSON.stringify(['2026-10-19 18', '2026-10-20 7']), td.mine.sessions);
    ok('… thêm được 2 (T4 · T5 · T6 còn khung trong gói, tối đa 4 buổi)', td.limits.add === 2, td.limits);
    let r = await change(t, td, ['2026-10-19', 18], ['2026-10-21', 17]);
    ok('… đổi T2 18:00 → T4 17:00 → thap_diem', r.ok === false && r.why === 'thap_diem', r);
    r = await change(t, td, ['2026-10-19', 18], ['2026-10-21', 10]);
    ok('… đổi T2 18:00 → T4 10:00 → ok', r.ok && JSON.stringify(r.mine.sessions.map(s => s.date + ' ' + s.h)) === JSON.stringify(['2026-10-20 7', '2026-10-21 10']), r.error || r.why || r.mine.sessions);
    r = await book(t, td, [['2026-10-22', 15]]);
    ok('… thêm T5 15:00 → thap_diem', r.ok === false && r.why === 'thap_diem', r);
    r = await book(t, td, [['2026-10-22', 9]]);
    ok('… thêm T5 09:00 → ok, 3 buổi (T3 07:00 ngoài gói vẫn giữ)', r.ok && r.mine.sessions.length === 3 && r.mine.sessions.some(s => s.h === 7), r.error || r.why || r.mine.sessions);
  }
  {
    /* H · gói thấp điểm hết hạn T4 21.10: hết hạn xét trước gói · I · đặt muộn giữa tuần + coach bận đúng khung sớm nhất */
    const t = await setup(vn('2026-10-18', '07:00'), { members: OFF2 });
    const hn = await login(t, 'han ngan', '0039');
    ok('H · K. Hạn Ngắn (thấp điểm, hết hạn T4 21.10) → tối đa 3 (T2–T4)', hn.mode === 'book' && hn.limits.max === 3 && hn.offpeak, [hn.mode, hn.limits]);
    let r = await book(t, hn, [['2026-10-22', 16], ['2026-10-19', 9]]);
    ok('… T5 16:00 (sau hạn và ngoài gói) → het_han (hết hạn xét trước)', r.ok === false && r.why === 'het_han' && r.date === '2026-10-22', r);
    r = await book(t, hn, [['2026-10-19', 15], ['2026-10-20', 9]]);
    ok('… T2 15:00 → thap_diem', r.ok === false && r.why === 'thap_diem', r);
    r = await book(t, hn, [['2026-10-19', 9], ['2026-10-21', 14]]);
    ok('… T2 09:00 + T4 14:00 (ngày cuối của gói) → ok', r.ok, r.error || r.why);
    const t2 = await setup(vn('2026-10-21', '20:30'), { members: OFF2, log: [other(81, 'Bích Ngọc', '1:1', '2026-10-22', 9)] });
    const td = await login(t2, 'thap diem', '0031');
    ok('I · T4 20:30: K. Thấp Điểm còn T5 · T6 (T5 09:00 coach bận, T5 10:00 vẫn ≥ 12 giờ)', td.limits.max === 2 && at(td, '2026-10-22|9') === 'busy', [td.limits, at(td, '2026-10-22|9')]);
    r = await book(t2, td, [['2026-10-22', 9], ['2026-10-23', 9]]);
    ok('… T5 09:00 → het_cho', fullOnly(r, '2026-10-22', 9), r);
    r = await book(t2, td, [['2026-10-22', 10], ['2026-10-23', 9]]);
    ok('… T5 10:00 + T6 09:00 → ok', r.ok, r.error || r.why);
  }
}

module.exports = { coachCases };
