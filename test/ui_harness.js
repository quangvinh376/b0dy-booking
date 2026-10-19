/* Khung test giao diện: máy chủ tĩnh cho thư mục trang + máy chủ API giả chạy CHÍNH logic backend/LichTuan.gs
   (môi trường Apps Script giả gas_env.js) với dữ liệu bịa. Playwright chặn request tới API_URL và trả lời bằng ltDoPost_.
   Không có khách thật, không SĐT thật. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeEnv, Spreadsheet, dateIn } = require('./gas_env');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://b0dy-booking-api.little-bonus-1d87.workers.dev/';
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ics': 'text/calendar' };

function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

/* ---------- dữ liệu bịa ---------- */
const NUMS = ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Mười Một', 'Mười Hai', 'Mười Ba', 'Mười Bốn', 'Mười Lăm', 'Mười Sáu'];
const HEAD_M = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Đơn giá buổi', 'Coach', 'SĐT', 'Người bán gói', 'Ngày ký', 'Ghi chú', 'Đã tập', 'Còn lại', 'Trạng thái', 'Ngày bắt đầu', 'Ngày kết thúc', 'Ngày hết hạn', 'Mã KH', '_key'];
function mrow(no, name, pkg, kind, coach, phone, left, start, exp, code) {
  return ['', no, name, pkg, parseInt(pkg, 10), kind, 300000, coach, phone, '', '', '', 0, left, '', start ? d(start) : '', '',
    exp === '' ? '' : (typeof exp === 'string' && exp.indexOf('/') > 0 ? exp : d(exp)), code, name + '|' + start];
}
function baSheets(opt) {
  opt = opt || {};
  const members = [['', '— MEMBERS'], ['', 'test'], [], [], HEAD_M,
    mrow('901', 'Hoàng Đức Nam', '48 buổi', '1:1', 'Quyết Hán', '0900000001', 10, '2026-07-01', '2026-11-21', 'B901DY'),
    mrow('902', 'Nguyễn Khải Linh', '48 buổi', '1:2', 'Quyết Hán', '0900000002', 12, '2026-07-01', '2027-01-01', 'B902DY'),
    mrow('903', 'Trần Gia Bảo Linh', '24 buổi', '1:1', 'Hiền Mai', '0900000003', 5, '2026-08-01', '21/10/26', 'B903DY'),
    mrow('904', 'Lê Mỹ Ngọc', '36 buổi', '1:1', 'Khải Phan', '0900000004', 30, '2026-10-07', '2027-02-28', 'B904DY'),
    mrow('905', 'Phan Thị Hà', '24 buổi', '1:1', 'Bích Ngọc', '0900000005', 24, '2026-10-21', '2027-01-01', 'B905DY'),
    mrow('906', 'Đỗ Văn Hưng', '12 buổi', '1:1', 'Lâm Nguyễn', '0900000006', 1, '2026-08-01', '2026-12-01', 'B906DY'),
    mrow('907', 'Bùi Không Số', '24 buổi', '1:1', 'Bích Ngọc', '', 10, '2026-08-01', '2027-01-01', 'B907DY'),
    mrow('908', 'Hoàng Đức Nam', '12 buổi', '1:1', 'Lâm Nguyễn', '0900000008', 6, '2026-08-01', '2027-01-01', 'B908DY')
  ];
  for (let i = 1; i <= 16; i++) members.push(mrow('9' + (50 + i), 'Khách Thử ' + NUMS[i - 1],
    '48 buổi', '1:1', ['Quyết Hán', 'Hiền Mai', 'Khải Phan', 'Lâm Nguyễn'][i % 4], '09100000' + String(i).padStart(2, '0'), 30, '2026-07-01', '2027-03-01', 'B9' + (50 + i) + 'DY'));
  const LH = ['', '#', 'Ngày', 'Thứ', 'Khung giờ', 'Coach', 'Mã coach', 'Học viên', 'Mã HV', 'Loại', 'Khung', 'Trạng thái', '_h', '_tuần', 'Ký điện tử', '_mrow'];
  const log = [['', '— SESSION LOG'], ['', 'test'], [], LH].concat(opt.marks || []);
  const TH = ['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ & tên / Username', 'Số điện thoại', 'Ghi chú (không bắt buộc)', 'Trạng thái', 'Coach tiếp nhận'];
  const trial = [['', '— TRIAL'], ['', 'test'], [], TH, ['', '01', d('2026-10-21'), '20:00', 'Khách tập thử', '0911111111', '', 'Chờ xác nhận', '']];
  const b0b = [['', '— B0B'], [], ['', 'CA', 'GIỜ', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], ['', 'A', '08:00', 2, 2, 2, 2, 2, 2, ''],
    [], ['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']].concat((opt.closures || []).map(c => ['', c[1], c[0]]));
  const cfg = [['', '— CONFIG 2'], [], [], ['', 'Coach', 'Giai đoạn', '% Com'], ['', 'Quyết Hán', '', 0.23],
    [], ['', '— THÔNG SỐ VẬN HÀNH'], ['', 'Sức chứa tối đa / khung', 4], ['', 'Giờ mở cửa', '06:00 – 21:00']];
  return { 'MEMBERS': members, 'SESSION LOG': log, 'TRIAL': trial, 'B0B': b0b, ' ⚙️ 2': cfg };
}
function outSheets() {
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  return {
    'Bảng lịch tập': [['', '— LỊCH TẬP TUẦN']],
    'Sổ đặt lịch': [['', '— SỔ ĐẶT LỊCH'], ['', 'mô tả'], [], [''].concat(head)],
    '_dữ liệu': [['SỨC CHỨA / KHUNG', 4], ['CẬP NHẬT', ''], [], ['Hội viên', 'Tên ngắn', 'Coach', 'Còn lại', 'Hết hạn', 'Mã KH', '_hiển thị']]
  };
}
function backend(nowMs, opt) {
  const clock = { now: nowMs };
  const files = { BA: new Spreadsheet('BA', LA, baSheets(opt)), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets()) };
  files.OUT.title = '[B0DY Studio] Lịch tập tuần';
  const env = makeEnv(files, clock, { props: { BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: 'bimat-test-khong-dung-that-0123456789' } });
  const t = { env, clock, files, log: files.OUT.getSheetByName('Sổ đặt lịch'), calls: [], fail: null, delay: 0 };
  /* đặt hộ các khách thử để bảng có ô đầy / còn 1 (qua đúng API, không ghi tay) */
  t.fill = function (bookings) {
    const devs = {};
    bookings.forEach((b, i) => {
      const who = b[0], dev = 'fillDEV' + String(NUMS.indexOf(who) + 1).padStart(12, '0');
      let tok = devs[who];
      if (!tok) {
        const f = env.ltDoPost_({ action: 'lt_find', q: 'thu ' + who, dev });
        const id = f.results && f.results[0] && f.results[0].id;
        const n = NUMS.indexOf(who) + 1;
        const v = env.ltDoPost_({ action: 'lt_verify', id, pin: String(n).padStart(4, '0'), remember: true, dev });
        if (!v.ok) throw new Error('fill login ' + who + ' ' + JSON.stringify(v).slice(0, 200));
        tok = devs[who] = v.tok;
      }
      const r = env.ltDoPost_({ action: 'lt_book', tok, dev, rid: 'fill' + String(i).padStart(10, '0') + Math.random().toString(36).slice(2, 8), week: b[1], picks: b[2] });
      if (!r.ok) throw new Error('fill book ' + who + ' ' + JSON.stringify({ e: r.error, w: r.why, full: r.full }));
    });
  };
  t.rows = () => t.log.rows.slice(4).filter(r => r[1]);
  return t;
}
async function attach(page, t) {
  /* kênh live (1.2.0): máy chủ live giả cho trang mở với ?live (không có ?live trang local không nối — app.js · LIVE_ORIGIN) —
     chào {t:'hi', n:1}, trả 'pong'; test đẩy tin bằng t.liveSend(m) ·
     t.liveRefuse = true → đóng ngay khi nối (như Worker cũ không có /live) · t.liveConns / t.liveUrls: số lần / địa chỉ trang nối */
  t.liveWs = t.liveWs || []; t.liveConns = t.liveConns || 0; t.liveUrls = t.liveUrls || [];
  t.liveSend = m => { t.liveWs.forEach(ws => { try { ws.send(JSON.stringify(m)); } catch (e) { /* đã đóng */ } }); };
  await page.routeWebSocket(u => /\/live\?dev=/.test(String(u)), ws => {
    t.liveConns++; t.liveUrls.push(ws.url());
    if (t.liveRefuse) { ws.close({ code: 1006, reason: 'khong co' }); return; }
    t.liveWs.push(ws);
    ws.onMessage(m => { if (m === 'ping') ws.send('pong'); });
    ws.onClose(() => { t.liveWs = t.liveWs.filter(x => x !== ws); });
    ws.send(JSON.stringify({ t: 'hi', r: 0, n: 1 }));
  });
  await page.route(API + '**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors() }); return; }
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch (e) { /* để trống */ }
    t.calls.push(body.action);
    if (t.delay) await new Promise(r => setTimeout(r, t.delay));
    const f = typeof t.fail === 'function' ? t.fail(body) : t.fail;
    if (f === 'net') { await route.abort('failed'); return; }
    if (f === 'net-after') {   /* máy chủ ghi xong nhưng phản hồi mất trên đường về */
      t.env.ltDoPost_(body); await route.abort('failed'); return;
    }
    const out = JSON.parse(JSON.stringify(t.env.ltDoPost_(body)));
    await route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors()), body: JSON.stringify(out) });
  });
}
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }; }

module.exports = { startServer, backend, attach, vn, API, ROOT };
