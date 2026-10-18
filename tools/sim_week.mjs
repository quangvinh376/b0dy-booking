/* Mô phỏng cả phòng đặt lịch tuần tới từ lịch tập THẬT của tuần trước — chạy đúng luật máy chủ (worker/src/core.js).
   Mỗi buổi "Đã tập" của tuần nguồn được đặt lại cùng thứ ở tuần đích; giờ = giờ check-in app làm tròn (≤ :39 giữ giờ,
   ≥ :40 sang giờ sau; 12 → 11, 13 → 14, sau 20 → 20); buổi CN → T7. Thứ tự đặt = thứ tự trong SESSION LOG. Khung không hợp luật
   → giờ gần nhất trong ngày (hoà → sớm hơn), hết thì ngày gần nhất. Gói 1:2 → khung ghép gần nhất, có bạn cùng coach đang chờ
   (khung đó, hoặc ±2 giờ khi khung đó bận) thì vào cặp. Số buổi theo limits (tối đa min(4, còn lại, ngày mở), tối thiểu 2 → thêm
   một buổi cùng giờ). Mỗi lượt qua checkBook; sổ cuối kiểm roomOf + stateOf. Lần chạy thật đầu tiên: 18/10/2026 (tuần 43).

   node tools/sim_week.mjs [.local/fixture_ba.json] [thư mục ra = .local/sim]
     SIM_NOW=<ms>   giờ "bây giờ" (mặc định: thật). Tuần đích = tuần đang nhận đặt lúc đó (nên chạy sau 06:00 CN).
   Fixture: python3 tools/ba_fixture.py <BA.xlsx> (DỮ LIỆU THẬT — chỉ ở .local/, đã .gitignore).
   Không in tên: dòng sổ ra để trống 3 cột tên — tools/sim_week_payload.mjs điền bằng công thức tra '_dữ liệu' theo Mã KH. */
import fs from 'node:fs';
import * as C from '../worker/src/core.js';

const LT = C.LT;
const ROOT = new URL('..', import.meta.url).pathname;
const FX = process.argv[2] || ROOT + '.local/fixture_ba.json';
const OUT = (process.argv[3] || ROOT + '.local/sim') + '/';
fs.mkdirSync(OUT, { recursive: true });
const die = m => { throw new Error(m); };
const fx = JSON.parse(fs.readFileSync(FX, 'utf8'));
/* ô fixture → giá trị như Sheets trả dạng chữ: {$d} → yyyy-mm-dd · {$t} → HH:MM */
const plain = rows => (rows || []).map(r => (r || []).map(v => v && typeof v === 'object' ? (v.$d || v.$t || '') : v));
const tab = name => plain(fx[name] || fx[Object.keys(fx).find(k => k.normalize('NFC') === name.normalize('NFC'))] || die('thieu tab ' + name));
const cfgName = Object.keys(fx).find(k => C.isCfgTab(k));

const NOW = Number(process.env.SIM_NOW || Date.now());
const ctx = C.weekCtx(NOW);
if (ctx.lead) console.warn('⚠ tuần đích đã bắt đầu (luật 24 giờ) — nên chạy với SIM_NOW sau 06:00 CN trước tuần đích');
const TODAY = ctx.today, SRC_MON = C.addDays(ctx.mon, -7), SRC_SUN = C.addDays(ctx.mon, -1);

/* ---------- hội viên: đúng memberRows → persons(today) của máy chủ ---------- */
const MV = tab('MEMBERS');
const list = C.persons(C.memberRows(MV), TODAY);
const byKey = new Map(list.map(p => [p.key, p]));
/* '#' (Mã HV ở SESSION LOG) → Mã KH */
const mh = C.headRow(MV.slice(0, 12), ['#', 'ma kh']) || die('MEMBERS: khong thay cot # / Ma KH');
const cNum = mh.h.indexOf('#'), cKh = mh.h.indexOf('ma kh');
const numToKey = new Map();
for (let r = mh.r + 1; r < MV.length; r++) { const n = String(MV[r][cNum] || '').trim(), k = String(MV[r][cKh] || '').trim(); if (n && k) numToKey.set(n, k); }

/* ---------- phòng tuần đích: tập thử (TRIAL), ngày nghỉ (B0B), sức chứa (⚙️ 2) ---------- */
const trials = fx.TRIAL ? C.trialsFrom(tab('TRIAL'), ctx.days) : {};
const closed = fx.B0B ? C.closuresFrom(tab('B0B')) : {};
const cap = cfgName ? C.capFrom(plain(fx[cfgName])) : LT.CAP;

/* ---------- buổi "Đã tập" của tuần nguồn (T2–CN) ---------- */
const SV = tab('SESSION LOG');
const sh = C.headRow(SV.slice(0, 10), ['ngay', 'ma hv', 'trang thai']) || die('SESSION LOG: khong thay tieu de');
const col = k => sh.h.indexOf(k), cD = col('ngay'), cHV = col('ma hv'), cSt = col('trang thai'), cLoai = col('loai'), cCo = col('coach');
const cSig = sh.h.findIndex(x => x.indexOf('ky dien tu') >= 0);
const S42 = [];
for (let r = sh.r + 1; r < SV.length; r++) {
  const x = SV[r], date = C.cellIso(x[cD], true);
  if (!date || date < SRC_MON || date > SRC_SUN) continue;
  const m = String(x[cSig] || '').match(/app (\d{1,2}:\d{2})/);
  if (!m) { console.warn('⚠ bỏ buổi không có giờ check-in app (hàng ' + (r + 1) + ')'); continue; }
  S42.push({ date: date, num: String(x[cHV] || '').trim(), kind: String(x[cLoai] || '').trim(), coach: String(x[cCo] || '').trim(),
             hm: m[1].padStart(5, '0'), st: String(x[cSt] || '').trim().normalize('NFC') });
}
if (!S42.length) die('tuần nguồn ' + SRC_MON + ' không có buổi nào');

/* ---------- giờ từ giờ check-in app ---------- */
function hour0(hm) {
  const a = hm.split(':').map(Number);
  let h = Math.floor((a[0] * 60 + a[1] + 20) / 60);          /* ≤ :39 giữ giờ · ≥ :40 sang giờ sau */
  const map = { 5: 6, 12: 11, 13: 14, 21: 20, 22: 20 };     /* 12–14 coach nghỉ trưa · khung cuối 20:00 */
  if (map[h] !== undefined) h = map[h];
  if (LT.SLOTS.indexOf(h) < 0) die('gio ' + hm);
  return h;
}
const DOWS = LT.DOW;
const hmLabel = s => DOWS[C.dowOf(s.date)] + ' ' + C.ddMm(s.date) + ' ' + s.hm;

/* ---------- mong muốn của từng người (theo thứ tự xuất hiện trong SESSION LOG tuần nguồn) ---------- */
const sess = S42.map((s, i) => Object.assign({ i: i }, s)).sort((a, b) => (a.date + a.hm).localeCompare(b.date + b.hm) || a.i - b.i);
const order = [], W = new Map(), skipped = [];
for (const s of sess) {
  if (s.st !== 'Đã tập') { skipped.push({ why: 'trang_thai', num: s.num }); continue; }
  const key = numToKey.get(s.num);
  if (!key) { skipped.push({ why: 'khong_ma', num: s.num }); continue; }
  const p = byKey.get(key);
  if (!p) { skipped.push({ why: 'het_goi', num: s.num }); continue; }
  if (!W.has(key)) { W.set(key, []); order.push(key); }
  const dow = C.dowOf(s.date), sun = dow === 0;
  const day = C.addDays(s.date, sun ? 6 : 7);               /* CN (trang không mở) → T7 */
  W.get(key).push({ day: day, h0: hour0(s.hm), src: s, sun: sun, kind42: s.kind, coach42: s.coach });
}
/* ---------- sổ mô phỏng ---------- */
const ledger = [], arrs = [], meta = [];
const envNow = () => C.envOf(ctx, ledger, trials, closed, cap);
const dayIdx = d => ctx.days.indexOf(d);
const inWin = (p, d) => (!p.start || d >= p.start) && (!p.exp || d <= p.exp);
const byDist = (hs, h0) => hs.slice().sort((a, b) => Math.abs(a - h0) - Math.abs(b - h0) || a - b);   /* hoà → giờ sớm hơn */
const free = (E, p, d, h) => C.why(ctx, p, E, d, h, ctx.lead) === '';
function pickHour(E, p, d, h0) {
  const duo = C.isDuo(p.kind), cands = byDist(duo ? LT.DUO_HOURS : LT.SLOTS, h0);
  if (!duo) { for (const h of cands) if (free(E, p, d, h)) return { h: h, how: '1:1' }; return null; }
  const best = Math.abs(cands[0] - h0), pref = cands.filter(h => Math.abs(h - h0) === best);
  const join = (h) => C.coachAt(E, p, d + '|' + h) === 'join';
  for (const h of pref) if (free(E, p, d, h) && join(h)) return { h: h, how: 'join' };
  for (const h of pref) if (free(E, p, d, h)) return { h: h, how: 'new' };
  for (const h of cands) if (Math.abs(h - h0) <= 2 && free(E, p, d, h) && join(h)) return { h: h, how: 'join' };
  for (const h of cands) if (free(E, p, d, h)) return { h: h, how: join(h) ? 'join' : 'new' };
  return null;
}

const stats = { persons: 0, rows: 0, dup: 0, sunToSat: 0, sunDropped: 0, outWin: [], capMax: [], addMin: [], otherDay: [], unplaced: [],
                kindDiff: [], coachDiff: [], firstFail: {} };
const T0 = NOW;
let seq = 0;
for (const key of order) {
  const p = byKey.get(key), E = envNow(), m = C.mine(ledger, p, ctx), lim = C.limits(ctx, p, E, m);
  if (m.sessions.length) die('da co phieu ' + key);
  /* một ngày một buổi (giữ buổi đầu) */
  const seen = new Set(), wants = [];
  for (const w of W.get(key)) {
    if (w.kind42 !== p.kind && !stats.kindDiff.includes(key)) stats.kindDiff.push(key);
    if (C.coachName(w.coach42) !== p.coach && !stats.coachDiff.includes(key)) stats.coachDiff.push(key);
    if (seen.has(w.day)) { if (w.sun) stats.sunDropped++; else stats.dup++; continue; }
    seen.add(w.day); wants.push(w);
  }
  /* trong hạn gói */
  const ok = wants.filter(w => inWin(p, w.day));
  if (ok.length < wants.length) stats.outWin.push({ key: key, n: wants.length - ok.length });
  ok.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  /* tối đa: min(4, còn lại, số ngày mở) — giữ các buổi sớm trong tuần */
  let keep = ok;
  if (keep.length > lim.max) { stats.capMax.push({ key: key, had: keep.length, max: lim.max, left: p.left }); keep = keep.slice(0, lim.max); }
  /* xếp từng buổi */
  const picks = [], used = new Set();
  const place = (w, d, tag) => {
    const r = pickHour(E, p, d, w.h0);
    if (!r) return false;
    picks.push({ date: d, h: r.h, h0: w.h0, how: r.how, tag: tag, w: w, why0: C.why(ctx, p, E, d, w.h0, ctx.lead) });
    used.add(d);
    return true;
  };
  const later = [];
  for (const w of keep) {
    if (!place(w, w.day, w.sun ? 'cn' : 'same_day')) later.push(w);
  }
  for (const w of later) {
    const alt = ctx.days.filter(d => !used.has(d) && inWin(p, d))
      .sort((a, b) => Math.abs(dayIdx(a) - dayIdx(w.day)) - Math.abs(dayIdx(b) - dayIdx(w.day)) || dayIdx(a) - dayIdx(b));
    let done = false;
    for (const d of alt) if (place(w, d, 'other_day')) { done = true; stats.otherDay.push({ key: key, from: w.day, to: d }); break; }
    if (!done) stats.unplaced.push({ key: key, day: w.day, h0: w.h0 });
  }
  /* tối thiểu: min(2, max) — thêm buổi ở ngày cách xa các buổi đã có nhất, cùng giờ quen */
  while (picks.length < lim.min) {
    /* buổi thêm: cùng giờ quen (buổi đầu tuần nguồn); chọn (ngày, giờ) lệch giờ ít nhất → cách các buổi đã có gần 3 ngày nhất → ngày sớm hơn */
    const base = (keep[0] || W.get(key)[0]);
    const cand = [];
    for (const d of ctx.days) {
      if (used.has(d) || !inWin(p, d)) continue;
      const r = pickHour(E, p, d, base.h0);
      if (!r) continue;
      const gap = used.size ? Math.min(...[...used].map(u => Math.abs(dayIdx(u) - dayIdx(d)))) : 3;
      cand.push({ d: d, r: r, dh: Math.abs(r.h - base.h0), g: Math.abs(gap - 3) });
    }
    cand.sort((a, b) => a.dh - b.dh || a.g - b.g || dayIdx(a.d) - dayIdx(b.d));
    if (!cand.length) die('khong them duoc ' + key);
    const x = cand[0];
    picks.push({ date: x.d, h: x.r.h, h0: base.h0, how: x.r.how, tag: 'add_min', w: { h0: base.h0, src: null } });
    used.add(x.d);
    stats.addMin.push({ key: key, day: x.d, h: x.r.h });
  }
  if (!picks.length) { stats.unplaced.push({ key: key, all: true }); continue; }
  /* kiểm như máy chủ */
  const chk = C.checkBook(ctx, p, E, m, picks.map(x => ({ date: x.date, h: x.h })));
  if (!chk.ok) die('checkBook ' + key + ' ' + JSON.stringify(chk));
  seq++;
  const rid = 'mophong' + ctx.no + '-' + String(seq).padStart(3, '0');
  if (!C.ridOk(rid)) die('rid');
  picks.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  for (const x of picks) {
    const note = x.tag === 'add_min' ? 'Mô phỏng · thêm cho đủ tối thiểu 2 buổi' : 'Mô phỏng · check-in ' + hmLabel(x.w.src);
    const arr = C.logRow(m.code, 1, ctx.key, { date: x.date, h: x.h }, p, 'Đặt', note, 'STAMP', rid);
    arrs.push(arr);
    ledger.push(C.logRowParsed(arr, 5 + ledger.length));
    meta.push({ key: key, kind: p.kind, coach: p.coach, date: x.date, h: x.h, h0: x.h0, how: x.how, tag: x.tag, why0: x.why0 || '',
                srcDay: x.w.src ? x.w.day : null, sun: !!(x.w && x.w.sun), src: x.w.src ? x.w.src.num + ' ' + x.w.src.hm : '' });
    if (x.tag === 'cn') stats.sunToSat++;
  }
  stats.persons++;
}
stats.rows = arrs.length;

/* ---------- kiểm lại toàn bộ sổ cuối ---------- */
const room = C.roomOf(ledger, ctx, trials);
const fullSlots = [];
for (const k in room) {
  const s = room[k];
  if (s.u > cap) die('vuot suat ' + k);
  for (const ck in s.c) {
    const g = s.c[ck], duo = g.filter(e => e.duo).length, solo = g.length - duo;
    if (solo > 1 || (solo && duo) || duo > 2) die('luat coach ' + k + ' ' + ck);
  }
  if (s.u >= cap) fullSlots.push(k);
}
for (const key of new Set(meta.map(x => x.key))) {
  const p = byKey.get(key), m = C.mine(ledger, p, ctx);
  if (m.sessions.length < 1 || m.sessions.length > LT.MAX) die('so buoi ' + key);
  const st = C.stateOf(ctx, p, C.envOf(ctx, ledger, trials, closed, cap), m, {}, list);
  if (st.mode !== 'ticket' || st.mine.sessions.length !== m.sessions.length) die('state ' + key);
}

/* ---------- thống kê ---------- */
const slotKey = x => x.date + '|' + x.h;
const pairsBy = {}, singles = [];
for (const k in room) for (const ck in room[k].c) {
  const g = room[k].c[ck].filter(e => e.duo);
  if (g.length === 2) pairsBy[k + '|' + ck] = 1;
  if (g.length === 1) singles.push({ k: k, ck: ck, kh: g[0].kh });
}
/* đơn lẻ còn có thể ghép nếu dời: cùng coach, cùng ngày, khung ghép khác cách ≤ 2 giờ */
let mayPair = 0; const usedS = new Set();
singles.sort((a, b) => a.k < b.k ? -1 : 1);
for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) {
  const a = singles[i], b = singles[j];
  if (usedS.has(i) || usedS.has(j) || a.ck !== b.ck) continue;
  const [da, ha] = a.k.split('|'), [db, hb] = b.k.split('|');
  if (da === db && Math.abs(+ha - +hb) <= 2) { mayPair++; usedS.add(i); usedS.add(j); }
}
const cnt = (f) => meta.filter(f).length;
const S = {
  now: C.stamp(NOW), week: ctx.key, activePersons: list.length, sessions42: S42.length,
  sessions42MonSat: S42.filter(s => C.dowOf(s.date) !== 0).length, persons42: order.length,
  persons: stats.persons, rows: stats.rows,
  byDay: ctx.days.map(d => d + ':' + cnt(x => x.date === d)).join(' '),
  byCoach: [...new Set(meta.map(x => x.coach))].map(c => c + ':' + cnt(x => x.coach === c)).join(' · '),
  kind: { '1:1': cnt(x => x.kind === '1:1'), '1:2': cnt(x => x.kind === '1:2') },
  sameSlot: cnt(x => x.tag === 'same_day' && x.h === x.h0),
  oneOneShift: cnt(x => x.tag === 'same_day' && x.kind === '1:1' && x.h !== x.h0),
  duoAtDuoHour: cnt(x => x.tag === 'same_day' && x.kind === '1:2' && x.h0 === x.h),
  duoMoved: cnt(x => x.tag === 'same_day' && x.kind === '1:2' && x.h !== x.h0),
  sunToSat: stats.sunToSat, sunDropped: stats.sunDropped, dupDay: stats.dup,
  otherDay: stats.otherDay.length, addMin: stats.addMin.length, capMax: stats.capMax, outWin: stats.outWin, unplaced: stats.unplaced,
  pairs: Object.keys(pairsBy).length, duoSingles: singles.length, mayPairByMove: mayPair,
  fullSlots: fullSlots.sort(), skipped: skipped.length, kindDiff: stats.kindDiff.length, coachDiff: stats.coachDiff,
  notBooked: list.length - stats.persons
};
/* chi tiết lệch giờ của khách 1:1 (không có tên) */
S.shift11 = meta.filter(x => x.tag === 'same_day' && x.kind === '1:1' && x.h !== x.h0).map(x => x.date.slice(5) + ' ' + x.h0 + '→' + x.h + ' ' + C.initials(x.coach));
S.duoMoves = meta.filter(x => x.kind === '1:2').map(x => x.date.slice(5) + ' ' + x.h0 + '→' + x.h + ' ' + x.how + ' ' + C.initials(x.coach));
/* lưới suất: ngày × giờ */
const grid = [];
for (const h of LT.SLOTS) grid.push(String(h).padStart(2, '0') + ' ' + ctx.days.map(d => { const s = room[d + '|' + h]; return s ? String(s.u) + (s.x ? '*' : ' ') : '. '; }).join(' '));
S.grid = grid;
fs.writeFileSync(OUT + 'stats.json', JSON.stringify(S, null, 1));
fs.writeFileSync(OUT + 'meta.json', JSON.stringify(meta));
/* dòng dự kiến (17 cột B..R) — cột tên để trống: lấy bằng công thức */
const NAME_IDX = [6, 7, 16];
const exp = arrs.map(a => a.map((v, i) => NAME_IDX.includes(i) ? '' : v));
fs.writeFileSync(OUT + 'expected_rows.json', JSON.stringify(exp));
console.log(JSON.stringify(S, null, 1));
