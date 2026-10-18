/* Lập 2 lượt batchUpdate cho 'Sổ đặt lịch' từ .local/sim/expected_rows.json (tools/sim_week.mjs).
   Lượt 1 (một batchUpdate, tất cả hoặc không): xoá giá trị B5:R3000 → định dạng (chữ cho cột chữ, số cho Bản) → dán dữ liệu
   (cột tên để trống) → hằng số (Bản, Tuần, Trạng thái, Thao tác, Lúc ghi) → công thức tên (H, I, R) tra '_dữ liệu' theo Mã KH.
   Lượt 2: dán giá trị đè lên công thức H, I, R (sổ chỉ chứa giá trị như máy chủ ghi).
   Gửi bằng spreadsheets.batchUpdate (công cụ Google Sheets): req1 → kiểm (effectiveValue: không lỗi, chữ là chữ) → req2 → kiểm
   userEnteredValue (0 công thức) → so 14 cột không phải tên với expected_final.json bằng script, KHÔNG in tên.
   CẢNH BÁO: req1 XOÁ toàn bộ sổ B5:R3000 rồi ghi mô phỏng — chỉ chạy khi chủ studio yêu cầu; kiểm lt_ping pending 0 trước.
   node tools/sim_week_payload.mjs "<Lúc ghi yyyy-MM-dd HH:mm:ss>" [sheetId = 711] [thư mục = .local/sim] */
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname, OUT = (process.argv[4] || ROOT + '.local/sim') + '/';
const STAMP = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(STAMP || '')) throw new Error('stamp: "yyyy-MM-dd HH:mm:ss"');
const rows = JSON.parse(fs.readFileSync(OUT + 'expected_rows.json', 'utf8')).map(a => { const b = a.slice(); b[13] = STAMP; return b; });
const WEEK = rows[0][2], N = rows.length, SID = Number(process.argv[3] || 711), R0 = 4, R1 = 4 + N;
/* cột B..R = chỉ số 0..16 trong mảng dòng = cột sheet 1..17 */
const PASTED = [0, 3, 4, 5, 8, 9, 12, 14, 15];             /* B Mã phiếu · E Ngày · F Thứ · G Giờ · J Coach · K Loại · N Ghi chú · P Mã yêu cầu · Q Mã KH */
const CONST = { 1: 1, 2: WEEK, 10: 'Đã đặt', 11: 'Đặt', 13: STAMP };
for (const r of rows) {
  for (const i in CONST) if (r[i] !== CONST[i]) throw new Error('hang so ' + i + ' ' + r[i]);
  for (const i of PASTED) if (typeof r[i] !== 'string' || !r[i] || /[\t\n\r]/.test(r[i])) throw new Error('o ' + i);
}
const data = rows.map(r => r.slice(0, 16).map((v, i) => PASTED.includes(i) ? v : '').join('\t')).join('\n');   /* B..Q, R để công thức */
const rng = (c0, c1, r0 = R0, r1 = R1) => ({ sheetId: SID, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
const fmt = (c0, c1, nf) => ({ repeatCell: { range: rng(c0, c1), cell: nf ? { userEnteredFormat: { numberFormat: nf } } : {}, fields: 'userEnteredFormat.numberFormat' } });
const val = (c, v) => ({ repeatCell: { range: rng(c, c + 1), cell: { userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v } }, fields: 'userEnteredValue' } });
const fx = (c, src) => ({ repeatCell: { range: rng(c, c + 1), cell: { userEnteredValue: { formulaValue: "=INDEX('_dữ liệu'!$" + src + '$5:$' + src + ",MATCH($Q5,'_dữ liệu'!$F$5:$F,0))" } }, fields: 'userEnteredValue' } });
const TEXT = { type: 'TEXT' };
const req1 = [
  { updateCells: { range: rng(1, 18, 4, 3000), fields: 'userEnteredValue' } },
  fmt(1, 2, TEXT), fmt(2, 3, { type: 'NUMBER', pattern: '0' }), fmt(3, 7, TEXT), fmt(7, 9, null), fmt(9, 17, TEXT), fmt(17, 18, null),
  { pasteData: { coordinate: { sheetId: SID, rowIndex: R0, columnIndex: 1 }, data: data, type: 'PASTE_VALUES', delimiter: '\t' } },
  val(2, 1), val(3, WEEK), val(11, 'Đã đặt'), val(12, 'Đặt'), val(14, STAMP),
  fx(7, 'A'), fx(8, 'B'), fx(17, 'G')
];
const req2 = [
  { copyPaste: { source: rng(7, 9), destination: rng(7, 9), pasteType: 'PASTE_VALUES', pasteOrientation: 'NORMAL' } },
  { copyPaste: { source: rng(17, 18), destination: rng(17, 18), pasteType: 'PASTE_VALUES', pasteOrientation: 'NORMAL' } }
];
fs.writeFileSync(OUT + 'req1.json', JSON.stringify(req1));
fs.writeFileSync(OUT + 'req2.json', JSON.stringify(req2));
fs.writeFileSync(OUT + 'expected_final.json', JSON.stringify(rows));
console.log('rows', N, 'last sheet row', R1, '| req1 bytes', JSON.stringify(req1).length, '| data bytes', data.length);
