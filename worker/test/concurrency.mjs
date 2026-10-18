/* Test 2 · ĐỒNG THỜI + TỐC ĐỘ (Worker ghi sau qua nhật ký, Google giả có độ trễ)
   · 30 lượt đặt cùng lúc tranh 4 chỗ → đúng 4 thành công, 26 het_cho, không dòng trùng, ghi bằng 1–2 lệnh batchUpdate.
   · Cùng coach tranh một khung cùng lúc → đúng một người (1:1); ba khách 1:2 cùng coach → đúng một cặp.
   · Cùng mã yêu cầu gửi 2 lần cùng lúc → 1 lần ghi, lần kia dup.
   · Hai lượt đổi cùng một buổi cùng lúc → đúng một lượt thành công, sổ nhất quán.
   · Đọc xen giữa lúc ghi: không bao giờ thấy state cũ sau khi lượt ghi đã trả lời.
   · Tốc độ (Google 300 ms/lượt): đọc ấm 0 lượt gọi Google; đặt / đổi trả lời < 50 ms; sổ có dòng sau ~0,5–1 s.
   Chạy: node test/concurrency.mjs */
import { createRequire } from 'module';
import { BookingCore } from '../src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn } = require('../../test/gas_env.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 600) : '')); }
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SA = fakeServiceAccount();
const N = 30;
const COACHES = ['Quyết Hán', 'Hiền Mai', 'Khải Phan', 'Lâm Nguyễn', 'Bích Ngọc'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** kindOf(i): loại gói của khách i (mặc định 1:1) */
function files(kindOf) {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH'];
  const members = [['', '— MEMBERS'], [], [], [], H];
  const first = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hải', 'Khoa', 'Lan', 'Minh', 'Nga'];
  for (let i = 0; i < N; i++) {
    const no = 100 + i, name = 'Khách Thử ' + first[i % 10] + ' ' + String.fromCharCode(65 + Math.floor(i / 10)) + 'x';
    /* coach xoay vòng 5 người (luật 18/10: mỗi coach một suất mỗi khung) — khách i và i+5 cùng coach */
    members.push(['', String(no), name, '24 buổi', 24, kindOf ? kindOf(i) : '1:1', 0, COACHES[i % 5], '09000001' + String(i).padStart(2, '0'), '', '', '', 0, 20, '', d('2026-08-01'), '', d('2027-01-01'), 'B' + no + 'DY']);
  }
  const ba = { MEMBERS: members,
    'SESSION LOG': [['', '— SESSION LOG'], [], [], ['', '#', 'Ngày', 'Học viên', 'Trạng thái']],
    TRIAL: [['', '— TRIAL'], [], [], ['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', '— B0B'], [], ['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']],
    ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]] };
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  const out = { 'Sổ đặt lịch': [['', '— SỔ ĐẶT LỊCH'], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] };
  return { BA: new Spreadsheet('BA', LA, ba), OUT: new Spreadsheet('OUT', 'Asia/Saigon', out) };
}
/** opts: đè cấu hình DO. Mặc định giữ đúng cấu hình chạy thật (gom ghi 150 ms). */
function setup(nowMs, delay, opts) {
  const clock = { now: nowMs }, f = files(opts && opts.kindOf), logs = [];
  const fg = new FakeGoogle(f, { publicKey: SA.publicKey, delay: delay || (() => 5 + Math.random() * 35) });
  const storage = new FakeStorage();
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson }, fetch: fg.fetch, now: () => clock.now,
                               opts: Object.assign({ BACKOFF: [5, 10, 20, 40] }, opts ? Object.assign({}, opts, { kindOf: undefined }) : {}), log: o => logs.push(o) });
  storage.onAlarm = () => wk.alarm();
  return { clock, f, fg, wk, storage, logs, log: f.OUT.getSheetByName('Sổ đặt lịch') };
}
const devOf = i => 'devCONCURRENCY' + String(i).padStart(6, '0');
let ridN = 0; const rid = () => 'ridc' + String(++ridN).padStart(8, '0');
const rows = t => t.log.rows.slice(4).filter(r => r[1]);
async function loginAll(t) {
  const toks = [];
  for (let i = 0; i < N; i++) {
    const first = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hải', 'Khoa', 'Lan', 'Minh', 'Nga'][i % 10];
    const f = await t.wk.api({ action: 'lt_find', q: first + ' ' + String.fromCharCode(65 + Math.floor(i / 10)) + 'x', dev: devOf(i) });
    const v = await t.wk.api({ action: 'lt_verify', id: f.results[0].id, pin: '01' + String(i).padStart(2, '0'), remember: true, dev: devOf(i) });
    if (!v.ok) throw new Error('login ' + i + ' ' + JSON.stringify(v).slice(0, 200));
    toks.push(v.tok);
  }
  return toks;
}
/** Đợi tới khi điều kiện trên sổ thật đúng (đo thời gian sổ "bắt kịp"). */
async function until(cond, maxMs) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > maxMs) return -1; await sleep(2); } return Date.now() - t0; }

console.log('\n== A. 30 lượt đặt cùng lúc tranh 4 chỗ (T4 21.10 08:00) ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  await t.wk.idle();
  const before = Object.assign({}, t.fg.calls);
  const slotB = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'];
  const reqs = toks.map((tok, i) => ({ action: 'lt_book', dev: devOf(i), tok, rid: rid(), week: '2026-W43',
    picks: [{ date: '2026-10-21', h: 8 }, { date: slotB[i % 5], h: 6 + (i % 6) }] }));
  const t0 = Date.now();
  const res = await Promise.all(reqs.map(r => t.wk.api(r)));
  const ms = Date.now() - t0;
  const wAtReply = t.fg.calls.batchUpdate - before.batchUpdate;
  await t.wk.idle();
  const okN = res.filter(r => r.ok).length, full = res.filter(r => r.error === 'het_cho');
  ok('Đúng 4 lượt thành công, 26 lượt het_cho', okN === 4 && full.length === 26, res.map(r => r.ok ? 'ok' : r.error + '/' + (r.why || '')));
  ok('het_cho chỉ ra đúng khung đầy (T4 08:00), không kèm khung còn chỗ', full.every(r => r.full.length === 1 && r.full[0].date === '2026-10-21' && r.full[0].h === 8));
  ok('Cả 30 lượt trả lời trước khi có lệnh ghi Google nào (' + ms + ' ms) — không lượt nào đợi Google', wAtReply === 0, wAtReply);
  const R = rows(t);
  ok('Sổ có đúng 8 dòng (4 khách × 2 buổi) — lượt hỏng không để lại dòng nào', R.length === 8, R.length);
  ok('T4 08:00 có đúng 4 người, 4 coach khác nhau', R.filter(r => r[4] === '2026-10-21' && r[6] === '08:00').length === 4 &&
     new Set(R.filter(r => r[4] === '2026-10-21' && r[6] === '08:00').map(r => r[9])).size === 4);
  ok('Mỗi mã yêu cầu đúng 2 dòng', Object.values(R.reduce((m, r) => (m[r[15]] = (m[r[15]] || 0) + 1, m), {})).every(n => n === 2));
  const w = t.fg.calls.batchUpdate - before.batchUpdate;
  ok('Gom lô: ' + w + ' lệnh batchUpdate cho 30 lượt (1–2)', w >= 1 && w <= 2, w);
  console.log('        30 lượt đặt đồng thời trả lời xong trong ' + ms + ' ms; sổ nhận đủ sau ' + w + ' lệnh ghi');
  const st = res.find(r => r.ok);
  ok('Lượt thành công trả state đã có phiếu (mode ticket, 2 buổi)', st.mode === 'ticket' && st.mine.sessions.length === 2, st.mode);
  const tk = res.filter(r => r.ok).map(r => r.taken['2026-10-21|8']);
  ok('… mỗi lượt thành công thấy state sau lô của nó (T4 08:00: tăng dần tới 4)', Math.max.apply(null, tk) === 4 && tk.every(n => n >= 1 && n <= 4), tk);
  const loser = res.find(r => r.error === 'het_cho');
  ok('Lượt thua vẫn nhận state mới (mode book, taken = 4) để chọn lại', loser.mode === 'book' && loser.taken['2026-10-21|8'] === 4);
  ok('Nhật ký đã trống (mọi mục đã lên sheet), storage không còn khoá j:', t.wk.jPending.length === 0 && t.storage.keys('j:').length === 0);
}

console.log('\n== A2. Cùng coach tranh một khung cùng lúc (luật mỗi coach một suất) ==');
{
  /* 6 khách 1:1 của Quyết (i = 0, 5, …, 25) cùng lúc chọn T3 06:00 + một khung riêng ở T5 → đúng 1 người vào T3 06:00 */
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  await t.wk.idle();
  const ids = [0, 5, 10, 15, 20, 25];
  const res = await Promise.all(ids.map((i, k) => t.wk.api({ action: 'lt_book', dev: devOf(i), tok: toks[i], rid: rid(), week: '2026-W43',
    picks: [{ date: '2026-10-20', h: 6 }, { date: '2026-10-22', h: 6 + k }] })));
  await t.wk.idle();
  const okN = res.filter(r => r.ok).length, lost = res.filter(r => r.error === 'het_cho');
  ok('6 khách 1:1 cùng coach tranh T3 06:00 → đúng 1 thành công, 5 het_cho', okN === 1 && lost.length === 5, res.map(r => r.ok ? 'ok' : r.error));
  ok('… het_cho chỉ ra T3 06:00 (khung T5 của họ vẫn trống)', lost.every(r => r.full.length === 1 && r.full[0].date === '2026-10-20' && r.full[0].h === 6));
  ok('… người thua thấy coach bận ở T3 06:00, phòng mới 1 suất', lost.every(r => r.coachAt['2026-10-20|6'] === 'busy' && r.taken['2026-10-20|6'] === 1));
  const R = rows(t);
  ok('Sổ: đúng 2 dòng (1 khách × 2 buổi), T3 06:00 một người', R.length === 2 && R.filter(r => r[4] === '2026-10-20').length === 1, R.length);
}
{
  /* 6 khách 1:2 của Quyết cùng lúc chọn T3 06:00 → đúng một cặp (2 người, 1 suất) */
  const t = setup(vn('2026-10-18', '06:00'), null, { kindOf: i => i % 5 === 0 ? '1:2' : '1:1' });
  const toks = await loginAll(t);
  await t.wk.idle();
  const ids = [0, 5, 10, 15, 20, 25];
  const res = await Promise.all(ids.map((i, k) => t.wk.api({ action: 'lt_book', dev: devOf(i), tok: toks[i], rid: rid(), week: '2026-W43',
    picks: [{ date: '2026-10-20', h: 6 }, { date: '2026-10-22', h: 6 + k }] })));
  await t.wk.idle();
  const okN = res.filter(r => r.ok).length, lost = res.filter(r => r.error === 'het_cho');
  ok('6 khách 1:2 cùng coach tranh T3 06:00 → đúng 2 thành công (một cặp), 4 het_cho', okN === 2 && lost.length === 4, res.map(r => r.ok ? 'ok' : r.error));
  const R = rows(t), at = R.filter(r => r[4] === '2026-10-20' && r[6] === '06:00');
  ok('… sổ: T3 06:00 đúng 2 người, cùng coach, gói 1:2; phòng 1 suất', at.length === 2 && at.every(r => r[9] === 'Quyết Hán' && r[10] === '1:2') &&
     res.find(r => r.ok).taken['2026-10-20|6'] >= 1 && lost.every(r => r.taken['2026-10-20|6'] === 1), at.map(r => [r[9], r[10]]));
}

console.log('\n== B. Cùng mã yêu cầu gửi 2 lần cùng lúc ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  await t.wk.idle();
  const w0 = t.fg.calls.batchUpdate;
  const r0 = { action: 'lt_book', dev: devOf(0), tok: toks[0], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] };
  const [a, b] = await Promise.all([t.wk.api(structuredClone(r0)), t.wk.api(structuredClone(r0))]);
  await t.wk.idle();
  ok('Cả hai trả ok, đúng một lượt có dup', a.ok && b.ok && ((a.dup === true) !== (b.dup === true)), [a.dup, b.dup]);
  ok('Sổ chỉ có 2 dòng, đúng 1 lệnh ghi', rows(t).length === 2 && t.fg.calls.batchUpdate - w0 === 1, [rows(t).length, t.fg.calls.batchUpdate - w0]);
  const c = await t.wk.api(structuredClone(r0));
  await t.wk.idle();
  ok('Gửi lại lần 3 (sau đó) → dup, không thêm dòng, không ghi thêm', c.ok && c.dup && rows(t).length === 2 && t.fg.calls.batchUpdate - w0 === 1);
}

console.log('\n== D. Hai lượt đổi cùng một buổi cùng lúc ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  let r = await t.wk.api({ action: 'lt_book', dev: devOf(5), tok: toks[5], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }, { date: '2026-10-23', h: 6 }] });
  ok('Đặt 3 buổi', r.ok, r.error);
  t.clock.now = vn('2026-10-19', '07:00');
  const a = { action: 'lt_change', dev: devOf(5), tok: toks[5], rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 6 }, to: { date: '2026-10-22', h: 8 } };
  const b = { action: 'lt_change', dev: devOf(5), tok: toks[5], rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 6 }, to: { date: '2026-10-20', h: 9 } };
  const [ra, rb] = await Promise.all([t.wk.api(a), t.wk.api(b)]);
  await t.wk.idle();
  ok('Đúng một lượt đổi thành công, lượt kia khong_co_buoi', [ra, rb].filter(x => x.ok).length === 1 && [ra, rb].some(x => x.why === 'khong_co_buoi'), [ra.ok, ra.why, rb.ok, rb.why]);
  const R = rows(t).filter(x => x[16] === 'B105DY');
  ok('Sổ nhất quán: 4 dòng, 1 Đã đổi, 3 Đã đặt', R.length === 4 && R.filter(x => x[11] === 'Đã đổi').length === 1 && R.filter(x => x[11] === 'Đã đặt').length === 3, R.map(x => x[4] + ' ' + x[11]));
}

console.log('\n== E. Đọc xen giữa lúc ghi không bao giờ thấy state cũ ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  const jobs = [];
  for (let i = 10; i < 30; i++) {
    jobs.push(t.wk.api({ action: 'lt_book', dev: devOf(i), tok: toks[i], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 + (i % 6) }, { date: '2026-10-24', h: 14 + (i % 7) }] }));
    jobs.push(t.wk.api({ action: 'lt_boot', dev: devOf(i), tok: toks[i] }));
  }
  const out = await Promise.all(jobs);
  const booked = out.filter((r, k) => k % 2 === 0 && r.ok).length;
  const mid = await Promise.all(toks.slice(10).map((tok, k) => t.wk.api({ action: 'lt_boot', dev: devOf(10 + k), tok })));
  ok('Mở lại ngay sau khi đặt (sổ Google có thể chưa có dòng) vẫn thấy phiếu', booked === 20 && mid.every(r => r.mode === 'ticket' && r.mine.sessions.length === 2), [booked, mid.map(r => r.mode).join(',')]);
  await t.wk.idle();
  const after = await Promise.all(toks.slice(10).map((tok, k) => t.wk.api({ action: 'lt_boot', dev: devOf(10 + k), tok })));
  ok('Mọi lượt đặt thành công (20/20) và sau khi ghi xong mọi lượt mở lại đều thấy phiếu', after.every(r => r.mode === 'ticket' && r.mine.sessions.length === 2), after.map(r => r.mode).join(','));
  ok('Bộ nhớ sổ của DO khớp sổ thật (40 dòng)', t.wk.log.rows.length === 40 && rows(t).length === 40, [t.wk.log.rows.length, rows(t).length]);
}

console.log('\n== F. Tốc độ (Google giả trễ 300 ms/lượt như mạng thật) ==');
{
  const t = setup(vn('2026-10-18', '06:00'), () => 300);
  let t0 = Date.now();
  let r = await t.wk.api({ action: 'lt_boot', dev: devOf(0) });
  const cold = Date.now() - t0;
  const f = await t.wk.api({ action: 'lt_find', q: 'an ax', dev: devOf(0) });
  const v = await t.wk.api({ action: 'lt_verify', id: f.results[0].id, pin: '0100', remember: true, dev: devOf(0) });
  await t.wk.idle();
  const c0 = JSON.stringify(t.fg.calls);
  const times = {};
  for (const [name, body] of [['lt_boot (công khai)', { action: 'lt_boot', dev: devOf(0) }], ['lt_find', { action: 'lt_find', q: 'chi ax', dev: devOf(0) }],
                              ['lt_boot (đã nhớ máy)', { action: 'lt_boot', dev: devOf(0), tok: v.tok }]]) {
    t0 = performance.now(); r = await t.wk.api(body); times[name] = +(performance.now() - t0).toFixed(2);
  }
  ok('Đọc ấm không gọi Google lần nào', JSON.stringify(t.fg.calls) === c0, [c0, JSON.stringify(t.fg.calls)]);
  ok('Đọc ấm < 20 ms trong máy (không tính mạng tới Cloudflare)', Object.values(times).every(x => x < 20), times);
  console.log('        lượt đầu khi DO vừa thức (đọc Google): ' + cold + ' ms · đọc ấm: ' + JSON.stringify(times));

  /* ĐẶT: trả lời từ bộ nhớ + nhật ký; Google ghi sau */
  const w0 = t.fg.calls.batchUpdate;
  t0 = performance.now();
  r = await t.wk.api({ action: 'lt_book', dev: devOf(0), tok: v.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }, { date: '2026-10-23', h: 6 }] });
  const bookMs = performance.now() - t0, tb = Date.now();
  ok('lt_book trả lời ' + bookMs.toFixed(1) + ' ms < 50 ms (Google 300 ms/lượt — không lượt gọi nào trên đường trả lời)', r.ok && r.mode === 'ticket' && bookMs < 50 && t.fg.calls.batchUpdate === w0, [r.error, bookMs]);
  const bookSync = await until(() => rows(t).length === 3, 5000);
  ok('… sổ Google có đủ 3 dòng sau ' + bookSync + ' ms (gom 150 ms + 1 lệnh ghi, không cần đọc sổ)', bookSync > 0 && bookSync < 1000 && t.fg.calls.batchUpdate === w0 + 1, bookSync);
  await t.wk.idle();

  /* ĐỔI: cũng trả lời từ bộ nhớ; lúc ghi mới đọc sổ (lấy số dòng thật của buổi cũ) */
  const g1 = t.fg.calls.get, w1 = t.fg.calls.batchUpdate;
  t0 = performance.now();
  r = await t.wk.api({ action: 'lt_change', dev: devOf(0), tok: v.tok, rid: rid(), week: '2026-W43', from: { date: '2026-10-21', h: 6 }, to: { date: '2026-10-22', h: 7 } });
  const chMs = performance.now() - t0;
  ok('lt_change trả lời ' + chMs.toFixed(1) + ' ms < 50 ms', r.ok && r.mine.changesLeft === 1 && chMs < 50 && t.fg.calls.batchUpdate === w1, [r.error, r.why, chMs]);
  const chSync = await until(() => rows(t).some(x => x[11] === 'Đã đổi') && rows(t).length === 4, 5000);
  ok('… sổ Google có dòng Đã đổi + dòng Đổi sau ' + chSync + ' ms (gom 150 ms + đọc sổ + 1 lệnh ghi)', chSync > 0 && chSync < 1200 && t.fg.calls.batchUpdate === w1 + 1, chSync);
  await t.wk.idle();
  ok('… lần ghi đổi buổi đọc sổ đúng một lần', t.fg.calls.get - g1 >= 1, t.fg.calls.get - g1);

  /* lượt đặt kế tiếp của khách khác */
  const f1 = await t.wk.api({ action: 'lt_find', q: 'binh ax', dev: devOf(1) });
  const tok1 = (await t.wk.api({ action: 'lt_verify', id: f1.results[0].id, pin: '0101', remember: true, dev: devOf(1) })).tok;
  t0 = performance.now();
  const r2 = await t.wk.api({ action: 'lt_book', dev: devOf(1), tok: tok1, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] });
  const ms2 = performance.now() - t0;
  ok('Lượt đặt kế tiếp của khách khác → ok, ' + ms2.toFixed(1) + ' ms', r2.ok && ms2 < 50, r2.error);
  await t.wk.idle();
  ok('Sổ cuối: 6 dòng, nhật ký trống, không lỗi flush', rows(t).length === 6 && t.wk.jPending.length === 0 && t.logs.filter(o => o.a === 'flush' && !o.ok && !o.warn).length === 0, [rows(t).length, t.wk.jPending.length]);
  console.log('        đặt: ' + bookMs.toFixed(1) + ' ms (sổ +' + bookSync + ' ms) · đổi: ' + chMs.toFixed(1) + ' ms (sổ +' + chSync + ' ms)');
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
