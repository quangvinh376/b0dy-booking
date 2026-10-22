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
const HRS = [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20], DAYS7 = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const hh = h => (h < 10 ? '0' : '') + h + ':00';
function grid(name, on, timeCells) {
  return [['', name].concat(DAYS7)].concat(HRS.map(h => ['', timeCells ? dateIn('Asia/Saigon', '1899-12-30', hh(h)) : hh(h)].concat(DAYS7.map((_, i) => on(i, h)))));
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
}

module.exports = { coachCases };
