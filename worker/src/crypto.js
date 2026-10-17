/**
 * Mã nhớ máy + mã hội viên — cùng thuật toán với LichTuan.gs (cùng LT_SECRET ⇒ cùng mã):
 *   mac(s)  = base64url(HMAC-SHA256(s, secret)) bỏ "=", lấy 32 ký tự đầu
 *   id(key) = mac("id:" + key) lấy 18 ký tự đầu
 *   tok     = base64url(JSON {k, d, e, v:1}) + "." + mac("tok:" + body)
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlStr(str) { return b64urlBytes(enc.encode(str)); }
/** Giải base64url (bù "=" như Apps Script: '==='.slice((n + 3) % 4)) rồi đọc UTF-8. Lỗi thì ném. */
export function b64urlToStr(s) {
  const pad = '==='.slice((s.length + 3) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}
/** So hai chuỗi không lộ thời gian (khác Apps Script ở cách so, không khác kết quả). */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export class Signer {
  constructor(secret) {
    this.keyP = crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    this.ids = new Map();
  }
  async mac(s) {
    const sig = await crypto.subtle.sign('HMAC', await this.keyP, enc.encode(s));
    return b64urlBytes(new Uint8Array(sig)).slice(0, 32);
  }
  async idOf(key) {
    let v = this.ids.get(key);
    if (!v) { v = (await this.mac('id:' + key)).slice(0, 18); this.ids.set(key, v); }
    return v;
  }
  async tokMake(key, dev, ttl, now) {
    const body = b64urlStr(JSON.stringify({ k: key, d: dev, e: now + ttl, v: 1 }));
    return body + '.' + await this.mac('tok:' + body);
  }
  async tokRead(tok, dev, now) {
    const t = String(tok || ''), i = t.indexOf('.');
    if (i < 8 || t.length > 600) return null;
    const body = t.slice(0, i);
    if (!same(t.slice(i + 1), await this.mac('tok:' + body))) return null;
    let o = null;
    try { o = JSON.parse(b64urlToStr(body)); } catch (e) { return null; }
    if (!o || o.v !== 1 || o.d !== dev || !(o.e > now) || !o.k) return null;
    return o;
  }
}
