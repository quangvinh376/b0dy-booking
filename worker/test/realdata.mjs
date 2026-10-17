/* Test 3 · DỮ LIỆU THẬT (chỉ đọc): file BA thật (bản xuất cục bộ ở scratchpad, KHÔNG nằm trong repo) đi qua
   Sheets API giả (ngày → serial, giờ → phần lẻ của ngày như Google thật) vào Worker, so với LichTuan.gs đọc cùng
   dữ liệu. Không in tên, SĐT hay bất kỳ dữ liệu cá nhân nào — chỉ in số đếm và đúng/sai.
   Chạy: node test/realdata.mjs [đường dẫn fixture]   (mặc định: scratchpad/ba/fixture_ba.json; không có thì bỏ qua) */
import fs from 'fs';
import { createRequire } from 'module';
import * as C from '../src/core.js';
import { BookingCore } from '../src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from './fake_google.mjs';
const require = createRequire(import.meta.url);
const { makeEnv, Spreadsheet, dateIn } = require('../../test/gas_env.js');

const FX = process.argv[2] || '/tmp/claude-0/-home-claude/aacecc6b-f573-51ba-b532-f34e18112e07/scratchpad/ba/fixture_ba.json';
if (!fs.existsSync(FX)) { console.log('Không có fixture dữ liệu thật → bỏ qua (0 PASS, 0 FAIL)'); process.exit(0); }
const fx = JSON.parse(fs.readFileSync(FX, 'utf8'));

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  -> ' + extra : '')); }
}
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const LA = 'America/Los_Angeles', VN = 'Asia/Ho_Chi_Minh';
const vn = (iso, hm) => dateIn(VN, iso, hm).getTime();
const SECRET = 'bimat-chi-dung-cho-test-khong-phai-that-0123456789';
const SA = fakeServiceAccount();
/* Apps Script thấy ô ngày là Date (00:00 theo múi giờ file), ô giờ là chữ "HH:MM" như real_ba.js */
function gasRows(rows) { return rows.map(r => r.map(v => (v && typeof v === 'object' && v.$d) ? dateIn(LA, v.$d) : (v && typeof v === 'object' && v.$t) ? v.$t : v)); }
function outSheets() {
  return { 'Sổ đặt lịch': [[], [], [], [''].concat(C.LT.LOG_HEAD)], '_dữ liệu': [['', 4], ['', ''], [], []] };
}
const NOW = vn('2026-10-18', '07:00');
const clock = { now: NOW };
const gSheets = {}; Object.keys(fx).forEach(k => { gSheets[k] = gasRows(fx[k]); });
const gfiles = { BA: new Spreadsheet('BA', LA, gSheets), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets()) };
const env = makeEnv(gfiles, clock, { props: { BA_ID: 'BA', LT_OUT_ID: 'OUT', LT_SECRET: SECRET } });
const wSheets = JSON.parse(JSON.stringify(fx));          /* Worker: ô {$d}/{$t} → serial / phần lẻ (FakeGoogle đổi) */
const wfiles = { BA: new Spreadsheet('BA', LA, wSheets), OUT: new Spreadsheet('OUT', 'Asia/Saigon', outSheets()) };
const fg = new FakeGoogle(wfiles, { publicKey: SA.publicKey });
const wk = new BookingCore({ storage: new FakeStorage(), env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: SECRET }, fetch: fg.fetch, now: () => clock.now, opts: { FLUSH_MS: 1 } });

console.log('\n== Đọc file BA thật: Worker (Sheets API) so với Apps Script ==');
const ctx = C.weekCtx(NOW);
const gP = env.ltPersons_(env.ltMemberRows_(), ctx.today);
await wk.loadBA();
const wP = C.persons(wk.ba.members, ctx.today);
ok('Hội viên còn hiệu lực: ' + wP.length + ' người, giống hệt từng trường (cả SĐT, ngày bắt đầu / hết hạn, gói, coach)', canon(gP) === canon(wP) && wP.length === 54, gP.length + ' vs ' + wP.length);
ok('Ngày đóng cửa (B0B) giống hệt (' + Object.keys(wk.ba.closed).length + ' ngày)', canon(env.ltClosures_()) === canon(wk.ba.closed));
ok('Sức chứa / khung = ' + wk.ba.cap + ' giống hệt', env.ltCap_() === wk.ba.cap);
let trialSame = true, trialN = 0, markSame = true, markN = 0;
const weeks = [];
for (let k = -6; k <= 2; k++) weeks.push(C.weekCtx(NOW + k * 7 * 864e5));
for (const w of weeks) {
  const a = env.ltTrials_(w.days), b = C.trialsFrom(wk.ba.trialRows, w.days);
  if (canon(a) !== canon(b)) trialSame = false;
  trialN += Object.values(b).reduce((s, n) => s + n, 0);
}
ok('Tập thử chiếm chỗ (giờ hẹn kiểu giá trị giờ) giống hệt ở 9 tuần (' + trialN + ' lượt)', trialSame);
await wk.loadMarks();
for (const w of weeks) {
  const a = env.ltMarks_(w.days), b = C.marksFrom(wk.mk.cols, w.days);
  if (canon(a) !== canon(b)) markSame = false;
  markN += Object.keys(b).length;
}
ok('Điểm danh SESSION LOG (chỉ đọc 3 cột) giống hệt ở 9 tuần (' + markN + ' mục)', markSame && markN > 0);

console.log('\n== API trên dữ liệu thật: lt_find · lt_verify · lt_boot giống hệt ==');
const DEV = 'devREALREALREALREAL1';
let findSame = 0, findN = 0, verSame = 0, verN = 0, bootSame = 0;
const allOut = [];
async function both(body) {
  const g = JSON.parse(JSON.stringify(env.ltDoPost_(structuredClone(body))));
  const w = JSON.parse(JSON.stringify(await wk.api(structuredClone(body))));
  await wk.idle();
  allOut.push(JSON.stringify(w));
  return [g, w];
}
let k = 0;
for (const p of gP) {
  const q = p.toks.slice(-2).join(' ');
  const dev = 'devREALFIND' + String(k++).padStart(8, '0');
  const [g, w] = await both({ action: 'lt_find', q: q, dev: dev });
  findN++; if (canon(g) === canon(w) && w.results.length >= 1) findSame++;
}
ok('lt_find bằng tên đệm + tên của cả ' + findN + ' hội viên: kết quả + mã id giống hệt', findSame === findN, findSame + '/' + findN);
for (const p of gP.filter(x => x.phone.length >= 4).slice(0, 8)) {
  const dev = 'devREALVERIFY' + String(verN).padStart(6, '0');
  const [gf, wf] = await both({ action: 'lt_find', q: p.toks.slice(-2).join(' '), dev: dev });
  const id = wf.results.find(x => x.short === p.short) && wf.results.find(x => x.short === p.short).id;
  const [g, w] = await both({ action: 'lt_verify', id: id, pin: p.phone.slice(-4), remember: true, dev: dev });
  verN++; if (canon(g) === canon(w) && w.ok && w.auth) verSame++;
  const [gb, wb] = await both({ action: 'lt_boot', tok: w.tok, dev: dev });
  if (canon(gb) === canon(wb) && wb.auth) bootSame++;
}
ok('lt_verify (4 số cuối thật) cho ' + verN + ' hội viên: state + mã nhớ máy giống hệt', verSame === verN && verN === 8, verSame + '/' + verN);
ok('lt_boot bằng mã nhớ máy: state giống hệt (' + bootSame + '/' + verN + ')', bootSame === verN);
const [gx, wx] = await both({ action: 'lt_verify', id: (await wk.api({ action: 'lt_find', q: gP[0].toks.slice(-2).join(' '), dev: 'devREALWRONG0000001' })).results[0].id, pin: '0000', dev: 'devREALWRONG0000001' });
ok('Sai mã trên dữ liệu thật: phản hồi giống hệt', canon(gx) === canon(wx));

console.log('\n== Tìm tên gõ tới đâu ra tới đó trên dữ liệu thật (chỉ in số đếm) ==');
{
  let qn = 0, qSame = 0, shape = 0;
  /* đổi máy trước ngưỡng 150 lượt / 10 phút (đồng hồ test đứng yên) */
  const fnd = async q => {
    const [g, w] = await both({ action: 'lt_find', q: q, dev: 'devREALDYN' + String(Math.floor(qn++ / 100)).padStart(10, '0') });
    if (canon(g) === canon(w)) qSame++;
    return w;
  };
  const sg = await wk.signer(), idOf = {};
  for (const p of wP) idOf[p.key] = await sg.idOf(p.key);
  /* 26 chữ cái: số người khớp (đếm thẳng bằng findAll của Worker) · phản hồi đúng 6 dòng đầu + more */
  let maxN = 0, moreN = 0, zeroN = 0;
  for (let c = 97; c <= 122; c++) {
    const q = String.fromCharCode(c), all = C.findAll([q], wP), w = await fnd(q);
    maxN = Math.max(maxN, all.length); if (all.length > 6) moreN++; if (!all.length) zeroN++;
    if (w.ok && canon(w.results.map(x => x.id)) === canon(all.slice(0, 6).map(x => idOf[x.key])) && !!w.more === all.length > 6 && (all.length > 6 || !('more' in w))) shape++;
  }
  ok('26 chữ cái: mỗi phản hồi = 6 người xếp đầu của findAll, more khi hơn 6 (' + shape + '/26)', shape === 26, shape);
  console.log('        1 chữ cái: nhiều nhất ' + maxN + ' người khớp · ' + moreN + '/26 chữ cái có hơn 6 người (more) · ' + zeroN + '/26 không ai');
  /* từng hội viên: tên gọi một mình · họ một mình · đủ họ tên */
  let givenTop = 0, givenMore = 0, famLeak = 0, famN = 0, fullTop = 0, fullFirst = 0;
  for (const p of wP) {
    const toks = p.toks, V = toks.length >= 2 ? toks.slice(1) : toks, id = idOf[p.key];
    const wg = await fnd(toks[toks.length - 1]);
    if (wg.results.some(x => x.id === id)) givenTop++; else if (wg.more && C.findAll([toks[toks.length - 1]], wP).some(x => x.key === p.key)) givenMore++;
    if (toks.length >= 2) {
      famN++;
      await fnd(toks[0]);
      /* gõ riêng họ: chỉ được ra người này nếu tên đệm / tên của chính họ có chữ đó */
      if (C.findAll([toks[0]], wP).some(x => x.key === p.key) && !V.some(v => v.indexOf(toks[0]) >= 0)) famLeak++;
    }
    const wf = await fnd(p.name);
    if (wf.results.some(x => x.id === id)) fullTop++;
    if (wf.results.length && wf.results[0].short === p.short) fullFirst++;
  }
  ok('Tên gọi một mình: mọi hội viên ở 6 dòng đầu hoặc có more để gõ thêm (' + givenTop + ' + ' + givenMore + ' / ' + wP.length + ')', givenTop + givenMore === wP.length, [givenTop, givenMore]);
  ok('Gõ riêng họ: không hội viên nào ra nhờ họ (' + famLeak + ' / ' + famN + ')', famLeak === 0, famLeak);
  ok('Đủ họ tên: ra đúng người trong 6 dòng đầu (' + fullTop + '/' + wP.length + '), xếp đầu ' + fullFirst + '/' + wP.length, fullTop === wP.length && fullFirst === wP.length, [fullTop, fullFirst]);
  ok('Mọi lượt tìm mới (' + qn + '): phản hồi Worker = Apps Script', qSame === qn, qSame + '/' + qn);
}
const phones = gP.map(p => p.phone).filter(x => x.length >= 9);
ok('Không phản hồi nào (' + allOut.length + ' lượt) chứa SĐT hay họ tên đầy đủ', allOut.every(o => phones.every(ph => o.indexOf(ph) < 0) && gP.every(p => o.indexOf(p.name) < 0)));

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
