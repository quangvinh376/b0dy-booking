/* "Để B0DY kể về bạn" trên dữ liệu THẬT của cả phòng — chỉ in SỐ ĐẾM (không tên, không SĐT, không câu chữ của ai).
   Dữ liệu: .local/fixture_ba.json (tools/ba_fixture.py: MEMBERS, SESSION LOG) + .local/fixture_ke.json (tools/ke_fixture.py: logbook app
   coach "Khách của …" + "Tổng hợp bài" + "Sổ đặt lịch"). Hai thư mục .local/ bị .gitignore — dữ liệu thật không vào repo.

   Người = đúng cách máy chủ nhận diện (core.js · persons: khách đang tập + persons(...).ended khách đã hết gói). Mỗi người → dữ liệu câu
   chuyện dạng v2 (ke_facts.mjs — cũng là bản mẫu "nguồn câu chuyện" đọc thẳng từ Google Sheets, nếu chủ studio chọn giữ Sheets) → ke-core
   (derive + script) → đếm: kể được không, khoảnh khắc nào xuất hiện, độ phủ giờ / logbook / số đo, biệt danh.

   node tools/ke_real.mjs [YYYY-MM-DD hôm nay]                                                                                        */
import fs from 'fs';
import { createRequire } from 'module';
import * as C from '../worker/src/core.js';
import { BookingCore } from '../worker/src/booking.js';
import { FakeGoogle, FakeStorage, fakeServiceAccount } from '../worker/test/fake_google.mjs';
import { factsFor, indexSources } from './ke_facts.mjs';
const require = createRequire(import.meta.url);
const { Spreadsheet } = require('../test/gas_env.js');
const KE = require('../ke-core.js');

const BA = new URL('../.local/fixture_ba.json', import.meta.url).pathname, KF = new URL('../.local/fixture_ke.json', import.meta.url).pathname;
if (!fs.existsSync(BA) || !fs.existsSync(KF)) { console.log('Thiếu .local/fixture_ba.json hoặc .local/fixture_ke.json → xem đầu tệp'); process.exit(1); }
const fx = JSON.parse(fs.readFileSync(BA, 'utf8')), kx = JSON.parse(fs.readFileSync(KF, 'utf8'));
const TODAY = process.argv[2] || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const NOW = Date.parse(TODAY + 'T12:00:00+07:00');

/* MEMBERS đi qua đúng đường đọc của Worker (Sheets API giả) → danh sách người như máy chủ thật */
const SA = fakeServiceAccount();
const out = { 'Sổ đặt lịch': [[], [], [], [''].concat(C.LT.LOG_HEAD)], '_dữ liệu': [['', 4], ['', ''], [], []] };
const fg = new FakeGoogle({ BA: new Spreadsheet('BA', 'America/Los_Angeles', JSON.parse(JSON.stringify(fx))), OUT: new Spreadsheet('OUT', 'Asia/Saigon', out) }, { publicKey: SA.publicKey });
const wk = new BookingCore({ storage: new FakeStorage(), env: { BA_ID: 'BA', OUT_ID: 'OUT', SA_JSON: SA.saJson, LT_SECRET: 'chi-dem-so-khong-ky-gi-0123456789abcdef' },
  fetch: fg.fetch, now: () => NOW, opts: { FLUSH_MS: 1 }, log: () => {} });
await wk.loadBA();
const ctx = C.weekCtx(NOW), list = C.persons(wk.ba.members, ctx.today), ended = list.ended;
const src = indexSources({ sessionLog: fx['SESSION LOG'], logbook: kx.logbook, summary: kx.summary, ledger: kx.ledger }, list);

const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
const cnt = () => ({});
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
function report(label, people, isEnded) {
  const R = { n: people.length, told: 0, under: 0, ses: 0, sesH: 0, sesLB: 0, sesSince: 0, lbOff: 0, mom: cnt(), nick: cnt(), noData: 0, weeks: [], moments: [], qs: [], unmatched: 0 };
  for (const p of people) {
    const f = factsFor(p, src, { today: TODAY, ended: isEnded });
    if (!f) { R.noData++; continue; }
    R.ses += f.sessions.length; R.sesH += f.sessions.filter(x => x[1] !== null).length;
    const since = f.sessions.filter(x => x[0] >= '2026-09-26').length; R.sesSince += since;
    const sd = new Set(f.sessions.map(x => x[0]));
    R.sesLB += Object.keys(f.load).filter(d => d >= '2026-09-26' && sd.has(d)).length;
    R.lbOff += Object.keys(f.load).filter(d => !sd.has(d)).length;
    const st = Object.assign({ name: p.call, coach: p.coach }, f);
    if (isEnded) { delete st.asOf; st.ended = true; }                 /* như máy chủ làm với khách đã hết gói */
    const M = KE.derive(st);
    if (!M) { R.under++; continue; }
    R.told++; R.weeks.push(M.W);
    const L = KE.script(M, isEnded ? { state: 'ended' } : { no: ctx.no, mon: ctx.mon, state: 'open', coach: p.coach, left: p.left, exp: p.exp });
    const ids = new Set(L.map(x => x.g || x.id)); ids.forEach(k => inc(R.mom, k));
    R.moments.push(L.length); R.qs.push(L.filter(x => x.g).length);
    inc(R.nick, M.nick.name);
  }
  const avg = a => a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : '—';
  console.log('\n== ' + label + ': ' + R.n + ' người ==');
  console.log('  có buổi tập trong SESSION LOG: ' + (R.n - R.noData) + ' · kể được (≥ 12 buổi, ≥ 4 tuần): ' + R.told + ' · dưới mức: ' + R.under);
  console.log('  buổi rõ giờ: ' + R.sesH + ' / ' + R.ses + ' (' + pct(R.sesH, R.ses) + ') · buổi từ 26.09 có ghi tạ: ' + R.sesLB + ' / ' + R.sesSince + ' (' + pct(R.sesLB, R.sesSince) + ')' +
              ' · ngày có ghi tạ mà SESSION LOG không có buổi "Đã tập" (không tính): ' + R.lbOff);
  console.log('  trung bình (người kể được): ' + avg(R.weeks) + ' tuần · ' + avg(R.moments) + ' khoảnh khắc · ' + avg(R.qs) + ' câu hỏi');
  const order = ['cover', 'g1', 'a1', 'clock', 'g2', 'days', 'gap', 'room', 'streak', 'g4', 'mtn', 'lift', 'g5', 'body', 'pull', 'coach', 'nick', 'bands', 'card', 'next', 'end'];
  console.log('  khoảnh khắc (số người có / ' + R.told + '): ' + order.filter(k => R.mom[k]).map(k => k + ' ' + R.mom[k]).join(' · ') +
              (order.filter(k => !R.mom[k] && k !== (isEnded ? 'next' : 'end')).length ? ' · KHÔNG AI: ' + order.filter(k => !R.mom[k] && k !== (isEnded ? 'next' : 'end')).join(' ') : ''));
  console.log('  biệt danh: ' + Object.keys(R.nick).map(k => k + ' ' + R.nick[k]).join(' · '));
}

console.log('Dữ liệu thật · hôm nay ' + TODAY + ' (tuần ' + ctx.no + ') · nguồn: SESSION LOG ' + src.stat.log + ' dòng "Đã tập" · logbook ' + src.stat.lb + ' dòng · sổ đặt lịch ' + src.stat.led + ' buổi');
console.log('Ghép được về người: SESSION LOG ' + pct(src.stat.logHit, src.stat.log) + ' · logbook ' + pct(src.stat.lbHit, src.stat.lb) + ' (theo Mã KH, rồi theo tên)');
console.log('"CÓ MỘT SỰ THẬT" (chưa đưa vào câu chuyện — chờ định nghĩa): tuần trắng giữa hai buổi tập → tuần sau cũng trắng = ' + src.blankAgain + ' trên 100 (bản artifact: 43, nghiên cứu 15/10)');
report('Khách đang tập', list, false);
report('Khách đã hết gói', ended, true);
const lw = list.filter(p => p.exp && p.exp <= ctx.days[6]).length, l4 = list.filter(p => p.left > 0 && p.left <= C.LT.MAX).length;
console.log('\nTuần ' + ctx.no + ': ' + lw + ' khách hết hạn gói trong tuần · ' + l4 + ' khách còn ≤ ' + C.LT.MAX + ' buổi (tuần cuối nếu đặt đủ số buổi còn lại)');
