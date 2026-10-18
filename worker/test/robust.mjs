/* Test bổ sung: nhật ký ghi sau khi Google lỗi · DO thức dậy (cả khi còn mục chưa ghi) · đặt rồi đổi trước khi kịp ghi ·
   chủ studio xoá dòng · đọc chậm chạy đua với lần ghi · 403 kéo dài · storage lỗi · hàng đợi quá hạn · đổi tên tab · cron.
   Chạy: node test/robust.mjs */
import { createRequire } from 'module';
import { BookingCore } from '../src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn, makeEnv } = require('../../test/gas_env.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 500) : '')); }
}
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SA = fakeServiceAccount();
const SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* hội viên bịa: [tìm bằng, 4 số cuối, mã KH] */
const M = [['duc nam', '0001', 'B901DY'], ['minh tam', '0002', 'B902DY'], ['so ba', '0003', 'B903DY'], ['so bon', '0004', 'B904DY'], ['so nam', '0005', 'B905DY'], ['so sau', '0006', 'B906DY']];
function files() {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH'];
  const mem = (no, name, coach, phone, code) => ['', no, name, '24 buổi', 24, '1:1', coach, phone, 20, d('2026-08-01'), d('2027-01-01'), code];
  const ba = {
    /* năm coach khác nhau cho 5 khách đầu (luật 18/10: mỗi coach một suất mỗi khung — 4 khách đầu đủ 4 suất một khung) */
    MEMBERS: [H, mem('1', 'Hoàng Đức Nam', 'Quyết Hán', '0900000001', 'B901DY'), mem('2', 'Phạm Minh Tâm', 'Hiền Mai', '0900000002', 'B902DY'),
                 mem('3', 'Khách Số Ba', 'Khải Phan', '0900000003', 'B903DY'), mem('4', 'Khách Số Bốn', 'Lâm Nguyễn', '0900000004', 'B904DY'),
                 mem('5', 'Khách Số Năm', 'Bích Ngọc', '0900000005', 'B905DY'), mem('6', 'Khách Số Sáu', 'Quyết Hán', '0900000006', 'B906DY')],
    'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']],
    TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']],
    ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]]
  };
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  return { BA: new Spreadsheet('BA', LA, ba), OUT: new Spreadsheet('OUT', 'Asia/Saigon', { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] }) };
}
const DEV = 'devROBUSTROBUSTROB1';
/** Một bản DO trên storage cho trước (alarm của storage được trỏ sang bản này — bản cũ coi như đã bị dọn khỏi RAM). */
function core(f, fg, storage, clock, opts, logs) {
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: SECRET }, fetch: fg.fetch, now: () => clock.now,
                               opts: Object.assign({ FLUSH_MS: 1, BACKOFF: [5, 10, 20, 40] }, opts || {}), log: o => { (logs || []).push(o); } });
  storage.onAlarm = () => wk.alarm();
  return wk;
}
function world(nowMs, opts) {
  const clock = { now: nowMs }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage(), logs = [];
  const wk = core(f, fg, storage, clock, opts, logs);
  return { clock, f, fg, storage, logs, wk };
}
async function login(wk, i, dev) {
  const f = await wk.api({ action: 'lt_find', q: M[i][0], dev: dev || DEV });
  return wk.api({ action: 'lt_verify', id: f.results[0].id, pin: M[i][1], remember: true, dev: dev || DEV });
}
const rows = f => f.OUT.getSheetByName('Sổ đặt lịch').rows.slice(4).filter(r => r[1]);
const ofRid = (f, rid) => rows(f).filter(x => x[15] === rid);
const fails = logs => logs.filter(o => o.a === 'flush' && o.ok === false);
async function until(cond, maxMs) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > maxMs) return -1; await sleep(2); } return Date.now() - t0; }
/** Giữ flush lại (để dồn nhiều mục) rồi thả. */
function hold(wk) { wk.cfg.FLUSH_MS = 1e9; }
async function release(wk) { if (wk.flushT) clearTimeout(wk.flushT); wk.flushT = null; wk.cfg.FLUSH_MS = 1; await wk.flush(); await wk.idle(); }
let ridN = 0; const rid = () => 'ridrobust' + String(++ridN).padStart(6, '0');
const BOOK = (tok, r, picks, dev) => ({ action: 'lt_book', dev: dev || DEV, tok, rid: r, week: '2026-W43', picks });

console.log('\n== DO thức dậy từ storage ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0);
  const R1 = rid();
  const r = await w.wk.api(BOOK(s.tok, R1, [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }]));
  await w.wk.idle();
  ok('Đặt xong ở bản DO thứ nhất, nhật ký đã lên sổ', r.ok && rows(w.f).length === 2 && w.storage.keys('j:').length === 0, r.error);
  const b = core(w.f, w.fg, w.storage, w.clock, {}, w.logs);
  await b.init();
  const before = JSON.stringify(w.fg.calls);
  const t0 = performance.now();
  const st = await b.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  const ms = performance.now() - t0, during = JSON.stringify(w.fg.calls);
  await b.idle();
  ok('Bản DO mới (sau khi bị dọn khỏi RAM) trả lời ngay từ ảnh chụp, không đợi Google (' + ms.toFixed(1) + ' ms)', st.ok && st.mode === 'ticket' && st.mine.sessions.length === 2 && during === before, [st.mode, before, during]);
  ok('… rồi tự đọc lại Google ngầm', JSON.stringify(w.fg.calls) !== during);
  ok('Mã nhớ máy vẫn dùng được', st.auth === true);
  const u0 = w.fg.calls.batchUpdate;
  const r2 = await b.api(BOOK(s.tok, R1, [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }]));
  await b.idle();
  ok('Gửi lại mã yêu cầu cũ ở bản DO mới → dup, không ghi thêm', r2.ok && r2.dup && rows(w.f).length === 2 && w.fg.calls.batchUpdate === u0, r2);
}
{
  /* deploy bản có luật coach lên DO đang giữ ảnh chụp sổ dạng CŨ (dòng chưa có coach / loại gói): không được dùng ảnh đó,
     không thì vài giây đầu các dòng cũ không chặn được người cùng coach */
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0), s6 = await login(w.wk, 5, 'devROBUSTROBUSTROB6');
  const r = await w.wk.api(BOOK(s.tok, rid(), [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }]));
  await w.wk.idle();
  const snap = await w.storage.get('snap:log');
  ok('Ảnh chụp sổ lưu storage có dạng 2 (dòng có coach + loại gói)', r.ok && snap && snap.fmt === 2 && snap.rows.every(x => x.coach === 'Quyết Hán' && x.kind === '1:1'), snap && [snap.fmt, snap.rows[0]]);
  await w.storage.put('snap:log', { at: snap.at, rt: 0, seq: 0, lastRow: snap.lastRow, partial: true, weeks: snap.weeks,
                                    rows: snap.rows.map(x => { const y = Object.assign({}, x); delete y.coach; delete y.kind; return y; }) });
  const b = core(w.f, w.fg, w.storage, w.clock, {}, w.logs);
  await b.init();
  ok('Bản DO mới bỏ ảnh chụp dạng cũ (không có fmt)', b.base === null && b.log === null, b.base && b.base.fmt);
  const g0 = w.fg.calls.get || 0;
  const st = await b.api({ action: 'lt_boot', dev: 'devROBUSTROBUSTROB6', tok: s6.tok });
  ok('… lượt đầu đọc sổ mới từ Google rồi mới trả lời: khách cùng coach Quyết thấy T2 06:00 "busy"', st.ok && st.coachAt['2026-10-19|6'] === 'busy' && (w.fg.calls.get || 0) > g0, [st.coachAt, g0, w.fg.calls.get]);
  const r6 = await b.api(BOOK(s6.tok, rid(), [{ date: '2026-10-19', h: 6 }, { date: '2026-10-20', h: 6 }], 'devROBUSTROBUSTROB6'));
  ok('… và chặn được lượt đặt trùng coach ngay lượt đầu (het_cho)', r6.error === 'het_cho' && r6.full.length === 1 && r6.full[0].date === '2026-10-19', r6);
  await b.idle();
}

console.log('\n== Lỗi ghi Google → nhật ký thử lại, mỗi lượt lên sổ ĐÚNG MỘT LẦN ==');
for (const [mode, label] of [['after', 'đã ghi rồi mới đứt mạng'], ['before', 'đứt mạng (chưa tới Google)'], ['status500', 'Google trả 500'],
                             ['timeout', 'hết giờ, Google ghi muộn'], ['timeout_drop', 'hết giờ, Google bỏ lệnh']]) {
  const w = world(vn('2026-10-18', '07:00'), { WRITE_MS: 40, AFTER_TIMEOUT: 150 });
  w.fg.hangMs = 90;
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.failWrite = mode;
  const R = rid(), t0 = performance.now();
  let r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 9 }, { date: '2026-10-20', h: 9 }]));
  const ms = performance.now() - t0;
  const synced = await until(() => w.wk.jPending.length === 0 && !w.wk.flushP, 3000);
  await sleep(w.fg.hangMs + 30);                                   /* đợi qua lúc lệnh ghi "muộn" của Google tới (nếu có) */
  await w.wk.idle();
  const f1 = fails(w.logs);
  ok(label + ': trả ok ngay (' + ms.toFixed(1) + ' ms), lần ghi đầu lỗi → thử lại → sổ có đúng 2 dòng',
     r.ok && r.mode === 'ticket' && synced >= 0 && f1.length >= 1 && ofRid(w.f, R).length === 2 && rows(w.f).length === 2, [r.error, synced, f1, ofRid(w.f, R).length]);
  if (mode === 'timeout' || mode === 'timeout_drop') ok('… hết giờ → đợi ≥ AFTER_TIMEOUT rồi mới đọc lại + gửi lại (Google có thể còn đang xử lý)', f1[0].retryMs >= 150, f1);
  r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 9 }, { date: '2026-10-20', h: 9 }]));
  await w.wk.idle();
  ok('… trình duyệt gửi lại cùng mã → dup, vẫn 2 dòng', r.ok && r.dup && ofRid(w.f, R).length === 2);
}
{
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 1);
  await w.wk.api(BOOK(s.tok, rid(), [{ date: '2026-10-19', h: 9 }, { date: '2026-10-20', h: 9 }]));
  await w.wk.idle();
  w.clock.now = vn('2026-10-19', '07:00');
  w.fg.failWrite = 'after';
  const C4 = { action: 'lt_change', dev: DEV, tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-20', h: 9 }, to: { date: '2026-10-22', h: 9 } };
  let r = await w.wk.api(structuredClone(C4));
  await until(() => w.wk.jPending.length === 0, 3000);
  await w.wk.idle();
  const mv = rows(w.f).filter(x => x[16] === 'B902DY');
  ok('Đổi buổi, lần ghi đã tới Google nhưng mất phản hồi → đọc lại thấy rid → không ghi lại: 1 Đã đổi + 1 dòng Đổi', r.ok && mv.length === 3 && mv.filter(x => x[11] === 'Đã đổi').length === 1 && mv.filter(x => x[12] === 'Đổi').length === 1, mv.map(x => x[4] + ' ' + x[11] + ' ' + x[12]));
  r = await w.wk.api(structuredClone(C4));
  await w.wk.idle();
  ok('… gửi lại → dup, sổ không đổi', r.ok && r.dup && rows(w.f).filter(x => x[16] === 'B902DY').length === 3);
}

console.log('\n== Google sập hẳn ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.down = true;
  const R = rid();
  const r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 8 }, { date: '2026-10-21', h: 8 }]));
  ok('Google sập: lượt đặt vẫn nhận ngay (kiểm bằng bộ nhớ, ghi nhật ký)', r.ok && r.mode === 'ticket', r.error);
  await until(() => fails(w.logs).length >= 2, 2000);
  const p = await w.wk.api({ action: 'lt_ping' });
  ok('lt_ping: pending 1, oldestMs > 0, lastError google_mang — không dữ liệu cá nhân', p.ok && p.pending === 1 && p.oldestMs > 0 && p.lastError === 'google_mang' && Object.keys(p).sort().join() === 'lastError,lastFlushAt,now,ok,oldestMs,pending', p);
  const b = await w.wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('Mở lại trang vẫn thấy phiếu (từ nhật ký) dù sổ Google chưa có dòng', b.ok && b.mine.sessions.length === 2 && rows(w.f).length === 0, b.mine);
  w.wk.ba.at -= 120e3; w.wk.log.at -= 120e3;
  const b2 = await w.wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('Dữ liệu trong bộ nhớ đã cũ mà Google vẫn sập → vẫn trả lời từ bộ nhớ, không lỗi', b2.ok && b2.mode === 'ticket', b2.error);
  w.fg.down = false;
  const t = await until(() => w.wk.jPending.length === 0 && ofRid(w.f, R).length === 2, 3000);
  await w.wk.idle();
  const p2 = await w.wk.api({ action: 'lt_ping' });
  ok('Google lại → alarm thử lại → sổ có đúng 2 dòng (' + t + ' ms), ping hết lỗi', t >= 0 && ofRid(w.f, R).length === 2 && p2.pending === 0 && p2.lastError === '' && p2.lastFlushAt > 0, p2);
  /* đổi buổi cần đọc sổ lúc ghi: lượt đọc lỗi mạng 1 lần thì tự thử lại ngay (luật đọc), không phải đợi alarm */
  w.clock.now = vn('2026-10-19', '07:00');
  w.fg.failRead = 1;
  const f0 = fails(w.logs).length;
  const c = await w.wk.api({ action: 'lt_change', dev: DEV, tok: s.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 8 }, to: { date: '2026-10-22', h: 8 } });
  await w.wk.idle();
  ok('Đổi buổi: lượt đọc sổ lúc ghi lỗi mạng 1 lần → tự đọc lại → ghi ngay, không tính lỗi', c.ok && fails(w.logs).length === f0 && rows(w.f).filter(x => x[11] === 'Đã đổi').length === 1, [c.error, fails(w.logs).length - f0]);
}

console.log('\n== DO bị dọn khỏi RAM khi nhật ký còn mục chưa ghi ==');
{
  /* a) chưa ghi được gì (Google 503) → bản DO mới nạp nhật ký, đọc sổ, ghi */
  const w = world(vn('2026-10-18', '07:00'), { BACKOFF: [60e3] });
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.writeStatus = 503;
  const R = rid();
  const r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 10 }, { date: '2026-10-21', h: 10 }]));
  await w.wk.idle();
  ok('Bản DO cũ: đặt ok, ghi lỗi, mục còn trong storage', r.ok && w.storage.keys('j:').length === 1 && rows(w.f).length === 0, w.storage.keys('j:'));
  w.fg.writeStatus = 0;
  const b = core(w.f, w.fg, w.storage, w.clock, {}, w.logs);
  await b.init();
  const p = await b.api({ action: 'lt_ping' });
  ok('Bản DO mới nạp nhật ký: pending 1', p.pending === 1, p);
  const st = await b.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('… phiếu vẫn hiện ngay (ảnh chụp sổ ⊕ nhật ký)', st.mode === 'ticket' && st.mine.sessions.length === 2, st.mode);
  const t = await until(() => b.jPending.length === 0 && ofRid(w.f, R).length === 2, 3000);
  await b.idle();
  ok('… tự ghi tiếp sau init → sổ có đúng 2 dòng, storage hết khoá j:', t >= 0 && ofRid(w.f, R).length === 2 && w.storage.keys('j:').length === 0, [t, ofRid(w.f, R).length, w.storage.keys('j:')]);
}
{
  /* b) lần ghi ĐÃ tới Google nhưng DO chết trước khi biết → bản mới đọc sổ, thấy rid, không gửi lại */
  const w = world(vn('2026-10-18', '07:00'), { BACKOFF: [60e3] });
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.failWrite = 'after';
  const R = rid();
  await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 11 }, { date: '2026-10-21', h: 11 }]));
  await w.wk.idle();
  const u0 = w.fg.calls.batchUpdate;
  const b = core(w.f, w.fg, w.storage, w.clock, {}, w.logs);
  await b.init();
  await until(() => b.jPending.length === 0, 3000);
  await b.idle();
  ok('Ghi đã tới Google rồi DO chết → bản mới đọc sổ thấy rid → không ghi lại (vẫn đúng 2 dòng, 0 lệnh ghi mới)', ofRid(w.f, R).length === 2 && w.fg.calls.batchUpdate === u0 && w.storage.keys('j:').length === 0, [ofRid(w.f, R).length, w.fg.calls.batchUpdate - u0]);
}
{
  /* c) chỉ còn alarm (không có lượt gọi nào tới bản mới): alarm đánh thức → ghi */
  const w = world(vn('2026-10-18', '07:00'), { BACKOFF: [60e3] });
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.writeStatus = 503;
  const R = rid();
  await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-20', h: 6 }, { date: '2026-10-22', h: 6 }]));
  await w.wk.idle();
  w.fg.writeStatus = 0;
  const b = core(w.f, w.fg, w.storage, w.clock, { FLUSH_MS: 1e9, BACKSTOP_MS: 30 }, w.logs);
  await b.init();
  const t = await until(() => ofRid(w.f, R).length === 2 && b.jPending.length === 0, 3000);
  if (b.flushT) { clearTimeout(b.flushT); b.flushT = null; }
  await b.idle();
  ok('Chỉ có alarm đánh thức DO → mục được ghi (' + t + ' ms), đúng 2 dòng', t >= 0 && ofRid(w.f, R).length === 2, t);
}

console.log('\n== Đặt rồi đổi (2 lần) trước khi kịp ghi → MỘT lệnh ghi, sổ giống hệt Apps Script ==');
{
  const clock = { now: vn('2026-10-18', '07:00') };
  const gf = files();
  const env = makeEnv(gf, clock, { props: { BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: SECRET } });
  const gas = b => JSON.parse(JSON.stringify(env.ltDoPost_(structuredClone(Object.assign({ dev: DEV }, b)))));
  const f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage(), logs = [];
  const wk = core(f, fg, storage, clock, {}, logs);
  const both = async b => { const g = gas(b); const x = JSON.parse(JSON.stringify(await wk.api(structuredClone(Object.assign({ dev: DEV }, b))))); return [g, x]; };
  let [g, x] = await both({ action: 'lt_find', q: 'duc nam' });
  [g, x] = await both({ action: 'lt_verify', id: x.results[0].id, pin: '0001', remember: true });
  const tok = x.tok;
  await wk.idle();
  const u0 = fg.calls.batchUpdate, r0 = wk.readSeq;
  hold(wk);
  const calls = [
    BOOK(tok, rid(), [{ date: '2026-10-23', h: 19 }, { date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 18 }]),
    { action: 'lt_change', tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 18 }, to: { date: '2026-10-22', h: 19 } },
    { action: 'lt_change', tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-22', h: 19 }, to: { date: '2026-10-20', h: 20 } }
  ];
  let sameResp = 0;
  for (const c of calls) { [g, x] = await both(c); if (canon(g) === canon(x)) sameResp++; else console.log('    lệch: ' + JSON.stringify([g.error, x.error, g.why, x.why])); }
  ok('3 lượt (đặt, đổi, đổi lại buổi vừa đổi) đều ok, phản hồi giống hệt Apps Script', sameResp === 3 && x.ok && x.mine.changesLeft === 0, sameResp);
  ok('… trong lúc đó sổ Google chưa có gì (3 mục đang chờ)', rows(f).length === 0 && wk.jPending.length === 3);
  await release(wk);
  const gRows = gf.OUT.getSheetByName('Sổ đặt lịch').rows.slice(4).filter(r => r[1]), wRows = rows(f);
  ok('Thả flush: đúng MỘT lệnh batchUpdate, không cần đọc sổ', fg.calls.batchUpdate - u0 === 1 && wk.readSeq === r0, [fg.calls.batchUpdate - u0, wk.readSeq - r0]);
  ok('Sổ Worker giống hệt sổ Apps Script từng ô (5 dòng: 2 Đã đổi có ghi chú nối, 3 Đã đặt)', JSON.stringify(gRows) === JSON.stringify(wRows) && wRows.length === 5 && wRows.filter(r => r[11] === 'Đã đổi').length === 2, [gRows.map(r => r.slice(4, 14)), wRows.map(r => r.slice(4, 14))]);
}

console.log('\n== Chủ studio xoá dòng cũ trước khi lượt đổi kịp ghi ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0), s2 = await login(w.wk, 1, 'devROBUSTROBUSTROB2');
  await w.wk.api(BOOK(s.tok, rid(), [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }, { date: '2026-10-23', h: 6 }]));
  await w.wk.idle();
  w.clock.now = vn('2026-10-19', '07:00');
  hold(w.wk);
  const RC = rid();
  const c = await w.wk.api({ action: 'lt_change', dev: DEV, tok: s.tok, rid: RC, week: '2026-W43', from: { date: '2026-10-21', h: 6 }, to: { date: '2026-10-22', h: 8 } });
  ok('Đổi T4 06:00 → T5 08:00: ok (đang chờ ghi)', c.ok, c.error);
  const sh = w.f.OUT.getSheetByName('Sổ đặt lịch'), idx = sh.rows.findIndex(r => r[4] === '2026-10-21' && r[6] === '06:00');
  sh.rows.splice(idx, 1);                                              /* xoá hẳn dòng → các dòng dưới dồn lên */
  await release(w.wk);
  const R = rows(w.f);
  ok('Dòng cũ đã mất → bỏ phần "Đã đổi" (cảnh báo move_target_missing), vẫn thêm dòng mới, không sửa nhầm dòng khác',
     w.logs.some(o => o.warn === 'move_target_missing') && R.length === 3 && R.filter(x => x[11] === 'Đã đổi').length === 0 && ofRid(w.f, RC).length === 1 && ofRid(w.f, RC)[0][4] === '2026-10-22',
     R.map(x => x[4] + ' ' + x[6] + ' ' + x[11] + ' ' + x[12]));
  ok('… không kẹt: nhật ký trống, flush không lỗi', w.wk.jPending.length === 0 && fails(w.logs).length === 0);
  const r2 = await w.wk.api(BOOK(s2.tok, rid(), [{ date: '2026-10-21', h: 7 }, { date: '2026-10-23', h: 7 }], 'devROBUSTROBUSTROB2'));
  await w.wk.idle();
  ok('… lượt đặt sau đó vẫn chạy bình thường', r2.ok && rows(w.f).length === 5, r2.error);
  await w.wk.loadLog();
  const b = await w.wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('… đọc lại sổ: phiếu theo đúng sổ thật (T2 06:00, T5 08:00, T6 06:00)', b.mine.sessions.map(x => x.date.slice(8) + '@' + x.h).join(',') === '19@6,22@8,23@6', b.mine.sessions);
}

console.log('\n== Lượt đọc chậm (bắt đầu trước lần ghi) không bao giờ làm mất lượt đặt đã xác nhận ==');
{
  const w = world(vn('2026-10-18', '07:00'), { RECENT_MS: 0 });
  const toks = [];
  for (let i = 0; i < 5; i++) toks.push((await login(w.wk, i, 'devROBUSTRACE00000' + i)).tok);
  await w.wk.idle();
  w.fg.staleReads = true;
  w.fg.delay = k => k === 'get' ? 150 : 5;
  const slow = w.wk.loadLog();                                         /* chụp sổ lúc này (chưa có ai ở T4 08:00) */
  const res = await Promise.all([0, 1, 2, 3].map(i => w.wk.api(BOOK(toks[i], rid(), [{ date: '2026-10-21', h: 8 }, { date: '2026-10-23', h: 8 + i }], 'devROBUSTRACE00000' + i))));
  const synced = await until(() => w.wk.jPending.length === 0 && rows(w.f).length === 8, 2000);
  await slow;
  ok('4 lượt đặt T4 08:00 đã lên sổ trong lúc lượt đọc chậm còn chạy', res.every(r => r.ok) && synced >= 0, res.map(r => r.error));
  ok('Lượt đọc chậm trả về sổ CŨ (0 người ở T4 08:00) và được nhận làm bản sheet', w.wk.base.rows.filter(r => r.date === '2026-10-21' && r.h === 8).length === 0);
  const st = await w.wk.api({ action: 'lt_boot', dev: 'devROBUSTRACE000000', tok: toks[0] });
  ok('… nhưng bộ nhớ vẫn thấy cả 4 (phủ các mục vừa ghi lên lượt đọc cũ)', st.taken['2026-10-21|8'] === 4 && st.mine.sessions.length === 2, st.taken);
  const r5 = await w.wk.api(BOOK(toks[4], rid(), [{ date: '2026-10-21', h: 8 }, { date: '2026-10-19', h: 8 }], 'devROBUSTRACE000004'));
  ok('… người thứ 5 chọn T4 08:00 → het_cho (không bao giờ quá sức chứa)', r5.error === 'het_cho', r5.error || r5.why);
  w.fg.staleReads = false; w.fg.delay = null;
  await w.wk.idle();
  await w.wk.loadLog();
  ok('Lượt đọc MỚI (bắt đầu sau khi ghi) có đủ dòng → bỏ danh sách vừa ghi, bộ nhớ vẫn đúng', w.wk.jRecent.length === 0 && w.wk.log.rows.filter(r => r.date === '2026-10-21' && r.h === 8).length === 4, w.wk.jRecent.length);
}

console.log('\n== Google từ chối ghi lâu dài (403: file chỉ share quyền xem) ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  const toks = [];
  for (let i = 0; i < 6; i++) toks.push((await login(w.wk, i, 'devROBUSTPERM00000' + i)).tok);
  await w.wk.idle();
  w.fg.writeStatus = 403;
  const res = [];
  for (let i = 0; i < 4; i++) res.push(await w.wk.api(BOOK(toks[i], rid(), [{ date: '2026-10-22', h: 18 }, { date: '2026-10-24', h: [9, 10, 11, 14][i] }], 'devROBUSTPERM00000' + i)));
  ok('Lượt đặt vẫn được nhận khi Google từ chối ghi', res.every(r => r.ok), res.map(r => r.error));
  await until(() => fails(w.logs).length >= 4, 3000);
  const p = await w.wk.api({ action: 'lt_ping' });
  ok('Vẫn thử lại liên tục (' + fails(w.logs).length + ' lần lỗi), ping: pending 4, lastError google_403', fails(w.logs).length >= 4 && p.pending === 4 && p.lastError === 'google_403' && p.oldestMs > 0, p);
  const r5 = await w.wk.api(BOOK(toks[4], rid(), [{ date: '2026-10-22', h: 18 }, { date: '2026-10-19', h: 18 }], 'devROBUSTPERM000004'));
  ok('Sức chứa vẫn giữ: người thứ 5 chọn T5 18:00 (đã 4 người, chưa lên sổ) → het_cho', r5.error === 'het_cho', r5.error);
  const r6 = await w.wk.api(BOOK(toks[5], rid(), [{ date: '2026-10-19', h: 18 }, { date: '2026-10-20', h: 18 }], 'devROBUSTPERM000005'));
  ok('… người thứ 6 chọn khung còn chỗ → ok (pending 5)', r6.ok && w.wk.jPending.length === 5, r6.error);
  ok('… sổ Google vẫn trống', rows(w.f).length === 0);
  w.fg.writeStatus = 0;
  const t = await until(() => w.wk.jPending.length === 0, 3000);
  await w.wk.idle();
  const R = rows(w.f), per = R.reduce((m, r) => (m[r[15]] = (m[r[15]] || 0) + 1, m), {});
  const p2 = await w.wk.api({ action: 'lt_ping' });
  ok('Hết 403 → ghi hết trong lần thử kế (' + t + ' ms): 10 dòng, mỗi mã yêu cầu đúng 2 dòng, ping sạch', t >= 0 && R.length === 10 && Object.values(per).every(n => n === 2) && p2.pending === 0 && p2.lastError === '', [R.length, per, p2]);
}

console.log('\n== Storage của DO lỗi khi ghi nhật ký ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.storage.failJournal = 1;
  const R = rid();
  let r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 14 }, { date: '2026-10-21', h: 14 }]));
  await w.wk.idle();
  const b = await w.wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok });
  ok('Không lưu được nhật ký → he_thong_ban; bộ nhớ trả lại như cũ (không giữ chỗ ma), không ghi gì', r.error === 'he_thong_ban' && b.mode === 'book' && !b.taken['2026-10-19|14'] && rows(w.f).length === 0 && w.wk.jPending.length === 0, [r.error, b.mode, b.taken]);
  r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 14 }, { date: '2026-10-21', h: 14 }]));
  await w.wk.idle();
  ok('… gửi lại cùng mã → ok (không phải dup), sổ đúng 2 dòng', r.ok && !r.dup && ofRid(w.f, R).length === 2, r.error);
}

console.log('\n== Hàng đợi quá hạn ==');
{
  const w = world(vn('2026-10-18', '07:00'), { LOCK_WAIT: 60 });
  const s = await login(w.wk, 0);
  let releaseHold; w.wk.testHold = new Promise(r => { releaseHold = r; });
  const R = rid(), t0 = Date.now();
  const r = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }]));
  const ms = Date.now() - t0;
  ok('Đợi quá LOCK_WAIT → he_thong_ban đúng hạn (' + ms + ' ms), không đợi lô đang chạy xong', r.error === 'he_thong_ban' && ms < 400, [r, ms]);
  releaseHold(); w.wk.testHold = null;
  await w.wk.idle();
  ok('… và không ghi gì', rows(w.f).length === 0);
  const r2 = await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }]));
  await w.wk.idle();
  ok('Gửi lại cùng mã khi hết bận → ok', r2.ok && rows(w.f).length === 2, r2.error);
}

console.log('\n== Đổi tên tab giữa chừng ==');
{
  const w = world(vn('2026-10-18', '07:00'));
  await login(w.wk, 0);
  w.f.BA.getSheetByName(' ⚙️ 2').name = '⚙️2';
  const cfg = w.f.BA.getSheetByName('⚙️2');
  cfg.rows[0][2] = 3;
  await w.wk.loadBA();
  ok('Tab ⚙️ 2 đổi tên → Google 400 → đọc lại danh sách tab → sức chứa mới = 3', w.wk.ba.cap === 3, w.wk.ba.cap);
}

console.log('\n== Cron tick ==');
{
  const w = world(vn('2026-10-18', '05:50'));
  await w.wk.tick();
  ok('Cron lúc 05:50 CN (sắp mở) → nạp sẵn BA + sổ + điểm danh', !!w.wk.ba && !!w.wk.log && !w.wk.log.partial && !!w.wk.mk);
  const c0 = JSON.stringify(w.fg.calls);
  await w.wk.tick();
  ok('Cron ngay sau đó → không đọc lại (còn mới)', JSON.stringify(w.fg.calls) === c0);
  await w.wk.api({ action: 'lt_find', q: 'duc nam', dev: DEV });
  const QK = 'c:lt:q:' + DEV + ':' + Math.floor(w.clock.now / 6e5);   /* khung 10 phút cố định */
  ok('Bộ đếm tìm tên lưu storage', !!(await w.wk.storage.get(QK)));
  w.clock.now += 11 * 60e3;
  w.wk.lastPurge = 0;
  await w.wk.tick();
  ok('Cron dọn bộ đếm hết hạn khỏi storage', (await w.wk.storage.get(QK)) === undefined);
}
{
  /* alarm không chạy (vd lỗi nền tảng) → cron mỗi phút vẫn ghi nốt nhật ký */
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.storage.onAlarm = null;
  w.fg.writeStatus = 503;
  const R = rid();
  await w.wk.api(BOOK(s.tok, R, [{ date: '2026-10-19', h: 15 }, { date: '2026-10-21', h: 15 }]));
  await w.wk.idle();
  w.fg.writeStatus = 0;
  await sleep(10);
  ok('Alarm không đánh thức được → mục còn chờ', w.wk.jPending.length === 1 && rows(w.f).length === 0);
  const tk = await w.wk.tick();
  ok('… cron tick ghi nốt: sổ đúng 2 dòng, pending 0', ofRid(w.f, R).length === 2 && tk.pending === 0 && w.wk.jPending.length === 0, tk);
}

console.log('\n== Google lỗi đúng lúc BA cần làm mới cho lượt ghi (BA > 90 s) ==');
{
  /* Google treo (đọc hết giờ), BA trong bộ nhớ 5 phút tuổi → lượt đặt vẫn nhận bằng bản cũ; lượt sau không đợi lại */
  const w = world(vn('2026-10-18', '07:00'), { READ_MS: 60 });
  const s = await login(w.wk, 0), s2 = await login(w.wk, 1);
  await w.wk.idle();
  w.fg.delay = k => (k === 'get' || k === 'meta') ? 400 : 0;
  w.wk.ba.at -= 5 * 60e3;
  const R1 = rid(), R2 = rid();
  let t0 = performance.now();
  const r = await w.wk.api(BOOK(s.tok, R1, [{ date: '2026-10-19', h: 14 }, { date: '2026-10-21', h: 14 }]));
  const ms1 = performance.now() - t0;
  ok('BA 5 phút tuổi + Google treo → vẫn nhận lượt đặt bằng bản BA cũ (' + ms1.toFixed(0) + ' ms: một lượt đọc hết giờ)', r.ok && r.mode === 'ticket' && r.mine.sessions.length === 2, r.error);
  const warn = w.logs.filter(o => o.a === 'ba' && o.warn === 'dung_ban_cu');
  ok('… ghi cảnh báo dung_ban_cu (chỉ tuổi dữ liệu + mã lỗi, không tên / SĐT)', warn.length === 1 && Object.keys(warn[0]).sort().join() === 'a,ageS,e,warn' && warn[0].ageS >= 300, warn);
  t0 = performance.now();
  const r2 = await w.wk.api(BOOK(s2.tok, R2, [{ date: '2026-10-20', h: 14 }, { date: '2026-10-22', h: 14 }]));
  const ms2 = performance.now() - t0;
  ok('Lượt đặt kế tiếp (trong 20 s) dùng ngay bản cũ, không đợi Google lần nữa (' + ms2.toFixed(1) + ' ms)', r2.ok && r2.mine.sessions.length === 2 && ms2 < 40, [r2.error, ms2]);
  const t = await until(() => ofRid(w.f, R1).length === 2 && ofRid(w.f, R2).length === 2 && w.wk.jPending.length === 0, 3000);
  ok('… lệnh ghi vẫn lên sổ (Google chỉ treo phần đọc): đúng 4 dòng', t >= 0 && rows(w.f).length === 4, [t, rows(w.f).length]);
  w.fg.delay = null;
  await w.wk.idle();
  w.wk.baFailAt = 0;
  await w.wk.tick();
  ok('Google hết treo → cron nạp lại BA mới', w.clock.now - w.wk.ba.at < 1000, w.clock.now - w.wk.ba.at);
}
{
  /* BA quá 15 phút mà Google sập → không đoán gói / hạn bằng dữ liệu quá cũ: loi_he_thong, không có mục nhật ký nào */
  const w = world(vn('2026-10-18', '07:00'));
  const s = await login(w.wk, 0);
  await w.wk.idle();
  w.fg.down = true;
  w.wk.ba.at -= 16 * 60e3;
  const r = await w.wk.api(BOOK(s.tok, rid(), [{ date: '2026-10-19', h: 16 }, { date: '2026-10-21', h: 16 }]));
  await w.wk.idle();
  ok('BA 16 phút tuổi + Google sập → loi_he_thong, nhật ký trống, sổ trống', !r.ok && r.error === 'loi_he_thong' && w.wk.jPending.length === 0 && w.storage.keys('j:').length === 0 && rows(w.f).length === 0, r);
  w.fg.down = false;
  w.wk.baFailAt = 0;
  const r2 = await w.wk.api(BOOK(s.tok, rid(), [{ date: '2026-10-19', h: 16 }, { date: '2026-10-21', h: 16 }]));
  await w.wk.idle();
  ok('… Google lại → đặt lại bình thường, đúng 2 dòng', r2.ok && rows(w.f).length === 2, r2.error);
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
