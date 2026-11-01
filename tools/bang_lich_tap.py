# -*- coding: utf-8 -*-
"""
Tab "Bảng lịch tập" dựng lại theo bảng giờ của UI booking (Figma V2.4 · 03 Đặt lịch · bảng tuần):
cột giờ 48 · khe 4 · ô ngày 250 viền Kẻ 10 % · dải nghỉ trưa Giấy 2 · đầu cột Thứ (Mono, Than) + ngày (Mono 16 px, Mực).
Khung giờ (1.7.0, chủ studio 31/10): 06:00–12:00 · nghỉ trưa 13:00–14:00 · 14:00–20:00 (= LT.SLOTS).
7 cột T2–CN (1.1.0: CN đặt được khi coach tick CN ở tab "Lịch coach"). Tuần đang xem: tuần này (CN vẫn là tuần này) hoặc tuần của
ngày chọn ở ô H2 "Xem tuần" (bấm đúp → lịch chọn ngày; xoá ô = về tuần này).
Mỗi suất coach một ô con (luật 18/10: mỗi coach một suất mỗi khung): khách 1:1 "L. Lẻ Một · Quyết", cặp 1:2 cùng coach
"K. Cặp Một + K. Cặp Hai · Quyết" (tên gọi coach, bảng T5:U12), xếp theo coach rồi theo tên. Số suất ≥ sức chứa → khung đủ suất
(= sức chứa) → nền Sương (như ô "ĐẦY"), "KHUNG ĐẦY" đếm theo đó. Khách tập thử không nằm trên bảng (như trước).
Ngày đã qua → Giấy 2, chữ Đá (như "đã qua"). Hôm nay → Thứ màu Mực + vạch "━━" dưới ngày (như vạch 20 × 2 px của UI).
Chữ thường: Inter (chủ studio chốt 17/10). Số, nhãn: JetBrains Mono. Sheets không có độ đậm 500, bo góc, khoảng chữ → bỏ.
Mỗi khối lưới là MỘT công thức MAKEARRAY trải ra cả khối (ô khe = ""), không có công thức từng ô.

python3 tools/bang_lich_tap.py <sheetId> <thư mục ra> <số quy tắc định dạng có điều kiện> <số hàng> <số cột> (đang có trên tab)
  → s1 (cấu trúc) · s2 (định dạng) · s3 (giá trị + định dạng có điều kiện): requests cho spreadsheets.batchUpdate, áp theo thứ tự s1 → s2 → s3.
Bẫy đã gặp (17/10):
  · s1 không tự biết tab đang có bao nhiêu quy tắc định dạng có điều kiện → truyền tham số thứ 3 (đếm bằng spreadsheets.get, fields
    sheets.conditionalFormats) để s1 xoá hết trước. Số hàng / cột cũng vậy (sheets.properties.gridProperties): s1 xoá đúng số hàng cũ,
    thêm / bớt cột cho đủ NCOL — đoán sai thì còn sót hàng cũ ở dưới hay cột thừa hiện ra bên phải. Quy tắc cũ còn sót thì s2 (copyPaste PASTE_FORMAT) kéo nó giãn ra cả lưới.
  · Chạy lại RIÊNG s2 khi s3 đã có cũng vậy: copyPaste mang theo quy tắc của ô mẫu D8:E13 → luôn chạy lại đủ s1 → s2 → s3.
  · Màu: Sheets cắt (floor) giá trị × 255 → xem rgb().
  · Đếm quy tắc định dạng có điều kiện: spreadsheets.get KHÔNG kèm `ranges` (có `ranges` thì chỉ trả quy tắc chạm vùng đó — 31/10 đếm
    nhầm 2 thay vì 5).
MỖI SUẤT COACH MỘT Ô (chủ studio 01/11: tên khách 1:2 chưa có ai ghép cùng thành chữ đỏ #c2182b — Sheets không tô màu riêng một dòng
trong ô, "tô đỏ cả ô" gây hiểu nhầm → chọn tách ô): mỗi khung giờ = SUB ô con (một suất coach mỗi ô, xếp theo coach) · Theo coach: mỗi
ngày = KC ô con (một buổi mỗi ô, theo giờ). Hơn SUB / KC thì phần dư dồn vào ô cuối (xuống dòng). Bảng cờ ẩn AD:AP cùng hình với lưới
(cột lưới + 26): "" = khe · 0 · 1 = khách 1:2 đang lẻ (coach chỉ có một người ở khung đó, "Đã đặt") · +2 = khung đủ suất. Quy tắc định
dạng đọc ô cờ cùng hàng (=AD8=1 …), thứ tự trên → dưới: Theo coach ngày đã qua · Theo coach lẻ · đầu cột đã qua · hôm nay · lưới ngày đã
qua · đầy + lẻ (nền Sương, chữ đỏ) · lẻ · đầy (Sheets chỉ áp quy tắc ĐẦU TIÊN khớp). Công thức lọc sổ theo tuần trước (FILTER theo cột
Tuần) rồi mới tính từng ô. Trong LAMBDA, so mảng phải dùng SUMPRODUCT / ROWS(FILTER) (SUM(--(a=x)) chỉ lấy phần tử đầu).
Khớp tab thật 31/10 (chỉnh tay sau lần dựng 19/10, script theo): cột ngày 250 px · nhãn H3 "TUẦN ĐANG CHỌN" / "CHỌN TUẦN".
Tab thật dựng lại bằng script này 01/11 (bố cục mỗi suất một ô): 168 hàng × 42 cột · 8 quy tắc · 30 ô gộp. Quy tắc "Theo coach" ngày
đã qua có số hàng trong công thức (ROW()−99) → chèn / xoá hàng phía trên thì sửa tay quy tắc đó (hoặc dựng lại).
"""
import json, sys

if len(sys.argv) < 6: sys.exit(__doc__)
SID, OUT, OLD_CF, OLD_ROWS, OLD_COLS = int(sys.argv[1]), sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])

def rgb(h):
    h = h.lstrip('#')
    # Sheets lưu màu 8 bit bằng cách CẮT (floor) giá trị × 255: 0.949 → F1 (không phải F2), 0.0392 → 09 (không phải 0A).
    # Cộng 1/4 bậc → luôn ra đúng bậc dù Sheets cắt hay làm tròn.
    return {k: min(1.0, round((int(h[i:i + 2], 16) + 0.25) / 255, 6)) for k, i in (('red', 0), ('green', 2), ('blue', 4))}
GIAY, GIAY2, SUONG, KE, TRO, DA, THAN, MUC = map(rgb, ['FAFAFA', 'F2F2F2', 'EFEFEF', 'E2E2E2', 'B0B0B0', '737373', '4A4A4A', '0A0A0A'])
DO = rgb('C2182B')                        # chữ đỏ: ô có khách 1:2 đang lẻ (chủ studio 01/11)
INTER, MONO = 'Inter', 'JetBrains Mono'
LOG, DAT = "'Sổ đặt lịch'", "'_dữ liệu'"

# ---------------- lưới ----------------
# cột: A lề 40 · B giờ 48 · C khe 4 · D T2 250 · E khe 4 · F T3 · … · N T7 · O khe · P CN 250 · Q lề 40 · R 40 · S phụ · T:U tên gọi coach · V coach chưa đặt (S…AB ẩn)
DAY_COLS = [3, 5, 7, 9, 11, 13, 15]
DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
NDAY, GRID_C2 = len(DAYS), DAY_COLS[-1] + 1     # lưới D..P (cột 3..15) · GRID_C2 = cột ngay sau lưới (Q, lề)
NCOL, HIDE_FROM = 42, 18                # S…AP ẩn · AD:AP (29…41) = bảng cờ, cùng hình lưới D:P (cột + 26)
HELP = 26
WIDTHS = {0: 40, 1: 48, 2: 4, 16: 40, 17: 40}
for c in DAY_COLS: WIDTHS[c] = 250
for c in [4, 6, 8, 10, 12, 14]: WIDTHS[c] = 4
# hàng (0-based): 0 lề · 1 tiêu đề · 2 dòng phụ · 3 khoảng · 4 Thứ · 5 ngày · 6 vạch hôm nay 14 · từ 7: mỗi khung SUB hàng con + 1 khe,
# sáng 06–12 · khe · nghỉ trưa · khe · chiều 14–20
SUB, SUB_H = 5, 18                        # suất / khung (= sức chứa 5 coach) · cao mỗi ô con (01/11: 13 px cắt chân chữ g · y · ọ)
KC, KC_H = 8, 18                          # Theo coach: buổi / coach / ngày (dữ liệu 01/11 nhiều nhất 6) · cao mỗi ô con (Inter 8 vừa 18 px)
AM_H, PM_H = 7, 7                         # số khung sáng (06–12) · chiều (14–20)
AM_TOP, AM_ROWS = 7, (SUB + 1) * AM_H - 1         # 06:00 ở hàng 8–12, 12:00 ở hàng 44–48 (khe giữa các khung)
LUNCH_ROW = AM_TOP + AM_ROWS + 1                  # sau khe dưới 12:00
PM_TOP, PM_ROWS = LUNCH_ROW + 2, (SUB + 1) * PM_H - 1
GRID_TOP, GRID_END = AM_TOP, PM_TOP + PM_ROWS     # hàng đệm 56 px dưới lưới
HOUR_ROWS = [AM_TOP + (SUB + 1) * k for k in range(AM_H)] + [PM_TOP + (SUB + 1) * k for k in range(PM_H)]   # hàng con đầu của mỗi khung
HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']   # = LT.SLOTS
assert len(HOURS) == len(HOUR_ROWS) and HOURS[AM_H - 1] == '12:00' and HOURS[AM_H] == '14:00'
R_COACH_T = GRID_END + 1                                                # "Theo coach": tiêu đề · đầu cột · T2..CN mỗi ngày KC hàng con
R_COACH_SUB, R_COACH_HEAD, R_COACH_D0 = R_COACH_T + 1, R_COACH_T + 3, R_COACH_T + 5
R_COACH_END = R_COACH_D0 + NDAY * KC                                      # hàng đệm 56 px sau Theo coach
R_MISS_T = R_COACH_END + 1                                                # "Chưa đặt lịch": tiêu đề · 8 coach
R_MISS_SUB, R_MISS_0 = R_MISS_T + 1, R_MISS_T + 3
NMISS = 8
NROW = R_MISS_0 + NMISS + 2
HEIGHTS = {0: 24, 1: 40, 2: 18, 3: 32, 4: 17, 5: 25, 6: 14, GRID_END: 56, R_COACH_T: 32, R_COACH_SUB: 18, R_COACH_SUB + 1: 16, R_COACH_HEAD: 22,
           R_COACH_HEAD + 1: 6, R_COACH_END: 56, R_MISS_T: 32, R_MISS_SUB: 18, R_MISS_0 - 1: 16, NROW - 2: 24, NROW - 1: 40}
# lưới: khe 4 px, ô con SUB_H, nghỉ trưa 24 px · Theo coach ô con KC_H · hàng "Chưa đặt lịch" để Sheets tự giãn theo số dòng chữ
XEM = (1, 7)                              # H2: ô "Xem tuần" (người dùng chọn ngày) · H3 nhãn

def grid(r1, c1, r2=None, c2=None):
    return {'sheetId': SID, 'startRowIndex': r1, 'endRowIndex': r1 + 1 if r2 is None else r2,
            'startColumnIndex': c1, 'endColumnIndex': c1 + 1 if c2 is None else c2}
def tf(font, size, color):
    return {'fontFamily': font, 'fontSize': size, 'foregroundColor': color, 'bold': False, 'italic': False, 'underline': False}
def style(rng, font, size, color, h=None, v=None, wrap=None, bg=None):
    f, fields = {'textFormat': tf(font, size, color)}, ['textFormat']
    for k, val in (('horizontalAlignment', h), ('verticalAlignment', v), ('wrapStrategy', wrap), ('backgroundColor', bg)):
        if val: f[k] = val; fields.append(k)
    return {'repeatCell': {'range': rng, 'cell': {'userEnteredFormat': f}, 'fields': ','.join('userEnteredFormat.' + x for x in fields)}}
def dim(kind, a, b, **props):
    return {'updateDimensionProperties': {'range': {'sheetId': SID, 'dimension': kind, 'startIndex': a, 'endIndex': b},
                                          'properties': props, 'fields': ','.join(props)}}

# ---------------- s1: cấu trúc ----------------
s1 = [{'deleteConditionalFormatRule': {'sheetId': SID, 'index': 0}} for _ in range(OLD_CF)] + [
    {'unmergeCells': {'range': {'sheetId': SID}}},
    {'updateSheetProperties': {'properties': {'sheetId': SID, 'gridProperties': {'frozenRowCount': 0, 'frozenColumnCount': 0}},
                               'fields': 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'}},
    # hàng mới tinh rồi bỏ toàn bộ hàng cũ: sạch giá trị, định dạng, gộp ô, chiều cao cũ (hàng không đặt cao thì tự giãn theo chữ)
    {'appendDimension': {'sheetId': SID, 'dimension': 'ROWS', 'length': NROW}},
    {'deleteDimension': {'range': {'sheetId': SID, 'dimension': 'ROWS', 'startIndex': 0, 'endIndex': OLD_ROWS}}},
] + ([{'appendDimension': {'sheetId': SID, 'dimension': 'COLUMNS', 'length': NCOL - OLD_COLS}}] if OLD_COLS < NCOL else
      [{'deleteDimension': {'range': {'sheetId': SID, 'dimension': 'COLUMNS', 'startIndex': NCOL, 'endIndex': OLD_COLS}}}] if OLD_COLS > NCOL else []) + [
    # không cố định hàng / cột: đường chia dày của Sheets không có trong UI (chủ studio muốn y hệt bảng giờ)
    {'updateSheetProperties': {'properties': {'sheetId': SID, 'gridProperties': {'frozenRowCount': 0, 'frozenColumnCount': 0, 'hideGridlines': True}},
                               'fields': 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines'}},
]
c = 0
while c < HIDE_FROM:
    w, c2 = WIDTHS[c], c
    while c2 + 1 < HIDE_FROM and WIDTHS[c2 + 1] == w: c2 += 1
    s1.append(dim('COLUMNS', c, c2 + 1, pixelSize=w, hiddenByUser=False))
    c = c2 + 1
s1.append(dim('COLUMNS', HIDE_FROM, NCOL, pixelSize=100, hiddenByUser=True))
for r, h in sorted(HEIGHTS.items()): s1.append(dim('ROWS', r, r + 1, pixelSize=h))
s1.append(dim('ROWS', GRID_TOP, GRID_END, pixelSize=4))
for r in HOUR_ROWS: s1.append(dim('ROWS', r, r + SUB, pixelSize=SUB_H))
s1.append(dim('ROWS', R_COACH_D0, R_COACH_END, pixelSize=KC_H))
s1.append(dim('ROWS', LUNCH_ROW, LUNCH_ROW + 1, pixelSize=24))

# ---------------- s2: định dạng ----------------
B = {'style': 'SOLID', 'width': 1, 'color': KE}
s2 = [
    {'repeatCell': {'range': grid(0, 0, NROW, NCOL), 'cell': {'userEnteredFormat': {
        'backgroundColor': GIAY, 'textFormat': tf(INTER, 8, MUC), 'verticalAlignment': 'MIDDLE', 'horizontalAlignment': 'LEFT', 'wrapStrategy': 'OVERFLOW_CELL'}},
        'fields': ','.join('userEnteredFormat.' + x for x in ('backgroundColor', 'textFormat', 'verticalAlignment', 'horizontalAlignment', 'wrapStrategy'))}},
    # đầu trang: tiêu đề Inter 32 px · dòng phụ Mono Than · 4 thông số (số Inter 28 px, nhãn Mono Đá) như sàn của UI
    style(grid(1, 1), INTER, 24, MUC, v='BOTTOM'),
    style(grid(2, 1), MONO, 8, THAN),
]
for cc in [XEM[1], 9, 11, 13, 15]:
    s2 += [style(grid(1, cc), INTER, 21, MUC, h='LEFT', v='BOTTOM'), style(grid(2, cc), MONO, 8, DA, h='LEFT')]
s2 += [
    # ô Xem tuần: ngày dd.mm (năm đã có ở dòng phụ), gạch chân Kẻ như ô nhập
    {'repeatCell': {'range': grid(*XEM), 'cell': {'userEnteredFormat': {'numberFormat': {'type': 'DATE', 'pattern': 'dd.mm'}}},
                    'fields': 'userEnteredFormat.numberFormat'}},
    {'updateBorders': {'range': grid(*XEM), 'bottom': B}},
    # đầu cột ngày
    style(grid(4, 3, 5, GRID_C2), MONO, 8, THAN, h='CENTER', v='BOTTOM'),
    style(grid(5, 3, 6, GRID_C2), MONO, 12, MUC, h='CENTER'),
    style(grid(6, 3, 7, GRID_C2), MONO, 12, MUC, h='CENTER'),
    # cột giờ (gộp SUB hàng con của mỗi khung, chữ giữa)
    style(grid(GRID_TOP, 1, GRID_END, 2), MONO, 8, DA),
] + [{'mergeCells': {'range': grid(r, 1, r + SUB, 2), 'mergeType': 'MERGE_ALL'}} for r in HOUR_ROWS] + [
    # một khung mẫu (D8:D12: SUB ô con, viền Kẻ bao ngoài — không kẻ giữa các ô con, chữ Inter giữa ô) → nhân ra cả lưới theo khuôn
    # (SUB + 1) × 2 (khung · khe cột / khe hàng · khe)
    style(grid(AM_TOP, 3, AM_TOP + SUB, 4), INTER, 8, MUC, h='CENTER', wrap='CLIP'),
    {'updateBorders': {'range': grid(AM_TOP, 3, AM_TOP + SUB, 4), 'top': B, 'bottom': B, 'left': B, 'right': B}},
    {'copyPaste': {'source': grid(AM_TOP, 3, AM_TOP + SUB + 1, 5), 'destination': grid(AM_TOP, 3, AM_TOP + AM_ROWS + 1, GRID_C2 + 1), 'pasteType': 'PASTE_FORMAT'}},
    {'copyPaste': {'source': grid(AM_TOP, 3, AM_TOP + SUB + 1, 5), 'destination': grid(PM_TOP, 3, PM_TOP + PM_ROWS + 1, GRID_C2 + 1), 'pasteType': 'PASTE_FORMAT'}},
    # nghỉ trưa: Giấy 2, chữ Mono Tro (sau khi nhân khuôn: hàng đệm GRID_END nhận định dạng khe — trả lại nền trơn ở dưới)
    {'mergeCells': {'range': grid(LUNCH_ROW, 3, LUNCH_ROW + 1, GRID_C2), 'mergeType': 'MERGE_ALL'}},
    style(grid(LUNCH_ROW, 3, LUNCH_ROW + 1, GRID_C2), MONO, 8, TRO, h='CENTER', bg=GIAY2),
    style(grid(GRID_END, 0, GRID_END + 1, NCOL), INTER, 8, MUC, h='LEFT', wrap='OVERFLOW_CELL'),
    # Theo coach
    style(grid(R_COACH_T, 1), INTER, 16, MUC, v='BOTTOM'),
    style(grid(R_COACH_SUB, 1), MONO, 8, THAN),
    style(grid(R_COACH_HEAD, 3, R_COACH_HEAD + 1, 16), INTER, 9, MUC, v='BOTTOM'),
    style(grid(R_COACH_D0, 1, R_COACH_END, 2), MONO, 8, THAN, v='TOP', wrap='WRAP'),
    style(grid(R_COACH_D0, 3, R_COACH_END, 16), INTER, 8, MUC, wrap='CLIP'),
    {'updateBorders': {'range': grid(R_COACH_HEAD, 1, R_COACH_HEAD + 1, 16), 'bottom': B}},
] + [x for d in range(NDAY) for x in (
    {'mergeCells': {'range': grid(R_COACH_D0 + d * KC, 1, R_COACH_D0 + (d + 1) * KC, 2), 'mergeType': 'MERGE_ALL'}},
    {'updateBorders': {'range': grid(R_COACH_D0 + (d + 1) * KC - 1, 1, R_COACH_D0 + (d + 1) * KC, 16), 'bottom': B}})] + [
    # Chưa đặt lịch
    style(grid(R_MISS_T, 1), INTER, 16, MUC, v='BOTTOM'),
    style(grid(R_MISS_SUB, 1), MONO, 8, THAN),
    style(grid(R_MISS_0, 3, R_MISS_0 + NMISS, 4), INTER, 9, MUC, v='TOP'),
]
for k in range(NMISS):
    s2.append({'mergeCells': {'range': grid(R_MISS_0 + k, 5, R_MISS_0 + k + 1, 16), 'mergeType': 'MERGE_ALL'}})
s2.append(style(grid(R_MISS_0, 5, R_MISS_0 + NMISS, 16), INTER, 8, THAN, v='TOP', wrap='WRAP'))

# ---------------- s3: giá trị + định dạng có điều kiện ----------------
def F(s): return {'userEnteredValue': {'formulaValue': s}}
def S(s): return {'userEnteredValue': {'stringValue': s}}
E, G, L, R, J, I, O, D, Q, K = [LOG + '!$' + x + '$5:$' + x for x in 'EGLRJIODQK']     # K = Loại (1:1 / 1:2)
ON = '"Đã đặt"'
WEEK_ON = f'{D},$S$3,{L},{ON}'
cells = {}
# phụ (cột S, ẩn): S2 thứ Hai của tuần đang xem (ô H2 có ngày → tuần của ngày đó; trống → tuần này, CN vẫn là tuần này vì CN đặt được)
# · S3 mã tuần · S4 sức chứa · S5:S11 coach (tối đa 7)
XA = '$' + chr(65 + XEM[1]) + '$' + str(XEM[0] + 1)                    # $H$2
cells[(0, 18)] = S('_phụ · tuần đang xem · mã tuần · sức chứa · coach')
cells[(1, 18)] = F(f'=IF(ISNUMBER({XA}),INT({XA})-WEEKDAY({XA},2)+1,TODAY()-WEEKDAY(TODAY(),2)+1)')
cells[(2, 18)] = F('=YEAR($S$2+3)&"-W"&TEXT(ISOWEEKNUM($S$2),"00")')
cells[(3, 18)] = F(f'=IF(N({DAT}!$B$1)>0,{DAT}!$B$1,4)')
CO = f'{{{DAT}!$C$5:$C;IFERROR(FILTER({J},{D}=$S$3),"")}}'
cells[(4, 18)] = F(f'=IFERROR(ARRAY_CONSTRAIN(SORT(UNIQUE(FILTER({CO},{CO}<>""))),7,1),"")')
# tên gọi coach (T4 nhãn · T5:U12): bảng hiện TÊN CHÍNH thay 2 chữ cái đầu (chủ studio chốt 17/10). Coach mới chưa có ở đây → hiện đủ họ tên.
NAMES = [('Quyết Hán', 'Quyết'), ('Hiền Mai', 'Mai'), ('Khải Phan', 'Khải'), ('Lâm Nguyễn', 'Lâm'), ('Bích Ngọc', 'Ngọc')]
cells[(3, 19)] = S('_tên gọi coach')
for k, (full, call) in enumerate(NAMES):
    cells[(4 + k, 19)], cells[(4 + k, 20)] = S(full), S(call)
CALL = '$T$5:$U$12'
# đầu trang
cells[(1, 1)] = F('="Lịch tập tuần "&ISOWEEKNUM($S$2)')
cells[(2, 1)] = F(f'=TEXT($S$2,"dd.mm")&" — "&TEXT($S$2+{NDAY - 1},"dd.mm.yyyy")&"  ·  "&IFERROR(LET(s,INDEX(SORT(FILTER({O},{O}<>"",{D}=$S$3),1,FALSE),1),'
                  f'"CẬP NHẬT "&MID(s,9,2)&"."&MID(s,6,2)&" · "&MID(s,12,5)),"CHƯA CÓ LƯỢT ĐẶT")')
# ô Xem tuần: người dùng ghi (s3 không ghi giá trị vào H2) · nhãn đổi theo ô
cells[(2, XEM[1])] = F(f'=IF(ISNUMBER({XA}),"TUẦN ĐANG CHỌN","CHỌN TUẦN")')
cells[(1, 9)], cells[(2, 9)] = F(f'=COUNTIFS({WEEK_ON})'), S('BUỔI ĐÃ ĐẶT')
cells[(1, 11)], cells[(2, 11)] = F(f'=COUNTUNIQUEIFS({Q},{WEEK_ON})'), S('HỘI VIÊN ĐÃ ĐẶT')
BODY = f'$D${GRID_TOP + 1}:$P${GRID_END}'          # $D$8:$P$36
# khung đủ suất: bảng cờ có +2 ở cả SUB ô con của khung → đếm ô ≥ 2 rồi chia SUB
HC = lambda c: chr(65 + (c + HELP) // 26 - 1) + chr(65 + (c + HELP) % 26) if c + HELP >= 26 else chr(65 + c + HELP)
FLAGS = f'${HC(3)}${GRID_TOP + 1}:${HC(15)}${GRID_END}'          # $AD$8:$AP$92
cells[(1, 13)], cells[(2, 13)] = F(f'=COUNTIF({FLAGS},">=2")/{SUB}'), S('KHUNG ĐẦY')
# _dữ liệu chưa có ảnh chụp danh sách (Worker ghi khi hội viên đầu tiên mở trang) → "—", không hiện 0 sai
cells[(1, 15)], cells[(2, 15)] = F(f'=IF(COUNTA({DAT}!$F$5:$F)=0,"—",IFERROR(ROWS(FILTER({DAT}!$F$5:$F,{DAT}!$F$5:$F<>"",COUNTIFS({Q},{DAT}!$F$5:$F,{WEEK_ON})=0)),0))'), S('CHƯA ĐẶT LỊCH')
# đầu cột
for k, cc in enumerate(DAY_COLS):
    cells[(4, cc)] = S(DAYS[k])
    cells[(5, cc)] = F('=TEXT($S$2' + ('+' + str(k) if k else '') + ',"dd.mm")')
# vạch hôm nay (UI: vạch Mực 20 × 2 px dưới ngày): hàng 7 (14 px — thấp hơn thì Sheets không vẽ chữ) ghi "━━" Mono 16 px = 19,2 px dưới cột của hôm nay
for k, cc in enumerate(DAY_COLS):
    cells[(6, cc)] = F('=IF($S$2' + ('+' + str(k) if k else '') + '=TODAY(),"━━","")')
# sổ của tuần đang xem, chỉ dòng "Đã đặt" (lọc một lần cho cả khối): cột 1 ngày · 2 giờ · 3 coach · 4 tên ngắn · 5 loại (1:1 / 1:2)
WK = f'IFERROR(FILTER({{{E},{G},{J},{I},{K}}},{D}=$S$3,{L}={ON}),"")'
COLS = 'e,INDEX(m,0,1),g,INDEX(m,0,2),c,INDEX(m,0,3),s,INDEX(m,0,4),y,INDEX(m,0,5)'
# lưới: MỘT công thức mỗi khối (sáng / chiều, (SUB + 1) × 7 − 1 hàng × 13 cột). Hàng khe / cột khe = "". Ô con k của khung = suất thứ k
# (coach xếp theo tên): "tên + tên · coach"; hơn SUB suất → ô cuối gom phần dư (xuống dòng). Bảng cờ (cột + 26) cùng hình:
# 1 = suất đó là khách 1:2 một mình · +2 = khung đủ suất ($S$4).
def block(nrows, h0, flag):
    head = (f'=LET(m,{WK},{COLS},MAKEARRAY({nrows},{2 * NDAY - 1},LAMBDA(i,j,IF(OR(ISEVEN(j),MOD(i,{SUB + 1})=0),"",'
            f'LET(d,TEXT($S$2+(j-1)/2,"yyyy-mm-dd"),t,TEXT(INT((i-1)/{SUB + 1})+{h0},"00")&":00",k,MOD(i-1,{SUB + 1})+1,'
            f'cs,IFERROR(SORT(UNIQUE(FILTER(c,e=d,g=t))),""),n,IF(INDEX(cs,1)="",0,ROWS(cs)),')
    if not flag:
        body = (f'ln,LAMBDA(x,TEXTJOIN(" + ",TRUE,SORT(FILTER(s,c=x,e=d,g=t)))&" · "&IFERROR(VLOOKUP(x,{CALL},2,FALSE),x)),'
                f'IF(k>n,"",IF(AND(k={SUB},n>{SUB}),TEXTJOIN(CHAR(10),TRUE,MAP(CHOOSEROWS(cs,SEQUENCE(n-{SUB}+1,1,{SUB})),ln)),ln(INDEX(cs,k)))))))))')
    else:
        body = (f'lone,LAMBDA(x,IF(AND(ROWS(FILTER(s,c=x,e=d,g=t))=1,INDEX(FILTER(y,c=x,e=d,g=t),1)="1:2"),1,0)),'
                f'IF(k>n,0,IF(AND(k={SUB},n>{SUB}),MAX(MAP(CHOOSEROWS(cs,SEQUENCE(n-{SUB}+1,1,{SUB})),lone)),lone(INDEX(cs,k))))+IF(n>=$S$4,2,0))))))')
    return F(head + body)
cells[(AM_TOP, 3)], cells[(AM_TOP, 3 + HELP)] = block(AM_ROWS, 6, False), block(AM_ROWS, 6, True)
cells[(PM_TOP, 3)], cells[(PM_TOP, 3 + HELP)] = block(PM_ROWS, 14, False), block(PM_ROWS, 14, True)
for i, r in enumerate(HOUR_ROWS): cells[(r, 1)] = S(HOURS[i])
cells[(LUNCH_ROW, 3)] = S('NGHỈ TRƯA · 13:00–14:00')
# Theo coach: đầu cột = coach (cột khe ""); mỗi ngày KC ô con, ô con k của cột coach = buổi thứ k trong ngày (theo giờ)
# "06:00   L. Lẻ Một" / cặp 1:2 "07:00   K. Cặp Một + K. Cặp Hai"; hơn KC buổi → ô cuối gom phần dư. Bảng cờ (cột + 26): 1 = buổi đó
# là khách 1:2 một mình. Một công thức trải NDAY × KC hàng × 13 cột từ D(R_COACH_D0 + 1).
cells[(R_COACH_T, 1)] = S('Theo coach')
cells[(R_COACH_SUB, 1)] = S('GIỜ VÀ HỘI VIÊN CỦA TỪNG COACH TRONG NGÀY')
cells[(R_COACH_HEAD, 3)] = F(f'=MAKEARRAY(1,13,LAMBDA(i,j,IF(ISEVEN(j),"",LET(k,INDEX($S$5:$S$11,(j+1)/2),IF(k="","",IFERROR(VLOOKUP(k,{CALL},2,FALSE),k))))))')
for d in range(NDAY):
    cells[(R_COACH_D0 + d * KC, 1)] = F('="' + DAYS[d] + '"&CHAR(10)&TEXT($S$2' + ('+' + str(d) if d else '') + ',"dd.mm")')
def coach_block(flag):
    head = (f'=LET(m,{WK},{COLS},MAKEARRAY({NDAY * KC},13,LAMBDA(i,j,LET(co,IF(ISEVEN(j),"",INDEX($S$5:$S$11,(j+1)/2)),'
            f'd,TEXT($S$2+INT((i-1)/{KC}),"yyyy-mm-dd"),k,MOD(i-1,{KC})+1,IF(co="","",'
            f'LET(ts,IFERROR(SORT(UNIQUE(FILTER(g,c=co,e=d))),""),n,IF(INDEX(ts,1)="",0,ROWS(ts)),')
    if not flag:
        body = (f'ln,LAMBDA(t,t&"   "&TEXTJOIN(" + ",TRUE,SORT(FILTER(s,c=co,e=d,g=t)))),'
                f'IF(k>n,"",IF(AND(k={KC},n>{KC}),TEXTJOIN(CHAR(10),TRUE,MAP(CHOOSEROWS(ts,SEQUENCE(n-{KC}+1,1,{KC})),ln)),ln(INDEX(ts,k))))))))))')
    else:
        body = (f'lone,LAMBDA(t,IF(AND(ROWS(FILTER(s,c=co,e=d,g=t))=1,INDEX(FILTER(y,c=co,e=d,g=t),1)="1:2"),1,0)),'
                f'IF(k>n,0,IF(AND(k={KC},n>{KC}),MAX(MAP(CHOOSEROWS(ts,SEQUENCE(n-{KC}+1,1,{KC})),lone)),lone(INDEX(ts,k))))))))))')
    return F(head + body)
cells[(R_COACH_D0, 3)], cells[(R_COACH_D0, 3 + HELP)] = coach_block(False), coach_block(True)
# Chưa đặt lịch: coach (trải xuống từ D54) · tên hội viên còn buổi mà chưa có buổi nào trong tuần
VM = f'$V${R_MISS_0 + 1}:$V${R_MISS_0 + NMISS}'
cells[(R_MISS_T, 1)] = S('Chưa đặt lịch')
cells[(R_MISS_SUB, 1)] = S('HỘI VIÊN CÒN BUỔI NHƯNG CHƯA CÓ BUỔI NÀO TRONG TUẦN')
cells[(R_MISS_0, 21)] = F(f'=IFERROR(ARRAY_CONSTRAIN(SORT(UNIQUE(FILTER({DAT}!$C$5:$C,{DAT}!$C$5:$C<>""))),{NMISS},1),"")')
cells[(R_MISS_0, 3)] = F(f'=ARRAYFORMULA(IF({VM}="","",IFERROR(VLOOKUP({VM},{CALL},2,FALSE),{VM})))')
for k in range(NMISS):
    r = R_MISS_0 + k
    cells[(r, 5)] = F(f'=IF($V{r + 1}="","",IFERROR(TEXTJOIN("  ·  ",TRUE,SORT(FILTER({DAT}!$B$5:$B,{DAT}!$C$5:$C=$V{r + 1},'
                      f'COUNTIFS({Q},{DAT}!$F$5:$F,{WEEK_ON})=0))),"Tất cả đã đặt"))')

s3, by_row = [], {}
for (r, c_), v in cells.items(): by_row.setdefault(r, {})[c_] = v
for r in sorted(by_row):
    cs = sorted(by_row[r])
    # mỗi đoạn ô liền nhau một updateCells (ô ở giữa hai ô có dữ liệu mà trống thì không ghi gì)
    runs, cur = [], [cs[0]]
    for x in cs[1:]:
        if x == cur[-1] + 1: cur.append(x)
        else: runs.append(cur); cur = [x]
    runs.append(cur)
    for run in runs:
        s3.append({'updateCells': {'range': grid(r, run[0], r + 1, run[-1] + 1), 'rows': [{'values': [by_row[r][x] for x in run]}], 'fields': 'userEnteredValue'}})

def cf(ranges, formula, fmt):
    return {'addConditionalFormatRule': {'index': 0, 'rule': {'ranges': ranges, 'booleanRule': {
        'condition': {'type': 'CUSTOM_FORMULA', 'values': [{'userEnteredValue': formula}]}, 'format': fmt}}}}
# addConditionalFormatRule index 0 = lên đầu danh sách → thêm theo thứ tự ưu tiên TĂNG dần (quy tắc thêm sau thắng)
body = [grid(GRID_TOP, 3, GRID_END, GRID_C2)]
DAY_OF_COL = '$S$2+(COLUMN()-4)/2'
s3 += [
    cf(body, f'=AD{GRID_TOP + 1}=2', {'backgroundColor': SUONG}),                                            # khung đủ suất
    cf(body, f'=AD{GRID_TOP + 1}=1', {'textFormat': {'foregroundColor': DO}}),                             # khách 1:2 một mình
    cf(body, f'=AD{GRID_TOP + 1}=3', {'backgroundColor': SUONG, 'textFormat': {'foregroundColor': DO}}),   # cả hai
    cf(body, f'=AND(ISEVEN(COLUMN()),AD{GRID_TOP + 1}<>"",{DAY_OF_COL}<TODAY())', {'backgroundColor': GIAY2, 'textFormat': {'foregroundColor': DA}}),
    cf([grid(4, 3, 5, GRID_C2)], f'=AND(ISEVEN(COLUMN()),{DAY_OF_COL}=TODAY())', {'textFormat': {'foregroundColor': MUC}}),
    cf([grid(4, 3, 6, GRID_C2)], f'=AND(ISEVEN(COLUMN()),{DAY_OF_COL}<TODAY())', {'textFormat': {'foregroundColor': TRO}}),
    cf([grid(R_COACH_D0, 3, R_COACH_END, 16)], f'=AD{R_COACH_D0 + 1}=1', {'textFormat': {'foregroundColor': DO}}),
    # Theo coach ngày đã qua: số hàng nằm TRONG công thức (ROW() − hàng T2) → chèn / xoá hàng phía trên phải sửa tay quy tắc này
    cf([grid(R_COACH_D0, 1, R_COACH_END, 16)], f'=$S$2+INT((ROW()-{R_COACH_D0 + 1})/{KC})<TODAY()', {'textFormat': {'foregroundColor': DA}}),
    # ô Xem tuần: chỉ nhận ngày (bấm đúp → lịch chọn ngày; locale en_US nên gõ tay "26/10" không phải ngày → bị từ chối)
    {'setDataValidation': {'range': grid(*XEM), 'rule': {'condition': {'type': 'DATE_IS_VALID'}, 'strict': True,
        'inputMessage': 'Bấm đúp để chọn một ngày bất kỳ trong tuần muốn xem. Xoá ô = về tuần này.'}}},
]

# Tự kiểm: mọi công thức cân ngoặc (ngoài chuỗi). Sheets nhận công thức lệch ngoặc mà không báo lỗi API, ô chỉ hiện #ERROR!
# (01/11: ô D99 thừa một ")" → Theo coach trống cả bảng).
def _cân_ngoặc(f):
    d, trong = 0, False
    for ch in f:
        if ch == '"': trong = not trong
        elif not trong:
            d += (ch == '(') - (ch == ')')
            if d < 0: return False
    return d == 0 and not trong
_cthuc = [v['userEnteredValue']['formulaValue'] for v in cells.values() if 'formulaValue' in v.get('userEnteredValue', {})]
_cthuc += [q['addConditionalFormatRule']['rule']['booleanRule']['condition']['values'][0]['userEnteredValue']
           for q in s3 if 'addConditionalFormatRule' in q]
_lệch = [f[:60] for f in _cthuc if not _cân_ngoặc(f)]
if _lệch: sys.exit(f'Công thức lệch ngoặc: {_lệch}')

for name, reqs in (('s1', s1), ('s2', s2), ('s3', s3)):
    txt = json.dumps(reqs, ensure_ascii=False, separators=(',', ':'))
    with open(f'{OUT}/{name}_{SID}.json', 'w', encoding='utf-8') as fh: fh.write(txt)
    print(name, len(reqs), 'requests', len(txt), 'bytes')
