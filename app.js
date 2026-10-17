/* =====================================================================
   B0DY · Đặt lịch tập tuần — app.js (booking.b0dy.studio)
   Máy chủ: Cloudflare Worker + Durable Object (hợp đồng API giống Apps Script backend/LichTuan.gs):
     lt_boot · lt_find · lt_verify · lt_book · lt_change — POST text/plain JSON, trả JSON.
   Hiển thị ngay từ bộ nhớ máy (state lần trước) rồi cập nhật ngầm; chuyển động cùng hệ app coach
   (một vòng rAF, tween có key, line() đổi chữ tại chỗ, show() vào/ra màn).
   ===================================================================== */
(function () {
'use strict';

/* ============================== CẤU HÌNH ============================== */
var VER = '1.0.7';
var API_URL = 'https://b0dy-booking-api.little-bonus-1d87.workers.dev/';
var API_SLOW = false;                 /* true khi chạy Apps Script (chậm hơn nhiều) → nới thời gian chờ */
/* chế độ QC (?qc): máy chủ giả chạy ngay trên máy (qc.js, đúng mã của Worker) với dữ liệu giả — không gọi mạng,
   bộ nhớ máy dùng tiền tố 'qc:' nên không bao giờ đọc / ghi mã nhớ máy hay lịch đã lưu của trang thật */
var QC = /[?&]qc(=|&|$)/.test(location.search);
var T_READ = API_SLOW ? 30000 : 9000, T_WRITE = API_SLOW ? 50000 : 25000;

var SLOTS = [6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20];
var DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
var DOWF = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
var OFF = 7 * 3600e3, HR = 3600e3, DAY = 864e5, LEAD = 24 * HR;
var RULES = ['Mỗi tuần đặt 2–4 buổi, mỗi ngày tối đa 1 buổi.', 'Lịch đã đặt không thể huỷ.',
  'Đổi lịch tối đa 2 lần mỗi tuần, trước buổi tập 24 giờ.', 'Chỉ đổi sang ngày khác trong cùng tuần.',
  'Không đến vẫn tính 1 buổi.', 'Lịch tuần sau mở lúc 06:00 Chủ Nhật.'];

/* ============================== TIỆN ÍCH ============================== */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
var MQ_RM = window.matchMedia('(prefers-reduced-motion: reduce)'), MQ_DESK = window.matchMedia('(min-width: 960px)'), MQ_TOUCH = window.matchMedia('(pointer: coarse)');
function rm() { return MQ_RM.matches; }
function desk() { return MQ_DESK.matches; }
/* gập dấu đúng luật máy chủ (core.js · fold): bỏ dải U+0300–U+036F, đ → d, chữ thường — để chữ gõ và chữ tô khớp trùng máy chủ */
var MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
function fold(s) { return String(s == null ? '' : s).normalize('NFD').replace(MARKS, '').replace(/[đĐ]/g, 'd').toLowerCase(); }
function words(s) { return fold(s).replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean); }
function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
var SEQ = 0;

/* bộ nhớ máy — Safari riêng tư có thể ném lỗi: mọi truy cập bọc try/catch */
function store(kind) {
  var P = QC ? 'qc:' : '';
  return {
    get: function (k) { try { return window[kind].getItem(P + k); } catch (e) { return null; } },
    set: function (k, v) { try { window[kind].setItem(P + k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { window[kind].removeItem(P + k); } catch (e) { /* bỏ qua */ } }
  };
}
var LS = store('localStorage'), SS = store('sessionStorage');
function jget(st, k) { var v = st.get(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function rand(n) {
  var al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', a = new Uint8Array(n), s = '';
  (window.crypto || window.msCrypto).getRandomValues(a);
  for (var i = 0; i < n; i++) s += al[a[i] & 63];
  return s;
}

/* ============================== THỜI GIAN (giờ Việt Nam) ============================== */
var SKEW = 0;                          /* giờ máy chủ − giờ máy này */
function now() { return Date.now() + SKEW; }
function parts(ms) { var d = new Date(ms + OFF); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes(), ss: d.getUTCSeconds(), dow: d.getUTCDay() }; }
function isoP(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
function isoOf(ms) { return isoP(parts(ms)); }
function dayMs(iso) { var a = String(iso).split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]) - OFF; }
function addD(iso, n) { return isoOf(dayMs(iso) + n * DAY); }
function slotMs(iso, h) { return dayMs(iso) + h * HR; }
function dowOf(iso) { return parts(dayMs(iso)).dow; }
function ddmm(iso) { var a = String(iso).split('-'); return a[2] + '.' + a[1]; }
function hm(h) { return pad2(h) + ':00'; }
function dShort(iso) { return DOW[dowOf(iso)] + ' ' + ddmm(iso); }        /* "T4 21.10" */
function dFull(iso) { return DOWF[dowOf(iso)] + ' ' + ddmm(iso); }       /* "Thứ Tư 21.10" */
function yy(iso) { var a = String(iso).split('-'); return a[2] + '/' + a[1] + '/' + a[0].slice(2); }   /* "21/11/26" */
function isoWeek(iso) {
  var a = String(iso).split('-'), t = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - y0) / DAY + 1) / 7) };
}
/* bản sao ltWeekCtx_ của máy chủ — dùng để vẽ ngay trước khi máy chủ trả lời */
function weekCtx(ms) {
  var p = parts(ms), today = isoP(p), mon, phase;
  if (p.dow === 0) { if (p.hh >= 6) { mon = addD(today, 1); phase = 'open'; } else { mon = addD(today, -6); phase = 'before'; } }
  else { mon = addD(today, 1 - p.dow); phase = 'late'; }
  var days = []; for (var i = 0; i < 6; i++) days.push(addD(mon, i));
  var sun = p.dow === 0 ? today : addD(today, 7 - p.dow), next = slotMs(sun, 6);
  if (next <= ms) next = slotMs(addD(sun, 7), 6);
  var w = isoWeek(mon), nw = isoWeek(isoOf(next + DAY));
  return { key: w.year + '-W' + pad2(w.week), no: w.week, mon: mon, days: days, phase: phase, lead: ms >= dayMs(mon), nextOpen: next, nextNo: nw.week, closed: {} };
}
function anyOpen(week, ms) {
  for (var i = 0; i < week.days.length; i++) {
    if (week.closed && week.closed[week.days[i]] !== undefined) continue;
    for (var j = 0; j < SLOTS.length; j++) { var t = slotMs(week.days[i], SLOTS[j]); if (t > ms && (!week.lead || t - ms >= LEAD)) return true; }
  }
  return false;
}

/* ============================== CHUYỂN ĐỘNG (một vòng rAF, như app coach) ============================== */
function bez(p1x, p1y, p2x, p2y) {
  var cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx, cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  function sx(t) { return ((ax * t + bx) * t + cx) * t; }
  function sy(t) { return ((ay * t + by) * t + cy) * t; }
  function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var t = x, i;
    for (i = 0; i < 8; i++) { var e = sx(t) - x; if (Math.abs(e) < 1e-5) return sy(t); var d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    var lo = 0, hi = 1; t = x;
    for (i = 0; i < 30; i++) { var v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
var EO = bez(.22, .85, .22, 1), EIO = bez(.65, 0, .35, 1), LIN = function (k) { return k; };
var MT = 0, TWS = [], AFS = [], MOTR = 0, MOTL = 0, INF = false;
function wake() { if (!MOTR && !INF) { MOTL = 0; MOTR = requestAnimationFrame(tick); } }
function tick(t) {
  MOTR = 0;
  var dt = MOTL ? Math.min((t - MOTL) / 1000, 0.1) : 1 / 60; MOTL = t; MT += dt;
  INF = true;
  try { runTw(); runAf(); }
  finally { INF = false; if (TWS.length || AFS.length) MOTR = requestAnimationFrame(tick); else MOTL = 0; }
}
function tw(o) {
  if (o.key) twKill(o.key);
  if (rm() && !o.keepRM) { o.set(o.to); if (o.done) o.done(); return o; }
  o.t0 = MT + (o.delay || 0); o.ease = o.ease || EO;
  if (o.delay && o.pre !== false) o.set(o.from);
  TWS.push(o); wake(); return o;
}
function twKill(key) { for (var i = TWS.length - 1; i >= 0; i--) if (TWS[i].key === key) TWS.splice(i, 1); }
function runTw() {
  for (var i = 0; i < TWS.length; i++) {
    var o = TWS[i]; if (MT < o.t0) continue;
    var k = o.dur > 0 ? Math.min(1, (MT - o.t0) / o.dur) : 1;
    o.set(o.from + (o.to - o.from) * o.ease(k));
    if (k >= 1) { var j = TWS.indexOf(o); if (j >= 0) { TWS.splice(j, 1); if (j <= i) i--; } if (o.done) o.done(); }
  }
}
function after(sec, fn, key) { if (key) afKill(key); AFS.push({ at: MT + sec, fn: fn, key: key }); wake(); }
function afKill(key) { for (var i = AFS.length - 1; i >= 0; i--) if (AFS[i].key === key) AFS.splice(i, 1); }
function runAf() { for (var i = 0; i < AFS.length; i++) { if (MT >= AFS[i].at) { var f = AFS[i].fn; AFS.splice(i, 1); i--; f(); } } }

/* chữ đổi tại chỗ: cũ tắt nhanh + trượt 7px, mới hiện từ 30 % quãng (240 ms) — y hệt line() của app coach */
function lnHTML(text, cls) { return '<span class="ln' + (cls ? ' ' + cls : '') + '"><span class="on">' + esc(text) + '</span></span>'; }
function line(host, text, dir, instant) {
  if (!host) return;
  text = String(text);
  var cur = host.querySelector(':scope>span.on');
  if (cur && cur.textContent === text) return;
  $$(':scope>span:not(.on)', host).forEach(function (s) { if (s._k) twKill(s._k); s.remove(); });
  var nu = document.createElement('span'); nu.className = 'on'; nu.textContent = text;
  if (instant || !cur || rm()) { host.textContent = ''; host.appendChild(nu); return; }
  cur.classList.remove('on'); host.appendChild(nu);
  var d = dir < 0 ? -1 : 1, old = cur;
  old._k = 'ln' + (++SEQ); nu._k = 'ln' + (++SEQ); nu.style.opacity = '0';
  tw({ key: old._k, from: 0, to: 1, dur: .24, ease: LIN, keepRM: true, set: function (v) { old.style.opacity = Math.max(0, 1 - v * 2.2); old.style.transform = 'translateY(' + (-7 * d * EO(v)).toFixed(2) + 'px)'; }, done: function () { if (old.parentNode) old.remove(); } });
  tw({ key: nu._k, from: 0, to: 1, dur: .24, ease: LIN, keepRM: true, set: function (v) { nu.style.opacity = clamp((v - 0.3) / 0.7, 0, 1); nu.style.transform = 'translateY(' + (7 * d * (1 - EO(v))).toFixed(2) + 'px)'; }, done: function () { nu.style.opacity = ''; nu.style.transform = ''; } });
}
/* mờ ra → đổi → mờ vào (110 + 110 ms); gọi chồng thì đi tiếp từ độ mờ đang hiện */
function fadeSwap(el, apply, key) {
  if (!el) { apply(); return; }
  if (rm()) { apply(); el.style.opacity = ''; return; }
  var from = el.style.opacity === '' ? 1 : +el.style.opacity;
  tw({ key: key, from: from, to: 0, dur: .11 * Math.max(from, .2), ease: LIN, set: function (v) { el.style.opacity = v; }, done: function () {
    apply(); tw({ key: key, from: 0, to: 1, dur: .11, ease: LIN, set: function (v) { el.style.opacity = v; }, done: function () { el.style.opacity = ''; } });
  } });
}
/* hiện / ẩn: vào 240 ms --eo trồi 8px · ra 180 ms --eio rồi hidden */
function presence(el, on, op) {
  if (!el) return; op = op || {};
  var key = 'pr' + (el._pk || (el._pk = ++SEQ)), k0 = el.hidden ? 0 : (el._pv != null ? el._pv : 1);
  function fx(v) { el.style.opacity = v; el.style.transform = rm() ? '' : 'translateY(' + ((1 - v) * (op.dy == null ? 8 : op.dy)).toFixed(2) + 'px)'; }
  if (op.instant || rm()) { twKill(key); el._pv = on ? 1 : 0; el.hidden = !on; el.style.opacity = ''; el.style.transform = ''; return; }
  if (on) { if (!el.hidden && k0 >= 1 && !op.force) return; el.hidden = false; } else if (el.hidden) { twKill(key); el._pv = 0; return; }
  fx(k0);
  tw({ key: key, from: k0, to: on ? 1 : 0, dur: on ? .24 : .18, delay: op.delay || 0, pre: false, ease: on ? EO : EIO,
       set: function (v) { el._pv = v; fx(v); }, done: function () { if (!on) el.hidden = true; el.style.opacity = ''; el.style.transform = ''; } });
}
/* số đếm lên / xuống (ease-out bậc 3) */
function countTo(el, from, to, dur, delay) {
  if (!el) return;
  var key = 'ct' + (el._ck || (el._ck = ++SEQ));
  if (rm() || from === to) { twKill(key); el.textContent = String(to); return; }
  tw({ key: key, from: from, to: to, dur: dur || .5, delay: delay || 0, ease: function (k) { return 1 - Math.pow(1 - k, 3); }, set: function (v) { el.textContent = String(Math.round(v)); } });
}
/* bộ số lăn cho đồng hồ đếm: mỗi chữ số đổi thì chữ cũ trượt lên, chữ mới trồi từ dưới (240 ms --eo) */
function rollHTML(str) {
  var h = '';
  for (var i = 0; i < str.length; i++) h += str[i] === ':' ? '<span class="sep">:</span>' : '<span class="dg"><span>' + str[i] + '</span></span>';
  return h;
}
function rollSet(host, str) {
  if (!host) return;
  if (host._s && host._s.length !== str.length) host._s = null;
  if (!host._s) { host.innerHTML = rollHTML(str); host._s = str; return; }
  var dgs = $$(':scope>.dg', host), di = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === ':') continue;
    var box = dgs[di++];
    if (host._s[i] === str[i]) continue;
    rollDigit(box, str[i]);
  }
  host._s = str;
}
function rollDigit(box, ch) {
  var old = box.lastElementChild, nu = document.createElement('span');
  nu.textContent = ch; box.appendChild(nu);
  $$(':scope>span', box).forEach(function (s) { if (s !== old && s !== nu) s.remove(); });
  if (rm()) { if (old) old.remove(); return; }
  var key = 'rd' + (box._k || (box._k = ++SEQ));
  tw({ key: key, from: 0, to: 1, dur: .24, ease: EO, set: function (v) {
    if (old) { old.style.transform = 'translateY(' + (-100 * v).toFixed(2) + '%)'; old.style.opacity = 1 - v; }
    nu.style.transform = 'translateY(' + (100 * (1 - v)).toFixed(2) + '%)'; nu.style.opacity = v;
  }, done: function () { if (old && old.parentNode) old.remove(); nu.style.transform = ''; nu.style.opacity = ''; } });
}

/* ============================== BIỂU TƯỢNG (lưới 24, nét 1,5 — từ Figma) ============================== */
var IC = {
  check: '<path d="M3 12.5L9 18.5L21 5.5"/>',
  close: '<path d="M4 4L20 20M20 4L4 20"/>',
  plus: '<path d="M12 4V20M4 12H20"/>',
  right: '<path d="M3 12H21M14 19L21 12L14 5"/>',
  left: '<path d="M21 12H3M10 19L3 12L10 5"/>',
  down: '<path d="M12 3V21M19 14L12 21L5 14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11V16.5" stroke-linecap="round"/><path d="M12 7.6V7.9" stroke-width="1.75" stroke-linecap="round"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13" stroke-linecap="round"/><path d="M12 16.1V16.4" stroke-width="1.75" stroke-linecap="round"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="M15 15L21.5 21.5"/>',
  user: '<circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21C3.5 16.2 7.3 13.5 12 13.5C16.7 13.5 20.5 16.2 20.5 21"/>',
  save: '<path d="M12 3V16M6 10.5L12 16.5L18 10.5M3 21H21"/>',
  cal: '<path d="M3 11H21M8 3V8M16 3V8M3 6H21V21H3V6Z"/>',
  swap: '<path d="M3 8.5H18M14.5 12L18 8.5L14.5 5"/><path d="M21 15.5H6M9.5 19L6 15.5L9.5 12"/>',
  lock: '<path d="M8 10V7C8 4.2 9.8 2.5 12 2.5C14.2 2.5 16 4.2 16 7V10M4 10H20V21H4V10Z"/>',
  chev: '<path d="M9 4L17 12L9 20"/>'
};
function ico(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }
var WM_SVG = '<svg viewBox="0 0 359 115" aria-hidden="true"><use href="#wordmark"/></svg>';

/* ============================== TRẠNG THÁI ============================== */
var S = {
  dev: '', view: 'loading', page: null,
  st: null,                 /* state đã xác minh (từ máy chủ) */
  pub: null,                /* thông tin tuần công khai (chưa xác minh) */
  q: '', results: [], sel: 0, qSeq: 0, qCache: {}, qState: 'idle', qErr: '',
  qMore: false,             /* máy chủ còn hơn 6 người khớp → nhắc gõ thêm */
  qShown: '',               /* chữ gõ (đã chuẩn hoá) của danh sách đang hiện — để tô phần khớp */
  qNeed: 0,                 /* máy chủ cũ đòi ≥ 2 chữ (phản hồi có need) → 2: không gửi lượt 1 chữ nữa */
  qSlow: false,             /* lượt tìm đầu đã chờ quá 400 ms → mới hiện "Đang tìm…" */
  qFly: '',                 /* chữ gõ đang chờ máy chủ trả lời — gõ lại đúng chữ đó (Telex: ee → ê) thì không hỏi lại */
  qHold: 0,                 /* máy chủ báo tìm quá nhiều (cham_lai) → ngừng hỏi tới mốc này (ms) */
  who: null,                /* {id, short, coach} người vừa chọn ở bước tìm tên */
  pin: '', pinShow: -1, pinErr: '', remember: true,
  picks: [], addMode: false, gone: [], sug: null,
  chg: { from: null, to: null },
  notice: null,             /* thông báo ép (lỗi gửi, vừa hết chỗ …) */
  pending: null, sending: false, net: false,
  tkVariant: 'home', moved: null,
  lastFetch: 0, refreshing: false, refreshAgain: false,
  gen: 0                    /* thế hệ state: tăng khi đăng xuất / xác minh / gửi lệnh ghi → phản hồi lt_boot cũ hơn bị bỏ */
};
function bumpGen() { S.gen++; }

/* ---------- máy · mã nhớ máy · state lưu ---------- */
function devId() {
  var d = LS.get('lt_dev');
  if (d && /^[A-Za-z0-9_-]{16,64}$/.test(d)) return d;
  d = rand(22); LS.set('lt_dev', d);
  return d;
}
var TOK = {
  get: function () {
    var t = LS.get('lt_tok'), e = +LS.get('lt_tokExp') || 0;
    if (t && e > now()) return t;
    if (t) { LS.del('lt_tok'); LS.del('lt_tokExp'); LS.del('lt_st'); }   /* mã nhớ máy đã hết hạn: bỏ luôn lịch đã lưu (dữ liệu cá nhân) */
    return SS.get('lt_tok') || '';
  },
  remembered: function () { return !!LS.get('lt_tok'); },
  set: function (tok, exp, remember) { this.clear(); if (remember) { LS.set('lt_tok', tok); LS.set('lt_tokExp', String(exp)); } else SS.set('lt_tok', tok); },
  clear: function () { LS.del('lt_tok'); LS.del('lt_tokExp'); SS.del('lt_tok'); LS.del('lt_st'); SS.del('lt_st'); }
};
function cleanSt(r) {
  var o = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k) && ['ok', 'error', 'why', 'full', 'dup', 'tok', 'tokExp', 'detail', 'date', 'h'].indexOf(k) < 0) o[k] = r[k];
  return o;
}
function saveSt() { if (!S.st) return; var v = JSON.stringify({ at: now(), st: S.st }); (TOK.remembered() ? LS : SS).set('lt_st', v); }
function loadSt() { var o = jget(LS, 'lt_st') || jget(SS, 'lt_st'); return o && o.st && o.st.week ? o.st : null; }
/* lệnh ghi đang chờ (lt_pend): KHÔNG lưu mã phiên (lấy mã hiện hành lúc gửi); ghi kèm chủ lệnh (who) để máy dùng chung
   không bao giờ mở lại lệnh của người khác */
function savePend() {
  if (!S.pending) { LS.del('lt_pend'); return; }
  var p = S.pending, strip = function (x) { var b = Object.assign({}, x.body); delete b.tok; return { action: x.action, body: b, at: x.at, tries: x.tries, who: x.who }; };
  var o = strip(p); if (p.prev) o.prev = strip(p.prev);
  LS.set('lt_pend', JSON.stringify(o));
}
/* mã hội viên của state (lấy từ mã phiếu "B012DY-W43") — chỉ để so chủ lệnh chờ, không hiện ra */
function whoOf(st) { return st && st.mine && st.mine.code ? String(st.mine.code).split('-W')[0] : ''; }
/* lệnh ghi mới: mã yêu cầu mới + bản phiếu đang xem (base: máy chủ từ chối nếu phiếu đã đổi bản → không thành ghi hai lần);
   prev = lệnh trước chưa rõ kết quả (để nhận ra nếu chính nó đã vào sổ) */
function newPending(action, body, prev) {
  var p = { action: action, body: Object.assign({ rid: rid(), week: S.st.week.key, base: S.st.mine.ver }, body), at: now(), tries: 0, who: whoOf(S.st) };
  if (prev) p.prev = { action: prev.action, body: prev.body, at: prev.at, tries: prev.tries, who: prev.who };
  return p;
}

/* ============================== MÁY CHỦ ============================== */
function NetErr(kind) { this.kind = kind; }
var INFLIGHT = 0, BUSYT = 0;
function busy(d) {
  INFLIGHT = Math.max(0, INFLIGHT + d);
  var el = $('#busy'); if (!el) return;
  clearTimeout(BUSYT);
  if (INFLIGHT > 0) BUSYT = setTimeout(function () { el.classList.add('on'); }, 160);
  else el.classList.remove('on');
}
function call(action, body, tmo) {
  if (!API_URL) return Promise.reject(new NetErr('cfg'));
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null, t0 = Date.now();
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, tmo || T_READ);
  busy(1);
  var payload = JSON.stringify(Object.assign({ action: action, dev: S.dev }, body || {}));
  var init = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, credentials: 'omit', cache: 'no-store',
               redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined };
  return (QC ? window.QCB.fetch(API_URL, init) : fetch(API_URL, init))
    .then(function (res) { if (!res.ok) throw new NetErr('http'); return res.json().catch(function () { throw new NetErr('parse'); }); })
    .then(function (j) {
      var t1 = Date.now();
      if (j && typeof j.now === 'number' && t1 - t0 < 15000) {
        var sk = j.now - (t0 + t1) / 2, jump = Math.abs(sk - SKEW) > 20000;
        SKEW = sk; LS.set('lt_skew', String(Math.round(SKEW)));
        if (jump) setTimeout(clockTick, 0);
      }
      return j;
    })
    .catch(function (e) { throw e instanceof NetErr ? e : new NetErr(e && e.name === 'AbortError' ? 'timeout' : 'net'); })
    .then(function (j) { clearTimeout(timer); busy(-1); return j; }, function (e) { clearTimeout(timer); busy(-1); throw e; });
}
function rid() { return rand(20); }

/* ============================== B0B ============================== */
var BOB = { d: null, m: null, hostD: null, hostM: null, mood: 'observe', fb: false };
var BOB_IMG = { observe: 'b0b-quan-sat', greet: 'b0b-chao', done: 'b0b-chao', doubt: 'b0b-nghi', sleep: 'b0b-ngu', alert: 'b0b-nghi' };
function bobInit() {
  BOB.hostD = $('#bobD');
  BOB.hostM = document.createElement('div'); BOB.hostM.className = 'bob bob-m'; BOB.hostM.setAttribute('aria-hidden', 'true');
  /* dựng WebGL SAU khung hình đầu (trang hiện trước, B0B mờ dần vào) và chỉ dựng bản đang thấy; bản kia dựng khi đổi cỡ màn */
  requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(function () { bobMount(desk()); }, 0); }); });
  MQ_DESK.addEventListener && MQ_DESK.addEventListener('change', function () { bobMount(desk()); });
  /* nhìn theo con trỏ: b0b.js tự nghe pointermove trên window (một listener chung) */
}
function bobMount(isDesk) {
  var key = isDesk ? 'd' : 'm', host = isDesk ? BOB.hostD : BOB.hostM;
  if (BOB[key] || host._fb) return;
  var b = null;
  if (!BOB.fb && window.B0B && typeof window.B0B.mount === 'function') {
    try { b = window.B0B.mount(host, isDesk ? { size: 100, mood: BOB.mood } : { size: 56, markSide: 'left', mood: BOB.mood }); } catch (e) { b = null; }
  }
  if (b) BOB[key] = b;
  else {
    BOB.fb = true; host._fb = true;
    host.innerHTML = '<i class="bob-sh"></i><img class="bob-fb" alt="" src="img/' + (BOB_IMG[BOB.mood] || BOB_IMG.observe) + '.webp" decoding="async">';
  }
  host.classList.add('on');
}
function bobMood(m) {
  if (BOB.mood === m) return;
  BOB.mood = m;
  [BOB.d, BOB.m].forEach(function (b) { if (b && b.mood) try { b.mood(m); } catch (e) { /* B0B không bao giờ được làm hỏng trang */ } });
  [BOB.hostD, BOB.hostM].forEach(function (h) { var img = h && h._fb && h.querySelector('img.bob-fb'); if (img) img.src = 'img/' + (BOB_IMG[m] || BOB_IMG.observe) + '.webp'; });
}
function bobGlance(el) {
  var b = desk() ? BOB.d : BOB.m; if (!b || !el) return;
  var r = el.getBoundingClientRect();
  try { if (b.react) b.react('glance', r.left + r.width / 2, r.top + r.height / 2); } catch (e) { /* bỏ qua */ }
}
function bobReact(kind) { [BOB.d, BOB.m].forEach(function (b) { if (b && b.react) try { b.react(kind); } catch (e) { /* bỏ qua */ } }); }
function bobSlot(page) { var slot = page && page.querySelector('.bob-slot'); if (slot && BOB.hostM.parentNode !== slot) slot.appendChild(BOB.hostM); }

/* ---------- B0B · cầu nối cảm giác (v1.1): trang KỂ điều đang xảy ra, B0B tự quyết định cảm và phản ứng ----------
   Không chen vào logic đặt lịch: đọc trạng thái S 8 lần / giây + nghe sự kiện DOM ở cấp document. Lỗi ở đây không bao giờ lan ra trang. */
var BB = { v: '', from: '', nres: -1, rkey: '', first: '', pin: -1, perr: '', picks: null, chg: '', ready: false, send: false, sec: -1, hov: null, hovT: 0, notice: '', toast: false, sheet: false, tk: '' };
function bobEmit(type, data) {
  if (BOB.fb || !window.B0B || typeof window.B0B.emit !== 'function') return;
  try { window.B0B.emit(type, data || {}); } catch (e) { /* B0B không bao giờ được làm hỏng trang */ }
}
var BBC = null;
/* vị trí con trỏ chữ trong ô tìm (0–1 theo bề ngang ô): B0B đọc theo chữ đang gõ */
function bobCaret(inp) {
  try {
    var cs = getComputedStyle(inp), r = inp.getBoundingClientRect(); if (!r.width) return .5;
    if (!BBC) BBC = document.createElement('canvas').getContext('2d');
    BBC.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
    var x = inp.offsetLeft + parseFloat(cs.paddingLeft || 0) + BBC.measureText(inp.value.slice(0, pos)).width;
    var host = inp.parentNode && inp.parentNode.getBoundingClientRect ? inp.parentNode.getBoundingClientRect() : r;
    return Math.max(.04, Math.min(.96, (r.left - host.left + x - inp.offsetLeft) / Math.max(1, host.width)));
  } catch (e) { return .5; }
}
function bobVisible(sel) { var a = document.querySelectorAll(sel); for (var i = 0; i < a.length; i++) { var r = a[i].getBoundingClientRect(); if (r.width && r.height) return a[i]; } return null; }
function bobBridge() {
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || t.id !== 'q') return;
    bobEmit('type', { el: t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('sbox') ? t.parentNode : t, ax: bobCaret(t), space: / $/.test(t.value) });
  }, true);
  /* liếc thứ con trỏ đang trỏ (ô lịch, dòng tên, nút) — thưa ra, không giật theo từng điểm ảnh */
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse' || !e.target || !e.target.closest) return;
    var el = e.target.closest('#wkb .c, .rrow, .pk, .btn, .ib, .tk-fit, .pin, .chk');
    if (!el || el === BB.hov) return;
    var t = performance.now(); if (t - BB.hovT < 140) return;
    BB.hov = el; BB.hovT = t; bobEmit('hover', { el: el, ms: 700 });
  }, true);
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var c = t.closest('#wkb .c');
    if (c && (c.getAttribute('aria-disabled') === 'true' || (S.view === 'book' && S.st && S.picks.length >= maxPicks() && !c.classList.contains('sel') && !S.picks.some(function (p) { return p.date === c.dataset.d; })))) bobEmit('nope', { el: c });
    if (t.closest('[data-a="png"]')) bobEmit('save', {});
  }, true);
  window.addEventListener('offline', function () { bobEmit('offline', { el: $('#hd') }); });
  window.addEventListener('online', function () { bobEmit('online', {}); });
  setInterval(function () { try { bobWatch(); } catch (e) { /* bỏ qua */ } }, 120);
}
function bobPicksKey(a) { return a.map(function (p) { return p.date + '@' + p.h; }); }
function bobCell(k) { var x = k.split('@'); return document.querySelector('#wkb .c[data-d="' + x[0] + '"][data-h="' + x[1] + '"]'); }
function bobWatch() {
  if (!BOB.d && !BOB.m) return;
  var v = S.view, page = S.page;
  if (v !== BB.v) {
    var from = BB.v; BB.v = v; BB.nres = -1; BB.rkey = ''; BB.first = ''; BB.pin = -1; BB.perr = ''; BB.picks = null; BB.chg = ''; BB.ready = false; BB.send = false; BB.tk = '';
    var el = v === 'find' ? $('.sbox') : v === 'verify' ? $('#pins') : v === 'closed' || v === 'lock' ? $('#cdv') : page && page.querySelector('h1');
    bobEmit('screen', { view: v, el: el, ms: 1800 });
    if (from === 'find' && (v === 'verify' || v === 'lock')) bobEmit('choose', { el: $('#pins') });
    if (from === 'verify' && v !== 'find' && v !== 'lock' && v !== 'verify') bobEmit('pinok', {});
    if (v === 'lock') bobEmit('lock', {});
    if (from === 'closed' && v === 'find' && BB.sec >= 0 && BB.sec <= 3) bobEmit('open', {});
  }
  /* 01 tìm tên */
  if (v === 'find') {
    var rows = page ? page.querySelectorAll('.rrow') : [], n = S.qState === 'done' ? S.results.length : S.qState === 'none' ? 0 : -1;
    var rk = n > 0 ? S.results.map(function (x) { return x.id; }).join(',') : String(n);
    if (rk !== BB.rkey && n >= 0) {
      var first = n > 0 ? String(S.results[0].id) : '';
      BB.rkey = rk;
      /* tìm theo từng chữ gõ: người đứng đầu đổi (hoặc từ không ai → có người) thì mắt sáng lên, liếc dòng đầu;
         chỉ phần đuôi danh sách đổi thì liếc nhẹ dòng cuối — không giật mình theo từng phím */
      if (n > 0 && rows.length) {
        if (first !== BB.first) bobEmit('results', { el: rows[0], n: n, more: !!S.qMore || n >= 6, last: rows[rows.length - 1] });
        else bobEmit('hover', { el: rows[rows.length - 1], ms: 600 });
      } else if (n === 0) bobEmit('none', { el: $('.sbox') });
      BB.first = first;
    }
  }
  /* 02 xác minh: B0B quay đi khi mã đang gõ */
  if (v === 'verify') {
    var pn = (S.pin || '').length;
    if (pn !== BB.pin) { BB.pin = pn; bobEmit('pin', { n: pn, el: $('#pins') }); }
    if (S.pinErr && S.pinErr !== BB.perr) bobEmit('pinbad', {});
    BB.perr = S.pinErr || '';
  }
  /* 03 bảng tuần · đổi lịch */
  if ((v === 'book' || v === 'change') && S.st) {
    if (v === 'book') {
      var cur = bobPicksKey(S.picks), prev = BB.picks;
      if (prev) {
        var added = cur.filter(function (k) { return prev.indexOf(k) < 0; }), gone = prev.filter(function (k) { return cur.indexOf(k) < 0; });
        if (added.length) bobEmit('pick', { el: bobCell(added[added.length - 1]), n: cur.length, max: maxPicks() });
        else if (gone.length) bobEmit('unpick', { el: bobCell(gone[0]) });
      }
      BB.picks = cur;
      var ready = cur.length >= minPicks();
      if (ready && !BB.ready) bobEmit('ready', { el: bobVisible('#cta, #ctaM') });
      BB.ready = ready;
    } else {
      var ck = (S.chg.from ? S.chg.from.date + '@' + S.chg.from.h : '') + '>' + (S.chg.to ? S.chg.to.date + '@' + S.chg.to.h : '');
      if (BB.chg && ck !== BB.chg) {
        var last = S.chg.to || S.chg.from;
        if (last) bobEmit('pick', { el: bobCell(last.date + '@' + last.h), n: 0 });
        if (S.chg.from && S.chg.to) bobEmit('ready', { el: bobVisible('#cta, #ctaM') });
      }
      BB.chg = ck;
    }
    if (S.sending && !BB.send) bobEmit('send', { el: bobVisible('#cta, #ctaM') });
    if (!S.sending && BB.send) bobEmit('sent', {});
    BB.send = !!S.sending;
    var nk = S.notice ? (S.notice.type || '') + (S.notice.title || '') : '';
    if (nk && nk !== BB.notice && S.notice.tone === 'warn') bobEmit('error', { el: page && page.querySelector('.note, .notice, [data-a="note"]') });
    BB.notice = nk;
  }
  /* 04 phiếu: đặt / đổi / thêm xong → nhảy mừng rồi ngắm phiếu */
  if (v === 'ticket' && S.st) {
    var tkKey = S.tkVariant + ':' + S.st.mine.ver;
    if (tkKey !== BB.tk) {
      var tk = bobVisible('#tkW, #tkT, .tk-fit');
      if (BB.tk === '' && S.tkVariant && S.tkVariant !== 'home') bobEmit('booked', { el: tk });
      else bobEmit('ticket', { el: tk, ms: 4000 });
      BB.tk = tkKey;
    }
  }
  /* màn chờ: 60 giây cuối B0B tỉnh, 10 giây cuối con ngươi Acid và đếm cùng */
  if (v === 'closed') {
    var w = S.st ? S.st.week : S.pub ? S.pub.week : null, sec = w ? Math.ceil((w.nextOpen - now()) / 1000) : -1;
    if (sec !== BB.sec) { BB.sec = sec; if (sec >= 0 && sec <= 62) bobEmit('countdown', { sec: sec, el: $('#cdv') }); }
  } else if (v !== 'find') BB.sec = -1;
  /* thông báo nổi + cửa sổ */
  var to = $('#toast'), ton = !!(to && to.classList.contains('on'));
  if (ton && !BB.toast) bobEmit('toast', { el: to });
  BB.toast = ton;
  var sh = $('#sheet'), dr = $('#drawer'), son = !!((sh && !sh.hidden && sh.classList.contains('on')) || (dr && !dr.hidden && dr.classList.contains('on')));
  if (son && !BB.sheet) bobEmit('sheet', { el: sh && !sh.hidden ? sh : dr });
  BB.sheet = son;
}

/* ============================== HEADER ============================== */
var HD = { flow: '', steps: null };
var FLOW_BOOK = ['01 Tên', '02 Xác minh', '03 Lịch', '04 Phiếu'], FLOW_CHG = ['01 Phiếu', '02 Đổi lịch', '03 Phiếu mới'], FLOW_ADD = ['01 Phiếu', '02 Thêm buổi', '03 Phiếu mới'];
function setSig(on, d, m) {
  var sig = $('#sig'); sig.classList.toggle('off', !on);
  line($('#sigD'), d, 1); line($('#sigM'), m, 1);
}
function setSteps(flow, cur, back) {
  /* flow 'none': màn đứng ngoài luồng (E01 Chưa mở đặt) — header không có dãy bước */
  var list = flow === 'none' ? [] : flow === 'chg' ? FLOW_CHG : flow === 'add' ? FLOW_ADD : FLOW_BOOK, el = $('#steps');
  var key = flow + ':' + cur + ':' + (back ? 1 : 0);
  if (HD.steps === key) return;
  var prev = HD.steps; HD.steps = key;
  var h = '';
  list.forEach(function (t, i) {
    var st = cur < 0 ? '' : i < cur ? 'done' : i === cur ? 'cur' : '';
    var fresh = st === 'done' && prev && prev.split(':')[0] === flow && +prev.split(':')[1] <= i ? ' fresh' : '';
    var go = back && i === 0 && st === 'done' ? ' go' : '';
    if (i) h += '<li class="step-sep" aria-hidden="true">·</li>';
    h += '<li class="step ' + st + fresh + go + '"' + (go ? ' data-a="back-ticket" role="button" tabindex="0"' : '') + (st === 'cur' ? ' aria-current="step"' : '') + '>' +
         '<svg class="ck" viewBox="0 0 13 13" aria-hidden="true"><path d="M1.6 7L5 10.2L11.4 3"/></svg><span>' + esc(t) + '</span></li>';
  });
  var apply = function () { el.innerHTML = h; };
  if (prev && prev.split(':')[0] !== flow) fadeSwap(el, apply, 'steps'); else apply();
  /* mobile: "03 / 04" hoặc nút "← Phiếu" ở luồng đổi / thêm */
  var n = $('#stepn');
  if (back) {
    if (!n.classList.contains('stepn-back')) { n.outerHTML = '<button class="stepn m stepn-back" id="stepn" data-a="back-ticket" aria-label="Quay lại phiếu">' + ico('left') + '<span>Phiếu</span></button>'; }
  } else {
    if (n.classList.contains('stepn-back')) { n.outerHTML = '<span class="stepn m" id="stepn"></span>'; n = $('#stepn'); }
    line(n.querySelector('.ln') || (n.innerHTML = lnHTML(''), n.querySelector('.ln')), cur < 0 ? '' : pad2(cur + 1) + ' / ' + pad2(list.length), 1);
  }
}
var CLOCKT = 0;
function clockTick() {
  var p = parts(now());
  var txt = 'Hà Nội · ' + DOW[p.dow] + ' ' + pad2(p.d) + '.' + pad2(p.m) + ' · ' + pad2(p.hh) + ':' + pad2(p.mi);
  var c = $('#clock'); if (c.textContent !== txt) c.textContent = txt;
  clearTimeout(CLOCKT); CLOCKT = setTimeout(clockTick, 60000 - (now() % 60000) + 50);
  nowLine();
}
/* tín hiệu header theo màn + tuần */
function headerFor() {
  var w = S.st ? S.st.week : S.pub ? S.pub.week : weekCtx(now());
  if (S.net) { setSig(false, 'Mất kết nối', 'Mất kết nối'); return; }
  if (S.view === 'closed') { setSig(false, 'Chưa mở đặt · Tuần ' + w.nextNo, 'Chưa mở · T' + w.nextNo); return; }
  if (S.view === 'fail' || S.view === 'loading') { setSig(false, 'Đang kết nối', 'Đang kết nối'); return; }
  if (w.phase === 'open') { setSig(true, 'Đang mở đặt · Tuần ' + w.no, 'Mở đặt · T' + w.no); return; }
  var has = S.st && S.st.mine && S.st.mine.sessions.length;
  if (has) setSig(true, 'Đổi lịch · Tuần ' + w.no, 'Đổi lịch · T' + w.no);
  else setSig(true, 'Đặt muộn · Tuần ' + w.no, 'Đặt muộn · T' + w.no);
}

/* ============================== KHUNG MÀN (vào / ra như app coach) ============================== */
function show(page, dir, instant) {
  var main = $('#main'), cur = S.page;
  if (cur && cur !== page) {
    if (instant || rm()) cur.remove();
    else {
      /* màn đang ra còn trong DOM ~230 ms: bỏ id để mọi $('#…') tìm đúng màn mới, và không cho tiêu điểm / trình đọc màn hình vào */
      $$('[id]', cur).forEach(function (e) { e.removeAttribute('id'); });
      cur.inert = true; cur.setAttribute('aria-hidden', 'true');
      cur.classList.remove('enter-fwd', 'enter-back'); void cur.offsetWidth;
      cur.classList.add(dir === 'back' ? 'leave-back' : 'leave-fwd');
      setTimeout(function () { if (cur.parentNode) cur.remove(); }, 230);
    }
  }
  main.appendChild(page);
  if (!instant && !rm()) {
    void page.offsetWidth;
    page.classList.add(dir === 'back' ? 'enter-back' : 'enter-fwd');
    setTimeout(function () { page.classList.remove('enter-fwd', 'enter-back'); }, 760);
  }
  S.page = page;
  bobSlot(page);
  if (desk()) main.scrollTop = 0; else if (window.scrollY > 0) window.scrollTo(0, 0);
}
function pageEl(cls, html) { var p = document.createElement('section'); p.className = 'page ' + (cls || ''); p.innerHTML = html; return p; }

/* sàn desktop + thanh đáy mobile: đổi nội dung bằng fade-through (tắt 100 ms rồi mới vào 220 ms, trồi 8px) */
function swapRegion(el, html, instant) {
  if (!el) return;
  var key = 'rg' + el.id;
  if (el._html === html) return;
  el._html = html;
  if (instant || rm() || !el.firstElementChild) { twKill(key); el.innerHTML = html; el.style.opacity = ''; el.style.transform = ''; regionDone(el); return; }
  var from = el.style.opacity === '' ? 1 : +el.style.opacity;
  tw({ key: key, from: from, to: 0, dur: .1 * Math.max(from, .3), ease: LIN, set: function (v) { el.style.opacity = v; }, done: function () {
    el.innerHTML = el._html; regionDone(el);
    tw({ key: key, from: 0, to: 1, dur: .22, ease: EO, set: function (v) { el.style.opacity = v; el.style.transform = 'translateY(' + ((1 - v) * 8).toFixed(2) + 'px)'; }, done: function () { el.style.opacity = ''; el.style.transform = ''; } });
  } });
}
function regionDone(el) {
  if (el.id === 'mbar') { $('#app').classList.toggle('has-mbar', !!el.innerHTML.trim()); mbarSize(); }
  if (el._after) { var f = el._after; el._after = null; f(); }
}
function setFloor(html, after, instant) { var f = $('#floor'); f._after = after || null; swapRegion(f, html, instant); if (f._html === html && after && !f._after) after(); }
function setMbar(html, after, instant) { var f = $('#mbar'); f._after = after || null; swapRegion(f, html, instant); if (f._html === html && after && !f._after) after(); }
function mbarSize() { var b = $('#mbar'); $('#app').style.setProperty('--mbh', (b.offsetHeight + 16) + 'px'); }

/* ============================== ĐIỀU HƯỚNG ============================== */
function go(view, dir, op) {
  op = op || {};
  closeSheet(true); closeDrawer(true);
  if (op.morph && view === 'ticket' && S.view === 'ticket' && S.page && S.page.isConnected) { morphTicket(op); return; }
  var prev = S.view; S.view = view;
  var r = VIEWS[view](op);
  show(r.page, dir || 'fwd', op.instant);
  setFloor(r.floor || '', r.floorAfter, op.instant);
  setMbar(r.mbar || '', r.mbarAfter, op.instant);
  $('#mbar').classList.toggle('mb-ke', !!r.mbarKe);   /* E01: kẻ trên thanh đáy 10 % (các thanh khác 8 %) */
  headerFor();
  setSteps(r.flow || 'book', r.step == null ? -1 : r.step, !!r.back);
  bobMood(r.mood || 'observe');
  if (r.after) r.after();
  if (op.push && history.pushState) history.pushState({ v: view }, '');
  /* tiêu điểm vào màn mới (ô nhập nếu có, không thì tiêu đề) — không để rơi về <body> */
  if (prev !== view) { var f = r.page.querySelector('[data-focus]') || r.page.querySelector('h1[tabindex]'); if (f && !op.noFocus) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } } }
}
/* phiếu → phiếu CÙNG một tờ (Xong: "Đã đặt / thêm / đổi lịch" → "Lịch tập tuần"): tờ phiếu đứng yên — không trượt trang, không diễn lại
   vé vào, giấy 3D giữ nguyên dáng (cùng phần tử, cùng canvas). Chỉ chữ chào đổi kiểu fade-through như thanh nút đáy / sàn (tắt 100 ms →
   vào 220 ms, trồi 8 px). Khối chào đổi cao (2 dòng phụ → 1) thì phiếu trượt êm tới chỗ mới: dịch khung phiếu bằng translate (đo của tk3d
   lấy theo khung phiếu nên không lệch), giữ nguyên cỡ phiếu trừ khi không còn vừa màn */
function morphTicket(op) {
  var page = S.page, r = VIEWS.ticket(op), tx = page.querySelector('.hello-tx'), ntx = r.page.querySelector('.hello-tx');
  var st = page.querySelector('.tk-stage'), fit = page.querySelector('#tkfit');
  /* vé nào khác nội dung (desktop: bỏ "· MỚI" của phiếu đã đổi) thì thay riêng vé đó tại chỗ; là vé đang hiện → bản 3D gắn lại ngay ở
     dáng cuối (đường làm mới ngầm: không thả lỏng lại). Vé dọc mobile không đổi → giữ nguyên phần tử */
  var any = false, cur = false;
  ['W', 'T'].forEach(function (k) {
    var el = page.querySelector('#tk' + k), nel = r.page.querySelector('#tk' + k);
    if (!el || !nel || page['_tk' + k] === r.page['_tk' + k]) return;
    el.parentNode.replaceChild(nel, el); page['_tk' + k] = r.page['_tk' + k]; any = true;
    if (k === (desk() ? 'W' : 'T')) cur = true;
  });
  if (any) { tkFit(true); tkPaper(); }
  if (cur) tk3dGo({ instant: true });
  setFloor(r.floor || '', r.floorAfter);
  setMbar(r.mbar || '', function () { if (S.view === 'ticket' && S.page === page) { tkFit(true); tkPaper(); } });
  $('#mbar').classList.toggle('mb-ke', !!r.mbarKe);
  headerFor();
  setSteps(r.flow || 'book', r.step == null ? -1 : r.step, !!r.back);
  bobMood(r.mood || 'observe');
  if (op.push && history.pushState) history.pushState({ v: 'ticket' }, '');
  if (!tx || !ntx) return;
  var html = ntx.innerHTML;
  function swap() {
    var y0 = fit ? fit.getBoundingClientRect().top : 0;
    tx.innerHTML = html;
    tkFit(true);
    var h1 = tx.querySelector('h1'); if (h1) try { h1.focus({ preventScroll: true }); } catch (e) { h1.focus(); }
    var dy = fit ? y0 - fit.getBoundingClientRect().top : 0;
    if (!st || Math.abs(dy) < .5 || rm()) { tkPaper(); return; }
    st.style.transform = 'translateY(' + dy.toFixed(2) + 'px)';
    tw({ key: 'tkslide', from: dy, to: 0, dur: .36, ease: EO, set: function (v) { st.style.transform = 'translateY(' + v.toFixed(2) + 'px)'; },
         done: function () { st.style.transform = ''; tkPaper(); } });
  }
  if (rm()) { swap(); return; }
  twKill('hello');
  tw({ key: 'hello', from: 1, to: 0, dur: .1, ease: LIN, set: function (v) { tx.style.opacity = v; }, done: function () {
    if (S.page !== page) return;
    swap();
    tw({ key: 'hello', from: 0, to: 1, dur: .22, ease: EO, set: function (v) { tx.style.opacity = v; tx.style.transform = 'translateY(' + ((1 - v) * 8).toFixed(2) + 'px)'; },
         done: function () { tx.style.opacity = ''; tx.style.transform = ''; } });
  } });
}
window.addEventListener('popstate', function () {
  if (S.view === 'verify' || S.view === 'lock') { go('find', 'back'); return; }
  if (S.view === 'change' || (S.view === 'book' && S.addMode)) leaveToTicket();
});
/* rời màn thêm buổi / đổi lịch về phiếu. Lệnh chờ chưa rõ kết quả thì bỏ (máy chủ kiểm bản phiếu nên lệnh mới sau này không thể
   thành ghi hai lần) và hỏi lại lịch ngay để phiếu hiện đúng nếu chính lệnh đó đã vào sổ */
function leaveToTicket() {
  var had = !!S.pending && !S.sending;
  S.addMode = false; S.picks = []; S.gone = []; S.notice = null; S.chg = { from: null, to: null };
  if (!S.sending) { S.pending = null; savePend(); }
  go('ticket', 'back', { variant: 'home' });
  if (had) refresh(true);
}

/* ============================== MÀN CHUNG ============================== */
function helloHTML(o) {
  return '<div class="hello rs' + (o.info ? ' hello-bk' : '') + '">' +
    '<div class="hello-row"><div class="hello-tx">' +
      '<h1 tabindex="-1">' + esc(o.title) + '</h1>' +
      (o.sub ? '<p class="sub" id="hSub">' + lnHTML(o.sub, 'wrap') + '</p>' : '') +
      (o.sub2 ? '<p class="sub">' + esc(o.sub2) + '</p>' : '') +
      (o.info ? '<p class="info m"><span>' + lnHTML(o.info) + '</span><button class="ib ib-24 ib-tron" data-a="info" aria-label="Gói & luật đặt lịch">' + ico('info') + '</button></p>' : '') +
      (o.notYou ? '<div class="notyou"><button class="btn btn-chu cs" type="button" data-a="notyou"><span class="bt">Không phải bạn?</span></button></div>' : '') +
    '</div><div class="bob-slot m"></div></div>' +
  '</div>';
}
function infoBtn() { return '<button class="btn btn-chu cm" type="button" data-a="info">' + ico('info') + '<span class="bt">Gói & luật đặt lịch</span></button>'; }
function specHTML(v, k) { return '<div class="spec"><span class="v">' + esc(v) + '</span><span class="k">' + esc(k) + '</span></div>'; }
function noticeHTML(n) {
  if (!n) return '';
  var acts = (n.sugs || []).map(function (s) { return '<button class="btn btn-s btn-phu" type="button" data-a="sug" data-d="' + esc(s.date) + '" data-h="' + esc(s.h) + '">' + esc(hm(s.h)) + '</button>'; }).join('');
  return '<div class="nt" role="status">' + ico(n.tone === 'warn' ? 'warn' : 'info') +
    '<div class="nt-tx"><p class="nt-t">' + esc(n.title) + '</p>' + (n.body ? '<p class="nt-b">' + esc(n.body) + '</p>' : '') + '</div>' +
    (acts ? '<div class="nt-act">' + acts + '</div>' : '') + '</div>';
}
function mNoteHTML(n) {
  if (!n) return '';
  return '<button class="mnt' + (n.tone === 'warn' ? ' warn' : '') + '" type="button" data-a="note"><span class="mnt-h">' + ico(n.tone === 'warn' ? 'warn' : 'info') +
    '<span class="mnt-t">' + esc(n.mtitle || n.title) + '</span>' + ico('chev', 'chev') + '</span></button>';
}
function rulesHTML() { return '<div class="rules"><p>Lịch đã đặt không thể huỷ.</p><p>Có thể đổi lịch tối đa 2 lần, trước 24 giờ.</p></div>'; }
var MRULE = 'Không huỷ · đổi tối đa 2 lần, trước 24 giờ';

/* ============================== MÀN: ĐANG KẾT NỐI / LỖI ============================== */
var VIEWS = {};
VIEWS.loading = function () {
  return { page: pageEl('pg-load', '<div class="ctr st"><div class="col"><div class="ttl rs"><p class="lbl">Đang mở lịch tập…</p></div></div></div>'), mood: 'observe', step: -1 };
};
VIEWS.fail = function () {
  var page = pageEl('pg-fail', '<div class="ctr st"><div class="col">' +
    '<div class="ttl-row rs"><div class="ttl"><h1 class="h56" tabindex="-1">Chưa kết nối được.</h1><p class="b16">Mạng chậm hoặc máy chủ đang bận. Thử lại sau vài giây.</p></div><div class="bob-slot m"></div></div>' +
    '<div class="rs r1"><button class="btn btn-phu" type="button" data-a="retry" data-focus>' + ico('swap') + '<span>Thử lại</span></button></div></div></div>');
  return { page: page, mood: 'doubt', step: -1 };
};

/* ============================== E01 · CHƯA MỞ ĐẶT ============================== */
var CDT = 0;
VIEWS.closed = function () {
  var st = S.st, w = st ? st.week : S.pub ? S.pub.week : weekCtx(now());
  var target = w.nextOpen, p = parts(target), sunTxt = 'Chủ Nhật ' + pad2(p.d) + '.' + pad2(p.m);
  var reason = '';
  if (st && st.mode === 'closed' && w.phase !== 'before' && anyOpen(w, now())) reason = closedReason(st);
  var title = reason ? reason.title : 'Chưa tới giờ đặt.';
  var subD = reason ? reason.body : 'Lịch tuần sau mở lúc 06:00 · ' + sunTxt + '.', subM = reason ? reason.body : 'Mở lúc 06:00 · ' + sunTxt + '.';
  /* nút nhắc: desktop nằm dưới đồng hồ (L56), mobile nằm ở thanh đáy rộng hết màn (M48) — Figma E01 */
  var remind = function (cls) { return '<button class="btn btn-phu' + cls + '" type="button" data-a="remind">' + ico('cal') + '<span>Đặt hẹn nhắc lịch</span></button>'; };
  var page = pageEl('pg-closed', '<div class="ctr st"><div class="col">' +
    '<div class="ttl-row rs"><div class="ttl"><h1 class="h56" tabindex="-1">' + esc(title) + '</h1><p class="b16"><span class="d">' + esc(subD) + '</span><span class="m">' + esc(subM) + '</span></p></div><div class="bob-slot m"></div></div>' +
    '<div class="cd rs r1"><span class="lbl">Còn lại · giờ : phút : giây</span><div class="cd-v" id="cdv" aria-live="off"></div></div>' +
    '<div class="rs r2 d">' + remind('') + '</div>' +
    (st ? '<div class="rs r3"><button class="btn btn-chu cs" type="button" data-a="notyou"><span class="bt">Không phải bạn?</span></button></div>' : '') +
    '</div></div>');
  var cdv = page.querySelector('#cdv'), zeroAt = 0;
  function tickCd() {
    clearTimeout(CDT);
    if (S.view !== 'closed' || S.page !== page) return;
    /* máy chủ đã dời giờ mở (vd cả tuần nghỉ lễ → mở tuần sau): dựng lại màn với giờ mới */
    var cw = S.st ? S.st.week : S.pub ? S.pub.week : null;
    if (cw && cw.nextOpen !== target && cw.nextOpen > now()) { go('closed', 'fwd', { instant: true, noFocus: true }); return; }
    var left = Math.max(0, target - now()), s = Math.floor(left / 1000);
    rollSet(cdv, pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s / 60) % 60) + ':' + pad2(s % 60));
    /* tới giờ mở: hỏi máy chủ, rồi hỏi lại mỗi 2–3,5 s (lệch ngẫu nhiên) cho tới khi máy chủ mở — lỗi mạng, máy chủ bận,
       đồng hồ máy nhanh hơn máy chủ đều không làm trang đứng ở 00:00:00. Quá 2 phút vẫn chưa mở thì thưa dần (30 s). */
    if (left <= 0) {
      if (!zeroAt) zeroAt = Date.now();
      refresh();
      CDT = setTimeout(tickCd, Date.now() - zeroAt < 120e3 ? 2000 + Math.random() * 1500 : 30e3);
      return;
    }
    zeroAt = 0;
    CDT = setTimeout(tickCd, 1000 - (now() % 1000) + 10);
  }
  return { page: page, mbar: remind(' btn-m'), mbarKe: true, mood: 'sleep', flow: 'none', step: -1,
           after: function () { clearTimeout(CDT); cdv._s = null; tickCd(); } };
};
function closedReason(st) {
  var me = st.me, w = st.week, last = w.days[w.days.length - 1];
  if (me.exp && me.exp < w.days[0]) return { title: 'Gói đã hết hạn.', body: 'Gói của bạn hết hạn ' + yy(me.exp) + '.' };
  if (me.start && me.start > last) return { title: 'Gói chưa bắt đầu.', body: 'Gói của bạn bắt đầu từ ' + dFull(me.start) + '.' };
  if (me.left <= 0) return { title: 'Gói đã hết buổi.', body: 'Gói của bạn không còn buổi để đặt.' };
  return { title: 'Tuần này đã kín lịch.', body: 'Không còn khung trống nào đặt được trong tuần.' };
}

/* ============================== 01 · TÌM TÊN (01A · 01B · E02) ============================== */
/* Gõ tới đâu ra tới đó: từ ký tự đầu tiên, đợi ngừng gõ 120 ms rồi hỏi máy chủ (luật khớp ở core.js · findRank).
   Danh sách đang hiện giữ nguyên tới khi có kết quả mới; máy chủ cũ trả need: 2 thì quay về cách cũ (≥ 2 chữ). */
var QT = 0;
var Q_IDLE = 'Gõ vài chữ trong tên của bạn, ví dụ Nam', Q_OLD = 'Gõ tên đệm và tên của bạn, ví dụ Đức Nam', Q_MORE = 'Gõ thêm để thu hẹp danh sách';
VIEWS.find = function () {
  var page = pageEl('pg-find', '<div class="ctr st"><div class="col">' +
    '<div class="ttl-row rs"><div class="ttl"><h1 class="h56">Tên của bạn là?</h1></div><div class="bob-slot m"></div></div>' +
    '<div class="find rs r1">' +
      '<label class="sbox" for="q">' + ico('search') + '<input id="q" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" maxlength="60" placeholder="Gõ tên của bạn" aria-label="Gõ tên của bạn" aria-controls="res" data-focus>' +
      '<button class="ib ib-32" type="button" data-a="clearq" aria-label="Xoá" hidden>' + ico('close') + '</button></label>' +
      '<p class="hint lbl" id="qhint" aria-live="polite"></p>' +
      '<div class="res" id="res" role="listbox" aria-label="Kết quả"></div>' +
      '<div class="miss" id="miss" hidden><p class="h22">Không tìm thấy tên của bạn.</p><p class="b14">Thử gõ tên gọi, ví dụ Nam, hoặc tên đệm và tên, ví dụ Đức Nam.<br>Gói đã hết hạn hoặc chưa kích hoạt sẽ không có trong danh sách.</p></div>' +
      '<p class="keys lbl d" id="keys" hidden>↑ ↓ chọn · enter mở lịch · esc xoá</p>' +
    '</div></div></div>');
  var inp = page.querySelector('#q');
  inp.value = S.q;
  inp.addEventListener('input', function () { S.q = inp.value; onQuery(); });
  inp.addEventListener('keydown', onFindKey);
  return { page: page, mood: 'observe', step: 0, after: function () { renderFind(true); if (S.q) onQuery(true); } };
};
function qKey(q) { return words(q).join(' '); }
/** kết quả của chữ gõ k (từ máy chủ hoặc bộ nhớ) lên màn */
function found(k, c) { S.results = c.results; S.qMore = c.more; S.qShown = k; S.sel = 0; S.qErr = ''; S.qState = c.results.length ? 'done' : 'none'; }
function onQuery(now) {
  clearTimeout(QT);
  var k = qKey(S.q), n = k ? k.split(' ').length : 0, btn = S.page.querySelector('[data-a="clearq"]');
  if (btn) btn.hidden = !S.q;
  /* chưa có chữ nào (hoặc máy chủ cũ cần ≥ 2 chữ): không hỏi máy chủ, bỏ mọi phản hồi đang về */
  if (!n || n < S.qNeed) { S.qSeq++; S.results = []; S.qMore = false; S.qShown = ''; S.qState = n ? 'need' : 'idle'; renderFind(); return; }
  if (S.qCache[k]) { S.qSeq++; found(k, S.qCache[k]); renderFind(); return; }
  /* gõ thêm vào cuối chữ cuối của một lượt đã "không ai khớp" → chắc chắn vẫn không ai (khớp đầu chữ / giữa chữ ≥ 2 ký tự) → khỏi hỏi */
  if (qNone(k)) { S.qSeq++; S.qCache[k] = { results: [], more: false }; found(k, S.qCache[k]); renderFind(); return; }
  if (S.qState !== 'done' && S.qState !== 'none') S.qState = 'wait';
  if (k === S.qFly) { renderFind(); return; }                                 /* đang hỏi đúng chữ này: chờ phản hồi đang về */
  if (Date.now() < S.qHold) { S.qState = 'err'; S.qErr = 'Bạn tìm hơi nhiều. Đợi vài phút rồi thử lại.'; renderFind(); return; }   /* vừa bị báo tìm quá nhiều: tạm không hỏi */
  QT = setTimeout(function () { search(k); }, now ? 0 : 120);
}
function qNone(k) {
  var w = k.split(' '), n = w.length, last = w[n - 1];
  for (var k0 in S.qCache) {
    var c = S.qCache[k0]; if (!c || c.results.length) continue;
    var v = k0.split(' '), l0 = v[n - 1];
    if (v.length !== n || last.length <= l0.length || last.indexOf(l0) !== 0 || (n === 1 && l0.length < 2)) continue;
    for (var i = 0; i < n - 1 && v[i] === w[i]; i++) { /* các chữ trước phải y hệt */ }
    if (i === n - 1) return true;
  }
  return false;
}
function search(k) {
  var seq = ++S.qSeq;
  S.qSlow = false; S.qFly = k;
  if (S.qState !== 'done' && S.qState !== 'none') S.qState = 'wait';   /* danh sách / hộp "không thấy" đang hiện giữ nguyên tới khi có kết quả mới */
  renderFind();
  setTimeout(function () { if (seq === S.qSeq && S.qState === 'wait') { S.qSlow = true; renderFind(); } }, 400);
  call('lt_find', { q: k }).then(function (r) {
    if (S.qFly === k) S.qFly = '';
    if (r && r.ok && r.need) S.qNeed = +r.need || 2;                                       /* máy chủ cũ: cần ≥ 2 chữ */
    else if (r && r.ok) S.qCache[k] = { results: r.results || [], more: !!r.more };       /* về muộn vẫn lưu: gõ lùi lại là có ngay */
    else if (r && r.error === 'cham_lai') S.qHold = Date.now() + 60e3;
    /* lượt cũ hơn lượt đang hiện thì bỏ — trừ khi đúng chữ đang gõ (gõ lại chữ đang chờ thì không hỏi lại, nhận phản hồi này) */
    if ((seq !== S.qSeq && k !== qKey(S.q)) || S.view !== 'find') return;
    if (r && r.ok && r.need) { S.results = []; S.qMore = false; S.qShown = ''; S.qErr = ''; S.qState = 'need'; }
    else if (r && r.ok) found(k, S.qCache[k]);
    else if (r && r.error === 'cham_lai') { S.qState = 'err'; S.qErr = 'Bạn tìm hơi nhiều. Đợi vài phút rồi thử lại.'; }
    else { S.qState = 'err'; S.qErr = 'Máy chủ đang bận. Thử lại sau vài giây.'; }
    renderFind();
  }, function () {
    if (S.qFly === k) S.qFly = '';
    if ((seq !== S.qSeq && k !== qKey(S.q)) || S.view !== 'find') return;
    S.qState = 'err'; S.qErr = 'Chưa kết nối được. Kiểm tra mạng rồi thử lại.'; renderFind();
  });
}
/* Cách khớp tốt nhất của các chữ gõ q vào ĐẦU các chữ của V, đúng thứ tự — chép nguyên prefixFit của máy chủ (core.js)
   để tô đúng những chữ máy chủ đã khớp. Trả {last, eq, at} hoặc null. */
function prefixFit(q, V) {
  var n = q.length, m = V.length, f = [], i, j, b;
  if (!n || n > m) return null;
  for (i = 0; i <= n; i++) { f.push([]); for (j = 0; j <= m; j++) f[i].push(i ? -1 : 0); }
  for (i = 1; i <= n; i++) {
    for (j = i; j <= m; j++) {
      b = f[i][j - 1];
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
/* Tô phần khớp của tên ngắn ("H. Đức Nam") với các chữ gõ q: gập dấu TỪNG ký tự bằng fold() (tiếng Việt: 1 ký tự → 1 ký tự)
   nên vị trí trên chuỗi gập trỏ đúng ký tự đang hiện; rồi khớp lại theo ba bậc của máy chủ (core.js · findRank):
   0 · liền phần cuối họ tên (họ chỉ hiện chữ cái đầu: gõ cả họ thì tô chữ cái đó) · 1 · đầu chữ, đúng thứ tự · 2 · giữa một chữ.
   Phần khớp bọc <span class="hit">; mọi chữ đều qua esc(). */
function hitHTML(short, q) {
  var s = String(short == null ? '' : short), f = '', at = [], hit = [], R = [], T = [], re = /[a-z0-9]+/g, i, j, c, m, x;
  for (i = 0; i < s.length; i++) { c = fold(s[i]); for (j = 0; j < c.length; j++) { f += /[a-z0-9]/.test(c[j]) ? c[j] : ' '; at.push(i); } }
  while ((m = re.exec(f))) T.push({ t: m[0], a: m.index });
  /* "H. Đức Nam": chữ cái đầu là họ; phần còn lại là tên đệm + tên (V của máy chủ) */
  var fam = s.charAt(1) === '.' && s.charAt(2) === ' ' && T.length && at[T[0].a] === 0 ? T[0] : null;
  var V = fam ? T.slice(1) : T, n = q.length, off = T.length - n, ok = n >= 2 && off >= 0;
  for (i = 0; ok && i < n; i++) { x = T[off + i]; ok = x === fam ? q[i].indexOf(x.t) === 0 : i < n - 1 ? q[i] === x.t : x.t.indexOf(q[i]) === 0; }
  if (ok) for (i = 0; i < n; i++) { x = T[off + i]; R.push([x.a, x.a + (x === fam ? x.t.length : q[i].length)]); }
  else if ((m = prefixFit(q, V.map(function (v) { return v.t; })))) m.at.forEach(function (k, qi) { R.push([V[k].a, V[k].a + q[qi].length]); });
  else if (n === 1 && q[0].length >= 2) for (i = V.length - 1; i >= 0; i--) { j = V[i].t.indexOf(q[0], 1); if (j > 0) { R.push([V[i].a + j, V[i].a + j + q[0].length]); break; } }
  R.forEach(function (r) { for (var k = r[0]; k < r[1]; k++) hit[at[k]] = 1; });
  for (i = 1; i < s.length; i++) if (hit[i - 1] && !hit[i] && fold(s[i]) === '') hit[i] = 1;   /* dấu viết rời (NFD) đi theo chữ trước */
  var h = '', a = 0;
  for (i = 1; i <= s.length; i++) {
    if (i < s.length && !hit[i] === !hit[a]) continue;
    h += hit[a] ? '<span class="hit">' + esc(s.slice(a, i)) + '</span>' : esc(s.slice(a, i));
    a = i;
  }
  return h;
}
/* Dòng kết quả theo id: gõ tiếp thì dòng còn lại giữ nguyên tại chỗ (chỉ đổi phần tô), dòng mới trồi lên, dòng hết khớp rời đi */
function findRows(res, list, first) {
  var q = S.qShown ? S.qShown.split(' ') : [], old = Object.create(null), k = 0;
  $$('.rrow', res).forEach(function (b) { old[b.dataset.id] = b; });
  list.forEach(function (x, i) {
    var b = old[x.id], nm = hitHTML(x.short, q), on = i === S.sel;
    if (b) delete old[x.id];
    else {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'rrow'; b.setAttribute('role', 'option'); b.dataset.a = 'pick'; b.dataset.id = x.id;
      b.innerHTML = '<span class="nm"></span>' + ico('right');
      if (!first && !rm()) b.style.animation = 'rise .32s var(--rise) ' + (k++ * 0.04) + 's both';
    }
    var sp = b.firstChild;
    if (sp._h !== nm) { sp._h = nm; sp.innerHTML = nm; sp.classList.toggle('hl', nm.indexOf('class="hit"') >= 0); }
    b.classList.toggle('on', on); b.id = 'opt' + i; b.dataset.i = String(i); b.setAttribute('aria-selected', String(on));
    if (res.children[i] !== b) res.insertBefore(b, res.children[i] || null);
  });
  for (var id in old) old[id].remove();
}
function renderFind(first) {
  var p = S.page; if (!p || S.view !== 'find') return;
  var hint = p.querySelector('#qhint'), res = p.querySelector('#res'), miss = p.querySelector('#miss'), keys = p.querySelector('#keys');
  var st = S.qState, txt = '';
  /* đang tìm: giữ lời nhắc cũ, quá 400 ms mới hiện "Đang tìm…" (máy chủ nhanh thì không chớp chữ) */
  if (st === 'idle' || (st === 'wait' && !S.qSlow)) txt = S.qNeed ? Q_OLD : Q_IDLE;
  else if (st === 'need') txt = Q_OLD;
  else if (st === 'wait') txt = 'Đang tìm…';
  else if (st === 'err') txt = S.qErr;
  else if (st === 'done' && S.qMore) txt = Q_MORE;
  hint.textContent = txt; hint.hidden = !txt;
  var showRes = st === 'done' && S.results.length > 0;
  findRows(res, showRes ? S.results : [], first);
  /* trình đọc màn hình đọc dòng đang chọn khi bấm ↑ ↓ (tiêu điểm vẫn ở ô nhập) */
  var qi = p.querySelector('#q');
  if (qi) {
    qi.setAttribute('aria-expanded', showRes ? 'true' : 'false');
    if (showRes) qi.setAttribute('aria-activedescendant', 'opt' + S.sel); else qi.removeAttribute('aria-activedescendant');
  }
  if (st === 'none') { if (miss.hidden) presence(miss, true); bobMood('doubt'); } else { if (!miss.hidden) presence(miss, false, { instant: true }); bobMood('observe'); }
  keys.hidden = !showRes;
}
function onFindKey(e) {
  var n = S.results.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); S.sel = (S.sel + 1) % n; renderFind(true); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); S.sel = (S.sel - 1 + n) % n; renderFind(true); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    var k = qKey(S.q);
    /* chỉ chọn khi danh sách đang hiện đúng là của chữ đang gõ — không thì hỏi ngay chữ đang gõ */
    if (S.qState === 'done' && n && S.qShown === k) choose(S.sel);
    else if (k && k.split(' ').length >= S.qNeed && k !== S.qFly && Date.now() >= S.qHold) { clearTimeout(QT); search(k); }
  }
  else if (e.key === 'Escape') { e.preventDefault(); S.q = ''; e.target.value = ''; onQuery(); }
}
function choose(i) {
  var x = S.results[i]; if (!x) return;
  clearTimeout(QT);
  S.who = { id: x.id, short: x.short, coach: x.coach }; S.pin = ''; S.pinErr = '';
  var lock = +LS.get('lt_lock') || 0;
  go(lock > now() ? 'lock' : 'verify', 'fwd', { push: true });
}

/* ============================== 02 · XÁC MINH · E03 KHOÁ ============================== */
function whoHTML() {
  var w = S.who || { short: '', coach: '' };
  return '<div class="who rs r1">' + ico('user') + '<div class="who-tx"><span class="h22">' + esc(w.short) + '</span><span class="lbl">Coach ' + esc(w.coach) + '</span></div>' +
    '<button class="btn btn-s btn-phu" type="button" data-a="notme">' + ico('left') + '<span>Không phải tôi</span></button></div>';
}
VIEWS.verify = function () {
  var page = pageEl('pg-verify', '<div class="ctr st"><div class="col">' +
    '<div class="ttl-row rs"><div class="ttl"><h1 class="h56">Xác minh</h1><p class="b16">Nhập 4 số cuối điện thoại của bạn.</p></div><div class="bob-slot m"></div></div>' +
    whoHTML() +
    '<div class="pinw rs r2"><div class="pins" id="pins"><span class="pin"></span><span class="pin"></span><span class="pin"></span><span class="pin"></span>' +
      '<input id="pin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="24" autocomplete="off" aria-label="4 số cuối điện thoại" data-focus></div>' +
      '<p class="perr" id="perr" role="alert"></p>' +
      '<label class="chk"><input type="checkbox" id="rem"' + (S.remember ? ' checked' : '') + '><span class="box"><svg viewBox="0 0 16 16"><path d="M3 8.2L6.4 11.4L13 4.6"/></svg></span><span>Ghi nhớ máy này · 60 ngày</span></label></div>' +
    '<div class="rs r3 d"><button class="btn btn-tat" type="button" id="vgo" data-a="verify" disabled><span class="wd"><span>Tiếp tục</span></span>' + ico('right') + '</button></div>' +
    '</div></div>');
  var inp = page.querySelector('#pin');
  inp.addEventListener('input', function () {
    /* gõ từng số: giữ 4 số đầu · dán cả số điện thoại (thêm nhiều số một lúc): lấy 4 số CUỐI */
    var raw = inp.value.replace(/\D+/g, ''), v = raw.length > 4 && raw.length - S.pin.length > 1 ? raw.slice(-4) : raw.slice(0, 4);
    if (v !== inp.value) inp.value = v;
    var grew = v.length > S.pin.length;
    S.pin = v; S.pinErr = '';
    S.pinShow = grew ? v.length - 1 : -1;
    renderPins();
    if (grew) after(.7, function () { S.pinShow = -1; renderPins(); }, 'pinshow');
    /* máy cảm ứng: đủ 4 số thì cất bàn phím ảo — bàn phím số iPhone không có phím Enter và che nút "Tiếp tục" ở thanh đáy */
    if (grew && v.length === 4 && MQ_TOUCH.matches) inp.blur();
  });
  inp.addEventListener('focus', renderPins); inp.addEventListener('blur', renderPins);
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); verify(); } });
  page.querySelector('#rem').addEventListener('change', function (e) { S.remember = e.target.checked; });
  var mb = '<button class="btn btn-m btn-tat" type="button" id="vgoM" data-a="verify" disabled><span class="wd"><span>Tiếp tục</span></span>' + ico('right') + '</button>';
  return { page: page, mbar: mb, mood: 'observe', step: 1, after: renderPins, mbarAfter: renderPins };
};
function renderPins() {
  var p = S.page; if (!p || S.view !== 'verify') return;
  var inp = p.querySelector('#pin'), foc = document.activeElement === inp;
  $$('.pin', p).forEach(function (b, i) {
    var ch = S.pin[i], cls = 'pin' + (ch ? ' fill' : '') + (foc && i === S.pin.length && i < 4 ? ' cur' : '');
    var inner = ch ? (i === S.pinShow ? '<span class="dg">' + ch + '</span>' : '<span class="dot"></span>') : '';
    if (b.className !== cls) b.className = cls;
    if (b._h !== inner) { b._h = inner; b.innerHTML = inner; }
  });
  var ok = S.pin.length === 4 && !S.sending;
  ['#vgo', '#vgoM'].forEach(function (s) {
    var b = $(s); if (!b) return;
    b.disabled = !ok; b.classList.toggle('btn-chinh', ok); b.classList.toggle('btn-tat', !ok);
  });
  var e = p.querySelector('#perr'); if (e.textContent !== S.pinErr) e.textContent = S.pinErr;
}
function verify() {
  if (S.sending || S.pin.length !== 4 || !S.who) return;
  S.sending = true; renderPins(); setBtnBusy(['#vgo', '#vgoM'], true);
  var remember = S.remember, who = S.who;
  call('lt_verify', { id: S.who.id, pin: S.pin, remember: remember }, T_READ + 6000).then(function (r) {
    S.sending = false; setBtnBusy(['#vgo', '#vgoM'], false);
    if (S.view !== 'verify' || S.who !== who) return;   /* khách đã rời màn xác minh ("Không phải tôi") → bỏ phản hồi muộn */
    if (r && r.ok && r.auth) {
      bumpGen();
      TOK.set(r.tok, r.tokExp, remember);
      S.st = cleanSt(r); saveSt(); S.pin = ''; S.net = false; LS.del('lt_lock');
      bobReact('nod');
      routeAuthed('fwd'); return;
    }
    var e = r && r.error;
    if (e === 'sai_ma') { S.pin = ''; S.pinErr = 'Chưa đúng. Còn ' + r.left + ' lần thử.'; var i = $('#pin'); if (i) i.value = ''; renderPins(); shake($('#pins')); tempMood('doubt', 2.4); return; }
    if (e === 'khoa') { LS.set('lt_lock', String(r.until)); go('lock', 'fwd'); return; }
    if (e === 'khong_thay') { toast('Không còn tìm thấy hồ sơ này. Gõ lại tên của bạn.'); go('find', 'back'); return; }
    if (e === 'chua_co_sdt') { S.pinErr = 'Hồ sơ của bạn chưa có số điện thoại để xác minh.'; renderPins(); tempMood('doubt', 2.4); return; }
    S.pinErr = 'Máy chủ đang bận. Thử lại sau vài giây.'; renderPins();
  }, function () {
    S.sending = false; setBtnBusy(['#vgo', '#vgoM'], false);
    if (S.view !== 'verify' || S.who !== who) return;
    S.pinErr = 'Chưa gửi được. Kiểm tra mạng rồi thử lại.'; renderPins();
  });
}
VIEWS.lock = function () {
  var until = +LS.get('lt_lock') || (now() + 15 * 60e3);
  var page = pageEl('pg-lock', '<div class="ctr hi st"><div class="col">' +
    '<div class="ttl-row rs"><div class="ttl"><h1 class="h56" tabindex="-1">Khoá 15 phút.</h1><p class="b16">Do bạn đã nhập sai 5 lần.</p></div><div class="bob-slot m"></div></div>' +
    (S.who ? whoHTML() : '') +
    '<div class="pinw rs r2"><div class="pins">' + [0, 1, 2, 3].map(function () { return '<span class="pin lock">' + ico('lock') + '</span>'; }).join('') + '</div>' +
    '<div class="cd"><span class="lbl">Còn lại · phút : giây</span><div class="cd-v" id="cdv"></div></div>' +
    '<p class="b14">Máy này tạm khoá để giữ lịch của bạn an toàn. Hết 15 phút, bạn nhập lại từ đầu.</p></div>' +
    '</div></div>');
  var cdv = page.querySelector('#cdv');
  function tickL() {
    var left = Math.max(0, until - now()), s = Math.ceil(left / 1000);
    rollSet(cdv, pad2(Math.floor(s / 60)) + ':' + pad2(s % 60));
    clearTimeout(CDT);
    if (S.view !== 'lock') return;
    if (left <= 0) { LS.del('lt_lock'); S.q = ''; S.results = []; S.qState = 'idle'; go('find', 'back'); return; }
    CDT = setTimeout(tickL, 1000 - (now() % 1000) + 10);
  }
  return { page: page, mood: 'doubt', step: 1, after: function () { clearTimeout(CDT); cdv._s = null; tickL(); } };
};
function shake(el) { if (!el || rm()) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(function () { el.classList.remove('shake'); }, 450); }
var MOODT = 0;
function tempMood(m, sec) { bobMood(m); clearTimeout(MOODT); MOODT = setTimeout(function () { MOODT = 0; if (BOB.mood === m) bobMood(restMood()); }, sec * 1000); }
/* tâm trạng nghỉ của B0B theo màn: đang có cảnh báo trên bảng thì nghi ngại (như Figma E04 · E06 · E09 · E11) */
function restMood() { return S.view === 'closed' ? 'sleep' : S.view === 'lock' || S.view === 'fail' ? 'doubt' : (S.view === 'book' || S.view === 'change') && S.warn ? 'doubt' : 'observe'; }
function setWarn(on) { S.warn = !!on; if (!MOODT) bobMood(restMood()); }
function setBtnBusy(sels, on) { sels.forEach(function (s) { var b = $(s); if (b) { b.classList.toggle('sending', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); } }); }

/* ============================== ĐIỀU PHỐI SAU KHI XÁC MINH ============================== */
function routeAuthed(dir, op) {
  op = op || {};
  var st = S.st, w = st.week;
  S.addMode = false; S.chg = { from: null, to: null };
  if (w.phase === 'before') { go('closed', dir, op); return; }
  var lp = landedOf(mineP(jget(LS, 'lt_pend'), st), st);
  if (lp) { landPending(lp); return; }
  /* lệnh chờ trong bộ nhớ chỉ lấy từ lt_pend đã kiểm (đúng chủ, đúng tuần) — không bao giờ mang lệnh của phiên trước sang */
  var p = pendingFor(st);
  S.pending = null;
  if (st.mode === 'ticket') {
    /* lệnh thêm buổi / đổi lịch chưa gửi được ở lần trước: mở lại đúng màn đó, giữ nguyên lựa chọn, chờ "Gửi lại" */
    if (p && p.action === 'lt_book' && st.limits.add > 0) {
      S.addMode = true; restorePending(p);
      go('book', dir, Object.assign({ push: true }, op)); return;
    }
    if (p && p.action === 'lt_change' && st.mine.changesLeft > 0 && sessOn(p.body.from.date)) {
      restorePending(p);
      go('change', dir, Object.assign({ push: true }, op)); return;
    }
    if (p) { S.pending = null; LS.del('lt_pend'); }
    go('ticket', dir, Object.assign({ variant: op.variant || 'home' }, op)); return;
  }
  if (st.mode === 'book') {
    if (p && p.action === 'lt_book') restorePending(p);
    else if (p) { S.pending = null; LS.del('lt_pend'); }
    go('book', dir, op); return;
  }
  go('closed', dir, op);
}
/* lệnh chờ lưu trên máy chỉ dùng cho đúng chủ của nó: máy dùng chung không bao giờ mở lại lệnh của người khác */
function mineP(p, st) { return p && p.who && p.who === whoOf(st) ? p : null; }
/* lệnh chờ (hoặc lệnh trước nó, nếu khách đã sửa lựa chọn) đã vào sổ chưa → trả lệnh đã vào sổ */
function landedOf(p, st) { if (!p) return null; if (pendLanded(p, st)) return p; if (p.prev && pendLanded(p.prev, st)) return p.prev; return null; }
/* lệnh ghi đang chờ (lt_pend) còn dùng được cho tuần này không: đúng chủ, cùng tuần, dưới 3 giờ, chưa vào sổ */
function pendingFor(st) {
  var p = jget(LS, 'lt_pend');
  if (!p) return null;
  var okShape = p.body && (p.action === 'lt_book' ? Array.isArray(p.body.picks) && p.body.picks.length : p.action === 'lt_change' ? p.body.from && p.body.to : false);
  if (!okShape || !mineP(p, st) || p.body.week !== st.week.key || now() - (p.at || 0) > 3 * 3600e3 || landedOf(p, st)) { LS.del('lt_pend'); return null; }
  return p;
}
/* máy chủ đã ghi xong nhưng phản hồi mất trên đường về: lịch máy chủ vừa trả đã chứa đúng thay đổi của lệnh chờ */
function pendLanded(p, st) {
  if (!p || !p.body || !st || !st.mine || p.body.week !== st.week.key) return false;
  var has = function (x) { return st.mine.sessions.some(function (s) { return s.date === x.date && +s.h === +x.h; }); };
  if (p.action === 'lt_book') return Array.isArray(p.body.picks) && p.body.picks.length > 0 && p.body.picks.every(has);
  if (p.action === 'lt_change') return !!(p.body.from && p.body.to) && has(p.body.to) && !has(p.body.from);
  return false;
}
function restorePending(p) {
  S.pending = p;
  S.notice = { type: 'net', tone: 'warn', tries: p.tries || 1 };
  if (p.action === 'lt_book') S.picks = p.body.picks.filter(function (x) { return S.st.week.days.indexOf(x.date) >= 0; }).map(function (x) { return { date: x.date, h: +x.h }; });
  else S.chg = { from: { date: p.body.from.date, h: +p.body.from.h }, to: { date: p.body.to.date, h: +p.body.to.h } };
}
/* lệnh chờ đã vào sổ → coi như gửi thành công: bỏ lệnh chờ, ra phiếu đúng loại (đặt / thêm / đổi) */
function landPending(p) {
  var st = S.st, variant;
  bumpGen();
  S.pending = null; savePend(); S.notice = null; S.gone = []; S.sug = null; S.picks = [];
  if (p.action === 'lt_change') { variant = 'changed'; S.moved = { from: p.body.from, to: p.body.to }; }
  else variant = st.mine.sessions.length > p.body.picks.length ? 'added' : 'booked';
  S.addMode = false; S.chg = { from: null, to: null };
  if (history.replaceState) history.replaceState({ v: 'ticket' }, '');
  go('ticket', 'fwd', { variant: variant });
}

/* ============================== LUẬT KHUNG (bản sao ltWhy_) ============================== */
function why(iso, h, lead) {
  var st = S.st, w = st.week, me = st.me;
  if (w.days.indexOf(iso) < 0) return 'ngoai_tuan';
  if (SLOTS.indexOf(h) < 0) return 'gio';
  if (w.closed && w.closed[iso] !== undefined) return 'nghi';
  if (me.start && iso < me.start) return 'chua_bat_dau';
  if (me.exp && iso > me.exp) return 'het_han';
  var t = slotMs(iso, h), n = now();
  if (t <= n) return 'qua';
  if (lead && t - n < lead) return 'duoi_24h';
  if ((st.taken[iso + '|' + h] || 0) >= st.cap) return 'day';
  return '';
}
function leadBook() { return S.st.week.lead ? LEAD : 0; }
function seatsLeft(iso, h) { return S.st.cap - (S.st.taken[iso + '|' + h] || 0); }
function sessOn(iso) { var s = S.st.mine.sessions; for (var i = 0; i < s.length; i++) if (s[i].date === iso) return s[i]; return null; }
function upcoming() { return S.st.mine.sessions.filter(function (x) { return x.st === 'on'; }); }
function freeDays(lead, skip) {
  return S.st.week.days.filter(function (d) {
    if (skip && skip[d]) return false;
    for (var i = 0; i < SLOTS.length; i++) if (!why(d, SLOTS[i], lead)) return true;
    return false;
  });
}
function maxPicks() { var l = S.st.limits; return S.addMode ? l.add : l.max; }
function minPicks() { return S.addMode ? 1 : S.st.limits.min; }
function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.h - b.h; }
function numWord(n) { return ['Không', 'Một', 'Hai', 'Ba', 'Bốn'][n] || String(n); }
function closedLabel(reason) { var f = fold(reason); return /\ble\b|tet/.test(f) ? 'Nghỉ lễ' : 'Phòng nghỉ'; }

/* ============================== BẢNG TUẦN ============================== */
function gridHTML() {
  var w = S.st.week, days = w.days, sun = addD(days[0], 6), h = '<div class="wk" id="wk"><div class="wk-head" aria-hidden="true"><div></div>';
  days.forEach(function (d, i) { h += '<div class="dh" data-i="' + i + '"><span class="dh-d">' + DOW[dowOf(d)] + '</span><span class="dh-n"><span class="d">' + esc(ddmm(d)) + '</span><span class="m">' + esc(d.slice(8)) + '</span></span><i class="dh-bar"></i></div>'; });
  h += '<div class="dh off"><span class="dh-d">CN</span><span class="dh-n"><span class="d">' + esc(ddmm(sun)) + '</span><span class="m">' + esc(sun.slice(8)) + '</span></span></div></div>';
  h += '<div class="wk-body" id="wkb" role="group" aria-label="Bảng khung giờ tuần ' + esc(w.no) + '"><div class="cn" aria-hidden="true"><span>Coach<br>nghỉ</span></div><div class="lunch" aria-hidden="true">Nghỉ trưa · 12:00–14:00</div>';
  SLOTS.forEach(function (hr) {
    if (hr === 14) h += '<div class="tl" aria-hidden="true"></div>';
    h += '<div class="tl" aria-hidden="true"><span class="d">' + hm(hr) + '</span><span class="m">' + pad2(hr) + '</span></div>';
    days.forEach(function (d) { h += '<button class="c" type="button" data-d="' + esc(d) + '" data-h="' + hr + '" tabindex="-1"></button>'; });
  });
  h += '<div class="now" id="now" hidden><i></i><span></span></div></div></div>';
  return h;
}
/* mô hình ô theo màn: {cls, html, can, aria} */
function cellModel(mode) {
  var st = S.st, w = st.week, out = {}, today = isoOf(now()), lead = mode === 'chg' ? LEAD : leadBook();
  var pickBy = {}; S.picks.forEach(function (p) { pickBy[p.date] = p.h; });
  var goneBy = {}; S.gone.forEach(function (g) { goneBy[g.date + '|' + g.h] = 1; });
  var runLbl = {}, dayRun = {}, runDay = {};
  var LBL = { duoi_24h: 'Dưới 24 giờ', het_han: 'Hết hạn', chua_bat_dau: 'Chưa bắt đầu' };
  var noChg = mode === 'chg' && st.mine.changesLeft <= 0;
  var from = S.chg.from, to = S.chg.to;
  w.days.forEach(function (d, di) {
    var prevWhy = '', s = mode !== 'book' || S.addMode ? sessOn(d) : null;
    SLOTS.forEach(function (h) {
      var k = d + '|' + h, label = DOWF[dowOf(d)] + ' ' + ddmm(d) + ', ' + hm(h) + ', ';
      var m = { cls: 'free', html: '', can: false, aria: '' };
      if (s && mode !== 'book') {
        /* màn đổi lịch / thêm buổi: ngày đã có buổi */
        if (s.h === h) {
          if (s.st === 'done') { m.cls = 'done'; m.html = ico('check') + '<span class="d">Đã tập</span>'; m.aria = label + 'đã tập'; }
          else if (s.st === 'absent') { m.cls = 'done'; m.html = '<span class="d">Vắng</span><span class="m">V</span>'; m.aria = label + 'vắng'; }
          else if (s.st === 'past') { m.cls = 'past'; m.html = '<span>' + hm(h) + '</span>'; m.aria = label + 'buổi đã qua'; }
          else if (mode === 'add') { m.cls = 'mine'; m.html = '<span>' + hm(h) + '</span>'; m.aria = label + 'đã đặt'; }
          else if (from && from.date === d && from.h === h) { m.cls = 'moving'; m.html = '<span>' + hm(h) + '</span>'; m.can = true; m.aria = label + 'buổi đang đổi, bấm để bỏ chọn'; }
          else if (noChg) { m.cls = 'mine'; m.html = '<span class="d">Không thể đổi</span><span class="m">' + pad2(h) + '</span>'; m.aria = label + 'buổi của bạn, không thể đổi'; }
          else if (slotMs(d, h) - now() < LEAD) { m.cls = 'mine'; m.html = ico('lock') + '<span class="d">Dưới 24 giờ</span>'; m.aria = label + 'buổi của bạn, dưới 24 giờ nên không đổi được'; }
          else { m.cls = 'mine tm'; m.html = '<span>' + hm(h) + '</span>'; m.can = true; m.aria = label + 'buổi của bạn, bấm để đổi'; }
        } else {
          var wq = why(d, h, lead);
          m.cls = wq === 'qua' ? 'past' : 'lock'; m.aria = label + 'đã có buổi trong ngày';
        }
        out[k] = m; return;
      }
      var wy = why(d, h, lead);
      if (mode === 'chg') {
        if (to && to.date === d && to.h === h) { m.cls = 'sel pop0'; m.html = '<span>' + hm(h) + '</span>'; m.can = true; m.aria = label + 'buổi mới, bấm để bỏ chọn'; out[k] = m; return; }
        if (wy === 'qua') { m.cls = 'past'; m.aria = label + 'đã qua'; out[k] = m; return; }
        if (noChg || !from || from.date === d || (s && s.date === d)) { m.cls = 'lock'; m.aria = label + 'không chuyển tới được'; out[k] = m; return; }
      } else {
        if (pickBy[d] === h) { m.cls = 'sel'; m.html = '<span>' + hm(h) + '</span>'; m.can = true; m.aria = label + 'đã chọn, bấm để bỏ'; out[k] = m; return; }
        if (goneBy[k]) { m.cls = 'gone'; m.html = '<span class="d">Vừa hết</span><span class="m">Hết</span>'; m.aria = label + 'vừa hết chỗ'; out[k] = m; return; }
      }
      if (wy === '') {
        var left = seatsLeft(d, h);
        m.cls = 'free'; m.can = true; m.aria = label + (left === 1 ? 'còn 1 chỗ' : 'còn trống');
        if (left === 1) m.html = '<span class="d">Còn 1</span><span class="m">1</span>';
      } else if (wy === 'day') { m.cls = 'full'; m.html = '<span>Đầy</span>'; m.aria = label + 'đầy'; }
      else if (wy === 'qua') { m.cls = 'past'; m.aria = label + 'đã qua'; }
      else {
        m.cls = 'lock';
        var txt = wy === 'nghi' ? closedLabel(w.closed[d]) : LBL[wy];
        m.aria = label + (wy === 'nghi' ? 'phòng nghỉ' : String(txt || 'không chọn được').toLowerCase());
        if (txt) {
          var multi = wy !== 'duoi_24h';
          var first = prevWhy !== wy && (!multi || wy === 'nghi' || !dayRun[wy] || dayRun[wy] !== di - 1);
          if (first && !(multi && runLbl[wy] && wy !== 'nghi')) { m.html = '<span class="d">' + esc(txt) + '</span>'; if (multi) { runLbl[wy] = true; runDay[wy] = di; } }
          /* khối khoá nhiều ngày (hết hạn / chưa bắt đầu): nghỉ trưa cắt khối làm hai → ghi nhãn lại ở 14:00 của cột đầu (như Figma E06) */
          else if (multi && wy !== 'nghi' && h === 14 && runDay[wy] === di && prevWhy === wy) m.html = '<span class="d">' + esc(txt) + '</span>';
          if (multi) dayRun[wy] = di;
        }
      }
      prevWhy = wy;
      out[k] = m;
    });
  });
  return out;
}
var GRIDF = { i: 0, j: 0 };     /* ô đang giữ tiêu điểm bàn phím (ngày, khung) */
function paintGrid(mode) {
  var wkb = $('#wkb'); if (!wkb || !S.st) return;
  var md = cellModel(mode), today = isoOf(now()), w = S.st.week, me = S.st.me;
  $$('.c', wkb).forEach(function (b) {
    var k = b.dataset.d + '|' + b.dataset.h, m = md[k]; if (!m) return;
    var wasSel = b.classList.contains('sel');
    var cls = 'c ' + m.cls.replace(' pop0', '');
    if (b.className.replace(' pop', '') !== cls) {
      b.className = cls;
      if (!wasSel && /\bsel\b/.test(cls) && !rm()) { b.classList.add('pop'); setTimeout(function () { b.classList.remove('pop'); }, 320); }
    }
    if (b._h !== m.html) { b._h = m.html; b.innerHTML = m.html; }
    if (m.can) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', m.aria);
  });
  $$('.dh[data-i]', $('#wk')).forEach(function (el) {
    var d = w.days[+el.dataset.i], off = (w.closed && w.closed[d] !== undefined) || (me.exp && d > me.exp) || (me.start && d < me.start);
    el.classList.toggle('today', d === today && w.phase !== 'open');
    el.classList.toggle('past', d < today);
    el.classList.toggle('off', !!off && d >= today);
  });
  gridFocusFix();
  nowLine();
}
function gridFocusFix() {
  var wkb = $('#wkb'); if (!wkb) return;
  var cells = $$('.c', wkb), cur = cells.filter(function (c) { return c.tabIndex === 0; })[0];
  if (cur && cur.getAttribute('aria-disabled') !== 'true') return;
  var pick = cells.filter(function (c) { return c.classList.contains('sel'); })[0] || cells.filter(function (c) { return c.getAttribute('aria-disabled') !== 'true'; })[0] || cells[0];
  cells.forEach(function (c) { c.tabIndex = c === pick ? 0 : -1; });
}
function gridKey(e) {
  var t = e.target; if (!t.classList || !t.classList.contains('c')) return;
  var days = S.st.week.days, i = days.indexOf(t.dataset.d), j = SLOTS.indexOf(+t.dataset.h), ni = i, nj = j;
  if (e.key === 'ArrowRight') ni = Math.min(days.length - 1, i + 1);
  else if (e.key === 'ArrowLeft') ni = Math.max(0, i - 1);
  else if (e.key === 'ArrowDown') nj = Math.min(SLOTS.length - 1, j + 1);
  else if (e.key === 'ArrowUp') nj = Math.max(0, j - 1);
  else if (e.key === 'Home') nj = 0;
  else if (e.key === 'End') nj = SLOTS.length - 1;
  else return;
  e.preventDefault();
  var nb = $('#wkb .c[data-d="' + days[ni] + '"][data-h="' + SLOTS[nj] + '"]');
  if (nb) { $$('#wkb .c').forEach(function (c) { c.tabIndex = -1; }); nb.tabIndex = 0; nb.focus(); }
}
/* vạch "bây giờ" trên cột hôm nay (chỉ khi tuần đang hiện chứa hôm nay) */
function nowLine() {
  var el = $('#now'), wkb = $('#wkb'); if (!el || !wkb || !S.st) return;
  var p = parts(now()), today = isoP(p), w = S.st.week;
  if (w.days.indexOf(today) < 0) { el.hidden = true; return; }
  var col = $$('.c[data-d="' + today + '"]', wkb); if (!col.length) { el.hidden = true; return; }
  var mins = p.hh * 60 + p.mi, y;
  var r0 = col[0], rl = col[col.length - 1];
  if (p.hh < SLOTS[0]) y = r0.offsetTop;
  else if (p.hh >= 21) y = rl.offsetTop + rl.offsetHeight;
  else if (p.hh >= 12 && p.hh < 14) { var lu = $('.lunch', wkb); y = lu.offsetTop + lu.offsetHeight * ((mins - 720) / 120); }
  else { var c = col[SLOTS.indexOf(p.hh)]; y = c.offsetTop + c.offsetHeight * (p.mi / 60); }
  el.hidden = false;
  el.style.top = y.toFixed(1) + 'px';
  el.style.left = (r0.offsetLeft) + 'px';
  el.style.width = r0.offsetWidth + 'px';
  el.querySelector('span').textContent = pad2(p.hh) + ':' + pad2(p.mi);
}

/* ============================== THẺ BUỔI (cột trái) — FLIP khi thêm / bớt ============================== */
function cardHTML(c) {
  if (c.kind === 'add') {
    return '<button class="pk pk-add' + (c.need ? ' need' : '') + '" type="button" data-a="addhint" data-k="' + esc(c.key) + '"><span class="badge">' + ico('plus') + '</span>' +
      '<span class="pk-tx"><span class="pk-l">' + esc(c.l) + '</span><span class="pk-t">' + esc(c.t) + '</span></span></button>';
  }
  var tail = c.kind === 'sel' ? '<button class="ib ib-32 ib-tron" type="button" data-a="unpick" data-d="' + esc(c.date) + '" aria-label="Bỏ ' + esc(dFull(c.date) + ' ' + hm(c.h)) + '">' + ico('close') + '</button>'
    : c.kind === 'booked' ? ico('lock') : c.kind === 'moving' ? ico('swap') : c.kind === 'to' ? '<button class="ib ib-32 ib-tron" type="button" data-a="unto" aria-label="Bỏ buổi mới">' + ico('close') + '</button>' : '';
  return '<div class="pk' + (c.kind === 'booked' ? ' booked' : c.kind === 'moving' ? ' moving' : '') + '" data-k="' + esc(c.key) + '"><i class="pk-bar"></i>' +
    '<span class="pk-tx"><span class="pk-l">' + esc(c.l) + '</span><span class="pk-t">' + esc(c.t) + '</span></span>' + tail + '</div>';
}
function flipList(host, cards) {
  if (!host) return;
  var old = {}, rects = {};
  $$(':scope>[data-k]', host).forEach(function (el) { old[el.dataset.k] = el; rects[el.dataset.k] = el.getBoundingClientRect(); });
  var keys = cards.map(function (c) { return c.key; });
  /* phần tử biến mất: mờ đi tại chỗ (phủ tuyệt đối) trong lúc phần còn lại trượt về */
  Object.keys(old).forEach(function (k) {
    if (keys.indexOf(k) >= 0) return;
    var el = old[k], r = rects[k], hr = host.getBoundingClientRect();
    if (rm()) { el.remove(); return; }
    el.style.position = 'absolute'; el.style.left = '0'; el.style.right = '0'; el.style.top = (r.top - hr.top) + 'px'; el.style.pointerEvents = 'none'; el.removeAttribute('data-k');
    tw({ key: 'fx' + (++SEQ), from: 1, to: 0, dur: .16, ease: EIO, set: function (v) { el.style.opacity = v; el.style.transform = 'scale(' + (0.98 + 0.02 * v).toFixed(4) + ')'; }, done: function () { el.remove(); } });
  });
  var frag = [];
  cards.forEach(function (c) {
    var html = cardHTML(c), el = old[c.key];
    if (el && el._h === html) { frag.push(el); return; }
    var t = document.createElement('div'); t.innerHTML = html; var nu = t.firstElementChild; nu._h = html;
    if (el) { nu._was = rects[c.key]; el.remove(); }
    else nu._fresh = true;
    frag.push(nu);
  });
  frag.forEach(function (el) { host.appendChild(el); });
  frag.forEach(function (el) {
    var k = el.dataset.k, r1 = el.getBoundingClientRect(), r0 = rects[k];
    if (rm()) return;
    if (el._fresh) {
      el._fresh = false; el.style.opacity = '0';
      tw({ key: 'fl' + k, from: 0, to: 1, dur: .26, delay: .06, ease: EO, pre: false, set: function (v) { el.style.opacity = v; el.style.transform = 'translateY(' + ((1 - v) * 8).toFixed(2) + 'px)'; }, done: function () { el.style.opacity = ''; el.style.transform = ''; } });
    } else if (r0 && Math.abs(r0.top - r1.top) > 0.5) {
      var dy = r0.top - r1.top;
      tw({ key: 'fl' + k, from: 1, to: 0, dur: .32, ease: EO, set: function (v) { el.style.transform = 'translateY(' + (dy * v).toFixed(2) + 'px)'; }, done: function () { el.style.transform = ''; } });
    }
  });
}

/* ============================== THÔNG BÁO THEO TÌNH HUỐNG ============================== */
function bookNotice() {
  if (S.notice) return S.notice;
  var st = S.st, w = st.week, me = st.me, l = st.limits;
  if (S.addMode) {
    var n = st.mine.sessions.length, nxt = n + Math.max(1, S.picks.length);
    return { tone: 'info', title: 'Thêm buổi không tính lượt đổi.', body: 'Bớt buổi đã đặt thì không được. Phiếu sẽ lên bản ' + (st.mine.ver + 1) + ' với ' + nxt + ' buổi.',
             mtitle: l.add > 1 ? 'Đã đặt ' + n + ' buổi · thêm được ' + l.add + ' buổi.' : 'Đã đặt ' + n + ' buổi · thêm được buổi thứ ' + (n + 1) + '.' };
  }
  var closedDays = w.days.filter(function (d) { return w.closed && w.closed[d] !== undefined && d >= isoOf(now()); });
  if (closedDays.length) {
    var d0 = closedDays[0], rs = String(w.closed[d0] || '').trim(), one = closedDays.length === 1;
    if (fold(rs) === 'phong nghi') rs = '';   /* máy chủ điền sẵn "Phòng nghỉ" khi bảng B0B bỏ trống lý do */
    var hol = one && rs && closedLabel(rs) === 'Nghỉ lễ';
    return { tone: 'info', title: (one ? dFull(d0) : closedDays.map(dFull).join(' và ')) + ' phòng nghỉ' + (hol ? ' ' + rs : one && rs ? ' · ' + rs : '') + '.',
             body: 'Ngày nghỉ' + (hol ? ' lễ' : '') + ' đã khoá trên bảng. Chọn ngày khác trong tuần.', mtitle: dShort(d0) + ' phòng nghỉ · chọn ngày khác.' };
  }
  var last = w.days[w.days.length - 1];
  if (me.exp && me.exp >= w.days[0] && me.exp < last) {
    var lost = me.left - l.max;
    return { tone: 'warn', title: 'Gói hết hạn ' + dFull(me.exp) + '.',
             body: 'Còn ' + me.left + ' buổi, tuần này đặt tối đa ' + l.max + ' buổi trước hạn.' + (lost > 0 ? ' Gia hạn trước ' + ddmm(me.exp) + ' để không mất ' + lost + ' buổi còn lại.' : ''),
             mtitle: 'Gói hết hạn ' + dShort(me.exp) + ' · còn ' + me.left + ' buổi.' };
  }
  if (me.start && me.start > w.days[0] && me.start <= last) {
    return { tone: 'info', title: 'Gói bắt đầu từ ' + dFull(me.start) + '.', body: 'Các ngày trước đó đã khoá trên bảng.', mtitle: 'Gói bắt đầu từ ' + dShort(me.start) + '.' };
  }
  if (w.phase === 'late') {
    var first = null;
    for (var i = 0; i < w.days.length && !first; i++) for (var j = 0; j < SLOTS.length; j++) if (!why(w.days[i], SLOTS[j], LEAD)) { first = { date: w.days[i], h: SLOTS[j] }; break; }
    var fd = freeDays(LEAD).length;
    if (first) return { tone: 'info', title: 'Đặt muộn: khung cách bây giờ ít nhất 24 giờ.', body: 'Sớm nhất ' + dFull(first.date) + ' · ' + hm(first.h) + '. Còn ' + fd + ' ngày đặt được, mỗi ngày tối đa 1 buổi.',
                        mtitle: 'Đặt muộn · sớm nhất ' + dShort(first.date).split(' ')[0] + ' ' + hm(first.h) + '.' };
  }
  if (me.kind === '1:2') return { tone: 'info', title: 'Gói 1:2 · mỗi người tự đặt lịch.', body: 'Muốn tập cùng nhau, hai bạn chọn cùng khung giờ. Mỗi người có phiếu và lượt đổi riêng.' };
  return null;
}
function noticeForErr(n) {
  /* chuẩn hoá thông báo ép (lỗi gửi …) thành {title, body, mtitle, tone, sugs} */
  if (n.type === 'net') return { tone: 'warn', title: 'Chưa gửi được. Mạng vừa ngắt.', body: 'Lịch bạn chọn vẫn còn trên máy này. Gửi lại không tạo lịch trùng · lần gửi ' + (n.tries || 1) + ' chưa được xác nhận.', mtitle: 'Chưa gửi được · mạng vừa ngắt.', resend: true };
  if (n.type === 'busy') return { tone: 'warn', title: 'Hệ thống đang bận.', body: 'Lịch bạn chọn vẫn còn trên máy này. Gửi lại sau vài giây, không tạo lịch trùng.', mtitle: 'Hệ thống đang bận · gửi lại sau vài giây.', resend: true };
  if (n.type === 'err') return { tone: 'warn', title: 'Máy chủ vừa gặp lỗi.', body: 'Lịch bạn chọn vẫn còn trên máy này. Thử gửi lại sau ít phút.', mtitle: 'Máy chủ vừa gặp lỗi · thử lại sau.', resend: true };
  return n;
}

/* ============================== 03 · ĐẶT LỊCH (03 · E04 · E06 · E07 · E08 · E10 · E11 · E12) ============================== */
VIEWS.book = function () {
  var st = S.st, me = st.me, add = S.addMode;
  var sub = add ? (st.limits.add > 1 ? 'Bạn đã đặt ' + st.mine.sessions.length + ' buổi · có thể thêm ' + st.limits.add + ' buổi' : 'Bạn đã đặt ' + st.mine.sessions.length + ' buổi · có thể thêm buổi thứ ' + (st.mine.sessions.length + 1))
    : bookSub();
  var info = me.coach + ' · còn ' + me.left + ' buổi' + (me.exp ? ' · ' + yy(me.exp) : '');
  var page = pageEl('pg-book', '<div class="bk st">' +
    '<div class="side"><div class="side-top">' +
      helloHTML({ title: 'Chào ' + me.call, sub: sub, info: info, notYou: true }) +
      '<div class="m rs r1" id="mNote"></div>' +
      '<div class="grp d rs r1"><div class="grp-h"><span class="k">Đã chọn</span><span class="v">' + lnHTML('0 / 0', '') + '</span></div><div class="picks" id="pkList"></div></div>' +
      '<div class="grp d lg-d rs r2"><div class="grp-h"><span class="k">Cách đọc bảng</span></div>' + legendHTML(add ? 'add' : 'book') + '</div>' +
    '</div><div class="side-act d rs r3"><button class="btn btn-tat" type="button" id="cta" data-a="book" disabled><span class="wd"><span>Đặt lịch</span></span>' + ico('right') + '</button>' + rulesHTML() + '</div></div>' +
    '<div class="wkw rs r1">' + gridHTML() + '<div class="lg-m m">' + legendHTML(add ? 'add-m' : 'book-m') + '</div></div>' +
  '</div>');
  var mb = mbWeekHTML() + '<p class="sr" id="mbL"></p>' +
    '<button class="btn btn-m btn-tat" type="button" id="ctaM" data-a="book" disabled><span class="wd"><span>Đặt lịch</span></span>' + ico('right') + '</button><p class="mb-note" id="mbNote">' + lnHTML(MRULE) + '</p>';
  return { page: page, mbar: mb, mood: 'observe', step: add ? 1 : 2, flow: add ? 'add' : 'book', back: add,
           floorAfter: function () { updateBook(true); }, mbarAfter: function () { updateBook(true); }, after: function () { updateBook(true); } };
};
function bookSub() {
  var st = S.st, w = st.week, me = st.me, l = st.limits, last = w.days[w.days.length - 1];
  if (me.exp && me.exp >= w.days[0] && me.exp < last) return 'Gói hết hạn ' + dFull(me.exp) + ' · đặt tối đa ' + l.max + ' buổi';
  if (w.phase === 'late') return 'Tuần này bạn chưa đặt lịch · đặt muộn';
  return 'Chọn lịch bạn muốn đặt cho tuần tới';
}
function legendHTML(kind) {
  var it = {
    trong: ['', '', 'Trống'], con1: ['', '1', 'Còn 1 chỗ'], day: ['k-khoa', '', 'Đầy'], chon: ['k-chon', '', 'Đã chọn'], trua: ['k-qua', '', 'Nghỉ trưa'],
    khong: ['k-khoa', '', 'Không chọn được'], dayle: ['k-khoa', '', 'Đầy · nghỉ lễ'], them: ['k-chon', '', 'Buổi thêm'], dat: ['k-dat', '', 'Đã đặt'], daybuoi: ['k-khoa', '', 'Đầy · đã có buổi'],
    toi: ['', '', 'Chuyển tới được'], kchuyen: ['k-khoa', '', 'Không chuyển được'], tap: ['k-tap', '', 'Đã tập'], dangdoi: ['k-doi', '', 'Buổi đang đổi'], moi: ['k-chon', '', 'Buổi mới'], cuaban: ['k-dat', '', 'Buổi của bạn'],
    kthe: ['k-khoa', '', 'Không thể đổi'],
    mtrong: ['', '', 'Trống'], mchon: ['k-chon', '', 'Đã chọn'], mcon1: ['', '1', 'Còn 1'], mday: ['k-khoa', '', 'Đầy'], mkhong: ['k-khoa', '', 'Không được'],
    mdoi: ['k-doi', '', 'Đang đổi'], mmoi: ['k-chon', '', 'Mới'], mcua: ['k-dat', '', 'Của bạn'], mtap: ['k-tap', '', 'Đã tập'], mthem: ['k-chon', '', 'Thêm'], mdat: ['k-dat', '', 'Đã đặt']
  };
  var w = S.st && S.st.week, hasClosed = w && w.closed && Object.keys(w.closed).length, phaseLate = w && w.phase === 'late';
  var exp = S.st && S.st.me.exp && w && S.st.me.exp < w.days[w.days.length - 1];
  var sets = {
    book: ['trong', 'chon', 'con1', 'trua', hasClosed ? 'dayle' : (phaseLate || exp ? 'khong' : 'day')],
    'book-m': ['mtrong', 'mchon', 'mcon1', phaseLate || exp ? 'mkhong' : 'mday'],
    add: ['trong', 'them', 'con1', 'dat', 'daybuoi', 'trua'],
    'add-m': ['mtrong', 'mthem', 'mcon1', 'mdat', 'mday'],
    chg: ['toi', 'dangdoi', 'kchuyen', 'moi', 'tap', 'cuaban'],
    'chg-m': ['mdoi', 'mmoi', 'mcua', 'mkhong', 'mtap'],
    nochg: ['kthe', 'cuaban', 'tap'],
    'nochg-m': ['mcua', 'mkhong', 'mtap']
  };
  var list = sets[kind] || sets.book, cls = /-m$/.test(kind) ? '' : 'lg';
  return (cls ? '<div class="lg">' : '') + list.map(function (k) {
    var x = it[k]; return '<span class="lgi"><i class="sw ' + x[0] + '">' + (k === 'tap' || k === 'mtap' ? '<svg viewBox="0 0 10 10"><path d="M1.5 5.2L4 7.6L8.6 2.6"/></svg>' : esc(x[1])) + '</i>' + esc(x[2]) + '</span>';
  }).join('') + (cls ? '</div>' : '');
}
/* thanh đáy mobile · TUẦN CỦA BẠN: 7 ô thẳng hàng 7 cột ngày của bảng giờ ngay phía trên (cột giờ 22 px · khe 3 px như .wk), cùng ngôn ngữ ô
   với bảng: ngày chưa có buổi in thứ (T2…), buổi đang chọn = ô Mực có giờ, buổi đã đặt = viền Mực, buổi đang đổi = viền đứt, đã tập = Giấy 2.
   Mỗi ngày tối đa 1 buổi (luật) → một ô một ngày, 4 buổi hay 6 ngày vẫn vừa một dòng ở mọi cỡ máy. Cột giờ: đếm đã chọn / tối đa */
function mbWeekHTML() {
  var w = S.st.week, h = '<div class="mb-wk" id="mbW" aria-hidden="true"><span class="g"></span>';
  w.days.forEach(function (d) { h += '<span class="dc" data-d="' + esc(d) + '">' + DOW[dowOf(d)] + '</span>'; });
  return h + '<span class="dc cn">CN</span></div>';
}
function mbWeek(map, count, say, first) {
  var wk = $('#mbW'); if (!wk) return;
  var w = S.st.week, me = S.st.me, today = isoOf(now()), g = wk.querySelector('.g');
  if (g.textContent !== count) g.textContent = count;
  $$('.dc[data-d]', wk).forEach(function (c) {
    var d = c.getAttribute('data-d'), s = map[d], off = d < today || (w.closed && w.closed[d] !== undefined) || (me.exp && d > me.exp) || (me.start && d < me.start);
    var cls = 'dc' + (s ? ' t ' + s.k : off ? ' off' : ''), tx = s ? s.t : DOW[dowOf(d)];
    if (c.className.replace(' pop', '') === cls && c.textContent === tx) return;
    c.className = cls; c.textContent = tx;
    if (!first && !rm()) { void c.offsetWidth; c.classList.add('pop'); clearTimeout(c._pt); c._pt = setTimeout(function () { c.classList.remove('pop'); }, 260); }
  });
  var l = $('#mbL'); if (l && l.textContent !== say) l.textContent = say;
}
function updateBook(first) {
  if (S.view !== 'book' || !S.st) return;
  var st = S.st, add = S.addMode, max = maxPicks(), min = minPicks(), n = S.picks.length;
  paintGrid(add ? 'add' : 'book');
  /* thẻ cột trái */
  var cards = [];
  if (add) st.mine.sessions.forEach(function (s) { cards.push({ key: 'b' + s.date, kind: 'booked', l: 'Đã đặt · ' + dFull(s.date), t: hm(s.h) }); });
  S.picks.forEach(function (p) { cards.push({ key: 'p' + p.date, kind: 'sel', date: p.date, h: p.h, l: add ? 'Thêm · ' + dFull(p.date) : DOWF[dowOf(p.date)] + ' · ' + ddmm(p.date), t: hm(p.h) }); });
  S.gone.forEach(function (g) { if (!S.picks.some(function (p) { return p.date === g.date; })) cards.push({ key: 'g' + g.date, kind: 'add', need: true, l: 'Chọn lại · ' + dFull(g.date), t: hm(g.h) + ' vừa hết' }); });
  if (n < max && !S.gone.length) {
    var idx = (add ? st.mine.sessions.length : 0) + n + 1;
    cards.push({ key: 'add', kind: 'add', need: n < min, l: n < min ? 'Chọn buổi ' + idx : 'Tuỳ chọn', t: n < min ? (desk() ? 'Bấm một ô trống trên bảng' : 'Chạm một ô trống') : 'Thêm buổi ' + idx });
  }
  cards.sort(function (a, b) { var da = a.date || (a.key.charAt(0) === 'g' ? a.key.slice(1) : a.key.charAt(0) === 'b' ? a.key.slice(1) : 'z'), db = b.date || (b.key.charAt(0) === 'g' ? b.key.slice(1) : b.key.charAt(0) === 'b' ? b.key.slice(1) : 'z'); return da < db ? -1 : da > db ? 1 : 0; });
  flipList($('#pkList'), cards);
  /* đếm + tóm tắt */
  var shown = add ? st.mine.sessions.length + n : n, of = add ? st.mine.sessions.length + max : max;
  var lnN = S.page.querySelector('.grp-h .v .ln'); line(lnN, shown + ' / ' + of, first ? 0 : 1, first);
  var wk = {};
  if (add) st.mine.sessions.forEach(function (s) { wk[s.date] = { k: s.st === 'on' ? 'mine' : 'done', t: hm(s.h) }; });
  S.picks.forEach(function (p) { wk[p.date] = { k: 'sel', t: hm(p.h) }; });
  mbWeek(wk, shown + '/' + of, 'Đã chọn ' + shown + ' / ' + of + (n ? ': ' + S.picks.slice().sort(byDate).map(function (p) { return DOWF[dowOf(p.date)] + ' ' + hm(p.h); }).join(', ') : ''), first);
  /* nút chốt */
  var note = noticeForErr(bookNotice() || {});
  /* "Gửi lại" chỉ khi lựa chọn trên màn đúng y lệnh đã gửi (sửa lựa chọn → là lệnh mới) */
  var resend = !!(S.notice && note.resend && S.pending && S.pending.action === 'lt_book' && samePicks(S.pending.body.picks, S.picks.slice().sort(byDate)));
  var ok = resend || (n >= min && n <= max && n > 0);
  var label = resend ? 'Gửi lại' : add ? (n ? 'Thêm ' + n + ' buổi' : 'Thêm buổi') : n >= min && n > 0 ? 'Đặt lịch ' + n + ' buổi' : n === 0 ? 'Chọn ' + (min === max ? min : min + '–' + max) + ' buổi' : 'Chọn thêm ' + (min - n) + ' buổi';
  ctaSet(['#cta', '#ctaM'], label, ok, S.sending);
  /* thông báo: sàn desktop + dòng mobile */
  floorBook(note && note.title ? note : null);
  setWarn(note && note.title && note.tone === 'warn');
  var mn = $('#mNote'); if (mn) { var mh = note && note.title ? mNoteHTML(note) : ''; if (mn._h !== mh) { mn._h = mh; mn.innerHTML = mh; S.page.classList.toggle('has-note', !!mh); if (mh && !first) { presence(mn.firstElementChild, true, { force: true }); if (!desk()) announce(note.mtitle || note.title); } } }
  var mbn = $('#mbNote .ln'); if (mbn) line(mbn, resend ? 'Gửi lại không tạo lịch trùng · lần ' + (S.notice.tries || 1) + ' chưa xác nhận' : MRULE, 1, first);
  headerFor();
}
/* đọc to một thông báo (mobile: dòng thông báo là nút, không tự đọc) */
function announce(msg) { var l = $('#live'); if (!l) return; l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); }
function floorBook(n) {
  var st = S.st, me = st.me;
  var html = n ? '<div class="fl">' + noticeHTML(n) + '</div>' + infoBtn()
    : '<div class="fl">' + specHTML(me.coach, 'Coach của bạn') + '<i class="spec-sep"></i>' + specHTML('Còn ' + me.left + ' buổi', 'Gói ' + (me.pkg ? me.pkg + ' · ' : '') + me.kind) +
      (me.exp ? '<i class="spec-sep"></i>' + specHTML(yy(me.exp), 'Ngày hết hạn') : '') + '</div>' + infoBtn();
  setFloor(html);
}
function ctaSet(sels, label, ok, sending) {
  sels.forEach(function (s) {
    var b = $(s); if (!b) return;
    var wd = b.querySelector('.wd'), txt = sending ? 'Đang gửi…' : label;
    b.disabled = !ok || !!sending;
    b.classList.toggle('btn-chinh', ok); b.classList.toggle('btn-tat', !ok);
    b.classList.toggle('sending', !!sending);
    /* so với chữ ĐÍCH (wd._t), không so chữ đang hiện: lúc mờ chéo 110 ms chưa xong, chữ đang hiện vẫn là chữ cũ */
    if (wd && wd._t === undefined) wd._t = wd.textContent;
    if (wd && wd._t !== txt) {
      wd._t = txt;
      fadeSwap(wd, function () { wd.innerHTML = '<span>' + esc(wd._t) + '</span>'; }, 'cta' + s);
    }
  });
}
function onBookCell(b) {
  if (b.getAttribute('aria-disabled') === 'true') { bobGlance(b); return; }
  if (S.sending) return;
  var d = b.dataset.d, h = +b.dataset.h, i = -1;
  S.picks.forEach(function (p, k) { if (p.date === d) i = k; });
  if (i >= 0 && S.picks[i].h === h) S.picks.splice(i, 1);
  else if (i >= 0) S.picks[i] = { date: d, h: h };
  else {
    if (S.picks.length >= maxPicks()) {
      var mx = maxPicks();
      toast(S.addMode ? 'Tuần này thêm được tối đa ' + mx + ' buổi.' : 'Tối đa ' + mx + ' buổi tuần này. Bỏ một buổi để chọn ngày khác.');
      shake(S.page.querySelector('.grp-h .v')); return;
    }
    S.picks.push({ date: d, h: h });
  }
  S.picks.sort(byDate);
  S.gone = S.gone.filter(function (g) { return g.date !== d; });
  if (S.notice && S.notice.type === 'gone' && !S.gone.length) S.notice = null;
  /* sửa lựa chọn sau một lần gửi chưa rõ kết quả: bỏ thông báo "Gửi lại" nhưng GIỮ lệnh cũ — lệnh mới sẽ mang nó theo (prev)
     để nhận ra nếu chính nó đã vào sổ; máy chủ kiểm bản phiếu nên hai lệnh không thể cùng ghi */
  if (S.notice && (S.notice.type === 'net' || S.notice.type === 'busy' || S.notice.type === 'err')) S.notice = null;
  if (S.sheetN && S.sheetN.type === 'gone') closeSheet();
  updateBook();
  bobGlance(b);
}
function submitBook() {
  if (S.sending || !S.st) return;
  var picks = S.picks.slice().sort(byDate).map(function (p) { return { date: p.date, h: p.h }; });
  var p = S.pending, resend = !!(p && p.action === 'lt_book' && samePicks(p.body.picks, picks));
  if (!resend && (picks.length < minPicks() || picks.length > maxPicks())) { shake($('#cta')); shake($('#ctaM')); return; }
  if (!resend) S.pending = newPending('lt_book', { picks: picks }, p);
  savePend();
  sendPending('book');
}
function samePicks(a, b) { if (!a || a.length !== b.length) return false; return a.every(function (x, i) { return x.date === b[i].date && +x.h === b[i].h; }); }
function sendPending(kind) {
  var p = S.pending; if (!p || S.sending) return;      /* chạm đúp "Gửi lại" → chỉ một lượt */
  S.sending = true; p.tries = (p.tries || 0) + 1; savePend();
  bumpGen();                                           /* lt_boot đang bay từ trước lệnh ghi này đều đã cũ */
  var g = S.gen;
  document.body.classList.add('is-sending');
  if (kind === 'chg') updateChange(); else updateBook();
  /* mã phiên lấy lúc gửi (lt_pend không lưu mã phiên) */
  call(p.action, Object.assign({}, p.body, { tok: TOK.get() }), T_WRITE).then(function (r) {
    if (g !== S.gen) return;                           /* khách đã đăng xuất trong lúc gửi → không mở phiếu ra, không đụng state mới */
    S.sending = false; unSending(); S.net = false;
    onWrite(r, kind, p);
  }, function () {
    if (g !== S.gen) return;
    S.sending = false; unSending(); S.net = true;
    S.notice = { type: 'net', tone: 'warn', tries: p.tries };
    tempMood('doubt', 3);
    if (kind === 'chg') updateChange(); else updateBook();
    /* có thể máy chủ đã ghi xong mà phản hồi rơi giữa đường: hỏi lại lịch sau vài giây, thấy đã vào sổ thì tự ra phiếu */
    setTimeout(function () { if (S.pending === p && !S.sending) refresh(true); }, 4000);
  });
}
function unSending() { document.body.classList.remove('is-sending'); }
window.addEventListener('online', function () { if (!S.sending && (S.net || S.pending)) refresh(true); });
function onWrite(r, kind, p) {
  if (r && r.ok) {
    bumpGen();
    S.pending = null; savePend();
    S.st = cleanSt(r); saveSt(); S.notice = null; S.gone = []; S.sug = null;
    var variant = kind === 'chg' ? 'changed' : (S.addMode || (p && S.st.mine.sessions.length > p.body.picks.length)) ? 'added' : 'booked';
    if (kind === 'chg' && p) S.moved = { from: p.body.from, to: p.body.to };
    S.picks = []; S.addMode = false; S.chg = { from: null, to: null };
    if (history.replaceState) history.replaceState({ v: 'ticket' }, '');
    go('ticket', 'fwd', { variant: variant });
    return;
  }
  var e = r && r.error;
  if (e === 'het_phien' || e === 'het_goi') { S.pending = null; savePend(); signedOut(e); return; }
  if (!r || e === 'he_thong_ban' || e === 'loi_he_thong' || e === 'thieu_may' || e === 'unknown_action') {
    S.notice = { type: e === 'he_thong_ban' ? 'busy' : 'err', tone: 'warn', tries: p ? p.tries : 1 };
    tempMood('doubt', 3);
    if (kind === 'chg') updateChange(); else updateBook();
    return;
  }
  /* máy chủ đã trả lời dứt khoát: lệnh này chưa ghi gì → bỏ yêu cầu chờ */
  S.pending = null; savePend();
  if (r.week) { bumpGen(); S.st = cleanSt(r); saveSt(); }
  if (e === 'ban_cu') {
    /* phiếu trên sổ đã lên bản khác kể từ lúc khách xem: thường là chính lệnh trước (mất phản hồi) đã vào sổ */
    var lp = p && p.prev && r.week && pendLanded(p.prev, S.st) ? p.prev : null;
    if (lp) { landPending(lp); return; }
    S.picks = []; S.gone = []; S.notice = null;
    toast('Lịch của bạn vừa được cập nhật. Xem lại phiếu rồi chọn tiếp.');
    routeAuthed('fwd'); return;
  }
  if (e === 'tuan_doi') { S.picks = []; S.gone = []; S.notice = null; toast('Tuần đặt lịch vừa chuyển sang tuần ' + S.st.week.no + '. Chọn lại lịch.'); routeAuthed('fwd'); return; }
  if (S.st.mode === 'ticket' && kind !== 'chg' && !S.addMode) { toast('Bạn đã có lịch tuần này.'); routeAuthed('fwd'); return; }
  if (kind === 'chg') { chgError(r); return; }
  if (e === 'het_cho') { onFull(r.full || []); return; }
  var msg = whyText(r.why, r.date, r.h);
  if (r.date) S.picks = S.picks.filter(function (x) { return !(x.date === r.date && x.h === +r.h); });
  /* bỏ mọi lựa chọn không còn hợp lệ — kể cả ngày đã có buổi khi đang thêm buổi (không thì cùng lỗi lặp lại) */
  S.picks = S.picks.filter(function (x) { var w = why(x.date, x.h, leadBook()); return (!w || w === 'day') && !(S.addMode && sessOn(x.date)); });
  S.notice = { tone: 'warn', title: msg.title, body: msg.body };
  tempMood('doubt', 3);
  updateBook();
}
function whyText(w, d, h) {
  var at = d ? dFull(d) + (h != null ? ' ' + hm(+h) : '') : 'Khung này';
  var M = {
    so_buoi: ['Số buổi chưa hợp lệ.', 'Tuần này đặt ' + (S.st ? S.st.limits.min + '–' + S.st.limits.max : '2–4') + ' buổi.'],
    qua_so_buoi: ['Vượt số buổi đặt được.', 'Bớt một buổi rồi gửi lại.'],
    it_hon_toi_thieu: ['Chưa đủ số buổi tối thiểu.', 'Chọn thêm buổi rồi gửi lại.'],
    mot_ngay_mot_buoi: ['Mỗi ngày tối đa 1 buổi.', 'Chọn ngày khác cho buổi còn lại.'],
    qua: [at + ' đã qua.', 'Chọn khung khác trên bảng.'],
    duoi_24h: [at + ' chỉ còn dưới 24 giờ.', 'Đặt muộn phải trước buổi tập ít nhất 24 giờ.'],
    nghi: [at + ' phòng nghỉ.', 'Chọn ngày khác trong tuần.'],
    het_han: ['Gói không dùng được ngày ' + (d ? ddmm(d) : 'đó') + '.', 'Gói của bạn hết hạn trước ngày này.'],
    chua_bat_dau: ['Gói chưa bắt đầu vào ngày ' + (d ? ddmm(d) : 'đó') + '.', 'Chọn ngày từ khi gói bắt đầu.']
  };
  var x = M[w] || ['Lịch chọn chưa hợp lệ.', 'Bảng vừa được cập nhật. Chọn lại rồi gửi.'];
  return { title: x[0], body: x[1] };
}
/* E04 · vừa hết chỗ: đánh dấu ô, gỡ khỏi lựa chọn, gợi ý 3 giờ gần nhất của ngày đó */
function onFull(full) {
  full.forEach(function (f) { f.h = +f.h; });
  S.gone = full.slice();
  S.picks = S.picks.filter(function (p) { return !full.some(function (f) { return f.date === p.date && f.h === p.h; }); });
  var f0 = full[0], sugs = [];
  if (f0) {
    var cand = SLOTS.filter(function (h) { return h !== f0.h && !why(f0.date, h, leadBook()); });
    /* gần giờ đã chọn nhất; cách đều thì ưu tiên giờ muộn hơn (đến muộn hơn dự định dễ hơn đến sớm hơn) */
    cand.sort(function (a, b) { return Math.abs(a - f0.h) - Math.abs(b - f0.h) || b - a; });
    sugs = cand.slice(0, 3).sort(function (a, b) { return a - b; }).map(function (h) { return { date: f0.date, h: h }; });
  }
  var rest = S.picks.length, names = full.map(function (f) { return dFull(f.date).split(' ').slice(0, 2).join(' ') + ' ' + hm(f.h); });
  var restTxt = rest ? (rest === 1 ? 'Buổi còn lại vẫn' : numWord(rest) + ' buổi còn lại vẫn') + ' nằm trong lựa chọn của bạn.' : '';
  var dayName = f0 ? DOWF[dowOf(f0.date)] : '';
  S.notice = { type: 'gone', tone: 'warn', title: names.join(' và ') + ' vừa có người đặt trước.',
               body: (restTxt ? restTxt + ' ' : '') + (sugs.length ? 'Chọn giờ khác cho ' + dayName + ':' : 'Chọn khung khác trên bảng.'),
               mtitle: full.map(function (f) { return dShort(f.date).split(' ')[0] + ' ' + hm(f.h); }).join(', ') + ' vừa có người đặt trước.', sugs: sugs,
               sheet: { title: names[0] + ' vừa hết chỗ.', body: 'Có người xác nhận trước bạn vài giây.' + (rest ? ' ' + S.picks.map(function (p) { return dShort(p.date).split(' ')[0] + ' ' + hm(p.h); }).join(' và ') + ' vẫn nằm trong lựa chọn của bạn.' : ''),
                        label: f0 ? 'Chọn giờ khác cho ' + dFull(f0.date) : '', later: 'Để sau, chọn trên bảng' } };
  tempMood('doubt', 3.5);
  updateBook();
  $$('#wkb .c.gone').forEach(function (c) { if (!rm()) { c.classList.add('flash'); setTimeout(function () { c.classList.remove('flash'); }, 950); } });
  if (!desk()) openSheet(noticeForErr(S.notice));
}
function pickSug(d, h) {
  if (S.picks.length >= maxPicks()) return;
  S.picks = S.picks.filter(function (p) { return p.date !== d; });
  S.picks.push({ date: d, h: +h }); S.picks.sort(byDate);
  S.gone = S.gone.filter(function (g) { return g.date !== d; });
  if (!S.gone.length) S.notice = null;
  closeSheet();
  updateBook();
  var b = $('#wkb .c[data-d="' + d + '"][data-h="' + h + '"]'); if (b) bobGlance(b);
}

/* ============================== 05A · ĐỔI LỊCH · E09 HẾT LƯỢT ============================== */
VIEWS.change = function () {
  var st = S.st, me = st.me, no = st.mine.changesLeft <= 0;
  if (!S.chg.from && !no) { var c = changeable(); if (c.length === 1) S.chg.from = { date: c[0].date, h: c[0].h }; }
  var sub = no ? 'Tuần này đã dùng ' + st.mine.changes + ' / 2 lần đổi' : st.week.phase === 'open' ? 'Chọn lịch bạn muốn đổi cho tuần tới' : 'Chọn lịch bạn muốn đổi cho tuần này';
  var subM = no ? sub : 'Chạm buổi cần đổi, rồi chạm ô mới';
  var page = pageEl('pg-chg', '<div class="bk st">' +
    '<div class="side"><div class="side-top">' +
      helloHTML({ title: 'Chào ' + me.call, sub: desk() ? sub : subM, info: me.coach + ' · còn ' + me.left + ' buổi · còn ' + st.mine.changesLeft + ' lần đổi', notYou: true }) +
      '<div class="m rs r1" id="mNote"></div>' +
      '<div class="grp d rs r1"><div class="grp-h"><span class="k">Đổi buổi</span></div><p class="grp-d" id="chgD"></p><div class="picks" id="pkList"></div></div>' +
      '<div class="grp d lg-d rs r2"><div class="grp-h"><span class="k">Cách đọc bảng</span></div>' + legendHTML(no ? 'nochg' : 'chg') + '</div>' +
    '</div><div class="side-act d rs r3">' + (no ? '' : '<button class="btn btn-tat" type="button" id="cta" data-a="chgo" disabled><span class="wd"><span>Xác nhận đổi</span></span>' + ico('right') + '</button>') + rulesHTML() + '</div></div>' +
    '<div class="wkw rs r1">' + gridHTML() + '<div class="lg-m m">' + legendHTML(no ? 'nochg-m' : 'chg-m') + '</div></div>' +
  '</div>');
  var mb = mbWeekHTML() + '<p class="sr" id="mbL"></p>' +
    (no ? '' : '<button class="btn btn-m btn-tat" type="button" id="ctaM" data-a="chgo" disabled><span class="wd"><span>Xác nhận đổi</span></span>' + ico('right') + '</button><p class="mb-note">' + esc(MRULE) + '</p>');
  return { page: page, mbar: mb, mood: no ? 'doubt' : 'observe', step: 1, flow: 'chg', back: true,
           floorAfter: function () { updateChange(true); }, mbarAfter: function () { updateChange(true); }, after: function () { updateChange(true); } };
};
function changeable() { return upcoming().filter(function (s) { return slotMs(s.date, s.h) - now() >= LEAD; }); }
function trailOf(s) {
  var mv = (S.st.mine.moves || []), chain = [{ date: s.date, h: s.h }], guard = 0, cur = { date: s.date, h: s.h };
  for (var i = mv.length - 1; i >= 0 && guard < 6; i--) {
    var m = mv[i];
    if (m.to.date === cur.date && +m.to.h === cur.h) { chain.unshift({ date: m.from.date, h: +m.from.h }); cur = { date: m.from.date, h: +m.from.h }; guard++; }
  }
  return chain.length > 1 ? chain.map(function (x) { return dShort(x.date).split(' ')[0] + ' ' + hm(x.h); }).join(' → ') : '';
}
function updateChange(first) {
  if (S.view !== 'change' || !S.st) return;
  var st = S.st, no = st.mine.changesLeft <= 0, from = S.chg.from, to = S.chg.to, can = changeable();
  if (from && !can.some(function (c) { return c.date === from.date && c.h === from.h; })) { S.chg.from = from = null; S.chg.to = to = null; }
  if (to && (!from || why(to.date, to.h, LEAD) || to.date === from.date || (sessOn(to.date) && sessOn(to.date).date !== from.date))) { S.chg.to = to = null; }
  paintGrid('chg');
  var d = $('#chgD');
  var cards = [];
  if (no || !can.length) {
    if (d) d.textContent = 'Không còn buổi nào đổi được tuần này.';
    upcoming().forEach(function (s) { cards.push({ key: 'k' + s.date, kind: 'booked', l: 'Giữ nguyên · ' + dFull(s.date), t: hm(s.h) }); });
  } else {
    if (d) d.textContent = desk() ? 'Bấm buổi cần đổi, rồi bấm ô mới.' : 'Chạm buổi cần đổi, rồi chạm ô mới.';
    if (from) cards.push({ key: 'f', kind: 'moving', l: 'Từ · ' + dFull(from.date), t: hm(from.h) });
    else cards.push({ key: 'f0', kind: 'add', need: true, l: 'Từ', t: 'Bấm buổi cần đổi trên bảng' });
    cards.push({ key: 'arr', kind: 'arrow' });
    if (to) cards.push({ key: 't', kind: 'to', l: 'Sang · ' + dFull(to.date), t: hm(to.h) });
    else cards.push({ key: 't0', kind: 'add', need: !!from, l: 'Sang', t: from ? 'Bấm ô mới trên bảng' : 'Chọn sau khi có buổi cần đổi' });
  }
  renderChgCards(cards, no || !can.length);
  /* "Gửi lại" chỉ khi buổi từ / sang trên màn đúng y lệnh đã gửi */
  var resend = !!(S.notice && noticeForErr(S.notice).resend && S.pending && S.pending.action === 'lt_change' && sameSlot(S.pending.body.from, from) && sameSlot(S.pending.body.to, to));
  var ok = !!(from && to) || resend;
  ctaSet(['#cta', '#ctaM'], resend ? 'Gửi lại' : 'Xác nhận đổi', ok, S.sending);
  /* thanh đáy mobile: dải tuần (buổi của bạn viền Mực · buổi đang đổi viền đứt · ô mới Mực). Hết lượt / không còn buổi đổi được:
     thêm dòng chú thích vết đổi (T4 18:00 → T5 19:00 → T7 18:00) — lúc đó không có nút chốt, thanh còn chỗ */
  var wk = {}, locked = no || !can.length;
  st.mine.sessions.forEach(function (s) { wk[s.date] = { k: s.st === 'on' ? 'mine' : 'done', t: hm(s.h) }; });
  if (from) wk[from.date] = { k: 'moving', t: hm(from.h) };
  if (to) wk[to.date] = { k: 'sel', t: hm(to.h) };
  var tr = locked ? upcoming().map(trailOf).filter(Boolean).join(' · ') : '';
  var cap = locked ? (no ? 'Đã đổi ' + st.mine.changes + ' / 2' : 'Không còn buổi đổi được') + (tr ? ' · ' + tr : '')
    : from ? 'Đổi ' + DOWF[dowOf(from.date)] + ' ' + hm(from.h) + (to ? ' sang ' + DOWF[dowOf(to.date)] + ' ' + hm(to.h) : '') : 'Chọn buổi cần đổi';
  mbWeek(wk, '', cap, first);
  var mbl = $('#mbL'); if (mbl) mbl.className = locked ? 'mb-cap' : 'sr';
  /* thông báo */
  var n = S.notice ? noticeForErr(S.notice) : null;
  if (!n && (no || !can.length)) {
    var up = upcoming();
    n = no ? { tone: 'warn', title: 'Hết lượt đổi tuần này.', body: (up.length === 1 ? 'Buổi ' + dFull(up[0].date).split(' ').slice(0, 2).join(' ') + ' ' + hm(up[0].h) + ' vẫn giữ.' : 'Các buổi còn lại vẫn giữ.') + ' Không đến vẫn tính 1 buổi.',
             mtitle: 'Hết lượt đổi' + (up.length === 1 ? ' · ' + dShort(up[0].date).split(' ')[0] + ' ' + hm(up[0].h) + ' vẫn giữ.' : '.') }
      : { tone: 'warn', title: 'Không còn buổi nào đổi được.', body: 'Đổi lịch phải trước buổi tập 24 giờ. Các buổi còn lại vẫn giữ.', mtitle: 'Không còn buổi nào đổi được.' };
  }
  setWarn(n && n.tone === 'warn');
  setFloor(n ? '<div class="fl">' + noticeHTML(n) + '</div>' + infoBtn()
    : '<div class="fl">' + specHTML(st.me.coach, 'Coach của bạn') + '<i class="spec-sep"></i>' + specHTML('Còn ' + st.mine.changesLeft + ' lần', 'Đổi lịch tuần này') + '</div>' + infoBtn());
  var mn = $('#mNote'); if (mn) { var mh = n ? mNoteHTML(n) : ''; if (mn._h !== mh) { mn._h = mh; mn.innerHTML = mh; S.page.classList.toggle('has-note', !!mh); if (mh && !first) { presence(mn.firstElementChild, true, { force: true }); if (!desk()) announce(n.mtitle || n.title); } } }
  headerFor();
}
function renderChgCards(cards, locked) {
  var host = $('#pkList'); if (!host) return;
  var html = cards.map(function (c) {
    if (c.kind === 'arrow') return '<div class="arrow-dn" data-k="arr">' + ico('down') + '</div>';
    var h = cardHTML(c);
    if (locked && c.kind === 'booked') { var tr = trailOf({ date: c.key.slice(1), h: parseInt(c.t, 10) }); if (tr) h += '<p class="trail" data-k="tr' + c.key + '">Đã đổi · ' + esc(tr) + '</p>'; }
    return h;
  }).join('');
  if (host._h === html) return;
  host._h = html;
  if (!host.firstElementChild || rm()) { host.innerHTML = html; return; }
  /* đổi tại chỗ: thẻ có cùng key giữ nguyên, thẻ đổi nội dung mờ chéo */
  var t = document.createElement('div'); t.innerHTML = html;
  var nu = Array.prototype.slice.call(t.children), old = {};
  $$(':scope>[data-k]', host).forEach(function (e) { old[e.dataset.k] = e; });
  host.innerHTML = '';
  nu.forEach(function (e) {
    var o = old[e.dataset.k];
    if (o && o.outerHTML === e.outerHTML) { host.appendChild(o); return; }
    host.appendChild(e);
    if (!rm()) { e.style.opacity = '0'; tw({ key: 'cc' + e.dataset.k, from: 0, to: 1, dur: .24, ease: EO, set: function (v) { e.style.opacity = v; e.style.transform = 'translateY(' + ((1 - v) * 6).toFixed(2) + 'px)'; }, done: function () { e.style.opacity = ''; e.style.transform = ''; } }); }
  });
}
function onChgCell(b) {
  if (b.getAttribute('aria-disabled') === 'true') { bobGlance(b); return; }
  if (S.sending) return;
  var d = b.dataset.d, h = +b.dataset.h, s = sessOn(d);
  if (s && s.h === h) {
    if (S.chg.from && S.chg.from.date === d) { S.chg.from = null; S.chg.to = null; }
    else { S.chg.from = { date: d, h: h }; if (S.chg.to && S.chg.to.date === d) S.chg.to = null; }
  } else if (S.chg.to && S.chg.to.date === d && S.chg.to.h === h) S.chg.to = null;
  else S.chg.to = { date: d, h: h };
  /* sửa lựa chọn: bỏ thông báo, GIỮ lệnh chưa rõ kết quả (lệnh mới mang nó theo — xem onBookCell) */
  if (S.notice) S.notice = null;
  updateChange(); bobGlance(b);
}
function sameSlot(a, b) { return !!(a && b && a.date === b.date && +a.h === +b.h); }
function submitChange() {
  if (S.sending || !S.st) return;
  var f = S.chg.from, t = S.chg.to, p = S.pending;
  /* chỉ gửi lại lệnh cũ khi buổi từ / sang trên màn đúng y lệnh đó (khách đã chọn lại → là lệnh mới) */
  var resend = !!(p && p.action === 'lt_change' && sameSlot(p.body.from, f) && sameSlot(p.body.to, t));
  if (!resend) {
    if (!f || !t) { shake($('#cta')); shake($('#ctaM')); return; }
    S.pending = newPending('lt_change', { from: { date: f.date, h: f.h }, to: { date: t.date, h: t.h } }, p);
  }
  savePend();
  sendPending('chg');
}
function chgError(r) {
  var e = r.error;
  if (e === 'het_luot_doi') { S.chg = { from: null, to: null }; S.notice = null; go('change', 'fwd', { instant: true }); return; }
  if (e === 'het_cho') {
    var t = (r.full && r.full[0]) || S.chg.to;
    S.notice = { tone: 'warn', title: (t ? dFull(t.date).split(' ').slice(0, 2).join(' ') + ' ' + hm(+t.h) : 'Khung này') + ' vừa hết chỗ.', body: 'Có người xác nhận trước bạn vài giây. Chọn ô khác trên bảng.', mtitle: (t ? dShort(t.date).split(' ')[0] + ' ' + hm(+t.h) : 'Khung này') + ' vừa hết chỗ.' };
    S.chg.to = null;
  } else {
    var M = { buoi_duoi_24h: ['Buổi này đã dưới 24 giờ.', 'Đổi lịch phải trước buổi tập 24 giờ.'], cung_ngay: ['Chỉ đổi sang ngày khác.', 'Chọn một ô ở ngày khác trong tuần.'],
              khong_co_buoi: ['Buổi này không còn trong phiếu.', 'Bảng vừa được cập nhật. Chọn lại buổi cần đổi.'], mot_ngay_mot_buoi: ['Ngày đó đã có buổi.', 'Mỗi ngày tối đa 1 buổi.'] };
    var x = M[r.why] || [whyText(r.why).title, whyText(r.why).body];
    S.notice = { tone: 'warn', title: x[0], body: x[1] };
    S.chg = { from: null, to: null };
  }
  tempMood('doubt', 3);
  updateChange();
}

/* ============================== 04 · 05 · 05B · PHIẾU ============================== */
VIEWS.ticket = function (op) {
  var st = S.st, me = st.me, v = op.variant || 'home', mine = st.mine, w = st.week;
  S.tkVariant = v;
  var up = upcoming(), title, sub, sub2 = '', flow = 'chg', step = 0;
  if (v === 'booked') { title = 'Đã đặt lịch tập!'; sub = 'B0DY đã tiếp nhận lịch đặt của bạn'; flow = 'book'; step = 3; }
  else if (v === 'added') { title = 'Đã thêm buổi tập!'; sub = 'Lịch của coach ' + me.coach + ' đã cập nhật'; sub2 = 'Phiếu bản ' + (mine.ver - 1) + ' không còn hiệu lực'; flow = 'add'; step = 2; }
  else if (v === 'changed') { title = 'Đã đổi lịch tập!'; sub = 'Lịch của coach ' + me.coach + ' đã cập nhật'; sub2 = 'Phiếu bản ' + (mine.ver - 1) + ' không còn hiệu lực'; flow = 'chg'; step = 2; }
  else {
    title = 'Lịch tập tuần ' + w.no + '.';
    if (up.length) sub = 'Còn ' + up.length + ' buổi trong tuần · lượt đổi còn ' + mine.changesLeft;
    else if (st.limits.add > 0) sub = 'Không còn buổi sắp tới · thêm được tối đa ' + st.limits.add + ' buổi';
    else { var p = parts(w.nextOpen); sub = 'Tuần ' + w.no + ' đã xong · tuần ' + w.nextNo + ' mở đặt 06:00 CN ' + pad2(p.d) + '.' + pad2(p.m); }
  }
  var tkW = ticketWide(v), tkT = ticketTall(v);
  var subM2 = v === 'changed' && S.moved ? 'Bản ' + (mine.ver - 1) + ' hết hiệu lực · buổi mới ' + dShort(S.moved.to.date).split(' ')[0] + ' ' + hm(+S.moved.to.h) : sub2;
  var page = pageEl('pg-tk', '<div class="tkp st">' +
    '<div class="tkp-top">' + helloHTML({ title: title, sub: sub, notYou: true }).replace('</p>', '</p>' + (sub2 ? '<p class="sub2 d">' + esc(sub2) + '</p>' : '') + (subM2 ? '<p class="sub2 m">' + esc(subM2) + '</p>' : '')) + '</div>' +
    '<div class="tk-stage"><div class="tk-fit" id="tkfit">' + tkW + tkT + '</div></div>' +
  '</div>');
  page._tkW = tkW; page._tkT = tkT;   /* để "Xong" (phiếu → phiếu) biết vé nào thật sự khác */
  var calLbl = v === 'home' || v === 'booked' ? 'Thêm vào lịch' : 'Cập nhật lịch';
  /* thêm buổi theo đúng máy chủ (limits.add), kể cả khi các buổi đã đặt đều đã qua */
  var canAdd = st.limits.add > 0, canChg = up.length > 0;
  var fl, mb;
  if (v === 'home') {
    fl = '<div class="tk-act"><button class="btn btn-phu w220" type="button" data-a="png">' + ico('save') + '<span>Lưu về máy</span></button>' +
      '<button class="btn btn-phu w240" type="button" data-a="ics">' + ico('cal') + '<span>' + calLbl + '</span></button>' +
      (canAdd ? '<button class="btn btn-phu w180" type="button" data-a="goadd">' + ico('plus') + '<span>Thêm buổi</span></button>' : '') +
      (canChg ? '<button class="btn btn-toi w180" type="button" data-a="gochg"><span>Đổi buổi</span>' + ico('right') + '</button>' : '') + '</div>';
    mb = '<div class="mb-row"><button class="btn btn-s btn-phu" type="button" data-a="png">' + ico('save') + '<span>Lưu về máy</span></button><button class="btn btn-s btn-phu" type="button" data-a="ics">' + ico('cal') + '<span>' + calLbl + '</span></button></div>' +
      (canAdd || canChg ? '<div class="mb-row">' + (canAdd ? '<button class="btn btn-m btn-phu" type="button" data-a="goadd">' + ico('plus') + '<span>Thêm buổi</span></button>' : '') +
        (canChg ? '<button class="btn btn-m btn-toi" type="button" data-a="gochg"><span>Đổi buổi</span>' + ico('right') + '</button>' : '') + '</div>' : '');
  } else {
    fl = '<div class="tk-act"><button class="btn btn-phu w220" type="button" data-a="png">' + ico('save') + '<span>Lưu về máy</span></button>' +
      '<button class="btn btn-phu w240" type="button" data-a="ics">' + ico('cal') + '<span>' + calLbl + '</span></button>' +
      '<button class="btn btn-toi w180" type="button" data-a="tkdone"><span>Xong</span></button></div>';
    mb = '<div class="mb-row"><button class="btn btn-s btn-phu" type="button" data-a="png">' + ico('save') + '<span>Lưu về máy</span></button><button class="btn btn-s btn-phu" type="button" data-a="ics">' + ico('cal') + '<span>' + calLbl + '</span></button></div>' +
      '<button class="btn btn-m btn-toi" type="button" data-a="tkdone"><span>Xong</span></button>';
  }
  return { page: page, floor: fl, mbar: mb, mood: v === 'home' ? 'observe' : 'done', flow: flow, step: step,
           after: function () {
             tkFit(); tkPaper(); if (v !== 'home' && !op.instant) bobReact('nod'); if (!op.instant) animateTicket(); tk3dGo(op);
             /* phông về muộn đổi cao phiếu → đo lại cho vừa màn (mobile) */
             if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (S.view === 'ticket' && !desk()) { tkFit(); tkPaper(); } }, function () {});
           },
           /* thanh nút đáy đổi nội dung sau ~100 ms (fade-through) → cao mới của thanh mới là phần đáy thật: đo lại (mobile) */
           mbarAfter: function () { if (S.view === 'ticket' && !desk()) { tkFit(); tkPaper(); } } };
}
function tkSessions() {
  var mv = S.tkVariant === 'changed' && S.moved ? S.moved.to : null;
  return S.st.mine.sessions.slice().sort(byDate).map(function (s) { return { date: s.date, h: s.h, st: s.st, fresh: !!(mv && mv.date === s.date && +mv.h === s.h) }; });
}
function tkCode() { var m = S.st.mine, a = m.code.split('-W'); return { bar: m.code + '-' + m.ver, lbl: a[0] + ' · W' + (a[1] || pad2(S.st.week.no)) + ' · Bản ' + m.ver }; }
function tkWeekLbl() { var w = S.st.week; return 'Tuần ' + w.no + ' · ' + w.days[0].slice(8) + '–' + ddmm(addD(w.days[0], 6)); }
function ticketWide() {
  var st = S.st, me = st.me, w = st.week, ss = tkSessions(), by = {}, code = tkCode();
  ss.forEach(function (s) { by[s.date + '|' + s.h] = s; });
  var g = '<div class="mg" aria-hidden="true"><span></span>';
  w.days.forEach(function (d) { g += '<span class="hd7">' + DOW[dowOf(d)] + '</span>'; });
  g += '<span class="hd7 off">CN</span>';
  SLOTS.forEach(function (h) {
    if (h === 14) g += '<span class="gap"></span>';
    g += '<span class="hr">' + pad2(h) + '</span>';
    w.days.forEach(function (d) {
      var s = by[d + '|' + h];
      if (s) { g += '<span class="mc ' + (s.st === 'on' ? 'on' : 'was') + '">' + hm(h) + '</span>'; }
      else g += '<span class="mc"></span>';
    });
    g += '<span class="mc off"></span>';
  });
  g += '</div>';
  var list = ss.map(function (s) {
    var t = dShort(s.date) + ' · ' + (s.st === 'done' ? 'Đã tập' : s.st === 'absent' ? 'Vắng' : hm(s.h));
    return '<span class="' + (s.st === 'on' ? '' : 'was') + (s.fresh ? ' new' : '') + '">' + esc(t) + '</span>';
  }).join('');
  return '<div class="tk d" id="tkW" role="img" aria-label="' + esc(tkAria()) + '"><svg class="tk-paper" id="tkPaperW" aria-hidden="true"></svg>' +
    '<div class="tk-main"><div class="tk-l"><div><span class="tk-wm">' + WM_SVG + '</span><div class="tk-name"><span class="a">PHIẾU TẬP</span><span class="b">' + esc(tkWeekLbl().toUpperCase()) + '</span></div></div>' +
      '<div class="tk-big"><span class="num" data-n="' + esc(ss.length) + '">' + esc(ss.length) + '</span><span class="unit">BUỔI</span></div>' +
      '<div class="tk-ppl"><div class="row"><div class="kv"><span class="k">Coach</span><span class="v">' + esc(me.coach) + '</span></div><div class="kv"><span class="k">Hội viên</span><span class="v">' + esc(me.short) + '</span></div></div>' +
      '<span class="tk-pkg">GÓI ' + esc((me.pkg ? me.pkg + ' · ' : '') + me.kind) + '</span></div></div>' +
      '<i class="tk-dash"></i><div class="tk-r">' + g + '<div class="tk-list">' + list + '</div></div></div>' +
    '<div class="tk-stub"><div class="tk-stat"><div class="kv"><span class="k">Lượt đổi còn</span><span class="v big">' + esc(st.mine.changesLeft) + '</span></div><div class="kv"><span class="k">Báo trước khi đổi</span><span class="v mid">24H</span></div></div>' +
      '<div class="tk-code">' + barcodeSVG(code.bar) + '<span class="lbl">' + esc(code.lbl.toUpperCase()) + '</span></div></div></div>';
}
function ticketTall() {
  var st = S.st, me = st.me, w = st.week, ss = tkSessions(), by = {}, code = tkCode();
  ss.forEach(function (s) { by[s.date] = s; });
  var row = '<div class="wk7" aria-hidden="true">';
  w.days.forEach(function (d) {
    var s = by[d];
    row += '<div class="d7"><span class="a">' + DOW[dowOf(d)] + '</span><span class="b">' + esc(d.slice(8)) + '</span><span class="mc' + (s ? (s.st === 'on' ? ' on' : ' was') : '') + '">' + (s ? esc(hm(s.h)) : '') + '</span></div>';
  });
  var sun = addD(w.days[0], 6);
  row += '<div class="d7 off"><span class="a">CN</span><span class="b">' + esc(sun.slice(8)) + '</span><span class="mc off"></span></div></div>';
  return '<div class="tkm m" id="tkT" role="img" aria-label="' + esc(tkAria()) + '"><svg class="tk-paper" id="tkPaperT" aria-hidden="true"></svg>' +
    '<div class="tkm-main"><div class="tkm-h"><span class="tk-wm">' + WM_SVG + '</span><div class="tk-name"><span class="a">PHIẾU TẬP</span><span class="b">' + esc(tkWeekLbl().toUpperCase()) + '</span></div></div>' +
      '<div class="tk-big"><span class="num" data-n="' + esc(ss.length) + '">' + esc(ss.length) + '</span><span class="unit">BUỔI</span></div>' + row +
      '<div class="tk-ppl"><div class="row"><div class="kv"><span class="k">Coach</span><span class="v">' + esc(me.coach) + '</span></div><div class="kv"><span class="k">Hội viên</span><span class="v">' + esc(me.short) + '</span></div>' +
      '<div class="kv"><span class="k">Gói</span><span class="v">' + esc((me.pkg ? me.pkg + ' · ' : '') + me.kind) + '</span></div></div></div></div>' +
    '<div class="tkm-stub"><div class="tk-stat"><div class="kv"><span class="k">Lượt đổi còn</span><span class="v big">' + esc(st.mine.changesLeft) + '</span></div><div class="kv"><span class="k">Báo trước khi đổi</span><span class="v mid">24H</span></div></div>' +
      barcodeSVG(code.bar) + '<span class="lbl">' + esc(code.lbl.toUpperCase()) + '</span></div></div>';
}
function tkAria() {
  var ss = tkSessions();
  return 'Phiếu tập ' + tkWeekLbl() + ', ' + ss.length + ' buổi: ' + ss.map(function (s) { return dFull(s.date) + ' ' + hm(s.h) + (s.st === 'done' ? ' đã tập' : ''); }).join(', ') + '. Mã ' + tkCode().lbl + '.';
}
function animateTicket() {
  if (rm()) return;
  var tk = tkCur(); if (!tk) return;
  tk.classList.remove('in'); void tk.offsetWidth; tk.classList.add('in');
  $$('.mc.on,.mc.was', tk).forEach(function (c, i) { c.style.animationDelay = (0.32 + i * 0.06) + 's'; });
  var num = tk.querySelector('.tk-big .num'); if (num) countTo(num, 0, +num.dataset.n, .6, .22);
  setTimeout(function () { tk.classList.remove('in'); $$('.mc', tk).forEach(function (c) { c.style.animationDelay = ''; }); }, 1600);
}
/* phiếu desktop 1080×392: thu nhỏ cho vừa khung */
function tkFit(keep) {
  var fit = tkQ('#tkfit'); if (!fit) return;
  if (!desk()) { tkFitM(fit, keep); return; }
  var tkm = tkQ('#tkT'); if (tkm) tkm.classList.remove('cp');
  fit.classList.remove('sc'); fit.style.removeProperty('--tkh');
  var stage = fit.parentNode, aw = stage.clientWidth, ah = stage.clientHeight - 24;
  var s = Math.max(0.5, Math.min(1, aw / 1110, ah / 420)), cur = parseFloat(fit.style.getPropertyValue('--tks'));
  if (keep && cur > 0 && cur <= s) return;   /* phiếu → phiếu: cỡ đang có vẫn vừa → giữ, không co giãn */
  fit.style.setProperty('--tks', s.toFixed(3));
}
/* chiều cao khung nhìn NHỎ (thanh công cụ Safari đang hiện): không đổi khi thanh công cụ thu / mở lúc cuộn → phiếu không co giãn theo tay cuộn */
var SVHP = null;
function svh() {
  var ih = window.innerHeight || 0;
  try {
    if (!SVHP) {
      SVHP = document.createElement('div'); var s = SVHP.style;
      s.position = 'fixed'; s.left = '0'; s.top = '0'; s.width = '0'; s.height = '100vh'; s.height = '100svh'; s.visibility = 'hidden'; s.pointerEvents = 'none';
      document.body.appendChild(SVHP);
    }
    var h = SVHP.offsetHeight; return h > 200 ? (ih ? Math.min(h, ih) : h) : ih;
  } catch (e) { return ih; }
}
/* mobile: cả phiếu dọc nằm gọn trong một màn — từ đỉnh khung phiếu tới mép trên thanh nút đáy, trang không còn cuộn. Không vừa → bớt khoảng thở
   (.cp, chữ giữ cỡ); vẫn không vừa → thu nhỏ cả phiếu (không dưới 0,8 để chữ còn đọc được; máy rất thấp thì cuộn). Đo theo bố cục
   (offsetTop, offsetHeight), không theo hình đang biến đổi (vé đang vào màn / đang nghiêng). Phần dưới phiếu = tổng padding đáy các khung
   chứa (khung phiếu → trang → main, main chừa chỗ thanh nút đáy) */
function tkFitM(fit, keep) {
  var tk = tkQ('#tkT'); if (!tk) return;
  mbarSize();
  var stage = fit.parentNode, top = parseFloat(getComputedStyle(stage).paddingTop) || 0, tail = 0, el;
  for (el = stage; el; el = el.offsetParent) top += el.offsetTop;
  for (el = stage; el && el !== document.body; el = el.parentNode) tail += parseFloat(getComputedStyle(el).paddingBottom) || 0;
  var avail = svh() - top - tail, cur = parseFloat(fit.style.getPropertyValue('--tks'));
  /* phiếu → phiếu: cỡ đang có (gọn / thu) vẫn vừa → giữ nguyên, không co giãn giữa chừng */
  if (keep && cur > 0 && (avail <= 0 || fit.offsetHeight * cur <= avail + .5)) return;
  tk.classList.remove('cp');
  var h = fit.offsetHeight;
  if (avail > 0 && h > avail) { tk.classList.add('cp'); h = fit.offsetHeight; }
  var k = avail > 0 && h > avail ? Math.max(.8, avail / h) : 1;
  fit.style.setProperty('--tks', k.toFixed(3)); fit.style.setProperty('--tkh', h + 'px'); fit.classList.toggle('sc', k < 1);
}
/* giấy phiếu: răng cưa ở mép ngoài, khuyết tròn + lỗ đục ở đường xé */
function teeth(x0, y0, x1, y1, amp, step, side) {
  var pts = [], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step)), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  for (var i = 1; i <= n; i++) {
    var t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (i < n && i % 2 === 1) { x += -uy * amp * side; y += ux * amp * side; }
    pts.push(x.toFixed(2) + ' ' + y.toFixed(2));
  }
  return 'L' + pts.join('L');
}
function circ(cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0Z'; }
/* khía tròn ở đường xé là cung khoét vào mép giấy (trước: hình tròn evenodd chồng lên mép → nửa ngoài phồng ra thành u giấy).
   Hình giấy ghi vào svg._tk → tk3d.js dựng mép / lỗ của bản WebGL từ đúng các số này (một nguồn duy nhất). */
function tkPaper() {
  var w = tkQ('#tkPaperW'), R = 11;
  if (w) {
    var W = 1080, H = 392, X = 800, hn = 0;
    var d = 'M4 0H' + (X - R) + 'A' + R + ' ' + R + ' 0 0 0 ' + (X + R) + ' 0H' + W + teeth(W, 0, W, H, 3.5, 4, 1) +
      'H' + (X + R) + 'A' + R + ' ' + R + ' 0 0 0 ' + (X - R) + ' ' + H + 'H4' + teeth(4, H, 4, 0, 3.5, 4, 1) + 'Z';
    for (var y = 28; y <= H - 28; y += 9) { d += circ(X, y, 2); hn++; }
    w.setAttribute('viewBox', '0 0 ' + W + ' ' + H); w.innerHTML = '<path fill-rule="evenodd" d="' + d + '"/>';
    w._tk = { v: 0, W: W, H: H, P: X, n: Math.max(2, Math.round(H / 4)), amp: 3.5, e0: 4, rn: R, rh: 2, h0: 28, hp: 9, hn: hn };
  }
  var t = tkQ('#tkPaperT'), tk = tkQ('#tkT');
  if (t && tk) {
    var main = tk.querySelector('.tkm-main'), Wt = tk.clientWidth, Ht = tk.clientHeight, Y = main.offsetHeight, hn2 = 0;
    if (Wt && Ht) {
      var d2 = 'M0 4' + teeth(0, 4, Wt, 4, 3.5, 4, -1) + 'V' + (Y - R) + 'A' + R + ' ' + R + ' 0 0 0 ' + Wt + ' ' + (Y + R) + 'V' + (Ht - 4) +
        teeth(Wt, Ht - 4, 0, Ht - 4, 3.5, 4, -1) + 'V' + (Y + R) + 'A' + R + ' ' + R + ' 0 0 0 0 ' + (Y - R) + 'Z';
      for (var x = 24; x <= Wt - 24; x += 9) { d2 += circ(x, Y, 2); hn2++; }
      t.setAttribute('viewBox', '0 0 ' + Wt + ' ' + Ht); t.innerHTML = '<path fill-rule="evenodd" d="' + d2 + '"/>';
      t._tk = { v: 1, W: Wt, H: Ht, P: Y, n: Math.max(2, Math.round(Wt / 4)), amp: 3.5, e0: 4, rn: R, rh: 2, h0: 24, hp: 9, hn: hn2 };
    }
  }
  tk3dFit();
}

/* ---------- phiếu giấy thật (tk3d.js · WebGL2) ----------
   Vé DOM vào xong (hoặc ngay khi vẽ tức thì) → bản WebGL phẳng trùng khít thay chỗ, vé DOM trong suốt (vẫn giữ role="img" + aria-label)
   → thả lỏng thành giấy 3D (0,6 s --eo, đồng hồ MT). Giảm chuyển động / làm mới ngầm khi đang hiện 3D → dáng cuối ngay, không diễn lại.
   Không có tk3d / không WebGL2 / WebGL bằng CPU / mất ngữ cảnh → vé DOM như cũ. */
/* tìm trong trang đang hiện (S.page): lúc phiếu → phiếu, trang cũ còn nằm trong DOM ~230 ms để rời màn — không được đụng vé của nó */
function tkQ(sel) { return (S.page || document).querySelector(sel); }
function tkCur() { return tkQ(desk() ? '#tkW' : '#tkT'); }
function tk3dGo(op) {
  tiltBind();
  var T = window.TK3D; if (!T) return;
  var was = T.shown() >= 1;
  afKill('tk3d'); twKill('tk3d');
  if (!T.attach(tkCur())) return;
  var fin = rm() || (op.instant && was);
  if (fin && T.booted()) { tiltHand(true); var ok0 = T.show(1, true); tiltHand(false); if (ok0) return; }
  after(op.instant || fin ? 0 : 1.1, function go1() {
    if (S.view !== 'ticket') return;
    var el = tkCur(); if (!el) return;
    if (T.el() !== el && !T.attach(el)) return;
    var r = T.ready(); if (r < 0) return;
    if (!r || tkMoving(el)) { after(.1, go1, 'tk3d'); return; }
    /* vé DOM đang được nghiêng bằng CSS: gỡ nghiêng để tk3d đo đúng vé, bản WebGL nhận lại đúng góc ngay trong cùng khung */
    tiltHand(true);
    if (fin) { T.show(1); tiltHand(false); return; }
    if (!T.show(0)) { tiltHand(false); return; }
    tiltHand(false);
    tw({ key: 'tk3d', from: 0, to: 1, dur: .6, ease: EO, set: function (v) { T.pose(v); } });
  }, 'tk3d');
}

/* ---------- cầm phiếu lên xem (v1.1): rê chuột thì phiếu nghiêng theo, nhấn giữ kéo thì xoay có đà rồi lò xo về dáng nghỉ ----------
   Thông số theo tvOS focus · model-viewer · pokemon-cards (nghiên cứu 17/10): rê ±10° ngang · ±7° dọc, lò xo ζ 0,7 (~0,45 s);
   kéo 0,32°/px (chuột) · 0,45°/px (cảm ứng), giới hạn mềm ±38° / ±24° (quá giới hạn co giãn ×0,3); thả: đà 80 ms cuối (≤ 720°/s),
   tắt dần τ 0,3 s, rồi lò xo ζ 0,78 về dáng nghỉ. Cầm lên thì giấy nhấc về phía người xem, bóng xa + nhoè ra, giấy võng theo đà.
   Cảm ứng: touch-action pan-y — vuốt dọc vẫn cuộn trang, vuốt ngang mới xoay phiếu. Vào phiếu mà chưa chạm: lắc gợi ý một lần.
   Có WebGL 3D → xoay tờ giấy thật (TK3D.rot: ánh sáng, bóng đổ theo góc); không có → nghiêng vé DOM bằng CSS 3D. Giảm chuyển động: tắt. */
var TILT = { st: null, key: '', y: 0, p: 0, vy: 0, vp: 0, ty: 0, tp: 0, l: 0, vl: 0, tl: 0, fx: 0, dvy: 0, dvp: 0, drag: null, hov: null, raf: 0, last: 0,
  mode: '', settle: 0, hint: 0, touched: false, emitT: 0, smp: [] };
function tiltLim() { return desk() ? { hy: 10, hp: 7, dy: 38, dp: 24, k: .32 } : { hy: 0, hp: 0, dy: 34, dp: 26, k: .45 }; }
/* quá giới hạn mềm: co giãn tiệm cận — không bao giờ quá giới hạn + 22° (vé không dựng cạnh / lật mặt ngược) */
function tiltRb(v, lim) { var a = Math.abs(v); return a <= lim ? v : (v < 0 ? -1 : 1) * (lim + 22 * (1 - Math.exp(-(a - lim) / 22))); }
function tiltBind() {
  var st = tkQ('.tk-stage'); if (!st || st._tilt) return;
  st._tilt = 1;
  /* cùng phiếu được vẽ lại (làm mới ngầm ~2 phút / quay lại tab) → giữ góc đang có rồi lò xo về, không lắc gợi ý lại;
     phiếu khác (đặt / đổi / thêm xong, về phiếu chính) → bắt đầu lại từ dáng nghỉ */
  var T = TILT, key = S.st && S.st.mine ? (S.st.mine.code || '') + ':' + S.st.mine.ver : '', same = !!key && key === T.key;
  tiltStop(); T.st = st; T.key = key; T.drag = null; T.mode = '';
  if (!same) { T.hov = null; T.y = T.p = T.vy = T.vp = T.l = T.vl = T.fx = T.ty = T.tp = T.tl = 0; T.touched = false; T.hint = 0; }
  /* vuốt dọc vẫn cuộn trang; giữ được chụm hai ngón phóng to (trình duyệt không hiểu pinch-zoom thì chỉ pan-y) */
  st.style.touchAction = 'pan-y pinch-zoom'; if (st.style.touchAction.indexOf('pan-y') < 0) st.style.touchAction = 'pan-y';
  st.addEventListener('pointermove', tiltMove);
  st.addEventListener('pointerdown', tiltDown);
  st.addEventListener('pointerup', tiltUp);
  st.addEventListener('pointercancel', tiltUp);
  st.addEventListener('lostpointercapture', tiltUp);   /* mất pointerup (đổi cửa sổ, hộp thoại) → không kẹt ở trạng thái kéo */
  st.addEventListener('pointerleave', function (e) { if (TILT.st === st && e.pointerType === 'mouse' && !TILT.drag) { TILT.hov = null; st.style.cursor = ''; tiltKick(); } });
  if (same) { tiltKick(); return; }
  if (!rm()) setTimeout(function () {
    if (TILT.st !== st || !st.isConnected || TILT.touched || TILT.hov || S.view !== 'ticket') return;
    TILT.hint = performance.now(); tiltKick(); bobEmit('hover', { el: tkCur(), ms: 1800 });
  }, 3600);
}
function tiltStop() { if (TILT.raf) cancelAnimationFrame(TILT.raf); TILT.raf = 0; }
/* toạ độ con trỏ trên vé (−1…1), ngoài vé → null */
function tiltIn(e) {
  var tk = tkCur(); if (!tk) return null;
  var r = tk.getBoundingClientRect(); if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
  return { x: (e.clientX - r.left) / r.width * 2 - 1, y: (e.clientY - r.top) / r.height * 2 - 1 };
}
function tiltMove(e) {
  var T = TILT; if (T.st !== e.currentTarget) return;   /* sự kiện của vé cũ (đang rời màn) → bỏ qua */
  if (T.drag && e.pointerId === T.drag.id) {
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { tiltUp(e); return; }   /* nút chuột đã nhả mà không có pointerup */
    var L = tiltLim(), d = T.drag, t = performance.now();
    T.y = tiltRb(d.y0 + (e.clientX - d.x) * L.k, L.dy); T.p = tiltRb(d.p0 - (e.clientY - d.y) * L.k * .8, L.dp);
    T.smp.push([t, T.y, T.p]); while (T.smp.length > 2 && t - T.smp[0][0] > 120) T.smp.shift();
    var a = T.smp[0], dt = Math.max(.016, (t - a[0]) / 1000); T.dvy = (T.y - a[1]) / dt; T.dvp = (T.p - a[2]) / dt;
    tiltKick(); return;
  }
  if (e.pointerType !== 'mouse' || rm()) return;
  T.hov = tiltIn(e); T.st.style.cursor = T.hov ? 'grab' : '';
  if (T.hov) T.touched = true;
  tiltKick();
}
function tiltDown(e) {
  var T = TILT;
  if (T.st !== e.currentTarget || rm() || e.button > 0 || T.drag || !tiltIn(e)) return;
  var t = performance.now();
  T.touched = true; T.hint = 0; T.mode = ''; T.vy = T.vp = 0;
  T.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, y0: T.y, p0: T.p }; T.smp = [[t, T.y, T.p]]; T.dvy = T.dvp = 0;
  try { T.st.setPointerCapture(e.pointerId); } catch (x) { /* bỏ qua */ }
  if (e.pointerType === 'mouse') { e.preventDefault(); T.st.style.cursor = 'grabbing'; }
  bobEmit('hover', { el: tkCur(), ms: 1400 });
  tiltKick();
}
function tiltUp(e) {
  var T = TILT; if (T.st !== e.currentTarget || !T.drag || e.pointerId !== T.drag.id) return;
  var t = performance.now(), a = T.smp[0], dt = Math.max(.016, (t - a[0]) / 1000), fresh = t - T.smp[T.smp.length - 1][0] < 90;
  /* đà lúc thả: trung bình ~80 ms cuối, tối đa 720°/s; giữ yên rồi mới thả → không có đà */
  T.vy = fresh ? Math.max(-720, Math.min(720, (T.y - a[1]) / dt)) : 0; T.vp = fresh ? Math.max(-720, Math.min(720, (T.p - a[2]) / dt)) : 0;
  T.drag = null; T.mode = 'coast';
  try { T.st.releasePointerCapture(e.pointerId); } catch (x) { /* bỏ qua */ }
  if (e.pointerType === 'mouse') { T.hov = tiltIn(e); T.st.style.cursor = T.hov ? 'grab' : ''; }
  tiltKick();
}
function tiltKick() { if (!TILT.raf && TILT.st) { TILT.last = performance.now(); TILT.raf = requestAnimationFrame(tiltTick); } }
function tiltTick(t) {
  var T = TILT; T.raf = 0;
  if (!T.st || !T.st.isConnected || S.view !== 'ticket') { tiltCss(0, 0, false); T.st = null; return; }
  var dt = Math.min(.25, Math.max(0, (t - T.last) / 1000)), L = tiltLim(); T.last = t;   /* khung chậm vẫn đúng nhịp (bước con 8 ms) */
  var n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
  for (var i = 0; i < n; i++) tiltPhys(h, L, t);
  tiltRender(L, t);
  var moving = T.drag || T.hint || T.mode === 'coast' || t < T.settle || Math.abs(T.vy) + Math.abs(T.vp) > .3 || Math.abs(T.y - T.ty) + Math.abs(T.p - T.tp) > .01 || Math.abs(T.l - T.tl) + Math.abs(T.vl) > .002 || T.fx > .002;
  if (moving) T.raf = requestAnimationFrame(tiltTick);
  else { T.y = T.ty; T.p = T.tp; tiltRender(L, t); }
}
function tiltPhys(h, L, t) {
  var T = TILT, ty = 0, tp = 0;
  if (T.hov && !T.drag) { ty = T.hov.x * L.hy; tp = -T.hov.y * L.hp; }
  if (T.hint) { var u = (t - T.hint) / 1900; if (u >= 1 || T.touched) T.hint = 0; else ty += 9 * Math.sin(Math.PI * 2 * u) * Math.pow(1 - u, 1.4); }
  T.ty = ty; T.tp = tp; T.tl = T.drag ? 1 : 0;
  if (T.drag) { T.vy = T.vp = 0; }
  else if (T.mode === 'coast') {
    var dec = Math.exp(-h / .3);
    T.vy *= dec; T.vp *= dec;
    /* quá giới hạn: tường mềm kéo về */
    var oy = Math.abs(T.y) > L.dy ? T.y - (T.y < 0 ? -L.dy : L.dy) : 0, op = Math.abs(T.p) > L.dp ? T.p - (T.p < 0 ? -L.dp : L.dp) : 0;
    T.vy -= oy * 90 * h; T.vp -= op * 90 * h;
    T.y += T.vy * h; T.p += T.vp * h;
    /* hất mạnh: chặn cứng ở giới hạn + 22°, triệt đà ở đó (không dựng cạnh, không lật) */
    var my = L.dy + 22, mp = L.dp + 22;
    if (T.y > my) { T.y = my; if (T.vy > 0) T.vy = 0; } else if (T.y < -my) { T.y = -my; if (T.vy < 0) T.vy = 0; }
    if (T.p > mp) { T.p = mp; if (T.vp > 0) T.vp = 0; } else if (T.p < -mp) { T.p = -mp; if (T.vp < 0) T.vp = 0; }
    if (Math.abs(T.vy) < 2 && Math.abs(T.vp) < 2) { T.mode = ''; T.settle = t + 240; }
  } else if (t >= T.settle) {
    var k = T.hov ? 240 : 80, c = 2 * (T.hov ? .7 : .78) * Math.sqrt(k);
    T.vy += (k * (T.ty - T.y) - c * T.vy) * h; T.y += T.vy * h;
    T.vp += (k * (T.tp - T.p) - c * T.vp) * h; T.p += T.vp * h;
  }
  var kl = 140, cl = 2 * .85 * Math.sqrt(kl);
  T.vl += (kl * (T.tl - T.l) - cl * T.vl) * h; T.l += T.vl * h;
  /* giấy võng theo đà xoay */
  var sp = Math.min(1, Math.hypot(T.drag ? T.dvy : T.vy, T.drag ? T.dvp : T.vp) / 420);
  T.fx += (sp - T.fx) * Math.min(1, h * 9);
}
function tiltRender(L, t) {
  var T = TILT, K = window.TK3D;
  if (K && K.shown && K.rot && K.shown() >= 0) { tiltCss(0, 0, false); K.rot(T.y, T.p, Math.max(0, T.l), T.fx); }
  else tiltCss(T.y, T.p, true);
  if (t - T.emitT > 100 && (T.drag || Math.abs(T.y) + Math.abs(T.p) > .4)) {
    T.emitT = t;
    bobEmit('tilt', { el: tkCur(), x: T.y / L.dy, y: T.p / L.dp, v: Math.hypot(T.drag ? T.dvy : T.vy, T.drag ? T.dvp : T.vp) / 300 });
  }
}
/* bàn giao vé DOM ↔ WebGL: gỡ nghiêng CSS trước khi tk3d đo; xong thì áp góc hiện tại cho bản WebGL ngay */
function tiltHand(before) {
  if (before) { tiltCss(0, 0, false); return; }
  var K = window.TK3D, T = TILT;
  if (K && K.shown && K.rot && K.shown() >= 0 && (T.y || T.p || T.l)) K.rot(T.y, T.p, Math.max(0, T.l), T.fx);
}
function tiltCss(y, p, on) {
  var f = tkQ('#tkfit'); if (!f) return;
  if (on && (Math.abs(y) > .01 || Math.abs(p) > .01 || TILT.drag)) {
    f.classList.add('tilt'); f.style.setProperty('--tky', y.toFixed(3) + 'deg'); f.style.setProperty('--tkp', p.toFixed(3) + 'deg');
  } else if (f.classList.contains('tilt')) { f.classList.remove('tilt'); f.style.removeProperty('--tky'); f.style.removeProperty('--tkp'); }
}
/* vé DOM còn đang vào: CSS animation đang chạy / số buổi đang đếm lên */
function tkMoving(el) {
  var num = el.querySelector('.tk-big .num');
  if (num && num.textContent !== num.getAttribute('data-n')) return true;
  try { return el.getAnimations({ subtree: true }).some(function (a) { return a.playState === 'running' || a.pending; }); } catch (e) { return false; }
}
/* khung đổi (vừa khung, xoay màn, đổi cỡ) → tk3d đo lại; đổi desktop ↔ mobile → gắn sang vé kia, giữ dáng đang có */
function tk3dFit() {
  var T = window.TK3D; if (!T || S.view !== 'ticket' || !S.page) return;
  var b = T.el(), el = tkCur();
  if (!b || !el || !S.page.contains(b)) return;   /* chưa gắn / vé của trang cũ: tk3dGo lo */
  if (b === el) { T.refit(); return; }
  var p = T.shown();
  if (T.attach(el) && p >= 0) T.show(p, true);
}

/* ---------- mã vạch Code 128B (bảng chuẩn, đã đối chiếu python-barcode) ---------- */
var C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112').split(' ');
function code128B(text) {
  var codes = [104], sum = 104;
  for (var i = 0; i < text.length; i++) { var v = text.charCodeAt(i) - 32; if (v < 0 || v > 95) v = 0; codes.push(v); sum += v * (i + 1); }
  codes.push(sum % 103); codes.push(106);
  var bars = [], x = 0;
  codes.forEach(function (c) { var p = C128[c]; for (var j = 0; j < p.length; j++) { var w = +p[j]; if (j % 2 === 0) bars.push([x, w]); x += w; } });
  return { bars: bars, width: x };
}
function barcodeSVG(text) {
  var c = code128B(text), d = c.bars.map(function (b) { return 'M' + b[0] + ' 0h' + b[1] + 'v1h-' + b[1] + 'z'; }).join('');
  return '<svg class="bc" viewBox="0 0 ' + c.width + ' 1" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
}

/* ---------- Thêm vào lịch (.ics) ---------- */
/* gấp dòng .ics ≤ 75 byte UTF-8 (RFC 5545), cắt theo ký tự trọn vẹn (code point), không cắt giữa một chữ có dấu */
function icsText(lines) {
  return lines.map(function (l) {
    var out = '', cur = '', bytes = 0;
    for (var i = 0; i < l.length;) {
      var c = l.codePointAt(i), ch = String.fromCodePoint(c), b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
      i += ch.length;
      if (bytes + b > (out ? 74 : 75)) { out += (out ? '\r\n ' : '') + cur; cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    return out + (out ? '\r\n ' : '') + cur;
  }).join('\r\n') + '\r\n';
}
function icsEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsDate(ms) { var d = new Date(ms); return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z'; }
function downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
function icsTicket() {
  var st = S.st, me = st.me, m = st.mine, stamp = icsDate(now()), code = tkCode(), L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//B0DY Studio//Lich tap tuan//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:B0DY · Lịch tập'];
  function ev(s, cancel) {
    var t = slotMs(s.date, +s.h);
    L.push('BEGIN:VEVENT', 'UID:' + m.code + '-' + s.date + '-' + pad2(+s.h) + '@booking.b0dy.studio', 'DTSTAMP:' + stamp, 'SEQUENCE:' + m.ver,
      'DTSTART:' + icsDate(t), 'DTEND:' + icsDate(t + HR), 'SUMMARY:' + icsEsc('B0DY · Buổi tập với coach ' + me.coach), 'LOCATION:B0DY Studio',
      'DESCRIPTION:' + icsEsc('Phiếu ' + code.lbl + '. Đổi lịch trước 24 giờ tại booking.b0dy.studio'), 'URL:https://booking.b0dy.studio/', 'STATUS:' + (cancel ? 'CANCELLED' : 'CONFIRMED'));
    if (!cancel) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('B0DY · Buổi tập lúc ' + hm(+s.h)), 'TRIGGER:-PT2H', 'END:VALARM');
    L.push('END:VEVENT');
  }
  var cur = {};
  m.sessions.forEach(function (s) { cur[s.date + '|' + s.h] = 1; if (s.st === 'on') ev(s, false); });
  (m.moves || []).forEach(function (x) { if (!cur[x.from.date + '|' + (+x.from.h)] && slotMs(x.from.date, +x.from.h) > now()) ev(x.from, true); });
  L.push('END:VCALENDAR');
  downloadBlob(new Blob([icsText(L)], { type: 'text/calendar;charset=utf-8' }), 'b0dy-lich-tuan-' + st.week.no + '-ban-' + m.ver + '.ics');
  toast('Đã tạo tệp lịch. Mở tệp để thêm vào lịch của máy.');
}
function icsRemind() {
  var w = S.st ? S.st.week : S.pub ? S.pub.week : weekCtx(now()), t = w.nextOpen;
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//B0DY Studio//Lich tap tuan//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:mo-dat-w' + w.nextNo + '-' + t + '@booking.b0dy.studio', 'DTSTAMP:' + icsDate(now()), 'DTSTART:' + icsDate(t), 'DTEND:' + icsDate(t + 15 * 60e3),
    'SUMMARY:' + icsEsc('B0DY · Mở đặt lịch tuần ' + w.nextNo), 'DESCRIPTION:' + icsEsc('Đặt lịch tập tuần ' + w.nextNo + ' tại booking.b0dy.studio'), 'URL:https://booking.b0dy.studio/',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('B0DY · Mở đặt lịch tuần ' + w.nextNo), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  downloadBlob(new Blob([icsText(L)], { type: 'text/calendar;charset=utf-8' }), 'b0dy-mo-dat-tuan-' + w.nextNo + '.ics');
  toast('Đã tạo lời nhắc. Mở tệp để thêm vào lịch của máy.');
}

/* ---------- Lưu về máy (ảnh PNG của phiếu) ----------
   Ảnh = đúng vé đang hiện (desktop: vé ngang #tkW · mobile: vé dọc #tkT), dáng phẳng như vé DOM lúc đứng yên: TK3D.snapshot() (tk3d.js)
   đo bố cục vé DOM rồi vẽ lại bằng canvas 2D — chữ, ô Acid, mã vạch, chữ B0DY, mép răng cưa, khía, lỗ kim, góc nghiêng, hai lớp bóng đổ —
   không cần WebGL. Không có tk3d.js / chụp lỗi → drawTicket() bên dưới (bố cục phiếu mobile vẽ tay — chỉ còn là dự phòng). */
var WMP = null;
function wmPaths() {
  if (WMP) return WMP;
  WMP = $$('#wordmark path').map(function (p) { return new Path2D(p.getAttribute('d')); });
  return WMP;
}
function drawTicket() {
  var st = S.st, me = st.me, w = st.week, ss = tkSessions(), by = {}, code = tkCode(), K = 3, M = 28, W = 361, Hm = 300, Hs = 180, Wc = W + M * 2, Hc = Hm + Hs + M * 2;
  ss.forEach(function (s) { by[s.date] = s; });
  var cv = document.createElement('canvas'); cv.width = Wc * K; cv.height = Hc * K;
  var c = cv.getContext('2d'); c.scale(K, K);
  c.fillStyle = '#FAFAFA'; c.fillRect(0, 0, Wc, Hc);
  /* giấy + bóng */
  var pa = new Path2D(), x0 = M, y0 = M, x1 = M + W, y1 = M + Hm + Hs, Y = M + Hm;
  pa.moveTo(x0, y0 + 4);
  var i, n = Math.round(W / 4);
  for (i = 1; i <= n; i++) pa.lineTo(x0 + W * i / n, y0 + (i < n && i % 2 ? 0.5 : 4));
  pa.lineTo(x1, y1 - 4);
  for (i = 1; i <= n; i++) pa.lineTo(x1 - W * i / n, y1 - (i < n && i % 2 ? 0.5 : 4));
  pa.closePath();
  c.save(); c.shadowColor = 'rgba(10,10,10,.10)'; c.shadowBlur = 22; c.shadowOffsetY = 12; c.fillStyle = '#FAFAFA'; c.fill(pa); c.restore();
  c.save(); c.shadowColor = 'rgba(10,10,10,.08)'; c.shadowBlur = 2; c.shadowOffsetY = 1; c.fillStyle = '#FAFAFA'; c.fill(pa); c.restore();
  c.fillStyle = '#FAFAFA'; c.fill(pa);
  /* khuyết + lỗ đục */
  c.save(); c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(x0, Y, 11, 0, Math.PI * 2); c.arc(x1, Y, 11, 0, Math.PI * 2); c.fill();
  for (var px = x0 + 24; px <= x1 - 24; px += 9) { c.beginPath(); c.arc(px, Y, 2, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#FAFAFA'; c.fillRect(0, 0, Wc, Hc); c.restore();
  /* nền ảnh cùng màu giấy → khuyết + lỗ đục sẽ biến mất; tô nhẹ phần bị đục (như bóng giấy lọt qua lỗ trên màn) */
  c.save(); c.clip(pa); c.fillStyle = 'rgba(10,10,10,.09)';
  c.beginPath(); c.arc(x0, Y, 11, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x1, Y, 11, 0, Math.PI * 2); c.fill();
  for (var qx = x0 + 24; qx <= x1 - 24; qx += 9) { c.beginPath(); c.arc(qx, Y, 2, 0, Math.PI * 2); c.fill(); }
  c.restore();
  var SW = '500 {s}px "SVN-Switzer", -apple-system, sans-serif', MO = '500 {s}px "JetBrains Mono", ui-monospace, monospace';
  function font(f, s) { c.font = f.replace('{s}', s); }
  function txt(t, x, y, f, s, col, ls, al) {
    font(f, s); c.fillStyle = col || '#0A0A0A'; c.textBaseline = 'alphabetic'; c.textAlign = al || 'left';
    if ('letterSpacing' in c) { c.letterSpacing = (ls || 0) + 'px'; c.fillText(t, x, y); c.letterSpacing = '0px'; return; }
    if (!ls) { c.fillText(t, x, y); return; }
    var xx = al === 'right' ? x - (c.measureText(t).width + ls * (t.length - 1)) : al === 'center' ? x - (c.measureText(t).width + ls * (t.length - 1)) / 2 : x;
    c.textAlign = 'left';
    for (var k = 0; k < t.length; k++) { c.fillText(t[k], xx, y); xx += c.measureText(t[k]).width + ls; }
  }
  var L = x0 + 20, R = x1 - 20, top = y0 + 26;
  /* đầu phiếu */
  c.save(); c.translate(L, top); c.scale(50 / 359, 16 / 115); c.fillStyle = '#0A0A0A'; wmPaths().forEach(function (p) { c.fill(p, 'evenodd'); }); c.restore();
  txt('PHIẾU TẬP', R, top + 10, MO, 10, '#0A0A0A', 0.8, 'right');
  txt(tkWeekLbl().toUpperCase(), R, top + 25, MO, 10, '#737373', 0.8, 'right');
  /* số buổi */
  txt(String(ss.length), L - 1, top + 108, SW, 80, '#0A0A0A', -3.2);
  font(SW, 80); var nw = c.measureText(String(ss.length)).width;
  txt('BUỔI', L + nw + 6, top + 100, MO, 20, '#0A0A0A', 0);
  /* hàng tuần */
  var ry = top + 136, cw = (W - 40 - 6 * 4) / 7;
  w.days.concat([addD(w.days[0], 6)]).forEach(function (d, k) {
    var cx = L + k * (cw + 4), off = k === 6, s = by[d];
    txt(DOW[dowOf(d)], cx + cw / 2, ry + 9, MO, 9, off ? '#B0B0B0' : '#4A4A4A', 0.5, 'center');
    txt(d.slice(8), cx + cw / 2, ry + 25, MO, 11, off ? '#B0B0B0' : '#0A0A0A', 0, 'center');
    var by0 = ry + 32;
    c.beginPath(); if (c.roundRect) c.roundRect(cx, by0, cw, 28, 2); else c.rect(cx, by0, cw, 28);
    if (off) { c.fillStyle = '#EFEFEF'; c.fill(); }
    else if (s) { c.fillStyle = s.st === 'on' ? '#B1EA00' : '#F2F2F2'; c.fill(); txt(hm(s.h), cx + cw / 2, by0 + 18, MO, 9, s.st === 'on' ? '#0A0A0A' : '#737373', 0.5, 'center'); }
    else { c.fillStyle = '#FAFAFA'; c.fill(); c.strokeStyle = 'rgba(10,10,10,.10)'; c.lineWidth = 1; c.stroke(); }
  });
  /* coach · hội viên · gói */
  var iy = ry + 78;
  [['COACH', me.coach], ['HỘI VIÊN', me.short], ['GÓI', (me.pkg ? me.pkg + ' · ' : '') + me.kind]].reduce(function (x, kv) {
    txt(kv[0], x, iy + 9, MO, 9, '#737373', 0.5); txt(kv[1], x, iy + 28, SW, 16, '#0A0A0A', -0.16);
    font(SW, 16); return x + Math.max(c.measureText(kv[1]).width, 60) + 20;
  }, L);
  /* cuống */
  var sy = Y + 20;
  txt('LƯỢT ĐỔI CÒN', L + 1, sy + 9, MO, 9, '#737373', 0.5);
  txt(String(st.mine.changesLeft), L, sy + 50, MO, 44, '#0A0A0A', -1.3);
  txt('BÁO TRƯỚC KHI ĐỔI', L + 104, sy + 9, MO, 9, '#737373', 0.5);
  txt('24H', L + 104, sy + 38, MO, 24, '#0A0A0A', -0.7);
  var bc = code128B(code.bar), bw = R - L, unit = bw / bc.width, by1 = sy + 71;
  c.fillStyle = '#0A0A0A'; bc.bars.forEach(function (b) { c.fillRect(L + b[0] * unit, by1, b[1] * unit, 40); });
  txt(code.lbl.toUpperCase(), L, by1 + 54, MO, 9, '#4A4A4A', 0.5);
  return cv;
}
/* khoá ảnh = loại vé đang hiện (desktop / mobile) + cỡ vé + mọi dữ liệu in trên vé → đổi cỡ màn / đổi lịch / "· MỚI" → vẽ lại.
   PNGC.p: lượt vẽ đang chạy (chuẩn bị sẵn lúc rảnh) — bấm lưu giữa chừng thì chờ chung, không vẽ hai lần. */
var PNGC = { key: '', blob: null, pk: '', p: null };
function pngKey() {
  var st = S.st, m = st.mine, me = st.me, tk = tkCur();
  return [desk() ? 'd' : 'm', tk ? tk.offsetWidth + 'x' + tk.offsetHeight : '-', m.code, m.ver, m.changesLeft, tkWeekLbl(), me.coach, me.short, me.pkg, me.kind,
    tkSessions().map(function (s) { return s.date + s.h + s.st + (s.fresh ? '*' : ''); }).join(',')].join('|');
}
/* vé đang hiện → canvas (TK3D.snapshot); không được (thiếu tk3d.js, vé chưa sẵn sàng, lỗi) → bản vẽ tay cũ */
function ticketCanvas() {
  var T = window.TK3D, tk = tkCur(), cv = null;
  if (T && T.snapshot && tk) { try { cv = T.snapshot(tk); } catch (e) { cv = null; } }
  return cv || drawTicket();
}
function makePng() {
  var key = pngKey();
  if (PNGC.key === key && PNGC.blob) return Promise.resolve(PNGC.blob);
  if (PNGC.pk === key && PNGC.p) return PNGC.p;
  /* chờ đủ hai phông (canvas vẽ chữ bằng phông đã nạp; vé DOM cũng dàn lại theo phông thật) */
  var fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('500 16px "SVN-Switzer"'), document.fonts.load('500 16px "JetBrains Mono"')])
    .then(function () { return document.fonts.ready; }).catch(function () {}) : Promise.resolve();
  var p = fonts.then(function () {
    var k = pngKey(), cv = ticketCanvas();   /* khoá theo đúng lúc vẽ (dữ liệu / cỡ vé có thể đã đổi trong lúc chờ phông) */
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) { cv.width = cv.height = 0; if (b) { PNGC.key = k; PNGC.blob = b; res(b); } else rej(new Error('png')); }, 'image/png');
    });
  });
  PNGC.pk = key; PNGC.p = p;
  function done() { if (PNGC.p === p) { PNGC.p = null; PNGC.pk = ''; } }
  p.then(done, done);
  return p;
}
function savePng() {
  var name = 'b0dy-phieu-tuan-' + S.st.week.no + '-ban-' + S.st.mine.ver + '.png';
  var ready = PNGC.key === pngKey() && PNGC.blob;
  function deliver(blob) {
    var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && !desk() && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Phiếu tập B0DY' }).catch(function (e) { if (!e || e.name !== 'AbortError') downloadBlob(blob, name); });
    } else { downloadBlob(blob, name); toast('Đã lưu ảnh phiếu.'); }
  }
  if (ready) { deliver(PNGC.blob); return; }
  makePng().then(deliver, function () { toast('Chưa tạo được ảnh. Thử lại sau.'); });
}

/* ============================== NGĂN KÉO (desktop) · CỬA SỔ CHI TIẾT (mobile) ============================== */
var LASTF = null;
function infoHTML(isSheet) {
  var st = S.st, me = st ? st.me : null, idT = isSheet ? 'sheetT' : 'drawerT';
  var rows = me ? [['Coach', me.coach], ['Gói', (me.pkg ? me.pkg + ' · ' : '') + me.kind], ['Còn lại', me.left + ' buổi'], ['Hết hạn', me.exp ? yy(me.exp) : '—']] : [];
  return (isSheet ? '<div class="sh-grip" data-a="closesheet"><i></i></div>' : '') +
    '<div class="' + (isSheet ? 'sh-h' : 'dr-h') + '"><h2 id="' + idT + '">Gói & luật đặt lịch</h2><button class="ib' + (isSheet ? ' ib-32' : '') + '" type="button" data-a="' + (isSheet ? 'closesheet' : 'closedrawer') + '" aria-label="Đóng">' + ico('close') + '</button></div>' +
    (me ? '<div class="dr-sec"><span class="k">Gói của bạn</span><div class="dr-rows">' + rows.map(function (r) { return '<div class="dr-row"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>'; }).join('') + '</div></div>' : '') +
    (isSheet ? '' : '<div class="dr-fill"></div>') +
    '<div class="dr-sec"><span class="k">Luật đặt lịch</span>' + RULES.map(function (r, i) { return '<div class="rule"><span class="no">' + pad2(i + 1) + '</span><p>' + esc(r) + '</p></div>'; }).join('') + '</div>';
}
function scrimOn(on) {
  var s = $('#scrim');
  if (on) { s.hidden = false; void s.offsetWidth; s.classList.add('on'); }
  else { s.classList.remove('on'); setTimeout(function () { if (!s.classList.contains('on')) s.hidden = true; }, 330); }
}
/* ngăn kéo / cửa sổ đang mở: trang phía sau inert (Tab không ra khỏi cửa sổ, trình đọc màn hình không đọc trang sau) */
function appInert() {
  var sh = $('#sheet'), d = $('#drawer');
  $('#app').inert = !!((!sh.hidden && sh.classList.contains('on')) || (!d.hidden && d.classList.contains('on')));
}
function openDrawer() {
  if (!desk()) { openSheet({ info: true }); return; }
  var d = $('#drawer'); LASTF = document.activeElement;
  d.innerHTML = infoHTML(false); d.hidden = false; d.classList.remove('out'); void d.offsetWidth; d.classList.add('on'); scrimOn(true); appInert();
  setTimeout(function () { var b = d.querySelector('[data-a="closedrawer"]'); if (b) b.focus(); }, 40);
}
function closeDrawer(instant) {
  var d = $('#drawer'); if (d.hidden) return;
  d.classList.add('out'); d.classList.remove('on'); scrimOn(false); appInert();
  setTimeout(function () { if (!d.classList.contains('on')) { d.hidden = true; d.classList.remove('out'); } }, instant ? 0 : 260);
  if (LASTF && LASTF.focus && !instant) try { LASTF.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ }
}
function sheetHTML(n) {
  if (n.info) return infoHTML(true);
  var sx = n.sheet || { title: n.title, body: n.body };
  /* nút chữ cuối cửa sổ: lời hẹn riêng (E04) · "Đóng" khi đang chờ gửi lại · còn lại dẫn sang Gói & luật (dòng gói trên màn bị thông báo thay chỗ) */
  var tail = sx.later ? '<button class="btn btn-chu cm" type="button" data-a="closesheet"><span class="bt">' + esc(sx.later) + '</span></button>'
    : n.resend ? '<button class="btn btn-chu cm" type="button" data-a="closesheet"><span class="bt">Đóng</span></button>'
    : '<button class="btn btn-chu cm" type="button" data-a="info">' + ico('info') + '<span class="bt">Gói & luật đặt lịch</span></button>';
  return '<div class="sh-grip" data-a="closesheet"><i></i></div><div class="sh-h"><h2 id="sheetT">' + esc(sx.title) + '</h2><button class="ib ib-32" type="button" data-a="closesheet" aria-label="Đóng">' + ico('close') + '</button></div>' +
    (sx.body ? '<p class="sh-b">' + esc(sx.body) + '</p>' : '') +
    (n.sugs && n.sugs.length ? '<div class="sh-act"><span class="lbl">' + esc(sx.label || '') + '</span><div class="row">' + n.sugs.map(function (s) { return '<button class="btn btn-m btn-phu" type="button" data-a="sug" data-d="' + esc(s.date) + '" data-h="' + esc(s.h) + '">' + esc(hm(s.h)) + '</button>'; }).join('') + '</div></div>' : '') +
    (n.resend ? '<button class="btn btn-m btn-chinh" type="button" data-a="resend"><span>Gửi lại</span>' + ico('right') + '</button>' : '') +
    '<div>' + tail + '</div>';
}
function sheetFocus(sh) { var b = sh.querySelector('.sh-h [data-a="closesheet"]'); if (b) try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
function openSheet(n) {
  var sh = $('#sheet'), open = !sh.hidden && sh.classList.contains('on');
  S.sheetN = n;
  if (open) {   /* đang mở: đổi nội dung tại chỗ (mờ chéo), giữ màn che */
    fadeSwap(sh, function () { sh.innerHTML = sheetHTML(n); sheetFocus(sh); }, 'sheet');
    return;
  }
  LASTF = document.activeElement;
  sh.innerHTML = sheetHTML(n);
  sh.hidden = false; sh.classList.remove('out', 'drag'); sh.style.transform = ''; void sh.offsetWidth; sh.classList.add('on'); scrimOn(true); appInert();
  setTimeout(function () { sheetFocus(sh); }, 40);
}
function closeSheet(instant) {
  var sh = $('#sheet'); if (sh.hidden) return;
  S.sheetN = null;
  sh.classList.add('out'); sh.classList.remove('on'); sh.style.transform = ''; scrimOn(false); appInert();
  setTimeout(function () { if (!sh.classList.contains('on')) { sh.hidden = true; sh.classList.remove('out'); } }, instant ? 0 : 260);
  if (LASTF && LASTF.focus && !instant && document.contains(LASTF)) try { LASTF.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ }
}
/* kéo cửa sổ xuống để đóng */
(function () {
  var sh = $('#sheet'), y0 = 0, dy = 0, t0 = 0, drag = false;
  sh.addEventListener('pointerdown', function (e) { if (sh.scrollTop > 0 || e.target.closest('button:not(.sh-grip)')) return; y0 = e.clientY; dy = 0; t0 = performance.now(); drag = true; });
  sh.addEventListener('pointermove', function (e) { if (!drag) return; dy = Math.max(0, e.clientY - y0); if (dy > 4) { sh.classList.add('drag'); sh.style.transform = 'translateY(' + dy + 'px)'; } });
  function end() { if (!drag) return; drag = false; sh.classList.remove('drag'); var v = dy / Math.max(1, performance.now() - t0); if (dy > 90 || v > .6) closeSheet(); else sh.style.transform = ''; }
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
})();

/* ============================== TOAST ============================== */
var TOASTT = 0;
function toast(msg) {
  var t = $('#toast');
  /* chỉ #live đọc to (toast không mang role=status nữa → không đọc hai lần) */
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('aria-hidden', 'true'); document.body.appendChild(t); }
  t.innerHTML = ico('info') + '<span>' + esc(msg) + '</span>';
  t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  announce(msg);
  clearTimeout(TOASTT); TOASTT = setTimeout(function () { t.classList.remove('on'); }, 3200);
}

/* ============================== HÀNH ĐỘNG ============================== */
function signedOut(why) {
  bumpGen();                                       /* mọi phản hồi đang bay của phiên này đều bỏ (không hiện lại phiếu người trước) */
  TOK.clear(); S.st = null; S.picks = []; S.gone = []; S.notice = null; S.pending = null; savePend(); S.addMode = false;
  S.chg = { from: null, to: null }; S.moved = null; S.sending = false; unSending();
  S.who = null; S.pin = ''; S.q = ''; S.results = []; S.qState = 'idle';
  if (why === 'het_goi') toast('Gói của bạn đã hết hoặc chưa kích hoạt.');
  else if (why === 'het_phien') toast('Phiên đã hết hạn. Xác minh lại để tiếp tục.');
  var w = S.pub ? S.pub.week : weekCtx(now());
  go(w.phase === 'before' || (S.pub && S.pub.open === false) ? 'closed' : 'find', 'back');
}
var ACT = {
  notyou: function () { signedOut(''); },
  info: openDrawer, closedrawer: function () { closeDrawer(); }, closesheet: function () { closeSheet(); },
  note: function () { var n = S.view === 'change' ? currentChgNotice() : noticeForErr(bookNotice() || {}); if (n && n.title) openSheet(n); },
  clearq: function () { S.q = ''; var i = $('#q'); if (i) { i.value = ''; i.focus(); } onQuery(); },
  pick: function (b) { choose(+b.dataset.i); },
  notme: function () { S.pin = ''; S.pinErr = ''; go('find', 'back'); },
  verify: verify,
  /* nút chốt luôn đi qua submit…: lựa chọn trên màn đúng y lệnh chờ → gửi lại cùng mã; khác → lệnh mới (mang lệnh cũ theo) */
  book: function () { submitBook(); },
  resend: function () { closeSheet(); if (S.view === 'change') submitChange(); else submitBook(); },
  unpick: function (b) {
    if (S.sending) return;                         /* đang gửi: không sửa lựa chọn (lệnh đang bay là lựa chọn cũ) */
    var d = b.dataset.d; S.picks = S.picks.filter(function (p) { return p.date !== d; });
    if (S.notice && noticeForErr(S.notice).resend) S.notice = null;
    updateBook();
  },
  addhint: function (b) {
    if (S.view === 'change') return;
    b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
    var free = $$('#wkb .c.free:not([aria-disabled])')[0]; if (free) { $$('#wkb .c').forEach(function (c) { c.tabIndex = -1; }); free.tabIndex = 0; free.focus(); }
  },
  sug: function (b) { if (S.sending) return; pickSug(b.dataset.d, +b.dataset.h); },
  chgo: function () { submitChange(); },
  unto: function () { if (S.sending) return; S.chg.to = null; if (S.notice) S.notice = null; updateChange(); },
  png: savePng, ics: icsTicket, remind: icsRemind,
  tkdone: function () { S.moved = null; bobMood('observe'); go('ticket', 'fwd', { variant: 'home', morph: true }); },
  goadd: function () { S.addMode = true; S.picks = []; S.gone = []; S.notice = null; go('book', 'fwd', { push: true }); },
  gochg: function () { S.chg = { from: null, to: null }; S.notice = null; go('change', 'fwd', { push: true }); },
  'back-ticket': function () { if (S.sending) return; if (S.view === 'change' || (S.view === 'book' && S.addMode)) leaveToTicket(); },
  retry: function () { refresh(); }
};
function currentChgNotice() {
  if (S.notice) return noticeForErr(S.notice);
  var no = S.st.mine.changesLeft <= 0, up = upcoming();
  return no ? { tone: 'warn', title: 'Hết lượt đổi tuần này.', body: (up.length === 1 ? 'Buổi ' + dFull(up[0].date).split(' ').slice(0, 2).join(' ') + ' ' + hm(up[0].h) + ' vẫn giữ.' : 'Các buổi còn lại vẫn giữ.') + ' Không đến vẫn tính 1 buổi.' }
    : { tone: 'warn', title: 'Không còn buổi nào đổi được.', body: 'Đổi lịch phải trước buổi tập 24 giờ. Các buổi còn lại vẫn giữ.' };
}
document.addEventListener('click', function (e) {
  var c = e.target.closest && e.target.closest('#wkb .c');
  if (c) { if (S.view === 'book') onBookCell(c); else if (S.view === 'change') onChgCell(c); return; }
  var t = e.target.closest && e.target.closest('[data-a]');
  if (!t || t.disabled) return;
  var f = ACT[t.dataset.a]; if (f) { e.preventDefault(); f(t, e); }
});
/* cửa sổ (aria-modal) đang mở: Tab / Shift+Tab xoay vòng trong cửa sổ, không ra trang sau */
function openModal() {
  var sh = $('#sheet'), d = $('#drawer');
  return !sh.hidden && sh.classList.contains('on') ? sh : !d.hidden && d.classList.contains('on') ? d : null;
}
function trapTab(e, m) {
  var f = $$('button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])', m).filter(function (x) { return x.offsetParent !== null; });
  if (!f.length) { e.preventDefault(); return; }
  var a = document.activeElement, first = f[0], last = f[f.length - 1];
  if (e.shiftKey ? (a === first || !m.contains(a)) : (a === last || !m.contains(a))) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Tab') { var md = openModal(); if (md) { trapTab(e, md); return; } }
  if (e.key === 'Escape') {
    if (!$('#sheet').hidden) { closeSheet(); return; }
    if (!$('#drawer').hidden) { closeDrawer(); return; }
    if (S.view === 'change' || (S.view === 'book' && S.addMode)) { ACT['back-ticket'](); return; }
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('step') && e.target.dataset.a) { e.preventDefault(); ACT[e.target.dataset.a](); return; }
  gridKey(e);
});
$('#scrim').addEventListener('click', function () { closeSheet(); closeDrawer(); });

/* ============================== LÀM MỚI · KHỞI ĐỘNG ============================== */
function applyPublic(r) {
  S.pub = r;
  var closed = r.week.phase === 'before' || r.open === false;
  if (closed) { if (S.view !== 'closed') go('closed', 'fwd'); else headerFor(); return; }
  if (S.view === 'loading' || S.view === 'closed' || S.view === 'fail') go('find', 'fwd');
  else headerFor();
}
function applyAuthed(r, quiet) {
  var prevView = S.view, prevMode = S.st && S.st.mode, prevWeek = S.st && S.st.week.key;
  S.st = cleanSt(r); saveSt();
  var st = S.st;
  if (prevWeek && prevWeek !== st.week.key) { S.picks = []; S.gone = []; S.notice = null; S.pending = null; savePend(); routeAuthed('fwd'); return; }
  /* lệnh chờ của lần gửi trước (mất phản hồi) — hoặc lệnh trước nó mà khách đã sửa lựa chọn — đã nằm trong sổ → xong */
  var lp = !S.sending && landedOf(S.pending, st);
  if (lp) { landPending(lp); return; }
  if (prevView === 'loading' || prevView === 'fail' || prevView === 'find' || prevView === 'verify') { routeAuthed('fwd'); return; }
  if (st.week.phase === 'before') { if (prevView !== 'closed') go('closed', 'fwd'); return; }
  if (prevView === 'book') {
    if (st.mode === 'book' && !S.addMode) { dropInvalid(); updateBook(); return; }
    if (S.addMode && st.mode === 'ticket') { dropInvalid(); if (st.limits.add > 0) { updateBook(); return; } S.addMode = false; go('ticket', 'fwd', { variant: 'home' }); return; }
    if (st.mode === 'ticket') { S.picks = []; toast('Bạn đã có lịch tuần này.'); go('ticket', 'fwd', { variant: 'home' }); return; }
    go('closed', 'fwd'); return;
  }
  if (prevView === 'change') { if (st.mode === 'ticket') { updateChange(); return; } routeAuthed('fwd'); return; }
  if (prevView === 'ticket') {
    if (st.mode !== 'ticket') { routeAuthed('fwd'); return; }
    if (!quiet) go('ticket', 'fwd', { variant: S.tkVariant, instant: true });
    else { var v = S.tkVariant; var html = S.page && S.page.querySelector('#tkfit'); if (html) { go('ticket', 'fwd', { variant: v, instant: true, noFocus: true }); } }
    return;
  }
  if (prevView === 'closed') { if (st.mode === 'book' || st.mode === 'ticket') routeAuthed('fwd'); else headerFor(); return; }
  routeAuthed('fwd');
}
function dropInvalid() {
  var lead = leadBook(), gone = [];
  S.picks = S.picks.filter(function (p) {
    var w = why(p.date, p.h, lead);
    if (w === 'day') { gone.push({ date: p.date, h: p.h }); return false; }
    return !w && (!S.addMode || !sessOn(p.date));
  });
  if (gone.length) onFull(gone);
}
function refresh(quiet) {
  /* đang có một lượt hỏi: nhớ lại để hỏi thêm MỘT lần ngay sau đó (lượt đang bay có thể đã cũ — vd lúc 06:00 CN) */
  if (S.refreshing) { S.refreshAgain = S.refreshAgain === 'loud' || !quiet ? 'loud' : 'quiet'; return; }
  S.refreshing = true;
  var tok = TOK.get(), g = S.gen;
  function done() {
    S.refreshing = false;
    if (S.refreshAgain) { var q = S.refreshAgain !== 'loud'; S.refreshAgain = false; setTimeout(function () { refresh(q); }, 0); }
  }
  return call('lt_boot', tok ? { tok: tok } : {}).then(function (r) {
    done();
    /* trong lúc chờ đã đăng xuất / xác minh / gửi lệnh ghi → phản hồi này đã cũ: bỏ, không đè state mới hơn */
    if (g !== S.gen || tok !== TOK.get()) { if (S.view === 'loading') setTimeout(function () { refresh(true); }, 0); return; }
    S.lastFetch = Date.now(); S.net = false;
    if (!r || !r.ok) { if (S.view === 'loading') go('fail'); return; }
    if (r.auth) { applyAuthed(r, quiet); return; }
    if (tok || S.st) {
      var keepWho = r.why === 'het_phien' || r.why === 'het_goi';
      bumpGen(); TOK.clear(); S.st = null; S.picks = []; S.addMode = false; S.pending = null; S.notice = null;
      if (keepWho) toast(r.why === 'het_goi' ? 'Gói của bạn đã hết hoặc chưa kích hoạt.' : 'Phiên đã hết hạn. Xác minh lại để tiếp tục.');
      S.pub = r;
      go(r.week.phase === 'before' || r.open === false ? 'closed' : 'find', 'back');
      return;
    }
    applyPublic(r);
  }, function () {
    done();
    if (g !== S.gen) return;
    if (S.view === 'loading') { go('fail'); return; }
    S.net = true; headerFor();   /* đang xem bản lưu trên máy: header báo Mất kết nối cho tới lần làm mới kế tiếp thành công */
  });
}
function boot() {
  S.dev = devId();
  SKEW = +LS.get('lt_skew') || 0;
  if (!QC && Math.abs(SKEW) > 7 * DAY) SKEW = 0;      /* QC: đồng hồ giả có thể lệch giờ thật bao nhiêu cũng được */
  var hd = $('#hd'); var b = document.createElement('i'); b.className = 'busy'; b.id = 'busy'; hd.appendChild(b);
  bobInit();
  bobBridge();
  clockTick();
  history.replaceState && history.replaceState({ v: 'root' }, '');
  var tok = TOK.get(), cached = tok ? loadSt() : null, ctx = weekCtx(now());
  if (tok && cached && cached.week.key === ctx.key && cached.week.phase === ctx.phase) { S.st = cached; routeAuthed('fwd', { instant: true }); }
  else if (!tok) {
    if (ctx.phase === 'before' || !anyOpen(ctx, now())) go('closed', 'fwd', { instant: true });
    else go('find', 'fwd', { instant: true, noFocus: !desk() });
  } else go('loading', 'fwd', { instant: true });
  refresh(true);
  /* làm mới khi quay lại trang · mỗi 2 phút khi đang mở bảng */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    clockTick();
    if (Date.now() - S.lastFetch > 45000 && !S.sending) refresh(true);
  });
  setInterval(function () {
    if (document.visibilityState !== 'visible' || S.sending) return;
    if ((S.view === 'book' || S.view === 'change' || S.view === 'ticket') && Date.now() - S.lastFetch > 110000) refresh(true);
    if (S.view === 'book') updateBook(); else if (S.view === 'change') updateChange();
  }, 30000);
  window.addEventListener('resize', function () { tkFit(); nowLine(); if (S.view === 'ticket') tkPaper(); mbarSize(); });
  if (window.ResizeObserver) new ResizeObserver(mbarSize).observe($('#mbar'));
  MQ_DESK.addEventListener && MQ_DESK.addEventListener('change', function () { if (S.view === 'ticket') { tkFit(); tkPaper(); } bobSlot(S.page); });
  /* chuẩn bị sẵn ảnh phiếu khi rảnh để nút "Lưu về máy" mở bảng chia sẻ ngay trong cú chạm.
     Không chen vào lúc vé còn đang vào màn / giấy 3D đang thả lỏng (vẽ ảnh 3× tốn vài chục ms) → để nhịp 4 s sau */
  setInterval(function () {
    var el = S.view === 'ticket' && S.st ? tkCur() : null;
    if (el && !TWS.length && !tkMoving(el) && !TILT.raf && !TILT.drag && PNGC.key !== pngKey()) makePng().catch(function () {});
  }, 4000);
}
window.__lt = { S: S, ver: VER, code128B: code128B, why: function (d, h, l) { return why(d, h, l); }, weekCtx: weekCtx, tilt: TILT, tiltKick: function () { tiltKick(); } };
/* QC: nạp máy chủ giả (qc.js — module) + bảng QC rồi mới khởi động; đặt đồng hồ trang theo đồng hồ giả trước khi vẽ màn đầu.
   Không nạp được thì báo lỗi, KHÔNG bao giờ lui về máy chủ thật. */
function qcStart() {
  var done = false;
  function fail() {
    if (done) return; done = true;
    $('#main').innerHTML = '<div class="ctr st"><div class="col"><div class="ttl"><h1 class="h56">Không mở được chế độ QC.</h1><p class="b16">Tải lại trang để thử lại.</p></div></div></div>';
  }
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'qc.css?v=' + VER; document.head.appendChild(css);
  var s = document.createElement('script'); s.type = 'module'; s.src = 'qc.js?v=' + VER;
  s.onerror = fail;
  s.onload = function () {
    var q = window.QCB;
    if (!q || !q.ready) { fail(); return; }
    q.ready.then(function (r) { if (done) return; done = true; LS.set('lt_skew', String(Math.round(r.skew))); boot(); }, fail);
  };
  document.head.appendChild(s);
}
if (QC) qcStart(); else boot();
/* mở lại trang tức thì: service worker giữ sẵn tệp tĩnh (sw.js) — đăng ký sau khi trang đã tải xong, không tranh băng thông */
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  function reg() { try { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { /* không có cũng chạy bình thường */ }); } catch (e) { /* bỏ qua */ } }
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
})();
})();
