/**
 * B0DY — Lịch tập tuần · LÕI NGHIỆP VỤ (hàm thuần, không I/O)
 *
 * Bản chép 1:1 phần lõi của backend/LichTuan.gs (Apps Script) sang module ES cho Worker.
 * Mọi luật (tuần, 24 giờ, 2–4 buổi, 1 buổi/ngày, đổi 2 lần, sức chứa, tên, mã nhớ máy…) phải GIỐNG HỆT
 * bản Apps Script: hai máy chủ dùng chung sổ "Sổ đặt lịch" và cùng một hợp đồng API.
 * Sửa luật ở đây thì sửa luôn LichTuan.gs (và ngược lại) — test/parity.mjs bắt mọi chỗ lệch.
 *
 * Khác biệt duy nhất so với Apps Script nằm ở cách ĐỌC Ô: Sheets API trả ngày là số serial
 * (UNFORMATTED_VALUE + SERIAL_NUMBER) thay vì đối tượng Date; giờ là phần lẻ của ngày.
 */

/* Ký tự đặc biệt dựng bằng mã số để bản nguồn không chứa escape \u (công cụ ghi file hay giải mã nhầm). */
const MARKS_RE = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const DD_RE = new RegExp('[' + String.fromCharCode(0x111) + String.fromCharCode(0x110) + ']', 'g');
export const GEAR = String.fromCharCode(0x2699);

export const LT = {
  OFF: 7 * 3600e3,                                   // giờ Việt Nam, không có giờ mùa hè
  SLOTS: [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20], // 12:00–14:00 coach nghỉ trưa
  NDAYS: 6,                                          // T2..T7 · Chủ Nhật phòng nghỉ
  OPEN_H: 6,                                         // lịch tuần sau mở lúc 06:00 Chủ Nhật
  LEAD: 24 * 3600e3,                                 // đặt muộn và đổi lịch: khung cách hiện tại ≥ 24 giờ
  MIN: 2, MAX: 4, CHANGES: 2,
  CAP: 4,                                            // dự phòng khi ⚙️ 2 không có "Sức chứa tối đa / khung"
  REMEMBER: 60 * 864e5, SESSION: 12 * 3600e3,        // nhớ máy 60 ngày · không nhớ thì 12 giờ
  FAILS: 5, LOCK_S: 15 * 60, MEMBER_FAILS: 20,       // sai 5 lần → khoá máy 15 phút · sai 20 lần/giờ trên một tên → khoá tên
  FIND_MAX: 300,                                     // lượt tìm tên / máy / khung 10 phút cố định (trang tìm theo từng chữ gõ: ~8 lượt / người)
  FIND_TOP: 6,                                       // tối đa 6 người mỗi lượt tìm; nhiều hơn → more: true
  LOG: 'Sổ đặt lịch', DATA: '_dữ liệu',
  ON: 'Đã đặt', MOVED: 'Đã đổi',
  /* Ghép lớp 1:2 (chủ studio chốt 18/10 14:13): gói 1:2 chỉ đặt ở các khung ghép cố định; người đặt trước mời được một bạn 1:2
     cùng coach (dòng sổ "Mời"), bạn kia nhận (đặt / thêm / dời vào) hoặc từ chối (dòng "Từ chối"); dời một buổi ĐANG LẺ vào cặp
     đang chờ = "Ghép" — không tính lượt đổi, được dời trong cùng ngày */
  DUO_HOURS: [9, 11, 15, 17, 19],
  INVITE: 'Mời', DECLINE: 'Từ chối', PAIR: 'Ghép',
  INVITE_MAX: 20,                                    // dòng mời + từ chối / hội viên / tuần (chặn bấm liên tục)
  LOG_HEAD: ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại',
             'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'],
  LOG_COL: 2, LOG_HEAD_ROW: 4,
  DOW: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
};

/* ================================================================== */
/* Thời gian — mọi phép tính theo giờ Việt Nam (UTC+7)                 */
/* ================================================================== */

export function lt2(n) { return (n < 10 ? '0' : '') + n; }
export function parts(ms) {
  const d = new Date(ms + LT.OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(),
           mi: d.getUTCMinutes(), ss: d.getUTCSeconds(), dow: d.getUTCDay() };
}
export function isoP(p) { return p.y + '-' + lt2(p.m) + '-' + lt2(p.d); }
export function isoOf(ms) { return isoP(parts(ms)); }
export function dayMs(iso) { const a = String(iso).split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]) - LT.OFF; }
export function addDays(iso, n) { return isoOf(dayMs(iso) + n * 864e5); }
export function slotMs(iso, h) { return dayMs(iso) + h * 3600e3; }
export function dowOf(iso) { return parts(dayMs(iso)).dow; }
export function validIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && isoOf(dayMs(s)) === s; }
export function stamp(ms) { const p = parts(ms); return isoP(p) + ' ' + lt2(p.hh) + ':' + lt2(p.mi) + ':' + lt2(p.ss); }
export function ddMm(iso) { const a = String(iso).split('-'); return a[2] + '.' + a[1]; }
export function hm(h) { return lt2(h) + ':00'; }

/** Tuần ISO-8601: tuần chứa Thứ Năm quyết định năm. 19.10.2026 → {year: 2026, week: 43} */
export function isoWeek(iso) {
  const a = String(iso).split('-'), t = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - y0) / 864e5 + 1) / 7) };
}
export function weekKey(monIso) { const w = isoWeek(monIso); return w.year + '-W' + lt2(w.week); }

/**
 * Tuần đang nhận đặt:
 *  · Chủ Nhật từ 06:00 → tuần sau (phase 'open', không cần báo trước).
 *  · T2–T7 → tuần này (phase 'late', khung phải cách hiện tại ≥ 24 giờ).
 *  · Chủ Nhật trước 06:00 → tuần vừa qua (phase 'before', hiện đếm ngược tới 06:00).
 */
export function weekCtx(now) {
  const p = parts(now), today = isoP(p);
  let mon, phase;
  if (p.dow === 0) {
    if (p.hh >= LT.OPEN_H) { mon = addDays(today, 1); phase = 'open'; } else { mon = addDays(today, -6); phase = 'before'; }
  } else { mon = addDays(today, 1 - p.dow); phase = 'late'; }
  const days = [];
  for (let i = 0; i < LT.NDAYS; i++) days.push(addDays(mon, i));
  const sun = p.dow === 0 ? today : addDays(today, 7 - p.dow);
  let next = slotMs(sun, LT.OPEN_H);
  if (next <= now) next = slotMs(addDays(sun, 7), LT.OPEN_H);
  const nextMon = isoOf(next + 864e5), w = isoWeek(mon);
  return { now: now, today: today, mon: mon, days: days, key: weekKey(mon), no: w.week, phase: phase,
           lead: now >= dayMs(mon) ? LT.LEAD : 0, nextOpen: next, nextKey: weekKey(nextMon), nextNo: isoWeek(nextMon).week };
}

/* ================================================================== */
/* Chuẩn hoá chữ và tên                                                */
/* ================================================================== */

/** bỏ dấu, đ → d, chữ thường (đúng dải U+0300–U+036F như Apps Script) */
export function fold(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(MARKS_RE, '').replace(DD_RE, 'd').toLowerCase();
}
export function hdr(s) { return fold(s).replace(/\s+/g, ' ').trim(); }
export function nameKey(s) { return fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
export function words(s) { return String(s == null ? '' : s).trim().split(/\s+/).filter(x => !!x); }
/** "Hoàng Đức Nam" → "H. Đức Nam" (họ viết tắt — tên hiện công khai) */
export function short(name) { const w = words(name); return w.length < 2 ? w.join(' ') : w[0].charAt(0).toUpperCase() + '. ' + w.slice(1).join(' '); }
/** Tên để chào: bỏ họ ("Đức Nam", "Gia Bảo Linh"); tên đệm Thị/Văn đứng đầu thì bỏ luôn ("Hưng", "Hà", "Mỹ Ngọc"). */
export function callName(name) {
  const w = words(name);
  if (w.length < 2) return w.join(' ');
  let rest = w.slice(1);
  while (rest.length > 1 && /^(thi|van)$/.test(nameKey(rest[0]))) rest = rest.slice(1);
  return rest.join(' ');
}
export function coachName(c) { return String(c == null ? '' : c).replace(/\s*\(.*\)\s*$/, '').trim(); }
/** Khoá so sánh coach (bỏ hậu tố, bỏ dấu, chữ thường): dòng sổ sửa tay lệch dấu / hoa thường vẫn là cùng coach. */
export function coachKey(c) { return nameKey(coachName(c)); }
/** Gói 1:2 (một coach kèm hai khách). */
export function isDuo(kind) { return /^1\s*:\s*2$/.test(String(kind == null ? '' : kind).trim()); }
export function initials(c) { return words(coachName(c)).map(x => x.charAt(0).toUpperCase()).join(''); }
export function pkgLabel(pkg, total) { const m = String(pkg == null ? '' : pkg).match(/\d+/), n = m ? +m[0] : (+total || 0); return n > 0 ? n + 'B' : ''; }
export function digits(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }

/** Luật cũ (bậc 0 của findRank): ≥ 2 chữ khớp liền phần CUỐI của họ tên (bỏ dấu), chữ cuối được gõ dở. */
export function match(q, nameTokens) {
  const L = q.length;
  if (L < 2 || L > nameTokens.length) return false;
  const off = nameTokens.length - L;
  for (let i = 0; i < L; i++) {
    const a = q[i], b = nameTokens[off + i];
    if (i < L - 1 ? a !== b : b.indexOf(a) !== 0) return false;
  }
  return true;
}

/**
 * Cách khớp tốt nhất của các chữ gõ q (đúng thứ tự, được bỏ qua chữ ở giữa) vào ĐẦU các chữ khác nhau của V.
 * Không khớp → null. Khớp → {last, eq, at}: last = 1 nếu chữ gõ cuối rơi được vào chữ cuối của V (tên gọi),
 * eq = số chữ gõ trùng trọn một chữ (nhiều nhất, sau khi đã ưu tiên last), at = vị trí trong V của từng chữ gõ.
 * Quy hoạch động f[i][j] = số chữ trùng trọn nhiều nhất khi khớp i chữ gõ đầu vào j chữ đầu của V (−1: không khớp được).
 * Trang (app.js · prefixFit) chép đúng hàm này để tô phần khớp.
 */
export function prefixFit(q, V) {
  const n = q.length, m = V.length, f = [];
  if (!n || n > m) return null;
  for (let i = 0; i <= n; i++) { f.push([]); for (let j = 0; j <= m; j++) f[i].push(i ? -1 : 0); }
  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      let b = f[i][j - 1];
      if (f[i - 1][j - 1] >= 0 && V[j - 1].indexOf(q[i - 1]) === 0) b = Math.max(b, f[i - 1][j - 1] + (V[j - 1] === q[i - 1] ? 1 : 0));
      f[i][j] = b;
    }
  }
  const last = V[m - 1].indexOf(q[n - 1]) === 0 && f[n - 1][m - 1] >= 0 ? 1 : 0;
  let i = last ? n - 1 : n, j = last ? m - 1 : m;
  if (f[i][j] < 0) return null;
  const at = [], eq = f[i][j] + (last && V[m - 1] === q[n - 1] ? 1 : 0);
  if (last) at[n - 1] = m - 1;
  while (i > 0) { if (f[i][j - 1] === f[i][j]) j--; else { at[i - 1] = j - 1; i--; j--; } }
  return { last: last, eq: eq, at: at };
}

/**
 * Tìm tên — gõ tới đâu ra tới đó. q = các chữ đã gõ (nameKey rồi tách), toks = các chữ của họ tên (nameKey).
 * Chỉ so với phần tên hiện công khai V = tên đệm + tên (họ chỉ hiện chữ cái đầu "H.", nên gõ riêng họ không ra ai):
 *  · bậc 0 — luật cũ match(): ≥ 2 chữ khớp liền phần CUỐI của họ tên (kể cả họ), chữ cuối được gõ dở;
 *  · bậc 1 — mỗi chữ gõ là ĐẦU của một chữ khác nhau trong V, đúng thứ tự, được bỏ qua chữ ở giữa (1 ký tự là đủ);
 *  · bậc 2 — đúng một chữ, từ 2 ký tự, nằm GIỮA một chữ của V ("hoi" → Khôi).
 * Không khớp → null. Khớp → {tier, last, eq} để xếp hạng (findAll): last = 1 nếu chữ gõ cuối rơi vào chữ cuối của V
 * (tên gọi), eq = số chữ gõ trùng trọn một chữ.
 */
export function findRank(q, toks) {
  const n = q.length;
  if (!n) return null;
  if (match(q, toks)) return { tier: 0, last: 1, eq: n - 1 + (toks[toks.length - 1] === q[n - 1] ? 1 : 0) };
  const V = toks.length >= 2 ? toks.slice(1) : toks, f = prefixFit(q, V);
  if (f) return { tier: 1, last: f.last, eq: f.eq };
  if (n === 1 && q[0].length >= 2 && V.some(v => v.indexOf(q[0], 1) > 0)) {
    return { tier: 2, last: V[V.length - 1].indexOf(q[0], 1) > 0 ? 1 : 0, eq: 0 };
  }
  return null;
}
/**
 * Mọi hội viên khớp, đã xếp hạng: bậc nhỏ trước → chữ gõ cuối rơi vào tên gọi trước → nhiều chữ trùng trọn trước →
 * tên ngắn (localeCompare 'vi', như trước đây) → Mã KH. Thứ tự toàn phần, giống hệt ltFindAll_ của Apps Script.
 */
export function findAll(q, list) {
  const hits = [];
  list.forEach(x => { const r = findRank(q, x.toks); if (r) hits.push({ x: x, r: r }); });
  hits.sort((a, b) => (a.r.tier - b.r.tier) || (b.r.last - a.r.last) || (b.r.eq - a.r.eq) ||
    a.x.short.localeCompare(b.x.short, 'vi') || (a.x.key < b.x.key ? -1 : a.x.key > b.x.key ? 1 : 0));
  return hits.map(h => h.x);
}

/* ================================================================== */
/* Đọc ô từ Sheets API (UNFORMATTED_VALUE + SERIAL_NUMBER)             */
/* ================================================================== */

/** Số serial của Sheets (ngày 0 = 30/12/1899) có nằm trong khoảng ngày hợp lý không (1954–2119). */
export function isSerial(v) { return typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000; }
/** Serial → "yyyy-MM-dd" theo lịch của file (serial không mang múi giờ nên không bị lệch ngày). */
export function serialIso(n) {
  const d = new Date(Math.round((Math.floor(n) - 25569) * 864e5));
  return d.getUTCFullYear() + '-' + lt2(d.getUTCMonth() + 1) + '-' + lt2(d.getUTCDate());
}
/** Ô ngày → "yyyy-MM-dd". Serial: ngày như đang hiện trên sheet. Chữ: dd/mm/yy kiểu Việt (vn=true)
    hoặc M/d/yyyy kiểu Mỹ (vn=false, SESSION LOG); số đầu > 12 thì tự đảo. */
export function cellIso(v, vn) {
  if (v === '' || v == null) return '';
  if (isSerial(v)) return serialIso(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validIso(m[0]) ? m[0] : '';
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!m) return '';
  const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  let d = vn ? a : b, mo = vn ? b : a;
  if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
  const iso = y + '-' + lt2(mo) + '-' + lt2(d);
  return validIso(iso) ? iso : '';
}
/** Ô là giá trị giờ / ngày-giờ (Apps Script thấy là Date): phần lẻ trong ngày (0 ≤ v < 1) hoặc serial ngày-giờ. */
function isTimeCell(v) { return typeof v === 'number' && isFinite(v) && ((v >= 0 && v < 1) || isSerial(v)); }
/** Phần giờ của serial → "HH:mm" (như Utilities.formatDate(…, 'HH:mm') với Date của ô). */
function serialHm(v) {
  const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
  return lt2(Math.floor(mins / 60)) + ':' + lt2(mins % 60);
}
/** Ô giờ → số giờ (8) nếu là giờ chẵn; "08:00" | "8h00" | phần lẻ của ngày (0,333… = 08:00) */
export function cellHour(v) {
  if (v === '' || v == null) return -1;
  const s = isTimeCell(v) ? serialHm(v) : String(v).trim();
  const m = s.match(/^(\d{1,2})[:hH](\d{2})/);
  return m && +m[2] === 0 ? +m[1] : -1;
}
/** Ô của sổ (cột Giờ): chữ "18:00" như Apps Script ghi; nếu ai gõ tay thành giá trị giờ thì đổi lại "HH:mm". */
export function cellHm(v) {
  return isTimeCell(v) ? serialHm(v) : String(v == null ? '' : v).trim();
}
function cell(row, c) { if (!row || c < 0) return ''; const v = row[c]; return v == null ? '' : v; }

/* ================================================================== */
/* Đọc file BA (đầu vào là mảng hàng như Sheets API trả về, hàng có thể ngắn) */
/* ================================================================== */

export function headRow(vals, need) {
  for (let r = 0; r < vals.length; r++) {
    const h = (vals[r] || []).map(hdr);
    let ok = true;
    for (let i = 0; i < need.length; i++) if (h.indexOf(need[i]) < 0) { ok = false; break; }
    if (ok) return { r: r, h: h };
  }
  return null;
}

/** MEMBERS (cả tab, từ A1) → mọi dòng có tên. Dò cột theo TIÊU ĐỀ trong 12 hàng đầu. */
export function memberRows(vals) {
  const hd = headRow(vals.slice(0, 12), ['ten', 'coach', 'con lai']);
  if (!hd) throw new Error('khong_thay_cot_MEMBERS');
  const H = hd.h;
  function col() { for (let i = 0; i < arguments.length; i++) { const k = H.indexOf(arguments[i]); if (k >= 0) return k; } return -1; }
  const c = { name: col('ten'), pkg: col('goi'), total: col('so buoi'), kind: col('loai'), coach: col('coach'),
              phone: col('sdt', 'so dien thoai', 'dien thoai'), left: col('con lai'), start: col('ngay bat dau'),
              exp: col('ngay het han'), code: col('ma kh') };
  const out = [];
  for (let r = hd.r + 1; r < vals.length; r++) {
    const x = vals[r] || [], g = k => cell(x, c[k]);
    const name = String(g('name') || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    out.push({ name: name, pkg: String(g('pkg') || '').trim(), total: +g('total') || 0,
               kind: String(g('kind') || '').trim(), coach: coachName(g('coach')), phone: digits(g('phone')),
               left: Number(g('left')) || 0, start: cellIso(g('start'), true),
               exp: cellIso(g('exp'), true), code: String(g('code') || '').trim() });
  }
  return out;
}

/**
 * Gộp các dòng còn hiệu lực thành hội viên (giống ltPersons_): khoá = Mã KH; số buổi còn = tổng;
 * hết hạn = xa nhất; bắt đầu = sớm nhất; gói/loại/coach theo dòng bắt đầu muộn nhất nhưng ≤ hôm nay.
 */
export function persons(rows, today) {
  const byKey = {}, order = [], phoneOf = {};
  rows.forEach(r => {
    const k = r.code || ('#' + nameKey(r.name));
    if (r.phone && !phoneOf[k]) phoneOf[k] = r.phone;
    if (!(r.left > 0) || (r.exp && r.exp < today)) return;
    if (!byKey[k]) { byKey[k] = []; order.push(k); }
    byKey[k].push(r);
  });
  return order.map(k => {
    const g = byKey[k];
    let pick = null, left = 0, exp = '', noExp = false, start = '';
    g.forEach(r => {
      left += r.left;
      if (!r.exp) noExp = true; else if (r.exp > exp) exp = r.exp;
      if (r.start && (!start || r.start < start)) start = r.start;
      const ok = !r.start || r.start <= today;
      if (!pick) pick = r;
      else {
        const pOk = !pick.start || pick.start <= today;
        if (ok && (!pOk || (r.start || '') >= (pick.start || ''))) pick = r;
        else if (!ok && !pOk && (r.start || '') < (pick.start || '')) pick = r;
      }
    });
    return { key: k, name: pick.name, toks: nameKey(pick.name).split(' '), short: short(pick.name), call: callName(pick.name),
             coach: pick.coach, kind: pick.kind || '1:1', pkg: pkgLabel(pick.pkg, pick.total), left: left,
             exp: noExp ? '' : exp, start: start, phone: phoneOf[k] || '', code: pick.code || '' };
  });
}

/** SESSION LOG: vị trí 3 cột cần đọc (ngày, học viên, trạng thái) từ 10 hàng đầu. */
export function marksLayout(top) {
  const lastC = Math.min(26, top.reduce((m, r) => Math.max(m, (r || []).length), 0));
  const hd = headRow(top.map(r => (r || []).slice(0, lastC)), ['ngay', 'hoc vien', 'trang thai']);
  if (!hd) return null;
  return { first: hd.r + 2, cD: hd.h.indexOf('ngay'), cN: hd.h.indexOf('hoc vien'), cS: hd.h.indexOf('trang thai') };
}
/** SESSION LOG → điểm danh của tuần: {"Họ tên|yyyy-MM-dd": "done" | "absent"}. cols = [ngày[], tên[], trạng thái[]] */
export function marksFrom(cols, days) {
  const out = {}, inWeek = {};
  days.forEach(d => { inWeek[d] = 1; });
  const D = cols[0] || [], N = cols[1] || [], S = cols[2] || [];
  const n = Math.max(D.length, N.length, S.length);
  for (let i = 0; i < n; i++) {
    const iso = cellIso(D[i] == null ? '' : D[i], false);
    if (!inWeek[iso]) continue;
    const name = String(N[i] || '').replace(/\s+/g, ' ').trim(), st = nameKey(S[i] == null ? '' : S[i]);
    if (!name) continue;
    const k = name + '|' + iso;
    if (st === 'da tap') out[k] = 'done';
    else if (st === 'vang' && out[k] !== 'done') out[k] = 'absent';
  }
  return out;
}

/** TRIAL (cả tab, tối đa 30 cột) → số khách tập thử chiếm chỗ mỗi khung trong tuần (dòng Huỷ / Loại không tính). */
export function trialsFrom(vals, days) {
  const out = {};
  const v = vals.map(r => (r || []).slice(0, 30));
  if (v.length < 2) return out;
  const hd = headRow(v.slice(0, 10), ['trang thai']);
  if (!hd) return out;
  let cD = -1, cT = -1;
  hd.h.forEach((x, i) => {
    if (cD < 0 && x.indexOf('ngay hen') >= 0) cD = i;
    if (cT < 0 && x.indexOf('gio hen') >= 0) cT = i;
  });
  const cS = hd.h.indexOf('trang thai');
  if (cD < 0 || cT < 0) return out;
  const inWeek = {};
  days.forEach(d => { inWeek[d] = 1; });
  for (let i = hd.r + 1; i < v.length; i++) {
    const row = v[i];
    const iso = cellIso(cell(row, cD), true);
    if (!inWeek[iso]) continue;
    if (/huy|\bloai\b/.test(nameKey(cell(row, cS)))) continue;
    const h = cellHour(cell(row, cT));
    if (LT.SLOTS.indexOf(h) < 0) continue;
    out[iso + '|' + h] = (out[iso + '|' + h] || 0) + 1;
  }
  return out;
}

/** B0B ▸ khối "LÝ DO ĐÓNG CỬA | NGÀY" (150 hàng × 30 cột đầu) → {yyyy-MM-dd: lý do}. */
export function closuresFrom(vals) {
  const out = {};
  const v = vals.slice(0, 150).map(r => (r || []).slice(0, 30));
  for (let r = 0; r < v.length; r++) {
    const h = v[r].map(hdr);
    let q = -1;
    for (let c = 0; c < h.length; c++) if (h[c].indexOf('ly do dong') === 0) { q = c; break; }
    if (q < 0) continue;
    let dc = -1;
    for (let c2 = q + 1; c2 < h.length; c2++) if (h[c2] === 'ngay') { dc = c2; break; }
    if (dc < 0) dc = q + 1;
    for (let r2 = r + 1; r2 < v.length; r2++) {
      const iso = cellIso(cell(v[r2], dc), true);
      if (iso) out[iso] = String(cell(v[r2], q) || '').trim();
    }
    break;
  }
  return out;
}

/** Tên tab cấu hình: có bánh răng ⚙ và kết thúc bằng "2" (bỏ khoảng trắng) — giống ltCap_. */
export function isCfgTab(title) { const n = String(title).replace(/\s+/g, ''); return n.indexOf(GEAR) >= 0 && /2$/.test(n); }
/** ⚙️ 2 ▸ "Sức chứa tối đa / khung" (60 hàng × 8 cột đầu) */
export function capFrom(vals) {
  if (!vals) return LT.CAP;
  const v = vals.slice(0, 60).map(r => (r || []).slice(0, 8));
  for (let r = 0; r < v.length; r++) {
    for (let c = 0; c < v[r].length; c++) {
      if (hdr(v[r][c]).indexOf('suc chua') !== 0) continue;
      for (let c2 = c + 1; c2 < v[r].length; c2++) {
        const x = cell(v[r], c2), n = Number(x);
        if (x !== '' && n > 0 && n < 50) return Math.floor(n);
      }
    }
  }
  return LT.CAP;
}

/* ================================================================== */
/* Sổ đặt lịch                                                          */
/* ================================================================== */

/** Hàng tiêu đề (B4:R4) phải đúng 17 cột LOG_HEAD (so sau khi chuẩn hoá NFC). */
export function logHeadOk(head) {
  for (let i = 0; i < LT.LOG_HEAD.length; i++) if (String(cell(head, i)).trim().normalize('NFC') !== LT.LOG_HEAD[i].normalize('NFC')) return false;
  return true;
}
/** vals = các hàng từ B5 trở xuống (17 cột B..R). first = số hàng của vals[0] trên sheet. */
export function logRows(vals, first) {
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const x = vals[i] || [], code = String(cell(x, 0)).trim();
    if (!code) continue;
    const h = cellHm(cell(x, 5));
    out.push({ row: first + i, code: code, ver: Number(cell(x, 1)) || 1, week: String(cell(x, 2)).trim(), date: cellIso(cell(x, 3), true),
               h: /^\d{1,2}:00$/.test(h) ? parseInt(h, 10) : -1, name: String(cell(x, 6)).trim(), coach: coachName(cell(x, 8)),
               kind: String(cell(x, 9)).trim(), st: String(cell(x, 10)).trim().normalize('NFC'),
               act: String(cell(x, 11)).trim().normalize('NFC'), note: String(cell(x, 12)).trim().normalize('NFC'),
               rid: String(cell(x, 14)).trim(), kh: String(cell(x, 15)).trim() });
  }
  return out;
}
/** Một dòng sổ mới — đúng thứ tự 17 cột như ltLogRow_. */
export function logRow(code, ver, week, x, me, act, note, stampStr, rid) {
  return [code, ver, week, x.date, LT.DOW[dowOf(x.date)], hm(x.h), me.name, me.short, me.coach, me.kind,
          LT.ON, act, note, stampStr, rid, me.key, me.short + ' · ' + initials(me.coach)];
}
/** Dòng sổ dạng đã đọc (để cập nhật bộ nhớ đệm ngay sau khi ghi). */
export function logRowParsed(arr, row) {
  return logRows([arr], row)[0];
}
/** Nhãn buổi trong ghi chú: "T6 23.10 · 19:00" */
export function slotLabel(x) { return LT.DOW[dowOf(x.date)] + ' ' + ddMm(x.date) + ' · ' + hm(x.h); }

/* ================================================================== */
/* Lõi nghiệp vụ                                                        */
/* ================================================================== */

/** Phiếu của hội viên trong tuần: các dòng "Đã đặt" + số lần đổi + bản phiếu + vết đổi (từ → sang, theo thứ tự ghi).
    Dòng "Mời" / "Từ chối" không phải buổi tập, không đổi bản phiếu — chỉ đếm (acts) để chặn bấm liên tục. "Ghép" không tính lượt đổi. */
export function mine(rows, person, ctx) {
  const code = person.key + '-W' + lt2(ctx.no), list = [], moves = [];
  let ver = 0, changes = 0, acts = 0;
  rows.forEach(r => {
    if (r.week !== ctx.key || r.kh !== person.key) return;
    if (r.st === LT.INVITE || r.st === LT.DECLINE) { acts++; return; }
    if (r.ver > ver) ver = r.ver;
    if (r.act === 'Đổi') {
      changes++;
      const from = fromNote(r.note, ctx);
      if (from && r.date && r.h >= 0) moves.push({ from: from, to: { date: r.date, h: r.h } });
    }
    if (r.st === LT.ON && r.date && r.h >= 0) list.push({ date: r.date, h: r.h, row: r.row, note: r.note || '' });
  });
  list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.h - b.h);
  return { code: code, ver: ver, changes: changes, sessions: list, moves: moves, acts: acts };
}
/** "Đổi từ T6 23.10 · 19:00 …" → {date: ngày trong tuần có dd.mm đó, h: 19}; không đọc được → null. */
export function fromNote(note, ctx) {
  const m = String(note || '').match(/Đổi từ\s+\S+\s+(\d{2})\.(\d{2})\s*·\s*(\d{1,2}):00/);
  if (!m) return null;
  for (let i = 0; i < ctx.days.length; i++) if (ddMm(ctx.days[i]) === m[1] + '.' + m[2]) return { date: ctx.days[i], h: +m[3] };
  return null;
}
/**
 * Phòng ở từng khung, tính theo SUẤT COACH (chủ studio chốt 18/10): mỗi coach mỗi khung một suất — một khách 1:1, hoặc một
 * nhóm 1:2 (tối đa 2 khách gói 1:2 của CÙNG coach đó). Phòng tối đa `cap` suất (= số coach dạy cùng lúc): 4 khách 1:1,
 * hay 8 khách 1:2, hay 3 khách 1:1 + một cặp 1:2 = 5 người — đều là đầy. Khách tập thử và dòng sổ không ghi coach:
 * mỗi người một suất riêng. Sổ lệch luật (một coach hai khách 1:1, hoặc 1:1 lẫn 1:2 — dòng sửa tay / ghi trước luật)
 * vẫn tính đủ từng suất, không bao giờ nhét thêm người vào phòng.
 * Trả {"yyyy-MM-dd|h": {u: số suất đã chiếm, x: số suất không coach, c: {khoá coach: [{kh: Mã KH, duo: gói 1:2, name: họ tên trên sổ,
 * i: thứ tự dòng trong sổ}]}}} — i để biết một lời mời có ghi SAU lượt đặt hiện tại của người mời không.
 */
export function roomOf(rows, ctx, trials) {
  const o = {};
  const at = k => o[k] || (o[k] = { u: 0, x: 0, c: {} });
  rows.forEach((r, i) => {
    if (r.week !== ctx.key || r.st !== LT.ON || r.h < 0) return;
    const s = at(r.date + '|' + r.h), ck = coachKey(r.coach);
    if (!ck) { s.x++; return; }
    (s.c[ck] || (s.c[ck] = [])).push({ kh: r.kh, duo: isDuo(r.kind), name: r.name, i: i });
  });
  for (const k in trials) at(k).x += trials[k];
  for (const k in o) {
    const s = o[k];
    let u = s.x;
    for (const ck in s.c) {
      const g = s.c[ck], two = g.filter(e => e.duo).length;
      u += g.length - two + Math.ceil(two / 2);
    }
    s.u = u;
  }
  return o;
}
/** Số suất đã chiếm mỗi khung (hội viên "Đã đặt" theo coach + khách tập thử). */
export function taken(rows, ctx, trials) {
  const o = roomOf(rows, ctx, trials), t = {};
  for (const k in o) t[k] = o[k].u;
  return t;
}
export function envOf(ctx, rows, trials, closed, cap) {
  const room = roomOf(rows, ctx, trials), t = {};
  for (const k in room) t[k] = room[k].u;
  return { closed: closed, cap: cap, taken: t, room: room, inv: invitesOf(rows, ctx) };
}
/** Mã KH ở cuối ghi chú dòng mời / từ chối: "Mời K. Cặp Hai · B926DY" → "B926DY"; "Huỷ mời" → "". */
export function noteKey(note) { const s = String(note || ''), i = s.lastIndexOf(' · '); return i < 0 ? '' : s.slice(i + 3).trim(); }
/**
 * Lời mời trong tuần (dòng sau thay dòng trước): inv["người mời|ngày|giờ"] = {to: Mã KH người được mời ('' = đã huỷ), i: thứ tự dòng};
 * dec["người được mời|người mời|ngày|giờ"] = thứ tự dòng "Từ chối" mới nhất; seat["hội viên|ngày|giờ"] = thứ tự dòng đặt mới nhất
 * (kể cả dòng đã đổi đi) của hội viên ở khung đó — người được mời đã vào khung sau lời mời thì lời mời đã xong.
 */
export function invitesOf(rows, ctx) {
  const inv = {}, dec = {}, seat = {};
  rows.forEach((r, i) => {
    if (r.week !== ctx.key || !r.date || r.h < 0) return;
    if (r.st === LT.INVITE) inv[r.kh + '|' + r.date + '|' + r.h] = { to: noteKey(r.note), i: i };
    else if (r.st === LT.DECLINE) dec[r.kh + '|' + noteKey(r.note) + '|' + r.date + '|' + r.h] = i;
    else if (r.kh) seat[r.kh + '|' + r.date + '|' + r.h] = i;
  });
  return { inv: inv, dec: dec, seat: seat };
}
/** Lời mời iv (của người mời `from` ở khung k) đã bị người được mời từ chối SAU khi mời chưa. */
function declinedOf(inv, iv, from, k) { const d = inv.dec[iv.to + '|' + from + '|' + k]; return d !== undefined && d > iv.i; }
/** Những người khác trong nhóm của coach hội viên ở khung k (bỏ dòng của chính hội viên). */
function othersAt(env, person, k) {
  const s = env.room ? env.room[k] : null, ck = coachKey(person.coach), g = s && ck ? s.c[ck] : null;
  return g ? g.filter(e => e.kh !== person.key) : [];
}
/** Dòng "Đã đặt" của chính hội viên ở khung k (trong nhóm coach của mình), không có → null. */
function selfAt(env, person, k) {
  const s = env.room ? env.room[k] : null, ck = coachKey(person.coach), g = s && ck ? s.c[ck] : null;
  if (!g) return null;
  for (let i = 0; i < g.length; i++) if (g[i].kh === person.key) return g[i];
  return null;
}
/** Lời mời đang còn của người mời `from` (dòng "Đã đặt" của họ ở khung k là `seat`): ghi SAU lượt đặt hiện tại, chưa huỷ, người được
    mời chưa từng vào khung này sau lời mời (đã vào — kể cả rồi đổi đi — là lời mời đã xong, không hiện lại).
    Trả lời mời (có thể đã bị từ chối — kiểm declinedOf) hoặc null. */
function liveInvite(env, from, seat, k) {
  const iv = env.inv.inv[from + '|' + k];
  if (!iv || !iv.to || !seat || iv.i <= seat.i) return null;
  const a = env.inv.seat[iv.to + '|' + k];
  return a !== undefined && a > iv.i ? null : iv;
}
/**
 * Coach của hội viên ở khung k (không tính dòng của chính hội viên): '' rảnh · 'join' coach đang có đúng MỘT khách 1:2 khác
 * và hội viên cũng gói 1:2 → ghép thành cặp, không chiếm thêm suất · 'busy' coach đã kín khung đó với hội viên này.
 */
export function coachAt(env, person, k) {
  const o = othersAt(env, person, k);
  if (!o.length) return '';
  return isDuo(person.kind) && o.length === 1 && o[0].duo ? 'join' : 'busy';
}
/** Dời buổi `from` của hội viên 1:2 — đang LẺ (coach chưa có ai khác ở đó) — vào khung `to` có đúng một khách 1:2 cùng coach đang
    chờ → thành cặp: "Ghép", không tính lượt đổi, được dời trong cùng ngày. */
export function pairMove(env, person, from, to) {
  return isDuo(person.kind) && coachAt(env, person, to.date + '|' + to.h) === 'join' && coachAt(env, person, from.date + '|' + from.h) === '';
}
/** Khung hết chỗ với hội viên này: phòng đầy hoặc coach bận (máy chủ trả het_cho, trang gợi ý giờ khác). */
export function isFull(w) { return w === 'day' || w === 'coach_ban'; }

/** Vì sao hội viên không đặt được khung này ('' = đặt được). lead: số ms phải báo trước. */
export function why(ctx, person, env, iso, h, lead) {
  if (ctx.days.indexOf(iso) < 0) return 'ngoai_tuan';
  if (LT.SLOTS.indexOf(h) < 0) return 'gio';
  if (env.closed[iso] !== undefined) return 'nghi';
  if (person.start && iso < person.start) return 'chua_bat_dau';
  if (person.exp && iso > person.exp) return 'het_han';
  if (isDuo(person.kind) && LT.DUO_HOURS.indexOf(h) < 0) return 'gio_ghep';     /* gói 1:2: chỉ các khung ghép cố định */
  const t = slotMs(iso, h);
  if (t <= ctx.now) return 'qua';
  if (lead && t - ctx.now < lead) return 'duoi_24h';
  const k = iso + '|' + h, co = coachAt(env, person, k);
  if (co === 'join') return '';                            /* vào cặp 1:2 có sẵn của coach: không thêm suất nên phòng đầy vẫn vào được */
  if ((env.taken[k] || 0) >= env.cap) return 'day';
  if (co === 'busy') return 'coach_ban';
  return '';
}
export function openDays(ctx, person, env, lead, skip) {
  return ctx.days.filter(d => {
    if (skip && skip[d]) return false;
    for (let i = 0; i < LT.SLOTS.length; i++) if (!why(ctx, person, env, d, LT.SLOTS[i], lead)) return true;
    return false;
  });
}
/** Giới hạn số buổi: đặt mới thì [min, max]; đã có phiếu thì thêm tối đa addMax. */
export function limits(ctx, person, env, m) {
  const used = {};
  let upcoming = 0;
  m.sessions.forEach(s => { used[s.date] = 1; if (slotMs(s.date, s.h) > ctx.now) upcoming++; });
  const free = openDays(ctx, person, env, ctx.lead, used).length;
  if (!m.sessions.length) {
    const max = Math.min(LT.MAX, person.left, free);
    return { min: Math.min(LT.MIN, max), max: max, add: 0, free: free };
  }
  return { min: 0, max: 0, add: Math.max(0, Math.min(LT.MAX - m.sessions.length, person.left - upcoming, free)), free: free };
}

/** Kiểm tra lượt đặt (đặt mới hoặc thêm buổi). picks: [{date, h}]. Trả {ok} hoặc {error, why, full}. */
export function checkBook(ctx, person, env, m, picks) {
  if (!Array.isArray(picks) || !picks.length || picks.length > LT.MAX) return { error: 'khong_hop_le', why: 'so_buoi' };
  const lim = limits(ctx, person, env, m), seen = {}, full = [];
  m.sessions.forEach(s => { seen[s.date] = 1; });
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (!p || !validIso(p.date) || LT.SLOTS.indexOf(p.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
    if (seen[p.date]) return { error: 'khong_hop_le', why: 'mot_ngay_mot_buoi' };
    seen[p.date] = 1;
    const w = why(ctx, person, env, p.date, p.h, ctx.lead);
    if (isFull(w)) full.push({ date: p.date, h: p.h });
    else if (w) return { error: 'khong_hop_le', why: w, date: p.date, h: p.h };
  }
  if (m.sessions.length) {
    if (picks.length > lim.add) return { error: 'khong_hop_le', why: 'qua_so_buoi' };
  } else {
    if (picks.length > lim.max) return { error: 'khong_hop_le', why: 'qua_so_buoi' };
    if (picks.length < lim.min) return { error: 'khong_hop_le', why: 'it_hon_toi_thieu' };
  }
  if (full.length) return { error: 'het_cho', full: full };
  return { ok: true };
}
/**
 * Kiểm tra đổi buổi: từ buổi `from` sang khung `to` (ngày khác, cùng tuần, cả hai cách hiện tại ≥ 24 giờ).
 * Gói 1:2: dời một buổi đang lẻ vào cặp đang chờ (pairMove) không tính lượt đổi — còn làm được khi đã hết lượt, và được dời
 * trong cùng ngày. Trả {ok, cur, pair} — pair: ghi "Ghép" thay "Đổi".
 */
export function checkChange(ctx, person, env, m, from, to) {
  const duo = isDuo(person.kind);
  if (!duo && m.changes >= LT.CHANGES) return { error: 'het_luot_doi' };
  if (!from || !to || !validIso(from.date) || !validIso(to.date) || LT.SLOTS.indexOf(to.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  let cur = null;
  m.sessions.forEach(s => { if (s.date === from.date && s.h === from.h) cur = s; });
  if (!cur) return { error: 'khong_hop_le', why: 'khong_co_buoi' };
  const pair = duo && pairMove(env, person, cur, to);
  if (!pair && m.changes >= LT.CHANGES) return { error: 'het_luot_doi' };
  if (slotMs(cur.date, cur.h) - ctx.now < LT.LEAD) return { error: 'khong_hop_le', why: 'buoi_duoi_24h' };
  if (to.date === from.date && !pair) return { error: 'khong_hop_le', why: 'cung_ngay' };
  for (let i = 0; i < m.sessions.length; i++) if (m.sessions[i].date === to.date && m.sessions[i] !== cur) return { error: 'khong_hop_le', why: 'mot_ngay_mot_buoi' };
  const w = why(ctx, person, env, to.date, to.h, LT.LEAD);
  if (isFull(w)) return { error: 'het_cho', full: [{ date: to.date, h: to.h }] };
  if (w) return { error: 'khong_hop_le', why: w };
  return { ok: true, cur: cur, pair: pair };
}
/**
 * Kiểm lời mời: người mời (gói 1:2) có buổi ở khung ghép `slot`, đang chờ một mình, khung còn đặt được; to = hội viên được mời
 * (gói 1:2, cùng coach, không phải chính mình) hoặc null = huỷ lời mời. noop: không cần ghi gì (mời lại đúng người đang được
 * mời, hay huỷ khi chưa mời ai).
 */
export function checkInvite(ctx, person, env, m, slot, to) {
  if (!isDuo(person.kind)) return { error: 'khong_hop_le', why: 'goi' };
  if (!slot || !validIso(slot.date) || LT.DUO_HOURS.indexOf(slot.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  if (!m.sessions.some(s => s.date === slot.date && s.h === slot.h)) return { error: 'khong_hop_le', why: 'khong_co_buoi' };
  const t = slotMs(slot.date, slot.h), k = slot.date + '|' + slot.h;
  if (t <= ctx.now) return { error: 'khong_hop_le', why: 'qua' };
  if (ctx.lead && t - ctx.now < ctx.lead) return { error: 'khong_hop_le', why: 'duoi_24h' };
  if (othersAt(env, person, k).length) return { error: 'da_ghep' };
  if (m.acts >= LT.INVITE_MAX) return { error: 'qua_luot_moi' };
  const cur = liveInvite(env, person.key, selfAt(env, person, k), k);
  if (to) {
    if (to.key === person.key || !isDuo(to.kind) || coachKey(to.coach) !== coachKey(person.coach)) return { error: 'khong_hop_le', why: 'nguoi_moi' };
    if (cur && cur.to === to.key && !declinedOf(env.inv, cur, person.key, k)) return { ok: true, noop: true };
  } else if (!cur) return { ok: true, noop: true };
  return { ok: true };
}
/** Từ chối lời mời ở khung `slot`: tìm người đang chờ một mình trong nhóm coach của hội viên ở khung đó và đang mời hội viên.
    Không còn lời mời nào như vậy (người mời đã dời, đã có người vào, đã từ chối) → noop. Trả {ok, from: {kh, name}}. */
export function checkDecline(ctx, person, env, slot) {
  if (!isDuo(person.kind)) return { error: 'khong_hop_le', why: 'goi' };
  if (!slot || !validIso(slot.date) || LT.SLOTS.indexOf(slot.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  const k = slot.date + '|' + slot.h, o = othersAt(env, person, k);
  if (o.length !== 1 || !o[0].duo) return { ok: true, noop: true };
  const iv = liveInvite(env, o[0].kh, o[0], k);
  if (!iv || iv.to !== person.key || declinedOf(env.inv, iv, o[0].kh, k)) return { ok: true, noop: true };
  return { ok: true, from: { kh: o[0].kh, name: o[0].name } };
}
/** Dòng sổ lời mời (17 cột như logRow): Trạng thái + Thao tác "Mời", ghi chú "Mời <tên ngắn> · <Mã KH>" hoặc "Huỷ mời". Bản phiếu
    giữ nguyên (lời mời không đổi phiếu). */
export function inviteRow(code, ver, week, slot, me, to, stampStr, rid) {
  return [code, ver, week, slot.date, LT.DOW[dowOf(slot.date)], hm(slot.h), me.name, me.short, me.coach, me.kind,
          LT.INVITE, LT.INVITE, to ? LT.INVITE + ' ' + to.short + ' · ' + to.key : 'Huỷ mời', stampStr, rid, me.key, me.short + ' · ' + initials(me.coach)];
}
/** Dòng sổ từ chối lời mời: của người được mời, ở khung được mời, ghi chú "Từ chối lời mời của <tên ngắn người mời> · <Mã KH>". */
export function declineRow(code, ver, week, slot, me, fromShort, fromKey, stampStr, rid) {
  return [code, ver, week, slot.date, LT.DOW[dowOf(slot.date)], hm(slot.h), me.name, me.short, me.coach, me.kind,
          LT.DECLINE, LT.DECLINE, 'Từ chối lời mời của ' + fromShort + ' · ' + fromKey, stampStr, rid, me.key, me.short + ' · ' + initials(me.coach)];
}

/** Còn khung nào đặt được tuần này không (bỏ qua chỗ trống) — dùng cho màn chưa mở. */
export function anyOpen(ctx, closed) {
  for (let i = 0; i < ctx.days.length; i++) {
    if (closed[ctx.days[i]] !== undefined) continue;
    for (let j = 0; j < LT.SLOTS.length; j++) {
      const t = slotMs(ctx.days[i], LT.SLOTS[j]);
      if (t > ctx.now && (!ctx.lead || t - ctx.now >= ctx.lead)) return true;
    }
  }
  return false;
}

/** Tên gọi / tên ngắn của một người trên sổ: lấy theo danh sách hội viên hiện tại (Mã KH), không có thì theo họ tên ghi trên sổ. */
function callOf(kh, name, list) { const p = list ? findPerson(list, kh) : null; return p ? p.call : callName(name); }
export function shortOf(kh, name, list) { const p = list ? findPerson(list, kh) : null; return p ? p.short : short(name); }
/**
 * Phần riêng gói 1:2 trong state (chủ studio chốt 18/10 14:13 — khách 1:2 thấy tên bạn tập cùng coach):
 *  duoHours: các khung ghép · wait: {khung: tên gọi người đang chờ ghép} (khung còn tới, coach của mình, chưa có mình) ·
 *  pairs: {buổi của mình: tên gọi bạn tập} · invOut: {buổi đang lẻ của mình: {to: tên gọi người được mời, st: 'wait' | 'no'}} ·
 *  invIn: [{date, h, from: tên gọi}] lời mời gửi mình còn nhận được · peers: [{key, short, call}] khách 1:2 cùng coach để mời
 *  (máy chủ đổi key → id trước khi trả, không bao giờ lộ Mã KH).
 */
export function duoState(ctx, person, env, m, list) {
  const wait = {}, pairs = {}, invOut = {}, invIn = [], mineAt = {}, ck = coachKey(person.coach);
  m.sessions.forEach(s => { mineAt[s.date + '|' + s.h] = 1; });
  ctx.days.forEach(d => LT.DUO_HOURS.forEach(h => {
    const k = d + '|' + h, o = othersAt(env, person, k);
    if (mineAt[k] || slotMs(d, h) <= ctx.now || o.length !== 1 || !o[0].duo) return;
    wait[k] = callOf(o[0].kh, o[0].name, list);
    const iv = liveInvite(env, o[0].kh, o[0], k);
    if (iv && iv.to === person.key && !declinedOf(env.inv, iv, o[0].kh, k) && why(ctx, person, env, d, h, ctx.lead) === '') {
      invIn.push({ date: d, h: h, from: wait[k] });
    }
  }));
  m.sessions.forEach(s => {
    const k = s.date + '|' + s.h, o = othersAt(env, person, k);
    if (o.length === 1 && o[0].duo) { pairs[k] = callOf(o[0].kh, o[0].name, list); return; }
    if (o.length || slotMs(s.date, s.h) <= ctx.now) return;
    const iv = liveInvite(env, person.key, selfAt(env, person, k), k), p = iv && list ? findPerson(list, iv.to) : null;
    if (p) invOut[k] = { to: p.call, st: declinedOf(env.inv, iv, person.key, k) ? 'no' : 'wait' };
  });
  const peers = (list || []).filter(p => p.key !== person.key && isDuo(p.kind) && coachKey(p.coach) === ck)
    .map(p => ({ key: p.key, short: p.short, call: p.call }))
    .sort((a, b) => a.short.localeCompare(b.short, 'vi') || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { duoHours: LT.DUO_HOURS, wait: wait, pairs: pairs, invOut: invOut, invIn: invIn, peers: peers };
}
/** Gói thông tin trả cho trình duyệt (không có SĐT; tên người khác chỉ có ở phần gói 1:2 — bạn tập cùng coach). list: danh sách
    hội viên còn hiệu lực (gói 1:2 cần để lấy tên gọi + danh sách mời). */
export function stateOf(ctx, person, env, m, marks, list) {
  const lim = limits(ctx, person, env, m), closed = {}, tk = {}, co = {};
  ctx.days.forEach(d => {
    if (env.closed[d] !== undefined) closed[d] = env.closed[d] || 'Phòng nghỉ';
    LT.SLOTS.forEach(h => {
      const k = d + '|' + h, n = env.taken[k] || 0, c = coachAt(env, person, k);
      if (n) tk[k] = n;
      if (c) co[k] = c;                                     /* coach của chính hội viên: 'busy' · 'join' (không lộ ai đặt) */
    });
  });
  const sessions = m.sessions.map(s => {
    const past = slotMs(s.date, s.h) <= ctx.now, mk = s.date <= ctx.today ? marks[person.name + '|' + s.date] : undefined;   /* điểm danh chỉ tính tới hôm nay */
    return { date: s.date, h: s.h, st: mk === 'done' ? 'done' : mk === 'absent' ? 'absent' : past ? 'past' : 'on' };
  });
  const mode = sessions.length ? 'ticket' : (lim.max > 0 ? 'book' : 'closed');
  const out = {
    ok: true, auth: true, now: ctx.now, mode: mode,
    week: { key: ctx.key, no: ctx.no, mon: ctx.mon, days: ctx.days, phase: ctx.phase, lead: ctx.lead > 0,
            nextOpen: ctx.nextOpen, nextNo: ctx.nextNo, closed: closed },
    cap: env.cap, taken: tk, coachAt: co, slots: LT.SLOTS,
    me: { short: person.short, call: person.call, coach: person.coach, kind: person.kind, pkg: person.pkg,
          left: person.left, exp: person.exp, start: person.start },
    mine: { code: m.code, ver: m.ver, changes: m.changes, changesLeft: Math.max(0, LT.CHANGES - m.changes), sessions: sessions,
            moves: (m.moves || []).map(x => ({ from: { date: x.from.date, h: x.from.h }, to: { date: x.to.date, h: x.to.h } })) },
    limits: { min: lim.min, max: lim.max, add: lim.add }
  };
  if (isDuo(person.kind)) out.duo = duoState(ctx, person, env, m, list);
  return out;
}
/** Màn công khai (chưa xác minh): thông tin tuần để hiện tìm tên hoặc đếm ngược. */
export function publicOf(ctx, why, closed) {
  return { ok: true, auth: false, why: why, now: ctx.now, open: anyOpen(ctx, closed),
           week: { key: ctx.key, no: ctx.no, mon: ctx.mon, days: ctx.days, phase: ctx.phase, lead: ctx.lead > 0, nextOpen: ctx.nextOpen, nextNo: ctx.nextNo } };
}
/** Ảnh chụp danh sách hội viên cho tab _dữ liệu (giống ltSnapshot_). */
export function snapshotRows(list) {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map(p => [p.name, p.short, p.coach, p.left, p.exp, p.key, p.short + ' · ' + initials(p.coach)].map(String));
}
export function findPerson(list, key) { for (let i = 0; i < list.length; i++) if (list[i].key === key) return list[i]; return null; }
export function devOk(d) { return /^[A-Za-z0-9_-]{16,64}$/.test(String(d || '')); }
export function ridOk(r) { return /^[A-Za-z0-9_-]{8,64}$/.test(String(r || '')); }
/**
 * Bản phiếu khách đang xem (base) đã cũ: phiếu trên sổ đã lên bản khác kể từ lúc khách xem → không ghi (ban_cu).
 * Chặn việc một lệnh mất phản hồi đã vào sổ rồi khách gửi thêm một lựa chọn khác (thành thêm buổi ngoài ý muốn).
 * Không gửi base (máy khách cũ) → không kiểm, như trước.
 */
export function baseStale(base, m) { return base !== undefined && base !== null && base !== '' && Number(base) !== m.ver; }
