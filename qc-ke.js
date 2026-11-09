/* =====================================================================
   B0DY · "Để B0DY kể về bạn" — dữ liệu câu chuyện GIẢ cho chế độ QC (?qc) và test (test/ke_core.js)
   Dạng v1 như tab "Kể về bạn" của file Lịch tập tuần (worker/README.md): một hàng = Mã KH · phiên bản · cập nhật · JSON.
   Tên / gọi / coach máy chủ lấy từ MEMBERS (không nằm trong JSON). Mọi con số là số bịa.
   · SAMPLE(tên, gọi): đúng bộ số của bản artifact 3.3 (86 buổi, 03.03 → 16.10.2026) — test so từng câu với artifact.
   · STORIES: Trịnh Minh Khôi (B801DY) = bộ số artifact · Phùng Diệu Linh (B807DY) = một dạng khác (giờ sáng, thứ Bảy, nghỉ 2 tuần,
     không có số đo cơ thể / hít xà / lời coach) để thấy hành trình tự bỏ khoảnh khắc thiếu dữ liệu. Hội viên thử khác: không có câu chuyện.
   ===================================================================== */

/** "MMDDHH MMDDHH …" (năm 2026) → [['2026-MM-DD', HH], …] */
function unpack(s) { return s.trim().split(/\s+/).map(x => ['2026-' + x.slice(0, 2) + '-' + x.slice(2, 4), +x.slice(4, 6)]); }
/** tải từng tuần (kg) theo tuần ISO liền nhau, bắt đầu từ tuần w0 của 2026; 0 = tuần không tập */
function weeks(w0, list) { const o = {}; list.forEach((kg, i) => { if (kg) o['2026-W' + String(w0 + i).padStart(2, '0')] = kg; }); return o; }

/* bản artifact: 86 buổi · giờ 18 (61) 17 (12) 19 (9) 07 (4) · T2 28 · T4 26 · T6 24 · nghỉ trọn tuần 27.07 → 02.08 · chuỗi 6 tuần từ 07.09 */
const S1 = unpack('030318 030517 030917 031118 031318 031619 031818 032018 032318 032518 032718 033018 040107 040619 040817 041018 041318 041618 ' +
  '042019 042219 042418 042718 042918 050418 050618 050818 051118 051319 051618 051818 052018 052218 052518 052718 052918 060318 060518 060817 ' +
  '061018 061217 061518 061707 061917 062218 062717 062917 070118 070318 070707 070917 071318 071507 071718 072018 072118 072418 080318 080518 ' +
  '081018 081218 081418 081718 082118 082418 082618 082818 090218 090418 090718 090918 091119 091417 091619 091819 092118 092317 092518 092817 ' +
  '093019 100218 100518 100718 100918 101218 101418 101618');
const L1 = weeks(10, [3520, 5410, 5550, 5690, 3880, 5960, 4070, 6240, 4250, 6510, 6650, 6790, 6920, 4710, 7200, 7330, 4980, 7610, 5160, 7880, 8020, 0,
  5530, 8430, 5710, 8710, 5900, 8980, 9120, 9260, 9390, 9530, 9670]);
const BODY1 = [{ d: '2026-03-03', kg: 78.6, fat: 27.4, muscle: 31.2, waist: 92, hip: 103, chest: 101, thigh: 58 },
  { d: '2026-06-02', kg: 76.9, fat: 25.1, muscle: 31.9, waist: 89, hip: 101, chest: 102, thigh: 58.5 },
  { d: '2026-10-14', kg: 74.2, fat: 21.8, muscle: 33.0, waist: 84, hip: 98, chest: 103, thigh: 59.5 }];
const GOALS1 = [{ t: 'Deadlift 100 kg', done: true }, { t: 'Giảm 4 kg', done: true }, { t: 'Hít xà 5 cái', done: true },
  { t: 'Squat 100 kg', done: false, lift: 'Squat', target: 100 }];

/** bộ số của bản artifact, gọi theo tên `call` trong lời coach */
export function SAMPLE(call) {
  return {
    v: 1, asOf: '2026-10-16', sessions: S1.map(x => x.slice()), load: Object.assign({}, L1),
    lifts: [{ name: 'Deadlift', from: 60, to: 115 }, { name: 'Squat', from: 50, to: 92.5 }, { name: 'Bench press', from: 35, to: 70 }],
    pullup: { first: '2026-09-23', reps: 6 }, body: BODY1.map(b => Object.assign({}, b)), goals: GOALS1.map(g => Object.assign({}, g)),
    note: call + ' giữ T2, T4, T6 đều như đồng hồ. Deadlift đã chắc. Mục tiêu tiếp theo: squat 100 kg trước Tết.', room: { blankAgain: 43 }
  };
}

/* dạng khác: 45 buổi 01.06 → 17.10 · giờ 07 (25 / 45) · thứ Bảy 18 · nghỉ 2 tuần 10.08 → 23.08 · chuỗi 4 tuần (kỷ lục 5) · 77,6 tấn */
const S2 = unpack('060107 060606 061007 061318 061607 061809 062007 062307 062506 062718 063007 070207 070409 070707 070906 071107 071418 071607 ' +
  '071807 072206 072507 072706 080107 080518 080807 082409 082907 090207 090506 090718 091207 091607 091909 092207 092406 092607 092918 100107 ' +
  '100307 100606 100807 101006 101307 101518 101707');
const L2 = weeks(23, [3000, 3060, 4620, 4680, 4740, 4800, 4860, 3420, 3480, 3540, 0, 0, 3720, 3780, 3840, 3900, 5460, 5520, 5580, 5640]);
function LINH() {
  return {
    v: 1, asOf: '2026-10-17', sessions: S2.map(x => x.slice()), load: Object.assign({}, L2),
    lifts: [{ name: 'Hip thrust', from: 40, to: 100 }, { name: 'Squat', from: 30, to: 60 }],
    goals: [{ t: 'Hip thrust 80 kg', done: true }, { t: 'Tập đủ 3 buổi 4 tuần liền', done: true }], room: { blankAgain: 43 }
  };
}

/** Mã KH → [phiên bản, cập nhật, dữ liệu] — tab "Kể về bạn" của file Lịch tập tuần giả */
export const STORIES = {
  B801DY: ['2026-10-18', '2026-10-18 05:00', SAMPLE('Khôi')],
  B807DY: ['2026-10-18', '2026-10-18 05:00', LINH()]
};
