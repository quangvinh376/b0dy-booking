/**
 * Kênh live (1.2.0, chủ studio duyệt 19/10 — "mức 1"): trang mở MỘT WebSocket tới Durable Object; DO chỉ đẩy hai loại tin,
 * KHÔNG có dữ liệu hội viên nào:
 *   {t:'hi', r, n}  — vừa kết nối
 *   {t:'bump', r}   — phòng vừa đổi (lượt đặt / đổi / mời / từ chối vừa nhận, hay sheet vừa đọc lại khác trước) → trang tự hỏi lại
 *                     state của chính mình bằng lt_boot (luật riêng tư giữ nguyên: ai thấy gì vẫn do lt_boot quyết)
 *   {t:'n', n}      — số máy đang mở trang (đếm theo mã máy, ẩn danh; một máy mở hai tab vẫn là một)
 * WebSocket Hibernation API: DO ngủ được khi các kết nối im lặng; trang gửi 'ping' → 'pong' trả tự động, không đánh thức DO.
 * Lớp này không biết gì về nghiệp vụ: BookingCore gọi bump() khi phòng đổi (deps.notify), index.js nối các sự kiện WebSocket vào.
 */
export const LIVE_DEFAULTS = {
  MAX: 400,          // tối đa số kết nối cùng lúc (quá thì từ chối — trang lui về hỏi 2 phút một lần như trước)
  BUMP_MS: 150,      // gom các thay đổi trong ~150 ms thành một tin
  COUNT_MS: 600      // gom vào / ra trong ~600 ms rồi mới báo số người đang xem
};
const OPEN = 1;

export class Live {
  /** ctx: DurableObjectState (acceptWebSocket · getWebSockets · setWebSocketAutoResponse) · opts: ghi đè LIVE_DEFAULTS (test) */
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.cfg = Object.assign({}, LIVE_DEFAULTS, opts || {});
    this.rev = 0;
    this.bumpT = null; this.countT = null; this.lastN = -1;
    try { if (typeof WebSocketRequestResponsePair === 'function') ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); }
    catch (e) { /* môi trường không có auto-response: 'ping' tới webSocketMessage, vẫn trả 'pong' ở đó */ }
  }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === OPEN); }
  /** số máy đang mở trang (mã máy khác nhau) */
  count() {
    const devs = new Set();
    this.sockets().forEach(ws => { const a = attachment(ws); if (a && a.dev) devs.add(a.dev); });
    return devs.size;
  }
  /** Nhận kết nối mới (Worker đã kiểm origin + mã máy). Trả Response 101 kèm đầu kia của cặp WebSocket. */
  accept(dev) {
    if (this.sockets().length >= this.cfg.MAX) return new Response('busy', { status: 503 });
    const pair = new WebSocketPair(), server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ dev: String(dev) });
    try { server.send(JSON.stringify({ t: 'hi', r: this.rev, n: this.count() })); } catch (e) { /* bỏ qua */ }
    this.recount();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  /** Phòng vừa đổi: báo mọi trang (gom trong BUMP_MS) */
  bump() {
    if (this.bumpT) return;
    this.bumpT = setTimeout(() => { this.bumpT = null; this.rev++; this.send({ t: 'bump', r: this.rev }); }, this.cfg.BUMP_MS);
  }
  /** Có máy vào / ra: báo số người đang xem nếu đổi (gom trong COUNT_MS) */
  recount() {
    if (this.countT) return;
    this.countT = setTimeout(() => {
      this.countT = null;
      const n = this.count();
      if (n !== this.lastN) { this.lastN = n; this.send({ t: 'n', n: n }); }
    }, this.cfg.COUNT_MS);
  }
  /** Tin từ trang: chỉ có 'ping' (thường đã được trả tự động) — mọi thứ khác bỏ qua */
  message(ws, m) { if (m === 'ping') { try { ws.send('pong'); } catch (e) { /* bỏ qua */ } } }
  closed(ws) {
    try { ws.close(1000, 'bye'); } catch (e) { /* đã đóng */ }
    this.recount();
  }
  send(o) {
    const s = JSON.stringify(o);
    this.sockets().forEach(ws => { try { ws.send(s); } catch (e) { /* kết nối vừa rớt: webSocketClose sẽ đếm lại */ } });
  }
}
function attachment(ws) { try { return ws.deserializeAttachment(); } catch (e) { return null; } }
