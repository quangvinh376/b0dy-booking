/**
 * B0DY Booking API — Cloudflare Worker (booking.b0dy.studio → POST JSON)
 *
 * Worker chỉ làm cửa: CORS + đọc body, rồi gọi Durable Object "Booking" (một bản duy nhất, đặt ở châu Á – Thái Bình Dương)
 * qua RPC. Toàn bộ nghiệp vụ nằm trong booking.js / core.js (giống hệt backend/LichTuan.gs).
 * Cron mỗi phút gọi tick() để dữ liệu luôn ấm (06:00 Chủ Nhật không ai phải chờ đọc Google) và ghi nốt nhật ký.
 * alarm() của DO: thử lại việc ghi nhật ký lên Google Sheets (kể cả khi DO vừa bị dọn khỏi RAM).
 * GET /live (WebSocket, 1.2.0): kênh live — xem live.js. Worker kiểm origin + mã máy rồi chuyển nguyên request cho DO.
 */
import { DurableObject } from 'cloudflare:workers';
import { BookingCore } from './booking.js';
import { handleHttp, liveGate } from './http.js';
import { Live } from './live.js';

export class Booking extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.live = new Live(ctx);
    this.core = new BookingCore({ storage: ctx.storage, env: env, waitUntil: p => ctx.waitUntil(p), notify: () => this.live.bump() });
    ctx.blockConcurrencyWhile(() => this.core.init());
  }
  async api(p) { return this.core.handle(p); }
  async tick() { return this.core.tick(); }
  async alarm() { await this.core.alarm(); }
  /* kênh live: request nâng cấp WebSocket từ Worker (đã qua liveGate) */
  async fetch(req) { return this.live.accept(new URL(req.url).searchParams.get('dev')); }
  async webSocketMessage(ws, m) { this.live.message(ws, m); }
  async webSocketClose(ws) { this.live.closed(ws); }
  async webSocketError(ws) { this.live.closed(ws); }
}

function stub(env) {
  return env.BOOK.get(env.BOOK.idFromName('main'), { locationHint: 'apac' });
}

export default {
  async fetch(req, env) {
    if ((req.headers.get('upgrade') || '').toLowerCase() === 'websocket') return liveGate(req, env) || stub(env).fetch(req);
    return handleHttp(req, env, p => stub(env).api(p));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(stub(env).tick());
  }
};
