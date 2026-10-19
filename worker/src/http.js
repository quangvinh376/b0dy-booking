/**
 * Lớp HTTP của Worker: CORS theo danh sách origin, giới hạn kích thước body, JSON vào / JSON ra.
 * Hợp đồng giống Apps Script: POST một object JSON (Content-Type text/plain để trình duyệt không gửi preflight),
 * luôn trả 200 + JSON cho lỗi nghiệp vụ. Chỉ lỗi giao thức mới có mã khác (origin 403, method 405, body quá lớn 413).
 */
export const MAX_BODY = 8192;

export function allowedOrigin(origin, list) {
  if (!origin) return null;
  const items = String(list || 'https://booking.b0dy.studio').split(',').map(s => s.trim()).filter(Boolean);
  if (items.indexOf('*') >= 0) return origin;
  return items.indexOf(origin) >= 0 ? origin : null;
}

function headers(origin, extra) {
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'vary': 'Origin' };
  if (origin) {
    h['access-control-allow-origin'] = origin;
    h['access-control-expose-headers'] = 'Server-Timing';
    h['timing-allow-origin'] = origin;
  }
  return Object.assign(h, extra || {});
}
export function json(obj, status, origin, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: headers(origin, extra) });
}

/** Đọc body tối đa `max` byte; quá thì trả null. */
async function readBody(req, max) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch (e) { /* bỏ qua */ } return null; }
    chunks.push(r.value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  chunks.forEach(c => { all.set(c, o); o += c.byteLength; });
  return new TextDecoder().decode(all);
}

/**
 * Cổng kênh live (WebSocket GET /live?dev=…): trình duyệt luôn gửi Origin khi mở WebSocket → phải có và nằm trong danh sách;
 * mã máy đúng dạng như mọi lệnh khác. Hợp lệ → null (index.js chuyển request cho DO); không → Response lỗi (không nâng cấp).
 */
export function liveGate(req, env) {
  const url = new URL(req.url), origin = req.headers.get('origin') || '';
  if (url.pathname !== '/live') return new Response('not found', { status: 404 });
  if (!allowedOrigin(origin, env.ALLOW_ORIGINS)) return new Response('origin', { status: 403 });
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(url.searchParams.get('dev') || '')) return new Response('thieu_may', { status: 400 });
  return null;
}

/**
 * call(p) → Promise<{out, ms}> (gọi Durable Object). Không ném: lỗi hạ tầng → {ok:false, error:'loi_he_thong'}.
 */
export async function handleHttp(req, env, call) {
  const t0 = Date.now();
  const origin = req.headers.get('origin') || '';
  const allow = allowedOrigin(origin, env.ALLOW_ORIGINS);
  if (req.method === 'OPTIONS') {
    if (!allow) return new Response(null, { status: 403, headers: { vary: 'Origin' } });
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': allow, 'access-control-allow-methods': 'POST, GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type', 'access-control-max-age': '86400', vary: 'Origin' } });
  }
  if (origin && !allow) return json({ ok: false, error: 'origin' }, 403, null);
  if (req.method === 'GET' || req.method === 'HEAD') return json({ ok: true, pong: true, now: Date.now() }, 200, allow);
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, allow);
  const text = await readBody(req, MAX_BODY);
  if (text === null) return json({ ok: false, error: 'qua_lon' }, 413, allow);
  let p = {};
  try { p = JSON.parse(text); } catch (e) { p = {}; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
  let r;
  try { r = await call(p); }
  catch (e) { r = { out: { ok: false, error: 'loi_he_thong', detail: 'do', now: Date.now() }, ms: 0 }; }
  const total = Date.now() - t0;
  /* nhật ký cho Observability: chỉ tên lệnh + mã lỗi + thời gian — KHÔNG ghi body (có mã nhớ máy, 4 số cuối) */
  try { console.log(JSON.stringify({ a: String(p.action || '').slice(0, 20), ok: !!(r.out && r.out.ok), e: (r.out && r.out.error) || undefined, why: (r.out && r.out.why) || undefined, ms: total, doMs: r.ms || 0 })); } catch (e) { /* bỏ qua */ }
  return json(r.out, 200, allow, { 'server-timing': 'do;dur=' + (r.ms || 0) + ', total;dur=' + total });
}
