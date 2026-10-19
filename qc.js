/* =====================================================================
   B0DY · Đặt lịch tập tuần — CHẾ ĐỘ QC (booking.b0dy.studio/?qc)
   Để chủ studio thử mọi luồng trước giờ mở đặt mà không chạm vào lịch thật:
   · Máy chủ giả chạy NGAY TRÊN MÁY bằng đúng mã của máy chủ thật (worker/src: BookingCore + core.js — bản đang chạy
     trên Cloudflare), đọc / ghi một Google Sheets GIẢ (tên bịa, SĐT bịa, không có khách thật).
   · app.js khi có ?qc: bộ nhớ máy dùng tiền tố 'qc:', mọi lệnh gọi máy chủ đi qua QCB.fetch — không ra mạng.
   · Trạng thái máy chủ giả nằm ở localStorage: 'qcsrv:g' bảng tính giả · 'qcsrv:do' storage của Durable Object ·
     'qcsrv:clock' đồng hồ giả · 'qcsrv:opt' gây lỗi + tuỳ chọn.
   · Bảng QC (nút "QC · Dữ liệu giả" ở mép trên): kịch bản giờ, tua giờ, hội viên thử, gây lỗi lượt ghi, sổ đặt lịch giả.
   ===================================================================== */
import { BookingCore } from './worker/src/booking.js';
import * as C from './worker/src/core.js';
import { GoogleError, appendRows } from './worker/src/sheets.js';

const LT = C.LT;
const K = { g: 'qcsrv:g', do: 'qcsrv:do', clock: 'qcsrv:clock', opt: 'qcsrv:opt', owner: 'qcsrv:owner' };
/* Mã của tab này: tab ?qc mở sau cùng giữ bộ nhớ chung (qcsrv:owner); tab cũ thôi ghi và nhắc tải lại (xem own()). */
const TAB_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const BA_ID = 'qc-ba', OUT_ID = 'qc-out';
const SECRET = 'qc-che-do-thu-khong-phai-ma-that-0123456789';   /* chỉ ký mã nhớ máy của chế độ QC */
const HR = 3600e3, DAY = 864e5;
const ST_IDX = LT.LOG_HEAD.indexOf('Trạng thái'), NOTE_IDX = LT.LOG_HEAD.indexOf('Ghi chú');

/* ============================== BỘ NHỚ MÁY ============================== */
/* Safari riêng tư có thể ném lỗi: mọi truy cập bọc try/catch.
   FROZEN: đang đổi kịch bản / tua giờ / thoát (trang sắp tải lại) → máy chủ giả cũ còn chạy dở (flush, cron) không được ghi đè
   trạng thái mới xuống máy. Nhật ký chưa kịp xoá thì lần mở sau init() đọc sổ, thấy mã yêu cầu đã có, tự bỏ — không ghi trùng. */
let FROZEN = false;
function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ: phiên QC vẫn chạy, chỉ không giữ qua lần tải lại */ } }
/** Xoá mọi khoá bắt đầu bằng một trong các tiền tố (localStorage + sessionStorage), trừ khoá keep(k) giữ lại. */
function wipe(prefixes, keep) {
  const stores = [];
  try { stores.push(window.localStorage); } catch (e) { /* bỏ qua */ }
  try { stores.push(window.sessionStorage); } catch (e) { /* bỏ qua */ }
  stores.forEach(st => {
    try {
      const ks = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && prefixes.some(p => k.indexOf(p) === 0) && !(keep && keep(k))) ks.push(k); }
      ks.forEach(k => st.removeItem(k));
    } catch (e) { /* bỏ qua */ }
  });
}

/* ============================== THỜI GIAN ============================== */
/** Giờ Việt Nam → ms: vn('2026-10-18', '07:00:00') */
function vn(iso, hms) { const t = hms.split(':').map(Number); return C.dayMs(iso) + t[0] * HR + t[1] * 60e3 + (t[2] || 0) * 1e3; }
/** Ô ngày của Sheets (UNFORMATTED_VALUE + SERIAL_NUMBER) */
function serial(iso) { const a = iso.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]) / DAY + 25569; }
/** Ngày kiểu Mỹ như app coach ghi vào SESSION LOG: "10/19/2026" */
function mdy(iso) { const a = iso.split('-').map(Number); return a[1] + '/' + a[2] + '/' + a[0]; }

/* ============================== THẾ GIỚI GIẢ · TUẦN 43 ============================== */
const MON = '2026-10-19';                                    /* T2 19.10 – T7 24.10.2026 */
const day = i => C.addDays(MON, i);                         /* 0 = T2 … 5 = T7 */
const WEEK = C.weekKey(MON), WNO = C.isoWeek(MON).week;

/** Kịch bản = thế giới mới + đồng hồ giả bắt đầu từ `at` (chạy theo giờ thật). booked: đã có người đặt tuần 43 chưa. */
const SCEN = {
  truoc: { at: vn('2026-10-18', '05:59:30'), t: 'CN 18.10 · 05:59:30', s: 'Trước giờ mở · đếm ngược 30 giây rồi tự mở', booked: false },
  mo: { at: vn('2026-10-18', '07:00:00'), t: 'CN 18.10 · 07:00', s: 'Đang mở đặt tuần 43 · đã có người đặt', booked: true },
  giua: { at: vn('2026-10-21', '08:30:00'), t: 'T4 21.10 · 08:30', s: 'Giữa tuần · đặt muộn, đổi lịch, luật 24 giờ', booked: true },
  cuoi: { at: vn('2026-10-24', '21:00:00'), t: 'T7 24.10 · 21:00', s: 'Cuối tuần · hết khung, đếm tới 06:00 Chủ Nhật', booked: true }
};
const ORDER = ['truoc', 'mo', 'giua', 'cuoi'];
const QH = 'Quyết Hán', HM = 'Hiền Mai', KP = 'Khải Phan', LN = 'Lâm Nguyễn', BN = 'Bích Ngọc';

/* Hội viên thử (chủ studio đăng nhập bằng tên + 4 số cuối điện thoại). Tên bịa, đã so với file BA thật:
   không trùng họ tên, không trùng tên đệm + tên của hội viên nào. SĐT bịa. */
const PERSONAS = [
  { code: 'B801DY', name: 'Trịnh Minh Khôi', pkg: 48, kind: '1:1', coach: QH, phone: '0900001111', left: 30, start: '2026-08-03', exp: '2027-03-01', test: 'Đặt mới 2–4 buổi, đổi lịch, thêm buổi · "Coach bận" ở khung Quyết đang dạy (T6 07:00) và khung Quyết nhận khách tập thử (T3 07:00) · Quyết nghỉ T5 06–07, nhận CN 08–11 (Lịch coach)' },
  { code: 'B802DY', name: 'Vũ Thanh Hằng', pkg: 24, kind: '1:1', coach: HM, phone: '0900002222', left: 1, start: '2026-06-01', exp: '2026-12-31', test: 'Còn 1 buổi · chỉ đặt được 1 buổi' },
  { code: 'B803DY', name: 'Đặng Quốc Bảo', pkg: 24, kind: '1:1', coach: KP, phone: '0900003333', left: 6, start: '2026-07-01', exp: '2026-10-21', test: 'Gói hết hạn T4 21.10 · từ T5 bị khoá' },
  { code: 'B804DY', name: 'Lương Thùy Dung', pkg: 36, kind: '1:1', coach: BN, phone: '0900004444', left: 36, start: '2026-10-21', exp: '2027-04-30', test: 'Gói bắt đầu T4 21.10 · T2, T3 bị khoá' },
  { code: 'B805DY', name: 'Tạ Uyển Nhi', pkg: 48, kind: '1:2', coach: LN, phone: '0900005555', left: 20, start: '2026-08-03', exp: '2027-02-28', test: 'Gói 1:2 · chỉ khung ghép 09 · 11 · 15 · 17 · 19 · Tuấn Kiệt mời tập đôi T3 17:00 (phòng đầy vẫn ghép được) · Thảo Vy mời T7 15:00 · T2 15:00 cặp đã đủ → "Coach bận"' },
  { code: 'B806DY', name: 'Châu Gia Huy', pkg: 24, kind: '1:1', coach: QH, phone: '', left: 12, start: '2026-08-03', exp: '2027-01-31', test: 'Hồ sơ chưa có số điện thoại' },
  { code: 'B807DY', name: 'Phùng Diệu Linh', pkg: 48, kind: '1:1', coach: HM, phone: '0900007777', left: 25, start: '2026-07-06', exp: '2027-02-28', test: 'Đã đặt sẵn 3 buổi · mở thẳng phiếu, đổi, thêm buổi' },
  { code: 'B808DY', name: 'Kiều Hữu Tâm', pkg: 24, kind: '1:1', coach: KP, phone: '0900008888', left: 14, start: '2026-07-06', exp: '2027-01-31', test: 'Đã đổi 2 lần · hết lượt đổi' },
  { code: 'B809DY', name: 'Hà Minh Quân', pkg: 36, kind: '1:1', coach: LN, phone: '0900009999', left: 18, start: '2026-07-06', exp: '2027-03-31', test: 'Trùng tên đệm + tên · gõ "minh quân" ra hai người' },
  { code: 'B810DY', name: 'Lục Minh Quân', pkg: 12, kind: '1:1', coach: BN, phone: '0900001010', left: 8, start: '2026-09-07', exp: '2026-12-31', test: 'Trùng tên đệm + tên với Hà Minh Quân' },
  { code: 'B811DY', name: 'Mẫn Thục Quyên', pkg: 24, kind: '1:2', coach: LN, phone: '0900001212', left: 16, start: '2026-08-03', exp: '2027-02-28', test: 'Gói 1:2 cùng coach Lâm với Tạ Uyển Nhi · đặt một khung ghép rồi mời bạn, hoặc mở trang xem lời mời bạn gửi' }
];
/* Người tập nền: lấp bảng giờ cho giống ngày mở đặt thật (đã so với file BA thật như trên). Coach xoay vòng Quyết · Mai · Khải ·
   Lâm · Ngọc; hai người của Lâm (Quách Tuấn Kiệt, Bế Thảo Vy) mua gói 1:2 — để thử luật ghép 1:2 cùng coach. */
const DUO_BG = ['Quách Tuấn Kiệt', 'Bế Thảo Vy'];
const BG = ['Âu Bảo Châu', 'Bạch Gia Hân', 'Doãn Khánh Ly', 'Hứa Tường Vy', 'Khổng Đình Phúc', 'Lã Phương Thảo', 'Mạc Quang Huy', 'Ông Thục Anh',
  'Quách Tuấn Kiệt', 'Sầm Hạnh Nhi', 'Thân Đức Duy', 'Triệu Mỹ Duyên', 'Yên Khả Hân', 'Bế Thảo Vy', 'Chung Thiên Ý', 'Diệp Chí Thanh', 'La Ngân Hà',
  'Mai Trúc Lam', 'Giáp Hoàng Sơn', 'Lý Nhã Uyên', 'Tô Kỳ Nam', 'Viên Hồng Nhung']
  .map((name, i) => ({ code: 'B8' + (51 + i) + 'DY', name: name, pkg: 48, kind: DUO_BG.indexOf(name) >= 0 ? '1:2' : '1:1', coach: [QH, HM, KP, LN, BN][i % 5],
                       phone: '09100000' + String(i + 1).padStart(2, '0'), left: 30, start: '2026-07-01', exp: '2027-03-01' }));
/* Khung bận lúc 07:00 CN (giống Figma 03): [thứ (0 = T2), giờ, các suất] — mỗi coach một suất mỗi khung (luật 18/10); 4 suất = đầy,
   3 suất = còn 1. Suất: 'QH' 'HM' 'KP' 'LN' 'BN' = một khách 1:1 của coach đó · 'LN2' = một khách 1:2 của Lâm (còn ghép được) ·
   'LN22' = cặp 1:2 của Lâm (hai người, một suất). Không đụng khung của hội viên thử đã đặt sẵn (Diệu Linh, Hữu Tâm) và các khung
   test/ui_qc.js đặt. Khách 1:2 chỉ đặt khung ghép 09 · 11 · 15 · 17 · 19 (chủ studio chốt 18/10) nên suất 1:2 nằm ở các giờ đó.
   Chỗ để thử: T3 17:00 đầy nhưng Tạ Uyển Nhi (1:2 · Lâm) ghép được với Tuấn Kiệt · T7 15:00 ghép với Thảo Vy không tốn suất ·
   T2 15:00 cặp của Lâm đã đủ → "Coach bận" · T6 15:00 Lâm đang dạy 1:1 (phòng đầy) · T6 07:00 Quyết bận với Trịnh Minh Khôi.
   Khách tập thử T3 07:00 (tab TRIAL) do Quyết tiếp nhận → khung đó Quyết cũng bận (luật 18/10). */
const BUSY = [
  [0, 10, ['QH', 'HM', 'KP', 'BN']], [2, 10, ['QH', 'HM', 'KP', 'LN']], [2, 15, ['QH', 'HM', 'KP', 'BN']], [4, 15, ['QH', 'KP', 'LN', 'BN']],
  [1, 17, ['QH', 'HM', 'KP', 'LN2']], [3, 18, ['QH', 'HM', 'LN', 'BN']], [4, 18, ['QH', 'HM', 'KP', 'BN']],
  [4, 7, ['QH', 'HM', 'KP']], [3, 9, ['HM', 'KP', 'BN']], [4, 10, ['HM', 'LN', 'BN']], [0, 14, ['QH', 'KP', 'BN']], [2, 14, ['HM', 'KP', 'BN']],
  [3, 14, ['QH', 'KP', 'LN']], [2, 16, ['QH', 'LN', 'BN']], [5, 15, ['HM', 'KP', 'LN2']], [5, 18, ['QH', 'HM', 'BN']], [1, 20, ['HM', 'KP', 'BN']],
  [0, 15, ['LN22']]];
const TAG = { QH: QH, HM: HM, KP: KP, LN: LN, BN: BN };
/* Đổi dữ liệu thế giới giả (người tập nền, khung bận) → tăng số này: máy đã mở ?qc trước đó dựng lại thế giới mới khi tải trang. */
const WORLD_V = 5;
/* Lịch coach giả (tab "Lịch coach" của file Lịch tập tuần, từ 19/10): Quyết nghỉ T5 06–07 (ô "Coach nghỉ" một phần ngày) và nhận
   CN 08–11; Mai nhận CN 14–17; coach khác không có lưới → T2–T7 đủ giờ, CN nghỉ (khối "COACH NGHỈ" trọn ngày). */
function schedRows() {
  const D7 = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const g = (name, on) => [['', name].concat(D7)].concat(LT.SLOTS.map(h => ['', C.hm(h)].concat(D7.map((x, i) => on(i, h)))), [[]]);
  return [['', '— LỊCH COACH · QC'], ['', 'Tick = coach nhận khách giờ đó · bỏ tick = Coach nghỉ'], []]
    .concat(g(QH, (i, h) => i === 6 ? h >= 8 && h <= 11 : !(i === 3 && h <= 7)), g(HM, (i, h) => i === 6 ? h >= 14 && h <= 17 : true));
}
/* Phòng nghỉ T7 24.10 (bật / tắt trong bảng QC) — dòng của khối "LÝ DO ĐÓNG CỬA" trên tab B0B */
const NGHI = ['', 'Bảo trì phòng tập', '24/10/26'];

function meOf(m) { return { key: m.code, name: m.name, short: C.short(m.name), coach: m.coach, kind: m.kind }; }
function ticketOf(m) { return m.code + '-W' + C.lt2(WNO); }
function slot(d, h) { return { date: day(d), h: h }; }

/**
 * Chia khung bận cho người tập nền theo từng suất: suất của coach nào lấy người của coach đó (đúng loại gói), mỗi người tối đa
 * 4 buổi, mỗi ngày 1 buổi, ai đang ít buổi nhất nhận trước. Thiếu người → ném lỗi (sửa BUSY, đừng để thế giới giả lệch luật).
 */
function bgPlan() {
  const per = BG.map(() => ({}));
  const take = (date, h, coach, kind) => {
    let best = -1;
    per.forEach((p, i) => {
      const c = Object.keys(p).length;
      if (BG[i].coach !== coach || BG[i].kind !== kind || p[date] || c >= LT.MAX) return;
      if (best < 0 || c < Object.keys(per[best]).length) best = i;
    });
    if (best < 0) throw new Error('QC: thiếu người tập nền cho ' + coach + ' ' + kind + ' ' + date);
    per[best][date] = h;
  };
  BUSY.forEach(([d, h, tags]) => {
    const date = day(d);
    tags.forEach(tg => {
      const coach = TAG[tg.slice(0, 2)], n = tg.length === 4 ? 2 : 1;
      for (let k = 0; k < n; k++) take(date, h, coach, tg.length > 2 ? '1:2' : '1:1');
    });
  });
  return per;
}
/**
 * Các lượt ghi tuần 43 đã nằm trên sổ khi mở kịch bản (CN 18.10, từ 06:00) — dòng 17 cột đúng như máy chủ thật ghi (C.logRow):
 * người tập nền đặt 2–3 buổi · Phùng Diệu Linh đặt 3 buổi · Kiều Hữu Tâm đặt 2 buổi rồi đổi cả hai (hết lượt đổi).
 */
function seedWrites() {
  const out = [], t0 = vn('2026-10-18', '06:00:00');
  bgPlan().forEach((p, i) => {
    const m = BG[i], at = t0 + (5 + i * 157) * 1e3;
    const picks = Object.keys(p).sort().map(d => ({ date: d, h: p[d] }));
    out.push({ at: at, rows: picks.map(x => C.logRow(ticketOf(m), 1, WEEK, x, meOf(m), 'Đặt', '', C.stamp(at), 'qcw' + m.code + '01')) });
  });
  /* lời mời tập đôi: người 1:2 của Lâm đang chờ một mình mời Tạ Uyển Nhi (dòng "Mời" như máy chủ ghi, sau dòng đặt của họ) */
  const U = PERSONAS.find(m => m.code === 'B805DY'), plan = bgPlan();
  [[slot(1, 17), vn('2026-10-18', '06:35:10')], [slot(5, 15), vn('2026-10-18', '06:41:40')]].forEach(([x, at], j) => {
    const i = BG.findIndex((m, k) => m.kind === '1:2' && m.coach === LN && plan[k][x.date] === x.h);
    if (i < 0) throw new Error('QC: không có người 1:2 nào của Lâm chờ ở ' + x.date + ' ' + x.h);
    out.push({ at: at, rows: [C.inviteRow(ticketOf(BG[i]), 1, WEEK, x, meOf(BG[i]), meOf(U), C.stamp(at), 'qcwI' + BG[i].code + j)] });
  });
  const L = PERSONAS.find(m => m.code === 'B807DY'), a = vn('2026-10-18', '06:12:31');
  out.push({ at: a, rows: [slot(0, 7), slot(2, 18), slot(4, 19)].map(x => C.logRow(ticketOf(L), 1, WEEK, x, meOf(L), 'Đặt', '', C.stamp(a), 'qcwB807DY01')) });
  const T = PERSONAS.find(m => m.code === 'B808DY'), a1 = vn('2026-10-18', '06:20:44'), a2 = vn('2026-10-18', '06:31:02'), a3 = vn('2026-10-18', '06:47:15');
  const first = [slot(1, 8), slot(3, 8)].map(x => C.logRow(ticketOf(T), 1, WEEK, x, meOf(T), 'Đặt', '', C.stamp(a1), 'qcwB808DY01'));
  const moves = [[slot(1, 8), slot(1, 9), a2, 2], [slot(3, 8), slot(3, 11), a3, 3]];
  out.push({ at: a1, rows: first });
  moves.forEach(([from, to, at, ver], i) => {
    first[i][ST_IDX] = LT.MOVED;                                     /* dòng cũ: "Đã đổi" + ghi chú như máy chủ ghi khi đổi */
    first[i][NOTE_IDX] = 'Đổi sang ' + C.slotLabel(to);
    out.push({ at: at, rows: [C.logRow(ticketOf(T), ver, WEEK, to, meOf(T), 'Đổi', 'Đổi từ ' + C.slotLabel(from), C.stamp(at), 'qcwB808DY0' + ver)] });
  });
  return out.sort((x, y) => x.at - y.at);
}
/** SESSION LOG: điểm danh mọi buổi "Đã đặt" đã bắt đầu trước `at` (coach check-in bằng app) — phần lớn Đã tập, vài buổi Vắng. */
function marksBefore(at, writes) {
  const ses = [];
  writes.forEach(w => w.rows.forEach(r => { if (r[ST_IDX] === LT.ON) ses.push(r); }));
  ses.sort((x, y) => x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : parseInt(x[5], 10) - parseInt(y[5], 10));
  const out = [];
  ses.forEach(r => {
    const iso = r[3], h = parseInt(r[5], 10);
    if (C.slotMs(iso, h) >= at) return;
    const n = out.length + 1, kh = r[15];
    const st = kh === 'B807DY' ? 'Đã tập' : kh === 'B808DY' || n % 7 === 4 ? 'Vắng' : 'Đã tập';
    out.push(['', String(n).padStart(4, '0'), mdy(iso), r[4], r[5], r[8], '', r[6], kh, r[9], '', st, '', '', st === 'Đã tập' ? 'app ' + r[5] + ' · ký: ' + r[8] : '', n]);
  });
  return out;
}
/** Hai file Google Sheets giả của một kịch bản: BA (MEMBERS, SESSION LOG, TRIAL, B0B, cấu hình ⚙ 2) + Lịch tập tuần (sổ, _dữ liệu). */
function buildFiles(key, nghi) {
  const sc = SCEN[key], writes = sc.booked ? seedWrites() : [];
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái',
    'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key'];
  const members = [['', '— MEMBERS'], ['', 'QC · dữ liệu giả'], [], [], H].concat(PERSONAS.concat(BG).map((m, i) =>
    ['', i + 1, m.name, m.pkg + ' buổi', m.pkg, m.kind, '', m.coach, m.phone, '', '', '', m.pkg - m.left, m.left, '', serial(m.start), '', serial(m.exp), m.code, m.name + '|' + m.start]));
  const LH = ['', '#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử', '_mrow'];
  const TH = ['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ & tên / Username', 'Số điện thoại', 'Ghi chú (không bắt buộc)', 'Trạng thái', 'Coach tiếp nhận'];
  const b0b = [['', '— B0B'], [], ['', 'CA', 'GIỜ', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], ['', 'A', '08:00', 2, 2, 2, 2, 2, 2, ''],
    [], ['', 'LÝ DO ĐÓNG CỬA', 'NGÀY'], ['', 'Tết Dương lịch', '01/01/27']].concat(nghi ? [NGHI.slice()] : []);
  const cfg = [['', '— CONFIG 2'], [], [], ['', 'Coach', 'Giai đoạn', '% Com'], ['', QH, '', ''], [], ['', '— THÔNG SỐ VẬN HÀNH'],
    ['', 'Sức chứa tối đa / khung', 4], ['', 'Giờ mở cửa', '06:00 – 21:00']];
  const so = [['', '— SỔ ĐẶT LỊCH · QC'], ['', 'Máy chủ giả của chế độ QC ghi vào đây · không phải sổ thật'], [], [''].concat(LT.LOG_HEAD)];
  writes.forEach(w => w.rows.forEach(r => so.push([''].concat(r))));
  return {
    [BA_ID]: [
      { id: 101, title: 'MEMBERS', rows: members },
      { id: 102, title: 'SESSION LOG', rows: [['', '— SESSION LOG'], ['', 'QC · dữ liệu giả'], [], LH].concat(marksBefore(sc.at, writes)) },
      { id: 103, title: 'TRIAL', rows: [['', '— TRIAL'], ['', 'QC · dữ liệu giả'], [], TH, ['', '01', serial(day(1)), '07:00', 'Khách tập thử', '0911110001', '', 'Chờ xác nhận', QH]] },
      { id: 104, title: 'B0B', rows: b0b },
      { id: 105, title: ' ' + C.GEAR + String.fromCharCode(0xFE0F) + ' 2', rows: cfg }
    ],
    [OUT_ID]: [
      { id: 201, title: 'Bảng lịch tập', rows: [['', '— LỊCH TẬP TUẦN · QC']] },
      { id: 202, title: LT.LOG, rows: so },
      { id: 203, title: LT.DATA, rows: [['SỨC CHỨA / KHUNG', 4], ['CẬP NHẬT', ''], [], ['Hội viên', 'Tên ngắn', 'Coach', 'Còn lại', 'Hết hạn', 'Mã KH', '_hiển thị']] },
      { id: 204, title: LT.SCHED, rows: schedRows() }
    ]
  };
}

/* ============================== GOOGLE SHEETS GIẢ ============================== */
/* Cùng giao diện với worker/src/sheets.js (meta · batchGet · batchUpdate · valuesUpdate · valuesClear) và cùng cách trả giá trị
   như Google với UNFORMATTED_VALUE + SERIAL_NUMBER: bỏ ô trống cuối hàng và hàng trống cuối bảng. */
const empty = v => v === '' || v === null || v === undefined;
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
/** "'Tên tab'!B4:R" → {title, r1, c1, r2, c2} (r2 / c2 = null: tới hết). Cả tab: không có "!". */
function parseA1(a1) {
  let title, rest = null;
  const m = a1.match(/^'((?:[^']|'')*)'(?:!(.*))?$/);
  if (m) { title = m[1].replace(/''/g, "'"); rest = m[2] === undefined ? null : m[2]; }
  else { const i = a1.indexOf('!'); title = i < 0 ? a1 : a1.slice(0, i); rest = i < 0 ? null : a1.slice(i + 1); }
  if (rest === null) return { title: title, r1: 1, c1: 1, r2: null, c2: null };
  const p = rest.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!p) throw new GoogleError('google_400', 400, false);
  const c1 = colNum(p[1]), r1 = p[2] ? +p[2] : 1;
  const c2 = p[3] ? colNum(p[3]) : c1, r2 = p[3] ? (p[4] ? +p[4] : null) : (p[2] ? +p[2] : null);
  return { title: title, r1: r1, c1: c1, r2: r2, c2: c2 };
}
function lastRow(rows) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].some(v => !empty(v))) return i + 1; return 0; }
function lastCol(rows) {
  let n = 0;
  rows.forEach(r => { if (!r) return; for (let j = r.length - 1; j >= n; j--) if (!empty(r[j])) { n = j + 1; break; } });
  return n;
}
function cellOf(rows, i, j) { const v = (rows[i - 1] || [])[j - 1]; return empty(v) ? '' : v; }
function put(rows, i, j, v) {
  while (rows.length < i) rows.push([]);
  const r = rows[i - 1] || (rows[i - 1] = []);
  while (r.length < j) r.push('');
  r[j - 1] = v;
}
function readRange(rows, r, major) {
  const r2 = r.r2 === null ? lastRow(rows) : r.r2, c2 = r.c2 === null ? lastCol(rows) : r.c2, grid = [];
  for (let i = r.r1; i <= r2; i++) { const row = []; for (let j = r.c1; j <= c2; j++) row.push(cellOf(rows, i, j)); grid.push(row); }
  let out = grid;
  if (major === 'COLUMNS') { out = []; for (let j = 0; j <= c2 - r.c1; j++) out.push(grid.map(row => row[j])); }
  out = out.map(row => { let k = row.length; while (k > 0 && empty(row[k - 1])) k--; return row.slice(0, k); });
  let n = out.length;
  while (n > 0 && !out[n - 1].length) n--;
  return out.slice(0, n);
}
function cellVal(cd) {
  const u = cd && cd.userEnteredValue;
  if (!u) return '';
  if ('stringValue' in u) return u.stringValue;
  if ('numberValue' in u) return u.numberValue;
  if ('boolValue' in u) return u.boolValue;
  return '';
}
class FakeSheets {
  /** files: {spreadsheetId: [{id, title, rows}]} · onWrite: lưu xuống máy sau mỗi lần ghi */
  constructor(files, onWrite) { this.files = files; this.onWrite = onWrite; this.rev = 0; }
  file(id) { const f = this.files[id]; if (!f) throw new GoogleError('google_404', 404, false); return f; }
  /** Tab theo tên; không có → 400 như Google ("Unable to parse range") để BookingCore dò lại tên tab. */
  tab(f, title) {
    const n = String(title).normalize('NFC'), t = f.find(x => x.title.normalize('NFC') === n);
    if (!t) throw new GoogleError('google_400', 400, false);
    return t;
  }
  async meta(id) { return this.file(id).map(t => ({ id: t.id, title: t.title })); }
  async batchGet(id, ranges, major) {
    const f = this.file(id);
    return ranges.map(a1 => { const r = parseA1(a1); return readRange(this.tab(f, r.title).rows, r, major || 'ROWS'); });
  }
  /** Mọi request một lượt: kiểm hết rồi mới ghi (tất cả hoặc không, như spreadsheets.batchUpdate). */
  async batchUpdate(id, requests) {
    const f = this.file(id), byId = sid => f.find(t => t.id === sid);
    requests.forEach(q => {
      const x = q.appendCells || (q.updateCells && q.updateCells.start);
      if (!x || !byId(x.sheetId)) throw new GoogleError('google_400', 400, false);
    });
    requests.forEach(q => {
      if (q.appendCells) {
        const rows = byId(q.appendCells.sheetId).rows;
        q.appendCells.rows.forEach(row => { const at = lastRow(rows) + 1; row.values.forEach((cd, j) => put(rows, at, j + 1, cellVal(cd))); });
      } else {
        const st = q.updateCells.start, rows = byId(st.sheetId).rows;
        q.updateCells.rows.forEach((row, i) => row.values.forEach((cd, j) => put(rows, st.rowIndex + 1 + i, st.columnIndex + 1 + j, cellVal(cd))));
      }
    });
    this.wrote();
    return {};
  }
  async valuesUpdate(id, data) {
    const f = this.file(id), jobs = data.map(d => { const r = parseA1(d.range); return { r: r, rows: this.tab(f, r.title).rows, values: d.values }; });
    jobs.forEach(x => x.values.forEach((row, i) => row.forEach((v, j) => put(x.rows, x.r.r1 + i, x.r.c1 + j, v))));
    this.wrote();
    return {};
  }
  async valuesClear(id, ranges) {
    const f = this.file(id), jobs = ranges.map(a1 => { const r = parseA1(a1); return { r: r, rows: this.tab(f, r.title).rows }; });
    jobs.forEach(({ r, rows }) => {
      const r2 = r.r2 === null ? lastRow(rows) : r.r2, c2 = r.c2 === null ? lastCol(rows) : r.c2;
      for (let i = r.r1; i <= r2; i++) for (let j = r.c1; j <= c2; j++) if (!empty(cellOf(rows, i, j))) put(rows, i, j, '');
    });
    this.wrote();
    return {};
  }
  wrote() { this.rev++; if (!FROZEN) this.onWrite(); }
}

/* ============================== STORAGE GIẢ CỦA DURABLE OBJECT ============================== */
/* get(key | keys → Map) · put(key, v | {k: v…} nguyên khối) · delete(key | keys) · list({prefix}) → Map theo thứ tự khoá.
   Không có setAlarm: BookingCore tự hẹn giờ thử lại bằng setTimeout (trang đóng thì lần mở sau init() ghi tiếp nhật ký). */
class FakeStorage {
  constructor(obj, onWrite) { this.m = new Map(Object.entries(obj || {})); this.onWrite = onWrite; }
  copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  async get(k) {
    if (Array.isArray(k)) { const out = new Map(); k.forEach(x => { if (this.m.has(x)) out.set(x, this.copy(this.m.get(x))); }); return out; }
    return this.m.has(k) ? this.copy(this.m.get(k)) : undefined;
  }
  async put(k, v) {
    if (k && typeof k === 'object') Object.keys(k).forEach(x => this.m.set(x, this.copy(k[x])));
    else this.m.set(k, this.copy(v));
    this.saved();
  }
  async delete(k) {
    const list = Array.isArray(k) ? k : [k];
    let n = 0;
    list.forEach(x => { if (this.m.delete(x)) n++; });
    this.saved();
    return Array.isArray(k) ? n : n > 0;
  }
  async list(o) {
    const p = (o && o.prefix) || '', out = new Map();
    [...this.m.keys()].sort().forEach(x => { if (x.indexOf(p) === 0) out.set(x, this.copy(this.m.get(x))); });
    return out;
  }
  saved() { if (!FROZEN) this.onWrite(Object.fromEntries(this.m)); }
}

/* ============================== KHỞI ĐỘNG MÁY CHỦ GIẢ ============================== */
const opt = Object.assign({ fault: '', offline: false, slow: false, nghi: false, last: '' }, load(K.opt) || {});
let clock = load(K.clock), files = load(K.g);
/** Đồng hồ giả: giờ kịch bản + thời gian thật đã trôi từ lúc bắt đầu kịch bản (qua cả các lần tải lại trang). */
function nowMs() { return clock.base + (Date.now() - clock.t0); }
/** Thế giới mới cho kịch bản `key`: bảng tính giả mới, storage DO trống, đồng hồ đặt lại, bỏ lỗi đang chờ gây. */
function freshWorld(key) {
  FROZEN = true;
  opt.fault = ''; opt.last = ''; saveOpt();
  files = buildFiles(key, opt.nghi);
  clock = { key: key, base: SCEN[key].at, t0: Date.now(), v: WORLD_V, wid: Math.random().toString(36).slice(2, 12) };
  files.wid = clock.wid;
  save(K.g, files); save(K.do, { _wid: clock.wid }); save(K.clock, clock);
}
/* lần đầu mở ?qc: đang mở đặt · thế giới giả đời cũ (máy đã mở QC trước khi đổi dữ liệu giả) · bảng tính giả không cùng mã thế giới với
   đồng hồ (một tab ?qc đời cũ còn mở đã ghi đè): dựng lại, giữ kịch bản đang chọn */
if (!clock || !SCEN[clock.key] || !files || !files[BA_ID] || !files[OUT_ID] || clock.v !== WORLD_V || !clock.wid || files.wid !== clock.wid) {
  freshWorld(clock && SCEN[clock.key] ? clock.key : 'mo'); FROZEN = false;
}
function saveOpt() { save(K.opt, opt); }
/* tab này nhận giữ bộ nhớ chung; storage DO của thế giới khác (tab cũ ghi đè) → bỏ, máy chủ giả đọc lại từ bảng tính giả */
save(K.owner, TAB_ID);
const DO0 = load(K.do) || {}, DO_OK = DO0._wid === clock.wid;
delete DO0._wid;
/** Bộ nhớ chung còn của tab này không: tab ?qc khác mở sau (giữ bộ nhớ), dựng lại thế giới, đổi kịch bản hay thoát QC → thôi ghi, nhắc tải lại.
    Hai tab cùng ghi một bộ nhớ thì tab này ghi đè dữ liệu của tab kia (lệch lịch, mất lời mời / hội viên thử mới). */
function own() {
  if (FROZEN) return false;
  const c = load(K.clock);
  if (load(K.owner) === TAB_ID && c && c.wid === clock.wid) return true;
  FROZEN = true; staleBanner(); return false;
}
function staleBanner() {
  if (document.querySelector('.qc-stale')) return;
  const b = document.createElement('div');
  b.className = 'qc-stale'; b.setAttribute('role', 'alert');
  b.innerHTML = '<span>Chế độ QC đang mở ở một tab khác. Tải lại trang này để dùng cùng dữ liệu.</span><button type="button">Tải lại</button>';
  b.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(b);
}
window.addEventListener('storage', e => { if (!FROZEN && (e.key === null || e.key === K.owner || e.key === K.clock)) own(); });

const sheets = new FakeSheets(files, () => { if (own()) save(K.g, files); });
const storage = new FakeStorage(DO_OK ? DO0 : {}, o => { if (own()) save(K.do, Object.assign({ _wid: clock.wid }, o)); });
const core = new BookingCore({
  storage: storage, sheets: sheets, now: nowMs,
  env: { BA_ID: BA_ID, OUT_ID: OUT_ID, LT_SECRET: SECRET },
  log: o => { try { console.debug('[QC · máy chủ giả]', JSON.stringify(o)); } catch (e) { /* bỏ qua */ } }
});

/* ============================== LỆNH GỌI MÁY CHỦ (thay fetch của trang) ============================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Lỗi giống fetch thật khi mất mạng (trang đổi thành NetErr('net')) */
function netErr() { return new TypeError('Failed to fetch'); }
function abortErr() { return new DOMException('The operation was aborted.', 'AbortError'); }
const FAULTS = [
  ['lost', 'Mất phản hồi · đã ghi', 'Máy chủ ghi xong, phản hồi rơi giữa đường. Trang phải tự nhận ra, không ghi trùng.'],
  ['drop', 'Mất mạng · chưa ghi', 'Lệnh không tới máy chủ. Trang báo lỗi, gửi lại vẫn chỉ ghi một lần.'],
  ['taken', 'Người khác vừa giữ khung', 'Khung đầu tiên bạn chọn kín chỗ ngay trước khi lệnh tới (E04).'],
  ['busy', 'Máy chủ bận', 'Máy chủ trả lời đang bận. Gửi lại cùng mã yêu cầu, không ghi trùng.']
];

/**
 * "Người khác vừa giữ khung": người tập nền 1:1 đặt kín khung đầu tiên của lệnh (ghi thẳng vào sổ giả), máy chủ đọc lại sổ.
 * Đúng luật suất coach: mỗi người thêm vào là một coach CHƯA có mặt ở khung (coach của người đang đặt xếp cuối → khung đầy vì
 * phòng hết suất, không phải vì coach bận) cho tới khi đủ sức chứa.
 */
async function fillSlot(p) {
  const x = p.action === 'lt_book' ? (Array.isArray(p.picks) ? p.picks[0] : null) : p.to;
  if (!x || !C.validIso(String(x.date || ''))) return;
  const ctx = C.weekCtx(nowMs()), date = String(x.date), h = Number(x.h);
  if (ctx.days.indexOf(date) < 0) return;
  const ba = await core.getBA(), rows = (await core.getLog()).rows;
  const env = C.envOf(ctx, rows, core.trialsFor(ctx, ba), ba.closed, ba.cap, ba.sched), k = date + '|' + h, s = env.room[k];
  let n = env.taken[k] || 0;
  const t = await (await core.signer()).tokRead(p.tok, p.dev, nowMs()), mineCoach = t ? (PERSONAS.find(m => m.code === t.k) || {}).coach : '';
  const here = new Set(s ? Object.keys(s.c) : []);
  const pool = BG.filter(m => m.kind === '1:1').sort((a, b) => (a.coach === mineCoach) - (b.coach === mineCoach));
  const arrs = [];
  for (const m of pool) {
    if (n >= ba.cap) break;
    if (here.has(C.coachKey(m.coach))) continue;
    const mm = C.mine(rows, meOf(m), ctx);
    if (mm.sessions.length >= LT.MAX || mm.sessions.some(q => q.date === date)) continue;
    arrs.push(C.logRow(mm.code, mm.ver + 1, ctx.key, { date: date, h: h }, meOf(m), mm.sessions.length ? 'Thêm' : 'Đặt', '', C.stamp(nowMs()),
                       'qcf' + m.code + Date.now().toString(36)));
    here.add(C.coachKey(m.coach));
    n++;
  }
  if (!arrs.length) return;
  const meta = await core.getMeta();
  await sheets.batchUpdate(OUT_ID, [appendRows(meta.out.logId, arrs)]);
  await core.loadLog();
}
/** Một lượt gọi như Worker thật: lỗi nghiệp vụ vẫn là JSON; chỉ "mạng" mới ném lỗi. */
async function serve(p) {
  if (opt.slow) await sleep(2000);
  if (opt.offline) { await sleep(120); throw netErr(); }
  const book = p.action === 'lt_book' || p.action === 'lt_change', duo = p.action === 'lt_invite' || p.action === 'lt_decline';
  const fault = book || (duo && opt.fault !== 'taken') ? opt.fault : '';
  if (fault) {
    const f = FAULTS.find(x => x[0] === fault), pp = C.parts(nowMs());
    opt.fault = ''; opt.last = f[1] + ' · lúc ' + C.lt2(pp.hh) + ':' + C.lt2(pp.mi) + ':' + C.lt2(pp.ss); saveOpt(); refreshPanel();
  }
  if (fault === 'drop') { await sleep(300); throw netErr(); }
  if (fault === 'busy') return { ok: false, error: 'he_thong_ban', now: nowMs() };
  if (fault === 'taken') { try { await fillSlot(p); } catch (e) { console.debug('[QC] không đặt hộ được khung', e); } }
  const r = await core.handle(p);
  if (fault === 'lost') throw netErr();
  return r.out;
}
/** fetch giả cho app.js: nhận đúng init của fetch (body JSON, signal huỷ) và trả Response 200 + JSON như Worker. */
function qcFetch(url, init) {
  init = init || {};
  const sig = init.signal;
  return new Promise((resolve, reject) => {
    if (sig && sig.aborted) { reject(abortErr()); return; }
    let p = {};
    try { p = JSON.parse(String(init.body || '{}')); } catch (e) { p = {}; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
    const onAbort = () => reject(abortErr());               /* trang bỏ đợi; "máy chủ" vẫn xử lý tiếp như thật */
    if (sig) sig.addEventListener('abort', onAbort, { once: true });
    serve(p).then(out => {
      if (sig) sig.removeEventListener('abort', onAbort);
      resolve(new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }));
    }, e => {
      if (sig) sig.removeEventListener('abort', onAbort);
      reject(e);
    });
  });
}

/* ============================== ĐIỀU KHIỂN ============================== */
/** Đăng xuất trang (xoá mã nhớ máy, lịch đã lưu, lệnh chờ của chế độ QC) — giữ mã máy. */
function signOutPage() { wipe(['qc:'], k => k === 'qc:lt_dev'); }
const reload = () => location.reload();
const ACT = {
  scn: b => { freshWorld(b.dataset.k); signOutPage(); reload(); },
  tua: b => { FROZEN = true; clock.base += Number(b.dataset.ms); save(K.clock, clock); reload(); },
  fault: b => { opt.fault = opt.fault === b.dataset.k ? '' : b.dataset.k; saveOpt(); refreshPanel(); },
  offline: () => { opt.offline = !opt.offline; saveOpt(); reload(); },
  slow: () => { opt.slow = !opt.slow; saveOpt(); refreshPanel(); },
  nghi: () => {
    opt.nghi = !opt.nghi; saveOpt();
    const b0b = files[BA_ID].find(t => t.title === 'B0B').rows, i = b0b.findIndex(r => r && r[2] === NGHI[2]);
    if (opt.nghi && i < 0) b0b.push(NGHI.slice()); else if (!opt.nghi && i >= 0) b0b.splice(i, 1);
    save(K.g, files);
    const d = load(K.do) || {};
    delete d['snap:ba'];                                       /* máy chủ đọc lại BA (tab B0B) ngay khi trang mở lại */
    d._wid = clock.wid;
    FROZEN = true; save(K.do, d); reload();
  },
  reset: () => { freshWorld(clock.key); signOutPage(); reload(); },
  exit: () => { FROZEN = true; wipe(['qc:', 'qcsrv:']); location.replace(location.pathname); },
  close: () => closePanel(true)
};

/* ============================== BẢNG QC ============================== */
const IC_X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20"/></svg>';
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function sec(id, title, body) { return '<section class="qc-sec" aria-labelledby="' + id + '"><h3 class="qc-k" id="' + id + '">' + esc(title) + '</h3>' + body + '</section>'; }
function pressed(on) { return ' aria-pressed="' + (on ? 'true' : 'false') + '"'; }
const PHASE = { before: 'chưa mở đặt', open: 'đang mở đặt', late: 'đặt muộn · đổi lịch' };

function panelHTML() {
  const scn = ORDER.map(k => '<button class="qc-sc" type="button" data-qc="scn" data-k="' + k + '"' + pressed(clock.key === k) + '>' +
    '<span class="qc-a">' + esc(SCEN[k].t) + '</span><span class="qc-z">' + esc(SCEN[k].s) + '</span></button>').join('');
  const ppl = PERSONAS.map(m => '<li><span class="qc-nm">' + esc(m.name) + '</span><span class="qc-cd">' + (m.phone ? m.phone.slice(-4) : '—') + '</span>' +
    '<span class="qc-ds">' + esc(m.test) + '</span></li>').join('');
  const flt = FAULTS.map(f => '<button class="qc-sc" type="button" data-qc="fault" data-k="' + f[0] + '"' + pressed(false) + '>' +
    '<span class="qc-a">' + esc(f[1]) + '</span><span class="qc-z">' + esc(f[2]) + '</span></button>').join('');
  return '<div class="qc-h"><h2 class="qc-t" id="qcT" tabindex="-1">Chế độ QC</h2>' +
      '<button class="qc-x" type="button" data-qc="close" aria-label="Đóng bảng QC">' + IC_X + '</button></div>' +
    '<p class="qc-s">Dữ liệu giả. Máy chủ giả chạy ngay trên máy này bằng đúng mã của máy chủ thật — không đọc, không ghi lịch thật.</p>' +
    sec('qcK1', 'Đồng hồ giả', '<p class="qc-now"><span class="qc-tm" id="qcNow"></span><span class="qc-ph" id="qcPh"></span></p><div class="qc-list">' + scn + '</div>' +
      '<div class="qc-row"><button class="qc-b" type="button" data-qc="tua" data-ms="' + HR + '">Tua +1 giờ</button>' +
      '<button class="qc-b" type="button" data-qc="tua" data-ms="' + DAY + '">Tua +1 ngày</button></div>' +
      '<p class="qc-note">Chọn kịch bản: dữ liệu làm lại từ đầu và trang đăng xuất. Tua giờ: giữ nguyên dữ liệu và phiên.</p>') +
    sec('qcK2', 'Hội viên thử · mã là 4 số cuối điện thoại', '<ul class="qc-ppl">' + ppl + '</ul>' +
      '<p class="qc-note">Gõ tên đệm và tên vào ô tìm như hội viên thật. Hai người đặt sẵn chỉ có phiếu từ kịch bản 07:00 trở đi.</p>') +
    sec('qcK3', 'Gây lỗi · lượt đặt hoặc đổi kế tiếp', '<div class="qc-list">' + flt + '</div><p class="qc-note" id="qcLast"></p>' +
      '<div class="qc-row qc-wrap"><button class="qc-b" type="button" data-qc="offline"' + pressed(opt.offline) + '>Mất mạng hoàn toàn</button>' +
      '<button class="qc-b" type="button" data-qc="slow"' + pressed(opt.slow) + '>Mạng chậm +2 giây</button>' +
      '<button class="qc-b" type="button" data-qc="nghi"' + pressed(opt.nghi) + '>T7 24.10 phòng nghỉ</button></div>' +
      '<p class="qc-note">Mất mạng hoàn toàn và phòng nghỉ: trang tải lại để áp dụng.</p>') +
    sec('qcK4', 'Sổ đặt lịch giả', '<p class="qc-meta" id="qcMeta"></p><div class="qc-tbl" id="qcTbl" tabindex="0" aria-label="Sổ đặt lịch giả"></div>') +
    '<div class="qc-end"><button class="qc-b" type="button" data-qc="reset">Làm lại từ đầu</button>' +
      '<button class="qc-b" type="button" data-qc="exit">Thoát QC</button></div>';
}
let TAB = null, PANEL = null, SYNC = 0, SEEN = '';
/** Dòng của tuần đang đặt trong sổ giả, mới nhất trước. */
function soRows(key) {
  const rows = files[OUT_ID].find(t => t.title === LT.LOG).rows, out = [];
  for (let i = LT.LOG_HEAD_ROW; i < rows.length; i++) { const r = rows[i] || []; if (!empty(r[1]) && String(r[3]) === key) out.push(r); }
  return out.reverse();
}
function tableHTML(rows) {
  if (!rows.length) return '<p class="qc-note">Chưa có dòng nào cho tuần này.</p>';
  const head = ['Mã phiếu', 'Bản', 'Ngày', 'Giờ', 'Hội viên', 'Coach', 'Trạng thái', 'Thao tác', 'Ghi chú'];
  return '<table><thead><tr>' + head.map(x => '<th scope="col">' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr' + (r[11] === LT.MOVED ? ' class="qc-mv"' : '') + '><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[5] + ' ' + C.ddMm(r[4])) +
      '</td><td>' + esc(r[6]) + '</td><td>' + esc(r[7]) + '</td><td>' + esc(r[9]) + '</td><td>' + esc(r[11]) + '</td><td>' + esc(r[12]) + '</td><td>' + esc(r[13]) + '</td></tr>').join('') +
    '</tbody></table>';
}
/** Cập nhật phần sống của bảng: đồng hồ, trạng thái nút, sổ (chỉ vẽ lại khi sổ hoặc hàng chờ đổi). */
function refreshPanel() {
  if (!PANEL || PANEL.hidden) return;
  const t = nowMs(), p = C.parts(t), ctx = C.weekCtx(t);
  PANEL.querySelector('#qcNow').textContent = LT.DOW[p.dow] + ' ' + C.lt2(p.d) + '.' + C.lt2(p.m) + ' · ' + C.lt2(p.hh) + ':' + C.lt2(p.mi) + ':' + C.lt2(p.ss);
  PANEL.querySelector('#qcPh').textContent = 'Tuần ' + ctx.no + ' · ' + PHASE[ctx.phase];
  PANEL.querySelectorAll('[data-qc="fault"]').forEach(b => b.setAttribute('aria-pressed', String(opt.fault === b.dataset.k)));
  PANEL.querySelector('[data-qc="slow"]').setAttribute('aria-pressed', String(opt.slow));
  PANEL.querySelector('#qcLast').textContent = opt.last ? 'Vừa áp dụng: ' + opt.last + '.' : '';
  const hl = core.health(), key = ctx.key + '|' + sheets.rev + '|' + hl.pending + '|' + hl.lastError;
  if (key === SEEN) return;
  SEEN = key;
  const rows = soRows(ctx.key);
  PANEL.querySelector('#qcMeta').textContent = 'Tuần ' + ctx.no + ' · ' + rows.length + ' dòng · chờ ghi lên sổ: ' + hl.pending + (hl.lastError ? ' · lỗi ghi: ' + hl.lastError : '');
  PANEL.querySelector('#qcTbl').innerHTML = tableHTML(rows);
}
function openPanel() {
  PANEL.hidden = false; TAB.setAttribute('aria-expanded', 'true');
  SEEN = ''; refreshPanel();
  clearInterval(SYNC); SYNC = setInterval(refreshPanel, 1000);
  PANEL.querySelector('#qcT').focus();
}
function closePanel(focusTab) {
  PANEL.hidden = true; TAB.setAttribute('aria-expanded', 'false');
  clearInterval(SYNC);
  if (focusTab) TAB.focus();
}
function mountPanel() {
  TAB = document.createElement('button');
  TAB.type = 'button'; TAB.className = 'qc-tab'; TAB.textContent = 'QC · Dữ liệu giả';
  TAB.setAttribute('aria-controls', 'qcp'); TAB.setAttribute('aria-expanded', 'false');
  TAB.addEventListener('click', () => { if (PANEL.hidden) openPanel(); else closePanel(false); });
  PANEL = document.createElement('section');
  PANEL.className = 'qc-p'; PANEL.id = 'qcp'; PANEL.hidden = true;
  PANEL.setAttribute('role', 'dialog'); PANEL.setAttribute('aria-labelledby', 'qcT');
  PANEL.innerHTML = panelHTML();
  PANEL.addEventListener('click', e => {
    const b = e.target.closest('[data-qc]');
    if (b && PANEL.contains(b)) ACT[b.dataset.qc](b);
  });
  /* phím trong bảng QC không chạm tới phím tắt của trang (Esc đóng ngăn kéo, Tab xoay vòng trong cửa sổ, mũi tên đi bảng giờ) */
  PANEL.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closePanel(true); }
  });
  document.body.appendChild(TAB);
  document.body.appendChild(PANEL);
}

/** qc.css (app.js chèn trước qc.js) đã nạp xong — dựng nút QC sau đó để không lộ nút chưa có kiểu (chờ tối đa 3 giây). */
function cssReady() {
  const l = document.querySelector('link[rel="stylesheet"][href^="qc.css"]');
  if (!l || l.sheet) return Promise.resolve();
  return Promise.race([sleep(3000), new Promise(r => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); })]);
}

/* ============================== XUẤT CHO app.js ============================== */
window.QCB = {
  fetch: qcFetch,
  /** sẵn sàng: máy chủ giả đã nạp storage + nhật ký → app.js đặt đồng hồ trang (skew) rồi mới khởi động */
  ready: Promise.all([core.init(), cssReady()]).then(() => {
    setInterval(() => { core.tick().catch(() => {}); }, 60e3);    /* như cron mỗi phút của Worker */
    mountPanel();
    return { skew: nowMs() - Date.now() };
  })
};
