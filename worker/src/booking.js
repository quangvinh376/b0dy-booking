/**
 * B0DY — Lịch tập tuần · Durable Object "Booking" (một bản duy nhất phục vụ mọi lượt gọi)
 *
 * Hợp đồng API giống hệt ltDoPost_ của backend/LichTuan.gs: lt_ping · lt_boot · lt_find · lt_verify · lt_book · lt_change.
 * Sổ "Sổ đặt lịch" trên Google Sheets vẫn là NGUỒN SỰ THẬT (chủ studio sửa tay được, Apps Script dùng lại được).
 *
 *  · Đọc (boot / find / verify): trả ngay từ bộ nhớ (stale-while-revalidate), quá hạn thì làm mới ngầm.
 *      BA (MEMBERS, TRIAL, B0B, ⚙️ 2): 30 s · điểm danh SESSION LOG: 60 s · sổ: 15 s.
 *  · Ghi (book / change): xếp hàng trong DO → lượt ghi nối nhau, các lượt đến cùng lúc được GOM thành một lô:
 *      đọc sổ mới (đổi buổi: luôn đọc mới; đặt: mới nếu bộ nhớ > 3 s) → kiểm từng lượt theo thứ tự đến
 *      (lượt sau thấy chỗ lượt trước vừa giữ) → MỘT lệnh spreadsheets.batchUpdate (tất cả hoặc không).
 *      Lỗi mạng khi ghi = không rõ đã ghi chưa → đọc lại sổ, tìm mã yêu cầu rồi mới trả lời; không bao giờ ghi lại mù.
 *  · Đợi quá 25 s mà chưa tới lượt → he_thong_ban (như tryLock(28 s) của Apps Script).
 *  · Đếm tìm tên / sai mã / khoá máy / khoá tên: bộ nhớ + storage của DO (DO bị dọn khỏi RAM cũng không mất).
 *  · Ảnh chụp danh sách sang tab _dữ liệu: tối đa 10 phút/lần, chạy ngầm.
 */
import * as C from './core.js';
import { LT } from './core.js';
import { Sheets, q, colLetter, appendRows, setCell } from './sheets.js';
import { Signer } from './crypto.js';

const DEFAULTS = {
  TTL_BA: 30e3, TTL_MARKS: 60e3, TTL_LOG: 15e3,     // làm mới ngầm khi dữ liệu cũ hơn
  WRITE_LOG_FRESH: 3e3,                             // lượt đặt: sổ trong bộ nhớ chỉ được dùng nếu đọc từ sheet chưa quá 3 s
  WRITE_BA_FRESH: 90e3,                             // lượt ghi: MEMBERS / B0B / ⚙️ 2 không cũ hơn 90 s (cron làm mới mỗi phút)
                                                    // — riêng TRIAL (chiếm chỗ) đọc mới trong lô ghi, song song với sổ
  LOCK_WAIT: 25e3,                                  // đợi lượt ghi tối đa
  BATCH_MAX: 25,                                    // tối đa số lượt ghi gom chung một lệnh
  RECONCILE_MS: 2000,                               // sau khi ghi: đọc lại sổ ngầm để khớp số dòng
  BUSY_WINDOW: 30 * 60e3,                           // cron chỉ làm mới đều khi 30 phút gần đây có người dùng
  IDLE_REFRESH: 10 * 60e3                           // … còn không thì 10 phút một lần
};
const STATUS_COL = LT.LOG_COL + LT.LOG_HEAD.indexOf('Trạng thái');   // cột L
const NOTE_COL = LT.LOG_COL + LT.LOG_HEAD.indexOf('Ghi chú');        // cột N

export class BookingCore {
  /**
   * deps: {storage (DurableObjectStorage hoặc bản giả), env {BA_ID, OUT_ID, SA_JSON, LT_SECRET?},
   *        fetch?, now? (đồng hồ, test dùng đồng hồ giả), waitUntil?, opts? (đè DEFAULTS)}
   */
  constructor(deps) {
    this.storage = deps.storage;
    this.env = deps.env || {};
    this.now = deps.now || (() => Date.now());
    this.waitUntil = deps.waitUntil || null;
    this.cfg = Object.assign({}, DEFAULTS, deps.opts || {});
    this.g = deps.sheets || new Sheets({ saJson: this.env.SA_JSON, fetch: deps.fetch || ((u, i) => fetch(u, i)) });
    this.BA = String(this.env.BA_ID || '');
    this.OUT = String(this.env.OUT_ID || '');
    this.meta = null;                 // {ba: {members, log, trial, b0b, cfg}, out: {log, logId, data}}
    this.ba = null;                   // {at, members, layout, trialRows, closed, cap}
    this.mk = null;                   // {at, layout, cols} — 3 cột SESSION LOG
    this.log = null;                  // {at, rows, lastRow}
    this.logVer = 0;                  // tăng mỗi lần sổ trong bộ nhớ đổi (chặn lượt làm mới cũ đè lên)
    this.inflight = new Map();
    this.bg = new Set();
    this.cache = new Map();
    this.signerP = null;
    this.wq = []; this.wBusy = false;
    this.lastActivity = 0;
    this.lastPurge = 0;
    this.reconcileT = null;
  }

  /* ---------------- vòng đời ---------------- */

  /** Nạp ảnh chụp đã lưu (DO vừa thức dậy vẫn trả lời ngay, rồi làm mới ngầm). */
  async init() {
    try {
      const got = await this.storage.get(['snap:meta', 'snap:ba', 'snap:mk', 'snap:log']);
      const g = k => (got && typeof got.get === 'function') ? got.get(k) : (got ? got[k] : undefined);
      if (g('snap:meta')) this.meta = g('snap:meta');
      if (g('snap:ba')) this.ba = g('snap:ba');
      if (g('snap:mk')) this.mk = g('snap:mk');
      if (g('snap:log')) this.log = g('snap:log');
    } catch (e) { /* không có ảnh chụp thì đọc từ Google ở lượt đầu */ }
  }
  /** Việc chạy ngầm: giữ lại để test chờ được (idle) và để DO không bỏ dở. */
  bgRun(p) {
    const w = Promise.resolve(p).catch(() => {}).finally(() => this.bg.delete(w));
    this.bg.add(w);
    if (this.waitUntil) { try { this.waitUntil(w); } catch (e) { /* bỏ qua */ } }
    return w;
  }
  async idle() { while (this.bg.size || this.wBusy || this.wq.length) { await Promise.all([...this.bg]); await new Promise(r => setTimeout(r, 0)); } }
  once(key, fn) {
    let p = this.inflight.get(key);
    if (!p) { p = Promise.resolve().then(fn).finally(() => this.inflight.delete(key)); this.inflight.set(key, p); }
    return p;
  }
  persist(key, val) { this.bgRun(this.storage.put(key, val)); }

  /* ---------------- đọc Google ---------------- */

  async getMeta() {
    if (this.meta) return this.meta;
    return this.once('meta', async () => {
      if (!this.BA || !this.OUT) throw new Error('thieu_BA_ID');
      const [ba, out] = await Promise.all([this.g.meta(this.BA), this.g.meta(this.OUT)]);
      const by = (list, name) => { const n = name.normalize('NFC'); const s = list.find(x => String(x.title).normalize('NFC') === n); return s || null; };
      const members = by(ba, 'MEMBERS');
      if (!members) throw new Error('thieu_MEMBERS');
      const cfg = ba.find(x => C.isCfgTab(x.title)) || null;
      const logT = by(out, LT.LOG);
      if (!logT) throw new Error('thieu_tab_so_dat_lich');
      const dataT = by(out, LT.DATA);
      const m = {
        ba: { members: members.title, log: (by(ba, 'SESSION LOG') || {}).title || null, trial: (by(ba, 'TRIAL') || {}).title || null,
              b0b: (by(ba, 'B0B') || {}).title || null, cfg: cfg ? cfg.title : null },
        out: { log: logT.title, logId: logT.id, data: dataT ? dataT.title : null }
      };
      this.meta = m;
      this.persist('snap:meta', m);
      return m;
    });
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

  /** MEMBERS + TRIAL + B0B + ⚙️ 2 + đầu SESSION LOG: một lượt batchGet. */
  async loadBA() {
    return this.withMeta(async m => {
      const t = m.ba, ranges = [q(t.members)], idx = {};
      if (t.log) { idx.log = ranges.length; ranges.push(q(t.log) + '!A1:Z10'); }
      if (t.trial) { idx.trial = ranges.length; ranges.push(q(t.trial)); }
      if (t.b0b) { idx.b0b = ranges.length; ranges.push(q(t.b0b) + '!A1:AD150'); }
      if (t.cfg) { idx.cfg = ranges.length; ranges.push(q(t.cfg) + '!A1:H60'); }
      const v = await this.g.batchGet(this.BA, ranges);
      const ba = {
        at: this.now(),
        members: C.memberRows(v[0]),
        layout: idx.log !== undefined ? C.marksLayout(v[idx.log]) : null,
        trialRows: idx.trial !== undefined ? v[idx.trial].map(r => r.slice(0, 30)) : [],
        closed: idx.b0b !== undefined ? C.closuresFrom(v[idx.b0b]) : {},
        cap: idx.cfg !== undefined ? C.capFrom(v[idx.cfg]) : LT.CAP,
        trialRt: Date.now()
      };
      this.ba = ba;
      this.trialsMemo = null; this.personsMemo = null;
      this.persist('snap:ba', ba);
      return ba;
    });
  }
  /** Chỉ TRIAL (lô ghi cần số khách tập thử mới nhất). Giữ nguyên phần còn lại của BA. */
  async loadTrials() {
    return this.withMeta(async m => {
      if (!m.ba.trial) return this.ba;
      const v = (await this.g.batchGet(this.BA, [q(m.ba.trial)]))[0];
      const ba = Object.assign({}, this.ba, { trialRows: v.map(r => r.slice(0, 30)), trialRt: Date.now() });
      this.ba = ba;
      this.trialsMemo = null; this.personsMemo = null;
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
  /** Sổ đặt lịch B4:R (tiêu đề + mọi dòng). guarded: chỉ nhận kết quả nếu sổ trong bộ nhớ không đổi trong lúc đọc. */
  async loadLog(guarded) {
    const ver = this.logVer;
    const L = await this.withMeta(async m => {
      const v = (await this.g.batchGet(this.OUT, [q(m.out.log) + '!B' + LT.LOG_HEAD_ROW + ':R']))[0];
      if (!C.logHeadOk(v[0] || [])) throw new Error('so_dat_lich_doi_cot');
      const first = LT.LOG_HEAD_ROW + 1, body = v.slice(1);
      return { at: this.now(), rows: C.logRows(body, first), lastRow: LT.LOG_HEAD_ROW + body.length };
    });
    /* lượt làm mới ngầm: có lượt ghi bắt đầu / kết thúc trong lúc đọc → kết quả có thể thiếu dòng vừa ghi → bỏ */
    if (guarded && (ver !== this.logVer || this.writing)) return this.log || L;
    L.rt = Date.now();
    L.readLastRow = L.lastRow;                    /* dòng > readLastRow = dòng vừa thêm trong bộ nhớ, số dòng chưa xác nhận */
    this.log = L; this.logVer++;
    this.persistLog();
    return L;
  }
  persistLog() {
    const L = this.log;
    if (!L) return;
    /* chỉ lưu dòng của tuần trước / này / sau (đủ dựng state khi DO vừa thức) — giữ dưới giới hạn 2 MB/khoá;
       lượt ghi luôn đọc lại sổ đầy đủ trước khi kiểm (partial) */
    const ctx = C.weekCtx(this.now()), keep = {};
    [C.addDays(ctx.mon, -7), ctx.mon, C.addDays(ctx.mon, 7)].forEach(d => { keep[C.weekKey(d)] = 1; });
    this.persist('snap:log', { at: L.at, rt: 0, lastRow: L.lastRow, rows: L.rows.filter(r => keep[r.week]), partial: true });
  }

  /** Dữ liệu cho lượt XEM: có thì trả ngay, quá TTL thì làm mới ngầm. maxAge (lượt GHI): quá thì đợi đọc mới. */
  async getBA(maxAge) {
    const b = this.ba, age = b ? this.now() - b.at : Infinity;
    const usable = !!b && (maxAge === undefined || age <= maxAge);
    if (!usable) return this.once('ba', () => this.loadBA());
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
    if (!L) return this.once('log', () => this.loadLog(true));
    if (L.partial || this.now() - L.at > this.cfg.TTL_LOG) this.bgRun(this.once('log', () => this.loadLog(true)));
    return L;
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
      if (a === 'lt_ping') return { ok: true, now: now };
      if (!C.devOk(p.dev)) return { ok: false, error: 'thieu_may', now: now };
      this.lastActivity = Date.now();
      if (a === 'lt_boot') return await this.apiBoot(p, now);
      if (a === 'lt_find') return await this.apiFind(p, now);
      if (a === 'lt_verify') return await this.apiVerify(p, now);
      if (a === 'lt_book') return await this.apiBook(p, now);
      if (a === 'lt_change') return await this.apiChange(p, now);
      return { ok: false, error: 'unknown_action', now: now };
    } catch (e) {
      return { ok: false, error: 'loi_he_thong', detail: String(e && e.message || e).slice(0, 120), now: now };
    }
  }

  /** Mở trang: mã nhớ máy hợp lệ → state của hội viên; không có → thông tin tuần. */
  async apiBoot(p, now) {
    const ctx = C.weekCtx(now);
    if (p.tok) {
      const t = await (await this.signer()).tokRead(p.tok, p.dev, now);
      if (t) {
        const ba = await this.getBA(), list = this.persons(ctx, ba), me = C.findPerson(list, t.k);
        if (me) return this.loadState(ctx, me, list, ba);
        return C.publicOf(ctx, 'het_goi', ba.closed);
      }
      return C.publicOf(ctx, 'het_phien', (await this.getBA()).closed);
    }
    return C.publicOf(ctx, '', (await this.getBA()).closed);
  }

  /** Tìm tên: cần ít nhất 2 chữ (tên đệm + tên), có dấu hay không dấu đều được. Trả tối đa 5 người. */
  async apiFind(p, now) {
    if ((await this.bump('lt:q:' + p.dev, 600)) > LT.FIND_MAX) return { ok: false, error: 'cham_lai', now: now };
    const words = C.nameKey(String(p.q || '').slice(0, 60)).split(' ').filter(x => !!x);
    if (words.length < 2) return { ok: true, now: now, results: [], need: 2 };
    const ctx = C.weekCtx(now), list = this.persons(ctx, await this.getBA()), res = [];
    list.forEach(x => { if (C.match(words, x.toks)) res.push(x); });
    res.sort((a, b) => a.short.localeCompare(b.short, 'vi'));
    const sg = await this.signer(), out = [];
    for (const x of res.slice(0, 5)) out.push({ id: await sg.idOf(x.key), short: x.short, coach: x.coach });
    return { ok: true, now: now, results: out };
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
    return C.stateOf(ctx, person, C.envOf(ctx, L.rows, this.trialsFor(ctx, ba), ba.closed, ba.cap), C.mine(L.rows, person, ctx), marks);
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

  /** Kiểm phiên + mã yêu cầu + hội viên (dữ liệu BA không cũ hơn 10 s) — trước khi xếp hàng ghi. */
  async pre(p, now) {
    const t = await (await this.signer()).tokRead(p.tok, p.dev, now);
    if (!t || !t.k) return { out: { ok: false, error: 'het_phien', now: now } };
    const rid = String(p.rid || '');
    if (!C.ridOk(rid)) return { out: { ok: false, error: 'khong_hop_le', why: 'rid', now: now } };
    const ctx = C.weekCtx(now), ba = await this.getBA(this.cfg.WRITE_BA_FRESH), me = C.findPerson(this.persons(ctx, ba), t.k);
    if (!me) return { out: { ok: false, error: 'het_goi', now: now } };
    return { rid: rid, me: me, closed: ba.closed, cap: ba.cap };
  }

  /* ---------------- hàng đợi ghi ---------------- */

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

  /** Một lô ghi: đọc mới → kiểm từng lượt → một lệnh batchUpdate → trả lời từng lượt. Không bao giờ ném. */
  async runBatch(jobs) {
    this.writing = true;
    try { await this.runBatchInner(jobs); }
    finally { this.writing = false; this.logVer++; }
  }
  async runBatchInner(jobs) {
    const res = new Map();
    let ctx, ba, wrote = false;
    try {
      await this.getBA(this.cfg.WRITE_BA_FRESH);
      /* đổi buổi: luôn đọc sổ mới (số dòng phải đúng); đặt: dùng bộ nhớ nếu vừa đọc từ sheet chưa quá 3 s.
         TRIAL đọc mới cùng lúc (song song, một nhịp mạng) — khách tập thử vừa đặt cũng chiếm chỗ. */
      const fresh = jobs.some(j => j.kind === 'change') ? -1 : this.cfg.WRITE_LOG_FRESH;
      const needLog = !this.log || this.log.partial || Date.now() - (this.log.rt || 0) > fresh;
      const needTr = Date.now() - (this.ba.trialRt || 0) > this.cfg.WRITE_LOG_FRESH;
      await Promise.all([needLog ? this.readLogNow() : null, needTr ? this.loadTrials() : null]);
      ba = this.ba;
      ctx = C.weekCtx(this.now());
      const meta = await this.getMeta(), requests = [], planned = [];
      for (const j of jobs) {
        const L = this.log, trials = this.trialsFor(ctx, ba);
        let r;
        if (L.rows.some(x => x.rid === j.pre.rid)) r = { ok: true, dup: true };
        else if (String(j.p.week || '') !== ctx.key) r = { error: 'tuan_doi' };
        else {
          const env = C.envOf(ctx, L.rows, trials, j.pre.closed, j.pre.cap), m = C.mine(L.rows, j.pre.me, ctx);
          r = j.kind === 'book' ? this.planBook(ctx, j, env, m, requests, meta) : this.planChange(ctx, j, env, m, requests, meta);
          if (r.ok) planned.push(j);
        }
        res.set(j, r);
      }
      if (requests.length) {
        try {
          await this.g.batchUpdate(this.OUT, requests);
          wrote = true;
          this.logVer++;
          this.scheduleReconcile();
        } catch (e) {
          wrote = true;                               /* từ đây sổ trong bộ nhớ = sổ vừa đọc lại (hoặc null) */
          /* không rõ đã ghi chưa (hoặc chắc chắn chưa ghi) → đọc lại sổ, quyết theo mã yêu cầu */
          let L = null;
          try { L = await this.readLogNow(); } catch (e2) { this.log = null; this.logVer++; }
          for (const j of planned) {
            if (!(L && L.rows.some(x => x.rid === j.pre.rid))) res.set(j, { fail: 'he_thong_ban' });
          }
        }
      }
    } catch (e) {
      for (const j of jobs) if (!res.has(j) || res.get(j).ok) res.set(j, { fail: 'loi_he_thong', detail: String(e && e.message || e).slice(0, 120) });
      if (!wrote) { this.log = null; this.logVer++; }   /* bỏ các dòng đã thêm vào bộ nhớ mà chưa kịp ghi */
      if (!ctx) ctx = C.weekCtx(this.now());
      if (!ba) ba = this.ba;
    }
    /* trả lời: state sau lô ghi (giống ltLocked_: đọc lại sổ sau khi ghi) */
    let marks = null;
    for (const j of jobs) {
      const r = res.get(j);
      try {
        if (r.fail) { j.resolve(r.fail === 'loi_he_thong' ? { ok: false, error: 'loi_he_thong', detail: r.detail, now: this.now() } : { ok: false, error: r.fail, now: this.now() }); continue; }
        if (!marks) marks = await this.marksFor(ctx);
        const L = this.log, trials = this.trialsFor(ctx, ba);
        const st = C.stateOf(ctx, j.pre.me, C.envOf(ctx, L.rows, trials, j.pre.closed, j.pre.cap), C.mine(L.rows, j.pre.me, ctx), marks);
        if (r.dup) st.dup = true;
        if (!r.ok) {
          st.ok = false;
          st.error = r.error;
          if (r.why) st.why = r.why;
          if (r.full) st.full = r.full;
        }
        j.resolve(st);
      } catch (e) {
        j.resolve({ ok: false, error: 'loi_he_thong', detail: String(e && e.message || e).slice(0, 120), now: this.now() });
      }
    }
  }
  /** Đọc sổ ngay (trong lô ghi — không ai ghi xen được). */
  async readLogNow() { return this.loadLog(false); }
  planBook(ctx, j, env, m, requests, meta) {
    const chk = C.checkBook(ctx, j.pre.me, env, m, j.args.picks);
    if (!chk.ok) return chk;
    const ver = m.ver + 1, act = m.sessions.length ? 'Thêm' : 'Đặt', st = C.stamp(ctx.now);
    const arrs = j.args.picks.slice().sort((a, b) => a.date < b.date ? -1 : 1)
      .map(x => C.logRow(m.code, ver, ctx.key, x, j.pre.me, act, '', st, j.pre.rid));
    requests.push(appendRows(meta.out.logId, arrs));
    this.memAppend(arrs);
    return { ok: true };
  }
  planChange(ctx, j, env, m, requests, meta) {
    const chk = C.checkChange(ctx, j.pre.me, env, m, j.args.from, j.args.to);
    if (!chk.ok) return chk;
    const cur = chk.cur, L = this.log, row = L.rows.find(x => x.row === cur.row);
    /* buổi vừa thêm trong CÙNG lô (chưa có số dòng thật) → để lượt sau (sổ đã đọc lại) xử lý */
    if (cur.row > (L.readLastRow || 0)) return { fail: 'he_thong_ban' };
    /* dòng sắp sửa phải đúng là buổi đó (sổ vừa đọc mới trong lô; vẫn kiểm để không bao giờ ghi nhầm dòng) */
    if (!row || row.code !== m.code || row.date !== cur.date || row.h !== cur.h || row.st !== LT.ON || row.kh !== j.pre.me.key) {
      return { fail: 'loi_he_thong', detail: 'so_dat_lich_doi_dong' };
    }
    const st = C.stamp(ctx.now), ver = m.ver + 1, from = j.args.from, to = j.args.to;
    const note = (cur.note ? cur.note + ' · ' : '') + 'Đổi sang ' + C.slotLabel(to);
    const arr = C.logRow(m.code, ver, ctx.key, to, j.pre.me, 'Đổi', 'Đổi từ ' + C.slotLabel(from), st, j.pre.rid);
    requests.push(setCell(meta.out.logId, cur.row, STATUS_COL, LT.MOVED), setCell(meta.out.logId, cur.row, NOTE_COL, note), appendRows(meta.out.logId, [arr]));
    row.st = LT.MOVED; row.note = note;
    this.memAppend([arr]);
    return { ok: true };
  }
  /** Cập nhật sổ trong bộ nhớ ngay khi lập lệnh ghi (lượt sau trong cùng lô thấy chỗ đã giữ). */
  memAppend(arrs) {
    const L = this.log;
    arrs.forEach(a => { L.lastRow++; L.rows.push(C.logRowParsed(a, L.lastRow)); });
    this.logVer++;
    this.persistLog();
  }
  /** Sau khi ghi: đọc lại sổ ngầm (khớp số dòng thật + nhận chỗ chủ studio sửa tay). */
  scheduleReconcile() {
    if (this.reconcileT) return;
    this.reconcileT = this.bgRun(new Promise(r => setTimeout(r, this.cfg.RECONCILE_MS)).then(() => {
      this.reconcileT = null;
      return this.once('log', () => this.loadLog(true));
    }));
  }

  /* ---------------- cron mỗi phút: giữ dữ liệu ấm, dọn bộ đếm ---------------- */

  async tick() {
    const now = this.now(), busy = Date.now() - this.lastActivity < this.cfg.BUSY_WINDOW;
    const p = C.parts(now), opening = p.dow === 0 && ((p.hh === 5 && p.mi >= 45) || (p.hh === 6 && p.mi < 30));
    const due = (at, ttl) => !at || now - at > (busy || opening ? ttl : this.cfg.IDLE_REFRESH);
    const jobs = [];
    if (due(this.ba && this.ba.at, 55e3)) jobs.push(this.once('ba', () => this.loadBA()));
    if (due(this.log && !this.log.partial && this.log.at, 55e3)) jobs.push(this.once('log', () => this.loadLog(true)));
    await Promise.allSettled(jobs);
    if (due(this.mk && this.mk.at, 55e3)) await Promise.allSettled([this.once('mk', () => this.loadMarks())]);
    if (Date.now() - this.lastPurge > 6 * 3600e3) { this.lastPurge = Date.now(); await this.purge(); }
    return { ok: true };
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
