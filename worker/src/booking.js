/**
 * B0DY — Lịch tập tuần · Durable Object "Booking" (một bản duy nhất phục vụ mọi lượt gọi)
 *
 * Hợp đồng API giống hệt ltDoPost_ của backend/LichTuan.gs: lt_ping · lt_boot · lt_find · lt_verify · lt_book · lt_change ·
 * lt_invite · lt_decline (gói 1:2: mời bạn cùng coach vào buổi đang chờ ghép / không nhận lời mời — dòng "Mời" / "Từ chối" trên sổ).
 * Sổ "Sổ đặt lịch" trên Google Sheets vẫn là NGUỒN SỰ THẬT (chủ studio sửa tay được, Apps Script dùng lại được).
 *
 *  · Đọc (boot / find / verify): trả ngay từ bộ nhớ (stale-while-revalidate), quá hạn thì làm mới ngầm.
 *      BA (MEMBERS, TRIAL, B0B, ⚙️ 2): 30 s · điểm danh SESSION LOG: 60 s · sổ: 15 s · cron giữ BA + sổ ≤ 1 phút.
 *  · Ghi (book / change / invite / decline) — GHI SAU, lượt gọi không đợi Google:
 *      xếp hàng trong DO → kiểm từng lượt bằng BỘ NHỚ (BA ≤ 90 s, TRIAL trong bộ nhớ, sổ = bản sheet ⊕ nhật ký)
 *      → sửa sổ trong bộ nhớ → lưu MỘT mục nhật ký 'j:…' vào storage của DO (bền) → mới trả lời.
 *  · flush() chạy ngầm sau ~150 ms: gom mọi mục đang chờ thành MỘT lệnh spreadsheets.batchUpdate (tất cả hoặc không).
 *      Lỗi → giữ nguyên các mục, thử lại bằng alarm sau 1, 2, 5, 15, 30, 60 s… Lần gửi trước không rõ kết quả → đọc sổ,
 *      mục nào đã có mã yêu cầu (rid) trên sheet thì bỏ qua → không bao giờ ghi trùng.
 *  · Đợi quá 25 s mà chưa tới lượt kiểm → he_thong_ban (như tryLock(28 s) của Apps Script).
 *  · Đếm tìm tên / sai mã / khoá máy / khoá tên: bộ nhớ + storage của DO (DO bị dọn khỏi RAM cũng không mất).
 *  · Ảnh chụp danh sách sang tab _dữ liệu: tối đa 10 phút/lần, chạy ngầm.
 */
import * as C from './core.js';
import { LT } from './core.js';
import { Sheets, q, colLetter, appendRows, setCell } from './sheets.js';
import { Signer } from './crypto.js';

const DEFAULTS = {
  TTL_BA: 30e3, TTL_MARKS: 60e3, TTL_LOG: 15e3,     // lượt XEM: làm mới ngầm khi dữ liệu cũ hơn
  WRITE_BA_FRESH: 90e3,                             // lượt GHI: MEMBERS / B0B / ⚙️ 2 không cũ hơn 90 s (cron làm mới mỗi phút)
  BA_STALE_MAX: 15 * 60e3,                          // … nhưng Google lỗi đúng lúc làm mới → vẫn dùng bản đang có nếu chưa quá 15 phút
  BA_FAIL_SKIP: 20e3,                               // vừa làm mới BA lỗi trong 20 s → lượt ghi dùng ngay bản cũ, không đợi Google lần nữa
  TRIAL_FRESH: 3e3,                                 // sau mỗi lô ghi: đọc lại TRIAL ngầm nếu bản trong bộ nhớ cũ hơn 3 s
  LOCK_WAIT: 25e3,                                  // đợi tới lượt kiểm tối đa
  BATCH_MAX: 25,                                    // tối đa số lượt kiểm chung một lô (một lần ghi storage)
  FLUSH_MS: 150,                                    // gom các lượt ghi trong ~150 ms thành một lệnh batchUpdate
  FLUSH_MAX: 100,                                   // tối đa số mục nhật ký mỗi lệnh batchUpdate
  BACKSTOP_MS: 3e3,                                 // alarm dự phòng: DO bị dọn khỏi RAM trước khi kịp flush → alarm đánh thức
  BACKOFF: [1e3, 2e3, 5e3, 15e3, 30e3, 60e3],       // flush lỗi → thử lại sau (tối đa 60 s một lần)
  AFTER_TIMEOUT: 60e3,                              // lệnh ghi bị HẾT GIỜ: Google có thể vẫn đang xử lý → đợi ≥ 60 s mới đọc lại + gửi lại
  RECENT_MS: 120e3,                                 // mục vừa lên sheet vẫn được phủ lên các lượt đọc cũ ít nhất 120 s
  READ_MS: 8e3, WRITE_MS: 20e3,                     // hạn giờ gọi Google
  META_RECHECK: 5 * 60e3,                           // chưa có tab "Lịch coach": dò lại tên tab sau bấy lâu
  META_TRY: 30e3,                                   // … và không thử dò quá một lần mỗi bấy lâu (Google lỗi thì không dò dồn)
  BUSY_WINDOW: 30 * 60e3,                           // cron làm mới điểm danh đều khi 30 phút gần đây có người dùng
  IDLE_REFRESH: 10 * 60e3                           // … còn không thì 10 phút một lần
};
const ST_IDX = LT.LOG_HEAD.indexOf('Trạng thái'), NOTE_IDX = LT.LOG_HEAD.indexOf('Ghi chú');
const STATUS_COL = LT.LOG_COL + ST_IDX;             // cột L
const NOTE_COL = LT.LOG_COL + NOTE_IDX;             // cột N
/* Dạng ảnh chụp sổ lưu storage ('snap:log' — các dòng ĐÃ ĐỌC, không phải mảng ô). Đổi trường của C.logRows thì tăng số này:
   2 = có coach + loại gói (luật mỗi coach một suất, 18/10). DO thức dậy với ảnh chụp dạng cũ thì bỏ ảnh đó, đọc sổ mới từ Google
   trước lượt đầu (không thì vài giây đầu sau deploy các dòng cũ thiếu coach → luật coach không chặn được). */
const SNAP_LOG_FMT = 2;
/* Dạng meta (tên các tab) lưu 'snap:meta'. 2 = có out.sched (tab "Lịch coach", 19/10). Meta dạng cũ → dò lại tên tab. Chưa có tab
   "Lịch coach" thì cứ cfg.META_RECHECK dò lại một lần (chủ studio tạo tab sau khi deploy vẫn được nhận, không cần deploy lại). */
const META_FMT = 2;

function msg(e) { return String(e && e.message || e).slice(0, 120); }
/** băm FNV-1a 32 bit (dấu nội dung cho kênh live — chỉ so bằng, không bảo mật) */
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + s.length; }

/* ================================================================== */
/* Nhật ký ghi sau (journal) — hàm thuần                               */
/*                                                                      */
/* Mục: {seq, rid, kind: 'book'|'change', at, appends: [dòng 17 cột như C.logRow],                       */
/*       moves: [{code, kh, date, h, note, add}]} — move = dòng cũ của lượt đổi → "Đã đổi" + ghi chú.    */
/* Dòng cũ được tìm theo KHOÁ (mã phiếu, mã KH, ngày, giờ, đang "Đã đặt") lúc ghi, không theo số dòng.   */
/* ================================================================== */

/** Khoá storage của một mục: 'j:000000000042' (đệm số 0 để list() trả đúng thứ tự). */
export function jKey(seq) { return 'j:' + String(seq).padStart(12, '0'); }
/** Ghi chú dòng cũ khi đổi buổi: giữ ghi chú đang có, nối "Đổi sang …" (giống ltApiChange_). */
export function joinNote(note, add) { return (note ? note + ' · ' : '') + add; }
/** Dòng r có đúng là buổi m đang "Đã đặt" không. */
function isTarget(r, m) { return r.st === LT.ON && r.code === m.code && r.kh === m.kh && r.date === m.date && r.h === m.h; }

/**
 * Sổ trong bộ nhớ = bản đọc từ sheet ⊕ các mục nhật ký (theo seq). Gọi lại bao nhiêu lần cũng ra một kết quả:
 * mục có rid đã nằm trên sheet thì bỏ qua CẢ mục (batchUpdate tất cả hoặc không: dòng mới và dòng "Đã đổi" luôn đi cùng nhau).
 */
export function overlay(base, entries) {
  const rows = base.rows.slice(), rids = new Set();
  let next = (base.lastRow || LT.LOG_HEAD_ROW) + 1;
  rows.forEach(r => { if (r.rid) rids.add(r.rid); if (r.row >= next) next = r.row + 1; });
  const L = { at: base.at, rt: base.rt, seq: base.seq || 0, rows: rows, rids: rids, next: next, lastRow: base.lastRow,
              partial: !!base.partial, weeks: base.weeks || null };
  entries.slice().sort((a, b) => a.seq - b.seq).forEach(e => applyEntry(L, e));
  return L;
}
/** Áp một mục vào sổ trong bộ nhớ (dùng chung cho overlay và lượt ghi → hai đường luôn ra cùng kết quả). */
export function applyEntry(L, e) {
  if (L.rids.has(e.rid)) return false;
  e.moves.forEach(m => {
    for (let i = L.rows.length - 1; i >= 0; i--) {
      const r = L.rows[i];
      if (isTarget(r, m)) { L.rows[i] = Object.assign({}, r, { st: LT.MOVED, note: joinNote(r.note, m.add) }); return; }
    }
  });
  e.appends.forEach(a => { L.rows.push(C.logRowParsed(a, L.next++)); });
  L.rids.add(e.rid);
  return true;
}

/**
 * Lập lệnh ghi cho các mục chờ trên một bản sổ (view): mục đã có rid trên sổ → done (bỏ qua);
 * còn lại → sent: dòng cũ của lượt đổi → updateCells (Trạng thái + Ghi chú); dòng mới → MỘT appendCells theo thứ tự seq.
 * Đổi một buổi vừa thêm trong cùng lô (đặt rồi đổi trước khi kịp ghi) → sửa luôn dòng sắp thêm, không cần số dòng.
 * rowUpdates > 0 hoặc missing > 0 trên bản sổ không đọc mới → nơi gọi phải đọc sổ mới rồi lập lại.
 */
export function planFlush(entries, view, logId) {
  const rows = view.rows.map(r => ({ row: r.row, week: r.week, code: r.code, kh: r.kh, date: r.date, h: r.h, st: r.st, note: r.note,
                                    coach: r.coach, kind: r.kind, arr: null, dirty: false }));
  const rids = new Set(view.rids || []);
  if (!view.rids) view.rows.forEach(r => { if (r.rid) rids.add(r.rid); });
  const plan = { done: [], sent: [], arrs: [], warns: [], requests: [], rows: rows, rowUpdates: 0, missing: 0 };
  entries.forEach(e => {
    if (rids.has(e.rid)) { plan.done.push(e); return; }
    e.moves.forEach(m => {
      let hit = null, n = 0;
      for (let i = rows.length - 1; i >= 0; i--) if (isTarget(rows[i], m)) { if (!hit) hit = rows[i]; n++; }
      if (!hit) { plan.missing++; plan.warns.push({ warn: 'move_target_missing' }); return; }
      if (n > 1) plan.warns.push({ warn: 'move_target_many', n: n });      /* nhiều dòng trùng khoá → sửa dòng mới nhất */
      hit.st = LT.MOVED;
      hit.note = joinNote(hit.note, m.add);
      if (hit.arr) { hit.arr[ST_IDX] = LT.MOVED; hit.arr[NOTE_IDX] = hit.note; }
      else hit.dirty = true;
    });
    e.appends.forEach(a => {
      const arr = a.slice(), p = C.logRowParsed(arr, 0);
      plan.arrs.push(arr);
      rows.push({ row: 0, week: p.week, code: p.code, kh: p.kh, date: p.date, h: p.h, st: p.st, note: p.note, coach: p.coach, kind: p.kind, arr: arr, dirty: false });
    });
    rids.add(e.rid);
    plan.sent.push(e);
  });
  rows.forEach(r => {
    if (!r.dirty) return;
    plan.rowUpdates++;
    plan.requests.push(setCell(logId, r.row, STATUS_COL, LT.MOVED), setCell(logId, r.row, NOTE_COL, r.note));
  });
  if (plan.arrs.length) plan.requests.push(appendRows(logId, plan.arrs));
  return plan;
}

export class BookingCore {
  /**
   * deps: {storage (DurableObjectStorage hoặc bản giả), env {BA_ID, OUT_ID, SA_JSON, LT_SECRET?},
   *        fetch?, now? (đồng hồ, test dùng đồng hồ giả), waitUntil?, opts? (đè DEFAULTS), log? (nhật ký vận hành)}
   */
  constructor(deps) {
    this.storage = deps.storage;
    this.env = deps.env || {};
    this.now = deps.now || (() => Date.now());
    this.waitUntil = deps.waitUntil || null;
    this.cfg = Object.assign({}, DEFAULTS, deps.opts || {});
    this.logf = deps.log || (o => { try { console.log(JSON.stringify(o)); } catch (e) { /* bỏ qua */ } });
    this.g = deps.sheets || new Sheets({ saJson: this.env.SA_JSON, fetch: deps.fetch || ((u, i) => fetch(u, i)), readMs: this.cfg.READ_MS, writeMs: this.cfg.WRITE_MS });
    this.BA = String(this.env.BA_ID || '');
    this.OUT = String(this.env.OUT_ID || '');
    this.meta = null;                 // {ba: {members, log, trial, b0b, cfg}, out: {log, logId, data}}
    this.ba = null;                   // {at, members, layout, trialRows, closed, cap, trialRt}
    this.mk = null;                   // {at, layout, cols} — 3 cột SESSION LOG
    this.base = null;                 // sổ như trên sheet (lần đọc gần nhất): {at, rt, seq, rows, lastRow, partial?, weeks?}
    this.log = null;                  // base ⊕ nhật ký — mọi lượt xem / kiểm dùng bản này: {…, rids, next}
    this.jPending = [];               // mục nhật ký chưa lên sheet (theo seq)
    this.jRecent = [];                // mục vừa lên sheet: còn phủ lên các lượt đọc bắt đầu trước khi ghi xong
    this.seq = 0;                     // số thứ tự mục nhật ký
    this.readSeq = 0;                 // số thứ tự lượt đọc sổ (lượt đọc cũ hơn bản đang có thì bỏ)
    this.flushP = null; this.flushT = null;
    this.fails = 0; this.retryAt = 0; this.lastError = ''; this.lastFlushAt = 0; this.alarmAt = 0;
    this.inflight = new Map();
    this.bg = new Set();
    this.cache = new Map();
    this.signerP = null;
    this.wq = []; this.wBusy = false;
    this.lastActivity = 0;
    this.lastPurge = 0;
    this.baFailAt = 0;                // lần làm mới BA gần nhất bị lỗi (Date.now)
    this.metaTryAt = 0;               // lần dò lại tên tab gần nhất (getMeta)
    this.notify = deps.notify || null; // kênh live (live.js): gọi khi phòng của tuần đang đặt vừa đổi
    this.sigLog = ''; this.sigBa = '';  // dấu của sổ / BA lần đọc trước — đọc lại khác thì báo kênh live
  }

  /* ---------------- vòng đời ---------------- */

  /** Nạp ảnh chụp + nhật ký đã lưu (DO vừa thức dậy vẫn trả lời ngay, rồi làm mới ngầm; mục chưa ghi thì ghi tiếp). */
  async init() {
    try {
      const got = await this.storage.get(['snap:meta', 'snap:ba', 'snap:mk', 'snap:log']);
      const g = k => (got && typeof got.get === 'function') ? got.get(k) : (got ? got[k] : undefined);
      if (g('snap:meta')) this.meta = g('snap:meta');
      if (g('snap:ba')) this.ba = g('snap:ba');
      if (g('snap:mk')) this.mk = g('snap:mk');
      const sl = g('snap:log');
      if (sl && sl.fmt === SNAP_LOG_FMT) this.base = Object.assign({}, sl, { seq: 0 });
    } catch (e) { /* không có ảnh chụp thì đọc từ Google ở lượt đầu */ }
    try {
      const all = await this.storage.list({ prefix: 'j:' }), list = [];
      /* không biết lần chạy trước đã gửi tới đâu → uncertain: flush sẽ đọc sổ, tìm rid trước khi gửi */
      all.forEach(v => { if (v && v.rid && Array.isArray(v.appends)) list.push(Object.assign({}, v, { moves: v.moves || [], durable: true, uncertain: true })); });
      list.sort((a, b) => a.seq - b.seq);
      this.jPending = list;
      this.seq = list.length ? list[list.length - 1].seq : 0;
    } catch (e) { /* storage lỗi: không có mục nào để ghi tiếp */ }
    try { if (typeof this.storage.getAlarm === 'function') this.alarmAt = Number(await this.storage.getAlarm()) || 0; } catch (e) { /* bỏ qua */ }
    this.rebuildLog();
    this.sigLog = this.logSig(); this.sigBa = this.baSig();   /* sheet đổi trong lúc DO ngủ → lần đọc đầu sau khi thức vẫn báo */
    if (this.jPending.length) { this.kick(); this.ensureAlarm(Date.now() + this.cfg.BACKSTOP_MS); }
  }
  /** Việc chạy ngầm: giữ lại để test chờ được (idle) và để DO không bỏ dở. */
  bgRun(p) {
    const w = Promise.resolve(p).catch(() => {}).finally(() => this.bg.delete(w));
    this.bg.add(w);
    if (this.waitUntil) { try { this.waitUntil(w); } catch (e) { /* bỏ qua */ } }
    return w;
  }
  /** Test: đợi mọi việc đang chạy (việc ngầm, hàng đợi, flush đang chờ / đang chạy). Không đợi lượt thử lại theo alarm. */
  async idle() {
    for (;;) {
      if (this.bg.size) { await Promise.all([...this.bg]); continue; }
      if (this.wBusy || this.wq.length || this.flushP || this.flushT) { await new Promise(r => setTimeout(r, 1)); continue; }
      return;
    }
  }
  once(key, fn) {
    let p = this.inflight.get(key);
    if (!p) { p = Promise.resolve().then(fn).finally(() => this.inflight.delete(key)); this.inflight.set(key, p); }
    return p;
  }
  persist(key, val) { this.bgRun(this.storage.put(key, val)); }

  /* ---------------- đọc Google ---------------- */

  async getMeta() {
    const mm = this.meta;
    if (mm) {
      /* meta dạng cũ, hoặc chưa có tab "Lịch coach" và đã lâu chưa dò: dò lại NGẦM (lượt này vẫn dùng bản đang có — Google lỗi lúc dò
         không làm hỏng lượt gọi); tối đa 30 s một lần thử */
      const stale = mm.fmt !== META_FMT || (!(mm.out && mm.out.sched) && Date.now() - (mm.rt || 0) >= this.cfg.META_RECHECK);
      if (stale && Date.now() - this.metaTryAt >= this.cfg.META_TRY) { this.metaTryAt = Date.now(); this.bgRun(this.once('meta', () => this.fetchMeta())); }
      return mm;
    }
    return this.once('meta', () => this.fetchMeta());
  }
  async fetchMeta() {
    if (!this.BA || !this.OUT) throw new Error('thieu_BA_ID');
    const [ba, out] = await Promise.all([this.g.meta(this.BA), this.g.meta(this.OUT)]);
    const by = (list, name) => { const n = name.normalize('NFC'); const s = list.find(x => String(x.title).normalize('NFC') === n); return s || null; };
    const members = by(ba, 'MEMBERS');
    if (!members) throw new Error('thieu_MEMBERS');
    const cfg = ba.find(x => C.isCfgTab(x.title)) || null;
    const logT = by(out, LT.LOG);
    if (!logT) throw new Error('thieu_tab_so_dat_lich');
    const dataT = by(out, LT.DATA), schedT = by(out, LT.SCHED);
    const m = {
      fmt: META_FMT, rt: Date.now(),
      ba: { members: members.title, log: (by(ba, 'SESSION LOG') || {}).title || null, trial: (by(ba, 'TRIAL') || {}).title || null,
            b0b: (by(ba, 'B0B') || {}).title || null, cfg: cfg ? cfg.title : null },
      out: { log: logT.title, logId: logT.id, data: dataT ? dataT.title : null, sched: schedT ? schedT.title : null }
    };
    this.meta = m;
    this.persist('snap:meta', m);
    return m;
  }
  /** Tên tab đổi giữa chừng → Google trả 400 "Unable to parse range": quên tên cũ rồi thử lại một lần. */
  async withMeta(fn) {
    const m = await this.getMeta();
    try { return await fn(m); }
    catch (e) {
      if (e && e.status === 400 && !e.ambiguous) { this.meta = null; return fn(await this.getMeta()); }
      throw e;
    }
  }

  /** MEMBERS + TRIAL + B0B + ⚙️ 2 + đầu SESSION LOG: một lượt batchGet; cùng lúc tab "Lịch coach" của file Lịch tập tuần (lịch nhận
      khách của coach — đọc cùng nhịp với BA, lượt ghi kiểm bằng cùng bản). Lỗi → nhớ lúc lỗi (getBA dùng bản cũ, không đợi lại). */
  async loadBA() {
    try { return await this.loadBAOnce(); }
    catch (e) { this.baFailAt = Date.now(); throw e; }
  }
  async loadBAOnce() {
    return this.withMeta(async m => {
      const t = m.ba, ranges = [q(t.members)], idx = {};
      if (t.log) { idx.log = ranges.length; ranges.push(q(t.log) + '!A1:Z10'); }
      if (t.trial) { idx.trial = ranges.length; ranges.push(q(t.trial)); }
      if (t.b0b) { idx.b0b = ranges.length; ranges.push(q(t.b0b) + '!A1:AD150'); }
      if (t.cfg) { idx.cfg = ranges.length; ranges.push(q(t.cfg) + '!A1:H60'); }
      const [v, sv] = await Promise.all([this.g.batchGet(this.BA, ranges),
        m.out.sched ? this.g.batchGet(this.OUT, [q(m.out.sched) + '!A1:AD400']) : Promise.resolve(null)]);
      const ba = {
        at: this.now(),
        members: C.memberRows(v[0]),
        layout: idx.log !== undefined ? C.marksLayout(v[idx.log]) : null,
        trialRows: idx.trial !== undefined ? v[idx.trial].map(r => r.slice(0, 30)) : [],
        closed: idx.b0b !== undefined ? C.closuresFrom(v[idx.b0b]) : {},
        cap: idx.cfg !== undefined ? C.capFrom(v[idx.cfg]) : LT.CAP,
        sched: sv ? C.schedFrom(sv[0]) : {},
        trialRt: Date.now()
      };
      this.ba = ba;
      this.trialsMemo = null; this.personsMemo = null;
      this.persist('snap:ba', ba);
      this.watchBa();
      return ba;
    });
  }
  /** Chỉ TRIAL (khách tập thử chiếm chỗ). Giữ nguyên phần còn lại của BA. */
  async loadTrials() {
    return this.withMeta(async m => {
      if (!m.ba.trial || !this.ba) return this.ba;
      const v = (await this.g.batchGet(this.BA, [q(m.ba.trial)]))[0];
      const ba = Object.assign({}, this.ba, { trialRows: v.map(r => r.slice(0, 30)), trialRt: Date.now() });
      this.ba = ba;
      this.trialsMemo = null; this.personsMemo = null;
      this.persist('snap:ba', ba);
      this.watchBa();
      return ba;
    });
  }
  /** SESSION LOG: chỉ 3 cột (ngày, học viên, trạng thái) từ dòng dữ liệu đầu — sheet có ~5000 dòng công thức. */
  async loadMarks() {
    const ba = await this.getBA();
    const L = ba.layout;
    if (!L) { this.mk = { at: this.now(), layout: null, cols: [[], [], []] }; return this.mk; }
    return this.withMeta(async m => {
      const t = q(m.ba.log), r = c => t + '!' + colLetter(c + 1) + L.first + ':' + colLetter(c + 1);
      const cols = await this.g.batchGet(this.BA, [r(L.cD), r(L.cN), r(L.cS)], 'COLUMNS');
      const mk = { at: this.now(), layout: L, cols: cols.map(c => c[0] || []) };
      this.mk = mk; this.marksMemo = null;
      this.persist('snap:mk', mk);
      return mk;
    });
  }

  /* ---------------- sổ đặt lịch: bản sheet ⊕ nhật ký ---------------- */

  /** Đọc sổ B4:R (tiêu đề + mọi dòng) — luôn là một lượt đọc MỚI (flush cần lượt đọc bắt đầu sau lần ghi trước). */
  async readLogFresh() {
    const seq = ++this.readSeq;
    return this.withMeta(async m => {
      const v = (await this.g.batchGet(this.OUT, [q(m.out.log) + '!B' + LT.LOG_HEAD_ROW + ':R']))[0];
      if (!C.logHeadOk(v[0] || [])) throw new Error('so_dat_lich_doi_cot');
      const first = LT.LOG_HEAD_ROW + 1, body = v.slice(1);
      return { at: this.now(), rt: Date.now(), seq: seq, rows: C.logRows(body, first), lastRow: LT.LOG_HEAD_ROW + body.length };
    });
  }
  /** Làm mới sổ (xem / cron): đọc rồi phủ nhật ký lên. */
  async loadLog() {
    this.setBase(await this.readLogFresh());
    return this.log;
  }
  /** Nhận bản sổ vừa đọc. Lượt đọc bắt đầu trước bản đang có thì bỏ (không lùi về dữ liệu cũ hơn). */
  setBase(B) {
    if (this.base && (B.seq || 0) < (this.base.seq || 0)) return false;
    this.base = B;
    this.rebuildLog();
    this.persistBase();
    this.watchLog();
    return true;
  }

  /* ---------------- kênh live: phòng vừa đổi → báo mọi trang hỏi lại (live.js) ---------------- */

  changed() { if (this.notify) try { this.notify(); } catch (e) { /* kênh live không bao giờ làm hỏng lượt ghi */ } }
  /** Dấu sổ của tuần đang đặt: không tính số dòng (dòng vừa ghi trong bộ nhớ và dòng đọc lại từ sheet phải ra cùng dấu) */
  logSig() {
    if (!this.log) return '';
    const k = C.weekCtx(this.now()).key;
    return fnv(this.log.rows.filter(r => r.week === k).map(r => [r.code, r.ver, r.date, r.h, r.coach, r.kind, r.st, r.act, r.note, r.rid, r.kh].join('|')).sort().join('\n'));
  }
  /** Dấu phần BA làm đổi phòng của mọi người: ngày nghỉ · sức chứa · lịch coach · tập thử */
  baSig() { const b = this.ba; return b ? fnv(JSON.stringify([b.closed, b.cap, b.sched || {}, b.trialRows])) : ''; }
  watchLog() { const s = this.logSig(); if (this.sigLog && s && s !== this.sigLog) this.changed(); if (s) this.sigLog = s; }
  watchBa() { const s = this.baSig(); if (this.sigBa && s && s !== this.sigBa) this.changed(); if (s) this.sigBa = s; }
  /**
   * Dựng lại sổ trong bộ nhớ = base ⊕ (mục vừa lên sheet + mục đang chờ).
   * Mục vừa lên sheet chỉ được bỏ khi base là lượt đọc BẮT ĐẦU SAU lúc ghi xong và đã qua RECENT_MS —
   * nhờ vậy một lượt đọc chậm (bắt đầu trước khi ghi) không bao giờ làm một lượt đặt đã xác nhận biến mất.
   */
  rebuildLog() {
    const now = Date.now(), seq = this.base ? this.base.seq || 0 : 0;
    this.jRecent = this.jRecent.filter(e => !(now - e.doneAt >= this.cfg.RECENT_MS && seq > e.doneSeq));
    this.log = this.base ? overlay(this.base, this.jRecent.concat(this.jPending)) : null;
  }
  /** Ảnh chụp sổ lưu storage = base ⊕ mục vừa lên sheet (KHÔNG gồm mục đang chờ — chúng có khoá 'j:' riêng). */
  async persistBaseNow() {
    if (!this.base) return;
    const L = overlay(this.base, this.jRecent), ctx = C.weekCtx(this.now()), keep = {}, weeks = [];
    /* chỉ lưu dòng của tuần trước / này / sau (đủ để kiểm + dựng state khi DO vừa thức) — giữ dưới giới hạn 2 MB/khoá */
    [C.addDays(ctx.mon, -7), ctx.mon, C.addDays(ctx.mon, 7)].forEach(d => { const k = C.weekKey(d); keep[k] = 1; weeks.push(k); });
    await this.storage.put('snap:log', { fmt: SNAP_LOG_FMT, at: L.at, rt: 0, seq: 0, lastRow: L.lastRow, rows: L.rows.filter(r => keep[r.week]), partial: true, weeks: weeks });
  }
  persistBase() { this.bgRun(this.persistBaseNow()); }

  /**
   * Dữ liệu cho lượt XEM: có thì trả ngay, quá TTL thì làm mới ngầm. maxAge (lượt GHI): quá thì đợi đọc mới —
   * riêng khi Google đang lỗi mà bản đang có chưa quá BA_STALE_MAX thì dùng bản đó (MEMBERS hiếm khi đổi trong vài phút):
   * vừa lỗi trong BA_FAIL_SKIP → dùng ngay, không đợi; còn không thì thử đọc một lần, lỗi mới lui về bản cũ.
   */
  async getBA(maxAge) {
    const b = this.ba, age = b ? this.now() - b.at : Infinity;
    const usable = !!b && (maxAge === undefined || age <= maxAge);
    if (!usable) {
      const stale = !!b && age <= this.cfg.BA_STALE_MAX;
      if (stale && Date.now() - this.baFailAt < this.cfg.BA_FAIL_SKIP) { this.bgRun(this.once('ba', () => this.loadBA())); return b; }
      try { return await this.once('ba', () => this.loadBA()); }
      catch (e) {
        if (!stale) throw e;
        this.logf({ a: 'ba', warn: 'dung_ban_cu', ageS: Math.round(age / 1000), e: msg(e) });
        return b;
      }
    }
    if (age > this.cfg.TTL_BA) this.bgRun(this.once('ba', () => this.loadBA()));
    return b;
  }
  async getMarksData() {
    const m = this.mk;
    if (!m) return this.once('mk', () => this.loadMarks());
    if (this.now() - m.at > this.cfg.TTL_MARKS) this.bgRun(this.once('mk', () => this.loadMarks()));
    return m;
  }
  /** Sổ cho lượt XEM. Bản nạp từ storage (partial: chỉ các tuần gần đây) vẫn đủ để dựng state — dùng ngay rồi đọc lại ngầm. */
  async getLog() {
    const L = this.log;
    if (!L) { await this.once('log', () => this.loadLog()); return this.log; }
    if (L.partial || this.now() - L.at > this.cfg.TTL_LOG) this.bgRun(this.once('log', () => this.loadLog()));
    return L;
  }
  /** Sổ cho lượt GHI: chỉ đợi Google khi DO chưa từng có sổ (hoặc ảnh chụp không có tuần đang đặt). */
  async ensureLog(ctx) {
    const L = this.log;
    if (L && !(L.partial && L.weeks && L.weeks.indexOf(ctx.key) < 0)) {
      if (L.partial) this.bgRun(this.once('log', () => this.loadLog()));   /* ảnh chụp sau khi DO thức: dùng ngay, đọc đủ ngầm */
      return L;
    }
    await this.once('log', () => this.loadLog());
    if (!this.log) throw new Error('khong_doc_duoc_so');
    return this.log;
  }

  persons(ctx, ba) {
    const m = this.personsMemo;
    if (m && m.ba === ba && m.today === ctx.today) return m.list;
    const list = C.persons(ba.members, ctx.today);
    this.personsMemo = { ba: ba, today: ctx.today, list: list };
    return list;
  }
  trialsFor(ctx, ba) {
    const m = this.trialsMemo;
    if (m && m.ba === ba && m.key === ctx.key) return m.v;
    const v = C.trialsFrom(ba.trialRows, ctx.days);
    this.trialsMemo = { ba: ba, key: ctx.key, v: v };
    return v;
  }
  async marksFor(ctx) {
    const mk = await this.getMarksData();
    const m = this.marksMemo;
    if (m && m.mk === mk && m.key === ctx.key) return m.v;
    const v = C.marksFrom(mk.cols, ctx.days);
    this.marksMemo = { mk: mk, key: ctx.key, v: v };
    return v;
  }

  /* ---------------- bộ đếm có hạn (thay CacheService) ---------------- */

  async cGet(key) {
    let e = this.cache.get(key);
    if (e === undefined) { e = (await this.storage.get('c:' + key)) || null; this.cache.set(key, e); }
    if (!e) return null;
    if (e.exp <= this.now()) { this.cache.set(key, null); this.bgRun(this.storage.delete('c:' + key)); return null; }
    return e.v;
  }
  async cPut(key, v, ttlS) { const e = { v: String(v), exp: this.now() + ttlS * 1000 }; this.cache.set(key, e); await this.storage.put('c:' + key, e); }
  async cDel(key) { this.cache.set(key, null); await this.storage.delete('c:' + key); }
  async bump(key, ttlS) { const n = (Number(await this.cGet(key)) || 0) + 1; await this.cPut(key, String(n), ttlS); return n; }

  async signer() {
    if (!this.signerP) {
      this.signerP = (async () => {
        let s = this.env.LT_SECRET;
        if (!s) {
          s = await this.storage.get('secret');
          if (!s) { s = crypto.randomUUID() + crypto.randomUUID(); await this.storage.put('secret', s); }
        }
        return new Signer(s);
      })();
    }
    return this.signerP;
  }

  /* ---------------- API ---------------- */

  /** Điểm vào RPC: trả {out, ms}. */
  async handle(p) {
    const t0 = Date.now();
    const out = await this.api(p);
    return { out: out, ms: Date.now() - t0 };
  }
  async api(p) {
    const now = this.now();
    try {
      p = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
      const a = String(p.action || '');
      if (a === 'lt_ping') return Object.assign({ ok: true, now: now }, this.health());
      if (!C.devOk(p.dev)) return { ok: false, error: 'thieu_may', now: now };
      this.lastActivity = Date.now();
      if (a === 'lt_boot') return await this.apiBoot(p, now);
      if (a === 'lt_find') return await this.apiFind(p, now);
      if (a === 'lt_verify') return await this.apiVerify(p, now);
      if (a === 'lt_book') return await this.apiBook(p, now);
      if (a === 'lt_change') return await this.apiChange(p, now);
      if (a === 'lt_invite') return await this.apiInvite(p, now);
      if (a === 'lt_decline') return await this.apiDecline(p, now);
      return { ok: false, error: 'unknown_action', now: now };
    } catch (e) {
      return { ok: false, error: 'loi_he_thong', detail: msg(e), now: now };
    }
  }
  /** lt_ping: tình trạng nhật ký ghi sau (không có dữ liệu cá nhân). */
  health() {
    const p = this.jPending;
    return { pending: p.length, oldestMs: p.length ? Math.max(0, Date.now() - p[0].at) : 0,
             lastFlushAt: this.lastFlushAt || 0, lastError: this.lastError || '' };
  }

  /** Mở trang: mã nhớ máy hợp lệ → state của hội viên; không có → thông tin tuần. */
  async apiBoot(p, now) {
    const ctx = C.weekCtx(now);
    if (p.tok) {
      const t = await (await this.signer()).tokRead(p.tok, p.dev, now);
      if (t) {
        const ba = await this.getBA(), list = this.persons(ctx, ba), me = C.findPerson(list, t.k);
        if (me) return this.loadState(ctx, me, list, ba);
        return C.publicOf(ctx, 'het_goi', ba.closed, ba.sched, list);
      }
      return this.publicNow(ctx, 'het_phien');
    }
    return this.publicNow(ctx, '');
  }
  /** Thông tin tuần cho màn công khai: "còn khung đặt được" xét theo lịch nhận khách của coach các hội viên còn gói (C.anyOpen). */
  async publicNow(ctx, why) {
    const ba = await this.getBA();
    return C.publicOf(ctx, why, ba.closed, ba.sched, this.persons(ctx, ba));
  }

  /** Tìm tên gõ tới đâu ra tới đó (từ 1 ký tự, có dấu hay không dấu đều được; luật ở C.findRank). Trả tối đa 6 người,
      nhiều hơn thì kèm more: true để trang nhắc gõ thêm. */
  async apiFind(p, now) {
    /* đếm theo khung 10 phút cố định (khoá theo mốc khung): đang bị chặn mà gõ tiếp cũng không kéo dài khoá quá hết khung */
    if ((await this.bump('lt:q:' + p.dev + ':' + Math.floor(now / 6e5), 600)) > LT.FIND_MAX) return { ok: false, error: 'cham_lai', now: now };
    const words = C.nameKey(String(p.q || '').slice(0, 60)).split(' ').filter(x => !!x);
    if (!words.length) return { ok: true, now: now, results: [] };
    const ctx = C.weekCtx(now), res = C.findAll(words, this.persons(ctx, await this.getBA()));
    const sg = await this.signer(), out = [];
    for (const x of res.slice(0, LT.FIND_TOP)) out.push({ id: await sg.idOf(x.key), short: x.short, coach: x.coach });
    return res.length > LT.FIND_TOP ? { ok: true, now: now, results: out, more: true } : { ok: true, now: now, results: out };
  }

  /** Xác minh 4 số cuối điện thoại. Sai 5 lần → khoá MÁY 15 phút; sai 20 lần/giờ trên một tên → khoá TÊN 15 phút. */
  async apiVerify(p, now) {
    const lockKey = 'lt:lk:' + p.dev, until = Number(await this.cGet(lockKey)) || 0;
    if (until > now) return { ok: false, error: 'khoa', until: until, now: now };
    const ctx = C.weekCtx(now), ba = await this.getBA(), list = this.persons(ctx, ba), sg = await this.signer(), id = String(p.id || '');
    let me = null;
    for (const x of list) { if (await sg.idOf(x.key) === id) { me = x; break; } }
    if (!me) return { ok: false, error: 'khong_thay', now: now };
    const myId = await sg.idOf(me.key), memKey = 'lt:lm:' + myId, mUntil = Number(await this.cGet(memKey)) || 0;
    if (mUntil > now) return { ok: false, error: 'khoa', until: mUntil, now: now };
    if (me.phone.length < 4) return { ok: false, error: 'chua_co_sdt', now: now };
    const pin = C.digits(p.pin);
    if (pin.length !== 4 || pin !== me.phone.slice(-4)) {
      const n = await this.bump('lt:fd:' + p.dev, LT.LOCK_S), m = await this.bump('lt:fm:' + myId, 3600);
      if (m >= LT.MEMBER_FAILS) { await this.cPut(memKey, String(now + LT.LOCK_S * 1000), LT.LOCK_S); await this.cDel('lt:fm:' + myId); }
      if (n >= LT.FAILS) {
        await this.cPut(lockKey, String(now + LT.LOCK_S * 1000), LT.LOCK_S);
        await this.cDel('lt:fd:' + p.dev);
        return { ok: false, error: 'khoa', until: now + LT.LOCK_S * 1000, now: now };
      }
      return { ok: false, error: 'sai_ma', left: LT.FAILS - n, now: now };
    }
    await this.cDel('lt:fd:' + p.dev);
    const ttl = p.remember ? LT.REMEMBER : LT.SESSION, st = await this.loadState(ctx, me, list, ba);
    st.tok = await sg.tokMake(me.key, p.dev, ttl, now);
    st.tokExp = now + ttl;
    return st;
  }

  /** Dựng state cho một hội viên (lượt XEM). */
  async loadState(ctx, person, list, ba) {
    const L = await this.getLog(), marks = await this.marksFor(ctx);
    if (list) this.maybeSnapshot(list, ba.cap, ctx.now);
    return this.withIds(C.stateOf(ctx, person, C.envOf(ctx, L.rows, this.trialsFor(ctx, ba), ba.closed, ba.cap, ba.sched), C.mine(L.rows, person, ctx), marks, list));
  }
  /** Gói 1:2: danh sách bạn để mời mang Mã KH → đổi sang id (như lt_find) trước khi trả cho trình duyệt. */
  async withIds(st) {
    if (st && st.duo && st.duo.peers) {
      const sg = await this.signer(), out = [];
      for (const x of st.duo.peers) out.push({ id: await sg.idOf(x.key), short: x.short, call: x.call });
      st.duo.peers = out;
    }
    return st;
  }

  /** Ghi danh sách hội viên còn hiệu lực sang tab _dữ liệu (để "Bảng lịch tập" liệt kê "Chưa đặt lịch"). Tối đa 10 phút/lần. */
  maybeSnapshot(list, cap, now) {
    if (this.snapBusy) return;
    this.snapBusy = true;
    this.bgRun((async () => {
      try {
        if (await this.cGet('lt:snap')) return;
        await this.cPut('lt:snap', '1', 600);
        try {
          const m = await this.getMeta();
          if (!m.out.data) return;
          const t = q(m.out.data), rows = C.snapshotRows(list), data = [{ range: t + '!B1:B2', values: [[cap], [C.stamp(now)]] }];
          if (rows.length) data.push({ range: t + '!A5:G' + (4 + rows.length), values: rows });
          await this.g.valuesClear(this.OUT, [t + '!A5:G']);
          await this.g.valuesUpdate(this.OUT, data);
        } catch (e) { await this.cDel('lt:snap'); }
      } finally { this.snapBusy = false; }
    })());
  }

  /** Đặt lịch (đặt mới hoặc thêm buổi). p: {tok, dev, rid, week, picks: [{date, h}]} */
  async apiBook(p, now) {
    const pre = await this.pre(p, now);
    if (pre.out) return pre.out;
    const picks = (Array.isArray(p.picks) ? p.picks : []).slice(0, 8).map(x => ({ date: String(x && x.date || ''), h: Number(x && x.h) }));
    return this.enqueue(pre, p, 'book', { picks: picks });
  }
  /** Đổi buổi. p: {tok, dev, rid, week, from: {date, h}, to: {date, h}} */
  async apiChange(p, now) {
    const pre = await this.pre(p, now);
    if (pre.out) return pre.out;
    const from = { date: String(p.from && p.from.date || ''), h: Number(p.from && p.from.h) };
    const to = { date: String(p.to && p.to.date || ''), h: Number(p.to && p.to.h) };
    return this.enqueue(pre, p, 'change', { from: from, to: to });
  }
  /** Gói 1:2 · mời một bạn cùng coach vào buổi đang chờ ghép. p: {tok, dev, rid, week, date, h, to: id ('' = huỷ lời mời)} */
  async apiInvite(p, now) {
    const pre = await this.pre(p, now);
    if (pre.out) return pre.out;
    const slot = { date: String(p.date || ''), h: Number(p.h) }, id = String(p.to || '');
    let to = null;
    if (id) {
      const sg = await this.signer();
      for (const x of pre.list) { if (await sg.idOf(x.key) === id) { to = x; break; } }
      if (!to) return { ok: false, error: 'khong_hop_le', why: 'nguoi_moi', now: now };
    }
    return this.enqueue(pre, p, 'invite', { slot: slot, to: to });
  }
  /** Gói 1:2 · không nhận lời mời ở khung date/h. p: {tok, dev, rid, week, date, h} */
  async apiDecline(p, now) {
    const pre = await this.pre(p, now);
    if (pre.out) return pre.out;
    return this.enqueue(pre, p, 'decline', { slot: { date: String(p.date || ''), h: Number(p.h) } });
  }

  /** Kiểm phiên + mã yêu cầu + hội viên (dữ liệu BA không cũ hơn 90 s) — trước khi xếp hàng. */
  async pre(p, now) {
    const t = await (await this.signer()).tokRead(p.tok, p.dev, now);
    if (!t || !t.k) return { out: { ok: false, error: 'het_phien', now: now } };
    const rid = String(p.rid || '');
    if (!C.ridOk(rid)) return { out: { ok: false, error: 'khong_hop_le', why: 'rid', now: now } };
    const ctx = C.weekCtx(now), ba = await this.getBA(this.cfg.WRITE_BA_FRESH), list = this.persons(ctx, ba), me = C.findPerson(list, t.k);
    if (!me) return { out: { ok: false, error: 'het_goi', now: now } };
    return { rid: rid, me: me, list: list, closed: ba.closed, cap: ba.cap, sched: ba.sched };
  }

  /* ---------------- hàng đợi kiểm + ghi nhật ký ---------------- */

  enqueue(pre, p, kind, args) {
    return new Promise(resolve => {
      const job = { pre: pre, p: p, kind: kind, args: args, resolve: resolve, t0: Date.now() };
      /* đợi quá LOCK_WAIT mà chưa tới lượt → trả he_thong_ban đúng hạn (trình duyệt gửi lại cùng mã, an toàn) */
      job.timer = setTimeout(() => {
        const i = this.wq.indexOf(job);
        if (i >= 0) { this.wq.splice(i, 1); resolve({ ok: false, error: 'he_thong_ban', now: this.now() }); }
      }, this.cfg.LOCK_WAIT);
      this.wq.push(job);
      this.drain();
    });
  }
  async drain() {
    if (this.wBusy) return;
    this.wBusy = true;
    try {
      while (this.wq.length) {
        if (this.testHold) await this.testHold;             /* test: giả "khoá đang bận" như LockService */
        const batch = this.wq.splice(0, this.cfg.BATCH_MAX), live = [];
        for (const j of batch) {
          clearTimeout(j.timer);
          if (Date.now() - j.t0 > this.cfg.LOCK_WAIT) j.resolve({ ok: false, error: 'he_thong_ban', now: this.now() });
          else live.push(j);
        }
        if (!live.length) continue;
        await this.runBatch(live);
      }
    } finally {
      this.wBusy = false;
      if (this.wq.length) this.drain();
    }
  }

  /**
   * Một lô: kiểm từng lượt theo thứ tự đến bằng bộ nhớ (lượt sau thấy chỗ lượt trước vừa giữ) → MỘT lần ghi storage
   * cho mọi mục mới → trả lời từng lượt. Không gọi Google (trừ khi DO chưa từng có dữ liệu). Không bao giờ ném.
   */
  async runBatch(jobs) {
    const res = new Map(), made = [];
    let ctx = null, ba = null;
    try {
      ba = await this.getBA(this.cfg.WRITE_BA_FRESH);       /* cron giữ BA ≤ 1 phút → thường không đợi */
      ctx = C.weekCtx(this.now());
      await this.ensureLog(ctx);
      for (const j of jobs) {
        try { res.set(j, this.decide(ctx, ba, j, made)); }
        catch (e) { res.set(j, { fail: 'loi_he_thong', detail: msg(e) }); }
      }
      if (made.length) {
        try {
          await this.putEntries(made);                      /* bền trước rồi mới trả lời */
          made.forEach(e => { e.durable = true; });
          this.afterJournal();
          this.changed(); this.sigLog = this.logSig();      /* kênh live: báo ngay; lượt đọc sổ sau đó ra cùng dấu → không báo lại */
        } catch (e) {
          /* storage lỗi: bỏ các mục vừa thêm khỏi bộ nhớ; cả lô trả he_thong_ban (gửi lại cùng mã, an toàn) */
          const set = new Set(made);
          this.jPending = this.jPending.filter(x => !set.has(x));
          this.rebuildLog();
          jobs.forEach(j => res.set(j, { fail: 'he_thong_ban' }));
          this.logf({ a: 'journal', ok: false, e: msg(e) });
        }
      }
    } catch (e) {
      for (const j of jobs) if (!res.has(j)) res.set(j, { fail: 'loi_he_thong', detail: msg(e) });
      if (!ctx) ctx = C.weekCtx(this.now());
      if (!ba) ba = this.ba;
    }
    await this.reply(jobs, res, ctx, ba);
  }
  /** Kiểm một lượt (giống ltLocked_: trùng mã yêu cầu → dup; khác tuần → tuan_doi; bản phiếu cũ → ban_cu; rồi luật đặt / đổi). */
  decide(ctx, ba, j, made) {
    const L = this.log;
    if (L.rids.has(j.pre.rid)) return { ok: true, dup: true };      /* gồm cả mục còn trong nhật ký */
    if (String(j.p.week || '') !== ctx.key) return { error: 'tuan_doi' };
    const env = C.envOf(ctx, L.rows, this.trialsFor(ctx, ba), j.pre.closed, j.pre.cap, j.pre.sched), m = C.mine(L.rows, j.pre.me, ctx);
    if (C.baseStale(j.p.base, m)) return { error: 'ban_cu' };
    const r = j.kind === 'book' ? this.planBook(ctx, j, env, m) : j.kind === 'change' ? this.planChange(ctx, j, env, m, L)
      : j.kind === 'invite' ? this.planInvite(ctx, j, env, m) : this.planDecline(ctx, j, env, m);
    if (!r.entry) return r;
    applyEntry(L, r.entry);
    this.jPending.push(r.entry);
    made.push(r.entry);
    return { ok: true };
  }
  planBook(ctx, j, env, m) {
    const chk = C.checkBook(ctx, j.pre.me, env, m, j.args.picks);
    if (!chk.ok) return chk;
    const ver = m.ver + 1, act = m.sessions.length ? 'Thêm' : 'Đặt', st = C.stamp(ctx.now);
    const arrs = j.args.picks.slice().sort((a, b) => a.date < b.date ? -1 : 1)
      .map(x => C.logRow(m.code, ver, ctx.key, x, j.pre.me, act, '', st, j.pre.rid));
    return { entry: this.newEntry(j.pre.rid, 'book', arrs, []) };
  }
  planChange(ctx, j, env, m, L) {
    const chk = C.checkChange(ctx, j.pre.me, env, m, j.args.from, j.args.to);
    if (!chk.ok) return chk;
    /* gói 1:2 dời buổi đang lẻ vào cặp đang chờ: "Ghép" (không tính lượt đổi), còn lại "Đổi" như trước */
    const act = chk.pair ? LT.PAIR : 'Đổi', cur = chk.cur, row = L.rows.find(x => x.row === cur.row) || {};
    const st = C.stamp(ctx.now), ver = m.ver + 1, add = act + ' sang ' + C.slotLabel(j.args.to);
    const arr = C.logRow(m.code, ver, ctx.key, j.args.to, j.pre.me, act, act + ' từ ' + C.slotLabel(j.args.from), st, j.pre.rid);
    /* dòng cũ: tìm lại theo khoá lúc ghi (số dòng có thể đổi vì chủ studio sửa tay) */
    const move = { code: row.code || m.code, kh: row.kh || j.pre.me.key, date: cur.date, h: cur.h, note: joinNote(cur.note, add), add: add };
    return { entry: this.newEntry(j.pre.rid, 'change', [arr], [move]) };
  }
  planInvite(ctx, j, env, m) {
    const chk = C.checkInvite(ctx, j.pre.me, env, m, j.args.slot, j.args.to);
    if (!chk.ok || chk.noop) return chk.ok ? { ok: true } : chk;
    const arr = C.inviteRow(m.code, m.ver, ctx.key, j.args.slot, j.pre.me, j.args.to, C.stamp(ctx.now), j.pre.rid);
    return { entry: this.newEntry(j.pre.rid, 'invite', [arr], []) };
  }
  planDecline(ctx, j, env, m) {
    const chk = C.checkDecline(ctx, j.pre.me, env, j.args.slot);
    if (!chk.ok || chk.noop) return chk.ok ? { ok: true } : chk;
    const f = chk.from, arr = C.declineRow(m.code, m.ver, ctx.key, j.args.slot, j.pre.me, C.shortOf(f.kh, f.name, j.pre.list), f.kh, C.stamp(ctx.now), j.pre.rid);
    return { entry: this.newEntry(j.pre.rid, 'decline', [arr], []) };
  }
  newEntry(rid, kind, appends, moves) {
    return { seq: ++this.seq, rid: rid, kind: kind, at: Date.now(), appends: appends, moves: moves, durable: false, uncertain: false };
  }
  /** Mọi mục của lô trong MỘT lần put (DO storage: nhiều khoá một lần = nguyên khối). */
  async putEntries(list) {
    const obj = {};
    list.forEach(e => { obj[jKey(e.seq)] = { seq: e.seq, rid: e.rid, kind: e.kind, at: e.at, appends: e.appends, moves: e.moves }; });
    await this.storage.put(obj);
  }
  /** Trả lời: state sau lô (giống ltLocked_: dựng lại sau khi ghi). */
  async reply(jobs, res, ctx, ba) {
    let marks = null;
    for (const j of jobs) {
      const r = res.get(j);
      try {
        if (r.fail) { j.resolve(r.fail === 'loi_he_thong' ? { ok: false, error: 'loi_he_thong', detail: r.detail, now: this.now() } : { ok: false, error: r.fail, now: this.now() }); continue; }
        if (!marks) marks = await this.marksFor(ctx);
        const L = this.log, trials = this.trialsFor(ctx, ba);
        const st = await this.withIds(C.stateOf(ctx, j.pre.me, C.envOf(ctx, L.rows, trials, j.pre.closed, j.pre.cap, j.pre.sched), C.mine(L.rows, j.pre.me, ctx), marks, j.pre.list));
        if (r.dup) st.dup = true;
        if (!r.ok) {
          st.ok = false;
          st.error = r.error;
          if (r.why) st.why = r.why;
          if (r.date) { st.date = r.date; st.h = r.h; }       /* khung bị từ chối → trang gọi đúng tên khung */
          if (r.full) st.full = r.full;
        }
        j.resolve(st);
      } catch (e) {
        j.resolve({ ok: false, error: 'loi_he_thong', detail: msg(e), now: this.now() });
      }
    }
  }
  /** Sau khi mục mới đã bền: hẹn flush (~150 ms), alarm dự phòng, đọc lại TRIAL ngầm. */
  afterJournal() {
    this.kick();
    this.ensureAlarm(Date.now() + this.cfg.BACKSTOP_MS);
    if (this.ba && Date.now() - (this.ba.trialRt || 0) > this.cfg.TRIAL_FRESH) this.bgRun(this.once('tr', () => this.loadTrials()));
  }

  /* ---------------- flush: nhật ký → Google Sheets ---------------- */

  /** Hẹn flush sau FLUSH_MS (gom các lượt ghi đến gần nhau). Đang chờ thử lại sau lỗi thì để alarm lo. */
  kick() {
    if (this.flushT || !this.jPending.some(e => e.durable)) return;
    if (this.retryAt > Date.now()) return;
    if (this.flushP) return;                                 /* đang chạy: xong sẽ tự kick lại */
    this.flushT = setTimeout(() => { this.flushT = null; this.flush(); }, this.cfg.FLUSH_MS);
  }
  /** Một lượt flush chạy một lúc (single-flight). Không bao giờ ném. */
  flush() {
    if (this.flushP) return this.flushP;
    this.flushP = this.flushOnce()
      .catch(e => this.flushFailed(e, []))
      .finally(() => { this.flushP = null; this.kick(); });
    return this.flushP;
  }
  async flushOnce() {
    const entries = this.jPending.filter(e => e.durable).slice(0, this.cfg.FLUSH_MAX);
    if (!entries.length) return;
    const t0 = Date.now(), meta = await this.getMeta(), logId = meta.out.logId;
    let plan = null, read = false;
    /* chỉ thêm dòng (đặt / đổi một buổi cũng đang chờ) và mọi mục chưa từng gửi → ghi thẳng, không cần đọc sổ */
    if (this.base && !entries.some(e => e.uncertain)) {
      plan = planFlush(entries, overlay(this.base, this.jRecent), logId);
      if (plan.rowUpdates || plan.missing || plan.done.length) plan = null;
    }
    /* còn lại: đọc sổ MỚI (bắt đầu sau lần gửi trước) → bỏ mục đã có rid, sửa dòng cũ theo số dòng vừa đọc */
    if (!plan) {
      const fresh = await this.readLogFresh();
      read = true;
      this.setBase(fresh);
      plan = planFlush(entries, fresh, logId);
    }
    let err = null;
    if (plan.requests.length) {
      try { await this.g.batchUpdate(this.OUT, plan.requests); } catch (e) { err = e; }
    }
    if (err) {
      await this.settle(plan.done);
      this.flushFailed(err, plan.sent);
      return;
    }
    this.fails = 0; this.retryAt = 0; this.lastError = ''; this.lastFlushAt = Date.now();
    plan.warns.forEach(w => this.logf(Object.assign({ a: 'flush' }, w)));
    this.capWarn(plan);
    this.logf({ a: 'flush', ok: true, n: plan.sent.length, dup: plan.done.length, rows: plan.arrs.length, upd: plan.rowUpdates, read: read, ms: Date.now() - t0 });
    await this.settle(plan.done.concat(plan.sent));
  }
  /** Mục đã nằm trên sheet: rời hàng chờ, vào danh sách vừa ghi; lưu ảnh chụp sổ (đã gồm chúng) RỒI mới xoá khoá 'j:'. */
  async settle(list) {
    if (!list.length) return;
    const now = Date.now(), set = new Set(list);
    list.forEach(e => { e.doneAt = now; e.doneSeq = this.readSeq; e.uncertain = false; });
    this.jPending = this.jPending.filter(e => !set.has(e));
    this.jRecent = this.jRecent.concat(list);
    this.rebuildLog();
    try {
      await this.persistBaseNow();
      const keys = list.map(e => jKey(e.seq));
      for (let i = 0; i < keys.length; i += 128) await this.storage.delete(keys.slice(i, i + 128));
    } catch (e) {
      /* khoá còn lại thì lần DO thức sau đọc sổ, thấy rid, tự bỏ — không ghi trùng */
      this.logf({ a: 'journal', warn: 'chua_xoa_duoc', e: msg(e) });
    }
  }
  /** Flush lỗi: giữ mục; lỗi không rõ đã ghi chưa → lần sau phải đọc sổ trước; hẹn alarm thử lại. */
  flushFailed(e, sent) {
    /* chỉ lỗi Google nói rõ "chưa xử lý" (4xx, mất mạng trước khi gửi xong…) mới chắc chắn chưa ghi;
       mọi lỗi khác (5xx, hết giờ, đứt mạng, lỗi lạ sau khi gửi) → coi như CÓ THỂ đã ghi */
    if (!(e && e.ambiguous === false)) sent.forEach(x => { x.uncertain = true; });
    if (e && e.status === 400) this.meta = null;            /* tab bị xoá / tạo lại → lần sau dò lại tên + sheetId */
    this.fails++;
    this.lastError = msg(e);
    const B = this.cfg.BACKOFF, step = B[Math.min(this.fails, B.length) - 1];
    const wait = e && e.timeout && e.ambiguous ? Math.max(step, this.cfg.AFTER_TIMEOUT) : step;
    this.retryAt = Date.now() + wait;
    this.bgRun(this.setAlarmAt(this.retryAt));
    this.logf({ a: 'flush', ok: false, e: this.lastError, n: sent.length, retryMs: wait });
  }
  /** Khách tập thử đặt ở nơi khác trong lúc chờ → vẫn nhận (đã trả lời), chỉ ghi cảnh báo nếu khung vượt sức chứa. */
  capWarn(plan) {
    const ba = this.ba;
    if (!ba || !plan.arrs.length) return;
    /* đếm SUẤT coach (luật 18/10), không đếm người: cặp 1:2 cùng coach = một suất */
    const ctx = C.weekCtx(this.now()), room = C.roomOf(plan.rows, ctx, this.trialsFor(ctx, ba)), touched = {};
    plan.rows.forEach(r => { if (r.arr && r.week === ctx.key && r.st === LT.ON && r.h >= 0) touched[r.date + '|' + r.h] = 1; });
    Object.keys(touched).forEach(k => {
      const n = room[k] ? room[k].u : 0;
      if (n > ba.cap) this.logf({ a: 'flush', warn: 'over_cap_after_trial', slot: k, n: n, cap: ba.cap });
    });
  }
  /** Alarm của DO: hẹn giờ bền (DO bị dọn khỏi RAM vẫn được đánh thức). */
  async setAlarmAt(t) {
    this.alarmAt = t;
    if (typeof this.storage.setAlarm === 'function') {
      try { await this.storage.setAlarm(t); return; } catch (e) { /* rơi xuống hẹn giờ trong bộ nhớ */ }
    }
    setTimeout(() => { this.alarm(); }, Math.max(0, t - Date.now()));
  }
  ensureAlarm(t) {
    if (this.alarmAt && this.alarmAt <= t) return;
    this.bgRun(this.setAlarmAt(t));
  }
  /** Điểm vào alarm(): còn mục chờ thì flush (đến sớm hơn hạn thử lại thì hẹn lại đúng hạn). */
  async alarm() {
    this.alarmAt = 0;
    if (!this.jPending.length) return;
    if (this.retryAt > Date.now() + 50) { await this.setAlarmAt(this.retryAt); return; }
    this.retryAt = 0;
    await this.flush();
  }

  /* ---------------- cron mỗi phút: giữ dữ liệu ấm, ghi nốt nhật ký, dọn bộ đếm ---------------- */

  async tick() {
    const now = this.now(), busy = Date.now() - this.lastActivity < this.cfg.BUSY_WINDOW;
    const p = C.parts(now), opening = p.dow === 0 && ((p.hh === 5 && p.mi >= 45) || (p.hh === 6 && p.mi < 30));
    const due = (at, ttl) => !at || now - at > (busy || opening ? ttl : this.cfg.IDLE_REFRESH);
    const jobs = [];
    /* BA + sổ: luôn ≤ 1 phút (lượt ghi kiểm bằng bộ nhớ, không đọc Google) */
    if (!(this.ba && now - this.ba.at <= 55e3)) jobs.push(this.once('ba', () => this.loadBA()));
    if (!(this.log && !this.log.partial && now - this.log.at <= 55e3)) jobs.push(this.once('log', () => this.loadLog()));
    await Promise.allSettled(jobs);
    if (due(this.mk && this.mk.at, 55e3)) await Promise.allSettled([this.once('mk', () => this.loadMarks())]);
    if (this.jPending.length && !this.flushP && Date.now() >= this.retryAt) await this.flush();
    if (Date.now() - this.lastPurge > 6 * 3600e3) { this.lastPurge = Date.now(); await this.purge(); }
    return { ok: true, pending: this.jPending.length };
  }
  async purge() {
    try {
      const all = await this.storage.list({ prefix: 'c:' }), now = this.now(), dead = [];
      all.forEach((v, k) => { if (!v || v.exp <= now) dead.push(k); });
      for (let i = 0; i < dead.length; i += 128) await this.storage.delete(dead.slice(i, i + 128));
      dead.forEach(k => this.cache.delete(k.slice(2)));
    } catch (e) { /* không quan trọng */ }
  }
}
