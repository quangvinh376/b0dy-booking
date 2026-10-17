/* Môi trường Apps Script giả để chạy backend/LichTuan.gs trong Node: SpreadsheetApp · Utilities ·
   PropertiesService · CacheService · LockService · DriveApp. Bảng tính giả lưu giá trị theo hàng/cột (1-based).
   Ô ngày = Date lúc 00:00 theo timezone của file (giống getValues() của Apps Script). */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function tzOffsetMs(tz, utcMs) {                       /* lệch (ms) của tz tại thời điểm utcMs */
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; f.formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}
function dateIn(tz, iso, hm) {                         /* Date của "iso hh:mm" theo giờ tz */
  const a = iso.split('-').map(Number), t = (hm || '00:00').split(':').map(Number);
  let guess = Date.UTC(a[0], a[1] - 1, a[2], t[0], t[1]);
  for (let i = 0; i < 3; i++) guess = Date.UTC(a[0], a[1] - 1, a[2], t[0], t[1]) - tzOffsetMs(tz, guess);
  return new Date(guess);
}
function fmtDate(d, tz, pattern) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const p = {}; f.formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return pattern.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second).replace('EEE', p.weekday);
}

class Sheet {
  constructor(ss, name, rows) { this.ss = ss; this.name = name; this.rows = rows || []; this.writes = []; }
  getName() { return this.name; }
  getLastRow() { for (let r = this.rows.length; r >= 1; r--) if ((this.rows[r - 1] || []).some(v => v !== '' && v != null)) return r; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach(row => { for (let c = row.length; c >= 1; c--) if (row[c - 1] !== '' && row[c - 1] != null) { m = Math.max(m, c); break; } }); return m; }
  cell(r, c) { const row = this.rows[r - 1] || []; const v = row[c - 1]; return v == null ? '' : v; }
  put(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') throw new Error('A1 chưa hỗ trợ');
    if (r < 1 || c < 1) throw new Error('getRange ngoài lưới ' + r + ',' + c);
    return new Range(this, r, c, nr || 1, nc || 1);
  }
}
class Range {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.cell(this.r + i, this.c + j)); out.push(row); } return out; }
  getValue() { return this.sh.cell(this.r, this.c); }
  setValues(v) {
    if (v.length !== this.nr || v.some(x => x.length !== this.nc)) throw new Error('setValues sai kích thước ' + this.nr + 'x' + this.nc);
    v.forEach((row, i) => row.forEach((x, j) => this.sh.put(this.r + i, this.c + j, x)));
    this.sh.writes.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc });
    return this;
  }
  setValue(x) { this.sh.put(this.r, this.c, x); this.sh.writes.push({ r: this.r, c: this.c, nr: 1, nc: 1 }); return this; }
  setNumberFormat() { return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.put(this.r + i, this.c + j, ''); return this; }
}
class Spreadsheet {
  constructor(id, tz, sheets) { this.id = id; this.tz = tz; this.sheets = []; Object.keys(sheets).forEach(n => this.sheets.push(new Sheet(this, n, sheets[n]))); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  getSheets() { return this.sheets.slice(); }
  getSpreadsheetTimeZone() { return this.tz; }
  getId() { return this.id; }
}

/** Tạo môi trường mới. files: {id: Spreadsheet}. clock: {now}. */
function makeEnv(files, clock, opts) {
  opts = opts || {};
  const props = Object.assign({}, opts.props || {});
  const cache = new Map();
  const lockState = { held: false, busy: !!opts.lockBusy, acquired: 0 };
  const FakeDate = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  };
  const sandbox = {
    console, JSON, Math, Number, String, Array, Object, Error, RegExp, isNaN, parseInt, parseFloat,
    Date: FakeDate,
    SpreadsheetApp: {
      openById(id) { if (!files[id]) throw new Error('Không mở được file ' + id); return files[id]; },
      flush() { sandbox.__flushes = (sandbox.__flushes || 0) + 1; }
    },
    DriveApp: { getFilesByName(n) { const ids = Object.keys(files).filter(k => files[k].title === n); let i = 0; return { hasNext: () => i < ids.length, next: () => ({ getId: () => ids[i++] }) }; } },
    PropertiesService: { getScriptProperties() { return { getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }; } },
    CacheService: { getScriptCache() { return {
      get(k) { const e = cache.get(k); if (!e) return null; if (e.exp <= clock.now) { cache.delete(k); return null; } return e.v; },
      put(k, v, ttl) { if (String(v).length > 100000) throw new Error('cache quá cỡ'); cache.set(k, { v: String(v), exp: clock.now + (ttl || 600) * 1000 }); },
      remove(k) { cache.delete(k); }
    }; } },
    LockService: { getScriptLock() { return {
      tryLock() { if (lockState.busy) return false; lockState.held = true; lockState.acquired++; return true; },
      waitLock() { if (lockState.busy) throw new Error('lock timeout'); lockState.held = true; lockState.acquired++; },
      releaseLock() { lockState.held = false; }
    }; } },
    Utilities: {
      formatDate: fmtDate,
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe(x) { const b = typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(v => v & 255)); return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); },
      base64DecodeWebSafe(s) { return Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')).map(v => (v > 127 ? v - 256 : v)); },
      computeHmacSha256Signature(v, k) { return Array.from(crypto.createHmac('sha256', Buffer.from(k, 'utf8')).update(Buffer.from(v, 'utf8')).digest()).map(x => (x > 127 ? x - 256 : x)); },
      newBlob(bytes) { return { getDataAsString: () => Buffer.from(bytes.map(v => v & 255)).toString('utf8'), getBytes: () => bytes }; }
    }
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'LichTuan.gs'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'LichTuan.gs' });
  sandbox.__props = props; sandbox.__cache = cache; sandbox.__lock = lockState;
  return sandbox;
}

module.exports = { makeEnv, Spreadsheet, dateIn, fmtDate };
