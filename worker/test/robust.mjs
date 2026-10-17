/* Test bổ sung: DO thức dậy từ storage · hàng đợi quá hạn · lỗi đọc Google · đổi tên tab · cron · dọn bộ đếm.
   Chạy: node test/robust.mjs */
import { createRequire } from 'module';
import { BookingCore } from '../src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn } = require('../../test/gas_env.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 500) : '')); }
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SA = fakeServiceAccount();
function files() {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH'];
  const ba = {
    MEMBERS: [H, ['', '1', 'Hoàng Đức Nam', '24 buổi', 24, '1:1', 'Quyết Hán', '0900000001', 20, d('2026-08-01'), d('2027-01-01'), 'B901DY'],
                 ['', '2', 'Phạm Minh Tâm', '24 buổi', 24, '1:1', 'Hiền Mai', '0900000002', 20, d('2026-08-01'), d('2027-01-01'), 'B902DY']],
    'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']],
    TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']],
    ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]]
  };
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  return { BA: new Spreadsheet('BA', LA, ba), OUT: new Spreadsheet('OUT', 'Asia/Saigon', { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] }) };
}
const DEV = 'devROBUSTROBUSTROB1';
function core(f, fg, storage, clock, opts) {
  return new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson }, fetch: fg.fetch, now: () => clock.now, opts: Object.assign({ RECONCILE_MS: 1 }, opts || {}) });
}
async function login(wk, q, pin) {
  const f = await wk.api({ action: 'lt_find', q, dev: DEV });
  return wk.api({ action: 'lt_verify', id: f.results[0].id, pin, remember: true, dev: DEV });
}
const rows = f => f.OUT.getSheetByName('Sổ đặt lịch').rows.slice(4).filter(r => r[1]);

console.log('\n== DO thức dậy từ storage ==');
{
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage();
  const a = core(f, fg, storage, clock);
  const s = await login(a, 'duc nam', '0001');
  const r = await a.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridrobust001', week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }] });
  await a.idle();
  ok('Đặt xong ở bản DO thứ nhất', r.ok, r.error);
  const b = core(f, fg, storage, clock);
  await b.init();
  const before = JSON.stringify(fg.calls);
  const t0 = performance.now();
  const st = await b.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  const ms = performance.now() - t0, during = JSON.stringify(fg.calls);
  await b.idle();
  ok('Bản DO mới (sau khi bị dọn khỏi RAM) trả lời ngay từ ảnh chụp, không đợi Google (' + ms.toFixed(1) + ' ms)', st.ok && st.mode === 'ticket' && st.mine.sessions.length === 2 && during === before, [st.mode, before, during]);
  ok('… rồi tự đọc lại Google ngầm', JSON.stringify(fg.calls) !== during);
  ok('Mã nhớ máy vẫn dùng được (bí mật HMAC lưu trong storage)', st.auth === true);
  const r2 = await b.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridrobust001', week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }] });
  ok('Gửi lại mã yêu cầu cũ ở bản DO mới → dup (đọc sổ đầy đủ trước khi ghi)', r2.ok && r2.dup && rows(f).length === 2, r2);
}

console.log('\n== Hàng đợi ghi quá hạn ==');
{
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey });
  const wk = core(f, fg, new FakeStorage(), clock, { LOCK_WAIT: 60 });
  const s = await login(wk, 'duc nam', '0001');
  let release; wk.testHold = new Promise(r => { release = r; });
  const t0 = Date.now();
  const r = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridrobust002', week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] });
  const ms = Date.now() - t0;
  ok('Đợi quá LOCK_WAIT → he_thong_ban đúng hạn (' + ms + ' ms), không đợi lô đang chạy xong', r.error === 'he_thong_ban' && ms < 400, [r, ms]);
  release(); wk.testHold = null;
  await wk.idle();
  ok('… và không ghi gì', rows(f).length === 0);
  const r2 = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridrobust002', week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] });
  ok('Gửi lại cùng mã khi hết bận → ok', r2.ok && rows(f).length === 2, r2.error);
}

console.log('\n== Lỗi đọc Google ==');
{
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey });
  const wk = core(f, fg, new FakeStorage(), clock);
  const s = await login(wk, 'duc nam', '0001');
  fg.failRead = 1;
  wk.cfg.WRITE_LOG_FRESH = -1;
  let r = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridrobust003', week: '2026-W43', picks: [{ date: '2026-10-19', h: 8 }, { date: '2026-10-21', h: 8 }] });
  ok('Đọc sổ lỗi mạng 1 lần → tự thử lại lượt ĐỌC → ghi được', r.ok, r.error);
  const tok2 = (await login(wk, 'minh tam', '0002')).tok;
  await wk.idle();
  fg.failRead = 4;
  r = await wk.api({ action: 'lt_book', dev: DEV, tok: tok2, rid: 'ridrobust004', week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-21', h: 9 }] });
  await wk.idle();
  ok('Đọc lỗi liên tục → loi_he_thong, không ghi gì', r.ok === false && r.error === 'loi_he_thong' && rows(f).filter(x => x[15] === 'ridrobust004').length === 0, r);
  fg.failRead = 0;
  const b = await wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('Sau sự cố đọc vẫn mở trang bình thường (sổ trong bộ nhớ không mang dòng ma)', b.ok && b.mine.sessions.length === 2, b.mine);
  fg.failRead = 6;
  wk.ba.at -= 120e3; wk.log.at -= 120e3;
  const b2 = await wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  await wk.idle();
  fg.failRead = 0;
  ok('Google sập khi đang có dữ liệu cũ → vẫn trả lời từ bộ nhớ (stale), không lỗi', b2.ok && b2.mode === 'ticket', b2.error);
}

console.log('\n== Đổi tên tab giữa chừng ==');
{
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey });
  const wk = core(f, fg, new FakeStorage(), clock);
  await login(wk, 'duc nam', '0001');
  f.BA.getSheetByName(' ⚙️ 2').name = '⚙️2';
  f.BA.getSheetByName('TRIAL').name = 'TRIAL';
  f.BA.getSheetByName('MEMBERS').name = 'MEMBERS';
  const cfg = f.BA.getSheetByName('⚙️2');
  cfg.rows[0][2] = 3;
  await wk.loadBA();
  ok('Tab ⚙️ 2 đổi tên → Google 400 → đọc lại danh sách tab → sức chứa mới = 3', wk.ba.cap === 3, wk.ba.cap);
}

console.log('\n== Cron tick · dọn bộ đếm ==');
{
  const clock = { now: vn('2026-10-18', '05:50') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey });
  const wk = core(f, fg, new FakeStorage(), clock);
  await wk.tick();
  ok('Cron lúc 05:50 CN (sắp mở) → nạp sẵn BA + sổ + điểm danh', !!wk.ba && !!wk.log && !wk.log.partial && !!wk.mk);
  const c0 = JSON.stringify(fg.calls);
  await wk.tick();
  ok('Cron ngay sau đó → không đọc lại (còn mới)', JSON.stringify(fg.calls) === c0);
  await wk.api({ action: 'lt_find', q: 'duc nam', dev: DEV });
  ok('Bộ đếm tìm tên lưu storage', !!(await wk.storage.get('c:lt:q:' + DEV)));
  clock.now += 11 * 60e3;
  wk.lastPurge = 0;
  await wk.tick();
  ok('Cron dọn bộ đếm hết hạn khỏi storage', (await wk.storage.get('c:lt:q:' + DEV)) === undefined);
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
