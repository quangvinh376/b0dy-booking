/* Test 2 · ĐỒNG THỜI + LỖI GHI + TỐC ĐỘ (Worker, Google giả có độ trễ ngẫu nhiên)
   · 30 lượt đặt cùng lúc tranh 4 chỗ → đúng 4 thành công, 26 het_cho, không dòng trùng, tất cả hoặc không.
   · Cùng mã yêu cầu gửi 2 lần cùng lúc → 1 lần ghi, lần kia dup.
   · Lỗi ghi: đã ghi rồi mới đứt mạng / đứt trước khi ghi / Google 500 → không bao giờ ghi trùng, gửi lại an toàn.
   · Đọc xen giữa lúc ghi: không bao giờ thấy state cũ sau khi lượt ghi đã trả lời.
   · Tốc độ: đọc ấm không gọi Google; ghi = 1 lượt đọc sổ + 1 lượt ghi.
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

function files() {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH'];
  const members = [['', '— MEMBERS'], [], [], [], H];
  const first = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hải', 'Khoa', 'Lan', 'Minh', 'Nga'];
  for (let i = 0; i < N; i++) {
    const no = 100 + i, name = 'Khách Thử ' + first[i % 10] + ' ' + String.fromCharCode(65 + Math.floor(i / 10)) + 'x';
    members.push(['', String(no), name, '24 buổi', 24, '1:1', 0, 'Quyết Hán', '09000001' + String(i).padStart(2, '0'), '', '', '', 0, 20, '', d('2026-08-01'), '', d('2027-01-01'), 'B' + no + 'DY']);
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
function setup(nowMs, delay) {
  const clock = { now: nowMs }, f = files();
  const fg = new FakeGoogle(f, { publicKey: SA.publicKey, delay: delay || (() => 5 + Math.random() * 35) });
  const wk = new BookingCore({ storage: new FakeStorage(), env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson }, fetch: fg.fetch, now: () => clock.now, opts: { RECONCILE_MS: 1 } });
  return { clock, f, fg, wk, log: f.OUT.getSheetByName('Sổ đặt lịch') };
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
  await t.wk.idle();
  const okN = res.filter(r => r.ok).length, full = res.filter(r => r.error === 'het_cho');
  ok('Đúng 4 lượt thành công, 26 lượt het_cho', okN === 4 && full.length === 26, res.map(r => r.ok ? 'ok' : r.error + '/' + (r.why || '')));
  ok('het_cho chỉ ra đúng khung đầy (T4 08:00), không kèm khung còn chỗ', full.every(r => r.full.length === 1 && r.full[0].date === '2026-10-21' && r.full[0].h === 8));
  const R = rows(t);
  ok('Sổ có đúng 8 dòng (4 khách × 2 buổi) — lượt hỏng không để lại dòng nào', R.length === 8, R.length);
  ok('T4 08:00 có đúng 4 người', R.filter(r => r[4] === '2026-10-21' && r[6] === '08:00').length === 4);
  ok('Không mã yêu cầu nào lặp quá 2 dòng (mỗi lượt 2 buổi)', Object.values(R.reduce((m, r) => (m[r[15]] = (m[r[15]] || 0) + 1, m), {})).every(n => n === 2));
  const w = t.fg.calls.batchUpdate - before.batchUpdate;
  ok('Gom lô: ' + w + ' lệnh ghi cho 30 lượt (ít hơn 30)', w >= 1 && w < 30, w);
  console.log('        30 lượt đặt đồng thời xong trong ' + ms + ' ms (Google giả trễ 5–40 ms/lượt)');
  const st = res.find(r => r.ok);
  ok('Lượt thành công trả state đã có phiếu (mode ticket, 2 buổi)', st.mode === 'ticket' && st.mine.sessions.length === 2, st.mode);
  const tk = res.filter(r => r.ok).map(r => r.taken['2026-10-21|8']);
  ok('… mỗi lượt thành công thấy state sau lô của nó (T4 08:00: tăng dần tới 4)', Math.max.apply(null, tk) === 4 && tk.every(n => n >= 1 && n <= 4), tk);
  const loser = res.find(r => r.error === 'het_cho');
  ok('Lượt thua vẫn nhận state mới (mode book, taken = 4) để chọn lại', loser.mode === 'book' && loser.taken['2026-10-21|8'] === 4);
}

console.log('\n== B. Cùng mã yêu cầu gửi 2 lần cùng lúc ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  const r0 = { action: 'lt_book', dev: devOf(0), tok: toks[0], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] };
  const [a, b] = await Promise.all([t.wk.api(structuredClone(r0)), t.wk.api(structuredClone(r0))]);
  await t.wk.idle();
  ok('Cả hai trả ok, đúng một lượt có dup', a.ok && b.ok && ((a.dup === true) !== (b.dup === true)), [a.dup, b.dup]);
  ok('Sổ chỉ có 2 dòng', rows(t).length === 2, rows(t).length);
  const c = await t.wk.api(structuredClone(r0));
  ok('Gửi lại lần 3 (sau đó) → dup, không thêm dòng', c.ok && c.dup && rows(t).length === 2);
}

console.log('\n== C. Lỗi khi ghi: không bao giờ ghi trùng ==');
{
  const t = setup(vn('2026-10-18', '06:00'));
  const toks = await loginAll(t);
  /* C1: Google đã ghi rồi mạng mới đứt */
  t.fg.failWrite = 'after';
  const r1 = { action: 'lt_book', dev: devOf(1), tok: toks[1], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 9 }, { date: '2026-10-20', h: 9 }] };
  let r = await t.wk.api(structuredClone(r1));
  await t.wk.idle();
  ok('C1 đã ghi nhưng đứt mạng → đọc lại sổ thấy mã → trả ok như thường', r.ok && !r.dup && r.mode === 'ticket', r.error || r.mode);
  ok('C1 sổ có đúng 2 dòng', rows(t).filter(x => x[15] === r1.rid).length === 2);
  r = await t.wk.api(structuredClone(r1));
  ok('C1 trình duyệt gửi lại → dup, vẫn 2 dòng', r.ok && r.dup && rows(t).filter(x => x[15] === r1.rid).length === 2);
  /* C2: đứt mạng trước khi Google nhận */
  t.fg.failWrite = 'before';
  const r2 = { action: 'lt_book', dev: devOf(2), tok: toks[2], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 10 }, { date: '2026-10-20', h: 10 }] };
  r = await t.wk.api(structuredClone(r2));
  await t.wk.idle();
  ok('C2 chưa ghi → he_thong_ban (gửi lại an toàn), sổ không có dòng nào', r.ok === false && r.error === 'he_thong_ban' && rows(t).filter(x => x[15] === r2.rid).length === 0, r);
  r = await t.wk.api(structuredClone(r2));
  await t.wk.idle();
  ok('C2 gửi lại cùng mã → ok, đúng 2 dòng', r.ok && !r.dup && rows(t).filter(x => x[15] === r2.rid).length === 2, r.error);
  /* C3: Google trả 500 */
  t.fg.failWrite = 'status500';
  const r3 = { action: 'lt_book', dev: devOf(3), tok: toks[3], rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 11 }, { date: '2026-10-20', h: 11 }] };
  r = await t.wk.api(structuredClone(r3));
  await t.wk.idle();
  ok('C3 Google 500 → he_thong_ban, không dòng', r.error === 'he_thong_ban' && rows(t).filter(x => x[15] === r3.rid).length === 0, r);
  r = await t.wk.api(structuredClone(r3));
  ok('C3 gửi lại → ok', r.ok, r.error);
  /* C4: đổi buổi bị đứt mạng sau khi ghi */
  t.clock.now = vn('2026-10-19', '07:00');
  t.fg.failWrite = 'after';
  const c4 = { action: 'lt_change', dev: devOf(1), tok: toks[1], rid: rid(), week: '2026-W43', from: { date: '2026-10-20', h: 9 }, to: { date: '2026-10-22', h: 9 } };
  r = await t.wk.api(structuredClone(c4));
  await t.wk.idle();
  const mv = rows(t).filter(x => x[16] === 'B101DY');
  ok('C4 đổi buổi đứt mạng sau khi ghi → ok; sổ: 1 Đã đổi + 1 dòng Đổi, không trùng', r.ok && mv.filter(x => x[11] === 'Đã đổi').length === 1 && mv.filter(x => x[12] === 'Đổi').length === 1 && mv.length === 3, mv.map(x => x[4] + ' ' + x[11] + ' ' + x[12]));
  r = await t.wk.api(structuredClone(c4));
  ok('C4 gửi lại → dup, sổ không đổi', r.ok && r.dup && rows(t).filter(x => x[16] === 'B101DY').length === 3);
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
  await t.wk.idle();
  const booked = out.filter((r, k) => k % 2 === 0 && r.ok).length;
  const after = await Promise.all(toks.slice(10).map((tok, k) => t.wk.api({ action: 'lt_boot', dev: devOf(10 + k), tok })));
  ok('Mọi lượt đặt thành công (20/20) và sau đó mọi lượt mở lại đều thấy phiếu', booked === 20 && after.every(r => r.mode === 'ticket' && r.mine.sessions.length === 2), [booked, after.map(r => r.mode).join(',')]);
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
  t.wk.cfg.WRITE_LOG_FRESH = 50;                       /* người dùng chọn lịch lâu hơn 3 s → lượt ghi luôn đọc sổ mới */
  await new Promise(r => setTimeout(r, 80));
  const g0 = Object.assign({}, t.fg.calls);
  t0 = Date.now();
  r = await t.wk.api({ action: 'lt_book', dev: devOf(0), tok: v.tok, rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }] });
  const wms = Date.now() - t0;
  ok('Đặt lịch: ' + (t.fg.calls.get - g0.get) + ' lượt đọc song song (sổ + TRIAL) + ' + (t.fg.calls.batchUpdate - g0.batchUpdate) + ' lượt ghi = ' + wms + ' ms (Google 300 ms/lượt → 2 nhịp mạng)', r.ok && t.fg.calls.batchUpdate - g0.batchUpdate === 1 && t.fg.calls.get - g0.get <= 2 && wms < 800, [r.error, t.fg.calls, g0]);
  t0 = Date.now();
  const r2 = await t.wk.api({ action: 'lt_book', dev: devOf(1), tok: (await (async () => { const f1 = await t.wk.api({ action: 'lt_find', q: 'binh ax', dev: devOf(1) }); return (await t.wk.api({ action: 'lt_verify', id: f1.results[0].id, pin: '0101', remember: true, dev: devOf(1) })).tok; })()), rid: rid(), week: '2026-W43', picks: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-21', h: 7 }] });
  ok('Lượt đặt kế tiếp của khách khác → ok', r2.ok, r2.error);
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
