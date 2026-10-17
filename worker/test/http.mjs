/* Lớp HTTP của Worker: CORS theo danh sách, giới hạn body, JSON, Server-Timing. Chạy: node test/http.mjs */
import { handleHttp, MAX_BODY } from '../src/http.js';

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
const env = { ALLOW_ORIGINS: 'https://booking.b0dy.studio' };
const SITE = 'https://booking.b0dy.studio';
let got = null;
const call = async p => { got = p; return { out: { ok: true, echo: p.action || null }, ms: 3 }; };
const req = (method, opts) => new Request('https://api.example.workers.dev/', Object.assign({ method }, opts || {}));

let r = await handleHttp(req('OPTIONS', { headers: { origin: SITE, 'access-control-request-method': 'POST' } }), env, call);
ok('OPTIONS từ booking.b0dy.studio → 204 + Allow-Origin đúng origin', r.status === 204 && r.headers.get('access-control-allow-origin') === SITE);
r = await handleHttp(req('OPTIONS', { headers: { origin: 'https://evil.example' } }), env, call);
ok('OPTIONS từ origin lạ → 403', r.status === 403);
r = await handleHttp(req('POST', { headers: { origin: SITE, 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'lt_ping', dev: 'x' }) }), env, call);
let j = await r.json();
ok('POST text/plain (không preflight) → 200 JSON, Allow-Origin, no-store, Server-Timing', r.status === 200 && j.ok && j.echo === 'lt_ping' && r.headers.get('access-control-allow-origin') === SITE &&
   r.headers.get('cache-control') === 'no-store' && /do;dur=3, total;dur=\d+/.test(r.headers.get('server-timing') || '') && /application\/json/.test(r.headers.get('content-type')), [r.status, j, [...r.headers]]);
r = await handleHttp(req('POST', { headers: { origin: 'https://evil.example' }, body: '{}' }), env, call);
ok('POST từ origin lạ → 403, không gọi DO', r.status === 403 && (await r.json()).error === 'origin');
got = null;
r = await handleHttp(req('POST', { body: '{"action":"lt_boot"}' }), env, call);
ok('POST không có Origin (curl, máy chủ) → vẫn phục vụ, không có header CORS', r.status === 200 && got && got.action === 'lt_boot' && !r.headers.get('access-control-allow-origin'));
r = await handleHttp(req('POST', { headers: { origin: SITE }, body: 'x'.repeat(MAX_BODY + 1) }), env, call);
ok('Body > 8 KB → 413', r.status === 413);
got = null;
r = await handleHttp(req('POST', { headers: { origin: SITE }, body: 'không phải json' }), env, call);
ok('Body hỏng → coi như {} (DO trả lỗi nghiệp vụ như Apps Script)', r.status === 200 && got && Object.keys(got).length === 0);
r = await handleHttp(req('POST', { headers: { origin: SITE }, body: '[1,2]' }), env, call);
ok('Body là mảng → {}', got && !Array.isArray(got) && Object.keys(got).length === 0);
r = await handleHttp(req('GET', { headers: { origin: SITE } }), env, call);
ok('GET → pong', r.status === 200 && (await r.json()).pong === true);
r = await handleHttp(req('PUT', { headers: { origin: SITE }, body: '{}' }), env, call);
ok('PUT → 405', r.status === 405);
r = await handleHttp(req('POST', { headers: { origin: SITE }, body: '{}' }), env, async () => { throw new Error('DO mất'); });
j = await r.json();
ok('DO lỗi hạ tầng → 200 + loi_he_thong (trình duyệt hiện "Gửi lại", an toàn nhờ mã yêu cầu)', r.status === 200 && j.ok === false && j.error === 'loi_he_thong');
r = await handleHttp(req('POST', { headers: { origin: 'https://x.example' }, body: '{}' }), { ALLOW_ORIGINS: '*' }, call);
ok('ALLOW_ORIGINS="*" → nhận mọi origin', r.status === 200 && r.headers.get('access-control-allow-origin') === 'https://x.example');
r = await handleHttp(req('POST', { headers: { origin: SITE }, body: '{}' }), {}, call);
ok('Thiếu ALLOW_ORIGINS → mặc định booking.b0dy.studio', r.status === 200 && r.headers.get('access-control-allow-origin') === SITE);

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
