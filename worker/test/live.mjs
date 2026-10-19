/* Test kênh live (1.2.0): lớp Live trên DO giả (đếm theo mã máy, gom tin, giới hạn kết nối) · cổng liveGate · BookingCore báo
   "phòng vừa đổi" đúng lúc: sau lượt ghi được nhận, khi sổ / BA đọc lại khác trước — không báo khi chỉ xem hay đọc lại y hệt.
   WebSocket thật trong workerd: test/workerd.mjs. Chạy: node test/live.mjs */
import { createRequire } from 'module';
import { BookingCore } from '../src/booking.js';
import { Live } from '../src/live.js';
import { liveGate } from '../src/http.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn } = require('../../test/gas_env.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\n== Live: đếm người đang xem · gom tin · giới hạn ==');
{
  /* WebSocket giả + DurableObjectState giả (acceptWebSocket / getWebSockets) + Response cho mã 101 (Response của Node không nhận 101) */
  class WS {
    constructor() { this.readyState = 1; this.sent = []; this.att = null; }
    send(s) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(s); }
    close() { this.readyState = 3; }
    serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); }
    deserializeAttachment() { return this.att; }
  }
  const NodeResponse = globalThis.Response;
  globalThis.WebSocketPair = function () { const a = new WS(), b = new WS(); this[0] = a; this[1] = b; };
  globalThis.Response = class { constructor(body, init) { this.status = init.status; this.webSocket = init.webSocket; } };
  const ctx = { list: [], acceptWebSocket(ws) { this.list.push(ws); }, getWebSockets() { return this.list.slice(); }, setWebSocketAutoResponse() {} };
  const L = new Live(ctx, { BUMP_MS: 20, COUNT_MS: 30, MAX: 4 });
  const msgs = ws => ws.sent.filter(x => x[0] === '{').map(x => JSON.parse(x));
  const r1 = L.accept('devAAAAAAAAAAAAAAAA1'), r2 = L.accept('devAAAAAAAAAAAAAAAA1'), r3 = L.accept('devBBBBBBBBBBBBBBBB2');
  const [s1, s2, s3] = ctx.list;
  ok('accept → 101 kèm đầu kia của cặp WebSocket', r1.status === 101 && !!r1.webSocket && r3.status === 101);
  ok('Tin "hi" mang số máy lúc nối (1 · 1 · 2)', [s1, s2, s3].map(s => msgs(s)[0].t + msgs(s)[0].n).join() === 'hi1,hi1,hi2', [s1, s2, s3].map(s => s.sent));
  await sleep(60);
  ok('Hai tab cùng một máy = 1 người: báo {t:n, n:2} một lần cho mọi kết nối', [s1, s2, s3].every(s => msgs(s).filter(m => m.t === 'n').map(m => m.n).join() === '2'), s3.sent);
  L.bump(); L.bump(); L.bump();
  await sleep(50);
  ok('Ba lần đổi trong 20 ms → MỘT tin bump', [s1, s2, s3].every(s => msgs(s).filter(m => m.t === 'bump').length === 1) && msgs(s1).filter(m => m.t === 'bump')[0].r === 1, s1.sent);
  L.message(s1, 'ping');
  ok('ping → pong (khi không có trả lời tự động)', s1.sent[s1.sent.length - 1] === 'pong');
  L.message(s1, '{"t":"x"}');
  ok('Tin khác từ trang bị bỏ qua', s1.sent[s1.sent.length - 1] === 'pong');
  s2.close(); L.closed(s2); await sleep(60);
  ok('Một tab của máy A đóng → vẫn 2 người: không báo lại', msgs(s3).filter(m => m.t === 'n').length === 1, s3.sent);
  s3.close(); L.closed(s3); await sleep(60);
  ok('Máy B rời → báo n: 1', msgs(s1).filter(m => m.t === 'n').map(m => m.n).join() === '2,1', s1.sent);
  L.bump(); await sleep(50);
  ok('Kết nối đã đóng không nhận tin nữa', msgs(s3).filter(m => m.t === 'bump').length === 1 && msgs(s1).filter(m => m.t === 'bump').length === 2);
  L.accept('devCCCCCCCCCCCCCCCC3'); L.accept('devDDDDDDDDDDDDDDDD4'); L.accept('devEEEEEEEEEEEEEEEE5');
  const over = L.accept('devFFFFFFFFFFFFFFFF6');
  ok('Quá MAX kết nối đang mở → 503 (trang lui về hỏi 2 phút một lần)', over.status === 503, over.status);
  await sleep(60);
  globalThis.Response = NodeResponse; delete globalThis.WebSocketPair;
}

console.log('\n== liveGate ==');
{
  const env = { ALLOW_ORIGINS: 'https://booking.b0dy.studio' };
  const rq = (path, origin) => new Request('https://x.workers.dev' + path, { headers: Object.assign({ upgrade: 'websocket' }, origin ? { origin } : {}) });
  const ORG = 'https://booking.b0dy.studio', DEV = '?dev=devGATEGATEGATEGATE1';
  ok('Đúng đường, đúng origin, mã máy đúng dạng → null (cho qua)', liveGate(rq('/live' + DEV, ORG), env) === null);
  ok('Không có Origin → 403', liveGate(rq('/live' + DEV), env).status === 403);
  ok('Origin lạ → 403', liveGate(rq('/live' + DEV, 'https://la.example'), env).status === 403);
  ok('Mã máy sai dạng → 400', liveGate(rq('/live?dev=ngan', ORG), env).status === 400);
  ok('Đường khác → 404', liveGate(rq('/khac' + DEV, ORG), env).status === 404);
}

console.log('\n== BookingCore → notify ==');
{
  const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh', d = iso => dateIn(LA, iso);
  const SA = fakeServiceAccount(), SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH'];
  const mem = (no, name, coach, phone, code) => ['', no, name, '24 buổi', 24, '1:1', coach, phone, 20, d('2026-08-01'), d('2027-01-01'), code];
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  const f = {
    BA: new Spreadsheet('BA', LA, { MEMBERS: [H, mem('1', 'Hoàng Đức Nam', 'Quyết Hán', '0900000001', 'B901DY'), mem('2', 'Phạm Minh Tâm', 'Hiền Mai', '0900000002', 'B902DY')],
      'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']], TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
      B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']], ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]] }),
    OUT: new Spreadsheet('OUT', 'Asia/Saigon', { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] })
  };
  const fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage(), clock = { now: dateIn(VN, '2026-10-18', '07:00').getTime() };
  let n = 0;
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: SECRET }, fetch: fg.fetch, now: () => clock.now,
                               opts: { FLUSH_MS: 1, BACKOFF: [5, 10, 20, 40] }, log: () => {}, notify: () => { n++; } });
  storage.onAlarm = () => wk.alarm();
  await wk.init();
  const DEV = 'devLIVELIVELIVELIVE1';
  const fnd = await wk.api({ action: 'lt_find', q: 'duc nam', dev: DEV });
  const s = await wk.api({ action: 'lt_verify', id: fnd.results[0].id, pin: '0001', remember: true, dev: DEV });
  await wk.api({ action: 'lt_boot', dev: DEV, tok: s.tok }); await wk.idle();
  ok('Đọc lần đầu (tìm tên · xác minh · mở trang) → không báo', s.ok && n === 0, n);
  const b = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridlive00000001', week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }] });
  ok('Lượt đặt được nhận → báo ngay (trước khi lên sheet)', b.ok && n === 1, [b.error, n]);
  await wk.idle(); await wk.loadLog();
  ok('Lên sheet + đọc lại sổ (cùng nội dung) → không báo lại', n === 1, n);
  const bad = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridlive00000002', week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }] });
  ok('Lượt bị từ chối (không ghi gì) → không báo', !bad.ok && n === 1, [bad.error, bad.why, n]);
  const dup = await wk.api({ action: 'lt_book', dev: DEV, tok: s.tok, rid: 'ridlive00000001', week: '2026-W43', picks: [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }] });
  ok('Gửi lại đúng mã cũ (dup) → không báo', dup.ok && dup.dup && n === 1, [dup, n]);
  /* chủ studio sửa tay sổ: đổi trạng thái một dòng của tuần đang đặt */
  const so = f.OUT.getSheetByName('Sổ đặt lịch').rows, i = so.findIndex(r => r[15] === 'ridlive00000001');
  so[i][11] = 'Đã đổi';
  await wk.loadLog();
  ok('Sổ sửa tay (tuần đang đặt) → đọc lại thấy khác → báo', n === 2, n);
  await wk.loadLog();
  ok('Đọc lại lần nữa, không đổi gì → không báo', n === 2, n);
  f.BA.getSheetByName('B0B').rows.push(['', 'Bảo trì', d('2026-10-24')]);
  await wk.loadBA();
  ok('BA: thêm ngày nghỉ → báo', n === 3, n);
  await wk.loadBA();
  ok('BA đọc lại y hệt → không báo', n === 3, n);
  f.BA.getSheetByName('MEMBERS').rows[1][8] = 19;
  await wk.loadBA();
  ok('BA: chỉ đổi số buổi còn lại của một hội viên (không đổi phòng của người khác) → không báo', n === 3, n);
  await wk.idle();
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
