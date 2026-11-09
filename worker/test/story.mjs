/* "Để B0DY kể về bạn" · lt_story (09/11): đọc tab "Kể về bạn" của file Lịch tập tuần, chỉ trả câu chuyện của CHÍNH hội viên đã xác minh.
   Chưa có tab · chưa có hàng · hàng hỏng → story: null · tên / tên gọi từ MEMBERS · mã cũ của khách gia hạn khớp · bộ nhớ 5 phút ·
   Google lỗi: dùng bản cũ nếu có. Chạy: node test/story.mjs */
import { createRequire } from 'module';
import { BookingCore } from '../src/booking.js';
import * as C from '../src/core.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
import { STORIES, SAMPLE } from '../../qc-ke.js';
const require = createRequire(import.meta.url);
const { Spreadsheet, dateIn } = require('../../test/gas_env.js');
const KE = require('../../ke-core.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 500) : '')); }
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const d = iso => dateIn(LA, iso);
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SA = fakeServiceAccount();
const SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
const DEV = 'devSTORYSTORYSTORY1', DEV2 = 'devSTORYSTORYSTORY2';
const TAB = C.LT.STORY;
const HEAD = ['Mã KH', 'Phiên bản', 'Cập nhật', 'Dữ liệu (JSON)'];
/* hội viên bịa (B9xx như các test khác) */
function files(storyRows) {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH', 'Khung giờ'];
  const mem = (no, name, coach, phone, code) => ['', no, name, '24 buổi', 24, '1:1', coach, phone, 20, d('2026-08-01'), d('2027-01-01'), code, 'Toàn thời gian'];
  const ba = {
    MEMBERS: [H, mem('1', 'Hoàng Đức Nam', 'Quyết Hán', '0900000001', 'B901DY'), mem('2', 'Phạm Minh Tâm', 'Hiền Mai', '0900000002', 'B902DY')],
    'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']], TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']], ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]]
  };
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  const out = { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] };
  if (storyRows) out[TAB] = [HEAD].concat(storyRows);
  return { BA: new Spreadsheet('BA', LA, ba), OUT: new Spreadsheet('OUT', 'Asia/Saigon', out) };
}
function world(storyRows) {
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(storyRows), fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage();
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: SECRET }, fetch: fg.fetch, now: () => clock.now, opts: { FLUSH_MS: 1 }, log: () => {} });
  return { clock, f, fg, wk };
}
async function login(wk, q, pin, dev) {
  const f = await wk.api({ action: 'lt_find', q: q, dev: dev || DEV });
  const r = await wk.api({ action: 'lt_verify', id: f.results[0].id, pin: pin, remember: true, dev: dev || DEV });
  return { tok: r.tok, id: f.results[0].id };
}
const J = o => JSON.stringify(o);
const row = (code, ver, data) => [code, ver, '2026-10-18 05:00', typeof data === 'string' ? data : J(data)];
const story = (w, tok, dev) => w.wk.api({ action: 'lt_story', tok: tok, dev: dev || DEV });

console.log('\n== chưa có tab / chưa có hàng ==');
{
  const w = world(null), s = await login(w.wk, 'duc nam', '0001');
  let r = await story(w, s.tok);
  ok('Chưa có tab "Kể về bạn" → ok, story null (không lỗi)', r.ok === true && r.story === null, r);
  /* chủ studio tạo tab sau khi deploy: nhận sau TTL, không cần deploy lại */
  const tmp = new Spreadsheet('x', 'Asia/Saigon', { [TAB]: [HEAD, row('B901DY', '2026-10-18', SAMPLE('Nam'))] });
  w.f.OUT.sheets.push(tmp.getSheets()[0]);
  r = await story(w, s.tok);
  ok('Tab vừa tạo, chưa hết 5 phút → vẫn null (bộ nhớ)', r.ok && r.story === null);
  w.clock.now += 5 * 60e3 + 1;
  r = await story(w, s.tok);
  ok('Sau 5 phút → đọc được câu chuyện', r.ok && r.story && r.story.v === 1 && r.story.sessions.length === 86, r);
  const w2 = world([]), s2 = await login(w2.wk, 'duc nam', '0001');
  r = await story(w2, s2.tok);
  ok('Có tab, chưa có hàng → null', r.ok && r.story === null);
}

console.log('\n== đúng người, đúng tên ==');
{
  const w = world([row('B901DY', '2026-10-18', Object.assign({ coach: 'Hiền Mai', name: 'Tên Giả Trong JSON', call: 'X' }, SAMPLE('Nam')))]);
  const a = await login(w.wk, 'duc nam', '0001'), b = await login(w.wk, 'minh tam', '0002', DEV2);
  let r = await story(w, a.tok);
  ok('Hội viên có hàng → story', r.ok && r.story && r.story.sessions.length === 86);
  ok('Tên lấy từ MEMBERS (tên gọi "Đức Nam", không theo JSON) · tên gọi lạ trong JSON bị bỏ → B0B gọi "Nam"', r.story.name === 'Đức Nam' && r.story.call === '' && KE.derive(r.story).call === 'Nam', [r.story.name, r.story.call]);
  const w3 = world([row('B901DY', '1', Object.assign({ call: 'Đức Nam' }, SAMPLE('Nam')))]), s3 = await login(w3.wk, 'duc nam', '0001');
  ok('Tên gọi trong JSON là một phần của tên → giữ', (await story(w3, s3.tok)).story.call === 'Đức Nam');
  ok('Coach theo JSON (người viết nhận xét)', r.story.coach === 'Hiền Mai');
  ok('id = id của lt_find (không lộ Mã KH khác) · code = mã của chính mình · ver', r.story.id === a.id && r.story.code === 'B901DY' && r.story.ver === '2026-10-18', [r.story.id, a.id, r.story.code, r.story.ver]);
  ok('Trang dựng được hành trình từ câu trả lời', !!KE.derive(r.story) && KE.script(KE.derive(r.story), null).length === 22);
  r = await story(w, b.tok, DEV2);
  ok('Hội viên khác (không có hàng) → null, không thấy câu chuyện người khác', r.ok && r.story === null);
  r = await w.wk.api({ action: 'lt_story', tok: a.tok, dev: DEV2 });
  ok('Mã nhớ máy của máy khác → het_phien', r.ok === false && r.error === 'het_phien');
  r = await w.wk.api({ action: 'lt_story', dev: DEV });
  ok('Không có mã nhớ máy → het_phien', r.ok === false && r.error === 'het_phien');
  r = await w.wk.api({ action: 'lt_story', tok: a.tok });
  ok('Không có mã máy → thieu_may', r.ok === false && r.error === 'thieu_may');
  const nocoach = world([row('b901dy', 7, (() => { const o = SAMPLE('Nam'); delete o.coach; return o; })())]);
  const c = await login(nocoach.wk, 'duc nam', '0001');
  r = await story(nocoach, c.tok);
  ok('Không ghi coach → coach của MEMBERS · mã gõ chữ thường vẫn khớp · phiên bản số → chuỗi', r.story && r.story.coach === 'Quyết Hán' && r.story.ver === '7', r.story && [r.story.coach, r.story.ver]);
}

console.log('\n== hàng hỏng bị bỏ · hàng dưới thắng ==');
{
  const good = SAMPLE('Nam'), v2 = Object.assign({}, good, { v: 2 }), arr = J([good]);
  const cases = [['JSON sai', '{"v":1,'], ['dạng v2', J(v2)], ['mảng', arr], ['thiếu sessions', J({ v: 1 })], ['quá 50.000 ký tự', J(Object.assign({}, good, { note: 'x'.repeat(C.LT.STORY_MAX) }))]];
  for (const [label, data] of cases) {
    const w = world([row('B901DY', '1', data)]), s = await login(w.wk, 'duc nam', '0001');
    const r = await story(w, s.tok);
    ok('Hàng ' + label + ' → null', r.ok && r.story === null, r.story && Object.keys(r.story));
  }
  const w = world([row('B901DY', 'cu', SAMPLE('Cũ')), row('B901DY', 'hong', '{x'), row('B901DY', 'moi', SAMPLE('Mới'))]), s = await login(w.wk, 'duc nam', '0001');
  const r = await story(w, s.tok);
  ok('Nhiều hàng cùng mã → hàng hợp lệ dưới cùng', r.story && r.story.ver === 'moi' && /^Mới /.test(r.story.note), r.story && r.story.ver);
}

console.log('\n== khách gia hạn: mã cũ ==');
{
  const list = { alias: { B800DY: 'B901DY' } }, me = { key: 'B901DY' };
  ok('Hàng ghi mã cũ (bí danh) khớp khoá hiện tại', C.storyOf([row('B800DY', '1', SAMPLE('Nam'))], list, me) !== null);
  ok('Mã của người khác không khớp', C.storyOf([row('B902DY', '1', SAMPLE('Nam'))], list, me) === null);
  ok('Hàng trống / thiếu ô → bỏ', C.storyOf([[], [''], ['B901DY'], null], list, me) === null);
}

console.log('\n== Google lỗi ==');
{
  const w = world([row('B901DY', '1', SAMPLE('Nam'))]), s = await login(w.wk, 'duc nam', '0001');
  let r = await story(w, s.tok);
  ok('Lần đầu đọc được', r.story && r.story.ver === '1');
  w.f.OUT.getSheetByName(TAB).rows[1] = row('B901DY', '2', SAMPLE('Nam'));
  w.clock.now += 5 * 60e3 + 1; w.fg.failRead = 5;
  r = await story(w, s.tok);
  ok('Hết hạn bộ nhớ + Google lỗi mạng → vẫn trả bản cũ', r.ok && r.story && r.story.ver === '1', r);
  w.fg.failRead = 0; w.clock.now += 5 * 60e3 + 1;
  r = await story(w, s.tok);
  ok('Google lành lại → bản mới', r.story && r.story.ver === '2');
  const w2 = world([row('B901DY', '1', SAMPLE('Nam'))]), s2 = await login(w2.wk, 'duc nam', '0001');
  w2.fg.failRead = 5;
  r = await story(w2, s2.tok);
  ok('Chưa có bản nào + Google lỗi → lỗi hệ thống (trang không hiện thẻ)', r.ok === false && r.error === 'loi_he_thong', r);
}

console.log('\n== rà soát 09/11: tên tab dạng tổ hợp · hoa thường · trường lạ · Google lỗi không gọi dồn ==');
{
  const w = world(null), s = await login(w.wk, 'duc nam', '0001');
  const tmp = new Spreadsheet('x', 'Asia/Saigon', { [TAB.normalize('NFD')]: [HEAD, row('B901DY', '1', Object.assign({ phone: '0900000001', secret: 'x' }, SAMPLE('Nam')))] });
  w.f.OUT.sheets.push(tmp.getSheets()[0]);
  const r = await story(w, s.tok);
  ok('Tab gõ dạng tổ hợp (NFD) vẫn nhận', r.story && r.story.sessions.length === 86, r);
  ok('Chỉ trả trường của dạng v1 — trường lạ trong JSON (phone, secret) không ra trình duyệt', r.story && !('phone' in r.story) && !('secret' in r.story) &&
     Object.keys(r.story).sort().join(',') === 'asOf,body,call,coach,code,goals,id,lifts,load,name,note,pullup,room,sessions,v,ver', r.story && Object.keys(r.story));
}
{
  const list = { alias: {} };
  ok('Mã KH chữ thường ở MEMBERS khớp hàng mã chữ hoa (và ngược lại)', C.storyOf([row('B901DY', '1', SAMPLE('Nam'))], list, { key: 'b901dy' }) !== null &&
     C.storyOf([row('b901dy', '1', SAMPLE('Nam'))], list, { key: 'B901DY' }) !== null);
}
{
  const w = world([row('B901DY', '1', SAMPLE('Nam'))]), s = await login(w.wk, 'duc nam', '0001');
  await story(w, s.tok);
  /* đếm riêng lượt dò tab của file Lịch tập tuần (getStories) — lượt đọc BA của getBA không tính */
  let n = 0; const m0 = w.wk.g.meta.bind(w.wk.g); w.wk.g.meta = id => { if (id === 'OUT') n++; return m0(id); };
  w.clock.now += 5 * 60e3 + 1; w.fg.failRead = 100;
  let r = await story(w, s.tok);
  const n1 = n;
  r = await story(w, s.tok); r = await story(w, s.tok);
  ok('Google lỗi → bản cũ; các lượt ngay sau không gọi lại Google (chờ 30 s)', r.story && r.story.ver === '1' && n1 === 1 && n === n1, [n1, n]);
  w.fg.failRead = 0; w.clock.now += 31e3;
  r = await story(w, s.tok);
  ok('… sau 30 s thử lại Google, lành → đọc mới', r.story && n === n1 + 1, n);
}

console.log('\n== QC: dữ liệu giả hợp lệ ==');
{
  Object.keys(STORIES).forEach(k => {
    const raw = J(STORIES[k][2]);
    ok('QC ' + k + ' · JSON < 50.000 ký tự (' + raw.length + ')', raw.length < C.LT.STORY_MAX);
    ok('QC ' + k + ' · kể được', !!KE.derive(Object.assign({ name: 'Tên Thử', coach: 'Coach' }, STORIES[k][2])));
  });
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
