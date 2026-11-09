/* =====================================================================
   B0DY · "Để B0DY kể về bạn" — lõi câu chuyện (ke-core.js)
   Hàm thuần, không đụng DOM: chạy được trong trình duyệt (window.KE) lẫn Node (require) để test.

   · KE.derive(story)  → mô hình (số đã tính sẵn) từ dữ liệu câu chuyện máy chủ trả (lt_story · dạng v1, xem worker/README.md).
                          Dữ liệu không đủ để kể (dưới 12 buổi hoặc dưới 4 tuần) / hỏng → null: trang không hiện thẻ, không mở hành trình.
   · KE.script(M, next) → danh sách khoảnh khắc theo đúng thứ tự bản thiết kế (artifact 3.3 · 22 khoảnh khắc). Khoảnh khắc nào thiếu
                          dữ liệu thì bỏ (luật từng màn ghi ngay tại chỗ); câu hỏi đánh số lại theo số câu còn lại.
   · Chữ: giọng B0B (doc "Giọng B0B tiếng Việt"); với bộ dữ liệu mẫu, mọi câu ra đúng nguyên văn bản artifact chủ studio đã sửa
     (test/ke_core.js so từng câu). Câu cho dạng dữ liệu khác (ngày khác thứ Hai, tăng cân, biệt danh khác…) là chữ mới, ghi trong
     CLAUDE.md để chủ studio soát.
   ===================================================================== */
(function (root) {
'use strict';

var V = 1;                                   /* dạng dữ liệu câu chuyện */
var MIN_SESSIONS = 12, MIN_WEEKS = 4;        /* dưới mức này không kể */
var FULL = 3;                                /* tuần "đủ" = từ 3 buổi (KPI nhịp của phòng) */
var DAY = 864e5;
var DOWS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
var DOWF = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

/* ============================== NGÀY (lịch thuần, UTC) ============================== */
function okIso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(ms(s)) === s; }
function ms(s) { var a = s.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function iso(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function add(s, n) { return iso(ms(s) + n * DAY); }
/** 0 = Thứ Hai … 6 = Chủ Nhật */
function dow(s) { return (new Date(ms(s)).getUTCDay() + 6) % 7; }
function monOf(s) { return add(s, -dow(s)); }
function isoWeek(s) {
  var t = new Date(ms(s)); t.setUTCDate(t.getUTCDate() + 3 - (t.getUTCDay() + 6) % 7);
  var y = t.getUTCFullYear(), j = new Date(Date.UTC(y, 0, 4));
  return { y: y, w: 1 + Math.round(((t - j) / DAY - 3 + (j.getUTCDay() + 6) % 7) / 7) };
}
function wkey(s) { var w = isoWeek(s); return w.y + '-W' + pad(w.w); }
function ddmm(s) { return s.slice(8, 10) + '.' + s.slice(5, 7); }
function dm(s) { return (+s.slice(8, 10)) + '/' + (+s.slice(5, 7)); }          /* nói: "3/3" */
function month(s) { return +s.slice(5, 7); }

/* ============================== SỐ (kiểu Việt) ============================== */
/** 92.5 → "92,5" · 115 → "115" · 2900 → "2.900" · dec: số chữ số thập phân tối đa (bỏ ,0 thừa) */
function num(v, dec) {
  dec = dec == null ? 1 : dec;
  var x = Math.abs(v), p = Math.pow(10, dec), r = Math.round(x * p) / p, neg = v < 0 && r > 0;
  var s = r.toFixed(dec), i = s.indexOf('.'), ip = i < 0 ? s : s.slice(0, i), fp = i < 0 ? '' : s.slice(i + 1).replace(/0+$/, '');
  ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + ip + (fp ? ',' + fp : '');
}
/** luôn đủ 1 chữ số thập phân: 2 → "2,0" (ô đoán số cân) */
function num1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
function hh(h) { return pad(h) + ':00'; }
/** giờ nói như người (chủ studio: "6 giờ chiều"): 0–4 đêm · 5–10 sáng · 11–12 trưa · 13–18 chiều · 19–23 tối */
function spoken(h) {
  if (h < 5) return (h === 0 ? 12 : h) + ' giờ đêm';
  if (h <= 10) return h + ' giờ sáng';
  if (h <= 12) return h + ' giờ trưa';
  if (h <= 18) return (h - 12) + ' giờ chiều';
  return (h - 12) + ' giờ tối';
}
/** chữ đầu thường (Deadlift → deadlift) — trừ từ viết tắt / viết hoa liền (VO2max, RDL) */
function lower1(s) { return s && !(s.length > 1 && s.charAt(1) !== s.charAt(1).toLowerCase()) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
/** khoảng ngày: cùng năm "03.03 → 16.10" · khác năm "03.03.2026 → 16.04.2027" (khỏi đọc nhầm 58 tuần thành 6 tuần) */
function span(a, b) { return a.slice(0, 4) === b.slice(0, 4) ? ddmm(a) + ' → ' + ddmm(b) : ddmm(a) + '.' + a.slice(0, 4) + ' → ' + ddmm(b) + '.' + b.slice(0, 4); }
function finite(v) { return typeof v === 'number' && isFinite(v); }
function round(v, step) { return Math.round(v / step) * step; }
function ceilTo(v, step) { return Math.ceil(v / step - 1e-9) * step; }

/* ============================== CHỮ KHÔNG NGẮT DÒNG ============================== */
/* cụm từ và "số + danh từ" giữ trên một dòng (nbsp) — danh sách của bản artifact + luật chung cho chữ sinh theo dữ liệu */
var PHR = ['cơ thể luôn', 'cơ thể mình', 'nắm được hết', 'quay lại tập', 'hay tập nhất', 'rất lo :(', 'dỗi đó!', 'B0DY nhé!', 'ở B0DY?', 'đâu hihi', 'tập luyện', 'chăm chỉ',
  'Không sớm', 'không muộn', 'các coach', 'cơ đấy', 'hôm đó', 'tù tì', 'thời gian', 'của bạn', 'vỗ tay', 'cho bạn', 'mấy cân', 'có vậy', 'đỡ hộ', 'liền luôn',
  'bạn nghĩ', 'bản thân', 'rất rõ', 'đồng hồ', 'tiếp theo', 'bao nhiêu', 'đổi mỡ lấy cơ', 'sót buổi nào', 'xà, không', 'đáp án', 'Mục tiêu', 'lên xà',
  'lấy cơ', 'giờ này', 'đến giờ', 'gấp rưỡi', 'tuần sau', 'biệt danh', 'mất tăm', 'trước Tết', 'cả tuần', 'lâu thế bao giờ', 'nhớ hết', 'nữa thôi',
  'có mặt', 'tập xong', 'ngọn núi'];
var NB = String.fromCharCode(160);
function nb(t, extra) {
  t = String(t);
  var list = PHR.concat(extra || []);
  for (var i = 0; i < list.length; i++) { var p = list[i]; if (p && t.indexOf(p) >= 0) t = t.split(p).join(p.replace(/ /g, NB)); }
  t = t.replace(/(Cứ )?\d+ giờ (đêm|sáng|trưa|chiều|tối)/g, function (m) { return m.replace(/ /g, NB); });
  t = t.replace(/tháng \d+/g, function (m) { return m.replace(/ /g, NB); });
  return t.replace(/(\d(?:[\d.,/]*\d)?) (?=\S)/g, '$1' + NB);
}

/* ============================== ĐỌC DỮ LIỆU ============================== */
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 80) : ''; }
function pos(v) { return finite(v) && v > 0 ? v : null; }
/** dữ liệu câu chuyện (dạng v1) → mô hình; không đủ để kể → null */
function derive(story) {
  if (!story || typeof story !== 'object' || story.v !== V) return null;
  var asOf = okIso(story.asOf) ? story.asOf : null;
  var seen = {}, S = [];
  (Array.isArray(story.sessions) ? story.sessions : []).forEach(function (x) {
    if (!Array.isArray(x) || !okIso(x[0]) || !(x[1] === +x[1] && x[1] >= 0 && x[1] <= 23 && x[1] % 1 === 0)) return;
    if (asOf && x[0] > asOf) return;
    var k = x[0] + '|' + x[1]; if (seen[k]) return; seen[k] = 1;
    S.push({ d: x[0], h: x[1] });
  });
  S.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.h - b.h; });
  var name = str(story.name, 40);
  if (!name || S.length < MIN_SESSIONS) return null;
  var first = S[0].d, last = S[S.length - 1].d;
  var M = { story: story, name: name, coach: str(story.coach, 40), code: str(story.code, 16).toUpperCase(), n: S.length, first: first, last: last, asOf: asOf || last };
  var nw = name.split(/\s+/);
  M.call = str(story.call, 20) || nw[nw.length - 1];
  M.nameLines = nw.length >= 2 ? [nw.slice(0, nw.length - 1).join(' '), nw[nw.length - 1]] : [name];

  /* tuần: liền mạch từ tuần buổi đầu tới tuần buổi gần nhất */
  var load = story.load && typeof story.load === 'object' ? story.load : null, W = [], idx = {};
  for (var m = monOf(first); m <= monOf(last); m = add(m, 7)) { idx[m] = W.length; W.push({ mon: m, key: wkey(m), n: 0, kg: load && finite(load[wkey(m)]) && load[wkey(m)] > 0 ? load[wkey(m)] : 0 }); }
  S.forEach(function (x) { W[idx[monOf(x.d)]].n++; });
  M.weeks = W; M.W = W.length;
  if (M.W < MIN_WEEKS) return null;
  M.avg = M.n / M.W;

  /* giờ quen */
  var hc = {}; S.forEach(function (x) { hc[x.h] = (hc[x.h] || 0) + 1; });
  M.hours = Object.keys(hc).map(function (h) { return [+h, hc[h]]; }).sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
  M.topH = M.hours[0][0]; M.topHn = M.hours[0][1]; M.share = M.topHn / M.n;
  M.habit = M.share >= 0.4 && (M.hours.length < 2 || M.hours[1][1] < M.topHn);

  /* thứ trong tuần (0 = T2 … 6 = CN) */
  var dc = [0, 0, 0, 0, 0, 0, 0]; S.forEach(function (x) { dc[dow(x.d)]++; });
  M.dows = dc;
  var order = [0, 1, 2, 3, 4, 5, 6].sort(function (a, b) { return dc[b] - dc[a] || a - b; });
  M.topDow = order[0]; M.topDown = dc[order[0]];
  M.dowOk = dc[order[0]] > dc[order[1]] && dc[order[0]] / M.n >= 0.2;
  M.dayN = dc[6] > 0 ? 7 : 6;

  /* chuỗi tuần đủ 3 buổi */
  /* tính tới tuần của asOf (không phải tuần buổi cuối): tuần đã qua mà không tập → chuỗi đứt (away = số tuần trọn vẹn vắng sau buổi cuối);
     tuần của asOf còn dở (asOf chưa tới CN) mà chưa đủ 3 buổi → chưa tính là đứt, đếm từ tuần trước */
  var X = W.map(function (w) { return w.n; }), endMon = monOf(M.asOf) > monOf(last) ? monOf(M.asOf) : monOf(last);
  for (var mm = add(monOf(last), 7); mm <= endMon; mm = add(mm, 7)) X.push(0);
  var top = X.length - 1, open = dow(M.asOf) !== 6 && monOf(M.asOf) === endMon, start = open && X[top] < FULL ? top - 1 : top;
  M.away = Math.max(0, start - (W.length - 1));
  var cur = 0; for (var i = start; i >= 0 && X[i] >= FULL; i--) cur++;
  var best = 0, run = 0; for (var q = 0; q <= start; q++) { run = X[q] >= FULL ? run + 1 : 0; if (run > best) best = run; }
  M.streak = { cur: cur, best: best, mon: cur ? add(monOf(first), 7 * (start - cur + 1)) : null };
  M.streakNow = start < top;   /* ô viền cuối dải chuỗi = tuần đang dở (tuần này) thay vì tuần sau */
  M.fullShare = W.filter(function (w) { return w.n >= FULL; }).length / M.W;

  /* tuần trắng gần nhất (nằm giữa: hai đầu luôn có buổi) và số tuần có tập sau đó */
  M.blank = null;
  for (var j = W.length - 1; j >= 0; j--) {
    if (W[j].n) continue;
    var j0 = j; while (j0 > 0 && !W[j0 - 1].n) j0--;
    M.blank = { i0: j0, i1: j, weeks: j - j0 + 1, from: W[j0].mon, to: add(W[j].mon, 6), after: W.length - 1 - j, back: W[j + 1].mon };
    break;
  }

  /* tạ đã nâng */
  var tot = W.reduce(function (s, w) { return s + w.kg; }, 0), wl = W.filter(function (w) { return w.kg > 0; }).length;
  M.tons = tot >= 1000 && wl >= 4 ? Math.round(tot / 100) / 10 : null;
  M.loadKg = tot;
  /* số tạ có từ đâu: logbook app coach chỉ có từ 26.09.2026 — khách tập từ trước thì tổng chỉ tính từ tuần đầu có số tạ.
     loadK0 = tuần đầu có số tạ · loadFrom = buổi đầu tiên của tuần đó (núi, nhãn ngày, câu hỏi, bản in đều tính từ đây) */
  var k0 = 0; while (k0 < W.length && !W[k0].kg) k0++;
  if (k0 >= W.length) k0 = 0;
  var q0 = 0; while (q0 < S.length - 1 && S[q0].d < W[k0].mon) q0++;
  M.loadK0 = k0; M.loadFrom = S[q0].d;

  /* mức tạ: bài nặng nhất có tiến bộ rõ là bài chính (thanh tạ) */
  M.lifts = (Array.isArray(story.lifts) ? story.lifts : []).map(function (l) {
    return l && { name: str(l.name, 30), from: pos(l.from), to: pos(l.to) };
  }).filter(function (l) { return l && l.name && l.to; }).sort(function (a, b) { return b.to - a.to; });
  M.hero = null;
  for (var k = 0; k < M.lifts.length; k++) { var L = M.lifts[k]; if (L.from && L.to >= 20 && L.to >= L.from * 1.1 && L.to <= 500) { M.hero = L; break; } }

  /* cơ thể: lần đo đầu → lần đo gần nhất */
  var body = (Array.isArray(story.body) ? story.body : []).filter(function (b) { return b && okIso(b.d) && (!asOf || b.d <= asOf); })
    .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  M.b0 = body[0] || null; M.b1 = body.length > 1 ? body[body.length - 1] : null;
  M.bw = null;
  if (M.b1 && pos(M.b1.kg)) M.bw = M.b1.kg; else if (M.b0 && pos(M.b0.kg)) M.bw = M.b0.kg;
  M.change = function (f) { return M.b0 && M.b1 && pos(M.b0[f]) && pos(M.b1[f]) ? Math.round((M.b1[f] - M.b0[f]) * 10) / 10 : null; };

  /* hít xà */
  var pu = story.pullup;
  M.pull = pu && okIso(pu.first) && pu.first >= first && pu.first <= M.asOf && pos(pu.reps) && pu.reps % 1 === 0 ? { first: pu.first, reps: pu.reps } : null;

  /* lời coach (nguyên văn) + mục tiêu */
  M.note = str(story.note, 400);
  M.goals = (Array.isArray(story.goals) ? story.goals : []).filter(function (g) { return g && str(g.t, 60); })
    .map(function (g) { return { t: str(g.t, 60).replace(/[\s.!…,;:]+$/, ''), done: !!g.done, lift: str(g.lift, 30), target: pos(g.target) }; }).filter(function (g) { return g.t; }).slice(0, 8);

  /* phòng: % khách nghỉ tiếp sau một tuần trắng */
  var ra = story.room && story.room.blankAgain;
  M.roomPct = finite(ra) && ra >= 1 && ra <= 99 ? Math.round(ra) : null;

  M.nick = nickOf(M);
  M.palette = paletteOf(M);
  M.facts = factsOf(M);
  return M;
}

/* ============================== BIỆT DANH ============================== */
/* Theo thứ tự ưu tiên; điều kiện đầu tiên đúng thì lấy. "Người giữ hẹn" là của bản artifact; các biệt danh còn lại là chữ mới. */
function nickOf(M) {
  if (M.habit && M.share >= 0.6) return { name: 'Người giữ hẹn', why: 'Chẳng cần ai phải ép. Cứ ' + spoken(M.topH) + ' là bạn có mặt.' };
  if (M.streak.cur >= 6 || M.fullShare >= 0.6) return { name: 'Người giữ nhịp', why: 'Chẳng cần ai nhắc. Tuần nào bạn cũng tập đủ 3 buổi.' };
  if (M.tons && M.tons >= 150) return { name: 'Người nhấc núi', why: 'Cộng hết số tạ bạn đã nâng là được cả ngọn núi ' + num(M.tons) + ' tấn.' };
  if (M.blank && M.blank.after >= 2) return { name: 'Người quay lại', why: 'Có lúc vắng mặt, nhưng lần nào bạn cũng quay lại tập.' };
  return { name: 'Người bền bỉ', why: M.W + ' tuần, ' + M.n + ' buổi. Không ồn ào, cứ đều đặn mà tiến.' };
}

/* ============================== BẢNG MÀU ============================== */
/* "Màu trời lúc bạn bắt đầu tập / tập xong" chỉ đúng với giờ chiều tối → chỉ kể khi giờ quen 16:00–19:00 */
function paletteOf(M) {
  if (!M.habit || M.topH < 16 || M.topH > 19) return null;
  var third;
  if (M.hero) third = { word: 'Vàng chanh ' + num(M.hero.to), say: 'Màu của ' + (M.streak.cur >= FULL ? 'chuỗi ' + M.streak.cur + ' tuần và ' : '') + 'mức ' + lower1(M.hero.name) + ' ' + num(M.hero.to) + ' kg.', tag: 'VÀNG CHANH ' + num(M.hero.to) };
  else third = { word: 'Vàng chanh ' + M.n, say: 'Màu của ' + M.n + ' buổi bạn đã có mặt.', tag: 'VÀNG CHANH ' + M.n };
  return [
    { c: 'dusk', word: 'Cam ' + hh(M.topH), say: 'Màu trời lúc bạn bắt đầu tập.', tag: 'CAM ' + hh(M.topH) },
    { c: 'night', word: 'Chàm ' + hh(M.topH + 1), say: 'Màu trời lúc bạn tập xong.', tag: 'CHÀM ' + hh(M.topH + 1) },
    { c: 'volt', word: third.word, say: third.say, tag: third.tag }
  ];
}

/* ============================== CHỈ SỐ ĐỂ KHOE (thẻ chia sẻ) ============================== */
var MEAS = [['waist', 'vòng eo', 'Vòng eo'], ['hip', 'vòng hông', 'Vòng hông'], ['chest', 'vòng ngực', 'Vòng ngực'], ['thigh', 'vòng đùi', 'Vòng đùi']];
/** [số, nhãn trên thẻ, tên chip, khoá] — thứ tự cố định (thẻ in theo thứ tự này) */
function factsOf(M) {
  var F = [[String(M.n), 'buổi trong ' + M.W + ' tuần', M.n + ' buổi', 'n']];
  if (M.habit) F.push([hh(M.topH), 'giờ quen · ' + M.topHn + ' / ' + M.n + ' buổi', 'Giờ quen', 'hour']);
  if (M.streak.cur >= FULL) F.push([String(M.streak.cur), 'tuần liền, chưa đứt', 'Chuỗi ' + M.streak.cur + ' tuần', 'streak']);
  if (M.tons) F.push([num(M.tons), 'tấn đã nâng', num(M.tons) + ' tấn', 'tons']);
  M.lifts.slice(0, 4).forEach(function (l, i) { F.push([num(l.to), 'kg ' + lower1(l.name), l.name, 'lift' + i]); });
  var dk = M.change('kg');
  if (dk && Math.abs(dk) >= 0.5) F.push([num(Math.abs(dk)), 'kg cân nặng đã ' + (dk < 0 ? 'giảm' : 'tăng'), 'Cân nặng', 'kg']);
  MEAS.forEach(function (x) { var c = M.change(x[0]); if (c && Math.abs(c) >= 0.5) F.push([num(Math.abs(c)), 'cm ' + x[1] + ' đã ' + (c < 0 ? 'giảm' : 'tăng'), x[2], x[0]]); });
  return F;
}
/** chip chọn sẵn (tối đa 6): buổi · giờ quen · tấn · 2 bài nặng nhất · một số đo cơ thể (eo giảm, không thì cân nặng) */
function defaultPicks(F) {
  var keys = F.map(function (f) { return f[3]; }), out = [];
  ['n', 'hour', 'tons', 'lift0', 'lift1'].forEach(function (k) { var i = keys.indexOf(k); if (i >= 0) out.push(i); });
  var wi = keys.indexOf('waist'), ki = keys.indexOf('kg');
  var bodyI = wi >= 0 && /giảm/.test(F[wi][1]) ? wi : ki;
  if (bodyI >= 0) out.push(bodyI);
  ['streak', 'lift2', 'hip', 'chest', 'thigh'].forEach(function (k) { var i = keys.indexOf(k); if (out.length < 6 && i >= 0 && out.indexOf(i) < 0) out.push(i); });
  return out.slice(0, 6).sort(function (a, b) { return a - b; });
}

/* ============================== NHỊP (ô đoán) ============================== */
/* thang kéo: ô đoán bắt đầu thấp hơn đáp án, đầu trên đủ xa để đoán thừa (với bộ mẫu: buổi 10–150 bắt đầu 50 · tấn 10–400 bắt đầu 80 ·
   cân 0–12 bắt đầu 2,0 — đúng như bản artifact) */
function rangeN(n) { var max = Math.max(50, ceilTo(n * 1.7, 50)); return { min: n >= 20 ? 10 : 0, max: max, val: Math.min(max, Math.max(0, round(n * 0.6, 10))), step: 1 }; }
function rangeT(t) { var max = Math.max(50, ceilTo(t * 1.8, 50)); return { min: t >= 40 ? 10 : 0, max: max, val: Math.min(max, round(t * 0.375, 10)), step: 1 }; }
function rangeK(k) { var max = Math.max(12, ceilTo(k * 2.5, 2)); return { min: 0, max: max, val: Math.max(0.2, round(k * 0.45, 0.2)), step: 0.2 }; }

/* ============================== PHẢN ỨNG KHI CHỐT ============================== */
function react(id, M, v) {
  if (id === 'g1') {
    var d = M.n - v;
    return d === 0 ? 'Chuẩn không cần chỉnh. Ai đó nắm rất rõ quá trình tập luyện của bản thân.'
      : Math.abs(d) <= 5 ? 'Suýt trúng. Ai đó nắm rất rõ quá trình tập luyện của bản thân.'
      : d > 0 ? 'Thiếu mất ' + d + ' buổi rùi. Bạn chăm chỉ hơn bạn nghĩ nhiều.'
      : 'Đếm cả mấy buổi định đi đấy à? Thừa ' + (-d) + ' buổi rồi.';
  }
  if (id === 'g2') return v === DOWS[M.topDow] ? 'CHUẨN LUÔN, ĐÓ LÀ NGÀY' : 'NHẦM TO, ĐÓ LÀ NGÀY';
  if (id === 'g4') {
    var t = M.tons - v, tol = M.tons * 0.07;
    return Math.abs(t) < tol || Math.round(Math.abs(t)) < 1 ? 'Sát sàn sạt. Trong đầu bạn có cái cân à?'
      : t > 0 ? 'Thiếu mất ' + num(Math.round(t), 0) + ' tấn. Bạn không nhận ra, chứ B0DY nắm được hết.'
      : -t <= tol * 2 ? 'Thừa ' + num(Math.round(-t), 0) + ' tấn. Nhưng cứ đều thế này thì chẳng mấy mà tới.'
      : 'Thừa những ' + num(Math.round(-t), 0) + ' tấn. Con số ấy để dành năm sau nhé.';
  }
  if (id === 'g5') return Math.abs(Math.abs(M.change('kg')) - v) <= 0.6 + 1e-9 ? 'Đoán sát đấy' : 'Đáp án';   /* 4,4 − 3,8 = 0,6000…01 trong số thực */
  return '';
}

/* ============================== CÂU THEO DỮ LIỆU ============================== */
/** ngày tập nhiều nhất: câu riêng cho từng thứ (thứ Hai là câu của bản artifact) */
function dowLine(i, k) {
  var many = (k >= 10 ? 'những ' : 'đúng ') + k + ' buổi';
  return ['Ai cũng ngại thứ Hai, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.',
    'Thứ Ba lặng lẽ nhất tuần, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.',
    'Giữa tuần ai cũng đuối, thế mà bạn đi tập ' + many + ' vào thứ Tư cơ đấy.',
    'Thứ Năm ai cũng mong cuối tuần, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.',
    'Thứ Sáu ai cũng tính chuyện đi chơi, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.',
    'Thứ Bảy người ta ngủ nướng, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.',
    'Chủ Nhật người ta nghỉ ngơi, thế mà bạn đi tập ' + many + ' vào hôm đó cơ đấy.'][i];
}
/** mức tạ so với hồi mới tập */
function liftRatio(r, kg) {
  if (r >= 3.1) return 'Hơn gấp ba hồi mới tập.';
  if (r >= 2.9) return 'Gấp ba hồi mới tập.';
  if (r >= 2.2) return 'Hơn gấp đôi hồi mới tập.';
  if (r >= 1.97) return 'Gấp đôi hồi mới tập.';
  if (r >= 1.8) return 'Gần gấp đôi hồi mới tập.';
  if (r >= 1.55) return 'Hơn gấp rưỡi hồi mới tập.';
  if (r >= 1.45) return 'Gấp rưỡi hồi mới tập.';
  return 'Nặng hơn hồi mới tập ' + num(kg) + ' kg.';
}
/** mức tạ so với cân nặng */
function liftBody(b) {
  if (b >= 1.95) return ' Thậm chí là gấp đôi trọng lượng cơ thể luôn.';
  if (b >= 1.7) return ' Thậm chí là gần gấp đôi trọng lượng cơ thể luôn.';
  if (b >= 1.45) return ' Thậm chí là gấp rưỡi trọng lượng cơ thể luôn.';
  if (b >= 1) return ' Thậm chí là nặng hơn cả cơ thể bạn luôn.';
  return '';
}
/** đĩa mỗi bên thanh đòn 20 kg (đĩa chuẩn, nặng ở trong) */
var PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
function plates(kg) {
  var side = Math.round((kg - 20) / 2 * 100) / 100, out = [];
  if (side <= 0) return out;
  PLATES.forEach(function (p) { while (side >= p - 1e-9 && out.length < 8) { out.push(p); side = Math.round((side - p) * 100) / 100; } });
  return out;
}
var COUNT = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám'];
function platesLabel(kg) {
  var ps = plates(kg), g = [];
  ps.forEach(function (p) { var last = g[g.length - 1]; if (last && last.p === p) last.k++; else g.push({ p: p, k: 1 }); });
  if (!g.length) return 'Thanh tạ ' + num(kg) + ' kg';
  var parts = g.map(function (x) { return COUNT[x.k] + ' đĩa ' + num(x.p, 2); });
  var tail = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' và ' + parts[parts.length - 1] : parts[0];
  return 'Thanh tạ ' + num(kg) + ' kg: mỗi bên ' + tail;
}

/* ============================== KỊCH BẢN ============================== */
/**
 * next (do trang đặt lịch đưa sang): {no, mon, state: 'open' | 'booked' | 'later', slot: {d, h} | null, coach, left, exp, today}
 *   open: lịch tuần no đang mở, chưa đặt · booked: đã đặt (slot = buổi đầu) · later: tuần sau chưa mở (mở 06:00 CN).
 */
function script(M, next) {
  var L = [], Q = [], n = M.n, rangeShort = span(M.first, M.last);
  var push = function (o) { L.push(o); return o; };
  var ask = function (o) { Q.push(o); return push(o); };

  /* 00 · bìa */
  push({ id: 'cover', bg: 'ink', lb: M.W + ' tuần · ' + rangeShort, lines: M.nameLines,
         say: 'Để B0DY kể về ' + M.W + ' tuần tập luyện ' + (M.avg >= 2 ? 'chăm chỉ ' : '') + 'vừa qua của ' + M.call + ' nhé.' });
  /* 01 · luật chơi */
  push({ id: 'rules', bg: 'night', stmt: 'Đoán thử xem nào.', say: 'Mình hỏi, bạn đoán, xong mình mở đáp án. Sai cũng chẳng sao, mình không mách coach đâu hihi.', btn: 'Chơi luôn' });
  /* 02 · hỏi số buổi · 03 · đáp án */
  ask({ id: 'q', g: 'g1', bg: 'paper', q: 'Từ hôm ' + dm(M.first) + ' đến giờ, bạn tập được bao nhiêu buổi rồi?', unit: 'buổi', r: rangeN(n), aria: 'Số buổi bạn đoán' });
  push({ id: 'a1', bg: 'ink', lb: 'Đáp án', lb2: 'TỔNG SỐ BUỔI ĐÃ TẬP · ' + rangeShort, value: n });
  /* 04 · đồng hồ 24 giờ — có giờ quen (≥ 40 % số buổi, hơn hẳn giờ thứ hai) */
  if (M.habit) {
    var tận = M.share >= 0.5;
    push({ id: 'clock', bg: 'night', lb: 'KHUNG GIỜ QUEN', value: hh(M.topH), hours: M.hours, top: M.topH,
           say: 'Có ' + (tận ? 'tận ' : '') + M.topHn + ' trên tổng số ' + n + ' buổi là bạn tập đúng giờ này.' + (tận ? ' Không sớm, không muộn.' : ''),
           dim: 'Cứ thấy bạn tới là các coach biết đã ' + spoken(M.topH) + ' rồi.',
           aria: 'Giờ bắt đầu buổi tập trên mặt đồng hồ 24 giờ: ' + M.hours.map(function (x) { return x[0] + ' giờ ' + x[1] + ' buổi'; }).join(', ') });
  }
  /* 05 · hỏi thứ · 06 · cột theo thứ — có đúng một thứ nhiều nhất */
  if (M.dowOk) {
    ask({ id: 'pick', g: 'g2', bg: 'paper', q: 'Đâu là ngày trong tuần mà bạn hay tập nhất?', opts: DOWS.slice(0, M.dayN) });
    var mx = M.topDown;
    push({ id: 'days', bg: 'dusk', word: DOWF[M.topDow], say: dowLine(M.topDow, M.topDown), top: M.topDow,
           bars: M.dows.slice(0, M.dayN).map(function (c, i) { return { k: DOWS[i], n: c, r: Math.round(c / mx * 1000) / 1000 }; }) });
  }
  /* 07 · B0B ngủ đúng tuần vắng · 08 · 43 trên 100 người — có tuần trắng và đã tập lại ≥ 2 tuần sau đó */
  if (M.blank && M.blank.after >= 2) {
    var b = M.blank, d0 = +b.from.slice(8, 10), part = d0 <= 10 ? 'đầu' : d0 <= 20 ? 'giữa' : 'cuối';
    push({ id: 'gap', bg: 'ink', lb: ddmm(b.from) + ' → ' + ddmm(b.to), stmt: 'Hồi ' + part + ' tháng ' + month(b.from) + ' bạn lặn mất tăm.',
           say: b.weeks > 1 ? 'Thế là mình ngủ khò những ' + b.weeks + ' tuần.' : 'Thế là mình ngủ khò cả tuần.',
           seg: [b.i0, b.weeks, M.W - b.i1 - 1], at: (b.i0 + b.weeks / 2) / M.W, d0: ddmm(M.first), d1: ddmm(b.from), d2: ddmm(M.last) });
    if (M.roomPct && !M.away) push({ id: 'room', bg: 'night', lb: 'CÓ MỘT SỰ THẬT', value: M.roomPct, unitLines: ['trên 100', 'người'],
                          say: 'đã nghỉ liền tù tì mấy tuần mà không quay lại tập.', dim: 'Điều này làm cho B0DY rất lo :(',
                          plb: 'Bạn · từ tháng ' + month(b.back), pvalue: 0, punitLines: ['tuần', 'nghỉ thêm'] });
  }
  /* 09 · chuỗi tuần đủ 3 buổi — chuỗi hiện tại ≥ 3 tuần */
  if (M.streak.cur >= FULL) {
    var s = M.streak, show = Math.min(s.cur, 8);
    push({ id: 'streak', bg: 'volt', lb: 'CHUỖI TẬP HIỆN TẠI', value: s.cur, stmt: 'tuần liên tiếp', cells: show, nx: M.streakNow ? 'Tuần này' : 'Tuần sau', d0: ddmm(add(s.mon, 7 * (s.cur - show))),
           say: 'Tuần nào bạn cũng tập đủ 3 buổi.' + (s.cur >= s.best ? ' Đây hẳn là quãng thời gian chăm chỉ nhất của bạn.' : ' Kỷ lục của bạn là ' + s.best + ' tuần liền đấy.'),
           dim: 'Đừng để đứt chuỗi nhé, B0DY dỗi đó!' });
  }
  /* 10 · hỏi số tấn · 11 · ngọn núi — có tải từng tuần */
  if (M.tons) {
    /* số tạ chỉ có từ giữa chừng (M.loadFrom sau buổi đầu) → câu hỏi / câu đáp nói rõ "từ hôm …", núi không vẽ phần phẳng chưa có dữ liệu */
    var part = M.loadFrom > M.first;
    ask({ id: 'q', g: 'g4', bg: 'paper', q: part ? 'Từ hôm ' + dm(M.loadFrom) + ' đến giờ, đoán xem bạn đã nâng bao nhiêu tấn tạ ở B0DY?'
                                                : 'Đoán xem bạn đã nâng bao nhiêu tấn tạ trong suốt khoảng thời gian vừa qua ở B0DY?', unit: 'tấn', r: rangeT(M.tons), aria: 'Số tấn bạn đoán' });
    var times = M.bw ? M.loadKg / M.bw : 0;
    push({ id: 'mtn', bg: 'ink', lb: 'ĐÁP ÁN SẼ KHIẾN BẠN BẤT NGỜ', value: M.tons,
           say: times >= 10 ? 'Tức là bằng ' + num(times >= 1000 ? round(times, 100) : round(times, 10), 0) + ' lần bạn tự nhấc chính cơ thể mình lên.'
                            : 'Cộng dồn từng rep của bạn, từ ' + (part ? 'hôm ' + dm(M.loadFrom) : 'buổi đầu') + ' tới buổi gần nhất.',
           vol: M.weeks.slice(M.loadK0).map(function (w) { return w.kg; }), d0: ddmm(M.loadFrom), d1: ddmm(M.last) });
  }
  /* 12 · thanh tạ — bài chính có tiến bộ rõ */
  if (M.hero) {
    var h = M.hero;
    push({ id: 'lift', bg: 'dusk', lb: h.name + ' · ' + num(h.from) + ' → ' + num(h.to) + ' kg', from: h.from, to: h.to, aria: platesLabel(h.to),
           say: liftRatio(h.to / h.from, h.to - h.from) + (M.bw ? liftBody(h.to / M.bw) : ''), dim: 'Một tràng vỗ tay dành cho bạn.' });
  }
  /* 13 · hỏi số cân · 14 · cân + khối cơ — đổi ≥ 1 kg và khối cơ tăng (giảm cân: cơ tăng ≥ 0,3 kg · tăng cân: cơ chiếm ≥ nửa) */
  var dk = M.change('kg'), dm2 = M.change('muscle');
  if (dk !== null && dm2 !== null && ((dk <= -1 && dm2 >= 0.3) || (dk >= 1 && dm2 >= dk * 0.5))) {
    var lose = dk < 0, kk = Math.abs(dk), det = [], dw = M.change('waist'), f0 = M.b0.fat, f1 = M.b1.fat;
    if (dw !== null && Math.abs(dw) >= 0.5) det.push('Eo ' + (dw < 0 ? 'giảm ' : 'tăng ') + num(Math.abs(dw)) + ' cm');
    if (pos(f0) && pos(f1)) det.push('Mỡ ' + num(f0) + '% → ' + num(f1) + '%');
    ask({ id: 'q', g: 'g5', bg: 'paper', q: 'Thế từ hồi đầu tới giờ, bạn ' + (lose ? 'giảm' : 'tăng') + ' được mấy cân?', unit: 'kg', r: rangeK(kk), aria: 'Số cân bạn đoán', dec: true });
    push({ id: 'body', bg: 'paper', word: lose ? 'Giảm' : 'Tăng', value: kk,
           say: lose ? (kk < 6 ? 'Nghe thì ít. Nhưng không chỉ có vậy.' : 'Nghe đã thấy nhiều. Nhưng chưa hết đâu.') : 'Đừng vội lo. Không chỉ có mỡ đâu.',
           plb: 'Khối cơ', pword: 'Tăng', pvalue: dm2, pdet: det.join(' · '),
           psay: lose ? 'Cái cân đâu có biết bạn đã đổi mỡ lấy cơ.' : 'Cái cân đâu có biết phần lớn số cân ấy là cơ.' });
  }
  /* 15 · tờ lịch hít xà */
  if (M.pull) {
    var p = M.pull, dd = p.first;
    push({ id: 'pull', bg: 'ink', lb: 'Hít xà', mlb: 'Tháng ' + month(dd) + ' · ' + dd.slice(0, 4), day: +dd.slice(8, 10), dname: DOWF[dow(dd)],
           say: 'Là ngày đầu tiên mà bạn tự kéo được người lên xà, không cần ai đỡ hộ.',
           stmt: p.reps >= 2 ? 'Giờ được ' + p.reps + ' cái liền luôn.' : 'Một cái thôi, nhưng là cái đầu tiên.' });
  }
  /* 16 · lời coach (nguyên văn) rồi mục tiêu */
  if (M.note || M.goals.length) {
    var o = { id: 'coach', bg: 'paper' };
    if (M.note) { o.lb = 'Coach ' + (M.coach || 'của bạn') + ' nhận xét'; o.quote = '“' + M.note + '”'; }
    if (M.goals.length) {
      var dn = M.goals.filter(function (g) { return g.done; }).length, rest = M.goals.filter(function (g) { return !g.done; });
      o.glb = 'MỤC TIÊU ĐẠT'; o.gval = dn + '/' + M.goals.length;
      if (!rest.length) o.gsay = 'Đạt hết rồi đấy. Mục tiêu mới, coach sẽ đặt cùng bạn.';
      else if (rest.length === 1) {
        var g = rest[0], lift = g.lift && M.lifts.filter(function (l) { return l.name.toLowerCase() === g.lift.toLowerCase(); })[0];
        o.gsay = lift && g.target && g.target > lift.to ? 'Còn mỗi ' + lower1(g.t) + '. Đang ' + num(lift.to) + ' rồi, thêm ' + num(g.target - lift.to) + ' kg nữa thôi.' : 'Còn mỗi ' + lower1(g.t) + ' nữa thôi.';
      } else o.gsay = 'Còn ' + rest.length + ' mục tiêu nữa. Cứ đều thế này là tới.';
    }
    push(o);
  }
  /* 17 · dồn tới biệt danh · 18 · biệt danh */
  push({ id: 'lead', bg: 'ink', stmt: 'Từng ấy là đủ hiểu bạn rồi.', say: 'Giờ mình đặt cho bạn cái biệt danh nhé.' });
  var nw = M.nick.name.split(' ');
  push({ id: 'nick', bg: 'dusk', lb: 'Biệt danh', lines: [nw[0], nw.slice(1).join(' ')], say: M.nick.why });
  /* 19 · bảng màu riêng */
  if (M.palette) push({ id: 'bands', bg: 'ink', lb: 'Bảng màu riêng', stmt: 'Bảng màu này chỉ ' + M.call + ' mới có.', bands: M.palette });
  /* 20 · thẻ chia sẻ */
  push({ id: 'card', bg: 'ink', stmt: 'Khoe thành tích!' });
  /* 21 · lịch tuần sau */
  push(nextMoment(M, next));

  Q.forEach(function (q, i) { q.lb = 'Câu ' + (i + 1) + ' / ' + Q.length; });
  return L;
}
/** ô lịch: buổi đã đặt, không thì giờ quen vào thứ hay tập nhất của tuần đó */
function nextMoment(M, nx) {
  var o = { id: 'next', bg: 'dusk', say: 'Hãy tiếp tục tập luyện cùng B0DY nhé!' };
  /* none: không đặt được tuần sau (gói hết hạn / hết buổi / coach không nhận) — không hứa ô lịch nào */
  if (!nx || !okIso(nx.mon) || nx.state === 'none') { o.stmt = 'Hẹn gặp bạn ở buổi tập tới.'; o.btn = 'Về trang đặt lịch'; return o; }
  o.lb = 'Tuần sau · ' + ddmm(nx.mon) + ' → ' + ddmm(add(nx.mon, 6));
  /* gợi ý: giờ quen vào thứ hay tập nhất — giờ đó không đặt được (gói Ban ngày, giờ nghỉ trưa) → khung đặt được gần nhất */
  var hs = Array.isArray(nx.hours) && nx.hours.length ? nx.hours : null, h0 = M.topH;
  if (hs && hs.indexOf(h0) < 0) h0 = hs.slice().sort(function (a, b) { return Math.abs(a - M.topH) - Math.abs(b - M.topH) || b - a; })[0];
  var slot = nx.state === 'booked' && nx.slot && okIso(nx.slot.d) ? nx.slot : { d: add(nx.mon, M.topDow), h: h0 };
  o.slot = { lb: DOWF[dow(slot.d)] + ' · ' + ddmm(slot.d), time: hh(slot.h), coach: nx.coach || M.coach ? 'Coach ' + (nx.coach || M.coach) : '',
             pkg: finite(nx.left) ? 'Còn ' + nx.left + ' buổi' + (okIso(nx.exp) ? ' · hết hạn ' + ddmm(nx.exp) : '') : '' };
  if (nx.state === 'booked') { o.stmt = 'Lịch tuần sau đã đặt.'; o.say = 'Hẹn gặp bạn ở B0DY nhé!'; o.btn = 'Xem phiếu tuần ' + nx.no; }
  else if (nx.state === 'later') { o.stmt = 'Lịch tuần sau chưa mở.'; o.say = 'Lịch mở lúc 6 giờ sáng Chủ Nhật. Hãy tiếp tục tập luyện cùng B0DY nhé!'; o.btn = 'Về trang đặt lịch'; }
  else { o.stmt = 'Lịch tuần sau đã mở.'; o.btn = 'Đặt lịch tuần ' + nx.no; }
  return o;
}

/* ============================== BẢN IN ============================== */
function printRows(M) {
  var R = [['Buổi đã tập', M.n + ' buổi · ' + M.W + ' tuần']];
  if (M.habit) R.push(['Giờ quen', hh(M.topH) + ' · ' + M.topHn + ' / ' + M.n + ' buổi']);
  if (M.dowOk) R.push(['Thứ tập nhiều nhất', DOWF[M.topDow] + ' · ' + M.topDown + ' buổi']);
  if (M.streak.cur >= FULL) R.push(['Chuỗi hiện tại', M.streak.cur + ' tuần liền']);
  if (M.tons) R.push(['Tổng tạ đã nâng', num(M.tons) + ' tấn' + (M.loadFrom > M.first ? ' · từ ' + ddmm(M.loadFrom) : '')]);
  M.lifts.slice(0, 4).forEach(function (l) { R.push([l.name, l === M.hero ? num(l.from) + ' → ' + num(l.to) + ' kg' : num(l.to) + ' kg']); });
  var ch = function (lbl, f, unit) { var c = M.change(f); if (c && Math.abs(c) >= 0.5) R.push([lbl, (c < 0 ? 'Giảm ' : 'Tăng ') + num(Math.abs(c)) + ' ' + unit]); };
  ch('Cân nặng', 'kg', 'kg'); ch('Khối cơ', 'muscle', 'kg'); ch('Vòng eo', 'waist', 'cm'); ch('Vòng hông', 'hip', 'cm'); ch('Vòng ngực', 'chest', 'cm'); ch('Vòng đùi', 'thigh', 'cm');
  if (M.goals.length) R.push(['Mục tiêu', M.goals.filter(function (g) { return g.done; }).length + ' / ' + M.goals.length + ' đã đạt']);
  return R.slice(0, 16);
}
function slug(s) {
  return String(s).normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

var KE = {
  V: V, MIN_SESSIONS: MIN_SESSIONS, MIN_WEEKS: MIN_WEEKS, DOWS: DOWS, DOWF: DOWF,
  derive: derive, script: script, react: react, defaultPicks: defaultPicks, printRows: printRows,
  plates: plates, platesLabel: platesLabel, num: num, num1: num1, nb: nb, spoken: spoken, ddmm: ddmm, span: span, hh: hh, slug: slug,
  date: { ok: okIso, add: add, dow: dow, mon: monOf, wkey: wkey, ms: ms }
};
if (typeof module === 'object' && module.exports) module.exports = KE;
else root.KE = KE;
})(this);
