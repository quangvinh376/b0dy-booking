/* =====================================================================
   B0DY · "Để B0DY kể về bạn" — ke.js (trang ke.html)
   Dựng hành trình từ dữ liệu câu chuyện mà trang đặt lịch để sẵn (sessionStorage 'ke_payload' = {story, next, nav}):
   KE.derive → KE.script (ke-core.js) → mỗi khoảnh khắc một <section class="scr">, đúng bố cục / chuyển động / chữ của bản artifact 3.3.
   · Không có thuộc tính style trong markup (CSP style-src 'self'): biến vị trí / cỡ chữ đặt bằng CSSOM (css()).
   · Thẻ chia sẻ 1080 × 1920 và bản in A4 vẽ bằng canvas (một nguồn cho màn hình, ảnh lưu, PDF). PDF tự viết (một trang, ảnh JPEG) —
     không tải thư viện ngoài (CSP script-src 'self').
   · Lưu ảnh: máy cảm ứng có bảng chia sẻ tệp → bảng chia sẻ (iPhone: "Lưu hình ảnh"); còn lại tải tệp.
   · Đi tới khoảnh khắc biệt danh → ghi localStorage 'ke_done:<id>:<phiên bản>' = biệt danh (trang đặt lịch đổi chữ trên thẻ header).
   ===================================================================== */
(() => {
'use strict';
const QC = /[?&]qc(=|&|$)/.test(location.search);
const PF = QC ? 'qc:' : '';
/* bộ nhớ máy — Safari riêng tư có thể ném lỗi: mọi truy cập bọc try/catch · QC dùng tiền tố 'qc:' như app.js */
const store = kind => ({
  get: k => { try { return window[kind].getItem(PF + k); } catch (e) { return null; } },
  set: (k, v) => { try { window[kind].setItem(PF + k, v); } catch (e) { /* bỏ qua */ } }
});
const SS = store('sessionStorage'), LS = store('localStorage');
const HOME = './' + (QC ? '?qc' : '');
let DATA = null;
try { DATA = JSON.parse(SS.get('ke_payload') || 'null'); } catch (e) { DATA = null; }
/** câu chuyện chỉ mở khi máy còn đúng phiên của người đã mở nó (đuôi mã nhớ máy khớp 'tk'): "Không phải bạn?" / hết phiên → không ai
    bấm Tiến hay mở lại ke.html mà xem được câu chuyện của người trước */
function mine() {
  let tok = '';
  try {
    const e = +LS.get('lt_tokExp') || 0, t = LS.get('lt_tok');
    tok = t && e > Date.now() - 6e5 ? t : SS.get('lt_tok') || '';   /* lệch giờ máy ≤ 10 phút vẫn nhận (trang đặt lịch kiểm chặt hơn) */
  } catch (e) { tok = ''; }
  return !!(tok && DATA && DATA.tk && tok.slice(-16) === DATA.tk && SS.get('ke_payload'));
}
const M = DATA && window.KE && mine() ? window.KE.derive(DATA.story) : null;
if (!M) { location.replace(HOME); return; }
/* quay lại trang này từ bộ nhớ đệm (nút Tiến) sau khi đã đăng xuất → không hiện lại */
addEventListener('pageshow', e => { if (e.persisted && !mine()) location.replace(HOME); });
const KE = window.KE, L = KE.script(M, DATA.next || null);
const SID = String(DATA.story.id || '') + ':' + String(DATA.story.ver || '');   /* khớp keSid() của app.js */
LS.set('ke_seen:' + SID, '1');

/** về trang đặt lịch: đến từ trang đặt lịch (nav) → lùi lịch sử (giữ trang cũ trong bộ nhớ đệm); không thì mở mới */
let HOMET = 0;
function home() {
  if (DATA.nav && history.length > 1) { history.back(); HOMET = setTimeout(() => location.replace(HOME), 2500); }   /* mạng chậm: trang đặt lịch có thể mất ~1,2 s */
  else location.replace(HOME);
}
addEventListener('pagehide', () => clearTimeout(HOMET));

/* ============================== TIỆN ÍCH DOM ============================== */
const app = document.getElementById('app'), stage = document.getElementById('stage'), segs = document.getElementById('segs');
const COL = { ink: '#0A0A0A', night: '#2A1FA8', dusk: '#FF5B1A', paper: '#FAFAFA', volt: '#D4FF00' };
const FG = { ink: '#FAFAFA', night: '#FAFAFA', dusk: '#0A0A0A', paper: '#0A0A0A', volt: '#0A0A0A' };
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const NBX = ['của ' + M.call];
const nb = t => KE.nb(t, NBX);
function css(e, o) { Object.keys(o).forEach(k => e.style.setProperty(k, o[k])); return e; }
/** h('p', 'lb a', 'chữ', {'--d0': '.3s'}) — chữ đã giữ cụm từ trên một dòng */
const NBC = /(^| )(say|q|qt|word)( |$)/;   /* như artifact: chỉ thân bài / câu hỏi / lời coach / chữ lớn mới giữ cụm từ */
function h(tag, cls, text, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = cls && NBC.test(cls) ? nb(String(text)) : String(text);
  if (style) css(e, style);
  return e;
}
function add(p, ...kids) { kids.forEach(k => { if (k) p.appendChild(k); }); return p; }
/** chữ nhiều dòng (tên, biệt danh): mỗi dòng một .ln để căn lề quang học từng dòng */
function lines(tag, cls, arr, style) { const e = h(tag, cls, null, style); arr.forEach(t => { const l = h('span', 'ln'); l.textContent = nb(t); e.appendChild(l); }); return e; }
function num(text, attrs) { const e = h('span', 'num', text); if (attrs) Object.keys(attrs).forEach(k => { e.dataset[k] = attrs[k]; }); return e; }
function nu(cls, n, unit, style) { const e = h('div', 'nu ' + (cls || ''), null, style); add(e, n); if (unit) add(e, h('span', 'u', unit)); return e; }
function grow(minH) { return h('div', 'grow', null, minH ? { 'min-height': minH } : null); }
function bob(mood, body, stg, vars, shadow) {
  const e = h('div', 'b0b fade', null, vars);
  e.dataset.mood = mood; e.dataset.body = body; e.dataset.stage = stg; if (shadow) e.dataset.shadow = shadow;
  /* không có WebGL: ảnh tĩnh của trang đặt lịch (chỉ hợp nền sáng — thân Mực) */
  if (!(window.B0B && window.B0B.ok) && stg === 'paper') {
    const im = document.createElement('img'); im.alt = ''; im.decoding = 'async';
    im.src = 'img/' + ({ greet: 'b0b-chao', done: 'b0b-chao', sleep: 'b0b-ngu', doubt: 'b0b-nghi' }[mood] || 'b0b-quan-sat') + '.webp';
    e.appendChild(im);
  }
  return e;
}
const fz = v => ({ 'font-size': 'calc(' + v + ' * var(--k,1))' });
const SVGNS = 'http://www.w3.org/2000/svg';

/* ============================== KHOẢNH KHẮC ============================== */
const ans = {}, REF = {};
const B = {};
B.cover = m => [
  bob('greet', 'paper', 'ink', { '--d': 'min(60cqi,28cqb)', '--cx': 'calc(100% - min(23cqi,10.7cqb))', '--cy': '60%', '--d0': '.15s' }),
  h('p', 'lb a', m.lb), lines('h1', 'word rise mt24', m.lines, fz('min(30cqi,15cqb)')), grow(), h('p', 'say lg a', m.say, { '--d0': '.4s' })];
B.rules = m => {
  const b = h('button', 'btn wide a mt32', m.btn, { '--d0': '.3s' }); b.type = 'button'; b.dataset.next = '1';
  return [bob('observe', 'paper', 'ink', { '--d': 'min(48cqi,24cqb)', '--cx': '50%', '--cy': '33%' }), grow(),
    h('h2', 'word stmt a', m.stmt, { '--d0': '.1s' }), h('p', 'say lg a mt24', m.say, { '--d0': '.2s' }), b];
};
B.q = m => {
  const v = num(m.dec ? KE.num1(m.r.val) : String(m.r.val)), r = document.createElement('input');
  r.className = 'rng'; r.type = 'range'; r.min = m.r.min; r.max = m.r.max; r.step = m.r.step; r.value = m.r.val; r.setAttribute('aria-label', m.aria);
  const show = () => { v.textContent = m.dec ? KE.num1(+r.value) : String(+r.value); r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); r.setAttribute('aria-valuetext', v.textContent + ' ' + m.unit); };
  r.addEventListener('input', show); show();
  const lock = h('button', 'btn wide inv mt24', 'Chốt'); lock.type = 'button';
  lock.addEventListener('click', () => { ans[m.g] = +r.value; react(m.g); go(cur + 1); });
  const g = add(h('div', 'guess a', null, { '--d0': '.14s' }), nu('val', v, m.unit), r, lock);
  REF[m.g] = { reset: () => { r.value = m.r.val; show(); } };
  return [h('p', 'lb a', m.lb), h('h2', 'q a mt24', m.q, { '--d0': '.06s' }), grow(), g];
};
B.pick = m => {
  const box = h('div', 'opts a' + (m.opts.length > 6 ? ' d7' : ''), null, { '--d0': '.14s' });
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Chọn một ngày');
  m.opts.forEach(k => { const o = h('button', 'opt', k); o.type = 'button'; o.dataset.v = k; o.setAttribute('aria-pressed', 'false'); box.appendChild(o); });
  let picking = false;
  box.addEventListener('click', e => {
    const o = e.target.closest('.opt'); if (!o || busy || picking) return;
    box.querySelectorAll('.opt').forEach(x => { x.classList.toggle('pick', x === o); x.setAttribute('aria-pressed', String(x === o)); });
    ans[m.g] = o.dataset.v; react(m.g);
    /* chỉ đi tiếp MỘT bước, kể cả khi khách chạm lần nữa trong lúc chờ (giảm chuyển động: go không khoá busy) */
    picking = true; const from = cur;
    setTimeout(() => { picking = false; if (cur === from) go(from + 1); }, 380);
  });
  REF[m.g] = { reset: () => box.querySelectorAll('.opt').forEach(x => { x.classList.remove('pick'); x.setAttribute('aria-pressed', 'false'); }) };
  return [h('p', 'lb a', m.lb), h('h2', 'q a mt24', m.q, { '--d0': '.06s' }), grow(), box];
};
B.a1 = m => {
  REF.r1 = h('p', 'say lg a mt24', '', { '--d0': '.6s' });
  return [h('p', 'lb a', m.lb), REF.r1, grow(), h('p', 'lb a', m.lb2, { '--d0': '.3s', 'margin-bottom': 'var(--s16)' }),
    add(h('div', 'spill'), nu('rise big', num(String(m.value), { count: m.value, from: 'g1' }), null, fz('min(94cqi,46cqb)')))];
};
B.clock = m => [h('p', 'lb a', m.lb), nu('rise mt24 acidt', num(m.value), null, fz('min(30cqi,14cqb)')), h('p', 'say lg a mt24', m.say, { '--d0': '.25s' }),
  add(h('div', 'fill mt24'), dial(m)), h('p', 'say a dim mt24', m.dim, { '--d0': '.9s' })];
B.days = m => {
  REF.r2t = h('p', 'lb a', 'Đáp án');
  const bars = h('div', 'bars'), bax = h('div', 'bax lb');
  m.bars.forEach((b, i) => {
    const col = h('div', i === m.top ? 'hi' : '');
    add(col, add(h('span', 'c'), num(String(b.n))), h('b', '', null, { '--r': String(b.r), '--i': String(i) }));
    bars.appendChild(col); bax.appendChild(h('span', i === m.top ? 'hi' : '', b.k));
  });
  bars.setAttribute('role', 'img'); bars.setAttribute('aria-label', 'Số buổi theo thứ: ' + m.bars.map(b => b.k + ' ' + b.n).join(', '));
  return [REF.r2t, h('h2', 'word rise mt24', m.word, fz('min(25cqi,12cqb)')), h('p', 'say lg a mt24', m.say, { '--d0': '.7s' }), grow('var(--s24)'), bars, bax];
};
B.gap = m => {
  const at = (m.at * 100).toFixed(2) + '%', tl = h('div', 'tl');
  add(tl, h('i', '', null, { flex: String(m.seg[0]) }), h('i', 'gap', null, { flex: String(m.seg[1]) }), h('i', '', null, { flex: String(m.seg[2]) }),
    bob('sleep', 'paper', 'ink', { '--d': 'min(40cqi,19cqb)', '--cx': at, '--cy': 'calc(min(40cqi,19cqb) * -.5 + 1px)', '--d0': '.6s' }));
  tl.setAttribute('role', 'img'); tl.setAttribute('aria-label', 'Dòng thời gian ' + m.d0 + ' đến ' + m.d2 + ', khoảng trống từ ' + m.d1);
  /* nhãn ngày của khoảng trống: giữa khoảng trống, không đè hai nhãn hai đầu */
  const x = h('div', 'row lb mt16 tlx');
  add(x, h('span', '', m.d0), h('span', 'at', m.d1, { left: Math.min(80, Math.max(20, m.at * 100)).toFixed(2) + '%' }), h('span', '', m.d2));
  return [h('p', 'lb a', m.lb), h('h2', 'word stmt a mt24', m.stmt, { '--d0': '.1s' }), h('p', 'say lg a mt24', m.say, { '--d0': '.25s' }), grow('min(44cqi,22cqb)'), tl, x];
};
B.room = m => {
  const su = (v, ls, cls) => add(h('div', 'su ' + cls), add(h('div', 'nu'), num(String(v))), lines('h2', 'word', ls));
  const panel = add(h('div', 'panel volt up', null, { '--d0': '.75s' }), h('p', 'lb', m.plb), su(m.pvalue, m.punitLines, 'mt24'));
  return [h('p', 'lb a', m.lb), su(m.value, m.unitLines, 'rise mt24'), h('p', 'say lg a mt24', m.say, { '--d0': '.25s' }), h('p', 'say a dim mt12', m.dim, { '--d0': '1.4s' }), panel];
};
B.streak = m => {
  const row = h('div', 'row streak');
  for (let i = 0; i <= m.cells; i++) row.appendChild(h('i', 'a' + (i === m.cells ? ' nx' : ''), null, { '--d0': (.35 + i * .07).toFixed(2) + 's' }));
  row.setAttribute('role', 'img'); row.setAttribute('aria-label', m.value + ' tuần liên tiếp tập đủ 3 buổi, ô cuối là ' + (m.nx || 'Tuần sau').toLowerCase());
  return [h('p', 'lb a', m.lb), nu('rise mt24', num(String(m.value)), null, fz('min(84cqi,36cqb)')), h('h2', 'word stmt a mt24', m.stmt, { '--d0': '.25s' }), grow('var(--s24)'),
    row, add(h('div', 'row lb mt12 between'), h('span', '', m.d0), h('span', '', m.nx || 'Tuần sau')), h('p', 'say lg a mt24', m.say, { '--d0': '.6s' }), h('p', 'say a dim mt12', m.dim, { '--d0': '.75s' })];
};
B.mtn = m => {
  REF.r4 = h('p', 'say a dim mt12', '', { '--d0': '1.6s' });
  const box = add(h('div', 'mtn'), mountain(m.vol), h('span', 'lb l', m.d0), h('span', 'lb r', m.d1));
  return [h('p', 'lb a', m.lb), nu('rise mt24 acidt', num(KE.num(m.value), { count: m.value, from: 'g4', dec: 1 }), 'tấn', fz('min(28cqi,13cqb)')),
    h('p', 'say lg a mt24', m.say, { '--d0': '.3s' }), REF.r4, grow('var(--s24)'), box];
};
B.lift = m => [h('p', 'lb a', m.lb), nu('rise mt24', num(KE.num(m.to), { count: m.to, from0: m.from }), 'kg', fz('min(34cqi,15cqb)')),
  add(h('div', 'bbwrap'), barbell(m)), h('p', 'say lg a', m.say, { '--d0': '.4s' }), h('p', 'say a dim mt12', m.dim, { '--d0': '1.4s' })];
B.body = m => {
  REF.r5t = h('p', 'lb a', 'Đáp án');
  const panel = add(h('div', 'panel night up', null, { '--d0': '1.5s' }), h('p', 'lb acid', m.plb), h('h2', 'word stmt mt24 acidt', m.pword),
    nu('mt12 acidt', num(KE.num(m.pvalue)), 'kg', fz('min(34cqi,13cqb)')), m.pdet ? h('p', 'lb mt24', m.pdet) : null, grow(), h('p', 'say lg', m.psay));
  return [REF.r5t, h('h2', 'word stmt a mt24', m.word), nu('rise mt12', num(KE.num(m.value)), 'kg', fz('min(34cqi,13cqb)')), h('p', 'say lg a mt24', m.say, { '--d0': '.5s' }), panel];
};
B.pull = m => {
  const cal = add(h('div', 'cal'), add(h('div', 'ct'), h('p', 'lb', m.mlb)), add(h('div', 'cb'), nu('', num(String(m.day))), h('p', 'say mt16', m.dname)));
  return [h('p', 'lb a', m.lb), add(h('div', 'fill'), cal), h('p', 'say lg a', m.say, { '--d0': '.5s' }), h('h2', 'word stmt a mt16 acidt', m.stmt, { '--d0': '.8s' })];
};
B.coach = m => {
  const out = [];
  if (m.quote) out.push(h('p', 'lb a', m.lb), h('p', 'qt a mt24', m.quote, { '--d0': '.1s' }));
  if (m.quote && m.gval) out.push(grow('var(--s32)'));
  if (m.gval) out.push(h('p', 'lb a', m.glb, { '--d0': '.3s' }), nu('rise mt24', num(m.gval), null, Object.assign({ '--d0': '.35s' }, fz('min(40cqi,17cqb)'))),
    h('p', 'say lg a mt24', m.gsay, { '--d0': '.5s' }));
  if (!(m.quote && m.gval)) out.push(grow());
  return out;
};
B.lead = m => [bob('doubt', 'paper', 'ink', { '--d': 'min(100cqi,46cqb)', '--cx': '50%', '--cy': 'calc(100% - min(14cqi,6.5cqb))' }),
  h('h2', 'word stmt a', m.stmt), h('p', 'say lg a mt24', m.say, { '--d0': '.15s' })];
B.nick = m => {
  const slot = bob('done', 'ink', 'paper', { '--d': '70px', '--cx': 'calc(100% - 35px)', '--cy': '30px', '--d0': '.9s' }, 'off'); slot.id = 'b0bname';
  return [h('p', 'lb a', m.lb), h('div', 'grow', null, { flex: '3' }), add(h('div', 'namewrap'), slot, lines('h2', 'word rise', m.lines, Object.assign({ '--d0': '.3s' }, fz('min(25cqi,12cqb)')))),
    h('p', 'say lg a mt24', m.say, { '--d0': '.8s' }), h('div', 'grow', null, { flex: '2' })];
};
B.bands = m => {
  const box = h('div', 'bands');
  m.bands.forEach((b, i) => box.appendChild(add(h('div', 'b-' + b.c, null, { '--i': String(i) }), h('span', 'word', b.word), h('p', 'say', b.say))));
  return [h('p', 'lb a', m.lb), h('h2', 'word stmt a mt24', m.stmt, { '--d0': '.1s' }), box];
};
B.card = m => {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; cv.id = 'cardcv';
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Thẻ chia sẻ của ' + M.name);
  REF.card = cv; REF.picks = h('div', 'picks a mt16', null, { '--d0': '.22s' }); REF.picks.setAttribute('role', 'group'); REF.picks.setAttribute('aria-label', 'Chọn chỉ số trên thẻ (tối đa 6)');
  const save = h('button', 'btn', 'Lưu ảnh'), pv = h('button', 'btn ghost', 'Xem bản in'); save.type = pv.type = 'button'; save.id = 'saveimg'; pv.id = 'printv';
  save.addEventListener('click', saveImg); pv.addEventListener('click', openPrint);
  return [h('h2', 'word stmt a center', m.stmt), add(h('div', 'cardwrap a mt24', null, { '--d0': '.12s' }), add(h('div', 'card'), cv)), REF.picks,
    add(h('div', 'btns a mt16', null, { '--d0': '.3s' }), save, pv)];
};
B.next = m => {
  const out = [];
  if (m.lb) out.push(h('p', 'lb a', m.lb));
  out.push(h('h2', 'word stmt a' + (m.lb ? ' mt24' : ''), m.stmt, { '--d0': '.1s' }), h('p', 'say lg a mt24', m.say, { '--d0': '.2s' }), grow('var(--s24)'));
  if (m.slot) {
    const s = add(h('div', 'slot a', null, { '--d0': '.35s' }), add(h('div', 'row lb between'), h('span', '', m.slot.lb)), nu('mt24', num(m.slot.time)));
    if (m.slot.coach) s.appendChild(h('p', 'say lg mt24', m.slot.coach));
    if (m.slot.pkg) s.appendChild(h('p', 'lb mt8', m.slot.pkg));
    out.push(s);
  }
  const bk = h('button', 'btn inv', m.btn), ag = h('button', 'btn ghost', 'Xem lại'); bk.type = ag.type = 'button'; bk.id = 'book'; ag.id = 'again';
  bk.addEventListener('click', home); ag.addEventListener('click', again);
  out.push(add(h('div', 'btns a mt16', null, { '--d0': '.45s' }), bk, ag));
  return out;
};

/* ---------- đồ hoạ ---------- */
function svg(cls, vb, label) {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', cls); s.setAttribute('viewBox', vb);
  if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); } else s.setAttribute('aria-hidden', 'true');
  return s;
}
/** đồng hồ 24 giờ: mỗi giờ có buổi một nan, dài theo số buổi, giờ quen màu Acid */
function dial(m) {
  const s = svg('dial', '-170 -160 340 320', m.aria), R = 112, r0 = 26, P = a => [Math.sin(a), -Math.cos(a)], top = m.top, mx = m.hours[0][1];
  const arc = (hr, len) => {
    const a0 = (hr / 24) * 2 * Math.PI + .012, a1 = ((hr + 1) / 24) * 2 * Math.PI - .012, r1 = r0 + len;
    const [s0x, s0y] = P(a0), [s1x, s1y] = P(a1), f = v => v.toFixed(2);
    return `M${f(s0x * r0)} ${f(s0y * r0)} L${f(s0x * r1)} ${f(s0y * r1)} A${r1} ${r1} 0 0 1 ${f(s1x * r1)} ${f(s1y * r1)} L${f(s1x * r0)} ${f(s1y * r0)} A${r0} ${r0} 0 0 0 ${f(s0x * r0)} ${f(s0y * r0)}Z`;
  };
  let x = '';
  m.hours.slice().sort((a, b) => a[0] - b[0]).forEach(([hr, n]) => { x += `<path class="w" d="${arc(hr, n / mx * (R - r0))}" fill="${hr === top ? '#D4FF00' : '#FAFAFA'}" fill-opacity="${hr === top ? 1 : .4}"/>`; });
  x += `<circle r="${R}" fill="none" stroke="#FAFAFA" stroke-opacity=".22" stroke-width="1"/><circle r="${r0}" fill="none" stroke="#FAFAFA" stroke-opacity=".22" stroke-width="1"/>`;
  for (let k = 0; k < 24; k++) {
    if (k === top) continue;
    const [px, py] = P(k / 24 * 2 * Math.PI), a = k % 6 === 0;
    x += `<line x1="${(px * (R - (a ? 8 : 4))).toFixed(1)}" y1="${(py * (R - (a ? 8 : 4))).toFixed(1)}" x2="${(px * R).toFixed(1)}" y2="${(py * R).toFixed(1)}" stroke="#FAFAFA" stroke-opacity="${a ? .6 : .3}" stroke-width="1"/>`;
  }
  const G = 12, T = (tx, ty, an, t, hi) => `<text x="${tx}" y="${ty}" text-anchor="${an}" font-family="JetBrains Mono, monospace" font-size="10" letter-spacing="1.2" fill="${hi ? '#D4FF00' : '#FAFAFA'}" fill-opacity="${hi ? 1 : .6}">${t}</text>`;
  x += T(0, -(R + G), 'middle', '00:00', top === 0) + T(R + G, 3.5, 'start', '06:00', top === 6) + T(0, R + G + 7, 'middle', '12:00', top === 12) + T(-(R + G), 3.5, 'end', '18:00', top === 18);
  s.innerHTML = x;
  s.querySelectorAll('.w').forEach((p, i) => p.style.setProperty('--i', String(i)));
  return s;
}
/** thanh tạ: đĩa mức cũ trượt ra đúng chỗ mới, đĩa mới rơi vào (nặng trong, nhẹ ngoài) */
const PLATE = { 25: [17, 132], 20: [14, 132], 15: [13, 116], 10: [11, 96], 5: [9, 72], 2.5: [8, 54], 1.25: [6, 40] };
function barbell(m) {
  const to = KE.plates(m.to), fr = KE.plates(m.from), span = ps => ps.reduce((a, p) => a + 3 + PLATE[p][0], 0);
  const W = Math.max(393, 2 * (129 + span(to) + 8)), cx = W / 2, cy = 70, s = svg('bbs', '0 0 ' + W + ' 140', m.aria);
  const r = (x, w, hh, rr, cls) => `<rect class="${cls || ''}" x="${x.toFixed(1)}" y="${(cy - hh / 2).toFixed(1)}" width="${w}" height="${hh}" rx="${rr}" fill="#0A0A0A"/>`;
  /* ghép đĩa cũ với đĩa mới cùng cân (từ trong ra) → trượt; đĩa còn lại → rơi vào */
  const used = to.map(() => false), keep = {};
  fr.forEach((p, j) => { const i = to.findIndex((q, k) => !used[k] && q === p); if (i >= 0) { used[i] = true; keep[i] = j; } });
  const pos = ps => { const o = []; let e = 9; ps.forEach(p => { e += 3; o.push(e); e += PLATE[p][0]; }); return o; };   /* mép trong mỗi đĩa, tính từ ống tay */
  const pt = pos(to), pf = pos(fr);
  let x = r(0, W, 8, 0);
  const order = to.map((p, i) => i).filter(i => keep[i] === undefined);
  for (const sd of [-1, 1]) {
    const sleeve = cx + sd * 120;
    x += r(sd < 0 ? sleeve - 9 : sleeve, 9, 32, 2);
    to.forEach((p, i) => {
      const [w, hh] = PLATE[p], e = sleeve + sd * pt[i], px = sd < 0 ? e - w : e;
      x += r(px, w, hh, 3, 'pl ' + (keep[i] !== undefined ? 'keep k' + i : 'add a' + i));
    });
  }
  s.innerHTML = x;
  s.querySelectorAll('.pl').forEach(e => {
    const i = +(/[ka](\d+)/.exec(e.getAttribute('class').split(' ')[2]) || [0, 0])[1], sd = +e.getAttribute('x') < cx ? -1 : 1;
    if (keep[i] !== undefined) e.style.setProperty('--x', (-sd * (pt[i] - pf[keep[i]])) + 'px');
    else e.style.setProperty('--dl', (.95 + order.indexOf(i) * .25).toFixed(2) + 's');
  });
  return s;
}
/** ngọn núi: tổng tạ cộng dồn theo tuần (spline đơn điệu) */
function mountain(vol) {
  const tot = vol.reduce((a, b) => a + b, 0) || 1, n = vol.length, X = [], Y = [];
  let c = 0;
  vol.forEach((v, i) => { c += v; X.push(n > 1 ? i / (n - 1) * 100 : 0); Y.push(100 - c / tot * 97); });
  const d = [], mm = [];
  for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  mm[0] = d[0] || 0; mm[n - 1] = d[n - 2] || 0;
  for (let i = 1; i < n - 1; i++) mm[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { mm[i] = mm[i + 1] = 0; continue; }
    const a = mm[i] / d[i], b = mm[i + 1] / d[i], q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); mm[i] = t * a * d[i]; mm[i + 1] = t * b * d[i]; }
  }
  let p = `M0 100 L${X[0]} ${Y[0].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) { const w = X[i + 1] - X[i]; p += ` C${(X[i] + w / 3).toFixed(2)} ${(Y[i] + mm[i] * w / 3).toFixed(2)} ${(X[i + 1] - w / 3).toFixed(2)} ${(Y[i + 1] - mm[i + 1] * w / 3).toFixed(2)} ${X[i + 1].toFixed(2)} ${Y[i + 1].toFixed(2)}`; }
  p += ' L100 100 Z';
  const s = svg('', '0 0 100 100'); s.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('d', p); path.setAttribute('fill', '#FAFAFA'); s.appendChild(path);
  return s;
}

/* ---------- dựng các khoảnh khắc ---------- */
const scrs = L.map(m => {
  const s = h('section', 'scr ' + m.bg); s.dataset.bg = m.bg; s.dataset.id = m.id;
  if (m.g) s.dataset.guess = m.g;
  B[m.id](m).forEach(k => { if (k) s.appendChild(k); });
  stage.appendChild(s);
  return s;
});
scrs.forEach(() => segs.appendChild(document.createElement('i')));

/* ============================== CĂN QUANG HỌC + TỰ VỪA KHUNG (như artifact) ============================== */
const MC = document.createElement('canvas').getContext('2d');
function metrics(el, text) {
  const cs = getComputedStyle(el), S = parseFloat(cs.fontSize);
  MC.font = `${cs.fontWeight} ${S}px ${cs.fontFamily}`;
  const numeric = /[\d−+]/.test(text[0]);
  const ref = MC.measureText(numeric ? '8' : 'H'), fm = MC.measureText(text), first = MC.measureText(text[0]);
  const lh = cs.lineHeight === 'normal' ? S * 1.2 : parseFloat(cs.lineHeight);
  const fA = fm.fontBoundingBoxAscent, fD = fm.fontBoundingBoxDescent;
  return { S, lh, base: (lh - (fA + fD)) / 2 + fA, cap: ref.actualBoundingBoxAscent, lsb: -first.actualBoundingBoxLeft };
}
const OPT = '.scr > .nu, .scr > .word, .scr > .su, .namewrap > .word, .panel > .nu, .panel > .word, .panel > .su, .slot > .nu, .spill > .nu';
const MTV = { mt8: '--s8', mt12: '--s12', mt16: '--s16', mt24: '--s24', mt32: '--s32' };
function optical(root) {
  (root || document).querySelectorAll(OPT).forEach(el => {
    if (el.dataset.o == null) { el.dataset.o = '1'; el.dataset.mtI = el.style.marginTop; el.dataset.mbI = el.style.marginBottom; el.dataset.mlI = el.style.marginLeft; }
    el.style.marginTop = el.dataset.mtI; el.style.marginBottom = el.dataset.mbI; el.style.marginLeft = el.dataset.mlI;
    el.querySelectorAll('.ln').forEach(l => { l.style.marginLeft = ''; });
    const k = [...el.classList].find(c => MTV[c]), mt = k ? parseFloat(getComputedStyle(el).marginTop) : 0;
    const su = el.classList.contains('su'), tgt = (el.classList.contains('nu') || su) ? el.querySelector('.num') : (el.querySelector('.ln') || el);
    const text = (tgt && tgt.textContent || '').trim(); if (!text) return;
    const m = metrics(tgt, text);
    if (!isFinite(m.base) || !isFinite(m.cap)) return;
    el.style.marginTop = (mt - (m.base - m.cap)).toFixed(1) + 'px';
    if (!su && !el.closest('.spill')) { const desc = el.classList.contains('word') ? .22 * m.S : /,/.test(text) ? .14 * m.S : 0; el.style.marginBottom = (-(m.lh - m.base) + desc).toFixed(1) + 'px'; }
    const ls = el.classList.contains('word') ? el.querySelectorAll('.ln') : [];
    if (ls.length) ls.forEach(l => { const t = l.textContent.trim(); if (t) l.style.marginLeft = (-metrics(l, t).lsb).toFixed(1) + 'px'; });
    else (su ? el.querySelector('.nu') : el).style.marginLeft = (-m.lsb).toFixed(1) + 'px';
  });
}
function placeName() {
  const slot = document.getElementById('b0bname'), ln = document.querySelector('.namewrap .word .ln');
  if (!slot || !ln) return;
  const m = metrics(ln, ln.textContent.trim());
  ln.style.position = 'relative'; if (slot.parentNode !== ln) ln.appendChild(slot);
  css(slot, { '--d': m.cap.toFixed(1) + 'px', '--cx': `calc(100% - ${(m.cap / 2).toFixed(1)}px)`, '--cy': (m.base - m.cap / 2).toFixed(1) + 'px' });
}
const fontsReady = () => document.fonts ? Promise.all(['500 100px "SVN-Switzer"', '500 100px "JetBrains Mono"', '800 100px "Archivo XC"', '700 100px "Archivo C"']
  .map(f => document.fonts.load(f).catch(() => null))) : Promise.resolve();
const FLEX = ['fill', 'bars', 'mtn', 'bbwrap', 'cardwrap', 'bands'];
function need(s) {
  const cs = getComputedStyle(s), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
  const panel = [...s.children].find(c => c.classList.contains('panel') && getComputedStyle(c).position === 'absolute');
  const limit = panel ? panel.offsetTop - 16 : s.clientHeight - pb;
  let y = pt;
  for (const c of s.children) {
    const st = getComputedStyle(c); if (st.position === 'absolute') continue;
    let hh = c.offsetHeight;
    if (c.classList.contains('grow')) hh = parseFloat(st.minHeight) || 0;
    else if (FLEX.some(f => c.classList.contains(f))) hh = parseFloat(st.minHeight) || 0;
    else if (c.classList.contains('spill')) hh = c.offsetHeight * .55;
    else if (c.classList.contains('panel')) hh = c.scrollHeight;
    y += hh + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
  }
  return y - limit;
}
/** co hệ số --k của màn tới khi nội dung vừa; tối thiểu .55 thì cho cuộn */
function fitScreen(s) {
  s.classList.remove('scroll'); let k = 1; s.style.setProperty('--k', '1'); optical(s);
  for (let it = 0; it < 10; it++) {
    const o = need(s); if (!(o > 1)) break;
    k = Math.max(.55, k * Math.max(.82, 1 - o / s.clientHeight * 1.1)); s.style.setProperty('--k', k.toFixed(3)); optical(s);
    if (k <= .55) break;
  }
  if (need(s) > 2) s.classList.add('scroll');
  placeName();
}
let rz = 0;
new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { fitScreen(scrs[cur]); ovf(); }); }).observe(app);

/* ============================== ĐIỀU HƯỚNG ============================== */
let cur = 0, busy = false;
const ease = t => { const x = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - x, 3.2); };
const theme = document.querySelector('meta[name="theme-color"]');
function paint(i) {
  const bg = scrs[i].dataset.bg;
  app.style.setProperty('--bg', COL[bg]); app.style.background = COL[bg]; document.body.style.background = COL[bg]; document.body.style.color = FG[bg];
  document.getElementById('top').style.color = FG[bg];
  if (theme) theme.setAttribute('content', COL[bg]);
  [...segs.children].forEach((e, k) => e.classList.toggle('done', k <= i));
  document.getElementById('sprev').disabled = i === 0; document.getElementById('snext').disabled = i === scrs.length - 1;
  document.getElementById('pos').textContent = 'Khoảnh khắc ' + (i + 1) + ' trên ' + scrs.length;
}
function enter(i) {
  scrs.forEach((s, k) => { const on = k === i; s.classList.toggle('on', on); s.inert = !on; if (on) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true'); });
  const s = scrs[i]; s.scrollTop = 0; fitScreen(s);
  if (window.B0B && window.B0B.ok) try { window.B0B.mount(s.querySelector('.b0b')); } catch (e) { /* B0B không bao giờ làm hỏng trang */ }
  s.querySelectorAll('[data-count]').forEach(el => {
    if (el.dataset.final == null) el.dataset.final = el.textContent;   /* số cuối đúng như đã viết (92,5 · 214,6) */
    const to = parseFloat(el.dataset.count), dec = !!el.dataset.dec, fin = el.dataset.final, fmt = v => dec ? KE.num1(v) : String(Math.round(v));
    const from = el.dataset.from0 ? parseFloat(el.dataset.from0) : el.dataset.from && ans[el.dataset.from] != null ? ans[el.dataset.from] : 0;
    if (RM.matches) { el.textContent = fin; return; }
    const t0 = performance.now() + (el.dataset.from0 ? 550 : 200), D = el.dataset.from0 ? 900 : 1400;
    el.textContent = fmt(from);
    const step = t => { const p = (t - t0) / D; if (p >= 1 || !s.classList.contains('on')) { el.textContent = fin; return; } el.textContent = fmt(from + (to - from) * ease(p)); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  if (s.dataset.id === 'nick') LS.set('ke_done:' + SID, M.nick.name);
  if (s.dataset.id === 'card') { drawCard(); ovf(); }
}
function go(i) {
  if (busy || i < 0 || i >= scrs.length || i === cur) return;
  const s = scrs[cur];
  if (i > cur && s.dataset.guess && ans[s.dataset.guess] == null) { const g = s.querySelector('.guess,.opts'); g.classList.remove('nudge'); void g.offsetWidth; g.classList.add('nudge'); return; }
  closeSheet();
  if (RM.matches) { cur = i; paint(i); enter(i); return; }
  busy = true; const w = document.getElementById('wipe'); w.style.background = COL[scrs[i].dataset.bg];
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  setTimeout(() => { cur = i; paint(i); enter(i); }, 260);
  setTimeout(() => { busy = false; w.classList.remove('go'); }, 580);
}
function again() {
  Object.keys(ans).forEach(k => delete ans[k]);
  Object.keys(REF).forEach(k => { if (REF[k] && REF[k].reset) REF[k].reset(); });
  ['r1', 'r4'].forEach(k => { if (REF[k]) REF[k].textContent = ''; });
  ['r2t', 'r5t'].forEach(k => { if (REF[k]) REF[k].textContent = 'Đáp án'; });
  go(0);
}
stage.addEventListener('click', e => {
  if (e.target.closest('button,input,label,.picks,.card,a')) return;
  const r = app.getBoundingClientRect(); (e.clientX - r.left < r.width * .3) ? go(cur - 1) : go(cur + 1);
});
document.addEventListener('keydown', e => {
  const sh = document.querySelector('.sheet');
  if (sh) { if (e.key === 'Escape') closeSheet(); return; }
  if (e.target && e.target.closest && e.target.closest('input,button') && (e.key === ' ' || e.key === 'Enter')) return;   /* nút / thanh kéo tự xử lý */
  if (e.target && e.target.tagName === 'INPUT' && /^Arrow/.test(e.key)) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
});
document.getElementById('sprev').addEventListener('click', () => go(cur - 1));
document.getElementById('snext').addEventListener('click', () => go(cur + 1));
document.getElementById('close').addEventListener('click', home);
stage.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => go(cur + 1)));

/* ============================== PHẢN ỨNG KHI CHỐT ============================== */
function react(id) {
  const t = KE.react(id, M, ans[id]);
  if (id === 'g1' && REF.r1) REF.r1.textContent = nb(t);
  if (id === 'g2' && REF.r2t) REF.r2t.textContent = t;
  if (id === 'g4' && REF.r4) REF.r4.textContent = nb(t);
  if (id === 'g5' && REF.r5t) REF.r5t.textContent = t;
}

/* ============================== THẺ CHIA SẺ · BẢN IN (canvas) ============================== */
const WMP = ['M0 35V195H90C128 195 152 173 152 145C152 125 138 107 118 101C134 95 144 79 144 63C144 39 122 35 92 35H0ZM40 65H84C98 65 106 71 106 83C106 95 98 101 84 101H40V65ZM40 131H90C106 131 114 139 114 153C114 167 106 165 88 165H40V131Z',
  'M177 115C177 84.5 186.27 55.25 202.78 33.68C219.28 12.12 241.66 0 265 0C288.34 0 310.72 12.12 327.23 33.68C343.73 55.25 353 84.5 353 115C353 130.1 350.72 145.06 346.3 159.01C341.88 172.96 335.4 185.64 327.23 196.32C319.05 207 309.35 215.47 298.68 221.25C288 227.03 276.56 230 265 230C241.66 230 219.28 217.88 202.78 196.32C186.27 174.75 177 145.5 177 115ZM225 115C225 97.23 229.21 80.19 236.72 67.62C244.22 55.06 254.39 48 265 48C275.61 48 285.78 55.06 293.28 67.62C300.79 80.19 305 97.23 305 115C305 132.77 300.79 149.81 293.28 162.38C285.78 174.94 275.61 182 265 182C254.39 182 244.22 174.94 236.72 162.38C229.21 149.81 225 132.77 225 115ZM245 115C245 109.7 247.11 104.61 250.86 100.86C254.61 97.11 259.7 95 265 95C270.3 95 275.39 97.11 279.14 100.86C282.89 104.61 285 109.7 285 115C285 120.3 282.89 125.39 279.14 129.14C275.39 132.89 270.3 135 265 135C259.7 135 254.61 132.89 250.86 129.14C247.11 125.39 245 120.3 245 115Z',
  'M378 35V195H458C518 195 558 163 558 115C558 67 518 35 458 35H378ZM418 71H456C492 71 518 91 518 115C518 139 492 159 456 159H418V71Z',
  'M558 35H602L638 105L674 35H718L658 145V195H618V145L558 35Z'];
function wordmark(g, x, y, hh, col) { const s = hh / 230; g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col; WMP.forEach(d => g.fill(new Path2D(d), 'evenodd')); g.restore(); return 718 * s; }
/** vai chữ trên canvas (hướng C): word / num = Archivo XC · mono = JetBrains Mono (nới .14em) · sw = SVN-Switzer */
function font(g, role, px, trO) {
  g.font = role === 'mono' ? `500 ${px}px "JetBrains Mono"` : role === 'word' || role === 'num' ? `800 ${px}px "Archivo XC"` : `500 ${px}px "SVN-Switzer"`;
  const tr = role === 'mono' ? .14 : role === 'word' || role === 'num' ? 0 : -.01;
  try { g.letterSpacing = ((trO != null ? trO : tr) * px).toFixed(2) + 'px'; } catch (e) { /* trình duyệt cũ: không nới chữ */ }
}
const capH = (g, numeric) => g.measureText(numeric ? '8' : 'H').actualBoundingBoxAscent;
function txt(g, s, x, y, align) { g.textAlign = 'left'; const m = g.measureText(s), w = m.width; const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x + m.actualBoundingBoxLeft; g.fillText(s, xx, y); return w; }
function fit(g, role, px, s, maxW) { font(g, role, px); const w = g.measureText(s).width; if (w > maxW) { px = px * maxW / w; font(g, role, px); } return px; }
function wrap(g, s, maxW) { const ws = s.split(' '), out = []; let line = ''; for (const w of ws) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
let bobImg = null, bobP = null;
function loadBob() {
  if (bobP) return bobP;
  bobP = new Promise(res => {
    try {
      const url = window.B0B && window.B0B.ok ? window.B0B.snapshot('done', { body: 'ink', stage: 'paper', shadow: 'on' }, 720, { pitch: -7, gx: -.32, gy: .62 }) : null;
      if (!url) { res(null); return; }
      const im = new Image(); im.onload = () => { bobImg = im; res(im); }; im.onerror = () => res(null); im.src = url;
    } catch (e) { res(null); }
  });
  return bobP;
}
const FACTS = M.facts, MAXF = 6;
let sel = KE.defaultPicks(FACTS);
const NAME = M.name, NICK = M.nick.name, RANGE = KE.ddmm(M.first) + ' → ' + KE.ddmm(M.last) + '.' + M.last.slice(0, 4);
/* Thẻ 1080 × 1920. Mọi chữ nằm trong vùng an toàn của Story 1080 × 1420 (chừa 250 trên, 250 dưới).
   Thứ bậc: tên → biệt danh → B0B → chỉ số → khẩu hiệu. Nửa trên đứng yên khi khách đổi chip; chỉ phần chỉ số trong tấm chàm đổi bố cục
   theo số lượng: 1 = một số lớn, 2/4/6 = lưới 2 cột, 3/5 = số đầu trải hết bề ngang rồi lưới 2 cột. */
const CARD = { W: 1080, H: 1920, P: 80, SAFE: 250, G: 48, SEAM: 1000, BOB: 380, BOBV: .72, PAD: 80, RULEGAP: 64, RULE2FOOT: 56, LBL: 27, LTR: .1, V2L: 48, LLH: 36, ROWGAP: 60, ROWGAP_MIN: 44 };
const TIERS = { 1: [156, 0], 2: [0, 132], 3: [132, 96], 4: [0, 108], 5: [70, 64], 6: [0, 70] };   /* [cỡ chữ hoa số trải ngang, cỡ chữ hoa số trong lưới] */
const NAMEMAX = 232, NICKMAX = 104;
function numFit(g, s, px, maxW) { font(g, 'num', px); const w = g.measureText(s).width; return w > maxW ? px * maxW / w : px; }
function wrapLbl(g, s, maxW) {
  if (g.measureText(s).width <= maxW) return [s];
  const k = s.lastIndexOf(' · ');
  if (k > 0 && g.measureText(s.slice(0, k) + ' ·').width <= maxW && g.measureText(s.slice(k + 3)).width <= maxW) return [s.slice(0, k) + ' ·', s.slice(k + 3)];
  return wrap(g, s, maxW);
}
function cardTop(g) {
  const { W, P, SAFE, SEAM, BOB, BOBV } = CARD, FW = W - 2 * P, wmH = 36, hb = SAFE + wmH * 195 / 230;
  const nPx = Math.min(NAMEMAX, fit(g, 'word', NAMEMAX, NAME, FW)); font(g, 'word', nPx); const mN = g.measureText(NAME);
  const nBase = hb + 72 + mN.actualBoundingBoxAscent;
  const kPx = Math.min(NICKMAX, fit(g, 'word', NICKMAX, NICK, FW)); font(g, 'word', kPx); const mK = g.measureText(NICK);
  const kBase = nBase + mN.actualBoundingBoxDescent + 36 + mK.actualBoundingBoxAscent, kBot = kBase + mK.actualBoundingBoxDescent;
  const seam = Math.round(Math.max(SEAM, kBot + 56 + BOBV * BOB));
  return { wmH, hb, nPx, nBase, kPx, kBase, seam };
}
function cardLayout(g, seam) {
  const { W, H, P, SAFE, G, PAD, RULEGAP, RULE2FOOT, LBL, LTR, V2L, LLH, ROWGAP, ROWGAP_MIN } = CARD, CW = (W - 2 * P - G) / 2, FW = W - 2 * P;
  const items = [...sel].sort((a, b) => a - b).map(i => FACTS[i]), n = items.length, [hc, gc] = TIERS[n] || TIERS[6];
  const cells = []; let r0 = 0;
  if (hc) { cells.push({ f: items[0], hero: true, col: 0, row: 0, w: FW }); r0 = 1; }
  const rest = items.slice(r0), left = Math.ceil(rest.length / 2);
  rest.forEach((f, j) => { const col = j < left ? 0 : 1; cells.push({ f, hero: false, col, row: r0 + (col ? j - left : j), w: CW }); });
  font(g, 'num', 100); const cr = capH(g, true) / 100;
  let hPx = hc / cr, gPx = gc / cr;
  cells.forEach(c => { if (c.hero) hPx = Math.min(hPx, numFit(g, c.f[0], hPx, c.w)); else gPx = Math.min(gPx, numFit(g, c.f[0], gPx, c.w)); });
  font(g, 'mono', LBL, LTR); cells.forEach(c => { c.lines = wrapLbl(g, c.f[1].toUpperCase(), c.w); });
  const rows = Math.max(...cells.map(c => c.row)) + 1;
  const footBase = H - SAFE, ruleY = footBase - RULE2FOOT, top = seam + PAD, bot = ruleY - RULEGAP, room = bot - top;
  const rowCap = r => (cells.find(c => c.row === r && c.hero) ? hPx : gPx) * cr;
  const rowL = r => Math.max(1, ...cells.filter(c => c.row === r).map(c => c.lines.length));
  const hOf = (k, gap) => { let hh = (rows - 1) * gap; for (let r = 0; r < rows; r++) hh += rowCap(r) * k + V2L + (rowL(r) - 1) * LLH; return hh; };
  let gap = ROWGAP, k = 1;
  if (hOf(1, gap) > room) gap = Math.max(ROWGAP_MIN, ROWGAP - (hOf(1, gap) - room) / Math.max(1, rows - 1));
  if (hOf(1, gap) > room) { const fixed = hOf(0, gap); k = Math.max(.6, (room - fixed) / (hOf(1, gap) - fixed)); }
  const gridH = hOf(k, gap); let y = top + Math.max(0, (room - gridH) / 2);
  const rowTop = []; for (let r = 0; r < rows; r++) { rowTop.push(y); y += rowCap(r) * k + V2L + (rowL(r) - 1) * LLH + gap; }
  return { CW, hPx: hPx * k, gPx: gPx * k, cr, cells, rowTop, rowCap: r => rowCap(r) * k, footBase, ruleY };
}
function renderCard(cv) {
  const { W, H, P, G, BOB, BOBV, LBL, LTR, V2L, LLH } = CARD, INK = '#0A0A0A', LAV = 'rgba(250,250,250,';
  const g = cv.getContext('2d');
  g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  g.fillStyle = '#FF5B1A'; g.fillRect(0, 0, W, H);
  const T = cardTop(g);
  /* 1 · đầu thẻ: logo trái, khoảng ngày phải, chung một đường chân chữ */
  wordmark(g, P, CARD.SAFE, T.wmH, INK);
  font(g, 'mono', 24, .1); g.fillStyle = INK; txt(g, RANGE.toUpperCase(), W - P, T.hb, 'right');
  /* 2 · tên lớn nhất, biệt danh ngay dưới */
  font(g, 'word', T.nPx); g.fillStyle = INK; txt(g, NAME, P, T.nBase);
  font(g, 'word', T.kPx); txt(g, NICK, P, T.kBase);
  /* 3 · B0B gật đầu, mắt nhìn xuống chỉ số; ló lên sau mép tấm chàm, sát lề phải */
  if (bobImg) { const D = BOB, iw = D * 2.4, ih = iw * 444 / 480, cxb = W - P - D / 2, cyb = T.seam - BOBV * D + D / 2; g.drawImage(bobImg, cxb - iw / 2, cyb - ih * .5225, iw, ih); }
  /* 4 · tấm chàm và chỉ số */
  g.fillStyle = '#2A1FA8'; g.fillRect(0, T.seam, W, H - T.seam);
  const Lc = cardLayout(g, T.seam);
  Lc.cells.forEach(c => {
    const x = P + c.col * (Lc.CW + G), px = c.hero ? Lc.hPx : Lc.gPx, vb = Lc.rowTop[c.row] + Lc.rowCap(c.row);
    font(g, 'num', px); g.fillStyle = '#D4FF00'; txt(g, c.f[0], x, vb);
    font(g, 'mono', LBL, LTR); g.fillStyle = LAV + '.82)'; c.lines.forEach((l, k) => txt(g, l, x, vb + V2L + k * LLH));
  });
  /* 5 · đường kẻ mảnh, khẩu hiệu và tên miền ở mép dưới vùng an toàn */
  g.fillStyle = LAV + '.2)'; g.fillRect(P, Lc.ruleY, W - 2 * P, 2);
  font(g, 'mono', 24, .1); g.fillStyle = LAV + '.62)'; txt(g, 'ĐỂ CƠ THỂ KỂ VỀ BẠN', P, Lc.footBase); txt(g, 'B0DY.STUDIO', W - P, Lc.footBase, 'right');
}
const PAL = { dusk: '#FF5B1A', night: '#2A1FA8', volt: '#D4FF00' };
function renderPrint(cv) {
  const g = cv.getContext('2d'), W = 794, H = 1123, P = 64, INK = '#0A0A0A', DIM = 'rgba(10,10,10,.6)';
  g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  g.fillStyle = '#FAFAFA'; g.fillRect(0, 0, W, H);
  wordmark(g, P, P, 22, INK); font(g, 'mono', 9.5); g.fillStyle = INK; txt(g, RANGE.toUpperCase(), W - P, P + 17, 'right');
  font(g, 'mono', 9.5); g.fillStyle = DIM; txt(g, 'ĐỂ CƠ THỂ KỂ VỀ BẠN', P, P + 92);
  fit(g, 'word', 84, NAME, W - 2 * P); g.fillStyle = INK; const nc = capH(g); const nb0 = P + 120 + nc; txt(g, NAME, P, nb0);
  fit(g, 'word', 40, NICK, W - 2 * P); const kc = capH(g); const kb = nb0 + 30 + kc; const kw = txt(g, NICK, P, kb);
  if (bobImg) { const D = kc * 1.05, iw = D * 2.4, ih = iw * 444 / 480, cxb = P + kw + 18 + D / 2, cyb = kb - D / 2; g.drawImage(bobImg, cxb - iw / 2, cyb - ih * .5225, iw, ih); }
  let y = kb + 44;
  if (M.palette) {
    const bw = (W - 2 * P - 16) / 3;
    M.palette.forEach((b, i) => { g.fillStyle = PAL[b.c]; g.fillRect(P + i * (bw + 8), y, bw, 18); font(g, 'mono', 8.5); g.fillStyle = DIM; txt(g, b.tag, P + i * (bw + 8), y + 34); });
    y += 60;
  } else y += 16;
  const RP = 33;
  KE.printRows(M).forEach(([a, b]) => { g.fillStyle = 'rgba(10,10,10,.16)'; g.fillRect(P, y, W - 2 * P, 1); font(g, 'sw', 14); g.fillStyle = INK; txt(g, a, P, y + 22); txt(g, b, W - P, y + 22, 'right'); y += RP; });
  g.fillStyle = 'rgba(10,10,10,.16)'; g.fillRect(P, y, W - 2 * P, 1);
  /* lời coach: chỉ số dòng còn vừa trên chân trang; dài hơn → dòng cuối kết bằng … */
  const room = Math.floor((H - P - 40 - (y + 60)) / 27);
  if (M.note && room >= 1) {
    y += 46; font(g, 'mono', 9.5); g.fillStyle = DIM; txt(g, ('Coach ' + (M.coach || 'của bạn')).toUpperCase(), P, y);
    font(g, 'sw', 19); g.fillStyle = INK; y += 14;
    let ls = wrap(g, '“' + M.note + '”', W - 2 * P);
    if (ls.length > room) {
      ls = ls.slice(0, room);
      let last = ls[room - 1];
      while (last && g.measureText(last + '…”').width > W - 2 * P) last = last.replace(/\s*\S+$/, '');
      ls[room - 1] = (last || '').replace(/[\s.,;:”]+$/, '') + '…”';
    }
    ls.forEach(l => { y += 27; txt(g, l, P, y); });
  }
  font(g, 'mono', 9.5); g.fillStyle = DIM; txt(g, 'B0DY · ' + (M.code ? M.code + ' · ' : '') + 'TRANG 1 / 1', P, H - P); txt(g, 'B0DY.STUDIO', W - P, H - P, 'right');
}

/* ---------- chip chọn chỉ số ---------- */
function drawPicks() {
  const box = REF.picks; if (!box) return;
  box.textContent = '';
  FACTS.forEach((f, i) => {
    const on = sel.includes(i), b = h('button', 'pick-c' + (on ? ' sel' : ''), f[2]); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => {
      if (sel.includes(i)) { if (sel.length > 1) sel = sel.filter(x => x !== i); }
      else sel = sel.length < MAXF ? [...sel, i] : [...sel.slice(1), i];
      drawPicks(); drawCard();
      const nbtn = box.children[i]; if (nbtn) nbtn.focus();
    });
    box.appendChild(b);
  });
}
function drawCard() { if (REF.card) { renderCard(REF.card); prepPng(); } }
const ovf = () => { if (REF.picks) REF.picks.classList.toggle('ovf', REF.picks.scrollWidth > REF.picks.clientWidth + 1); };
if (REF.picks) {
  new ResizeObserver(ovf).observe(REF.picks);
  REF.picks.addEventListener('wheel', e => { const p = REF.picks; if (p.scrollWidth > p.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { p.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  drawPicks();
}

/* ============================== LƯU · BẢN IN ============================== */
const FILE_PNG = 'B0DY-' + (KE.slug(NICK) || 'ke-ve-ban') + '.png';
const FILE_PDF = 'B0DY-' + (M.code ? M.code + '-' : '') + 'ke-ve-ban.pdf';
const canBlob = cv => new Promise(res => { try { cv.toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } });
/* ảnh thẻ làm sẵn mỗi khi thẻ đổi → bấm "Lưu ảnh" mở bảng chia sẻ ngay trong cú chạm (Safari đòi chia sẻ ngay khi người dùng bấm) */
let PNG = { key: '', blob: null }, PNGT = 0;
const pngKey = () => sel.slice().sort((a, b) => a - b).join(',') + '|' + (bobImg ? 1 : 0);
function prepPng() {
  clearTimeout(PNGT);
  PNGT = setTimeout(async () => {
    const k = pngKey(); if (PNG.key === k) return;
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; renderCard(cv);
    const b = await canBlob(cv); if (b && k === pngKey()) PNG = { key: k, blob: b };
  }, 250);
}
const coarse = matchMedia('(pointer: coarse)');
/** máy cảm ứng có bảng chia sẻ tệp → chia sẻ (iPhone: "Lưu hình ảnh"); còn lại → tải tệp */
async function saveBlob(blob, name) {
  let file = null;
  try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
  if (file && coarse.matches && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; /* chặn chia sẻ → tải tệp */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 40000);   /* iOS đọc tệp chậm: không thu hồi sớm */
  return 'download';
}
let SAVING = false;
async function saveImg() {
  if (SAVING) return;
  SAVING = true;
  try { await saveImg1(); } finally { SAVING = false; }
}
async function saveImg1() {
  const btn = document.getElementById('saveimg');
  let blob = PNG.key === pngKey() ? PNG.blob : null;
  if (!blob) {
    btn.setAttribute('aria-busy', 'true');
    await fontsReady(); await loadBob();
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; renderCard(cv);
    blob = await canBlob(cv); btn.removeAttribute('aria-busy');
    if (!blob) { toast('Chưa lưu được ảnh ở đây.'); return; }
  }
  const r = await saveBlob(blob, FILE_PNG);
  if (r === 'download') toast('Đã tải ' + FILE_PNG);
}
/** PDF một trang A4, một ảnh JPEG (DCTDecode) phủ kín trang */
function pdfOf(jpeg, wPx, hPx) {
  const PW = 595.28, PH = 841.89, enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, s) => { offs[n] = len; push(n + ' 0 obj\n' + s + '\nendobj\n'); };
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offs[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg); push('\nendstream\nendobj\n');
  const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const xref = len;
  push('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
function fillPrintPage() {
  const pp = document.getElementById('printpage'), cv = document.createElement('canvas'); cv.width = 794 * 2; cv.height = 1123 * 2; renderPrint(cv);
  pp.textContent = ''; pp.appendChild(cv); return cv;
}
let PRINTING = false;
async function openPrint() {
  if (PRINTING || document.querySelector('.sheet')) return;
  PRINTING = true;
  try { await openPrint1(); } finally { PRINTING = false; }
}
async function openPrint1() {
  await fontsReady(); await loadBob();
  const cv = document.createElement('canvas'); cv.width = 794 * 2; cv.height = 1123 * 2; renderPrint(cv); fillPrintPage();
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Bản in A4 câu chuyện của ' + NAME);
  /* PDF làm sẵn trong lúc khách xem → bấm "Lưu PDF" chia sẻ / tải ngay */
  let pdf = null;
  const ready = new Promise(res => { try { cv.toBlob(b => { if (!b || b.type !== 'image/jpeg') { res(null); return; } b.arrayBuffer().then(ab => { pdf = pdfOf(new Uint8Array(ab), cv.width, cv.height); res(pdf); }, () => res(null)); }, 'image/jpeg', .94); } catch (e) { res(null); } });
  sheet(cv, [['Lưu PDF', '', async () => { const b = pdf || await ready; if (!b) { toast('Chưa tạo được PDF ở đây.'); return; } const r = await saveBlob(b, FILE_PDF); if (r === 'download') toast('Đã tải ' + FILE_PDF); }],
    ['Đóng', 'ghost', closeSheet]]);
}
let SHEET_FOCUS = null;
function sheet(node, actions) {
  closeSheet();
  SHEET_FOCUS = document.activeElement;
  const s = h('div', 'sheet'); s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-label', 'Bản in');
  const pv = h('div', 'pv'); pv.appendChild(node); s.appendChild(pv);
  const bs = h('div', 'btns');
  actions.forEach(([label, cls, fn]) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', () => fn(s)); bs.appendChild(b); });
  s.appendChild(bs); app.appendChild(s);
  stage.inert = true; document.getElementById('top').inert = true; ['sprev', 'snext'].forEach(id => { document.getElementById(id).inert = true; });   /* cửa sổ: Tab không ra ngoài */
  const f = bs.querySelector('button'); if (f) f.focus();
}
function closeSheet() {
  const s = document.querySelector('.sheet'); if (!s) return;
  s.remove(); stage.inert = false; document.getElementById('top').inert = false; ['sprev', 'snext'].forEach(id => { document.getElementById(id).inert = false; });
  if (SHEET_FOCUS && SHEET_FOCUS.isConnected) try { SHEET_FOCUS.focus(); } catch (e) { /* bỏ qua */ }
  SHEET_FOCUS = null;
}
let TOASTT = 0;
function toast(t) {
  document.querySelectorAll('.toast').forEach(x => x.remove()); clearTimeout(TOASTT);
  const e = h('div', 'toast', t); e.setAttribute('role', 'status'); app.appendChild(e);
  TOASTT = setTimeout(() => e.remove(), 2400);
}

/* ============================== KHỞI ĐỘNG ============================== */
paint(0); enter(0);
fontsReady().then(() => requestAnimationFrame(() => { optical(); fitScreen(scrs[cur]); }))
  .then(loadBob).then(() => { drawCard(); fillPrintPage(); });
window.__ke = { M: M, L: L, go: i => { cur = i; paint(i); enter(i); }, cur: () => cur, busy: () => busy, ans: ans, sel: a => { sel = a; drawPicks(); drawCard(); },
  card: cv => renderCard(cv), print: cv => renderPrint(cv), pdfOf: pdfOf, guess: (id, v) => { ans[id] = v; react(id); } };
})();
