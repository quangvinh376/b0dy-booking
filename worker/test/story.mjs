/* "Để B0DY kể về bạn" · lt_story (17/11): câu chuyện của CHÍNH hội viên đã xác minh, từ "nguồn câu chuyện" truyền vào máy chủ (deps.stories —
   chủ studio 17/11 bỏ tab "Kể về bạn"; bản thật chưa có nguồn → story null). Khách đang tập: chỉ ở TUẦN CUỐI của gói (đặt đủ số buổi còn
   lại trong tuần, hoặc gói hết hạn trong tuần). Khách đã hết gói: tìm tên + 4 số cuối → state "ended", lt_story luôn trả (không asOf).
   Chỉ trường của dạng v2 ra trình duyệt · tên / tên gọi từ MEMBERS · nguồn lỗi → story null. Chạy: node test/story.mjs */
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
/* hội viên bịa (B9xx như các test khác) */
/* B901DY Đức Nam còn 20 buổi (chưa tới tuần cuối) · B902DY Minh Tâm · B903DY Thu Hà còn 3 buổi · B904DY Gia Bảo hết hạn 25.10 (trong tuần 43)
   · B905DY Văn Lộc hết buổi (đã hết gói) · B906DY Ngọc Diệp hết hạn 01.10 còn 3 buổi (đã hết gói) — hội viên bịa (B9xx như các test khác) */
function files() {
  const H = ['', '#', 'Tên', 'Gói', 'Số buổi', 'Loại', 'Coach', 'SĐT', 'Còn lại', 'Ngày bắt đầu', 'Ngày hết hạn', 'Mã KH', 'Khung giờ'];
  const mem = (no, name, coach, phone, code, left, exp) => ['', no, name, '24 buổi', 24, '1:1', coach, phone, left == null ? 20 : left, d('2026-08-01'), d(exp || '2027-01-01'), code, 'Toàn thời gian'];
  const ba = {
    MEMBERS: [H, mem('1', 'Hoàng Đức Nam', 'Quyết Hán', '0900000001', 'B901DY'), mem('2', 'Phạm Minh Tâm', 'Hiền Mai', '0900000002', 'B902DY'),
      mem('3', 'Lê Thu Hà', 'Quyết Hán', '0900000003', 'B903DY', 3), mem('4', 'Đỗ Gia Bảo', 'Quyết Hán', '0900000004', 'B904DY', 9, '2026-10-25'),
      mem('5', 'Vũ Văn Lộc', 'Hiền Mai', '0900000005', 'B905DY', 0), mem('6', 'Trần Ngọc Diệp', 'Quyết Hán', '0900000006', 'B906DY', 3, '2026-10-01')],
    'SESSION LOG': [['', '#', 'Ngày', 'Học viên', 'Trạng thái']], TRIAL: [['', '#', 'Ngày hẹn', 'Giờ hẹn', 'Họ tên', 'Trạng thái']],
    B0B: [['', 'LÝ DO ĐÓNG CỬA', 'NGÀY']], ' ⚙️ 2': [['', 'Sức chứa tối đa / khung', 4]]
  };
  const head = ['Mã phiếu', 'Bản', 'Tuần', 'Ngày', 'Thứ', 'Giờ', 'Hội viên', 'Tên ngắn', 'Coach', 'Loại', 'Trạng thái', 'Thao tác', 'Ghi chú', 'Lúc ghi', 'Mã yêu cầu', 'Mã KH', '_hiển thị'];
  const out = { 'Sổ đặt lịch': [[], [], [], [''].concat(head)], '_dữ liệu': [['', 4], ['', ''], [], []] };
  return { BA: new Spreadsheet('BA', LA, ba), OUT: new Spreadsheet('OUT', 'Asia/Saigon', out) };
}
/** src: Mã KH → {ver, data} | hàm (person, info) → … | null (không có nguồn — như bản thật hiện nay). Ghi lại mọi lượt hỏi nguồn. */
function world(src) {
  const clock = { now: vn('2026-10-18', '07:00') }, f = files(), fg = new FakeGoogle(f, { publicKey: SA.publicKey }), storage = new FakeStorage(), asked = [];
  const stories = src === null ? undefined : async (person, info) => {
    asked.push({ key: person.key, ended: info.ended });
    if (typeof src === 'function') return src(person, info);
    return src[person.key] || null;
  };
  const wk = new BookingCore({ storage, env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: SECRET }, fetch: fg.fetch, now: () => clock.now, opts: { FLUSH_MS: 1 }, log: () => {}, stories });
  return { clock, f, fg, wk, asked };
}
async function login(wk, q, pin, dev) {
  const f = await wk.api({ action: 'lt_find', q: q, dev: dev || DEV });
  const r = await wk.api({ action: 'lt_verify', id: f.results[0].id, pin: pin, remember: true, dev: dev || DEV });
  return { tok: r.tok, id: f.results[0].id };
}
const src = (data, ver) => ({ ver: ver == null ? '2026-10-18' : ver, data: data });
const story = (w, tok, dev) => w.wk.api({ action: 'lt_story', tok: tok, dev: dev || DEV });

console.log('\n== không có nguồn (bản thật hiện nay) ==');
{
  const w = world(null), s = await login(w.wk, 'gia bao', '0004');
  const r = await story(w, s.tok);
  ok('Không có nguồn câu chuyện → ok, story null (trang không hiện thẻ)', r.ok === true && r.story === null, r);
}

console.log('\n== khách đang tập: chỉ ở tuần cuối của gói ==');
{
  const all = { B901DY: src(SAMPLE('Nam')), B903DY: src(SAMPLE('Hà')), B904DY: src(SAMPLE('Bảo')) };
  const w = world(all);
  const nam = await login(w.wk, 'duc nam', '0001'), bao = await login(w.wk, 'gia bao', '0004', DEV2), ha = await login(w.wk, 'thu ha', '0003', 'devSTORYSTORYSTORY3');
  let r = await story(w, nam.tok);
  ok('Còn 20 buổi, chưa đặt → chưa tới tuần cuối: story null, why chua_toi, KHÔNG hỏi nguồn', r.ok && r.story === null && r.why === 'chua_toi' && !w.asked.some(x => x.key === 'B901DY'), r);
  r = await story(w, bao.tok, DEV2);
  ok('Gói hết hạn 25.10 (CN của tuần đang đặt 43) → tuần cuối: có câu chuyện', r.ok && r.story && r.story.v === 2 && r.story.sessions.length === 86 && r.ended === false, r);
  r = await story(w, ha.tok, 'devSTORYSTORYSTORY3');
  ok('Còn 3 buổi, chưa đặt buổi nào tuần này → chưa phải tuần cuối', r.ok && r.story === null && r.why === 'chua_toi', r);
  const st = await w.wk.api({ action: 'lt_boot', tok: ha.tok, dev: 'devSTORYSTORYSTORY3' });
  const b1 = await w.wk.api({ action: 'lt_book', tok: ha.tok, dev: 'devSTORYSTORYSTORY3', rid: 'ridSTORYHA0001', week: st.week.key, base: st.mine.ver, picks: [{ date: '2026-10-20', h: 7 }, { date: '2026-10-22', h: 7 }] });
  r = await story(w, ha.tok, 'devSTORYSTORYSTORY3');
  ok('… đặt 2 / 3 buổi còn lại → vẫn chưa', b1.ok && r.story === null && r.why === 'chua_toi', [b1.error, r]);
  const b2 = await w.wk.api({ action: 'lt_book', tok: ha.tok, dev: 'devSTORYSTORYSTORY3', rid: 'ridSTORYHA0002', week: st.week.key, base: b1.mine.ver, picks: [{ date: '2026-10-24', h: 7 }] });
  r = await story(w, ha.tok, 'devSTORYSTORYSTORY3');
  ok('… thêm buổi thứ 3 → đặt đủ 3 / 3 buổi còn lại trong tuần → tuần cuối: có câu chuyện', b2.ok && r.story && r.story.sessions.length === 86, [b2.error, r]);
  const ctx = C.weekCtx(vn('2026-10-21', '08:00'));
  ok('lastWeek: buổi đã qua trước hôm nay không tính (2 buổi còn lại, một buổi T2 đã qua → chưa đủ)',
     C.lastWeek(ctx, { left: 2, exp: '' }, { sessions: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-23', h: 7 }] }) === false &&
     C.lastWeek(ctx, { left: 1, exp: '' }, { sessions: [{ date: '2026-10-19', h: 7 }, { date: '2026-10-23', h: 7 }] }) === true &&
     C.lastWeek(ctx, { left: 9, exp: '2026-10-26' }, { sessions: [] }) === false && C.lastWeek(ctx, { left: 9, exp: '2026-10-25' }, { sessions: [] }) === true);
  /* buổi hôm nay đã điểm danh (SESSION LOG): "còn lại" đã trừ buổi đó → không đếm lại nó trong số buổi đã đặt từ hôm nay */
  const S2 = { sessions: [{ date: '2026-10-21', h: 7 }, { date: '2026-10-23', h: 7 }] };
  ok('lastWeek: buổi hôm nay đã điểm danh không đếm lại (còn 2 · đặt hôm nay + T6 · hôm nay đã tập → chưa phải tuần cuối)',
     C.lastWeek(ctx, { name: 'Tên Giả', left: 2, exp: '' }, S2, { 'Tên Giả|2026-10-21': 1 }) === false &&
     C.lastWeek(ctx, { name: 'Tên Giả', left: 1, exp: '' }, S2, { 'Tên Giả|2026-10-21': 1 }) === true &&
     C.lastWeek(ctx, { name: 'Tên Giả', left: 2, exp: '' }, S2, { 'Người Khác|2026-10-21': 1 }) === true);
}

console.log('\n== khách đã hết gói: vào thẳng hành trình ==');
{
  const loc = Object.assign({ coach: 'Hiền Mai', name: 'Tên Giả Trong Dữ Liệu', call: 'X', asOf: '2026-12-31', phone: '0900000005', secret: 'x' }, SAMPLE('Lộc'), { closing: 'Hẹn Lộc ở chương sau.' });
  const w = world({ B905DY: src(loc, 'hd-2026-08') });
  const f = await w.wk.api({ action: 'lt_find', q: 'van loc', dev: DEV });
  const v = await w.wk.api({ action: 'lt_verify', id: f.results[0].id, pin: '0005', remember: true, dev: DEV });
  ok('Tìm thấy + 4 số cuối → state ended', f.results.length === 1 && v.ok && v.ended === true && !!v.tok, v);
  const r = await story(w, v.tok);
  ok('lt_story → có câu chuyện, ended: true (không xét tuần cuối)', r.ok && r.ended === true && r.story && r.story.sessions.length === 86, r);
  ok('… tên từ MEMBERS ("Văn Lộc"), tên gọi lạ bị bỏ, coach theo dữ liệu, code / id / ver', r.story.name === 'Văn Lộc' && r.story.call === '' && r.story.coach === 'Hiền Mai' &&
     r.story.code === 'B905DY' && r.story.id === f.results[0].id && r.story.ver === 'hd-2026-08', [r.story.name, r.story.call, r.story.coach, r.story.code, r.story.ver]);
  ok('… bỏ asOf (kể tới buổi cuối) · có câu kết · chỉ trường dạng v2 (phone / secret không ra)', !('asOf' in r.story) && r.story.closing === 'Hẹn Lộc ở chương sau.' &&
     Object.keys(r.story).sort().join(',') === 'body,call,closing,coach,code,ended,goals,id,lifts,load,name,note,pullup,room,sessions,v,ver' && r.story.ended === true, Object.keys(r.story));
  const M = KE.derive(r.story), L = KE.script(M, { state: 'ended' });
  ok('… trang dựng được: kể tới 16.10, màn cuối = câu kết', M && M.asOf === '2026-10-16' && L[L.length - 1].id === 'end', M && [M.asOf, L.map(x => x.id).slice(-2)]);
  ok('… nguồn được hỏi đúng người, đúng cờ ended', w.asked.length === 1 && w.asked[0].key === 'B905DY' && w.asked[0].ended === true, w.asked);
  const w2 = world({}), f2 = await w2.wk.api({ action: 'lt_find', q: 'ngoc diep', dev: DEV });
  const v2 = await w2.wk.api({ action: 'lt_verify', id: f2.results[0].id, pin: '0006', dev: DEV });
  const r2 = await story(w2, v2.tok);
  ok('Hết hạn còn 3 buổi, nguồn không có câu chuyện → ended, story null (trang: màn "gói đã kết thúc")', v2.ended === true && v2.me.left === 3 && r2.ok && r2.story === null && r2.ended === true, [v2, r2]);
}

console.log('\n== đúng người · dữ liệu hỏng · nguồn lỗi ==');
{
  const w = world({ B904DY: src(SAMPLE('Bảo')) }), a = await login(w.wk, 'gia bao', '0004'), b = await login(w.wk, 'minh tam', '0002', DEV2);
  let r = await story(w, b.tok, DEV2);
  ok('Hội viên khác (không có câu chuyện, chưa tới tuần cuối) → null, không thấy câu chuyện người khác', r.ok && r.story === null);
  r = await w.wk.api({ action: 'lt_story', tok: a.tok, dev: DEV2 });
  ok('Mã nhớ máy của máy khác → het_phien', r.ok === false && r.error === 'het_phien');
  r = await w.wk.api({ action: 'lt_story', dev: DEV });
  ok('Không có mã nhớ máy → het_phien', r.ok === false && r.error === 'het_phien');
  r = await w.wk.api({ action: 'lt_story', tok: a.tok });
  ok('Không có mã máy → thieu_may', r.ok === false && r.error === 'thieu_may');
  for (const [label, data] of [['dạng v1', Object.assign(SAMPLE('Bảo'), { v: 1 })], ['không phải object', '{"v":2}'], ['mảng', [SAMPLE('Bảo')]], ['null', null]]) {
    const wx = world({ B904DY: src(data) }), sx = await login(wx.wk, 'gia bao', '0004');
    const rx = await story(wx, sx.tok);
    ok('Dữ liệu ' + label + ' → null', rx.ok && rx.story === null, rx.story && Object.keys(rx.story));
  }
  const we = world(() => { throw new Error('nguon_hong'); }), se = await login(we.wk, 'gia bao', '0004');
  r = await story(we, se.tok);
  ok('Nguồn câu chuyện lỗi → ok, story null (trang không hiện thẻ, không lỗi hệ thống)', r.ok === true && r.story === null, r);
  const wv = world({ B904DY: { data: SAMPLE('Bảo') } }), sv = await login(wv.wk, 'gia bao', '0004');
  r = await story(wv, sv.tok);
  ok('Nguồn không ghi phiên bản → phiên bản = ngày bắt đầu gói (một chương / hợp đồng)', r.story && r.story.ver === '2026-08-01', r.story && r.story.ver);
  const w3 = world({ B904DY: src(Object.assign({ call: 'Gia Bảo' }, SAMPLE('Bảo'))) }), s3 = await login(w3.wk, 'gia bao', '0004');
  ok('Tên gọi trong dữ liệu là một phần của tên → giữ', (await story(w3, s3.tok)).story.call === 'Gia Bảo');
}

console.log('\n== QC: dữ liệu giả hợp lệ ==');
{
  Object.keys(STORIES).forEach(k => {
    ok('QC ' + k + ' · dạng v2, kể được', STORIES[k][2].v === 2 && !!KE.derive(Object.assign({ name: 'Tên Thử', coach: 'Coach' }, STORIES[k][2])));
  });
}

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
