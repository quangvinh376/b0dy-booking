/**
 * B0DY Booking API — Cloudflare Worker (booking.b0dy.studio → POST JSON)
 *
 * Worker chỉ làm cửa: CORS + đọc body, rồi gọi Durable Object "Booking" (một bản duy nhất, đặt ở châu Á – Thái Bình Dương)
 * qua RPC. Toàn bộ nghiệp vụ nằm trong booking.js / core.js (giống hệt backend/LichTuan.gs).
 * Cron mỗi phút gọi tick() để dữ liệu luôn ấm (06:00 Chủ Nhật không ai phải chờ đọc Google) và ghi nốt nhật ký.
 * alarm() của DO: thử lại việc ghi nhật ký lên Google Sheets (kể cả khi DO vừa bị dọn khỏi RAM).
 */
import { DurableObject } from 'cloudflare:workers';
import { BookingCore } from './booking.js';
import { handleHttp } from './http.js';

export class Booking extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new BookingCore({ storage: ctx.storage, env: env, waitUntil: p => ctx.waitUntil(p) });
    ctx.blockConcurrencyWhile(() => this.core.init());
  }
  async api(p) { return this.core.handle(p); }
  async tick() { return this.core.tick(); }
  async alarm() { await this.core.alarm(); }
}

function stub(env) {
  return env.BOOK.get(env.BOOK.idFromName('main'), { locationHint: 'apac' });
}

export default {
  async fetch(req, env) {
    return handleHttp(req, env, p => stub(env).api(p));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(stub(env).tick());
  }
};
