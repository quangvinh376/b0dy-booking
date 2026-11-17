/* "Để B0DY kể về bạn" — dữ liệu câu chuyện (dạng v2 của ke-core.js) dựng thẳng từ các bảng GỐC đang có trên Google Sheets:
     · SESSION LOG (file BA): buổi "Đã tập" — ngày, khung giờ (thường trống khi coach check-in bằng app)
     · Sổ đặt lịch (file Lịch tập tuần): giờ của buổi đã đặt qua trang đặt lịch (từ tuần 43) — lấp giờ cho buổi SESSION LOG không ghi
     · logbook app coach (file Customer database · "Khách của <coach>"): SET (bài, kg, rep) · ĐO (chỉ số, giá trị) · MỤC TIÊU
     · "Tổng hợp bài" (cùng file): khối lượng / mức tạ từng ngày đã lưu trữ khỏi tab nóng
   Không bịa: giờ không rõ → null (không lấy giờ ký app), tạ chỉ những buổi coach ghi, số đo chỉ những lần đo, "N trên 100" tính từ
   SESSION LOG, hít xà không suy (logbook không biết "lần đầu" thật).
   Dùng cho tools/ke_real.mjs (chạy cả phòng trên bản tải về, chỉ in số đếm) — và là bản mẫu nếu nguồn câu chuyện của máy chủ đọc Sheets.
   Hàm thuần: không đọc tệp, không mạng. */
import * as C from '../worker/src/core.js';

const ISO = /^\d{4}-\d{2}-\d{2}/;
const isoOf = v => v && typeof v === 'object' && v.$d ? v.$d : typeof v === 'string' && ISO.test(v) ? v.slice(0, 10) : '';
const numOf = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; };
const hourOf = v => { const m = String(v == null ? '' : (v && v.$t) || v).match(/^\s*(\d{1,2})[:h]/); const h = m ? +m[1] : null; return h !== null && h >= 0 && h <= 23 ? h : null; };
function tabOf(rows, must) {
  const i = rows.findIndex(r => must.every(m => r.indexOf(m) >= 0));
  if (i < 0) return { head: [], rows: [] };
  return { head: rows[i].map(x => String(x || '').trim()), rows: rows.slice(i + 1) };
}
const rec = (head, r) => { const o = {}; head.forEach((h, i) => { if (h && o[h] === undefined) o[h] = r[i]; }); return o; };

/** Gom các bảng gốc theo NGƯỜI (khoá như máy chủ: list.alias của khách đang tập, list.ended.alias của khách đã hết gói — Mã KH trước,
    tên sau). sources: {sessionLog: hàng thô của tab SESSION LOG, logbook: {tab: {head, rows}}, summary: {head, rows}, ledger: {head, rows}} */
export function indexSources(sources, list) {
  const A = list.alias || {}, E = (list.ended && list.ended.alias) || {};
  const keyOf = (code, name) => {
    const raw = String(code || '').trim();
    for (const c of [raw, raw.toUpperCase()]) if (c && (A[c] || E[c])) return A[c] || E[c];   /* Mã KH như MEMBERS ghi, rồi chữ hoa */
    const n = name ? '#' + C.nameKey(name) : '';
    return n && (A[n] || E[n]) ? A[n] || E[n] : null;
  };
  const S = { ses: {}, hour: {}, lb: {}, sum: {}, stat: { log: 0, logHit: 0, lb: 0, lbHit: 0, led: 0 } };
  const push = (o, k, v) => { (o[k] || (o[k] = [])).push(v); };
  /* SESSION LOG: chỉ "Đã tập" */
  const sl = tabOf(sources.sessionLog || [], ['Ngày', 'Trạng thái']);
  sl.rows.forEach(r => {
    const o = rec(sl.head, r), d = isoOf(o['Ngày']);
    if (!d || String(o['Trạng thái'] || '').trim() !== 'Đã tập') return;
    S.stat.log++;
    const k = keyOf(o['Mã KH'], o['Học viên']); if (!k) return;
    S.stat.logHit++;
    push(S.ses, k, { d: d, h: hourOf(o['Khung giờ']) });
  });
  /* Sổ đặt lịch: buổi đang "Đã đặt" (bỏ dòng mô phỏng tuần 43) → giờ theo người + ngày */
  const lg = sources.ledger || { head: [], rows: [] };
  lg.rows.forEach(r => {
    const o = rec(lg.head, r), d = isoOf(o['Ngày']), h = hourOf(o['Giờ']);
    if (!d || h === null || String(o['Trạng thái'] || '').trim() !== C.LT.ON || /^mophong/.test(String(o['Mã yêu cầu'] || ''))) return;
    const k = keyOf(o['Mã KH'], o['Hội viên']); if (!k) return;
    S.stat.led++;
    S.hour[k + '|' + d] = h;
  });
  /* logbook: mọi tab "Khách của …" */
  Object.keys(sources.logbook || {}).forEach(t => {
    const tb = sources.logbook[t];
    tb.rows.forEach(r => {
      const o = rec(tb.head, r); if (!o['Loại']) return;
      S.stat.lb++;
      const k = keyOf(o['Mã KH'], o['Khách']); if (!k) return;
      S.stat.lbHit++;
      push(S.lb, k, o);
    });
  });
  /* Tổng hợp bài (ngày đã lưu trữ): chỉ có tên khách */
  const sm = sources.summary || { head: [], rows: [] };
  sm.rows.forEach(r => { const o = rec(sm.head, r), k = keyOf('', o['Khách']); if (k && isoOf(o['Ngày'])) push(S.sum, k, o); });
  S.blankAgain = blankAgainOf(S.ses);
  return S;
}
/** Để báo cáo (chưa đưa vào câu chuyện): trong các tuần trắng NẰM GIỮA quãng tập của mỗi người (sau buổi đầu, trước buổi cuối), bao
    nhiêu tuần trắng mà tuần kế tiếp cũng trắng. Ít hơn 30 tuần trắng → null. */
function blankAgainOf(ses) {
  let blank = 0, again = 0;
  const DAY = 864e5, mon = d => { const t = Date.parse(d + 'T00:00:00Z'), w = (new Date(t).getUTCDay() + 6) % 7; return t - w * DAY; };
  Object.keys(ses).forEach(k => {
    const ws = new Set(ses[k].map(x => mon(x.d))), all = [...ws].sort((a, b) => a - b);
    if (all.length < 2) return;
    for (let t = all[0]; t < all[all.length - 1]; t += 7 * DAY) {
      if (ws.has(t)) continue;
      blank++;
      if (!ws.has(t + 7 * DAY)) again++;
    }
  });
  return blank >= 30 ? Math.round(again / blank * 100) : null;
}

const MET = { weight: 'kg', waist: 'waist', hip: 'hip', chest: 'chest', thigh: 'thigh', arm: 'arm', fat: 'fat', muscle: 'muscle' };   /* arm: chỉ để xét mục tiêu Vòng tay */
const GOAL = { weight: ['Cân nặng', 'kg'], waist: ['Vòng eo', 'cm'], hip: ['Vòng hông', 'cm'], chest: ['Vòng ngực', 'cm'], thigh: ['Vòng đùi', 'cm'], arm: ['Vòng tay', 'cm'] };

/** Dữ liệu câu chuyện v2 của một người (person: phần tử của persons() / persons().ended). null: không có buổi tập nào. */
export function factsFor(person, S, opts) {
  const today = opts.today, k = person.key;
  const raw = (S.ses[k] || []).filter(x => x.d <= today);
  if (!raw.length) return null;
  /* giờ từ Sổ đặt lịch chỉ lấp cho ngày có ĐÚNG MỘT buổi (hai buổi cùng ngày mà lấp cùng một giờ → máy kể gộp làm một, lệch số buổi của BA) */
  const perDay = {}; raw.forEach(x => { perDay[x.d] = (perDay[x.d] || 0) + 1; });
  const sessions = raw.map(x => [x.d, x.h !== null ? x.h : perDay[x.d] === 1 && S.hour[k + '|' + x.d] !== undefined ? S.hour[k + '|' + x.d] : null])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  /* tạ theo ngày. Tab nóng: Σ kg × rep từng set. "Tổng hợp bài" (ngày đã lưu trữ, khách × bài × ngày): khối lượng các set đã chuyển đi —
     tab nóng vẫn GIỮ vài set của ngày cũ (set mới nhất / set đạt có kg mới nhất mỗi bài, Archive.gs app coach). Không rõ "Tổng hợp bài" có
     tính cả các set được giữ hay không → mỗi (ngày, bài) lấy số LỚN hơn của hai nguồn: không bao giờ cộng trùng; nếu tổng hợp chưa tính set
     được giữ thì thiếu tối đa đúng các set đó (1–2 set / bài). */
  const lb = (S.lb[k] || []).filter(o => isoOf(o['Ngày']) && isoOf(o['Ngày']) <= today), vol = {}, ex = {};
  const put = (d, n, v, src) => { const x = vol[d] || (vol[d] = {}), y = x[n] || (x[n] = { hot: 0, sum: 0 }); y[src] += v; };
  const lift = (name, d, kg) => { if (!name || !(kg > 0)) return; const e = ex[name] || (ex[name] = {}); e[d] = Math.max(e[d] || 0, kg); };
  lb.forEach(o => {
    if (o['Loại'] !== 'SET') return;
    const d = isoOf(o['Ngày']), n = String(o['Bài tập'] || '').trim(), kg = numOf(o['KG']), rep = numOf(o['REP']);
    if (kg > 0 && rep > 0) put(d, n, kg * rep, 'hot');
    lift(n, d, kg);
  });
  (S.sum[k] || []).forEach(o => {
    const d = isoOf(o['Ngày']), n = String(o['Bài tập'] || '').trim(); if (d > today) return;
    const v = numOf(o['Khối lượng']); if (v > 0) put(d, n, v, 'sum');
    lift(n, d, numOf(o['KG']));
  });
  const load = {};
  Object.keys(vol).forEach(d => { const t = Object.keys(vol[d]).reduce((a, n) => a + Math.max(vol[d][n].hot, vol[d][n].sum), 0); if (t > 0) load[d] = Math.round(t); });
  /* mức tạ: bài có ≥ 2 ngày ghi kg — ngày đầu → ngày gần nhất (mức cao nhất của mỗi ngày), n = số buổi có ghi bài đó */
  const lifts = Object.keys(ex).map(n => {
    const ds = Object.keys(ex[n]).sort();
    return ds.length >= 2 ? { name: n.slice(0, 30), from: ex[n][ds[0]], to: ex[n][ds[ds.length - 1]], n: ds.length, d0: ds[0] } : null;
  }).filter(Boolean);
  /* hít xà: màn này nói "ngày ĐẦU TIÊN bạn tự kéo được người lên xà" — logbook chỉ biết lần đầu COACH GHI một set chin-up / pull-up, không
     biết đó có phải lần đầu thật (logbook có từ 26.09, khách có thể đã kéo được từ trước) → KHÔNG suy ra; cần coach đánh dấu mốc trên app */
  const pullup = null;
  /* số đo: mỗi ngày đo một bản ghi */
  const bd = {};
  lb.filter(o => o['Loại'] === 'ĐO').forEach(o => { const f = MET[String(o['Chỉ số'] || '').trim()], v = numOf(o['Giá trị']); if (!f || !(v > 0)) return; const d = isoOf(o['Ngày']); (bd[d] || (bd[d] = { d: d }))[f] = v; });
  const body = Object.keys(bd).sort().map(d => bd[d]);
  /* mục tiêu số đo: đạt khi lần đo gần nhất đã tới mục tiêu (theo hướng từ lần đo đầu) */
  const goals = lb.filter(o => o['Loại'] === 'MỤC TIÊU').map(o => {
    const m = String(o['Chỉ số'] || '').trim(), t = numOf(o['Giá trị']), g = GOAL[m]; if (!g || !(t > 0)) return null;
    const f = MET[m] || m, vals = body.filter(b => b[f] > 0), a = vals[0] && vals[0][f], z = vals.length > 1 ? vals[vals.length - 1][f] : null;
    const done = a != null && z != null && (t < a ? z <= t : t > a ? z >= t : false);
    return { t: g[0] + ' ' + String(t).replace('.', ',') + ' ' + g[1], done: done };
  }).filter(Boolean);
  /* "CÓ MỘT SỰ THẬT · N trên 100 người đã nghỉ liền mấy tuần mà không quay lại": số của bản artifact (43) lấy từ nghiên cứu 15/10 —
     "tuần trắng → tuần sau cũng trắng", không phải "không quay lại". Chưa có định nghĩa khớp câu chữ → KHÔNG đưa (màn tự bỏ); S.blankAgain
     chỉ để báo cáo, chờ chủ studio chốt số + câu. */
  const out = { v: 2, sessions: sessions, load: load, lifts: lifts, body: body, goals: goals };
  if (pullup) out.pullup = pullup;   /* (chưa có nguồn đáng tin — xem trên) */
  if (!opts.ended) out.asOf = today;
  return out;
}
