/* Lõi câu chuyện "Để B0DY kể về bạn" (ke-core.js):
   1. Bộ số của bản artifact 3.3 (qc-ke.js · SAMPLE, tên "Đức Nam") ra ĐÚNG từng câu, từng số, đúng thứ tự 22 khoảnh khắc của artifact.
   2. Chỗ giữ chữ trên một dòng (nbsp) trùng bản artifact với mọi câu của bộ mẫu.
   3. Dạng dữ liệu khác (Diệu Linh của QC) và dữ liệu ngẫu nhiên: không lỗi, không câu rỗng / "undefined" / "NaN", câu hỏi đánh số
      liền, thang kéo chứa giá trị khởi đầu, đáp án nằm trong thang, biệt danh luôn có.
   node test/ke_core.js */
'use strict';
const KE = require('../ke-core.js');
let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); }
}
function eq(label, a, b) { ok(label + ' = ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b), a); }
const SP = s => typeof s === 'string' ? s.replace(/ /g, ' ') : s;

/* nb() của bản artifact (page4.html) — danh sách cụm từ nguyên văn, tên "Nam" */
const PPHR = ['cơ thể luôn', 'cơ thể mình', 'nắm được hết', 'quay lại tập', 'hay tập nhất', 'rất lo :(', 'dỗi đó!', 'B0DY nhé!', 'ở B0DY?', 'đâu hihi', 'tập luyện', 'chăm chỉ', 'của Nam', 'Không sớm', 'không muộn', 'các coach', 'cơ đấy', 'hôm đó', 'tù tì', 'thời gian', 'của bạn', 'vỗ tay', 'cho bạn', 'mấy cân', 'có vậy', 'đỡ hộ', 'liền luôn', 'bạn nghĩ', 'bản thân', 'rất rõ', 'Cứ 6 giờ chiều', 'đồng hồ', 'tiếp theo', 'bao nhiêu', 'đổi mỡ lấy cơ', 'sót buổi nào', 'xà, không', 'đáp án', 'Mục tiêu', 'lên xà', 'lấy cơ', '6 giờ chiều', 'giờ này', 'đến giờ', 'gấp rưỡi', 'tháng 3', 'tháng 7', 'tuần sau', 'biệt danh', 'mất tăm', 'trước Tết', 'cả tuần', 'lâu thế bao giờ', 'nhớ hết', 'nữa thôi', 'có mặt', 'tập xong'];
const pnb = t => { for (const p of PPHR) t = t.split(p).join(p.replace(/ /g, ' ')); return t.replace(/(\d(?:[\d.,/]*\d)?) (?=\S)/g, '$1 '); };

(async () => {
  const { SAMPLE, STORIES } = await import('../qc-ke.js');

  /* ---------------- 1 · bộ mẫu artifact ---------------- */
  const st = Object.assign({ name: 'Đức Nam', coach: 'Quyết Hán', code: 'B012DY' }, SAMPLE('Nam'));
  const M = KE.derive(st);
  ok('derive mẫu ≠ null', !!M);
  eq('số buổi', M.n, 86); eq('số tuần', M.W, 33); eq('đầu → cuối', [M.first, M.last], ['2026-03-03', '2026-10-16']);
  eq('giờ', M.hours, [[18, 61], [17, 12], [19, 9], [7, 4]]);
  eq('thứ', M.dows, [28, 3, 26, 3, 24, 2, 0]);
  eq('tuần trắng', [M.blank.from, M.blank.to, M.blank.weeks, M.blank.after], ['2026-07-27', '2026-08-02', 1, 11]);
  eq('chuỗi', M.streak, { cur: 6, best: 6, mon: '2026-09-07' });
  eq('tấn', M.tons, 214.6); eq('tổng kg', M.loadKg, 214560);
  eq('bài chính', M.hero.name, 'Deadlift');
  eq('biệt danh', M.nick, { name: 'Người giữ hẹn', why: 'Chẳng cần ai phải ép. Cứ 6 giờ chiều là bạn có mặt.' });
  eq('thẻ · 12 chỉ số (FACTS của artifact)', M.facts.map(f => f.slice(0, 3)), [['86', 'buổi trong 33 tuần', '86 buổi'], ['18:00', 'giờ quen · 61 / 86 buổi', 'Giờ quen'],
    ['6', 'tuần liền, chưa đứt', 'Chuỗi 6 tuần'], ['214,6', 'tấn đã nâng', '214,6 tấn'], ['115', 'kg deadlift', 'Deadlift'], ['92,5', 'kg squat', 'Squat'],
    ['70', 'kg bench press', 'Bench press'], ['4,4', 'kg cân nặng đã giảm', 'Cân nặng'], ['8', 'cm vòng eo đã giảm', 'Vòng eo'], ['5', 'cm vòng hông đã giảm', 'Vòng hông'],
    ['2', 'cm vòng ngực đã tăng', 'Vòng ngực'], ['1,5', 'cm vòng đùi đã tăng', 'Vòng đùi']]);
  eq('chip chọn sẵn', KE.defaultPicks(M.facts), [0, 1, 3, 4, 5, 8]);
  eq('bản in (ROWS của artifact)', KE.printRows(M), [['Buổi đã tập', '86 buổi · 33 tuần'], ['Giờ quen', '18:00 · 61 / 86 buổi'], ['Thứ tập nhiều nhất', 'Thứ Hai · 28 buổi'],
    ['Chuỗi hiện tại', '6 tuần liền'], ['Tổng tạ đã nâng', '214,6 tấn'], ['Deadlift', '60 → 115 kg'], ['Squat', '92,5 kg'], ['Bench press', '70 kg'], ['Cân nặng', 'Giảm 4,4 kg'],
    ['Khối cơ', 'Tăng 1,8 kg'], ['Vòng eo', 'Giảm 8 cm'], ['Vòng hông', 'Giảm 5 cm'], ['Vòng ngực', 'Tăng 2 cm'], ['Vòng đùi', 'Tăng 1,5 cm'], ['Mục tiêu', '3 / 4 đã đạt']]);
  eq('bảng màu', M.palette.map(b => [b.word, b.say, b.tag]), [['Cam 18:00', 'Màu trời lúc bạn bắt đầu tập.', 'CAM 18:00'], ['Chàm 19:00', 'Màu trời lúc bạn tập xong.', 'CHÀM 19:00'],
    ['Vàng chanh 115', 'Màu của chuỗi 6 tuần và mức deadlift 115 kg.', 'VÀNG CHANH 115']]);
  eq('đĩa 115 kg', KE.plates(115), [25, 20, 2.5]);
  eq('đĩa 60 kg', KE.plates(60), [20]);
  eq('nhãn thanh tạ', KE.platesLabel(115), 'Thanh tạ 115 kg: mỗi bên một đĩa 25, một đĩa 20 và một đĩa 2,5');
  eq('tên tệp', KE.slug('Người giữ hẹn'), 'nguoi-giu-hen');

  const L = KE.script(M, { no: 43, mon: '2026-10-19', state: 'open', coach: 'Quyết Hán', left: 10, exp: '2026-11-21' });
  eq('22 khoảnh khắc đúng thứ tự artifact', L.map(x => x.id), ['cover', 'rules', 'q', 'a1', 'clock', 'pick', 'days', 'gap', 'room', 'streak', 'q', 'mtn', 'lift', 'q', 'body', 'pull',
    'coach', 'lead', 'nick', 'bands', 'card', 'next']);
  const T = {};
  L.forEach((x, i) => { T[i] = x; });
  const X = (i, k) => SP(T[i][k]);
  /* 00 */ eq('00 lb', X(0, 'lb'), '33 tuần · 03.03 → 16.10'); eq('00 tên', T[0].lines, ['Đức', 'Nam']); eq('00 say', X(0, 'say'), 'Để B0DY kể về 33 tuần tập luyện chăm chỉ vừa qua của Nam nhé.');
  /* 01 */ eq('01', [X(1, 'stmt'), X(1, 'say'), X(1, 'btn')], ['Đoán thử xem nào.', 'Mình hỏi, bạn đoán, xong mình mở đáp án. Sai cũng chẳng sao, mình không mách coach đâu hihi.', 'Chơi luôn']);
  /* 02 */ eq('02', [X(2, 'lb'), X(2, 'q'), T[2].unit, T[2].r], ['Câu 1 / 4', 'Từ hôm 3/3 đến giờ, bạn tập được bao nhiêu buổi rồi?', 'buổi', { min: 10, max: 150, val: 50, step: 1 }]);
  /* 03 */ eq('03', [X(3, 'lb'), X(3, 'lb2'), T[3].value], ['Đáp án', 'TỔNG SỐ BUỔI ĐÃ TẬP · 03.03 → 16.10', 86]);
  /* 04 */ eq('04', [X(4, 'lb'), X(4, 'value'), X(4, 'say'), X(4, 'dim'), T[4].aria], ['KHUNG GIỜ QUEN', '18:00', 'Có tận 61 trên tổng số 86 buổi là bạn tập đúng giờ này. Không sớm, không muộn.',
    'Cứ thấy bạn tới là các coach biết đã 6 giờ chiều rồi.', 'Giờ bắt đầu buổi tập trên mặt đồng hồ 24 giờ: 18 giờ 61 buổi, 17 giờ 12 buổi, 19 giờ 9 buổi, 7 giờ 4 buổi']);
  /* 05 */ eq('05', [X(5, 'lb'), X(5, 'q'), T[5].opts], ['Câu 2 / 4', 'Đâu là ngày trong tuần mà bạn hay tập nhất?', ['T2', 'T3', 'T4', 'T5', 'T6', 'T7']]);
  /* 06 */ eq('06', [X(6, 'word'), X(6, 'say'), T[6].bars.map(b => [b.k, b.n, b.r])], ['Thứ Hai', 'Ai cũng ngại thứ Hai, thế mà bạn đi tập những 28 buổi vào hôm đó cơ đấy.',
    [['T2', 28, 1], ['T3', 3, 0.107], ['T4', 26, 0.929], ['T5', 3, 0.107], ['T6', 24, 0.857], ['T7', 2, 0.071]]]);
  /* 07 */ eq('07', [X(7, 'lb'), X(7, 'stmt'), X(7, 'say'), T[7].seg, +T[7].at.toFixed(4), T[7].d0, T[7].d1, T[7].d2], ['27.07 → 02.08', 'Hồi cuối tháng 7 bạn lặn mất tăm.',
    'Thế là mình ngủ khò cả tuần.', [21, 1, 11], 0.6515, '03.03', '27.07', '16.10']);
  /* 08 */ eq('08', [X(8, 'lb'), T[8].value, T[8].unitLines, X(8, 'say'), X(8, 'dim'), X(8, 'plb'), T[8].pvalue, T[8].punitLines], ['CÓ MỘT SỰ THẬT', 43, ['trên 100', 'người'],
    'đã nghỉ liền tù tì mấy tuần mà không quay lại tập.', 'Điều này làm cho B0DY rất lo :(', 'Bạn · từ tháng 8', 0, ['tuần', 'nghỉ thêm']]);
  /* 09 */ eq('09', [X(9, 'lb'), T[9].value, X(9, 'stmt'), T[9].cells, T[9].d0, X(9, 'say'), X(9, 'dim')], ['CHUỖI TẬP HIỆN TẠI', 6, 'tuần liên tiếp', 6, '07.09',
    'Tuần nào bạn cũng tập đủ 3 buổi. Đây hẳn là quãng thời gian chăm chỉ nhất của bạn.', 'Đừng để đứt chuỗi nhé, B0DY dỗi đó!']);
  /* 10 */ eq('10', [X(10, 'lb'), X(10, 'q'), T[10].unit, T[10].r], ['Câu 3 / 4', 'Đoán xem bạn đã nâng bao nhiêu tấn tạ trong suốt khoảng thời gian vừa qua ở B0DY?', 'tấn',
    { min: 10, max: 400, val: 80, step: 1 }]);
  /* 11 */ eq('11', [X(11, 'lb'), T[11].value, X(11, 'say'), T[11].vol.length, T[11].d0, T[11].d1], ['ĐÁP ÁN SẼ KHIẾN BẠN BẤT NGỜ', 214.6,
    'Tức là bằng 2.900 lần bạn tự nhấc chính cơ thể mình lên.', 33, '03.03', '16.10']);
  /* 12 */ eq('12', [X(12, 'lb'), T[12].from, T[12].to, X(12, 'say'), X(12, 'dim'), T[12].aria], ['Deadlift · 60 → 115 kg', 60, 115,
    'Gần gấp đôi hồi mới tập. Thậm chí là gấp rưỡi trọng lượng cơ thể luôn.', 'Một tràng vỗ tay dành cho bạn.', 'Thanh tạ 115 kg: mỗi bên một đĩa 25, một đĩa 20 và một đĩa 2,5']);
  /* 13 */ eq('13', [X(13, 'lb'), X(13, 'q'), T[13].unit, T[13].r, T[13].dec], ['Câu 4 / 4', 'Thế từ hồi đầu tới giờ, bạn giảm được mấy cân?', 'kg', { min: 0, max: 12, val: 2, step: 0.2 }, true]);
  eq('13 ô đoán hiện "2,0"', KE.num1(T[13].r.val), '2,0');
  /* 14 */ eq('14', [X(14, 'word'), T[14].value, X(14, 'say'), X(14, 'plb'), X(14, 'pword'), T[14].pvalue, X(14, 'pdet'), X(14, 'psay')], ['Giảm', 4.4,
    'Nghe thì ít. Nhưng không chỉ có vậy.', 'Khối cơ', 'Tăng', 1.8, 'Eo giảm 8 cm · Mỡ 27,4% → 21,8%', 'Cái cân đâu có biết bạn đã đổi mỡ lấy cơ.']);
  /* 15 */ eq('15', [X(15, 'lb'), X(15, 'mlb'), T[15].day, X(15, 'dname'), X(15, 'say'), X(15, 'stmt')], ['Hít xà', 'Tháng 9 · 2026', 23, 'Thứ Tư',
    'Là ngày đầu tiên mà bạn tự kéo được người lên xà, không cần ai đỡ hộ.', 'Giờ được 6 cái liền luôn.']);
  /* 16 */ eq('16', [X(16, 'lb'), X(16, 'quote'), X(16, 'glb'), T[16].gval, X(16, 'gsay')], ['Coach Quyết Hán nhận xét',
    '“Nam giữ T2, T4, T6 đều như đồng hồ. Deadlift đã chắc. Mục tiêu tiếp theo: squat 100 kg trước Tết.”', 'MỤC TIÊU ĐẠT', '3/4', 'Còn mỗi squat 100 kg. Đang 92,5 rồi, thêm 7,5 kg nữa thôi.']);
  /* 17 */ eq('17', [X(17, 'stmt'), X(17, 'say')], ['Từng ấy là đủ hiểu bạn rồi.', 'Giờ mình đặt cho bạn cái biệt danh nhé.']);
  /* 18 */ eq('18', [X(18, 'lb'), T[18].lines, X(18, 'say')], ['Biệt danh', ['Người', 'giữ hẹn'], 'Chẳng cần ai phải ép. Cứ 6 giờ chiều là bạn có mặt.']);
  /* 19 */ eq('19', [X(19, 'lb'), X(19, 'stmt'), T[19].bands.length], ['Bảng màu riêng', 'Bảng màu này chỉ Nam mới có.', 3]);
  /* 20 */ eq('20', X(20, 'stmt'), 'Khoe thành tích!');
  /* 21 */ eq('21', [X(21, 'lb'), X(21, 'stmt'), X(21, 'say'), T[21].slot, X(21, 'btn')], ['Tuần sau · 19.10 → 25.10', 'Lịch tuần sau đã mở.', 'Hãy tiếp tục tập luyện cùng B0DY nhé!',
    { lb: 'Thứ Hai · 19.10', time: '18:00', coach: 'Coach Quyết Hán', pkg: 'Còn 10 buổi · hết hạn 21.11' }, 'Đặt lịch tuần 43']);

  /* phản ứng khi chốt — như react() của artifact */
  const R = (id, v) => KE.react(id, M, v);
  eq('g1 = 86', R('g1', 86), 'Chuẩn không cần chỉnh. Ai đó nắm rất rõ quá trình tập luyện của bản thân.');
  eq('g1 = 82', R('g1', 82), 'Suýt trúng. Ai đó nắm rất rõ quá trình tập luyện của bản thân.');
  eq('g1 = 50', R('g1', 50), 'Thiếu mất 36 buổi rùi. Bạn chăm chỉ hơn bạn nghĩ nhiều.');
  eq('g1 = 120', R('g1', 120), 'Đếm cả mấy buổi định đi đấy à? Thừa 34 buổi rồi.');
  eq('g2 = T2', R('g2', 'T2'), 'CHUẨN LUÔN, ĐÓ LÀ NGÀY'); eq('g2 = T4', R('g2', 'T4'), 'NHẦM TO, ĐÓ LÀ NGÀY');
  /* g4: artifact |d| < 15 → sát · d > 0 → thiếu · −d ≤ 30 → thừa · còn lại → thừa những */
  for (let v = 10; v <= 400; v++) {
    const d = 214.6 - v, want = Math.abs(d) < 15 ? 'Sát sàn sạt. Trong đầu bạn có cái cân à?' : d > 0 ? `Thiếu mất ${Math.round(d)} tấn. Bạn không nhận ra, chứ B0DY nắm được hết.`
      : -d <= 30 ? `Thừa ${Math.round(-d)} tấn. Nhưng cứ đều thế này thì chẳng mấy mà tới.` : `Thừa những ${Math.round(-d)} tấn. Con số ấy để dành năm sau nhé.`;
    if (R('g4', v) !== want) { ok('g4 = ' + v, false, [R('g4', v), want]); break; }
  }
  ok('g4 · cả thang 10–400 giống artifact', true);
  eq('g5 = 4,4', R('g5', 4.4), 'Đoán sát đấy'); eq('g5 = 3,8 (sát 0,6)', R('g5', 3.8), 'Đoán sát đấy'); eq('g5 = 2', R('g5', 2), 'Đáp án');

  /* ---------------- 2 · nbsp như artifact ---------------- */
  const texts = [];
  L.forEach(x => ['say', 'q', 'stmt', 'word', 'dim', 'quote', 'gsay', 'psay'].forEach(k => { if (typeof x[k] === 'string') texts.push(x[k]); }));
  M.palette.forEach(b => texts.push(b.say));
  let same = 0;
  texts.forEach(t => { const raw = SP(t), mine = KE.nb(raw, ['của Nam']), want = pnb(raw); if (mine === want) same++; else ok('nbsp: ' + raw, false, [mine, want]); });
  ok('nbsp trùng artifact (' + same + ' / ' + texts.length + ' câu)', same === texts.length);

  /* ---------------- 3 · dạng khác + ngẫu nhiên ---------------- */
  function sane(label, M, L) {
    const bad = [];
    L.forEach(x => Object.keys(x).forEach(k => { const v = x[k]; if (typeof v === 'string' && (!v.trim() || /undefined|NaN|null|Infinity/.test(v))) bad.push(x.id + '.' + k + '=' + v); }));
    ok(label + ' · không câu hỏng', !bad.length, bad);
    const qs = L.filter(x => x.g);
    ok(label + ' · câu hỏi đánh số liền', qs.every((q, i) => q.lb === 'Câu ' + (i + 1) + ' / ' + qs.length), qs.map(q => q.lb));
    qs.filter(q => q.r).forEach(q => {
      const ans = q.g === 'g1' ? M.n : q.g === 'g4' ? M.tons : Math.abs(M.change('kg'));
      ok(label + ' · ' + q.g + ' thang hợp lệ', q.r.min <= q.r.val && q.r.val <= q.r.max && q.r.min <= ans && ans <= q.r.max && q.r.val !== ans, [q.r, ans]);
    });
    ok(label + ' · có bìa / biệt danh / thẻ / tuần sau', ['cover', 'nick', 'card', 'next'].every(id => L.some(x => x.id === id)));
    ok(label + ' · đáp án đi ngay sau câu hỏi', L.every((x, i) => !x.g || (L[i + 1] && { g1: 'a1', g2: 'days', g4: 'mtn', g5: 'body' }[x.g] === L[i + 1].id)), L.map(x => x.id));
    ok(label + ' · thẻ có ≥ 1 chỉ số, chọn sẵn 1–6', M.facts.length >= 1 && KE.defaultPicks(M.facts).length >= 1 && KE.defaultPicks(M.facts).length <= 6);
    ok(label + ' · bản in ≤ 16 hàng', KE.printRows(M).length <= 16);
  }
  sane('mẫu', M, L);
  const linh = KE.derive(Object.assign({ name: 'Diệu Linh', coach: 'Hiền Mai' }, STORIES.B807DY[2]));
  const LL = KE.script(linh, { no: 43, mon: '2026-10-19', state: 'booked', slot: { d: '2026-10-19', h: 7 }, coach: 'Hiền Mai', left: 25, exp: '2027-02-28' });
  sane('Diệu Linh', linh, LL);
  eq('Diệu Linh · khoảnh khắc', LL.map(x => x.id), ['cover', 'rules', 'q', 'a1', 'clock', 'pick', 'days', 'gap', 'room', 'streak', 'q', 'mtn', 'lift', 'coach', 'lead', 'nick', 'card', 'next']);
  eq('Diệu Linh · biệt danh', linh.nick.name, 'Người quay lại');
  eq('Diệu Linh · nghỉ 2 tuần', SP(LL[7].say), 'Thế là mình ngủ khò những 2 tuần.');
  eq('Diệu Linh · kỷ lục', SP(LL[9].say), 'Tuần nào bạn cũng tập đủ 3 buổi. Kỷ lục của bạn là 5 tuần liền đấy.');
  eq('Diệu Linh · đã đặt', [LL[LL.length - 1].stmt, LL[LL.length - 1].btn, LL[LL.length - 1].slot.time], ['Lịch tuần sau đã đặt.', 'Xem phiếu tuần 43', '07:00']);
  eq('Diệu Linh · tuần sau chưa mở', [KE.script(linh, { no: 43, mon: '2026-10-19', state: 'later' }).pop().stmt], ['Lịch tuần sau chưa mở.']);

  /* asOf (09/11 rà soát): chuỗi / "0 tuần nghỉ thêm" tính tới tuần của asOf, không phải tuần buổi cuối */
  {
    const away = KE.derive(Object.assign({}, st, { asOf: '2026-11-20' }));
    eq('asOf 20.11 (vắng 4 tuần trọn sau 16.10) → chuỗi 0, away 4', [away.streak.cur, away.away], [0, 4]);
    const La = KE.script(away, null).map(x => x.id);
    ok('… không còn màn chuỗi / "0 tuần nghỉ thêm" / chip "chưa đứt"', La.indexOf('streak') < 0 && La.indexOf('room') < 0 && !away.facts.some(f => f[3] === 'streak'), La);
    const sun = KE.derive(Object.assign({}, st, { asOf: '2026-10-18' }));
    eq('asOf CN 18.10 (tuần 42 trọn, đủ 3) → chuỗi 6', [sun.streak.cur, sun.away, sun.streakNow], [6, 0, false]);
    const mon = KE.derive(Object.assign({}, st, { asOf: '2026-10-19' }));
    eq('asOf T2 19.10 (tuần mới mới bắt đầu) → chuỗi vẫn 6, ô cuối = tuần này', [mon.streak.cur, mon.away, mon.streakNow, KE.script(mon, null).find(x => x.id === 'streak').nx], [6, 0, true, 'Tuần này']);
    const thu = KE.derive(Object.assign({}, st, { asOf: '2026-10-15', sessions: st.sessions.filter(x => x[0] <= '2026-10-15') }));
    eq('asOf T5 15.10, tuần 42 mới 2 buổi (đang dở) → chuỗi 5 (không đứt), từ 07.09', [thu.streak.cur, thu.streak.mon, thu.away], [5, '2026-09-07', 0]);
    const mon2 = KE.derive(Object.assign({}, st, { asOf: '2026-10-26' }));
    eq('asOf T2 26.10 (cả tuần 43 vắng) → chuỗi 0, away 1', [mon2.streak.cur, mon2.away], [0, 1]);
  }
  /* câu chữ ở dữ liệu biên */
  eq('g4 chênh dưới 0,5 tấn → "Sát sàn sạt" (không "Thiếu mất 0 tấn")', KE.react('g4', { tons: 5.4 }, 5), 'Sát sàn sạt. Trong đầu bạn có cái cân à?');
  {
    const g = KE.derive(Object.assign({}, st, { goals: [{ t: 'Squat 100 kg.', done: false, lift: 'Squat', target: 100 }] }));
    eq('mục tiêu có dấu chấm cuối → không "kg.."', SP(KE.script(g, null).find(x => x.id === 'coach').gsay), 'Còn mỗi squat 100 kg. Đang 92,5 rồi, thêm 7,5 kg nữa thôi.');
    const v = KE.derive(Object.assign({}, st, { lifts: [{ name: 'RDL', from: 40, to: 120 }] }));
    eq('tên bài viết tắt giữ nguyên (RDL)', v.facts.find(f => f[3] === 'lift0')[1], 'kg RDL');
    eq('khoảng ngày khác năm có năm', KE.span('2026-03-03', '2027-04-16'), '03.03.2026 → 16.04.2027');
    eq('num(−0,04) không ra "−0"', KE.num(-0.04), '0');
    const hs = KE.script(M, { no: 43, mon: '2026-10-19', state: 'open', hours: [6, 7, 8, 9, 10, 11, 12, 14, 15, 16] }).pop();
    eq('gói Ban ngày: gợi ý 18:00 không đặt được → khung đặt được gần nhất (16:00)', hs.slot.time, '16:00');
    const p1 = KE.derive(Object.assign({}, st, { pullup: { first: '2026-09-23', reps: 1 } }));
    eq('hít xà mới 1 cái', SP(KE.script(p1, null).find(x => x.id === 'pull').stmt), 'Một cái thôi, nhưng là cái đầu tiên.');
    /* số tạ (logbook app coach) chỉ có từ giữa chừng: núi + ngày đầu tính từ tuần đầu có số tạ, không từ buổi đầu tiên */
    const lk = Object.keys(st.load).sort(), part = n => KE.derive(Object.assign({}, st, { load: Object.fromEntries(lk.slice(lk.length - n).map(k => [k, st.load[k]])) }));
    const P8 = part(8), L8 = KE.script(P8, null), m8 = L8.find(x => x.id === 'mtn'), m7 = KE.script(part(7), null).find(x => x.id === 'mtn');
    eq('số tạ có từ W35 (T2 24.08, có buổi) → núi 8 tuần, 24.08 → 16.10', [m8.vol.length, m8.d0, m8.d1], [8, '24.08', '16.10']);
    eq('… câu hỏi nói rõ từ hôm nào, bản in ghi "từ 24.08"', [SP(L8.find(x => x.g === 'g4').q), KE.printRows(P8).find(r => r[0] === 'Tổng tạ đã nâng')[1]],
       ['Từ hôm 24/8 đến giờ, đoán xem bạn đã nâng bao nhiêu tấn tạ ở B0DY?', '70,6 tấn · từ 24.08']);
    eq('số tạ có từ W36 (T2 31.08 không tập) → ngày đầu = buổi đầu tuần đó (02.09)', [m7.vol.length, m7.d0], [7, '02.09']);
    eq('đủ số tạ cả 33 tuần → núi 33 tuần từ 03.03 (như artifact)', [T[11].vol.length, T[11].d0], [33, '03.03']);
  }

  /* không đủ để kể */
  eq('dưới 12 buổi → null', KE.derive(Object.assign({}, st, { sessions: st.sessions.slice(0, 11) })), null);
  eq('3 tuần → null', KE.derive({ v: 1, name: 'A B', sessions: [['2026-10-05', 7], ['2026-10-06', 7], ['2026-10-07', 7], ['2026-10-08', 7], ['2026-10-09', 7], ['2026-10-12', 7],
    ['2026-10-13', 7], ['2026-10-14', 7], ['2026-10-15', 7], ['2026-10-16', 7], ['2026-10-19', 7], ['2026-10-20', 7]] }), null);
  eq('sai dạng → null', KE.derive({ v: 2, name: 'A' }), null);
  eq('không tên → null', KE.derive(Object.assign({}, st, { name: '' })), null);
  ok('buổi trùng / sai ngày / sau asOf bị bỏ', KE.derive(Object.assign({}, st, { sessions: st.sessions.concat([['2026-03-03', 18], ['2026-02-30', 9], ['2026-12-01', 9], ['x', 1], ['2026-05-05', 25]]) })).n === 86);

  /* ngẫu nhiên (hạt cố định) */
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  let made = 0, nulls = 0;
  for (let t = 0; t < 400; t++) {
    const w0 = 1 + Math.floor(rnd() * 20), nw = 2 + Math.floor(rnd() * 40), hours = [6, 7, 8, 12, 17, 18, 19, 20], fav = pick(hours), S = [], load = {};
    for (let w = 0; w < nw; w++) {
      const mon = KE.date.add('2026-01-05', (w0 + w) * 7), k = rnd() < 0.12 ? 0 : 1 + Math.floor(rnd() * 4), used = {};
      for (let j = 0; j < k; j++) { let d = Math.floor(rnd() * 7); while (used[d]) d = (d + 1) % 7; used[d] = 1; S.push([KE.date.add(mon, d), rnd() < 0.5 ? fav : pick(hours)]); }
      if (k && rnd() < 0.9) load[KE.date.wkey(mon)] = Math.round(rnd() * 9000);
    }
    const last = S.length ? S.map(x => x[0]).sort().pop() : '2026-01-05';
    const f0 = 20 + Math.round(rnd() * 80), story = {
      v: 1, name: pick(['Lan', 'Minh Anh', 'Trần Thu Hà', 'Quốc Bảo']), coach: pick(['', 'Hiền Mai']), sessions: S, load: rnd() < 0.8 ? load : null, asOf: last,
      lifts: rnd() < 0.8 ? [{ name: 'Squat', from: f0, to: f0 * (0.8 + rnd() * 2.5) }, { name: 'Row', from: 20, to: 20 + rnd() * 40 }] : [],
      body: rnd() < 0.6 ? [{ d: S.length ? S[0][0] : last, kg: 60 + rnd() * 30, muscle: 25 + rnd() * 5, fat: 15 + rnd() * 15, waist: 70 + rnd() * 30 },
        { d: last, kg: 60 + rnd() * 30, muscle: 25 + rnd() * 6, fat: 15 + rnd() * 15, waist: 70 + rnd() * 30 }] : [],
      pullup: rnd() < 0.3 && S.length ? { first: S[Math.floor(S.length / 2)][0], reps: 1 + Math.floor(rnd() * 8) } : null,
      goals: rnd() < 0.7 ? [{ t: 'Squat 100 kg', done: rnd() < 0.5, lift: 'Squat', target: 100 }, { t: 'Tập đều', done: rnd() < 0.5 }] : [],
      note: rnd() < 0.5 ? 'Giữ nhịp tốt.' : '', room: rnd() < 0.7 ? { blankAgain: 43 } : null
    };
    const m = KE.derive(story);
    if (!m) {
      nulls++;
      const uniq = new Set(S.map(x => x[0] + '|' + x[1])), ds = S.map(x => x[0]).sort();
      const weeksSpan = ds.length ? (KE.date.ms(KE.date.mon(ds[ds.length - 1])) - KE.date.ms(KE.date.mon(ds[0]))) / 6048e5 + 1 : 0;
      ok('null chỉ khi dưới 12 buổi hoặc dưới 4 tuần', uniq.size < 12 || weeksSpan < 4, [uniq.size, weeksSpan]);
      continue;
    }
    made++;
    const states = [{ no: 3, mon: KE.date.add(last, 7 - KE.date.dow(last)), state: pick(['open', 'booked', 'later']), slot: { d: KE.date.add(last, 7 - KE.date.dow(last)), h: 18 }, coach: 'Hiền Mai', left: 3, exp: '2027-01-01' }, null];
    sane('ngẫu nhiên #' + t, m, KE.script(m, pick(states)));
  }
  ok('ngẫu nhiên: có cả trường hợp kể được và không (' + made + ' / ' + nulls + ')', made > 100 && nulls > 0);

  console.log((fail ? 'FAIL' : 'PASS') + ' ke_core: ' + pass + ' / ' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
