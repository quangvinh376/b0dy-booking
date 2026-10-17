/**
 * Google Sheets API v4 cho Worker — service account (JWT RS256 bằng WebCrypto), không thư viện ngoài.
 *
 * Luật gọi mạng (đã trả giá ở app check-in / coach):
 *  · Đọc: hết giờ 8 s, lỗi mạng / 429 / 5xx thử lại MỘT lần.
 *  · Ghi: hết giờ 20 s, KHÔNG BAO GIỜ tự thử lại. Lỗi mạng / hết giờ / 5xx = "không rõ đã ghi chưa" (ambiguous) →
 *    nơi gọi (flush của nhật ký) phải đọc lại sổ, tìm mã yêu cầu rồi mới gửi lại.
 *  · 401 = mã truy cập hết hạn → lấy mã mới và gửi lại một lần (Google từ chối trước khi xử lý nên an toàn).
 */
import { b64urlBytes, b64urlStr } from './crypto.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const enc = new TextEncoder();

export class GoogleError extends Error {
  constructor(msg, status, ambiguous) { super(msg); this.status = status || 0; this.ambiguous = !!ambiguous; }
}

/** 'Sổ đặt lịch' → "'Sổ đặt lịch'" (A1: tên tab luôn đặt trong nháy đơn, nháy bên trong nhân đôi) */
export function q(title) { return "'" + String(title).replace(/'/g, "''") + "'"; }
/** 1 → A, 27 → AA */
export function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function pemToDer(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export class Sheets {
  /** opts: {saJson (chuỗi JSON của service account), fetch, readMs, writeMs} */
  constructor(opts) {
    this.saJson = opts.saJson;
    this.fetch = opts.fetch;
    this.readMs = opts.readMs || 8000;
    this.writeMs = opts.writeMs || 20000;
    this.tok = null; this.tokExp = 0; this.tokP = null; this.keyP = null; this.sa = null;
    this.calls = 0;                                   // đếm lượt gọi Google (đo hiệu năng / test)
  }

  account() {
    if (!this.sa) {
      if (!this.saJson) throw new GoogleError('thieu_SA_JSON', 0, false);
      let o = null;
      try { o = typeof this.saJson === 'string' ? JSON.parse(this.saJson) : this.saJson; } catch (e) { throw new GoogleError('SA_JSON_hong', 0, false); }
      if (!o || !o.client_email || !o.private_key) throw new GoogleError('SA_JSON_hong', 0, false);
      this.sa = o;
    }
    return this.sa;
  }

  /** fetch có hạn giờ. Hết giờ → lỗi mang cờ timeout (lượt GHI hết giờ: Google có thể vẫn đang xử lý). */
  async fetchT(url, init, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { this.calls++; return await this.fetch(url, Object.assign({}, init, { signal: ctl.signal })); }
    catch (e) { if (ctl.signal.aborted) { const x = new Error('het_gio'); x.timeout = true; throw x; } throw e; }
    finally { clearTimeout(t); }
  }

  /** Mã truy cập OAuth (cache tới lúc hết hạn − 60 s; nhiều lượt gọi cùng lúc dùng chung một lượt xin). */
  async token() {
    if (this.tok && this.tokExp - 60e3 > Date.now()) return this.tok;
    if (!this.tokP) this.tokP = this.newToken().finally(() => { this.tokP = null; });
    return this.tokP;
  }
  async newToken() {
    const sa = this.account();
    if (!this.keyP) this.keyP = crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const iat = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const head = { alg: 'RS256', typ: 'JWT' };
    if (sa.private_key_id) head.kid = sa.private_key_id;
    const unsigned = b64urlStr(JSON.stringify(head)) + '.' + b64urlStr(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: aud, iat: iat, exp: iat + 3600 }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await this.keyP, enc.encode(unsigned));
    const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64urlBytes(new Uint8Array(sig));
    let res;
    try { res = await this.fetchT(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body }, this.readMs); }
    catch (e) { throw new GoogleError('google_auth_mang', 0, false); }
    if (!res.ok) throw new GoogleError('google_auth_' + res.status, res.status, false);
    const j = await res.json();
    if (!j || !j.access_token) throw new GoogleError('google_auth_rong', 0, false);
    this.tok = j.access_token;
    this.tokExp = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    return this.tok;
  }

  /** Một lượt gọi API. write=true: không tự thử lại (trừ 401). */
  async call(method, url, body, write) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tok = await this.token();
      let res;
      try {
        res = await this.fetchT(url, { method: method, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
                                        body: body === undefined ? undefined : JSON.stringify(body) }, write ? this.writeMs : this.readMs);
      } catch (e) {
        const name = e && e.timeout ? 'google_het_gio' : 'google_mang';
        if (write) { const g = new GoogleError(name, 0, true); g.timeout = !!(e && e.timeout); throw g; }
        if (attempt === 0) continue;
        throw new GoogleError(name, 0, false);
      }
      if (res.ok) return await res.json();
      const st = res.status;
      if (st === 401 && attempt === 0) { this.tok = null; continue; }
      const txt = await res.text().catch(() => '');
      if (!write && attempt === 0 && (st === 429 || st >= 500)) { await sleep(250); continue; }
      const e = new GoogleError('google_' + st, st, write && st >= 500);
      e.body = String(txt).slice(0, 300);
      throw e;
    }
    throw new GoogleError('google_het_luot', 0, !!write);
  }

  /** Tên + sheetId các tab, theo thứ tự tab. */
  async meta(ssId) {
    const j = await this.call('GET', API + encodeURIComponent(ssId) + '?fields=' + encodeURIComponent('sheets.properties(sheetId,title)'));
    return (j.sheets || []).map(s => ({ id: s.properties.sheetId, title: s.properties.title }));
  }
  /** Đọc nhiều vùng một lượt. Ngày → serial, giờ → phần lẻ của ngày (giống getValues nhưng không lệch múi giờ). */
  async batchGet(ssId, ranges, major) {
    const qs = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&') +
      '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=' + (major || 'ROWS');
    const j = await this.call('GET', API + encodeURIComponent(ssId) + '/values:batchGet?' + qs);
    return (j.valueRanges || []).map(v => v.values || []);
  }
  /** spreadsheets.batchUpdate — mọi request trong một lượt được áp dụng NGUYÊN KHỐI (tất cả hoặc không). */
  async batchUpdate(ssId, requests) {
    return this.call('POST', API + encodeURIComponent(ssId) + ':batchUpdate', { requests: requests }, true);
  }
  async valuesUpdate(ssId, data) {
    return this.call('POST', API + encodeURIComponent(ssId) + '/values:batchUpdate', { valueInputOption: 'RAW', data: data }, true);
  }
  async valuesClear(ssId, ranges) {
    return this.call('POST', API + encodeURIComponent(ssId) + '/values:batchClear', { ranges: ranges }, true);
  }
}

/** Ô ghi vào sổ: số giữ là số (cột Bản), còn lại là chữ — đúng như ltAppend_ (định dạng '@' + cột Bản '0'). */
export function cellData(v) {
  return typeof v === 'number' ? { userEnteredValue: { numberValue: v } } : { userEnteredValue: { stringValue: String(v == null ? '' : v) } };
}
/** Thêm dòng sau dòng cuối có dữ liệu của tab (cột A để trống, dữ liệu từ cột B như sổ). */
export function appendRows(sheetId, rows) {
  return { appendCells: { sheetId: sheetId, rows: rows.map(a => ({ values: [{}].concat(a.map(cellData)) })), fields: 'userEnteredValue' } };
}
/** Ghi một ô (row, col đánh số từ 1). */
export function setCell(sheetId, row, col, v) {
  return { updateCells: { start: { sheetId: sheetId, rowIndex: row - 1, columnIndex: col - 1 }, rows: [{ values: [cellData(v)] }], fields: 'userEnteredValue' } };
}
