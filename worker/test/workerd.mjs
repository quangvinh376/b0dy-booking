/* Test 4 · WORKERD (tuỳ chọn): chạy Worker thật trong workerd qua Miniflare — HTTP → DO (storage SQLite, alarm, RPC) →
   nhật ký → Google giả (300 ms/lượt, chặn mọi fetch ra ngoài). Kiểm phần Node không giả được: storage.put nhiều khoá,
   list, alarm thật, setTimeout của DO sau khi đã trả lời, DO khởi động lại khi nhật ký còn mục.
   Cần Miniflare (có sẵn sau `npm i` trong worker/, đi kèm wrangler); không có thì bỏ qua.
   Đồng hồ: chép src/ sang thư mục tạm, index.js cộng một độ lệch cố định để "bây giờ" là CN 18.10.2026 07:00 (giờ VN).
   Chạy: node test/workerd.mjs   (hoặc MINIFLARE=/đường/dẫn/miniflare/dist/src/index.js node test/workerd.mjs) */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { FakeGoogle, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn } = require('../../test/gas_env.js');

let MF;
try { MF = await import(process.env.MINIFLARE || 'miniflare'); }
catch (e) { console.log('Không có Miniflare → bỏ qua test workerd (0 PASS, 0 FAIL)'); process.exit(0); }
const { Miniflare } = MF, MfResponse = MF.Response;
const opts = o => (typeof MF.convertV4MiniflareOptions === 'function' ? MF.convertV4MiniflareOptions(o) : o);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b0dy-workerd-'));
const SRC = path.join(TMP, 'src'), DATA = path.join(TMP, 'data');
fs.cpSync(path.join(HERE, '..', 'src'), SRC, { recursive: true });
const IDX = path.join(SRC, 'index.js');
const anchor = 'this.core = new BookingCore({ storage: ctx.storage, env: env, waitUntil: p => ctx.waitUntil(p) });';
const ix = fs.readFileSync(IDX, 'utf8');
if (ix.indexOf(anchor) < 0) { console.log('FAIL  index.js đã đổi — cập nhật anchor của test'); process.exit(1); }
const LOGS = [];
fs.writeFileSync(IDX, ix.replace(anchor, 'this.core = new BookingCore({ storage: ctx.storage, env: env, waitUntil: p => ctx.waitUntil(p), now: () => Date.now() + Number(env.CLOCK_OFF || 0) });'));

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, maxMs) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > maxMs) return -1; await sleep(5); } return Date.now() - t0; }

const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh', d = iso => dateIn(LA, iso);
const SA = fakeServiceAccount(), SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH'];
const mem = (no, name, phone, code) => ['', no, name, '24 buổi', 24, '1:1', 'Quyết Hán', phone, 20, d('2026-08-01'), d('2027-01-01'), code];
const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
const files = {
  BA: new Spreadsheet('BA', LA, { MEMBERS: [H, mem('1', 'Hoàng Đức Nam', '0900000001', 'B901DY'), mem('2', 'Phạm Minh Tâm', '0900000002', 'B902DY'), mem('3', 'Khách Số Ba', '0900000003', 'B903DY')],
    'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']], TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']], ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]] }),
  OUT: new Spreadsheet('OUT', 'Asia/Saigon', { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] })
};
const fg = new FakeGoogle(files, { publicKey: SA.publicKey, delay: () => 300 });
const rows = () => files.OUT.getSheetByName('Sổ đặt lịch').rows.slice(4).filter(r => r[1]);
const ofRid = r => rows().filter(x => x[15] === r).length;
const OFF = dateIn(VN, '2026-10-18', '07:00').getTime() - Date.now();

function makeMf() {
  return new Miniflare(opts({
    resourcePersistencePath: DATA,
    log: undefined,
    handleStructuredLogs: l => { LOGS.push(String(l.message || '')); },
    workers: [{
      name: 'b0dy-booking-api', modulesRoot: SRC,
      modules: ['index.js', 'booking.js', 'core.js', 'sheets.js', 'crypto.js', 'http.js'].map(f => ({ type: 'ESModule', path: path.join(SRC, f) })),
      compatibilityDate: '2026-09-15',
      durableObjects: { BOOK: { className: 'Booking', useSQLite: true } },
      bindings: { BA_ID: 'BA', OUT_ID: 'OUT', ALLOW_ORIGINS: 'https://booking.b0dy.studio', SA_JSON: SA.saJson, LT_SECRET: SECRET, CLOCK_OFF: String(OFF) },
      outboundService: async req => {                     /* mọi fetch ra ngoài của Worker → Google giả */
        const h = {}; req.headers.forEach((v, k) => { h[k] = v; });
        const r = await fg.fetch(req.url, { method: req.method, headers: h, body: req.method === 'GET' ? undefined : await req.text() });
        return new MfResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
      }
    }]
  }));
}
let mf = makeMf();
async function post(body) {
  const r = await mf.dispatchFetch('http://localhost/', { method: 'POST', headers: { origin: 'https://booking.b0dy.studio', 'content-type': 'text/plain' }, body: JSON.stringify(body) });
  const m = (r.headers.get('server-timing') || '').match(/do;dur=(\d+)/);
  return Object.assign(await r.json(), { _do: m ? +m[1] : -1 });
}
const DEV = 'devWORKERDWORKERD001';
async function login(q, pin) { const f = await post({ action: 'lt_find', q, dev: DEV }); return post({ action: 'lt_verify', id: f.results[0].id, pin, remember: true, dev: DEV }); }
const BOOK = (tok, rid, picks) => ({ action: 'lt_book', dev: DEV, tok, rid, week: '2026-W43', picks });

try {
  console.log('\n== workerd: HTTP → DO → nhật ký → Google giả (300 ms/lượt) ==');
  let p = await post({ action: 'lt_ping' });
  ok('lt_ping qua HTTP: pending 0, lastError rỗng', p.ok && p.pending === 0 && p.lastError === '', p);
  const s1 = await login('duc nam', '0001');
  ok('Đăng nhập (JWT RS256 ký bằng WebCrypto của workerd, Google giả kiểm chữ ký)', s1.ok && s1.auth && !!s1.tok, s1.error || s1.detail);
  const s2 = await login('minh tam', '0002'), s3 = await login('so ba', '0003');
  await sleep(400);
  const u0 = fg.calls.batchUpdate;
  let b = await post(BOOK(s1.tok, 'ridworkerd0001', [{ date: '2026-10-19', h: 6 }, { date: '2026-10-21', h: 6 }]));
  ok('lt_book: ok, DO xử lý ' + b._do + ' ms (< 50 ms) — chưa có lệnh ghi Google nào', b.ok && b.mode === 'ticket' && b._do < 50 && fg.calls.batchUpdate === u0, [b.error, b.detail, b._do]);
  let t = await until(() => rows().length === 2, 3000);
  ok('… sổ có 2 dòng sau ' + t + ' ms (flush bằng setTimeout của DO sau khi đã trả lời)', t >= 0 && t < 1500, t);
  const c = await post({ action: 'lt_change', dev: DEV, tok: s1.tok, rid: 'ridworkerd0002', week: '2026-W43', from: { date: '2026-10-21', h: 6 }, to: { date: '2026-10-22', h: 7 } });
  ok('lt_change: ok, DO ' + c._do + ' ms', c.ok && c._do < 50, [c.error, c.why, c._do]);
  t = await until(() => rows().length === 3 && rows().some(r => r[11] === 'Đã đổi'), 3000);
  ok('… sổ có dòng Đã đổi + dòng Đổi sau ' + t + ' ms', t >= 0 && t < 2000, rows().map(r => r[4] + ' ' + r[11]));

  fg.writeStatus = 503;
  b = await post(BOOK(s2.tok, 'ridworkerd0003', [{ date: '2026-10-20', h: 8 }, { date: '2026-10-23', h: 8 }]));
  ok('Google 503: đặt vẫn ok ngay (' + b._do + ' ms)', b.ok && b._do < 50, [b.error, b._do]);
  for (let i = 0; i < 60; i++) { p = await post({ action: 'lt_ping' }); if (p.lastError) break; await sleep(50); }
  ok('lt_ping: pending 1, lastError google_503', p.pending === 1 && p.lastError === 'google_503', p);
  fg.writeStatus = 0;
  t = await until(() => ofRid('ridworkerd0003') === 2, 6000);
  ok('Hết lỗi → alarm thật của DO thử lại → đúng 2 dòng (' + t + ' ms)', t >= 0, t);

  console.log('\n== workerd: DO bị tắt khi nhật ký còn mục → chạy lại trên cùng storage ==');
  fg.writeStatus = 503;
  b = await post(BOOK(s3.tok, 'ridworkerd0004', [{ date: '2026-10-19', h: 9 }, { date: '2026-10-24', h: 9 }]));
  ok('Đặt ok khi Google lỗi', b.ok, b.error);
  await sleep(100);
  await mf.dispose();                                     /* tắt hẳn workerd: DO mất RAM, storage + alarm còn trên đĩa */
  fg.writeStatus = 0;
  mf = makeMf();
  t = await until(() => ofRid('ridworkerd0004') === 2, 6000);
  ok('Không cần lượt gọi nào: alarm đánh thức bản DO mới, nạp nhật ký, ghi nốt → đúng 2 dòng (' + t + ' ms)', t >= 0, t);
  const st = await post({ action: 'lt_boot', dev: DEV, tok: s3.tok });
  ok('Mã nhớ máy + phiếu vẫn còn sau khi khởi động lại', st.auth && st.mode === 'ticket' && st.mine.sessions.length === 2, [st.mode, st.why]);
  const again = await post(BOOK(s3.tok, 'ridworkerd0004', [{ date: '2026-10-19', h: 9 }, { date: '2026-10-24', h: 9 }]));
  await sleep(500);
  ok('Gửi lại mã cũ → dup, sổ không thêm dòng', again.ok && again.dup && ofRid('ridworkerd0004') === 2, again);
  p = await post({ action: 'lt_ping' });
  ok('Cuối: pending 0, lastError rỗng, sổ 7 dòng', p.pending === 0 && p.lastError === '' && rows().length === 7, [p, rows().length]);
  const leak = LOGS.filter(x => /0900000|Hoàng|Phạm|Khách Số/.test(x));
  ok('Nhật ký vận hành của workerd (' + LOGS.length + ' dòng, có ' + LOGS.filter(x => x.indexOf('"flush"') >= 0).length + ' dòng flush) không có tên / SĐT', LOGS.length > 0 && LOGS.some(x => x.indexOf('"flush"') >= 0) && leak.length === 0, leak.slice(0, 2));
} finally {
  try { await mf.dispose(); } catch (e) { /* bỏ qua */ }
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
