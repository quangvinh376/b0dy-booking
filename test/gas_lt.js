/* Test backend/LichTuan.gs trên bảng tính giả (dữ liệu bịa, không có khách thật).
   Chạy: node test/gas_lt.js            → in PASS/FAIL từng phép kiểm, thoát 1 nếu có FAIL. */
'use strict';
const { makeEnv, Spreadsheet, dateIn } = require('./gas_env');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 700) : '')); }
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);                          /* ô ngày của file BA (timezone LA) */
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();     /* thời điểm theo giờ Việt Nam */

function baSheets() {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key'];
  const m = (no, name, pkg, kind, coach, phone, left, start, exp, code) =>
    ['', no, name, pkg, parseInt(pkg, 10), kind, 300000, coach, phone, '', '', '', 0, left, '', start ? d(start) : '', '', exp === '' ? '' : (typeof exp === 'string' && exp.indexOf('/') > 0 ? exp : d(exp)), code, name + '|' + start];
  const members = [
    ['', '— MEMBERS'], ['', 'test'], [], [], H,
    m('901', 'Hoàng Đức Nam', '72 buổi', '1:1', 'Quyết Hán', '0900000001', 20, '2026-07-01', '2027-01-01', 'B901DY'),
    m('902', 'Nguyễn Ngọc Nam', '48 buổi', '1:2', 'Quyết Hán', '0900000002', 12, '2026-07-01', '2027-01-01', 'B902DY'),
    m('903A', 'Trần Thị Mỹ Linh', '24 buổi', '1:2', 'Hiền Mai (giai đoạn 1)', '0900000003', 0, '2026-08-01', '21/10/26', 'B903DY'),
    m('903B', 'Trần Thị Mỹ Linh', '24 buổi', '1:2', 'Hiền Mai', '', 5, '2026-09-01', '21/10/26', 'B903DY'),
    m('904', 'Lê Gia Phong', '12 buổi', '1:1', 'Khải Phan', '0900000004', 0, '2026-08-01', '2026-10-11', 'B904DY'),
    m('905', 'Lê Gia Phong', '36 buổi', '1:1', 'Khải Phan', '0900000004', 30, '2026-10-07', '2027-02-28', 'B905DY'),
    m('906', 'Đỗ Văn Hưng', '12 buổi', '1:1', 'Lâm Nguyễn', '0900000006', 1, '2026-08-01', '2026-12-01', 'B906DY'),
    m('907', 'Phan Thị Hà', '24 buổi', '1:1', 'Bích Ngọc', '0900000007', 24, '2026-10-21', '2027-01-01', 'B907DY'),
    m('908', 'Bùi Không Số', '24 buổi', '1:1', 'Bích Ngọc', '', 10, '2026-08-01', '2027-01-01', 'B908DY'),
    m('909', 'Mai Xuân Tú', '12 buổi', '1:1', 'Quyết Hán', '0900000009', 0, '2026-08-01', '2027-01-01', 'B909DY'),
    m('910', 'Cao Bảo Anh', '12 buổi', '1:1', 'Quyết Hán', '0900000010', 5, '2026-08-01', '2026-10-10', 'B910DY'),
    m('921', 'Khách Thứ Một', '48 buổi', '1:1', 'Quyết Hán', '0900000021', 20, '2026-08-01', '2027-01-01', 'B921DY'),
    m('922', 'Khách Thứ Hai', '48 buổi', '1:1', 'Quyết Hán', '0900000022', 20, '2026-08-01', '2027-01-01', 'B922DY'),
    m('923', 'Khách Thứ Ba', '48 buổi', '1:1', 'Hiền Mai', '0900000023', 20, '2026-08-01', '2027-01-01', 'B923DY'),
    m('924', 'Khách Thứ Tư', '48 buổi', '1:1', 'Hiền Mai', '0900000024', 20, '2026-08-01', '2027-01-01', 'B924DY')
  ];
  const LH = ['', '#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử', '_mrow'];
  const log = [['', '— SESSION LOG'], ['', 'test'], [], LH,
    ['', '0001', d('2026-10-19'), 'T2', '', 'Quyết Hán', '', 'Hoàng Đức Nam', '901', '1:1', '', 'Đã tập', '', '', 'app 06:02 · ký: Quyết Hán', 1],
    ['', '0002', d('2026-10-19'), 'T2', '', 'Quyết Hán', '', 'Nguyễn Ngọc Nam', '902', '1:2', '', 'Vắng', '', '', '', 2]];
  const TH = ['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ & tên / Username', 'Số điện thoại', 'Ghi chú (không bắt buộc)', 'Trạng thái', 'Coach tiếp nhận'];
  const trial = [['', '— TRIAL'], ['', 'test'], [], TH,
    ['', '01', d('2026-10-20'), '18:00', 'Khách tập thử', '0911111111', '', 'Chờ xác nhận', ''],
    ['', '02', d('2026-10-20'), '18:00', 'Khách huỷ', '0911111112', '', 'Đã hủy', ''],
    ['', '03', d('2026-10-27'), '18:00', 'Tuần sau', '0911111113', '', 'Chờ xác nhận', '']];
  const b0b = [['', '— B0B'], [], ['', 'CA', 'GIỜ', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], ['', 'A', '08:00', 2, 2, 2, 2, 2, 2, ''],
    [], ['', 'LÝ DO ĐÓNG CỬA', 'NGÀY'], ['', 'Nghỉ lễ thử', '24/10/26'], ['', 'Tết', '01/01/27']];
  const cfg = [['', '— CONFIG 2'], [], [], ['', 'Coach', 'Giai đoạn', '% Com'], ['', 'Quyết Hán', '', 0.23],
    [], ['', '— THÔNG SỐ VẬN HÀNH'], ['', 'Sức chứa tối đa / khung', 4], ['', 'Giờ mở cửa', '06:00 – 21:00']];
  return { 'MEMBERS': members, 'SESSION LOG': log, 'TRIAL': trial, 'B0B': b0b, ' ⚙️ 2': cfg };
}
function outSheets() {
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  return {
    'Bảng lịch tập': [['', '— LỊCH TẬP TUẦN']],
    'Sổ đặt lịch': [['', '— SỔ ĐẶT LỊCH'], ['', 'mô tả'], [], [''].concat(head)],
    '_dữ liệu': [['SỨC CHỨA / KHUNG', 4], ['CẬP NHẬT', ''], [], ['Hội viên', 'Tên ngắn', 'Coach', 'Còn lại', 'Hết hạn', 'Mã KH', '_hiển thị']]
  };
}
function setup(nowMs, opts) {
  const clock = { now: nowMs };
  const files = { BA: new Spreadsheet('BA', LA, baSheets()), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets()) };
  files.OUT.title = '[B0DY Studio] Lịch tập tuần';
  const env = makeEnv(files, clock, Object.assign({ props: { BA_ID: 'BA', LT_OUT_ID: 'OUT' } }, opts || {}));
  return { env, clock, files, log: files.OUT.getSheetByName('Sổ đặt lịch') };
}
const DEV = 'devAAAAAAAAAAAAAAAAAAAA', DEV2 = 'devBBBBBBBBBBBBBBBBBBBB';
function call(t, body) { return JSON.parse(JSON.stringify(t.env.ltDoPost_(Object.assign({ dev: DEV }, body)))); }
let ridN = 0; const rid = () => 'rid' + String(++ridN).padStart(8, '0');
function login(t, q, pin, dev) {
  const f = call(t, { action: 'lt_find', q, dev: dev || DEV });
  const id = f.results && f.results[0] && f.results[0].id;
  return call(t, { action: 'lt_verify', id, pin, remember: true, dev: dev || DEV });
}
function logRows(t) { return t.log.rows.slice(4).filter(r => r[1]); }

/* ------------------------------------------------------------------ */
console.log('\n== 1. Thời gian · tuần ISO · cửa sổ đặt ==');
{
  const t = setup(vn('2026-10-17', '12:00'));
  const e = t.env;
  let c = e.ltWeekCtx_(vn('2026-10-17', '12:00'));
  ok('T7 17.10 12:00 → tuần này (W42), phase late, báo trước 24 giờ', c.key === '2026-W42' && c.mon === '2026-10-12' && c.phase === 'late' && c.lead === 864e5, c);
  ok('… lần mở kế tiếp = CN 18.10 06:00 (tuần 43)', c.nextOpen === vn('2026-10-18', '06:00') && c.nextNo === 43, c);
  c = e.ltWeekCtx_(vn('2026-10-18', '05:59'));
  ok('CN 05:59 → vẫn tuần 42 (phase before) · mở lúc 06:00 hôm nay', c.key === '2026-W42' && c.phase === 'before' && c.nextOpen === vn('2026-10-18', '06:00'), c);
  c = e.ltWeekCtx_(vn('2026-10-18', '06:00'));
  ok('CN 06:00 → tuần 43 (19–24.10), phase open, không cần báo trước', c.key === '2026-W43' && c.mon === '2026-10-19' && c.days.length === 6 && c.days[5] === '2026-10-24' && c.phase === 'open' && c.lead === 0, c);
  c = e.ltWeekCtx_(vn('2026-10-19', '00:00'));
  ok('T2 19.10 00:00 → tuần 43, phase late, báo trước 24 giờ', c.key === '2026-W43' && c.phase === 'late' && c.lead === 864e5, c);
  ok('Tuần ISO: 28.12.2026 = 2026-W53 · 04.01.2027 = 2027-W01 · 01.01.2027 = 2026-W53',
     e.ltWeekKey_('2026-12-28') === '2026-W53' && e.ltWeekKey_('2027-01-04') === '2027-W01' && e.ltIsoWeek_('2027-01-01').week === 53);
  ok('Giờ khung theo giờ Việt Nam: 19.10 06:00 = 18.10 23:00 UTC', e.ltSlotMs_('2026-10-19', 6) === Date.UTC(2026, 9, 18, 23, 0));
}

console.log('\n== 2. Tên · đọc MEMBERS · gộp gói ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const e = t.env;
  ok('Tên ngắn và tên chào', e.ltShort_('Hoàng Đức Nam') === 'H. Đức Nam' && e.ltCall_('Hoàng Đức Nam') === 'Đức Nam' && e.ltCall_('Đỗ Văn Hưng') === 'Hưng' && e.ltCall_('Trần Thị Mỹ Linh') === 'Mỹ Linh' && e.ltCall_('Lê Thị Hà') === 'Hà');
  ok('Bỏ hậu tố coach · viết tắt coach', e.ltCoach_('Hiền Mai (giai đoạn 1)') === 'Hiền Mai' && e.ltInitials_('Quyết Hán') === 'QH');
  const persons = e.ltPersons_(e.ltMemberRows_(), '2026-10-18');
  const keys = persons.map(p => p.key);
  ok('Chỉ hội viên còn buổi + chưa hết hạn (Mai Xuân Tú hết buổi, Cao Bảo Anh hết hạn bị loại)', keys.indexOf('B909DY') < 0 && keys.indexOf('B910DY') < 0 && keys.indexOf('B901DY') >= 0, keys);
  const linh = persons.find(p => p.key === 'B903DY');
  ok('Ngày hết hạn gõ chữ "21/10/26" đọc đúng; SĐT lấy từ dòng gói cũ cùng mã KH; coach bỏ hậu tố', linh && linh.exp === '2026-10-21' && linh.phone === '0900000003' && linh.coach === 'Hiền Mai' && linh.left === 5, linh);
  const phong = persons.filter(p => p.name === 'Lê Gia Phong');
  ok('Hai hợp đồng khác mã KH: chỉ hợp đồng còn hiệu lực', phong.length === 1 && phong[0].key === 'B905DY', phong);
  ok('Gói hiển thị "72B"', persons.find(p => p.key === 'B901DY').pkg === '72B');
}

console.log('\n== 3. Tìm tên ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  let r = call(t, { action: 'lt_find', q: 'duc nam' });
  ok('"duc nam" (không dấu) → H. Đức Nam, kèm coach, không lộ SĐT', r.ok && r.results.length === 1 && r.results[0].short === 'H. Đức Nam' && r.results[0].coach === 'Quyết Hán' && JSON.stringify(r).indexOf('0900') < 0, r);
  r = call(t, { action: 'lt_find', q: '  Đức   NAM ' });
  ok('"Đức NAM" (có dấu, hoa, thừa cách) → cùng kết quả', r.results.length === 1 && r.results[0].short === 'H. Đức Nam', r);
  r = call(t, { action: 'lt_find', q: 'nam' });
  ok('Một chữ → chưa tìm (need 2)', r.ok && r.results.length === 0 && r.need === 2, r);
  r = call(t, { action: 'lt_find', q: 'duc n' });
  ok('Chữ cuối gõ dở "duc n" → vẫn ra', r.results.length === 1, r);
  r = call(t, { action: 'lt_find', q: 'hoang duc nam' });
  ok('Gõ đủ họ tên → ra', r.results.length === 1, r);
  r = call(t, { action: 'lt_find', q: 'hoang duc' });
  ok('Họ + tên đệm (không phải phần cuối) → không ra', r.results.length === 0, r);
  r = call(t, { action: 'lt_find', q: 'xuan tu' });
  ok('Hết buổi → không có trong danh sách', r.results.length === 0, r);
  r = call(t, { action: 'lt_find', q: 'gia phong' });
  ok('Hai hợp đồng cùng tên → một kết quả', r.results.length === 1, r);
}

console.log('\n== 4. Xác minh · khoá máy · nhớ máy ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const id = call(t, { action: 'lt_find', q: 'duc nam' }).results[0].id;
  let r;
  for (let i = 1; i <= 4; i++) {
    r = call(t, { action: 'lt_verify', id, pin: '1234', remember: true });
    ok('Sai lần ' + i + ' → sai_ma, còn ' + (5 - i) + ' lần', r.ok === false && r.error === 'sai_ma' && r.left === 5 - i, r);
  }
  r = call(t, { action: 'lt_verify', id, pin: '9999' });
  ok('Sai lần 5 → khoá 15 phút', r.error === 'khoa' && r.until === t.clock.now + 15 * 60000, r);
  r = call(t, { action: 'lt_verify', id, pin: '0001', remember: true });
  ok('Đang khoá thì mã đúng cũng không vào', r.error === 'khoa', r);
  r = call(t, { action: 'lt_verify', id, pin: '0001', remember: true, dev: DEV2 });
  ok('Máy khác không bị khoá → vào được', r.ok === true && r.auth === true && !!r.tok, r.error);
  t.clock.now += 15 * 60000 + 1000;
  r = call(t, { action: 'lt_verify', id, pin: '0001', remember: true });
  ok('Hết 15 phút → máy cũ vào được, mã nhớ máy 60 ngày', r.ok && r.tokExp - t.clock.now === 60 * 864e5, r.error);
  const tok = r.tok;
  r = call(t, { action: 'lt_verify', id, pin: '0001', remember: false });
  ok('Không tick nhớ máy → mã 12 giờ', r.ok && r.tokExp - t.clock.now === 12 * 3600e3);
  r = call(t, { action: 'lt_boot', tok });
  ok('Mở lại bằng mã nhớ máy → vào thẳng (auth, mode book)', r.ok && r.auth && r.mode === 'book' && r.me.short === 'H. Đức Nam', r);
  ok('… state không có SĐT', JSON.stringify(r).indexOf('0900000001') < 0);
  r = call(t, { action: 'lt_boot', tok, dev: DEV2 });
  ok('Mã nhớ máy dùng ở máy khác → không nhận', r.ok && r.auth === false && r.why === 'het_phien', r);
  r = call(t, { action: 'lt_boot', tok: tok.slice(0, -2) + 'xx' });
  ok('Mã bị sửa → không nhận', r.auth === false, r);
  t.clock.now += 61 * 864e5;
  r = call(t, { action: 'lt_boot', tok });
  ok('Quá 60 ngày → hết phiên', r.auth === false && r.why === 'het_phien', r);
  const t2 = setup(vn('2026-10-18', '07:00'));
  const id2 = call(t2, { action: 'lt_find', q: 'khong so' }).results[0].id;
  r = call(t2, { action: 'lt_verify', id: id2, pin: '0000' });
  ok('Hồ sơ chưa có SĐT → chua_co_sdt (không tính lần sai)', r.error === 'chua_co_sdt', r);
  r = call(t2, { action: 'lt_verify', id: 'khongtontai', pin: '0000' });
  ok('id lạ → khong_thay', r.error === 'khong_thay', r);
  r = call(t2, { action: 'lt_boot', dev: 'ngan' });
  ok('Thiếu mã máy hợp lệ → thieu_may', r.error === 'thieu_may', r);
}

console.log('\n== 5. Đặt lịch Chủ Nhật (tuần 43) ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const st = login(t, 'duc nam', '0001');
  const tok = st.tok;
  ok('Trước khi đặt: mode book, giới hạn 2–4', st.mode === 'book' && st.limits.min === 2 && st.limits.max === 4, st.limits);
  ok('Ngày lễ T7 24.10 (B0B) khoá', st.week.closed['2026-10-24'] === 'Nghỉ lễ thử', st.week.closed);
  ok('Khách tập thử (không huỷ) chiếm chỗ T3 18:00', st.taken['2026-10-20|18'] === 1, st.taken);
  let r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }] });
  ok('1 buổi < tối thiểu 2 → it_hon_toi_thieu, không ghi gì', r.error === 'it_hon_toi_thieu' || r.why === 'it_hon_toi_thieu', r.error + '/' + r.why);
  ok('… sổ vẫn trống', logRows(t).length === 0);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-19', h: 18 }] });
  ok('Hai buổi cùng ngày → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 12 }, { date: '2026-10-21', h: 18 }] });
  ok('Khung 12:00 (nghỉ trưa) → khung', r.why === 'khung', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-25', h: 8 }, { date: '2026-10-21', h: 18 }] });
  ok('Chủ Nhật → ngoai_tuan', r.why === 'ngoai_tuan', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-24', h: 8 }, { date: '2026-10-21', h: 18 }] });
  ok('Ngày lễ → nghi', r.why === 'nghi', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W42', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Gửi nhầm tuần → tuan_doi', r.error === 'tuan_doi', r.error);
  const R1 = rid();
  r = call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', picks: [{ date: '2026-10-23', h: 19 }, { date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Đặt 3 buổi (T2 06:00, T4 18:00, T6 19:00) → ok, mode ticket', r.ok && r.mode === 'ticket' && r.mine.sessions.length === 3, r.error || r.why);
  const rows = logRows(t);
  ok('Sổ có 3 dòng, sắp theo ngày, đủ cột', rows.length === 3 && rows[0][4] === '2026-10-19' && rows[0][6] === '06:00' && rows[0][5] === 'T2' && rows[2][4] === '2026-10-23', rows.map(x => x.slice(1, 8)));
  ok('Mã phiếu B901DY-W43 · bản 1 · Đặt · Đã đặt · mã KH · hiển thị "H. Đức Nam · QH"',
     rows.every(x => x[1] === 'B901DY-W43' && x[2] === 1 && x[3] === '2026-W43' && x[11] === 'Đã đặt' && x[12] === 'Đặt' && x[15] === R1 && x[16] === 'B901DY' && x[17] === 'H. Đức Nam · QH'), rows[0]);
  ok('Tên đầy đủ, tên ngắn, coach, loại', rows[0][7] === 'Hoàng Đức Nam' && rows[0][8] === 'H. Đức Nam' && rows[0][9] === 'Quyết Hán' && rows[0][10] === '1:1', rows[0]);
  ok('Lúc ghi theo giờ VN', rows[0][14] === '2026-10-18 07:00:00', rows[0][14]);
  ok('Phiếu bản 1, còn 2 lượt đổi, buổi T2 06:00 chưa tập (on)', r.mine.ver === 1 && r.mine.changesLeft === 2 && r.mine.sessions[0].st === 'on', r.mine);
  r = call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', picks: [{ date: '2026-10-23', h: 19 }, { date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Gửi lại cùng mã yêu cầu → dup, không tạo dòng trùng', r.ok && r.dup === true && logRows(t).length === 3, r);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 7 }, { date: '2026-10-22', h: 7 }] });
  ok('Đã có 3 buổi, thêm 2 → quá 4 (qua_so_buoi)', r.why === 'qua_so_buoi', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-21', h: 7 }] });
  ok('Thêm vào ngày đã có buổi → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-22', h: 7 }] });
  ok('Thêm buổi thứ 4 → ok, bản 2, thao tác Thêm, không tính lượt đổi', r.ok && r.mine.sessions.length === 4 && r.mine.ver === 2 && r.mine.changesLeft === 2 && logRows(t)[3][12] === 'Thêm', r.error || r.why);
  ok('Đủ 4 buổi → limits.add = 0', r.limits.add === 0, r.limits);
}

console.log('\n== 6. Sức chứa 4/khung (hội viên + tập thử) · nguyên tắc tất cả hoặc không ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const names = ['thu mot', 'thu hai', 'thu ba'];
  names.forEach((q, i) => {
    const s = login(t, q, String(21 + i).padStart(4, '0'));
    const r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 18 }, { date: '2026-10-22', h: 18 }] });
    ok('Khách ' + (i + 1) + ' đặt T3 18:00 + T5 18:00', r.ok, r.error || r.why);
  });
  const s4 = login(t, 'thu tu', '0024');
  ok('T3 18:00 đã 3 hội viên + 1 tập thử = 4 → đầy', s4.taken['2026-10-20|18'] === 4, s4.taken);
  let r = call(t, { action: 'lt_book', tok: s4.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-20', h: 18 }] });
  ok('Khách 4 chọn T3 18:00 → het_cho, chỉ ra khung đầy', r.error === 'het_cho' && r.full.length === 1 && r.full[0].date === '2026-10-20' && r.full[0].h === 18, r);
  ok('… không ghi buổi T2 nào (tất cả hoặc không)', logRows(t).filter(x => x[16] === 'B924DY').length === 0);
  r = call(t, { action: 'lt_book', tok: s4.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-22', h: 18 }] });
  ok('T5 18:00 (3/4) vẫn đặt được → ok', r.ok && r.taken['2026-10-22|18'] === 4, r.error || r.why);
}

console.log('\n== 7. Giới hạn theo gói: còn ít buổi · hết hạn giữa tuần · chưa bắt đầu ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  let s = login(t, 'van hung', '0006');
  ok('Còn 1 buổi → tối thiểu 1, tối đa 1', s.limits.min === 1 && s.limits.max === 1, s.limits);
  let r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 8 }, { date: '2026-10-20', h: 8 }] });
  ok('Đặt 2 buổi khi còn 1 → qua_so_buoi', r.why === 'qua_so_buoi', r.why);
  r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 8 }] });
  ok('Đặt 1 buổi → ok', r.ok, r.error || r.why);
  s = login(t, 'my linh', '0003');
  ok('Hết hạn T4 21.10: tối đa 3 (T2–T4), hiện exp', s.limits.max === 3 && s.me.exp === '2026-10-21', s.limits);
  r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-22', h: 9 }] });
  ok('Buổi sau ngày hết hạn → het_han', r.why === 'het_han', r.why);
  s = login(t, 'thi ha', '0007');
  ok('Gói bắt đầu T4 21.10: tối đa 3 ngày (T4–T6, T7 nghỉ lễ)', s.limits.max === 3, s.limits);
  r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-22', h: 9 }] });
  ok('Buổi trước ngày bắt đầu → chua_bat_dau', r.why === 'chua_bat_dau', r.why);
}

console.log('\n== 8. Đặt muộn (T2–T7): khung phải cách ≥ 24 giờ ==');
{
  const t = setup(vn('2026-10-19', '10:00'));
  const s = login(t, 'ngoc nam', '0002');
  ok('T2 10:00 → tuần 43, phase late', s.week.key === '2026-W43' && s.week.phase === 'late' && s.week.lead === true, s.week);
  let r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 9 }, { date: '2026-10-21', h: 9 }] });
  ok('T3 09:00 (23 giờ nữa) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 10 }, { date: '2026-10-21', h: 9 }] });
  ok('T3 10:00 (đúng 24 giờ) → ok', r.ok, r.error || r.why);
  ok('Điểm danh SESSION LOG: T2 19.10 "Vắng" không nằm trong phiếu nên không hiện', r.mine.sessions.every(x => x.date !== '2026-10-19'));
}

console.log('\n== 9. Đổi lịch: tối đa 2 lần, ngày khác, cả hai khung ≥ 24 giờ ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  let s = login(t, 'duc nam', '0001');
  let r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  ok('Đặt 3 buổi', r.ok, r.error);
  t.clock.now = vn('2026-10-20', '09:00');
  const tok9 = s.tok;
  s = call(t, { action: 'lt_boot', tok: tok9 });
  s.tok = tok9;
  ok('T3 09:00: phiếu có buổi T2 đã tập (SESSION LOG) · còn 2 lượt đổi', s.mode === 'ticket' && s.mine.sessions[0].st === 'done' && s.mine.changesLeft === 2, s.mine);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } });
  ok('Đổi T4 18:00 (33 giờ nữa) → T5 19:00 → ok, bản 2, còn 1 lượt', r.ok && r.mine.ver === 2 && r.mine.changesLeft === 1 && r.mine.sessions.some(x => x.date === '2026-10-22' && x.h === 19), r.error || r.why);
  const rows = logRows(t);
  const old = rows.find(x => x[4] === '2026-10-21'), nw = rows.find(x => x[4] === '2026-10-22');
  ok('Dòng cũ → Đã đổi + "Đổi sang T5 22.10 · 19:00"; dòng mới Đổi + "Đổi từ T4 21.10 · 18:00"', old[11] === 'Đã đổi' && old[13] === 'Đổi sang T5 22.10 · 19:00' && nw[11] === 'Đã đặt' && nw[12] === 'Đổi' && nw[13] === 'Đổi từ T4 21.10 · 18:00' && nw[2] === 2, [old, nw]);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-20', h: 6 }, to: { date: '2026-10-24', h: 9 } });
  ok('Đổi buổi không có trong phiếu → khong_co_buoi', r.why === 'khong_co_buoi', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-22', h: 7 } });
  ok('Đổi trong cùng ngày → cung_ngay', r.why === 'cung_ngay', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-23', h: 7 } });
  ok('Đổi sang ngày đã có buổi → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 8 } });
  ok('Đổi sang khung < 24 giờ (T4 08:00, 23 giờ nữa) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-24', h: 9 } });
  ok('Đổi sang ngày lễ → nghi', r.why === 'nghi', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-21', h: 19 } });
  ok('Đổi lần 2: T6 19:00 → T4 19:00 (ngày vừa trống sau lần đổi 1) → ok, hết lượt, bản 3', r.ok && r.mine.changesLeft === 0 && r.mine.ver === 3, r.error || r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-23', h: 20 } });
  ok('Lần đổi thứ 3 → het_luot_doi', r.error === 'het_luot_doi', r.error);
  ok('Sổ: 5 dòng, 2 Đã đổi, 3 Đã đặt', logRows(t).length === 5 && logRows(t).filter(x => x[11] === 'Đã đổi').length === 2, logRows(t).map(x => x[11]));
  ok('Phiếu cuối: T2 06:00 (đã tập) · T4 19:00 · T5 19:00', r.mine.sessions.map(x => x.date.slice(8) + '@' + x.h).join(',') === '19@6,21@19,22@19', r.mine.sessions);
}
{
  const t = setup(vn('2026-10-18', '07:00'));
  const s = login(t, 'duc nam', '0001');
  let r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  t.clock.now = vn('2026-10-21', '20:00');
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 20 } });
  ok('Buổi đã qua (T4 18:00 lúc T4 20:00) → buoi_duoi_24h', r.why === 'buoi_duoi_24h', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-22', h: 19 } });
  ok('Khung mới chỉ còn 23 giờ (T5 19:00) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-22', h: 20 } });
  ok('Khung mới đúng 24 giờ (T5 20:00) → ok', r.ok, r.error || r.why);
}
{
  const t = setup(vn('2026-10-18', '07:00'));
  const s = login(t, 'duc nam', '0001');
  let r = call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  ok('Phiếu mới chưa có vết đổi', r.ok && Array.isArray(r.mine.moves) && r.mine.moves.length === 0, r.mine && r.mine.moves);
  t.clock.now = vn('2026-10-20', '09:00');
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } });
  ok('Đổi 1: T4 18:00 → T5 19:00', r.ok, r.error || r.why);
  r = call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 20 } });
  ok('Đổi 2 trên chính buổi vừa đổi: T5 19:00 → T4 20:00', r.ok && r.mine.changesLeft === 0, r.error || r.why);
  ok('Vết đổi theo thứ tự: T4 18 → T5 19 → T4 20', JSON.stringify(r.mine.moves) === JSON.stringify([
    { from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } },
    { from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 20 } }]), r.mine.moves);
  const mid = logRows(t).find(x => x[4] === '2026-10-22');
  ok('Dòng giữa giữ "Đổi từ" và nối "Đổi sang" (không ghi đè)', mid[11] === 'Đã đổi' && mid[13] === 'Đổi từ T4 21.10 · 18:00 · Đổi sang T4 21.10 · 20:00', mid);
  const b = call(t, { action: 'lt_boot', tok: s.tok });
  ok('Mở lại trang vẫn đọc được vết đổi + phiên không lộ ghi chú', b.mine.moves.length === 2 && b.mine.sessions.every(x => Object.keys(x).join() === 'date,h,st'), b.mine);
}

console.log('\n== 10. Chưa mở đặt · khoá ghi · ảnh chụp danh sách ==');
{
  const t = setup(vn('2026-10-17', '22:40'));
  let r = call(t, { action: 'lt_boot' });
  ok('T7 22:40 chưa đăng nhập → open=false (mọi khung tuần 42 đã < 24 giờ) · mở CN 06:00 tuần 43', r.ok && r.auth === false && r.open === false && r.week.nextOpen === vn('2026-10-18', '06:00') && r.week.nextNo === 43, r);
  const s = login(t, 'duc nam', '0001');
  ok('Đăng nhập lúc đó → mode closed (không đặt được gì tuần 42)', s.mode === 'closed' && s.limits.max === 0, s.mode);
  const snap = t.files.OUT.getSheetByName('_dữ liệu');
  ok('Đăng nhập ghi ảnh chụp hội viên sang _dữ liệu (sức chứa, giờ, danh sách)', snap.cell(1, 2) === 4 && /^2026-10-17 22:40/.test(snap.cell(2, 2)) && snap.getLastRow() >= 5 && snap.rows.slice(4).some(x => x[5] === 'B901DY' && x[6] === 'H. Đức Nam · QH'), snap.rows.slice(0, 7));
  const t2 = setup(vn('2026-10-18', '07:00'), { lockBusy: true, props: { BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: 'bimatthu-khongdungthat' } });
  const s2 = login(t2, 'duc nam', '0001');
  r = call(t2, { action: 'lt_book', tok: s2.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Khoá ghi đang bận → he_thong_ban, không ghi', r.error === 'he_thong_ban' && logRows(t2).length === 0, r);
  r = call(t2, { action: 'lt_book', tok: 'abc.def', rid: rid(), week: '2026-W43', picks: [] });
  ok('Mã phiên giả → het_phien', r.error === 'het_phien', r);
  r = call(t2, { action: 'lt_book', tok: s2.tok, rid: 'x', week: '2026-W43', picks: [] });
  ok('Mã yêu cầu không hợp lệ → khong_hop_le/rid', r.why === 'rid', r);
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
