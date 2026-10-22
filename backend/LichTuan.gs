/**
 * B0DY — Lịch tập tuần của hội viên · máy chủ cho booking.b0dy.studio
 *
 * File này nằm trong project Apps Script "B0DY Booking API" (cùng project với đặt lịch tập thử).
 * Code.gs ▸ doPost chuyển mọi action bắt đầu bằng "lt_" sang ltDoPost_(). Lịch tuần chạy trên
 * deployment RIÊNG → deployment tập thử (b0dy.studio) giữ nguyên version cũ, không bị ảnh hưởng.
 *
 * Đọc (không bao giờ ghi): file BA — MEMBERS · SESSION LOG · TRIAL · B0B · ⚙️ 2.
 * Ghi: file "[B0DY Studio] Lịch tập tuần" — tab "Sổ đặt lịch" (mỗi buổi một dòng) và tab ẩn "_dữ liệu".
 *      Tab "Bảng lịch tập" chỉ có công thức đọc "Sổ đặt lịch", máy chủ không ghi vào đó.
 *
 * Script Properties: BA_ID (đã có từ setupBooking) · LT_OUT_ID (ID file Lịch tập tuần; thiếu thì tự tìm theo tên)
 *                    · LT_SECRET (tự sinh ở lượt gọi đầu, dùng ký mã nhớ máy — đổi giá trị = mọi máy phải xác minh lại).
 * Mọi hàm kết thúc bằng "_" để không ai bấm Run nhầm trong trình soạn thảo.
 */

var LT = {
  OFF: 7 * 3600e3,                                   // giờ Việt Nam, không có giờ mùa hè
  SLOTS: [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20], // 12:00–14:00 coach nghỉ trưa
  NDAYS: 7,                                          // T2..CN · ngày / giờ nhận khách của từng coach: tab "Lịch coach" (SCHED)
  OPEN_H: 6,                                         // lịch tuần sau mở lúc 06:00 Chủ Nhật
  LEAD: 12 * 3600e3,                                 // đặt muộn / thêm buổi / khung mới khi đổi lịch / mời: cách hiện tại ≥ 12 giờ
  CHG_LEAD: 24 * 3600e3,                             // đổi lịch: buổi đang có phải cách hiện tại ≥ 24 giờ (chủ studio chốt 22/10, khớp hợp đồng)
  MIN: 2, MAX: 4, CHANGES: 2,
  CAP: 4,                                            // dự phòng khi ⚙️ 2 không có "Sức chứa tối đa / khung"
  REMEMBER: 60 * 864e5, SESSION: 12 * 3600e3,        // nhớ máy 60 ngày · không nhớ thì 12 giờ
  FAILS: 5, LOCK_S: 15 * 60, MEMBER_FAILS: 20,       // sai 5 lần → khoá máy 15 phút · sai 20 lần/giờ trên một tên → khoá tên
  FIND_MAX: 300,                                     // lượt tìm tên / máy / khung 10 phút cố định (trang tìm theo từng chữ gõ: ~8 lượt / người)
  FIND_TOP: 6,                                       // tối đa 6 người mỗi lượt tìm; nhiều hơn → more: true
  OUT_NAME: '[B0DY Studio] Lịch tập tuần', LOG: 'Sổ đặt lịch', DATA: '_dữ liệu', SCHED: 'Lịch coach',
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
/* Thời gian — mọi phép tính theo giờ Việt Nam (UTC+7), không phụ thuộc */
/* timezone của script hay của file BA (file BA đang là US Pacific).   */
/* ================================================================== */

function lt2_(n) { return (n < 10 ? '0' : '') + n; }
function ltParts_(ms) {
  var d = new Date(ms + LT.OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(),
           mi: d.getUTCMinutes(), ss: d.getUTCSeconds(), dow: d.getUTCDay() };
}
function ltIsoP_(p) { return p.y + '-' + lt2_(p.m) + '-' + lt2_(p.d); }
function ltIsoOf_(ms) { return ltIsoP_(ltParts_(ms)); }
function ltDayMs_(iso) { var a = String(iso).split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]) - LT.OFF; }
function ltAdd_(iso, n) { return ltIsoOf_(ltDayMs_(iso) + n * 864e5); }
function ltSlotMs_(iso, h) { return ltDayMs_(iso) + h * 3600e3; }
function ltDowOf_(iso) { return ltParts_(ltDayMs_(iso)).dow; }
function ltValidIso_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && ltIsoOf_(ltDayMs_(s)) === s; }
function ltStamp_(ms) { var p = ltParts_(ms); return ltIsoP_(p) + ' ' + lt2_(p.hh) + ':' + lt2_(p.mi) + ':' + lt2_(p.ss); }
function ltDdMm_(iso) { var a = String(iso).split('-'); return a[2] + '.' + a[1]; }
function ltHm_(h) { return lt2_(h) + ':00'; }

/** Tuần ISO-8601: tuần chứa Thứ Năm quyết định năm. 19.10.2026 → {year: 2026, week: 43} */
function ltIsoWeek_(iso) {
  var a = String(iso).split('-'), t = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]));
  var day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - y0) / 864e5 + 1) / 7) };
}
function ltWeekKey_(monIso) { var w = ltIsoWeek_(monIso); return w.year + '-W' + lt2_(w.week); }

/**
 * Tuần đang nhận đặt:
 *  · Chủ Nhật từ 06:00 → tuần sau (phase 'open', đặt khung nào cũng được, không cần báo trước).
 *  · T2–T7 → tuần này (phase 'late', khung phải cách hiện tại ≥ 12 giờ).
 *  · Chủ Nhật trước 06:00 → tuần vừa qua (phase 'before', mọi khung đã qua → hiện đếm ngược tới 06:00).
 */
function ltWeekCtx_(now) {
  var p = ltParts_(now), today = ltIsoP_(p), mon, phase;
  if (p.dow === 0) {
    if (p.hh >= LT.OPEN_H) { mon = ltAdd_(today, 1); phase = 'open'; } else { mon = ltAdd_(today, -6); phase = 'before'; }
  } else { mon = ltAdd_(today, 1 - p.dow); phase = 'late'; }
  var days = [];
  for (var i = 0; i < LT.NDAYS; i++) days.push(ltAdd_(mon, i));
  var sun = p.dow === 0 ? today : ltAdd_(today, 7 - p.dow), next = ltSlotMs_(sun, LT.OPEN_H);
  if (next <= now) next = ltSlotMs_(ltAdd_(sun, 7), LT.OPEN_H);
  var nextMon = ltIsoOf_(next + 864e5), w = ltIsoWeek_(mon);
  return { now: now, today: today, mon: mon, days: days, key: ltWeekKey_(mon), no: w.week, phase: phase,
           lead: now >= ltDayMs_(mon) ? LT.LEAD : 0, nextOpen: next, nextKey: ltWeekKey_(nextMon), nextNo: ltIsoWeek_(nextMon).week };
}

/* ================================================================== */
/* Chuẩn hoá chữ và tên                                                */
/* ================================================================== */

function ltFold_(s) {   /* bỏ dấu, đ → d, chữ thường */
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd').toLowerCase();
}
function ltHdr_(s) { return ltFold_(s).replace(/\s+/g, ' ').trim(); }
function ltName_(s) { return ltFold_(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function ltWords_(s) { return String(s == null ? '' : s).trim().split(/\s+/).filter(function (x) { return !!x; }); }
/** Tên hiện công khai (chủ studio chốt 18/10): tên gọi (2 chữ cuối) giữ nguyên, mọi chữ trước viết tắt — "H. Đức Nam",
    "N. G. Bảo Linh"; tên 2 chữ: "N. Nam" (họ luôn viết tắt). */
function ltShort_(name) {
  var w = ltWords_(name);
  if (w.length < 2) return w.join(' ');
  var k = Math.max(1, w.length - 2);
  return w.slice(0, k).map(function (x) { return x.charAt(0).toUpperCase() + '.'; }).join(' ') + ' ' + w.slice(k).join(' ');
}
/** Tên gọi (chào, bạn tập đôi): 2 chữ cuối, không bao giờ có họ — "Đức Nam", "Bảo Linh", "Văn Hưng", "Thị Hà"; tên 2 chữ: "Nam". */
function ltCall_(name) {
  var w = ltWords_(name);
  return w.length < 2 ? w.join(' ') : w.slice(Math.max(1, w.length - 2)).join(' ');
}
function ltCoach_(c) { return String(c == null ? '' : c).replace(/\s*\(.*\)\s*$/, '').trim(); }
/** Khoá so sánh coach (bỏ hậu tố, bỏ dấu, chữ thường): dòng sổ sửa tay lệch dấu / hoa thường vẫn là cùng coach. */
function ltCoachKey_(c) { return ltName_(ltCoach_(c)); }
/** Gói 1:2 (một coach kèm hai khách). */
function ltIsDuo_(kind) { return /^1\s*:\s*2$/.test(String(kind == null ? '' : kind).trim()); }
function ltInitials_(c) { return ltWords_(ltCoach_(c)).map(function (x) { return x.charAt(0).toUpperCase(); }).join(''); }
function ltPkg_(pkg, total) { var m = String(pkg == null ? '' : pkg).match(/\d+/), n = m ? +m[0] : (+total || 0); return n > 0 ? n + 'B' : ''; }
function ltDigits_(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }

/** Luật cũ (bậc 0 của ltFindRank_): ≥ 2 chữ khớp liền phần CUỐI của họ tên (bỏ dấu), chữ cuối được gõ dở. */
function ltMatch_(q, nameTokens) {
  var L = q.length;
  if (L < 2 || L > nameTokens.length) return false;
  var off = nameTokens.length - L;
  for (var i = 0; i < L; i++) {
    var a = q[i], b = nameTokens[off + i];
    if (i < L - 1 ? a !== b : b.indexOf(a) !== 0) return false;
  }
  return true;
}

/**
 * Cách khớp tốt nhất của các chữ gõ q (đúng thứ tự, được bỏ qua chữ ở giữa) vào ĐẦU các chữ khác nhau của V.
 * Không khớp → null. Khớp → {last, eq, at}: last = 1 nếu chữ gõ cuối rơi được vào chữ cuối của V (tên gọi),
 * eq = số chữ gõ trùng trọn một chữ (nhiều nhất, sau khi đã ưu tiên last), at = vị trí trong V của từng chữ gõ.
 * Quy hoạch động f[i][j] = số chữ trùng trọn nhiều nhất khi khớp i chữ gõ đầu vào j chữ đầu của V (−1: không khớp được).
 * Giống hệt prefixFit của Worker (worker/src/core.js).
 */
function ltPrefixFit_(q, V) {
  var n = q.length, m = V.length, f = [], i, j;
  if (!n || n > m) return null;
  for (i = 0; i <= n; i++) { f.push([]); for (j = 0; j <= m; j++) f[i].push(i ? -1 : 0); }
  for (i = 1; i <= n; i++) {
    for (j = i; j <= m; j++) {
      var b = f[i][j - 1];
      if (f[i - 1][j - 1] >= 0 && V[j - 1].indexOf(q[i - 1]) === 0) b = Math.max(b, f[i - 1][j - 1] + (V[j - 1] === q[i - 1] ? 1 : 0));
      f[i][j] = b;
    }
  }
  var last = V[m - 1].indexOf(q[n - 1]) === 0 && f[n - 1][m - 1] >= 0 ? 1 : 0;
  i = last ? n - 1 : n; j = last ? m - 1 : m;
  if (f[i][j] < 0) return null;
  var at = [], eq = f[i][j] + (last && V[m - 1] === q[n - 1] ? 1 : 0);
  if (last) at[n - 1] = m - 1;
  while (i > 0) { if (f[i][j - 1] === f[i][j]) j--; else { at[i - 1] = j - 1; i--; j--; } }
  return { last: last, eq: eq, at: at };
}

/**
 * Tìm tên — gõ tới đâu ra tới đó. q = các chữ đã gõ (ltName_ rồi tách), toks = các chữ của họ tên (ltName_).
 * Chỉ so với phần tên hiện công khai V = tên đệm + tên (họ chỉ hiện chữ cái đầu "H.", nên gõ riêng họ không ra ai):
 *  · bậc 0 — luật cũ ltMatch_: ≥ 2 chữ khớp liền phần CUỐI của họ tên (kể cả họ), chữ cuối được gõ dở;
 *  · bậc 1 — mỗi chữ gõ là ĐẦU của một chữ khác nhau trong V, đúng thứ tự, được bỏ qua chữ ở giữa (1 ký tự là đủ);
 *  · bậc 2 — đúng một chữ, từ 2 ký tự, nằm GIỮA một chữ của V ("hoi" → Khôi).
 * Không khớp → null. Khớp → {tier, last, eq} để xếp hạng (ltFindAll_): last = 1 nếu chữ gõ cuối rơi vào chữ cuối của V
 * (tên gọi), eq = số chữ gõ trùng trọn một chữ.
 */
function ltFindRank_(q, toks) {
  var n = q.length;
  if (!n) return null;
  if (ltMatch_(q, toks)) return { tier: 0, last: 1, eq: n - 1 + (toks[toks.length - 1] === q[n - 1] ? 1 : 0) };
  var V = toks.length >= 2 ? toks.slice(1) : toks, f = ltPrefixFit_(q, V);
  if (f) return { tier: 1, last: f.last, eq: f.eq };
  if (n === 1 && q[0].length >= 2 && V.some(function (v) { return v.indexOf(q[0], 1) > 0; })) {
    return { tier: 2, last: V[V.length - 1].indexOf(q[0], 1) > 0 ? 1 : 0, eq: 0 };
  }
  return null;
}
/**
 * Mọi hội viên khớp, đã xếp hạng: bậc nhỏ trước → chữ gõ cuối rơi vào tên gọi trước → nhiều chữ trùng trọn trước →
 * tên ngắn (localeCompare 'vi', như trước đây) → Mã KH. Thứ tự toàn phần, giống hệt findAll của Worker.
 */
function ltFindAll_(q, persons) {
  var hits = [];
  persons.forEach(function (x) { var r = ltFindRank_(q, x.toks); if (r) hits.push({ x: x, r: r }); });
  hits.sort(function (a, b) {
    return (a.r.tier - b.r.tier) || (b.r.last - a.r.last) || (b.r.eq - a.r.eq) ||
      a.x.short.localeCompare(b.x.short, 'vi') || (a.x.key < b.x.key ? -1 : a.x.key > b.x.key ? 1 : 0);
  });
  return hits.map(function (h) { return h.x; });
}

/* ================================================================== */
/* Đọc ô ngày / giờ                                                     */
/* ================================================================== */

function ltIsDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
/** Ô ngày của file BA → "yyyy-MM-dd". Date: định dạng theo timezone CỦA FILE (đúng ngày đang hiện trên sheet).
    Chữ: dd/mm/yy kiểu Việt (vn=true) hoặc M/d/yyyy kiểu Mỹ (vn=false, SESSION LOG); số đầu > 12 thì tự đảo. */
function ltCellIso_(v, tz, vn) {
  if (v === '' || v == null) return '';
  if (ltIsDate_(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v).trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return ltValidIso_(m[0]) ? m[0] : '';
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!m) return '';
  var a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3], d = vn ? a : b, mo = vn ? b : a;
  if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
  var iso = y + '-' + lt2_(mo) + '-' + lt2_(d);
  return ltValidIso_(iso) ? iso : '';
}
/** Ô giờ → số giờ (8) nếu là giờ chẵn; "08:00" | "8h00" | Date (chỉ giờ) */
function ltCellHour_(v, tz) {
  if (v === '' || v == null) return -1;
  var s = ltIsDate_(v) ? Utilities.formatDate(v, tz, 'HH:mm') : String(v).trim();
  var m = s.match(/^(\d{1,2})[:hH](\d{2})/);
  return m && +m[2] === 0 ? +m[1] : -1;
}

/* ================================================================== */
/* Đọc file BA                                                          */
/* ================================================================== */

function ltBa_() {
  if (!ltBa_.ss) {
    var id = PropertiesService.getScriptProperties().getProperty('BA_ID');
    if (!id) throw new Error('thieu_BA_ID');
    ltBa_.ss = SpreadsheetApp.openById(id);
  }
  return ltBa_.ss;
}
function ltHeadRow_(vals, need) {
  for (var r = 0; r < vals.length; r++) {
    var h = vals[r].map(ltHdr_), ok = true;
    for (var i = 0; i < need.length; i++) if (h.indexOf(need[i]) < 0) { ok = false; break; }
    if (ok) return { r: r, h: h };
  }
  return null;
}

/** MEMBERS → mọi dòng có tên. Dò cột theo TIÊU ĐỀ (chủ studio đổi thứ tự cột thoải mái). */
function ltMemberRows_() {
  var ss = ltBa_(), sh = ss.getSheetByName('MEMBERS');
  if (!sh) throw new Error('thieu_MEMBERS');
  var tz = ss.getSpreadsheetTimeZone(), lastR = sh.getLastRow(), lastC = sh.getLastColumn();
  var top = sh.getRange(1, 1, Math.min(12, lastR), lastC).getValues();
  var hd = ltHeadRow_(top, ['ten', 'coach', 'con lai']);
  if (!hd) throw new Error('khong_thay_cot_MEMBERS');
  var H = hd.h;
  function col() { for (var i = 0; i < arguments.length; i++) { var k = H.indexOf(arguments[i]); if (k >= 0) return k; } return -1; }
  var c = { name: col('ten'), pkg: col('goi'), total: col('so buoi'), kind: col('loai'), coach: col('coach'),
            phone: col('sdt', 'so dien thoai', 'dien thoai'), left: col('con lai'), start: col('ngay bat dau'),
            exp: col('ngay het han'), code: col('ma kh') };
  var first = hd.r + 2, n = lastR - first + 1;
  if (n <= 0) return [];
  var v = sh.getRange(first, 1, n, lastC).getValues(), out = [];
  function g(x, k) { return c[k] >= 0 ? x[c[k]] : ''; }
  for (var r = 0; r < v.length; r++) {
    var x = v[r], name = String(g(x, 'name') || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    out.push({ name: name, pkg: String(g(x, 'pkg') || '').trim(), total: +g(x, 'total') || 0,
               kind: String(g(x, 'kind') || '').trim(), coach: ltCoach_(g(x, 'coach')), phone: ltDigits_(g(x, 'phone')),
               left: Number(g(x, 'left')) || 0, start: ltCellIso_(g(x, 'start'), tz, true),
               exp: ltCellIso_(g(x, 'exp'), tz, true), code: String(g(x, 'code') || '').trim() });
  }
  return out;
}

/**
 * Gộp các dòng còn hiệu lực thành hội viên. Dòng còn hiệu lực = còn buổi và chưa quá ngày hết hạn.
 * Khoá = Mã KH (gói gia hạn A/B dùng chung mã). Số buổi còn = tổng các dòng còn hiệu lực;
 * hết hạn = ngày xa nhất; bắt đầu = ngày sớm nhất (buổi trước ngày bắt đầu sẽ thành "buổi mồ côi" ở BA).
 * Gói, loại, coach lấy theo dòng mà buổi tập sẽ được tính vào (bắt đầu muộn nhất nhưng ≤ hôm nay — giống công thức _mrow).
 */
function ltPersons_(rows, today) {
  var byKey = {}, order = [], phoneOf = {};
  rows.forEach(function (r) {
    var k = r.code || ('#' + ltName_(r.name));
    if (r.phone && !phoneOf[k]) phoneOf[k] = r.phone;
    if (!(r.left > 0) || (r.exp && r.exp < today)) return;
    if (!byKey[k]) { byKey[k] = []; order.push(k); }
    byKey[k].push(r);
  });
  return order.map(function (k) {
    var g = byKey[k], pick = null, left = 0, exp = '', noExp = false, start = '';
    g.forEach(function (r) {
      left += r.left;
      if (!r.exp) noExp = true; else if (r.exp > exp) exp = r.exp;
      if (r.start && (!start || r.start < start)) start = r.start;
      var ok = !r.start || r.start <= today;
      if (!pick) pick = r;
      else {
        var pOk = !pick.start || pick.start <= today;
        if (ok && (!pOk || (r.start || '') >= (pick.start || ''))) pick = r;
        else if (!ok && !pOk && (r.start || '') < (pick.start || '')) pick = r;
      }
    });
    return { key: k, name: pick.name, toks: ltName_(pick.name).split(' '), short: ltShort_(pick.name), call: ltCall_(pick.name),
             coach: pick.coach, kind: pick.kind || '1:1', pkg: ltPkg_(pick.pkg, pick.total), left: left,
             exp: noExp ? '' : exp, start: start, phone: phoneOf[k] || '', code: pick.code || '' };
  });
}

/** SESSION LOG → điểm danh của tuần: {"Họ tên|yyyy-MM-dd": "done" | "absent"} */
function ltMarks_(days) {
  var ss = ltBa_(), sh = ss.getSheetByName('SESSION LOG'), out = {};
  if (!sh) return out;
  var tz = ss.getSpreadsheetTimeZone(), lastR = sh.getLastRow(), lastC = Math.min(sh.getLastColumn(), 26);
  var hd = ltHeadRow_(sh.getRange(1, 1, Math.min(10, lastR), lastC).getValues(), ['ngay', 'hoc vien', 'trang thai']);
  if (!hd) return out;
  var cD = hd.h.indexOf('ngay'), cN = hd.h.indexOf('hoc vien'), cS = hd.h.indexOf('trang thai');
  var c0 = Math.min(cD, cN, cS), c1 = Math.max(cD, cN, cS), first = hd.r + 2;
  if (lastR < first) return out;
  var v = sh.getRange(first, c0 + 1, lastR - first + 1, c1 - c0 + 1).getValues(), inWeek = {};
  days.forEach(function (d) { inWeek[d] = 1; });
  for (var i = 0; i < v.length; i++) {
    var iso = ltCellIso_(v[i][cD - c0], tz, false);
    if (!inWeek[iso]) continue;
    var name = String(v[i][cN - c0] || '').replace(/\s+/g, ' ').trim(), st = ltName_(v[i][cS - c0]);
    if (!name) continue;
    var k = name + '|' + iso;
    if (st === 'da tap') out[k] = 'done';
    else if (st === 'vang' && out[k] !== 'done') out[k] = 'absent';
  }
  return out;
}

/** TRIAL → khách tập thử chiếm chỗ mỗi khung trong tuần: {"yyyy-MM-dd|h": [coach tiếp nhận, …]}, mỗi khách một mục theo thứ tự
    dòng ("" = chưa giao coach). Dòng Huỷ / Loại không tính. */
function ltTrials_(days) {
  var ss = ltBa_(), sh = ss.getSheetByName('TRIAL'), out = {};
  if (!sh) return out;
  var tz = ss.getSpreadsheetTimeZone(), lastR = sh.getLastRow(), lastC = Math.min(sh.getLastColumn(), 30);
  if (lastR < 2) return out;
  var hd = ltHeadRow_(sh.getRange(1, 1, Math.min(10, lastR), lastC).getValues(), ['trang thai']), cD = -1, cT = -1, cS = -1, cC = -1;
  if (!hd) return out;
  hd.h.forEach(function (x, i) {
    if (cD < 0 && x.indexOf('ngay hen') >= 0) cD = i;
    if (cT < 0 && x.indexOf('gio hen') >= 0) cT = i;
    if (cC < 0 && x.indexOf('coach') >= 0) cC = i;
  });
  cS = hd.h.indexOf('trang thai');
  if (cD < 0 || cT < 0) return out;
  var first = hd.r + 2;
  if (lastR < first) return out;
  var v = sh.getRange(first, 1, lastR - first + 1, lastC).getValues(), inWeek = {};
  days.forEach(function (d) { inWeek[d] = 1; });
  for (var i = 0; i < v.length; i++) {
    var iso = ltCellIso_(v[i][cD], tz, true);
    if (!inWeek[iso]) continue;
    if (/huy|\bloai\b/.test(ltName_(v[i][cS]))) continue;
    var h = ltCellHour_(v[i][cT], tz);
    if (LT.SLOTS.indexOf(h) < 0) continue;
    (out[iso + '|' + h] || (out[iso + '|' + h] = [])).push(cC < 0 ? '' : ltCoach_(v[i][cC]));
  }
  return out;
}

/** B0B ▸ khối "LÝ DO ĐÓNG CỬA | NGÀY" → {yyyy-MM-dd: lý do}. Ngày gõ kiểu Việt (dd/mm/yy). */
function ltClosures_() {
  var ss = ltBa_(), sh = ss.getSheetByName('B0B'), out = {};
  if (!sh) return out;
  var tz = ss.getSpreadsheetTimeZone(), lastR = Math.min(sh.getLastRow(), 150), lastC = Math.min(sh.getLastColumn(), 30);
  if (lastR < 1) return out;
  var v = sh.getRange(1, 1, lastR, lastC).getValues();
  for (var r = 0; r < v.length; r++) {
    var h = v[r].map(ltHdr_), q = -1;
    for (var c = 0; c < h.length; c++) if (h[c].indexOf('ly do dong') === 0) { q = c; break; }
    if (q < 0) continue;
    var dc = -1;
    for (var c2 = q + 1; c2 < h.length; c2++) if (h[c2] === 'ngay') { dc = c2; break; }
    if (dc < 0) dc = q + 1;
    for (var r2 = r + 1; r2 < v.length; r2++) {
      var iso = ltCellIso_(v[r2][dc], tz, true);
      if (iso) out[iso] = String(v[r2][q] || '').trim();
    }
    break;
  }
  return out;
}

/** ⚙️ 2 ▸ "Sức chứa tối đa / khung" */
function ltCap_() {
  var ss = ltBa_(), sh = null;
  ss.getSheets().forEach(function (s) { var n = s.getName().replace(/\s+/g, ''); if (!sh && n.indexOf('\u2699') >= 0 && /2$/.test(n)) sh = s; });
  if (!sh) return LT.CAP;
  var v = sh.getRange(1, 1, Math.min(Math.max(sh.getLastRow(), 1), 60), Math.min(Math.max(sh.getLastColumn(), 1), 8)).getValues();
  for (var r = 0; r < v.length; r++) {
    for (var c = 0; c < v[r].length; c++) {
      if (ltHdr_(v[r][c]).indexOf('suc chua') !== 0) continue;
      for (var c2 = c + 1; c2 < v[r].length; c2++) { var n = Number(v[r][c2]); if (v[r][c2] !== '' && n > 0 && n < 50) return Math.floor(n); }
    }
  }
  return LT.CAP;
}
/** Ô tick của "Lịch coach": ô kiểm (true), hoặc gõ tay x / ✓ / 1 / TRUE. */
function ltTicked_(x) { return x === true || /^(true|x|v|1|\u2713|\u2714)$/i.test(String(x == null ? '' : x).trim()); }
/**
 * Tab "Lịch coach" (file Lịch tập tuần, chủ studio điền — chốt 19/10): mỗi coach một lưới — hàng tiêu đề "<tên coach> | T2 … T7 | CN",
 * dưới đó mỗi hàng một khung giờ ("06:00" … "20:00") với ô tick ở từng thứ; hết hàng có giờ là hết lưới.
 * Trả {khoá coach: {thứ (0 = CN … 6 = T7): {giờ: 1}}}. Coach không có lưới → không có khoá (ltOffAt_: T2–T7 nhận, CN nghỉ — như
 * trước khi có tab). Lưới thứ hai của cùng coach bị bỏ. Giống hệt schedFrom của Worker.
 */
function ltSchedFrom_(vals, tz) {
  var out = {}, keys = LT.DOW.map(function (d) { return ltName_(d); });
  var v = (vals || []).map(function (r) { return (r || []).slice(0, 30); });
  var at = function (row, c) { var x = row && c >= 0 ? row[c] : ''; return x == null ? '' : x; };
  for (var r = 0; r < v.length; r++) {
    var cols = {}, seen = {}, n = 0, first = -1, nameC = -1;
    for (var c = 0; c < v[r].length; c++) {
      var d = keys.indexOf(ltName_(at(v[r], c)));
      if (d >= 0 && !seen[d]) { cols[c] = d; seen[d] = 1; n++; if (first < 0) first = c; }
    }
    if (n < 7) continue;
    for (var c2 = first - 1; c2 >= 0; c2--) if (String(at(v[r], c2)).trim()) { nameC = c2; break; }
    var ck = nameC < 0 ? '' : ltCoachKey_(at(v[r], nameC));
    if (!ck || out[ck]) continue;
    var g = {};
    for (var dd = 0; dd < 7; dd++) g[dd] = {};
    for (var i = r + 1; i < v.length; i++) {
      var h = ltCellHour_(at(v[i], nameC), tz);
      if (h < 0) break;
      if (LT.SLOTS.indexOf(h) < 0) continue;
      for (var cc in cols) if (ltTicked_(at(v[i], +cc))) g[cols[cc]][h] = 1;
    }
    out[ck] = g;
  }
  return out;
}
/** Đọc tab "Lịch coach" của file Lịch tập tuần (không có tab → {}). */
function ltSched_() {
  var ss = ltOut_(), sh = ss.getSheetByName(LT.SCHED);
  if (!sh) return {};
  var lastR = Math.min(sh.getLastRow(), 400), lastC = Math.min(sh.getLastColumn(), 30);
  if (lastR < 1 || lastC < 1) return {};
  return ltSchedFrom_(sh.getRange(1, 1, lastR, lastC).getValues(), ss.getSpreadsheetTimeZone());
}

/* ================================================================== */
/* File Lịch tập tuần                                                   */
/* ================================================================== */

function ltOut_() {
  if (!ltOut_.ss) {
    var props = PropertiesService.getScriptProperties(), id = props.getProperty('LT_OUT_ID');
    if (!id) {
      var it = DriveApp.getFilesByName(LT.OUT_NAME);
      if (!it.hasNext()) throw new Error('thieu_file_lich_tuan');
      id = it.next().getId();
      if (it.hasNext()) throw new Error('trung_ten_file_lich_tuan');
      props.setProperty('LT_OUT_ID', id);
    }
    ltOut_.ss = SpreadsheetApp.openById(id);
  }
  return ltOut_.ss;
}
function ltLogSheet_() {
  var sh = ltOut_().getSheetByName(LT.LOG);
  if (!sh) throw new Error('thieu_tab_so_dat_lich');
  var h = sh.getRange(LT.LOG_HEAD_ROW, LT.LOG_COL, 1, LT.LOG_HEAD.length).getValues()[0];
  for (var i = 0; i < LT.LOG_HEAD.length; i++) if (String(h[i]).trim().normalize('NFC') !== LT.LOG_HEAD[i].normalize('NFC')) throw new Error('so_dat_lich_doi_cot');
  return sh;
}
function ltLogRows_(sh) {
  var first = LT.LOG_HEAD_ROW + 1, last = sh.getLastRow(), out = [];
  if (last < first) return out;
  var tz = ltOut_().getSpreadsheetTimeZone(), v = sh.getRange(first, LT.LOG_COL, last - first + 1, LT.LOG_HEAD.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var x = v[i], code = String(x[0]).trim();
    if (!code) continue;
    var hm = String(ltIsDate_(x[5]) ? Utilities.formatDate(x[5], tz, 'HH:mm') : x[5]).trim();
    out.push({ row: first + i, code: code, ver: Number(x[1]) || 1, week: String(x[2]).trim(), date: ltCellIso_(x[3], tz, true),
               h: /^\d{1,2}:00$/.test(hm) ? parseInt(hm, 10) : -1, name: String(x[6]).trim(), coach: ltCoach_(x[8]),
               kind: String(x[9]).trim(), st: String(x[10]).trim().normalize('NFC'),
               act: String(x[11]).trim().normalize('NFC'), note: String(x[12]).trim().normalize('NFC'), rid: String(x[14]).trim(), kh: String(x[15]).trim() });
  }
  return out;
}

/* ================================================================== */
/* Lõi nghiệp vụ — hàm thuần, không đụng Apps Script (test được)       */
/* ================================================================== */

/** Phiếu của hội viên trong tuần: các dòng "Đã đặt" + số lần đổi + bản phiếu + vết đổi (từ → sang, theo thứ tự ghi).
    Dòng "Mời" / "Từ chối" không phải buổi tập, không đổi bản phiếu — chỉ đếm (acts) để chặn bấm liên tục. "Ghép" không tính lượt đổi. */
function ltMine_(rows, person, ctx) {
  var code = person.key + '-W' + lt2_(ctx.no), list = [], ver = 0, changes = 0, moves = [], acts = 0;
  rows.forEach(function (r) {
    if (r.week !== ctx.key || r.kh !== person.key) return;
    if (r.st === LT.INVITE || r.st === LT.DECLINE) { acts++; return; }
    if (r.ver > ver) ver = r.ver;
    if (r.act === 'Đổi') {
      changes++;
      var from = ltFromNote_(r.note, ctx);
      if (from && r.date && r.h >= 0) moves.push({ from: from, to: { date: r.date, h: r.h } });
    }
    if (r.st === LT.ON && r.date && r.h >= 0) list.push({ date: r.date, h: r.h, row: r.row, note: r.note || '' });
  });
  list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.h - b.h; });
  return { code: code, ver: ver, changes: changes, sessions: list, moves: moves, acts: acts };
}
/** "Đổi từ T6 23.10 · 19:00 …" → {date: ngày trong tuần có dd.mm đó, h: 19}; không đọc được → null. */
function ltFromNote_(note, ctx) {
  var m = String(note || '').match(/Đổi từ\s+\S+\s+(\d{2})\.(\d{2})\s*·\s*(\d{1,2}):00/);
  if (!m) return null;
  for (var i = 0; i < ctx.days.length; i++) if (ltDdMm_(ctx.days[i]) === m[1] + '.' + m[2]) return { date: ctx.days[i], h: +m[3] };
  return null;
}
/**
 * Phòng ở từng khung, tính theo SUẤT COACH (chủ studio chốt 18/10): mỗi coach mỗi khung một suất — một khách 1:1, hoặc một
 * nhóm 1:2 (tối đa 2 khách gói 1:2 của CÙNG coach đó). Phòng tối đa `cap` suất (= số coach dạy cùng lúc): 4 khách 1:1,
 * hay 8 khách 1:2, hay 3 khách 1:1 + một cặp 1:2 = 5 người — đều là đầy. Khách tập thử đã có coach tiếp nhận chiếm suất của
 * coach đó như một khách 1:1 (chủ studio chốt 18/10 — coach không dạy hai việc một lúc); khách tập thử chưa giao coach và dòng
 * sổ không ghi coach: mỗi người một suất riêng. Sổ lệch luật (một coach hai khách 1:1, hoặc 1:1 lẫn 1:2 — dòng sửa tay / ghi trước luật)
 * vẫn tính đủ từng suất, không bao giờ nhét thêm người vào phòng.
 * Trả {"yyyy-MM-dd|h": {u: số suất đã chiếm, x: số suất không coach, c: {khoá coach: [{kh: Mã KH, duo: gói 1:2, name: họ tên trên sổ,
 * i: thứ tự dòng trong sổ}]}}} — i để biết một lời mời có ghi SAU lượt đặt hiện tại của người mời không. Khách tập thử trong nhóm
 * coach: {kh: '', duo: false, name: '', i: -1} — không bao giờ là bạn tập / người được mời, chỉ làm coach bận.
 */
function ltRoom_(rows, ctx, trials) {
  var o = {};
  function at(k) { return o[k] || (o[k] = { u: 0, x: 0, c: {} }); }
  rows.forEach(function (r, i) {
    if (r.week !== ctx.key || r.st !== LT.ON || r.h < 0) return;
    var s = at(r.date + '|' + r.h), ck = ltCoachKey_(r.coach);
    if (!ck) { s.x++; return; }
    (s.c[ck] || (s.c[ck] = [])).push({ kh: r.kh, duo: ltIsDuo_(r.kind), name: r.name, i: i });
  });
  for (var k in trials) trials[k].forEach(function (c) {
    var s = at(k), ck = ltCoachKey_(c);
    if (!ck) { s.x++; return; }
    (s.c[ck] || (s.c[ck] = [])).push({ kh: '', duo: false, name: '', i: -1 });
  });
  for (var k2 in o) {
    var s = o[k2], u = s.x;
    for (var ck in s.c) {
      var g = s.c[ck], two = g.filter(function (e) { return e.duo; }).length;
      u += g.length - two + Math.ceil(two / 2);
    }
    s.u = u;
  }
  return o;
}
/** Số suất đã chiếm mỗi khung (hội viên "Đã đặt" theo coach + khách tập thử). */
function ltTaken_(rows, ctx, trials) {
  var o = ltRoom_(rows, ctx, trials), t = {};
  for (var k in o) t[k] = o[k].u;
  return t;
}
/** Mã KH ở cuối ghi chú dòng mời / từ chối: "Mời K. Cặp Hai · B926DY" → "B926DY"; "Huỷ mời" → "". */
function ltNoteKey_(note) { var s = String(note || ''), i = s.lastIndexOf(' · '); return i < 0 ? '' : s.slice(i + 3).trim(); }
/**
 * Lời mời trong tuần (dòng sau thay dòng trước): inv["người mời|ngày|giờ"] = {to: Mã KH người được mời ('' = đã huỷ), i: thứ tự dòng};
 * dec["người được mời|người mời|ngày|giờ"] = thứ tự dòng "Từ chối" mới nhất.
 */
function ltInvitesOf_(rows, ctx) {
  var inv = {}, dec = {}, seat = {};
  rows.forEach(function (r, i) {
    if (r.week !== ctx.key || !r.date || r.h < 0) return;
    if (r.st === LT.INVITE) inv[r.kh + '|' + r.date + '|' + r.h] = { to: ltNoteKey_(r.note), i: i };
    else if (r.st === LT.DECLINE) dec[r.kh + '|' + ltNoteKey_(r.note) + '|' + r.date + '|' + r.h] = i;
    else if (r.kh) seat[r.kh + '|' + r.date + '|' + r.h] = i;      // dòng đặt mới nhất (kể cả đã đổi đi) của mỗi người ở mỗi khung
  });
  return { inv: inv, dec: dec, seat: seat };
}
/** Lời mời iv (của người mời `from` ở khung k) đã bị người được mời từ chối SAU khi mời chưa. */
function ltDeclinedOf_(inv, iv, from, k) { var d = inv.dec[iv.to + '|' + from + '|' + k]; return d !== undefined && d > iv.i; }
/** Những người khác trong nhóm của coach hội viên ở khung k (bỏ dòng của chính hội viên). */
function ltOthersAt_(env, person, k) {
  var s = env.room ? env.room[k] : null, ck = ltCoachKey_(person.coach), g = s && ck ? s.c[ck] : null;
  return g ? g.filter(function (e) { return e.kh !== person.key; }) : [];
}
/** Dòng "Đã đặt" của chính hội viên ở khung k (trong nhóm coach của mình), không có → null. */
function ltSelfAt_(env, person, k) {
  var s = env.room ? env.room[k] : null, ck = ltCoachKey_(person.coach), g = s && ck ? s.c[ck] : null;
  if (!g) return null;
  for (var i = 0; i < g.length; i++) if (g[i].kh === person.key) return g[i];
  return null;
}
/** Lời mời đang còn của người mời `from` (dòng "Đã đặt" của họ ở khung k là `seat`): ghi SAU lượt đặt hiện tại, chưa huỷ, người được
    mời chưa từng vào khung này sau lời mời (đã vào — kể cả rồi đổi đi — là lời mời đã xong, không hiện lại).
    Trả lời mời (có thể đã bị từ chối — kiểm ltDeclinedOf_) hoặc null. */
function ltLiveInvite_(env, from, seat, k) {
  var iv = env.inv.inv[from + '|' + k];
  if (!iv || !iv.to || !seat || iv.i <= seat.i) return null;
  var a = env.inv.seat[iv.to + '|' + k];                          // người được mời đã vào khung này sau lời mời → lời mời đã xong
  return a !== undefined && a > iv.i ? null : iv;
}
/**
 * Coach của hội viên ở khung k (không tính dòng của chính hội viên): '' rảnh · 'join' coach đang có đúng MỘT khách 1:2 khác
 * và hội viên cũng gói 1:2 → ghép thành cặp, không chiếm thêm suất · 'busy' coach đã kín khung đó với hội viên này.
 */
function ltCoachAt_(env, person, k) {
  var o = ltOthersAt_(env, person, k);
  if (!o.length) return '';
  return ltIsDuo_(person.kind) && o.length === 1 && o[0].duo ? 'join' : 'busy';
}
/** Dời buổi `from` của hội viên 1:2 — đang LẺ (coach chưa có ai khác ở đó) — vào khung `to` có đúng một khách 1:2 cùng coach đang
    chờ → thành cặp: "Ghép", không tính lượt đổi, được dời trong cùng ngày. */
function ltPairMove_(env, person, from, to) {
  return ltIsDuo_(person.kind) && ltCoachAt_(env, person, to.date + '|' + to.h) === 'join' && ltCoachAt_(env, person, from.date + '|' + from.h) === '';
}
/** Khung hết chỗ với hội viên này: phòng đầy hoặc coach bận (máy chủ trả het_cho, trang gợi ý giờ khác). */
function ltIsFull_(w) { return w === 'day' || w === 'coach_ban'; }
/** Vì sao hội viên không đặt được khung này ('' = đặt được). lead: số ms phải báo trước. */
function ltWhy_(ctx, person, env, iso, h, lead) {
  if (ctx.days.indexOf(iso) < 0) return 'ngoai_tuan';
  if (LT.SLOTS.indexOf(h) < 0) return 'gio';
  if (env.closed[iso] !== undefined) return 'nghi';
  if (person.start && iso < person.start) return 'chua_bat_dau';
  if (person.exp && iso > person.exp) return 'het_han';
  if (ltOffAt_(env, person, iso, h)) return 'coach_nghi';                          /* ngoài lịch nhận khách của coach */
  if (ltIsDuo_(person.kind) && LT.DUO_HOURS.indexOf(h) < 0) return 'gio_ghep';     /* gói 1:2: chỉ các khung ghép cố định */
  var t = ltSlotMs_(iso, h);
  if (t <= ctx.now) return 'qua';
  if (lead && t - ctx.now < lead) return 'duoi_12h';
  var k = iso + '|' + h, co = ltCoachAt_(env, person, k);
  if (co === 'join') return '';                            /* vào cặp 1:2 có sẵn của coach: không thêm suất nên phòng đầy vẫn vào được */
  if ((env.taken[k] || 0) >= env.cap) return 'day';
  if (co === 'busy') return 'coach_ban';
  return '';
}
function ltOpenDays_(ctx, person, env, lead, skip) {
  return ctx.days.filter(function (d) {
    if (skip && skip[d]) return false;
    for (var i = 0; i < LT.SLOTS.length; i++) if (!ltWhy_(ctx, person, env, d, LT.SLOTS[i], lead)) return true;
    return false;
  });
}
/** Giới hạn số buổi: đặt mới thì [min, max]; đã có phiếu thì thêm tối đa addMax. */
function ltLimits_(ctx, person, env, mine) {
  var used = {}, upcoming = 0;
  mine.sessions.forEach(function (s) { used[s.date] = 1; if (ltSlotMs_(s.date, s.h) > ctx.now) upcoming++; });
  var free = ltOpenDays_(ctx, person, env, ctx.lead, used).length;
  if (!mine.sessions.length) {
    var max = Math.min(LT.MAX, person.left, free);
    return { min: Math.min(LT.MIN, max), max: max, add: 0, free: free };
  }
  return { min: 0, max: 0, add: Math.max(0, Math.min(LT.MAX - mine.sessions.length, person.left - upcoming, free)), free: free };
}

/** Kiểm tra lượt đặt (đặt mới hoặc thêm buổi). picks: [{date, h}]. Trả {ok} hoặc {error, why, full}. */
function ltCheckBook_(ctx, person, env, mine, picks) {
  if (!Array.isArray(picks) || !picks.length || picks.length > LT.MAX) return { error: 'khong_hop_le', why: 'so_buoi' };
  var lim = ltLimits_(ctx, person, env, mine), seen = {}, full = [];
  mine.sessions.forEach(function (s) { seen[s.date] = 1; });
  for (var i = 0; i < picks.length; i++) {
    var p = picks[i];
    if (!p || !ltValidIso_(p.date) || LT.SLOTS.indexOf(p.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
    if (seen[p.date]) return { error: 'khong_hop_le', why: 'mot_ngay_mot_buoi' };
    seen[p.date] = 1;
    var w = ltWhy_(ctx, person, env, p.date, p.h, ctx.lead);
    if (ltIsFull_(w)) full.push({ date: p.date, h: p.h });
    else if (w) return { error: 'khong_hop_le', why: w, date: p.date, h: p.h };
  }
  if (mine.sessions.length) {
    if (picks.length > lim.add) return { error: 'khong_hop_le', why: 'qua_so_buoi' };
  } else {
    if (picks.length > lim.max) return { error: 'khong_hop_le', why: 'qua_so_buoi' };
    if (picks.length < lim.min) return { error: 'khong_hop_le', why: 'it_hon_toi_thieu' };
  }
  if (full.length) return { error: 'het_cho', full: full };
  return { ok: true };
}
/**
 * Kiểm tra đổi buổi: từ buổi `from` (cách hiện tại ≥ 24 giờ) sang khung `to` (ngày khác, cùng tuần, cách hiện tại ≥ 12 giờ như đặt lịch).
 * Gói 1:2: dời một buổi đang lẻ vào cặp đang chờ (ltPairMove_) không tính lượt đổi — còn làm được khi đã hết lượt, và được dời
 * trong cùng ngày. Trả {ok, cur, pair} — pair: ghi "Ghép" thay "Đổi".
 */
function ltCheckChange_(ctx, person, env, mine, from, to) {
  var duo = ltIsDuo_(person.kind);
  if (!duo && mine.changes >= LT.CHANGES) return { error: 'het_luot_doi' };
  if (!from || !to || !ltValidIso_(from.date) || !ltValidIso_(to.date) || LT.SLOTS.indexOf(to.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  var cur = null;
  mine.sessions.forEach(function (s) { if (s.date === from.date && s.h === from.h) cur = s; });
  if (!cur) return { error: 'khong_hop_le', why: 'khong_co_buoi' };
  var pair = duo && ltPairMove_(env, person, cur, to);
  if (!pair && mine.changes >= LT.CHANGES) return { error: 'het_luot_doi' };
  if (ltSlotMs_(cur.date, cur.h) - ctx.now < LT.CHG_LEAD) return { error: 'khong_hop_le', why: 'buoi_duoi_24h' };
  if (to.date === from.date && !pair) return { error: 'khong_hop_le', why: 'cung_ngay' };
  for (var i = 0; i < mine.sessions.length; i++) if (mine.sessions[i].date === to.date && mine.sessions[i] !== cur) return { error: 'khong_hop_le', why: 'mot_ngay_mot_buoi' };
  var w = ltWhy_(ctx, person, env, to.date, to.h, LT.LEAD);
  if (ltIsFull_(w)) return { error: 'het_cho', full: [{ date: to.date, h: to.h }] };
  if (w) return { error: 'khong_hop_le', why: w };
  return { ok: true, cur: cur, pair: pair };
}
/**
 * Kiểm lời mời: người mời (gói 1:2) có buổi ở khung ghép `slot`, đang chờ một mình, khung còn đặt được; to = hội viên được mời
 * (gói 1:2, cùng coach, không phải chính mình) hoặc null = huỷ lời mời. noop: không cần ghi gì (mời lại đúng người đang được
 * mời, hay huỷ khi chưa mời ai).
 */
function ltCheckInvite_(ctx, person, env, mine, slot, to) {
  if (!ltIsDuo_(person.kind)) return { error: 'khong_hop_le', why: 'goi' };
  if (!slot || !ltValidIso_(slot.date) || LT.DUO_HOURS.indexOf(slot.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  if (!mine.sessions.some(function (s) { return s.date === slot.date && s.h === slot.h; })) return { error: 'khong_hop_le', why: 'khong_co_buoi' };
  var t = ltSlotMs_(slot.date, slot.h), k = slot.date + '|' + slot.h;
  if (t <= ctx.now) return { error: 'khong_hop_le', why: 'qua' };
  if (ctx.lead && t - ctx.now < ctx.lead) return { error: 'khong_hop_le', why: 'duoi_12h' };
  if (ltOthersAt_(env, person, k).length) return { error: 'da_ghep' };
  if (mine.acts >= LT.INVITE_MAX) return { error: 'qua_luot_moi' };
  var cur = ltLiveInvite_(env, person.key, ltSelfAt_(env, person, k), k);
  if (to) {
    if (to.key === person.key || !ltIsDuo_(to.kind) || ltCoachKey_(to.coach) !== ltCoachKey_(person.coach)) return { error: 'khong_hop_le', why: 'nguoi_moi' };
    if (cur && cur.to === to.key && !ltDeclinedOf_(env.inv, cur, person.key, k)) return { ok: true, noop: true };
  } else if (!cur) return { ok: true, noop: true };
  return { ok: true };
}
/** Từ chối lời mời ở khung `slot`: tìm người đang chờ một mình trong nhóm coach của hội viên ở khung đó và đang mời hội viên.
    Không còn lời mời nào như vậy (người mời đã dời, đã có người vào, đã từ chối) → noop. Trả {ok, from: {kh, name}}. */
function ltCheckDecline_(ctx, person, env, slot) {
  if (!ltIsDuo_(person.kind)) return { error: 'khong_hop_le', why: 'goi' };
  if (!slot || !ltValidIso_(slot.date) || LT.SLOTS.indexOf(slot.h) < 0) return { error: 'khong_hop_le', why: 'khung' };
  var k = slot.date + '|' + slot.h, o = ltOthersAt_(env, person, k);
  if (o.length !== 1 || !o[0].duo) return { ok: true, noop: true };
  var iv = ltLiveInvite_(env, o[0].kh, o[0], k);
  if (!iv || iv.to !== person.key || ltDeclinedOf_(env.inv, iv, o[0].kh, k)) return { ok: true, noop: true };
  return { ok: true, from: { kh: o[0].kh, name: o[0].name } };
}

/**
 * Còn khung nào đặt được tuần này không (bỏ qua chỗ trống) — dùng cho màn chưa mở. Khung chỉ tính khi ít nhất một coach của các
 * hội viên còn gói nhận khách ở đó (tab "Lịch coach"; coach chưa có lưới: T2–T7). Từ luật báo trước 12 giờ, khung Chủ Nhật của tuần
 * đang chạy còn trong hạn suốt tối thứ Bảy — mà mặc định coach nghỉ Chủ Nhật — nên phải xét lịch coach, không thì màn đếm ngược tới
 * 06:00 Chủ Nhật không bao giờ hiện. persons rỗng / không có → xét như một coach chưa có lưới.
 */
function ltAnyOpen_(ctx, closed, sched, persons) {
  var env = { sched: sched || {} }, seen = {}, coaches = [];
  (persons || []).forEach(function (p) { var k = ltCoachKey_(p.coach); if (!seen[k]) { seen[k] = 1; coaches.push({ coach: p.coach }); } });
  if (!coaches.length) coaches.push({ coach: '' });
  for (var i = 0; i < ctx.days.length; i++) {
    var d = ctx.days[i];
    if (closed[d] !== undefined) continue;
    for (var j = 0; j < LT.SLOTS.length; j++) {
      var h = LT.SLOTS[j], t = ltSlotMs_(d, h);
      if (t > ctx.now && (!ctx.lead || t - ctx.now >= ctx.lead) && coaches.some(function (c) { return !ltOffAt_(env, c, d, h); })) return true;
    }
  }
  return false;
}

/** Tên gọi / tên ngắn của một người trên sổ: lấy theo danh sách hội viên hiện tại (Mã KH), không có thì theo họ tên ghi trên sổ. */
function ltCallOf_(kh, name, persons) { var p = persons ? ltFindPerson_(persons, kh) : null; return p ? p.call : ltCall_(name); }
function ltShortOf_(kh, name, persons) { var p = persons ? ltFindPerson_(persons, kh) : null; return p ? p.short : ltShort_(name); }
/**
 * Phần riêng gói 1:2 trong state (chủ studio chốt 18/10 14:13 — khách 1:2 thấy tên bạn tập cùng coach):
 *  duoHours: các khung ghép · wait: {khung: tên gọi người đang chờ ghép} (khung còn tới, coach của mình, chưa có mình) ·
 *  pairs: {buổi của mình: tên gọi bạn tập} · invOut: {buổi đang lẻ của mình: {to: tên gọi người được mời, st: 'wait' | 'no'}} ·
 *  invIn: [{date, h, from: tên gọi}] lời mời gửi mình còn nhận được · peers: [{key, short, call}] khách 1:2 cùng coach để mời
 *  (ltPeerIds_ đổi key → id trước khi trả, không bao giờ lộ Mã KH).
 */
function ltDuoState_(ctx, person, env, mine, persons) {
  var wait = {}, pairs = {}, invOut = {}, invIn = [], mineAt = {}, ck = ltCoachKey_(person.coach);
  mine.sessions.forEach(function (s) { mineAt[s.date + '|' + s.h] = 1; });
  ctx.days.forEach(function (d) {
    LT.DUO_HOURS.forEach(function (h) {
      var k = d + '|' + h, o = ltOthersAt_(env, person, k);
      if (mineAt[k] || ltSlotMs_(d, h) <= ctx.now || o.length !== 1 || !o[0].duo) return;
      wait[k] = ltCallOf_(o[0].kh, o[0].name, persons);
      var iv = ltLiveInvite_(env, o[0].kh, o[0], k);
      if (iv && iv.to === person.key && !ltDeclinedOf_(env.inv, iv, o[0].kh, k) && ltWhy_(ctx, person, env, d, h, ctx.lead) === '') {
        invIn.push({ date: d, h: h, from: wait[k] });
      }
    });
  });
  mine.sessions.forEach(function (s) {
    var k = s.date + '|' + s.h, o = ltOthersAt_(env, person, k);
    if (o.length === 1 && o[0].duo) { pairs[k] = ltCallOf_(o[0].kh, o[0].name, persons); return; }
    if (o.length || ltSlotMs_(s.date, s.h) <= ctx.now) return;
    var iv = ltLiveInvite_(env, person.key, ltSelfAt_(env, person, k), k), p = iv && persons ? ltFindPerson_(persons, iv.to) : null;
    if (p) invOut[k] = { to: p.call, st: ltDeclinedOf_(env.inv, iv, person.key, k) ? 'no' : 'wait' };
  });
  var peers = (persons || []).filter(function (p) { return p.key !== person.key && ltIsDuo_(p.kind) && ltCoachKey_(p.coach) === ck; })
    .map(function (p) { return { key: p.key, short: p.short, call: p.call }; })
    .sort(function (a, b) { return a.short.localeCompare(b.short, 'vi') || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
  return { duoHours: LT.DUO_HOURS, wait: wait, pairs: pairs, invOut: invOut, invIn: invIn, peers: peers };
}
/** Gói 1:2: danh sách bạn để mời mang Mã KH → đổi sang id (như lt_find) trước khi trả cho trình duyệt. */
function ltPeerIds_(st) {
  if (st && st.duo && st.duo.peers) st.duo.peers = st.duo.peers.map(function (x) { return { id: ltIdOf_(x.key), short: x.short, call: x.call }; });
  return st;
}
/** Gói thông tin trả cho trình duyệt (không có SĐT; tên người khác chỉ có ở phần gói 1:2 — bạn tập cùng coach). persons: danh sách
    hội viên còn hiệu lực (gói 1:2 cần để lấy tên gọi + danh sách mời). */
function ltStateOf_(ctx, person, env, mine, marks, persons) {
  var lim = ltLimits_(ctx, person, env, mine), closed = {}, taken = {}, co = {};
  ctx.days.forEach(function (d) {
    if (env.closed[d] !== undefined) closed[d] = env.closed[d] || 'Phòng nghỉ';
    LT.SLOTS.forEach(function (h) {
      var k = d + '|' + h, n = env.taken[k] || 0, c = ltOffAt_(env, person, d, h) ? 'off' : ltCoachAt_(env, person, k);
      if (n) taken[k] = n;
      if (c) co[k] = c;                                     /* coach của chính hội viên: 'off' nghỉ · 'busy' · 'join' (không lộ ai đặt) */
    });
  });
  var sessions = mine.sessions.map(function (s) {
    var past = ltSlotMs_(s.date, s.h) <= ctx.now, m = s.date <= ctx.today ? marks[person.name + '|' + s.date] : undefined;   /* điểm danh chỉ tính tới hôm nay */
    return { date: s.date, h: s.h, st: m === 'done' ? 'done' : m === 'absent' ? 'absent' : past ? 'past' : 'on' };
  });
  var mode = sessions.length ? 'ticket' : (lim.max > 0 ? 'book' : 'closed');
  var out = {
    ok: true, auth: true, now: ctx.now, mode: mode,
    week: { key: ctx.key, no: ctx.no, mon: ctx.mon, days: ctx.days, phase: ctx.phase, lead: ctx.lead > 0,
            nextOpen: ctx.nextOpen, nextNo: ctx.nextNo, closed: closed },
    cap: env.cap, taken: taken, coachAt: co, slots: LT.SLOTS,
    me: { short: person.short, call: person.call, coach: person.coach, kind: person.kind, pkg: person.pkg,
          left: person.left, exp: person.exp, start: person.start },
    mine: { code: mine.code, ver: mine.ver, changes: mine.changes, changesLeft: Math.max(0, LT.CHANGES - mine.changes), sessions: sessions,
            moves: (mine.moves || []).map(function (x) { return { from: { date: x.from.date, h: x.from.h }, to: { date: x.to.date, h: x.to.h } }; }) },
    limits: { min: lim.min, max: lim.max, add: lim.add }
  };
  if (ltIsDuo_(person.kind)) out.duo = ltDuoState_(ctx, person, env, mine, persons);
  return out;
}

/* ================================================================== */
/* Bảo mật: mã nhớ máy (HMAC), khoá khi sai mã, giới hạn tìm tên        */
/* ================================================================== */

function ltSecret_() {
  if (ltSecret_.v) return ltSecret_.v;
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('LT_SECRET');
  if (!s) {
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { s = p.getProperty('LT_SECRET'); if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('LT_SECRET', s); } }
    finally { lock.releaseLock(); }
  }
  return (ltSecret_.v = s);
}
function ltB64_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function ltMac_(s) { return ltB64_(Utilities.computeHmacSha256Signature(s, ltSecret_())).slice(0, 32); }
function ltIdOf_(key) { return ltMac_('id:' + key).slice(0, 18); }
function ltTokMake_(key, dev, ttl, now) {
  var body = ltB64_(JSON.stringify({ k: key, d: dev, e: now + ttl, v: 1 }));
  return body + '.' + ltMac_('tok:' + body);
}
function ltTokRead_(tok, dev, now) {
  var t = String(tok || ''), i = t.indexOf('.');
  if (i < 8 || t.length > 600) return null;
  var body = t.slice(0, i);
  if (t.slice(i + 1) !== ltMac_('tok:' + body)) return null;
  var o = null;
  try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body + '==='.slice((body.length + 3) % 4))).getDataAsString()); } catch (e) { return null; }
  if (!o || o.v !== 1 || o.d !== dev || !(o.e > now) || !o.k) return null;
  return o;
}
function ltDevOk_(d) { return /^[A-Za-z0-9_-]{16,64}$/.test(String(d || '')); }
function ltCache_() { return CacheService.getScriptCache(); }
function ltBump_(key, ttl) { var c = ltCache_(), n = (Number(c.get(key)) || 0) + 1; c.put(key, String(n), ttl); return n; }

/* ================================================================== */
/* Nạp dữ liệu (có bộ nhớ đệm ngắn cho lượt XEM; lượt GHI luôn đọc mới) */
/* ================================================================== */

function ltCached_(key, ttl, fn) {
  var c = ltCache_(), hit = c.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* đọc lại */ } }
  var v = fn();
  try { c.put(key, JSON.stringify(v), ttl); } catch (e) { /* quá cỡ thì thôi */ }
  return v;
}
function ltPersonsNow_(ctx, fresh) {
  var rows = fresh ? ltMemberRows_() : ltCached_('lt:mem', 60, ltMemberRows_);
  return ltPersons_(rows, ctx.today);
}
function ltClosedNow_() { return ltCached_('lt:closed', 600, ltClosures_); }
function ltCapNow_() { return ltCached_('lt:cap', 600, ltCap_); }
function ltFindPerson_(persons, key) { for (var i = 0; i < persons.length; i++) if (persons[i].key === key) return persons[i]; return null; }

/** Ghi danh sách hội viên còn hiệu lực sang tab ẩn _dữ liệu (để Bảng lịch tập liệt kê "Chưa đặt lịch"). Tối đa 10 phút/lần. */
function ltSnapshot_(persons, cap, now) {
  var c = ltCache_();
  if (c.get('lt:snap')) return;
  c.put('lt:snap', '1', 600);
  try {
    var sh = ltOut_().getSheetByName(LT.DATA);
    if (!sh) return;
    var rows = persons.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); })
      .map(function (p) { return [p.name, p.short, p.coach, p.left, p.exp, p.key, p.short + ' · ' + ltInitials_(p.coach)]; });
    sh.getRange(1, 2, 2, 1).setValues([[cap], [ltStamp_(now)]]);
    var last = sh.getLastRow();
    if (last >= 5) sh.getRange(5, 1, last - 4, 7).clearContent();
    if (rows.length) sh.getRange(5, 1, rows.length, 7).setNumberFormat('@').setValues(rows.map(function (r) { return r.map(String); }));
  } catch (e) { c.remove('lt:snap'); }
}

/** sched: lịch nhận khách của coach (ltSchedFrom_) — không có thì {} (mọi coach theo mặc định của ltOffAt_). */
function ltEnv_(ctx, rows, trials, closed, cap, sched) {
  var room = ltRoom_(rows, ctx, trials), t = {};
  for (var k in room) t[k] = room[k].u;
  return { closed: closed, cap: cap, taken: t, room: room, inv: ltInvitesOf_(rows, ctx), sched: sched || {} };
}
/** Coach của hội viên không nhận khách ở khung này (tab "Lịch coach"). Coach chưa có lưới: T2–T7 nhận đủ giờ, CN nghỉ. */
function ltOffAt_(env, person, iso, h) {
  var ck = ltCoachKey_(person.coach), g = env.sched && ck ? env.sched[ck] : null, d = ltDowOf_(iso);
  if (!g) return d === 0;
  return !(g[d] && g[d][h]);
}

/** Đọc mọi thứ và dựng state cho một hội viên (lượt XEM). */
function ltLoadState_(ctx, person, persons) {
  var closed = ltClosedNow_(), cap = ltCapNow_(), sched = ltCached_('lt:sc', 60, ltSched_);
  var rows = ltLogRows_(ltLogSheet_());
  var trials = ltCached_('lt:tr2:' + ctx.key, 30, function () { return ltTrials_(ctx.days); });   /* tr2: mỗi khung là danh sách coach (bản cũ: số) */
  var marks = ltCached_('lt:mk:' + ctx.key, 60, function () { return ltMarks_(ctx.days); });
  if (persons) ltSnapshot_(persons, cap, ctx.now);
  return ltPeerIds_(ltStateOf_(ctx, person, ltEnv_(ctx, rows, trials, closed, cap, sched), ltMine_(rows, person, ctx), marks, persons));
}

/* ================================================================== */
/* API                                                                  */
/* ================================================================== */

function ltDoPost_(p) {
  var now = Date.now();
  try {
    var a = String(p.action || '');
    if (a === 'lt_ping') return { ok: true, now: now };
    if (!ltDevOk_(p.dev)) return { ok: false, error: 'thieu_may', now: now };
    if (a === 'lt_boot') return ltApiBoot_(p, now);
    if (a === 'lt_find') return ltApiFind_(p, now);
    if (a === 'lt_verify') return ltApiVerify_(p, now);
    if (a === 'lt_book') return ltApiBook_(p, now);
    if (a === 'lt_change') return ltApiChange_(p, now);
    if (a === 'lt_invite') return ltApiInvite_(p, now);
    if (a === 'lt_decline') return ltApiDecline_(p, now);
    return { ok: false, error: 'unknown_action', now: now };
  } catch (e) {
    return { ok: false, error: 'loi_he_thong', detail: String(e && e.message || e).slice(0, 120), now: now };
  }
}

/** Mở trang: có mã nhớ máy hợp lệ → state của hội viên; không có → thông tin tuần (để hiện màn tìm tên hoặc đếm ngược). */
function ltApiBoot_(p, now) {
  var ctx = ltWeekCtx_(now);
  if (p.tok) {
    var t = ltTokRead_(p.tok, p.dev, now);
    if (t) {
      var persons = ltPersonsNow_(ctx, false), me = ltFindPerson_(persons, t.k);
      if (me) return ltLoadState_(ctx, me, persons);
      return ltPublic_(ctx, 'het_goi');
    }
    return ltPublic_(ctx, 'het_phien');
  }
  return ltPublic_(ctx, '');
}
function ltPublic_(ctx, why) {
  var closed = ltClosedNow_(), sched = ltCached_('lt:sc', 60, ltSched_);
  return { ok: true, auth: false, why: why, now: ctx.now, open: ltAnyOpen_(ctx, closed, sched, ltPersonsNow_(ctx, false)),
           week: { key: ctx.key, no: ctx.no, mon: ctx.mon, days: ctx.days, phase: ctx.phase, lead: ctx.lead > 0, nextOpen: ctx.nextOpen, nextNo: ctx.nextNo } };
}

/** Tìm tên gõ tới đâu ra tới đó (từ 1 ký tự, có dấu hay không dấu đều được; luật ở ltFindRank_). Trả tối đa 6 người,
    nhiều hơn thì kèm more: true để trang nhắc gõ thêm. */
function ltApiFind_(p, now) {
  /* đếm theo khung 10 phút cố định (khoá theo mốc khung): đang bị chặn mà gõ tiếp cũng không kéo dài khoá quá hết khung */
  if (ltBump_('lt:q:' + p.dev + ':' + Math.floor(now / 6e5), 600) > LT.FIND_MAX) return { ok: false, error: 'cham_lai', now: now };
  var q = ltName_(String(p.q || '').slice(0, 60)).split(' ').filter(function (x) { return !!x; });
  if (!q.length) return { ok: true, now: now, results: [] };
  var ctx = ltWeekCtx_(now), res = ltFindAll_(q, ltPersonsNow_(ctx, false));
  var out = res.slice(0, LT.FIND_TOP).map(function (x) { return { id: ltIdOf_(x.key), short: x.short, coach: x.coach }; });
  return res.length > LT.FIND_TOP ? { ok: true, now: now, results: out, more: true } : { ok: true, now: now, results: out };
}

/** Xác minh 4 số cuối điện thoại. Sai 5 lần → khoá MÁY 15 phút; sai 20 lần/giờ trên một tên → khoá TÊN 15 phút. */
function ltApiVerify_(p, now) {
  var c = ltCache_(), lockKey = 'lt:lk:' + p.dev, until = Number(c.get(lockKey)) || 0;
  if (until > now) return { ok: false, error: 'khoa', until: until, now: now };
  var ctx = ltWeekCtx_(now), persons = ltPersonsNow_(ctx, false), me = null, id = String(p.id || '');
  persons.forEach(function (x) { if (!me && ltIdOf_(x.key) === id) me = x; });
  if (!me) return { ok: false, error: 'khong_thay', now: now };
  var memKey = 'lt:lm:' + ltIdOf_(me.key), mUntil = Number(c.get(memKey)) || 0;
  if (mUntil > now) return { ok: false, error: 'khoa', until: mUntil, now: now };
  if (me.phone.length < 4) return { ok: false, error: 'chua_co_sdt', now: now };
  var pin = ltDigits_(p.pin);
  if (pin.length !== 4 || pin !== me.phone.slice(-4)) {
    var n = ltBump_('lt:fd:' + p.dev, LT.LOCK_S), m = ltBump_('lt:fm:' + ltIdOf_(me.key), 3600);
    if (m >= LT.MEMBER_FAILS) { c.put(memKey, String(now + LT.LOCK_S * 1000), LT.LOCK_S); c.remove('lt:fm:' + ltIdOf_(me.key)); }
    if (n >= LT.FAILS) {
      c.put(lockKey, String(now + LT.LOCK_S * 1000), LT.LOCK_S);
      c.remove('lt:fd:' + p.dev);
      return { ok: false, error: 'khoa', until: now + LT.LOCK_S * 1000, now: now };
    }
    return { ok: false, error: 'sai_ma', left: LT.FAILS - n, now: now };
  }
  c.remove('lt:fd:' + p.dev);
  var ttl = p.remember ? LT.REMEMBER : LT.SESSION, st = ltLoadState_(ctx, me, persons);
  st.tok = ltTokMake_(me.key, p.dev, ttl, now);
  st.tokExp = now + ttl;
  return st;
}

function ltAuth_(p, now) {
  var t = ltTokRead_(p.tok, p.dev, now);
  return t ? t.k : null;
}

/** Đặt lịch (đặt mới hoặc thêm buổi). p: {tok, dev, rid, week, picks: [{date, h}]} */
function ltApiBook_(p, now) {
  var pre = ltPre_(p, now);
  if (pre.out) return pre.out;
  var picks = (Array.isArray(p.picks) ? p.picks : []).slice(0, 8).map(function (x) { return { date: String(x && x.date || ''), h: Number(x && x.h) }; });
  return ltLocked_(pre, p, function (ctx, sh, rows, env, mine) {
    var chk = ltCheckBook_(ctx, pre.me, env, mine, picks);
    if (!chk.ok) return chk;
    var ver = mine.ver + 1, act = mine.sessions.length ? 'Thêm' : 'Đặt', stamp = ltStamp_(ctx.now);
    ltAppend_(sh, picks.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (x) {
      return ltLogRow_(mine.code, ver, ctx.key, x, pre.me, act, '', stamp, pre.rid);
    }));
    return { ok: true };
  });
}

/** Đổi buổi. p: {tok, dev, rid, week, from: {date, h}, to: {date, h}} */
function ltApiChange_(p, now) {
  var pre = ltPre_(p, now);
  if (pre.out) return pre.out;
  var from = { date: String(p.from && p.from.date || ''), h: Number(p.from && p.from.h) };
  var to = { date: String(p.to && p.to.date || ''), h: Number(p.to && p.to.h) };
  return ltLocked_(pre, p, function (ctx, sh, rows, env, mine) {
    var chk = ltCheckChange_(ctx, pre.me, env, mine, from, to);
    if (!chk.ok) return chk;
    /* gói 1:2 dời buổi đang lẻ vào cặp đang chờ: "Ghép" (không tính lượt đổi), còn lại "Đổi" như trước */
    var stamp = ltStamp_(ctx.now), ver = mine.ver + 1, cols = LT.LOG_HEAD, act = chk.pair ? LT.PAIR : 'Đổi';
    var lbl = function (x) { return LT.DOW[ltDowOf_(x.date)] + ' ' + ltDdMm_(x.date) + ' · ' + ltHm_(x.h); };
    sh.getRange(chk.cur.row, LT.LOG_COL + cols.indexOf('Trạng thái')).setValue(LT.MOVED);
    sh.getRange(chk.cur.row, LT.LOG_COL + cols.indexOf('Ghi chú')).setValue((chk.cur.note ? chk.cur.note + ' · ' : '') + act + ' sang ' + lbl(to));
    ltAppend_(sh, [ltLogRow_(mine.code, ver, ctx.key, to, pre.me, act, act + ' từ ' + lbl(from), stamp, pre.rid)]);
    return { ok: true };
  });
}

/** Gói 1:2 · mời một bạn cùng coach vào buổi đang chờ ghép. p: {tok, dev, rid, week, date, h, to: id ('' = huỷ lời mời)} */
function ltApiInvite_(p, now) {
  var pre = ltPre_(p, now);
  if (pre.out) return pre.out;
  var slot = { date: String(p.date || ''), h: Number(p.h) }, id = String(p.to || ''), to = null;
  if (id) {
    pre.persons.forEach(function (x) { if (!to && ltIdOf_(x.key) === id) to = x; });
    if (!to) return { ok: false, error: 'khong_hop_le', why: 'nguoi_moi', now: now };
  }
  return ltLocked_(pre, p, function (ctx, sh, rows, env, mine) {
    var chk = ltCheckInvite_(ctx, pre.me, env, mine, slot, to);
    if (!chk.ok || chk.noop) return chk.ok ? { ok: true } : chk;
    ltAppend_(sh, [ltInviteRow_(mine.code, mine.ver, ctx.key, slot, pre.me, to, ltStamp_(ctx.now), pre.rid)]);
    return { ok: true };
  });
}
/** Gói 1:2 · không nhận lời mời ở khung date/h. p: {tok, dev, rid, week, date, h} */
function ltApiDecline_(p, now) {
  var pre = ltPre_(p, now);
  if (pre.out) return pre.out;
  var slot = { date: String(p.date || ''), h: Number(p.h) };
  return ltLocked_(pre, p, function (ctx, sh, rows, env, mine) {
    var chk = ltCheckDecline_(ctx, pre.me, env, slot);
    if (!chk.ok || chk.noop) return chk.ok ? { ok: true } : chk;
    var f = chk.from;
    ltAppend_(sh, [ltDeclineRow_(mine.code, mine.ver, ctx.key, slot, pre.me, ltShortOf_(f.kh, f.name, pre.persons), f.kh, ltStamp_(ctx.now), pre.rid)]);
    return { ok: true };
  });
}

/** Kiểm phiên + mã yêu cầu + hội viên (đọc MỚI, không dùng bộ nhớ đệm) — trước khi khoá. */
function ltPre_(p, now) {
  var key = ltAuth_(p, now);
  if (!key) return { out: { ok: false, error: 'het_phien', now: now } };
  var rid = String(p.rid || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(rid)) return { out: { ok: false, error: 'khong_hop_le', why: 'rid', now: now } };
  var ctx = ltWeekCtx_(now), persons = ltPersonsNow_(ctx, true), me = ltFindPerson_(persons, key);
  if (!me) return { out: { ok: false, error: 'het_goi', now: now } };
  return { rid: rid, me: me, persons: persons, closed: ltClosures_(), cap: ltCap_(), sched: ltSched_() };
}

/** Đoạn ghi trong LockService: đọc sổ + tập thử MỚI, kiểm, ghi. Nhả khoá rồi mới dựng phản hồi. */
/**
 * Bản phiếu khách đang xem (base) đã cũ: phiếu trên sổ đã lên bản khác kể từ lúc khách xem → không ghi (ban_cu).
 * Chặn việc một lệnh mất phản hồi đã vào sổ rồi khách gửi thêm một lựa chọn khác (thành thêm buổi ngoài ý muốn).
 * Không gửi base (máy khách cũ) → không kiểm, như trước.
 */
function ltBaseStale_(base, m) { return base !== undefined && base !== null && base !== '' && Number(base) !== m.ver; }
function ltLocked_(pre, p, write) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(28000)) return { ok: false, error: 'he_thong_ban', now: Date.now() };
  var ctx, rows, trials, res;
  try {
    ctx = ltWeekCtx_(Date.now());
    var sh = ltLogSheet_();
    rows = ltLogRows_(sh);
    for (var i = 0; i < rows.length; i++) if (rows[i].rid === pre.rid) { res = { ok: true, dup: true }; break; }
    if (!res && String(p.week || '') !== ctx.key) res = { error: 'tuan_doi' };
    if (!res) {
      trials = ltTrials_(ctx.days);
      var mine = ltMine_(rows, pre.me, ctx);
      if (ltBaseStale_(p.base, mine)) res = { error: 'ban_cu' };
      else {
        res = write(ctx, sh, rows, ltEnv_(ctx, rows, trials, pre.closed, pre.cap, pre.sched), mine);
        if (res.ok) { SpreadsheetApp.flush(); rows = ltLogRows_(sh); }
      }
    }
  } finally {
    lock.releaseLock();
  }
  if (!trials) trials = ltTrials_(ctx.days);
  var st = ltPeerIds_(ltStateOf_(ctx, pre.me, ltEnv_(ctx, rows, trials, pre.closed, pre.cap, pre.sched), ltMine_(rows, pre.me, ctx), ltMarks_(ctx.days), pre.persons));
  if (res.dup) st.dup = true;
  if (!res.ok) {
    st.ok = false;
    st.error = res.error;
    if (res.why) st.why = res.why;
    if (res.date) { st.date = res.date; st.h = res.h; }       /* khung bị từ chối → trang gọi đúng tên khung */
    if (res.full) st.full = res.full;
  }
  return st;
}

function ltLogRow_(code, ver, week, x, me, act, note, stamp, rid) {
  return [code, ver, week, x.date, LT.DOW[ltDowOf_(x.date)], ltHm_(x.h), me.name, me.short, me.coach, me.kind,
          LT.ON, act, note, stamp, rid, me.key, me.short + ' · ' + ltInitials_(me.coach)];
}
/** Dòng sổ lời mời (17 cột như ltLogRow_): Trạng thái + Thao tác "Mời", ghi chú "Mời <tên ngắn> · <Mã KH>" hoặc "Huỷ mời". Bản phiếu
    giữ nguyên (lời mời không đổi phiếu). */
function ltInviteRow_(code, ver, week, slot, me, to, stamp, rid) {
  return [code, ver, week, slot.date, LT.DOW[ltDowOf_(slot.date)], ltHm_(slot.h), me.name, me.short, me.coach, me.kind,
          LT.INVITE, LT.INVITE, to ? LT.INVITE + ' ' + to.short + ' · ' + to.key : 'Huỷ mời', stamp, rid, me.key, me.short + ' · ' + ltInitials_(me.coach)];
}
/** Dòng sổ từ chối lời mời: của người được mời, ở khung được mời, ghi chú "Từ chối lời mời của <tên ngắn người mời> · <Mã KH>". */
function ltDeclineRow_(code, ver, week, slot, me, fromShort, fromKey, stamp, rid) {
  return [code, ver, week, slot.date, LT.DOW[ltDowOf_(slot.date)], ltHm_(slot.h), me.name, me.short, me.coach, me.kind,
          LT.DECLINE, LT.DECLINE, 'Từ chối lời mời của ' + fromShort + ' · ' + fromKey, stamp, rid, me.key, me.short + ' · ' + ltInitials_(me.coach)];
}
function ltAppend_(sh, rows) {
  if (!rows.length) return;
  var first = LT.LOG_HEAD_ROW + 1, at = Math.max(sh.getLastRow() + 1, first);
  var rg = sh.getRange(at, LT.LOG_COL, rows.length, LT.LOG_HEAD.length);
  rg.setNumberFormat('@');
  rg.setValues(rows.map(function (r) { return r.map(function (v) { return typeof v === 'number' ? String(v) : v; }); }));
  sh.getRange(at, LT.LOG_COL + 1, rows.length, 1).setNumberFormat('0').setValues(rows.map(function (r) { return [r[1]]; }));
}
