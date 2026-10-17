/**
 * Google giả cho test Worker: OAuth token (kiểm chữ ký JWT RS256 thật) + Sheets API v4 (meta, values:batchGet,
 * :batchUpdate appendCells/updateCells, values:batchUpdate, values:batchClear) chạy trên bảng tính giả của
 * test/gas_env.js — cùng dữ liệu Apps Script đọc, nên so được từng byte.
 *
 * Giá trị trả về như Google thật với UNFORMATTED_VALUE + SERIAL_NUMBER: ô Date → số serial theo lịch của file,
 * ô {$d}/{$t} (fixture thật) → serial / phần lẻ của ngày, cuối hàng và cuối bảng bỏ ô trống.
 */
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const { fmtDate } = require('../../test/gas_env.js');

export function serialOfIso(iso, hm) {
  const a = iso.split('-').map(Number), t = (hm || '00:00').split(':').map(Number);
  return Date.UTC(a[0], a[1] - 1, a[2], t[0], t[1]) / 864e5 + 25569;
}
function toApi(v, tz) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const s = fmtDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
    const [d, t] = s.split(' ');
    const [hh, mm, ss] = t.split(':').map(Number);
    return serialOfIso(d) + (hh * 3600 + mm * 60 + ss) / 86400;
  }
  if (typeof v === 'object' && v.$d) return serialOfIso(v.$d);
  if (typeof v === 'object' && v.$t) { const [h, m] = v.$t.split(':').map(Number); return (h * 60 + m) / 1440; }
  return v;
}
function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** "'Tên tab'!B4:R" → {title, r1, c1, r2, c2} (r2/c2 = null: tới hết). Cả tab: không có "!". */
export function parseA1(a1) {
  let title, rest = null, m = a1.match(/^'((?:[^']|'')*)'(?:!(.*))?$/);
  if (m) { title = m[1].replace(/''/g, "'"); rest = m[2] === undefined ? null : m[2]; }
  else { const i = a1.indexOf('!'); title = i < 0 ? a1 : a1.slice(0, i); rest = i < 0 ? null : a1.slice(i + 1); }
  if (rest === null) return { title, r1: 1, c1: 1, r2: null, c2: null };
  const p = rest.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!p) throw Object.assign(new Error('Unable to parse range: ' + a1), { status: 400 });
  const c1 = colNum(p[1]), r1 = p[2] ? +p[2] : 1;
  const c2 = p[3] ? colNum(p[3]) : c1, r2 = p[3] ? (p[4] ? +p[4] : null) : (p[2] ? +p[2] : null);
  return { title, r1, c1, r2, c2 };
}

export class FakeGoogle {
  /** files: {spreadsheetId: Spreadsheet (gas_env)} · publicKey: khoá công khai để kiểm JWT */
  constructor(files, opts) {
    opts = opts || {};
    this.files = files;
    this.publicKey = opts.publicKey || null;
    this.tokens = new Set();
    this.n = 0;
    this.calls = { token: 0, meta: 0, get: 0, batchUpdate: 0, values: 0, clear: 0 };
    this.delay = opts.delay || null;          // (kind) => ms
    this.failWrite = null;                    // một lần: 'before' | 'after' | 'status500' | 'timeout' (Google ghi muộn) | 'timeout_drop'
    this.writeStatus = 0;                     // mọi lệnh ghi trả mã này cho tới khi đặt lại 0 (vd 403: file chỉ share quyền xem)
    this.hangMs = 200;                        // 'timeout*': Google giữ lệnh ghi bấy lâu (máy khách bỏ đợi trước đó)
    this.failRead = 0;                        // số lần lỗi mạng tiếp theo cho lượt đọc
    this.staleReads = false;                  // true: lượt đọc chụp dữ liệu lúc NHẬN yêu cầu rồi mới trễ (đọc chậm, dữ liệu cũ)
    this.down = false;                        // true: Google sập — mọi lượt gọi Sheets lỗi mạng
    this.updates = [];                        // mỗi lệnh batchUpdate đã áp dụng: số request trong lệnh
    this.ids = new Map();
    let id = 100;
    Object.values(files).forEach(ss => ss.getSheets().forEach(sh => { this.ids.set(sh, id++); }));
    this.fetch = this.fetch.bind(this);
  }
  sheetById(ss, sid) { return ss.getSheets().find(sh => this.ids.get(sh) === sid) || null; }
  sheetByTitle(ss, title) { return ss.getSheets().find(sh => sh.getName() === title) || null; }

  /** Như fetch thật: signal abort → ném AbortError ngay, nhưng phía "Google" vẫn xử lý tiếp (lệnh ghi có thể tới muộn). */
  async fetch(url, init) {
    init = init || {};
    const sig = init.signal;
    if (sig && sig.aborted) throw abortError();
    const work = this.handle(url, init);
    if (!sig) return work;
    work.catch(() => {});
    return new Promise((resolve, reject) => {
      const on = () => reject(abortError());
      sig.addEventListener('abort', on, { once: true });
      work.then(v => { sig.removeEventListener('abort', on); resolve(v); }, e => { sig.removeEventListener('abort', on); reject(e); });
    });
  }
  async handle(url, init) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.host === 'oauth2.googleapis.com') return this.token(String(init.body || ''));
    if (u.host !== 'sheets.googleapis.com') throw new TypeError('fetch failed: host ' + u.host);
    const auth = (init.headers && (init.headers.authorization || init.headers.Authorization)) || '';
    if (!this.tokens.has(auth.replace(/^Bearer /, ''))) return json({ error: { code: 401, message: 'bad token' } }, 401);
    const m = u.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
    const ss = m && this.files[decodeURIComponent(m[1])];
    if (!ss) return json({ error: { code: 404 } }, 404);
    const tail = m[2], body = init.body ? JSON.parse(init.body) : null;
    const kind = tail === '' ? 'meta' : tail === '/values:batchGet' ? 'get' : tail === ':batchUpdate' ? 'batchUpdate' : tail === '/values:batchUpdate' ? 'values' : tail === '/values:batchClear' ? 'clear' : 'other';
    this.calls[kind] = (this.calls[kind] || 0) + 1;
    const write = kind === 'batchUpdate' || kind === 'values' || kind === 'clear';
    if (this.down) throw new TypeError('fetch failed (Google sập)');
    if (method === 'GET' && kind === 'get' && this.staleReads && !(this.failRead > 0)) {
      const out = this.getValues(ss, u);       /* chụp lúc nhận yêu cầu */
      if (this.delay) await sleep(this.delay(kind));
      return out;
    }
    if (this.delay) await sleep(this.delay(kind));
    if (!write && this.failRead > 0) { this.failRead--; throw new TypeError('fetch failed (read)'); }
    if (write && this.writeStatus) return json({ error: { code: this.writeStatus, message: 'test: lỗi ghi cố định' } }, this.writeStatus);
    if (write && this.failWrite) {
      const mode = this.failWrite; this.failWrite = null;
      if (mode === 'before') throw new TypeError('fetch failed (write, chưa ghi)');
      if (mode === 'status500') return json({ error: { code: 500 } }, 500);
      if (mode === 'after') { this.apply(ss, kind, body); throw new TypeError('fetch failed (write, ĐÃ ghi)'); }
      if (mode === 'timeout') { await sleep(this.hangMs); this.apply(ss, kind, body); return json({ ok: true }); }
      if (mode === 'timeout_drop') { await sleep(this.hangMs); return json({ error: { code: 503 } }, 503); }
    }
    try {
      if (method === 'GET' && kind === 'meta') return json({ sheets: ss.getSheets().map(sh => ({ properties: { sheetId: this.ids.get(sh), title: sh.getName() } })) });
      if (method === 'GET' && kind === 'get') return this.getValues(ss, u);
      if (method === 'POST' && write) { this.apply(ss, kind, body); return json({ ok: true }); }
    } catch (e) {
      return json({ error: { code: e.status || 500, message: e.message } }, e.status || 500);
    }
    return json({ error: { code: 400, message: 'test: không hỗ trợ ' + tail } }, 400);
  }
  getValues(ss, u) {
    try {
      const ranges = u.searchParams.getAll('ranges'), major = u.searchParams.get('majorDimension') || 'ROWS';
      if (u.searchParams.get('valueRenderOption') !== 'UNFORMATTED_VALUE' || u.searchParams.get('dateTimeRenderOption') !== 'SERIAL_NUMBER') return json({ error: { code: 400, message: 'test: render option' } }, 400);
      return json({ valueRanges: ranges.map(r => ({ range: r, majorDimension: major, values: this.read(ss, r, major) })) });
    } catch (e) {
      return json({ error: { code: e.status || 500, message: e.message } }, e.status || 500);
    }
  }

  token(body) {
    this.calls.token++;
    const params = new URLSearchParams(body);
    if (params.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') return json({ error: 'grant' }, 400);
    const jwt = params.get('assertion') || '', [h, c, s] = jwt.split('.');
    if (this.publicKey) {
      const ok = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + c), this.publicKey, Buffer.from(s, 'base64url'));
      if (!ok) return json({ error: 'invalid_grant', error_description: 'bad signature' }, 400);
      const claim = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'));
      if (claim.scope !== 'https://www.googleapis.com/auth/spreadsheets' || claim.aud !== 'https://oauth2.googleapis.com/token' || !(claim.exp > claim.iat)) return json({ error: 'invalid_grant', error_description: 'claims' }, 400);
    }
    const t = 'ya29.fake-' + (++this.n);
    this.tokens.add(t);
    return json({ access_token: t, expires_in: 3599, token_type: 'Bearer' });
  }

  read(ss, a1, major) {
    const r = parseA1(a1), sh = this.sheetByTitle(ss, r.title);
    if (!sh) throw Object.assign(new Error('Unable to parse range: ' + a1), { status: 400 });
    const lastR = sh.getLastRow(), lastC = sh.getLastColumn();
    const r2 = r.r2 === null ? lastR : r.r2, c2 = r.c2 === null ? lastC : r.c2;
    const grid = [];
    for (let i = r.r1; i <= r2; i++) { const row = []; for (let j = r.c1; j <= c2; j++) row.push(toApi(sh.cell(i, j), ss.getSpreadsheetTimeZone())); grid.push(row); }
    let out = grid;
    if (major === 'COLUMNS') { out = []; for (let j = 0; j < c2 - r.c1 + 1; j++) out.push(grid.map(row => row[j])); }
    out = out.map(row => { let k = row.length; while (k > 0 && (row[k - 1] === '' || row[k - 1] == null)) k--; return row.slice(0, k); });
    let n = out.length;
    while (n > 0 && out[n - 1].length === 0) n--;
    return out.slice(0, n);
  }

  apply(ss, kind, body) {
    if (kind === 'batchUpdate') {
      const reqs = body.requests || [];
      /* kiểm hết trước rồi mới ghi: Google áp dụng cả lô hoặc không gì cả */
      reqs.forEach(q => {
        const x = q.appendCells || (q.updateCells && q.updateCells.start);
        if (!x || !this.sheetById(ss, x.sheetId)) throw Object.assign(new Error('bad request'), { status: 400 });
      });
      this.updates.push(reqs.length);
      reqs.forEach(q => {
        if (q.appendCells) {
          const sh = this.sheetById(ss, q.appendCells.sheetId);
          q.appendCells.rows.forEach(row => {
            const at = sh.getLastRow() + 1;
            row.values.forEach((cd, j) => sh.put(at, j + 1, cellVal(cd)));
          });
        } else if (q.updateCells) {
          const st = q.updateCells.start, sh = this.sheetById(ss, st.sheetId);
          q.updateCells.rows.forEach((row, i) => row.values.forEach((cd, j) => sh.put(st.rowIndex + 1 + i, st.columnIndex + 1 + j, cellVal(cd))));
        }
      });
    } else if (kind === 'values') {
      (body.data || []).forEach(d => {
        const r = parseA1(d.range), sh = this.sheetByTitle(ss, r.title);
        if (!sh) throw Object.assign(new Error('Unable to parse range'), { status: 400 });
        d.values.forEach((row, i) => row.forEach((v, j) => sh.put(r.r1 + i, r.c1 + j, v)));
      });
    } else if (kind === 'clear') {
      (body.ranges || []).forEach(a1 => {
        const r = parseA1(a1), sh = this.sheetByTitle(ss, r.title);
        if (!sh) throw Object.assign(new Error('Unable to parse range'), { status: 400 });
        const r2 = r.r2 === null ? sh.getLastRow() : r.r2, c2 = r.c2 === null ? sh.getLastColumn() : r.c2;
        for (let i = r.r1; i <= r2; i++) for (let j = r.c1; j <= c2; j++) if (sh.cell(i, j) !== '') sh.put(i, j, '');
      });
    }
  }
}
function cellVal(cd) {
  const u = cd && cd.userEnteredValue;
  if (!u) return '';
  if ('stringValue' in u) return u.stringValue;
  if ('numberValue' in u) return u.numberValue;
  if ('boolValue' in u) return u.boolValue;
  return '';
}
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } }); }
function abortError() { return new DOMException('This operation was aborted', 'AbortError'); }

/**
 * Storage giả (giống API KV của DurableObjectStorage: get(key|keys) / put(key, v) | put({k: v…}) nguyên khối /
 * delete(key|keys) / list({prefix}) + alarm: setAlarm / getAlarm / deleteAlarm — onAlarm() được gọi khi tới giờ).
 */
export class FakeStorage {
  constructor() { this.m = new Map(); this.writes = 0; this.failJournal = 0; this.alarmAt = 0; this.alarmT = null; this.onAlarm = null; }
  async get(k) {
    if (Array.isArray(k)) { const out = new Map(); k.forEach(x => { if (this.m.has(x)) out.set(x, structuredClone(this.m.get(x))); }); return out; }
    return this.m.has(k) ? structuredClone(this.m.get(k)) : undefined;
  }
  async put(k, v) {
    if (k && typeof k === 'object') {
      const keys = Object.keys(k);
      if (this.failJournal > 0 && keys.some(x => x.startsWith('j:'))) { this.failJournal--; throw new Error('storage lỗi (test)'); }
      const vals = keys.map(x => structuredClone(k[x]));
      keys.forEach((x, i) => this.m.set(x, vals[i]));
      this.writes++;
      return;
    }
    this.writes++; this.m.set(k, structuredClone(v));
  }
  async delete(k) { if (Array.isArray(k)) { let n = 0; k.forEach(x => { if (this.m.delete(x)) n++; }); return n; } return this.m.delete(k); }
  async list(o) { const out = new Map(); [...this.m.keys()].sort().forEach(k => { if (!o || !o.prefix || k.startsWith(o.prefix)) out.set(k, structuredClone(this.m.get(k))); }); return out; }
  keys(prefix) { return [...this.m.keys()].filter(k => k.startsWith(prefix)).sort(); }
  async getAlarm() { return this.alarmAt || null; }
  async setAlarm(t) {
    this.alarmAt = t;
    if (this.alarmT) clearTimeout(this.alarmT);
    this.alarmT = null;
    if (this.onAlarm) this.alarmT = setTimeout(() => { this.alarmT = null; this.alarmAt = 0; this.onAlarm(); }, Math.max(0, t - Date.now()));
  }
  async deleteAlarm() { this.alarmAt = 0; if (this.alarmT) clearTimeout(this.alarmT); this.alarmT = null; }
  /** Test: "DO bị dọn khỏi RAM" — alarm vẫn còn trong storage nhưng không gọi bản DO cũ nữa. */
  detach() { if (this.alarmT) clearTimeout(this.alarmT); this.alarmT = null; this.onAlarm = null; }
}

/** Service account giả: cặp khoá RSA thật (để kiểm chữ ký JWT), không phải khoá của ai. */
export function fakeServiceAccount() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const sa = { type: 'service_account', project_id: 'test-only', private_key_id: 'testkey1', private_key: privateKey,
               client_email: 'test-only@example.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token' };
  return { saJson: JSON.stringify(sa), publicKey };
}
