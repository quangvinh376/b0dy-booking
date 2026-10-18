/* Test 1 · PARITY: mọi kịch bản của test/gas_lt.js chạy song song trên LichTuan.gs (Apps Script giả) và Worker
   (Durable Object + Sheets API giả) — cùng dữ liệu bịa, cùng đồng hồ, cùng LT_SECRET.
   Mỗi lượt gọi: JSON hai bên phải giống hệt (so sau khi sắp khoá); sổ "Sổ đặt lịch" và "_dữ liệu" hai bên phải giống
   từng ô — so SAU KHI nhật ký ghi sau đã flush lên sheet (idle). Các phép kiểm hành vi của gas_lt.js chạy lại trên
   kết quả của Worker. Khác biệt duy nhất được phép: lt_ping của Worker có thêm 4 trường tình trạng nhật ký.
   Chạy: node test/parity.mjs */
import { createRequire } from 'module';
import * as C from '../src/core.js';
import { BookingCore } from '../src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { makeEnv, Spreadsheet, dateIn } = require('../../test/gas_env.js');

let pass = 0, fail = 0, same = 0, diff = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 700) : '')); }
}
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function firstDiff(a, b, path) {
  path = path || '$';
  if (canon(a) === canon(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) { const d = firstDiff(a[k], b[k], path + '.' + k); if (d) return d; }
  }
  return path + ': GAS=' + JSON.stringify(a) + ' WK=' + JSON.stringify(b);
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
const SA = fakeServiceAccount();

/** extra: hội viên bịa thêm [số, họ tên, coach, SĐT, Mã KH] (gói 48 buổi còn 20, hạn 2027) — dùng cho ma trận tìm tên */
function baSheets(extra) {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key'];
  const m = (no, name, pkg, kind, coach, phone, left, start, exp, code) =>
    ['', no, name, pkg, parseInt(pkg, 10), kind, 300000, coach, phone, '', '', '', 0, left, '', start ? d(start) : '', '', exp === '' ? '' : (typeof exp === 'string' && exp.indexOf('/') > 0 ? exp : d(exp)), code, name + '|' + start];
  const members = [
    ['', '— MEMBERS'], ['', 'test'], [], [], H,
    m('901', 'Hoàng Đức Nam', '72 buổi', '1:1', 'Quyết Hán', '0900000001', 20, '2026-07-01', '2027-01-01', 'B901DY'),
    m('902', 'Thử Ngọc Nam', '48 buổi', '1:2', 'Quyết Hán', '0900000002', 12, '2026-07-01', '2027-01-01', 'B902DY'),
    m('903A', 'Trần Thị Mỹ Linh', '24 buổi', '1:2', 'Hiền Mai (giai đoạn 1)', '0900000003', 0, '2026-08-01', '21/10/26', 'B903DY'),
    m('903B', 'Trần Thị Mỹ Linh', '24 buổi', '1:2', 'Hiền Mai', '', 5, '2026-09-01', '21/10/26', 'B903DY'),
    m('904', 'Lê Gia Phong', '12 buổi', '1:1', 'Khải Phan', '0900000004', 0, '2026-08-01', '2026-10-11', 'B904DY'),
    m('905', 'Lê Gia Phong', '36 buổi', '1:1', 'Khải Phan', '0900000004', 30, '2026-10-07', '2027-02-28', 'B905DY'),
    m('906', 'Đỗ Văn Hưng', '12 buổi', '1:1', 'Lâm Nguyễn', '0900000006', 1, '2026-08-01', '2026-12-01', 'B906DY'),
    m('907', 'Phan Thị Hà', '24 buổi', '1:1', 'Bích Ngọc', '0900000007', 24, '2026-10-21', '2027-01-01', 'B907DY'),
    m('908', 'Bùi Không Số', '24 buổi', '1:1', 'Bích Ngọc', '', 10, '2026-08-01', '2027-01-01', 'B908DY'),
    m('909', 'Mai Xuân Tú', '12 buổi', '1:1', 'Quyết Hán', '0900000009', 0, '2026-08-01', '2027-01-01', 'B909DY'),
    m('910', 'Cao Bảo Anh', '12 buổi', '1:1', 'Quyết Hán', '0900000010', 5, '2026-08-01', '2026-10-10', 'B910DY'),
    /* bốn khách bốn coach khác nhau (luật 18/10: mỗi coach một suất mỗi khung) — đủ 4 suất một khung */
    m('921', 'Khách Thứ Một', '48 buổi', '1:1', 'Quyết Hán', '0900000021', 20, '2026-08-01', '2027-01-01', 'B921DY'),
    m('922', 'Khách Thứ Hai', '48 buổi', '1:1', 'Hiền Mai', '0900000022', 20, '2026-08-01', '2027-01-01', 'B922DY'),
    m('923', 'Khách Thứ Ba', '48 buổi', '1:1', 'Khải Phan', '0900000023', 20, '2026-08-01', '2027-01-01', 'B923DY'),
    m('924', 'Khách Thứ Tư', '48 buổi', '1:1', 'Lâm Nguyễn', '0900000024', 20, '2026-08-01', '2027-01-01', 'B924DY'),
    /* hai khách 1:2 nữa của Quyết (cùng T. Ngọc Nam) — ghép cặp 1:2 cùng coach */
    m('925', 'Khách Cặp Một', '48 buổi', '1:2', 'Quyết Hán', '0900000025', 20, '2026-08-01', '2027-01-01', 'B925DY'),
    m('926', 'Khách Cặp Hai', '48 buổi', '1:2', 'Quyết Hán', '0900000026', 20, '2026-08-01', '2027-01-01', 'B926DY')
  ].concat((extra || []).map(e => m(e[0], e[1], '48 buổi', '1:1', e[2], e[3], 20, '2026-08-01', '2027-01-01', e[4])));
  const LH = ['', '#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử', '_mrow'];
  const log = [['', '— SESSION LOG'], ['', 'test'], [], LH,
    ['', '0001', d('2026-10-19'), 'T2', '', 'Quyết Hán', '', 'Hoàng Đức Nam', '901', '1:1', '', 'Đã tập', '', '', 'app 06:02 · ký: Quyết Hán', 1],
    ['', '0002', d('2026-10-19'), 'T2', '', 'Quyết Hán', '', 'Thử Ngọc Nam', '902', '1:2', '', 'Vắng', '', '', '', 2]];
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
/** log: dòng sổ có sẵn (17 cột B..R) — vd dòng ghi trước luật / chủ studio sửa tay */
function outSheets(log) {
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  return {
    'Bảng lịch tập': [['', '— LỊCH TẬP TUẦN']],
    'Sổ đặt lịch': [['', '— SỔ ĐẶT LỊCH'], ['', 'mô tả'], [], [''].concat(head)].concat((log || []).map(r => [''].concat(r))),
    '_dữ liệu': [['SỨC CHỨA / KHUNG', 4], ['CẬP NHẬT', ''], [], ['Hội viên', 'Tên ngắn', 'Coach', 'Còn lại', 'Hết hạn', 'Mã KH', '_hiển thị']]
  };
}
function setup(nowMs, opts) {
  opts = opts || {};
  const clock = { now: nowMs };
  const secret = (opts.props && opts.props.LT_SECRET) || SECRET;
  const files = { BA: new Spreadsheet('BA', LA, baSheets(opts.members)), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets(opts.log)) };
  files.OUT.title = '[B0DY Studio] Lịch tập tuần';
  const env = makeEnv(files, clock, Object.assign({}, opts, { props: Object.assign({ BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: secret }, opts.props || {}) }));
  const wfiles = { BA: new Spreadsheet('BA', LA, baSheets(opts.members)), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets(opts.log)) };
  const fg = new FakeGoogle(wfiles, { publicKey: SA.publicKey });
  const storage = new FakeStorage();
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: secret },
                               fetch: fg.fetch, now: () => clock.now, opts: { FLUSH_MS: 1, BACKOFF: [5, 10, 20] }, log: o => { flushLog.push(o); } });
  storage.onAlarm = () => wk.alarm();
  if (opts.lockBusy) { wk.cfg.LOCK_WAIT = 30; wk.testHold = new Promise(r => setTimeout(r, 150)); }
  return { env, clock, files, wfiles, fg, wk, log: files.OUT.getSheetByName('Sổ đặt lịch'), wlog: wfiles.OUT.getSheetByName('Sổ đặt lịch') };
}
const DEV = 'devAAAAAAAAAAAAAAAAAAAA', DEV2 = 'devBBBBBBBBBBBBBBBBBBBB';
const flushLog = [];
const PING_EXTRA = ['pending', 'oldestMs', 'lastFlushAt', 'lastError'];
/** afterApi: chạy ngay sau khi Worker trả lời, trước khi đợi DO rảnh (vd thả "khoá đang bận") */
async function call(t, body, afterApi) {
  const b = Object.assign({ dev: DEV }, body);
  const g = JSON.parse(JSON.stringify(t.env.ltDoPost_(structuredClone(b))));
  const w = JSON.parse(JSON.stringify(await t.wk.api(structuredClone(b))));
  if (afterApi) afterApi();
  await t.wk.idle();
  if (b.action === 'lt_ping') {
    ok('lt_ping của Worker có thêm tình trạng nhật ký (' + PING_EXTRA.join(', ') + '), không có dữ liệu cá nhân',
       PING_EXTRA.every(k => k in w) && typeof w.pending === 'number' && typeof w.lastError === 'string', w);
    PING_EXTRA.forEach(k => { delete w[k]; });
  }
  const dd = firstDiff(g, w);
  if (dd) { diff++; console.log('  DIFF  ' + b.action + ' ' + dd.slice(0, 600)); } else same++;
  return w;
}
let ridN = 0; const rid = () => 'rid' + String(++ridN).padStart(8, '0');
async function login(t, q, pin, dev) {
  const f = await call(t, { action: 'lt_find', q, dev: dev || DEV });
  const id = f.results && f.results[0] && f.results[0].id;
  return call(t, { action: 'lt_verify', id, pin, remember: true, dev: dev || DEV });
}
function sheetRows(sh) { return sh.rows.map(r => r.map(v => (v instanceof Date ? 'D:' + v.getTime() : v))); }
function sameSheets(t, label) {
  for (const name of ['Sổ đặt lịch', '_dữ liệu']) {
    const a = sheetRows(t.files.OUT.getSheetByName(name)), b = sheetRows(t.wfiles.OUT.getSheetByName(name));
    const trim = rows => { const x = rows.map(r => { let k = r.length; while (k && (r[k - 1] === '' || r[k - 1] == null)) k--; return r.slice(0, k); }); let n = x.length; while (n && !x[n - 1].length) n--; return x.slice(0, n); };
    const A = JSON.stringify(trim(a)), B = JSON.stringify(trim(b));
    if (A === B) same++; else { diff++; console.log('  DIFF  sheet ' + name + ' (' + label + ')\n    GAS ' + A.slice(0, 900) + '\n    WK  ' + B.slice(0, 900)); }
  }
}
function logRows(t) { sameSheets(t, 'logRows'); return t.wlog.rows.slice(4).filter(r => r[1]); }

/* ------------------------------------------------------------------ */
console.log('\n== 1. Thời gian · tuần ISO · cửa sổ đặt (so hàm lõi) ==');
{
  const t = setup(vn('2026-10-17', '12:00'));
  const e = t.env;
  const times = [['2026-10-17', '12:00'], ['2026-10-18', '05:59'], ['2026-10-18', '06:00'], ['2026-10-19', '00:00'], ['2026-12-27', '06:00'], ['2026-12-31', '23:59'], ['2027-01-03', '05:00'], ['2027-01-03', '07:00']];
  let allSame = true;
  times.forEach(([iso, hm]) => { const ms = vn(iso, hm); if (canon(e.ltWeekCtx_(ms)) !== canon(C.weekCtx(ms))) { allSame = false; console.log('    weekCtx lệch', iso, hm); } });
  ok('weekCtx giống hệt Apps Script ở 8 mốc (có giao năm, tuần 53)', allSame);
  let c = C.weekCtx(vn('2026-10-17', '12:00'));
  ok('T7 17.10 12:00 → tuần này (W42), phase late, báo trước 24 giờ', c.key === '2026-W42' && c.mon === '2026-10-12' && c.phase === 'late' && c.lead === 864e5, c);
  ok('… lần mở kế tiếp = CN 18.10 06:00 (tuần 43)', c.nextOpen === vn('2026-10-18', '06:00') && c.nextNo === 43, c);
  c = C.weekCtx(vn('2026-10-18', '05:59'));
  ok('CN 05:59 → vẫn tuần 42 (phase before) · mở lúc 06:00 hôm nay', c.key === '2026-W42' && c.phase === 'before' && c.nextOpen === vn('2026-10-18', '06:00'), c);
  c = C.weekCtx(vn('2026-10-18', '06:00'));
  ok('CN 06:00 → tuần 43 (19–24.10), phase open, không cần báo trước', c.key === '2026-W43' && c.mon === '2026-10-19' && c.days.length === 6 && c.days[5] === '2026-10-24' && c.phase === 'open' && c.lead === 0, c);
  c = C.weekCtx(vn('2026-10-19', '00:00'));
  ok('T2 19.10 00:00 → tuần 43, phase late, báo trước 24 giờ', c.key === '2026-W43' && c.phase === 'late' && c.lead === 864e5, c);
  ok('Tuần ISO: 28.12.2026 = 2026-W53 · 04.01.2027 = 2027-W01 · 01.01.2027 = 2026-W53',
     C.weekKey('2026-12-28') === '2026-W53' && C.weekKey('2027-01-04') === '2027-W01' && C.isoWeek('2027-01-01').week === 53);
  ok('Giờ khung theo giờ Việt Nam: 19.10 06:00 = 18.10 23:00 UTC', C.slotMs('2026-10-19', 6) === Date.UTC(2026, 9, 18, 23, 0));
}

console.log('\n== 2. Tên · đọc MEMBERS · gộp gói ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const e = t.env;
  const names = ['Hoàng Đức Nam', 'Đỗ Văn Hưng', 'Trần Thị Mỹ Linh', 'Thử Thị Hà', 'Thử Quang Minh', 'Mẫu Sao Băng', 'An', '  Bùi   Thị  Ánh  Dương ', 'Ðặng Ðức Ðạt'];
  ok('Tên ngắn / tên chào / fold giống Apps Script (9 tên, có Đ kiểu Ð)', names.every(n => e.ltShort_(n) === C.short(n) && e.ltCall_(n) === C.callName(n) && e.ltName_(n) === C.nameKey(n) && e.ltFold_(n) === C.fold(n)));
  ok('Tên ngắn và tên chào', C.short('Hoàng Đức Nam') === 'H. Đức Nam' && C.callName('Hoàng Đức Nam') === 'Đức Nam' && C.callName('Đỗ Văn Hưng') === 'Hưng' && C.callName('Trần Thị Mỹ Linh') === 'Mỹ Linh' && C.callName('Thử Thị Hà') === 'Hà' && C.callName('Trần Gia Bảo Linh') === 'Gia Bảo Linh' && C.callName('Nguyễn Thị Mỹ Ngọc') === 'Mỹ Ngọc');
  ok('Bỏ hậu tố coach · viết tắt coach', C.coachName('Hiền Mai (giai đoạn 1)') === 'Hiền Mai' && C.initials('Quyết Hán') === 'QH');
  const gasP = e.ltPersons_(e.ltMemberRows_(), '2026-10-18');
  await t.wk.loadBA();
  const persons = C.persons(t.wk.ba.members, '2026-10-18');
  ok('PARITY: danh sách hội viên (đọc qua Sheets API, ngày serial) giống hệt Apps Script', canon(gasP) === canon(persons), firstDiff(gasP, persons));
  ok('PARITY: đóng cửa / sức chứa / tập thử W43 giống hệt', canon(e.ltClosures_()) === canon(t.wk.ba.closed) && e.ltCap_() === t.wk.ba.cap &&
     canon(e.ltTrials_(C.weekCtx(t.clock.now).days)) === canon(C.trialsFrom(t.wk.ba.trialRows, C.weekCtx(t.clock.now).days)));
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
  let r = await call(t, { action: 'lt_find', q: 'duc nam' });
  ok('"duc nam" (không dấu) → H. Đức Nam, kèm coach, không lộ SĐT', r.ok && r.results.length === 1 && r.results[0].short === 'H. Đức Nam' && r.results[0].coach === 'Quyết Hán' && JSON.stringify(r).indexOf('0900') < 0, r);
  r = await call(t, { action: 'lt_find', q: '  Đức   NAM ' });
  ok('"Đức NAM" (có dấu, hoa, thừa cách) → cùng kết quả', r.results.length === 1 && r.results[0].short === 'H. Đức Nam', r);
  r = await call(t, { action: 'lt_find', q: 'nam' });
  ok('Một chữ "nam" → ra ngay hai người tên gọi Nam (không còn need)', r.ok && !('need' in r) && !('more' in r) && r.results.map(x => x.short).join() === 'H. Đức Nam,T. Ngọc Nam', r);
  r = await call(t, { action: 'lt_find', q: 'duc n' });
  ok('Chữ cuối gõ dở "duc n" → vẫn ra', r.results.length === 1, r);
  r = await call(t, { action: 'lt_find', q: 'hoang duc nam' });
  ok('Gõ đủ họ tên → ra', r.results.length === 1, r);
  r = await call(t, { action: 'lt_find', q: 'hoang duc' });
  ok('Họ + tên đệm (không phải phần cuối) → không ra', r.results.length === 0, r);
  r = await call(t, { action: 'lt_find', q: 'xuan tu' });
  ok('Hết buổi → không có trong danh sách', r.results.length === 0, r);
  r = await call(t, { action: 'lt_find', q: 'gia phong' });
  ok('Hai hợp đồng cùng tên → một kết quả', r.results.length === 1, r);
  /* giới hạn 300 lượt / máy / khung 10 phút: đếm trên một máy riêng */
  const DEVQ = 'devQQQQQQQQQQQQQQQQQQQQ';
  for (let i = 0; i < 300; i++) r = await call(t, { action: 'lt_find', q: ['n', 'thu mot', 'th', 'duc'][i % 4], dev: DEVQ });
  ok('Lượt tìm thứ 300 trong khung 10 phút → vẫn trả kết quả', r.ok === true && r.results.length === 1, r);
  r = await call(t, { action: 'lt_find', q: 'nam', dev: DEVQ });
  ok('Lượt thứ 301 → cham_lai (giống Apps Script)', r.ok === false && r.error === 'cham_lai' && !('results' in r), r);
  r = await call(t, { action: 'lt_find', q: 'nam' });
  ok('… máy khác vẫn tìm được', r.ok === true && r.results.length === 2, r);
  t.clock.now += 10 * 60e3 + 1000;
  r = await call(t, { action: 'lt_find', q: 'nam', dev: DEVQ });
  ok('… hết 10 phút → máy đó tìm lại được', r.ok === true && r.results.length === 2, r);
}

console.log('\n== 4. Xác minh · khoá máy · nhớ máy ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const id = (await call(t, { action: 'lt_find', q: 'duc nam' })).results[0].id;
  let r;
  for (let i = 1; i <= 4; i++) {
    r = await call(t, { action: 'lt_verify', id, pin: '1234', remember: true });
    ok('Sai lần ' + i + ' → sai_ma, còn ' + (5 - i) + ' lần', r.ok === false && r.error === 'sai_ma' && r.left === 5 - i, r);
  }
  r = await call(t, { action: 'lt_verify', id, pin: '9999' });
  ok('Sai lần 5 → khoá 15 phút', r.error === 'khoa' && r.until === t.clock.now + 15 * 60000, r);
  r = await call(t, { action: 'lt_verify', id, pin: '0001', remember: true });
  ok('Đang khoá thì mã đúng cũng không vào', r.error === 'khoa', r);
  r = await call(t, { action: 'lt_verify', id, pin: '0001', remember: true, dev: DEV2 });
  ok('Máy khác không bị khoá → vào được', r.ok === true && r.auth === true && !!r.tok, r.error);
  t.clock.now += 15 * 60000 + 1000;
  r = await call(t, { action: 'lt_verify', id, pin: '0001', remember: true });
  ok('Hết 15 phút → máy cũ vào được, mã nhớ máy 60 ngày', r.ok && r.tokExp - t.clock.now === 60 * 864e5, r.error);
  const tok = r.tok;
  r = await call(t, { action: 'lt_verify', id, pin: '0001', remember: false });
  ok('Không tick nhớ máy → mã 12 giờ', r.ok && r.tokExp - t.clock.now === 12 * 3600e3);
  r = await call(t, { action: 'lt_boot', tok });
  ok('Mở lại bằng mã nhớ máy → vào thẳng (auth, mode book)', r.ok && r.auth && r.mode === 'book' && r.me.short === 'H. Đức Nam', r);
  ok('… state không có SĐT', JSON.stringify(r).indexOf('0900000001') < 0);
  r = await call(t, { action: 'lt_boot', tok, dev: DEV2 });
  ok('Mã nhớ máy dùng ở máy khác → không nhận', r.ok && r.auth === false && r.why === 'het_phien', r);
  r = await call(t, { action: 'lt_boot', tok: tok.slice(0, -2) + 'xx' });
  ok('Mã bị sửa → không nhận', r.auth === false, r);
  t.clock.now += 61 * 864e5;
  r = await call(t, { action: 'lt_boot', tok });
  ok('Quá 60 ngày → hết phiên', r.auth === false && r.why === 'het_phien', r);
  const t2 = setup(vn('2026-10-18', '07:00'));
  const id2 = (await call(t2, { action: 'lt_find', q: 'khong so' })).results[0].id;
  r = await call(t2, { action: 'lt_verify', id: id2, pin: '0000' });
  ok('Hồ sơ chưa có SĐT → chua_co_sdt (không tính lần sai)', r.error === 'chua_co_sdt', r);
  r = await call(t2, { action: 'lt_verify', id: 'khongtontai', pin: '0000' });
  ok('id lạ → khong_thay', r.error === 'khong_thay', r);
  r = await call(t2, { action: 'lt_boot', dev: 'ngan' });
  ok('Thiếu mã máy hợp lệ → thieu_may', r.error === 'thieu_may', r);
  r = await call(t2, { action: 'lt_ping' });
  ok('lt_ping', r.ok === true && r.now === t2.clock.now, r);
  r = await call(t2, { action: 'lt_xyz' });
  ok('Lệnh lạ → unknown_action', r.error === 'unknown_action', r);
  /* khoá theo TÊN: 20 lần sai/giờ trên một tên (từ 4 máy) → khoá tên 15 phút */
  const t3 = setup(vn('2026-10-18', '07:00'));
  const id3 = (await call(t3, { action: 'lt_find', q: 'duc nam' })).results[0].id;
  for (let i = 0; i < 20; i++) r = await call(t3, { action: 'lt_verify', id: id3, pin: '1111', dev: 'devTENTENTENTENTEN' + (i % 4) });
  r = await call(t3, { action: 'lt_verify', id: id3, pin: '0001', dev: 'devMOIMOIMOIMOIMOI9' });
  ok('20 lần sai trên một tên từ nhiều máy → khoá tên (máy mới cũng bị chặn)', r.error === 'khoa', r);
}

console.log('\n== 5. Đặt lịch Chủ Nhật (tuần 43) ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const st = await login(t, 'duc nam', '0001');
  const tok = st.tok;
  ok('Trước khi đặt: mode book, giới hạn 2–4', st.mode === 'book' && st.limits.min === 2 && st.limits.max === 4, st.limits);
  ok('Ngày lễ T7 24.10 (B0B) khoá', st.week.closed['2026-10-24'] === 'Nghỉ lễ thử', st.week.closed);
  ok('Khách tập thử (không huỷ) chiếm chỗ T3 18:00', st.taken['2026-10-20|18'] === 1, st.taken);
  let r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }] });
  ok('1 buổi < tối thiểu 2 → it_hon_toi_thieu, không ghi gì', r.error === 'it_hon_toi_thieu' || r.why === 'it_hon_toi_thieu', r.error + '/' + r.why);
  ok('… sổ vẫn trống', logRows(t).length === 0);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-19', h: 18 }] });
  ok('Hai buổi cùng ngày → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 12 }, { date: '2026-10-21', h: 18 }] });
  ok('Khung 12:00 (nghỉ trưa) → khung', r.why === 'khung', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-25', h: 8 }, { date: '2026-10-21', h: 18 }] });
  ok('Chủ Nhật → ngoai_tuan', r.why === 'ngoai_tuan', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-24', h: 8 }, { date: '2026-10-21', h: 18 }] });
  ok('Ngày lễ → nghi', r.why === 'nghi', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W42', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Gửi nhầm tuần → tuan_doi', r.error === 'tuan_doi', r.error);
  const R1 = rid();
  r = await call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', picks: [{ date: '2026-10-23', h: 19 }, { date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Đặt 3 buổi (T2 06:00, T4 18:00, T6 19:00) → ok, mode ticket', r.ok && r.mode === 'ticket' && r.mine.sessions.length === 3, r.error || r.why);
  const rows = logRows(t);
  ok('Sổ có 3 dòng, sắp theo ngày, đủ cột', rows.length === 3 && rows[0][4] === '2026-10-19' && rows[0][6] === '06:00' && rows[0][5] === 'T2' && rows[2][4] === '2026-10-23', rows.map(x => x.slice(1, 8)));
  ok('Mã phiếu B901DY-W43 · bản 1 · Đặt · Đã đặt · mã KH · hiển thị "H. Đức Nam · QH"',
     rows.every(x => x[1] === 'B901DY-W43' && x[2] === 1 && x[3] === '2026-W43' && x[11] === 'Đã đặt' && x[12] === 'Đặt' && x[15] === R1 && x[16] === 'B901DY' && x[17] === 'H. Đức Nam · QH'), rows[0]);
  ok('Tên đầy đủ, tên ngắn, coach, loại', rows[0][7] === 'Hoàng Đức Nam' && rows[0][8] === 'H. Đức Nam' && rows[0][9] === 'Quyết Hán' && rows[0][10] === '1:1', rows[0]);
  ok('Lúc ghi theo giờ VN', rows[0][14] === '2026-10-18 07:00:00', rows[0][14]);
  ok('Phiếu bản 1, còn 2 lượt đổi, buổi T2 06:00 chưa tập (on)', r.mine.ver === 1 && r.mine.changesLeft === 2 && r.mine.sessions[0].st === 'on', r.mine);
  r = await call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', picks: [{ date: '2026-10-23', h: 19 }, { date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] });
  ok('Gửi lại cùng mã yêu cầu → dup, không tạo dòng trùng', r.ok && r.dup === true && logRows(t).length === 3, r);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 7 }, { date: '2026-10-22', h: 7 }] });
  ok('Đã có 3 buổi, thêm 2 → quá 4 (qua_so_buoi)', r.why === 'qua_so_buoi', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-21', h: 7 }] });
  ok('Thêm vào ngày đã có buổi → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-22', h: 7 }] });
  ok('Thêm buổi thứ 4 → ok, bản 2, thao tác Thêm, không tính lượt đổi', r.ok && r.mine.sessions.length === 4 && r.mine.ver === 2 && r.mine.changesLeft === 2 && logRows(t)[3][12] === 'Thêm', r.error || r.why);
  ok('Đủ 4 buổi → limits.add = 0', r.limits.add === 0, r.limits);
}

console.log('\n== 6. Sức chứa 4/khung (hội viên + tập thử) · nguyên tắc tất cả hoặc không ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const names = ['thu mot', 'thu hai', 'thu ba'];
  for (let i = 0; i < names.length; i++) {
    const s = await login(t, names[i], String(21 + i).padStart(4, '0'));
    const r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 18 }, { date: '2026-10-22', h: 18 }] });
    ok('Khách ' + (i + 1) + ' đặt T3 18:00 + T5 18:00', r.ok, r.error || r.why);
  }
  const s4 = await login(t, 'thu tu', '0024');
  ok('T3 18:00 đã 3 hội viên (3 coach) + 1 tập thử = 4 suất → đầy', s4.taken['2026-10-20|18'] === 4, s4.taken);
  let r = await call(t, { action: 'lt_book', tok: s4.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-20', h: 18 }] });
  ok('Khách 4 chọn T3 18:00 → het_cho, chỉ ra khung đầy', r.error === 'het_cho' && r.full.length === 1 && r.full[0].date === '2026-10-20' && r.full[0].h === 18, r);
  ok('… không ghi buổi T2 nào (tất cả hoặc không)', logRows(t).filter(x => x[16] === 'B924DY').length === 0);
  r = await call(t, { action: 'lt_book', tok: s4.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-22', h: 18 }] });
  ok('T5 18:00 (3/4) vẫn đặt được → ok', r.ok && r.taken['2026-10-22|18'] === 4, r.error || r.why);
}

console.log('\n== 7. Giới hạn theo gói: còn ít buổi · hết hạn giữa tuần · chưa bắt đầu ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  let s = await login(t, 'van hung', '0006');
  ok('Còn 1 buổi → tối thiểu 1, tối đa 1', s.limits.min === 1 && s.limits.max === 1, s.limits);
  let r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 8 }, { date: '2026-10-20', h: 8 }] });
  ok('Đặt 2 buổi khi còn 1 → qua_so_buoi', r.why === 'qua_so_buoi', r.why);
  r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 8 }] });
  ok('Đặt 1 buổi → ok', r.ok, r.error || r.why);
  s = await login(t, 'my linh', '0003');
  ok('Hết hạn T4 21.10: tối đa 3 (T2–T4), hiện exp', s.limits.max === 3 && s.me.exp === '2026-10-21', s.limits);
  r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-22', h: 9 }] });
  ok('Buổi sau ngày hết hạn → het_han', r.why === 'het_han', r.why);
  s = await login(t, 'thi ha', '0007');
  ok('Gói bắt đầu T4 21.10: tối đa 3 ngày (T4–T6, T7 nghỉ lễ)', s.limits.max === 3, s.limits);
  r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-22', h: 9 }] });
  ok('Buổi trước ngày bắt đầu → chua_bat_dau', r.why === 'chua_bat_dau', r.why);
}

console.log('\n== 8. Đặt muộn (T2–T7): khung phải cách ≥ 24 giờ ==');
{
  const t = setup(vn('2026-10-19', '10:00'));
  const s = await login(t, 'ngoc nam', '0002');
  ok('T2 10:00 → tuần 43, phase late', s.week.key === '2026-W43' && s.week.phase === 'late' && s.week.lead === true, s.week);
  let r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 9 }, { date: '2026-10-21', h: 9 }] });
  ok('T3 09:00 (23 giờ nữa) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-20', h: 10 }, { date: '2026-10-21', h: 9 }] });
  ok('T3 10:00 (đúng 24 giờ) → ok', r.ok, r.error || r.why);
  ok('Điểm danh SESSION LOG: T2 19.10 "Vắng" không nằm trong phiếu nên không hiện', r.mine.sessions.every(x => x.date !== '2026-10-19'));
}

console.log('\n== 9. Đổi lịch: tối đa 2 lần, ngày khác, cả hai khung ≥ 24 giờ ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  let s = await login(t, 'duc nam', '0001');
  let r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  ok('Đặt 3 buổi', r.ok, r.error);
  t.clock.now = vn('2026-10-20', '09:00');
  const tok9 = s.tok;
  s = await call(t, { action: 'lt_boot', tok: tok9 });
  s.tok = tok9;
  ok('T3 09:00: phiếu có buổi T2 đã tập (SESSION LOG) · còn 2 lượt đổi', s.mode === 'ticket' && s.mine.sessions[0].st === 'done' && s.mine.changesLeft === 2, s.mine);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } });
  ok('Đổi T4 18:00 (33 giờ nữa) → T5 19:00 → ok, bản 2, còn 1 lượt', r.ok && r.mine.ver === 2 && r.mine.changesLeft === 1 && r.mine.sessions.some(x => x.date === '2026-10-22' && x.h === 19), r.error || r.why);
  const rows = logRows(t);
  const old = rows.find(x => x[4] === '2026-10-21'), nw = rows.find(x => x[4] === '2026-10-22');
  ok('Dòng cũ → Đã đổi + "Đổi sang T5 22.10 · 19:00"; dòng mới Đổi + "Đổi từ T4 21.10 · 18:00"', old[11] === 'Đã đổi' && old[13] === 'Đổi sang T5 22.10 · 19:00' && nw[11] === 'Đã đặt' && nw[12] === 'Đổi' && nw[13] === 'Đổi từ T4 21.10 · 18:00' && nw[2] === 2, [old, nw]);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-20', h: 6 }, to: { date: '2026-10-24', h: 9 } });
  ok('Đổi buổi không có trong phiếu → khong_co_buoi', r.why === 'khong_co_buoi', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-22', h: 7 } });
  ok('Đổi trong cùng ngày → cung_ngay', r.why === 'cung_ngay', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-23', h: 7 } });
  ok('Đổi sang ngày đã có buổi → mot_ngay_mot_buoi', r.why === 'mot_ngay_mot_buoi', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 8 } });
  ok('Đổi sang khung < 24 giờ (T4 08:00, 23 giờ nữa) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-24', h: 9 } });
  ok('Đổi sang ngày lễ → nghi', r.why === 'nghi', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-21', h: 19 } });
  ok('Đổi lần 2: T6 19:00 → T4 19:00 (ngày vừa trống sau lần đổi 1) → ok, hết lượt, bản 3', r.ok && r.mine.changesLeft === 0 && r.mine.ver === 3, r.error || r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-23', h: 20 } });
  ok('Lần đổi thứ 3 → het_luot_doi', r.error === 'het_luot_doi', r.error);
  ok('Sổ: 5 dòng, 2 Đã đổi, 3 Đã đặt', logRows(t).length === 5 && logRows(t).filter(x => x[11] === 'Đã đổi').length === 2, logRows(t).map(x => x[11]));
  ok('Phiếu cuối: T2 06:00 (đã tập) · T4 19:00 · T5 19:00', r.mine.sessions.map(x => x.date.slice(8) + '@' + x.h).join(',') === '19@6,21@19,22@19', r.mine.sessions);
}
{
  const t = setup(vn('2026-10-18', '07:00'));
  const s = await login(t, 'duc nam', '0001');
  let r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  t.clock.now = vn('2026-10-21', '20:00');
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 20 } });
  ok('Buổi đã qua (T4 18:00 lúc T4 20:00) → buoi_duoi_24h', r.why === 'buoi_duoi_24h', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-22', h: 19 } });
  ok('Khung mới chỉ còn 23 giờ (T5 19:00) → duoi_24h', r.why === 'duoi_24h', r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-23', h: 19 }, to: { date: '2026-10-22', h: 20 } });
  ok('Khung mới đúng 24 giờ (T5 20:00) → ok', r.ok, r.error || r.why);
}
{
  const t = setup(vn('2026-10-18', '07:00'));
  const s = await login(t, 'duc nam', '0001');
  let r = await call(t, { action: 'lt_book', tok: s.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }, { date: '2026-10-23', h: 19 }] });
  ok('Phiếu mới chưa có vết đổi', r.ok && Array.isArray(r.mine.moves) && r.mine.moves.length === 0, r.mine && r.mine.moves);
  t.clock.now = vn('2026-10-20', '09:00');
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } });
  ok('Đổi 1: T4 18:00 → T5 19:00', r.ok, r.error || r.why);
  r = await call(t, { action: 'lt_change', tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 20 } });
  ok('Đổi 2 trên chính buổi vừa đổi: T5 19:00 → T4 20:00', r.ok && r.mine.changesLeft === 0, r.error || r.why);
  ok('Vết đổi theo thứ tự: T4 18 → T5 19 → T4 20', JSON.stringify(r.mine.moves) === JSON.stringify([
    { from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } },
    { from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-21', h: 20 } }]), r.mine.moves);
  const mid = logRows(t).find(x => x[4] === '2026-10-22');
  ok('Dòng giữa giữ "Đổi từ" và nối "Đổi sang" (không ghi đè)', mid[11] === 'Đã đổi' && mid[13] === 'Đổi từ T4 21.10 · 18:00 · Đổi sang T4 21.10 · 20:00', mid);
  const b = await call(t, { action: 'lt_boot', tok: s.tok });
  ok('Mở lại trang vẫn đọc được vết đổi + phiên không lộ ghi chú', b.mine.moves.length === 2 && b.mine.sessions.every(x => Object.keys(x).join() === 'date,h,st'), b.mine);
}

console.log('\n== 10. Chưa mở đặt · khoá ghi · ảnh chụp danh sách ==');
{
  const t = setup(vn('2026-10-17', '22:40'));
  let r = await call(t, { action: 'lt_boot' });
  ok('T7 22:40 chưa đăng nhập → open=false (mọi khung tuần 42 đã < 24 giờ) · mở CN 06:00 tuần 43', r.ok && r.auth === false && r.open === false && r.week.nextOpen === vn('2026-10-18', '06:00') && r.week.nextNo === 43, r);
  const s = await login(t, 'duc nam', '0001');
  ok('Đăng nhập lúc đó → mode closed (không đặt được gì tuần 42)', s.mode === 'closed' && s.limits.max === 0, s.mode);
  const snap = t.wfiles.OUT.getSheetByName('_dữ liệu');
  ok('Đăng nhập ghi ảnh chụp hội viên sang _dữ liệu (sức chứa, giờ, danh sách)', snap.cell(1, 2) === 4 && /^2026-10-17 22:40/.test(snap.cell(2, 2)) && snap.getLastRow() >= 5 && snap.rows.slice(4).some(x => x[5] === 'B901DY' && x[6] === 'H. Đức Nam · QH'), snap.rows.slice(0, 7));
  sameSheets(t, 'ảnh chụp _dữ liệu');
  const t2 = setup(vn('2026-10-18', '07:00'), { lockBusy: true, props: { BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: 'bimatthu-khongdungthat' } });
  const s2 = await login(t2, 'duc nam', '0001');
  /* khoá giữ tới khi Worker đã trả lời — không dựa vào 150 ms tính từ lúc setup (máy đang tải nặng thì login đã ăn hết 150 ms) */
  let release; t2.wk.testHold = new Promise(res => { release = res; });
  r = await call(t2, { action: 'lt_book', tok: s2.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }] }, () => release());
  ok('Khoá ghi đang bận → he_thong_ban, không ghi', r.error === 'he_thong_ban' && logRows(t2).length === 0, r);
  r = await call(t2, { action: 'lt_book', tok: 'abc.def', rid: rid(), week: '2026-W43', picks: [] });
  ok('Mã phiên giả → het_phien', r.error === 'het_phien', r);
  r = await call(t2, { action: 'lt_book', tok: s2.tok, rid: 'x', week: '2026-W43', picks: [] });
  ok('Mã yêu cầu không hợp lệ → khong_hop_le/rid', r.why === 'rid', r);
}

console.log('\n== 11. Bản phiếu (base): lệnh mất phản hồi rồi gửi lựa chọn khác → không thành thêm buổi ==');
{
  const t = setup(vn('2026-10-18', '07:00'));
  const s = await login(t, 'duc nam', '0001'), tok = s.tok;
  ok('Chưa đặt: bản phiếu 0', s.mine.ver === 0, s.mine.ver);
  const R1 = rid();
  let r = await call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', base: 0, picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-21', h: 18 }] });
  ok('Đặt T2 + T4 với base 0 → ok, bản 1', r.ok && r.mine.ver === 1 && logRows(t).length === 2, r.error || r.why);
  /* phản hồi trên bị mất: máy khách vẫn nghĩ bản 0, khách đổi ý chọn T3 + T5 rồi gửi */
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', base: 0, picks: [{ date: '2026-10-20', h: 18 }, { date: '2026-10-22', h: 18 }] });
  ok('Gửi lựa chọn khác với base 0 khi sổ đã bản 1 → ban_cu, không ghi thêm dòng nào', r.ok === false && r.error === 'ban_cu' && logRows(t).length === 2, [r.error, logRows(t).length]);
  ok('… kèm state mới nhất (phiếu T2 + T4, bản 1) để trang hiện đúng', r.mode === 'ticket' && r.mine.ver === 1 && r.mine.sessions.map(x => x.date).join() === '2026-10-19,2026-10-21', r.mine);
  r = await call(t, { action: 'lt_book', tok, rid: R1, week: '2026-W43', base: 0, picks: [{ date: '2026-10-19', h: 18 }, { date: '2026-10-21', h: 18 }] });
  ok('Gửi lại đúng lệnh cũ (cùng mã yêu cầu, base 0) → dup ok (kiểm trùng trước kiểm bản)', r.ok && r.dup === true && logRows(t).length === 2, r.error);
  r = await call(t, { action: 'lt_book', tok, rid: rid(), week: '2026-W43', base: '1', picks: [{ date: '2026-10-23', h: 18 }] });
  ok('Thêm buổi với base "1" (chuỗi số) → ok, bản 2', r.ok && r.mine.ver === 2 && logRows(t).length === 3, r.error || r.why);
  r = await call(t, { action: 'lt_change', tok, rid: rid(), week: '2026-W43', base: 1, from: { date: '2026-10-19', h: 18 }, to: { date: '2026-10-20', h: 18 } });
  ok('Đổi buổi với base 1 khi sổ đã bản 2 → ban_cu, sổ không đổi', r.error === 'ban_cu' && logRows(t).length === 3 && r.mine.changesLeft === 2, [r.error, logRows(t).length]);
  r = await call(t, { action: 'lt_change', tok, rid: rid(), week: '2026-W43', base: 2, from: { date: '2026-10-19', h: 18 }, to: { date: '2026-10-20', h: 18 } });
  ok('Đổi buổi với base 2 → ok, bản 3', r.ok && r.mine.ver === 3 && r.mine.changesLeft === 1, r.error || r.why);
  r = await call(t, { action: 'lt_change', tok, rid: rid(), week: '2026-W43', base: 'x', from: { date: '2026-10-20', h: 18 }, to: { date: '2026-10-22', h: 18 } });
  ok('base không phải số → ban_cu (không đoán)', r.error === 'ban_cu', r.error);
  r = await call(t, { action: 'lt_change', tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-20', h: 18 }, to: { date: '2026-10-22', h: 18 } });
  ok('Không gửi base (máy khách cũ) → kiểm như trước: ok, bản 4', r.ok && r.mine.ver === 4, r.error || r.why);
  const t2 = setup(vn('2026-10-21', '08:00'));
  const s2 = await login(t2, 'duc nam', '0001');
  r = await call(t2, { action: 'lt_book', tok: s2.tok, rid: rid(), week: '2026-W43', base: 0, picks: [{ date: '2026-10-21', h: 20 }, { date: '2026-10-23', h: 18 }] });
  ok('Lỗi theo khung (đặt muộn T4 20:00 dưới 24 giờ) → trả kèm date + h để trang gọi đúng tên khung', r.why === 'duoi_24h' && r.date === '2026-10-21' && r.h === 20, [r.why, r.date, r.h]);
}

console.log('\n== 12. Tìm tên gõ tới đâu ra tới đó: ma trận chữ gõ (mỗi phản hồi Worker = Apps Script) ==');
{
  /* hội viên bịa thêm (rõ là tên giả): trùng họ tên khác Mã KH, tên một chữ, tên có gạch nối, tên đệm Nam, tên gọi An / Anh */
  const EXTRA = [
    ['931', 'Khách Thử Đức Anh', 'Quyết Hán', '0900000031', 'B931DY'],
    ['932', 'Khách Thử Khôi', 'Hiền Mai', '0900000032', 'B932DY'],
    ['933', 'Khách Thử An', 'Quyết Hán', '0900000033', 'B933DY'],
    ['934', 'Khách Thử Anh', 'Hiền Mai', '0900000034', 'B934DY'],
    ['935', 'Khách Thử Nam Phong', 'Quyết Hán', '0900000035', 'B935DY'],
    ['936', 'Mẫu Thử Ngọc Ánh', 'Hiền Mai', '0900000036', 'B936DY'],
    ['937', 'Mẫu Thử Hà-Linh', 'Quyết Hán', '0900000037', 'B937DY'],
    ['938', 'Khách Thử Đức Anh', 'Hiền Mai', '0900000038', 'B938DY'],
    ['939', 'Khách Thử Ngọc Bảo Anh', 'Quyết Hán', '0900000039', 'B939DY'],
    ['940', 'Thửnghiệm', 'Hiền Mai', '0900000040', 'B940DY']
  ];
  const t = setup(vn('2026-10-18', '07:00'), { members: EXTRA });
  const sg = await t.wk.signer(), outs = [];
  const id = {}; for (const k of ['B901DY', 'B931DY', 'B938DY']) id[k] = await sg.idOf(k);
  /** một lượt tìm: đúng danh sách tên ngắn theo thứ tự, more chỉ có khi hơn 6 người, không còn need */
  const chk = async (q, want, label, more) => {
    const r = await call(t, { action: 'lt_find', q: q });
    outs.push(JSON.stringify(r));
    const got = r.results ? r.results.map(x => x.short).join(' | ') : '';
    ok(label + ' · ' + JSON.stringify(q.length > 24 ? q.slice(0, 12) + '…' : q) + ' → ' + (want.length ? want.join(' | ') : '(không ai)') + (more ? ' + more' : ''),
       r.ok === true && !('need' in r) && got === want.join(' | ') && (more ? r.more === true : !('more' in r)) &&
       r.results.every(x => Object.keys(x).sort().join() === 'coach,id,short'), r);
    return r;
  };
  const NAM3 = ['H. Đức Nam', 'T. Ngọc Nam', 'K. Thử Nam Phong'], DANH = ['K. Thử Đức Anh', 'K. Thử Đức Anh'];
  const TH6 = ['Thửnghiệm', 'K. Thử An', 'K. Thử Anh', 'K. Thứ Ba'].concat(DANH);
  /* rỗng / chỉ dấu câu */
  for (const q of ['', '   ', '...', '?! 🙂']) await chk(q, [], 'Không có chữ nào → rỗng');
  /* 1 ký tự: chỉ khớp ĐẦU chữ của tên đệm + tên; chữ cuối rơi vào tên gọi xếp trước */
  await chk('n', ['H. Đức Nam', 'T. Ngọc Nam', 'K. Thử Nam Phong', 'K. Thử Ngọc Bảo Anh', 'M. Thử Ngọc Ánh'], '1 ký tự, tên gọi bắt đầu bằng N xếp trước');
  await chk('N', ['H. Đức Nam', 'T. Ngọc Nam', 'K. Thử Nam Phong', 'K. Thử Ngọc Bảo Anh', 'M. Thử Ngọc Ánh'], 'Chữ hoa như chữ thường');
  await chk('k', ['K. Thử Khôi', 'B. Không Số'], '1 ký tự: họ "Khách" không tính, tên gọi Khôi trước tên đệm Không');
  await chk('o', [], '1 ký tự không khớp giữa chữ (Khôi không ra)');
  let r = await chk('đ', ['H. Đức Nam'].concat(DANH), 'đ = d');
  ok('… hai người trùng họ tên xếp theo Mã KH (B931DY trước B938DY)', r.results[0].id === id.B901DY && r.results[1].id === id.B931DY && r.results[2].id === id.B938DY, r);
  await chk('D', ['H. Đức Nam'].concat(DANH), 'D hoa = đ');
  /* 2 ký tự trở lên · more khi hơn 6 người */
  await chk('th', TH6, 'Tên một chữ (Thửnghiệm) là tên gọi → xếp đầu; 16 người → 6 + more', true);
  await chk('thu', TH6, '"thu": họ "Thử" của T. Ngọc Nam không tính; 14 người → 6 + more', true);
  await chk('an', ['K. Thử An', 'K. Thử Anh'].concat(DANH, ['K. Thử Ngọc Bảo Anh', 'M. Thử Ngọc Ánh']), 'Trùng trọn chữ (An) trước gõ dở (Anh); người thứ 7 (Văn, khớp giữa chữ) → more', true);
  await chk('nam', NAM3, 'Tên gọi Nam trước tên đệm Nam (dù K < T)');
  /* nhiều chữ: bậc 0 (phần cuối họ tên) > bậc 1 (đầu chữ, đúng thứ tự, được bỏ chữ giữa) */
  await chk('d nam', ['H. Đức Nam'], 'Đầu chữ đúng thứ tự: "d nam"');
  await chk('thu nam', ['K. Thử Nam Phong'], 'Họ "Thử" (T. Ngọc Nam) không ghép được với tên');
  await chk('ngoc anh', ['M. Thử Ngọc Ánh', 'K. Thử Ngọc Bảo Anh'], 'Khớp liền phần cuối xếp trước khớp có bỏ chữ giữa (dù K < M)');
  await chk('thu an', ['K. Thử An', 'K. Thử Anh'].concat(DANH, ['K. Thử Ngọc Bảo Anh', 'M. Thử Ngọc Ánh']), 'Đúng 6 người → không có more');
  await chk('thi linh', ['T. Thị Mỹ Linh'], 'Bỏ tên đệm ở giữa: "thi linh"');
  await chk('linh thi', [], 'Sai thứ tự → không ra');
  /* chỉ gõ họ → không ai (họ chỉ hiện chữ cái đầu) */
  for (const q of ['khach', 'mau', 'hoang', 'tran', 'phan', 'le', 'Bùi']) await chk(q, [], 'Chỉ gõ họ');
  await chk('hoang duc', [], 'Họ + tên đệm (không phải phần cuối)');
  /* họ tên đầy đủ · có dấu / không dấu · thừa cách · chữ hoa · dấu câu */
  await chk('hoang duc nam', ['H. Đức Nam'], 'Đủ họ tên');
  await chk('HOÀNG ĐỨC NAM', ['H. Đức Nam'], 'Đủ họ tên, chữ hoa có dấu');
  r = await chk('Khách Thử Đức Anh', DANH, 'Đủ họ tên, hai người trùng');
  ok('… vẫn theo Mã KH', r.results[0].id === id.B931DY && r.results[1].id === id.B938DY, r);
  await chk('khach thu duc anh', DANH, 'Đủ họ tên không dấu');
  await chk('   ĐỨC    anh  ', DANH, 'Thừa cách, lẫn hoa thường');
  await chk('Hà-Linh', ['M. Thử Hà-Linh'], 'Tên có gạch nối');
  await chk('ha linh', ['M. Thử Hà-Linh'], 'Gạch nối = cách');
  await chk('(duc) nam?', ['H. Đức Nam'], 'Dấu câu bỏ qua');
  await chk('🙂 nam!!', NAM3, 'Emoji bỏ qua');
  /* khớp giữa chữ: đúng một chữ, từ 2 ký tự; xếp sau mọi người khớp đầu chữ */
  await chk('hoi', ['K. Thử Khôi'], 'Giữa chữ: "hoi" → Khôi');
  await chk('oi', ['K. Thử Khôi'], 'Giữa chữ, 2 ký tự');
  await chk('ung', ['Đ. Văn Hưng', 'Thửnghiệm'], 'Giữa chữ: "ung" → Hưng, Thửnghiệm');
  await chk('ong', ['K. Thử Nam Phong', 'L. Gia Phong', 'B. Không Số'], 'Giữa chữ: tên gọi trước tên đệm (dù B < K)');
  await chk('nghiem', ['Thửnghiệm'], 'Giữa chữ của tên một chữ');
  await chk('hoi nam', [], 'Hai chữ thì không khớp giữa chữ');
  /* dài quá 60 ký tự: cắt ở 60 như trước */
  await chk('nam' + ' '.repeat(57) + 'zzz', NAM3, 'Quá 60 ký tự → phần sau ký tự 60 bỏ');
  await chk('x'.repeat(80), [], '80 ký tự một chữ');
  await chk('a '.repeat(40), [], '30 chữ "a" (nhiều chữ hơn tên)');
  await chk('x', [], 'Không ai');
  ok('Ma trận tìm tên: không phản hồi nào lộ họ đầy đủ hay SĐT (' + outs.length + ' lượt)',
     outs.every(o => !/Khách|Mẫu|Hoàng|Trần|0900/.test(o)), outs.filter(o => /Khách|Mẫu|Hoàng|Trần|0900/.test(o)));
}

/* luật "mỗi coach một suất mỗi khung" (18/10): cùng kịch bản với test/gas_lt.js, mỗi phản hồi Worker = Apps Script */
await require('../../test/coach_cases.js').coachCases({ setup, call, login, logRows, ok, rid, vn });

{
  const flushes = flushLog.filter(o => o.a === 'flush');
  ok('Nhật ký ghi sau: ' + flushes.filter(o => o.ok).length + ' lần flush, không lần nào lỗi, không cảnh báo', flushes.length > 0 && flushes.every(o => o.ok === true && !o.warn), flushes.filter(o => !o.ok || o.warn));
}

console.log('\nParity: ' + same + ' lượt/sổ giống hệt, ' + diff + ' lệch');
console.log(pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail || diff ? 1 : 0);
