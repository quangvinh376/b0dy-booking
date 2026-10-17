# -*- coding: utf-8 -*-
"""
Tab "Bảng lịch tập" dựng lại theo bảng giờ của UI booking (Figma V2.4 · 03 Đặt lịch · bảng tuần):
cột giờ 48 · khe 4 · ô ngày viền Kẻ 10 % · dải nghỉ trưa Giấy 2 · cột CN "COACH NGHỈ" · đầu cột Thứ (Mono, Than) + ngày (Mono 16 px, Mực).
Ô = tên hội viên đã đặt khung đó ("H. Đức Nam · Quyết" — tên gọi coach, bảng T5:U12), xếp theo coach rồi theo tên. Ô đủ người → nền Sương (như ô "ĐẦY").
Ngày đã qua → Giấy 2, chữ Đá (như "đã qua"). Hôm nay → Thứ màu Mực + vạch "━━" dưới ngày (như vạch 20 × 2 px của UI).
Chữ thường: Inter (chủ studio chốt 17/10). Số, nhãn: JetBrains Mono. Sheets không có độ đậm 500, bo góc, khoảng chữ → bỏ.
Mỗi khối lưới là MỘT công thức MAKEARRAY trải ra cả khối (ô khe = ""), không có công thức từng ô.

python3 tools/bang_lich_tap.py <sheetId> <thư mục ra> [số quy tắc định dạng có điều kiện đang có trên tab]
  → s1 (cấu trúc) · s2 (định dạng) · s3 (giá trị + định dạng có điều kiện): requests cho spreadsheets.batchUpdate, áp theo thứ tự s1 → s2 → s3.
Bẫy đã gặp (17/10):
  · s1 không tự biết tab đang có bao nhiêu quy tắc định dạng có điều kiện → truyền tham số thứ 3 (đếm bằng spreadsheets.get, fields
    sheets.conditionalFormats) để s1 xoá hết trước. Quy tắc cũ còn sót thì s2 (copyPaste PASTE_FORMAT) kéo nó giãn ra cả lưới.
  · Chạy lại RIÊNG s2 khi s3 đã có cũng vậy: copyPaste mang theo quy tắc của ô mẫu D8:E9 → luôn chạy lại đủ s1 → s2 → s3.
  · Màu: Sheets cắt (floor) giá trị × 255 → xem rgb().
"""
import json, sys

SID = int(sys.argv[1]) if len(sys.argv) > 1 else 0
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
OLD_CF = int(sys.argv[3]) if len(sys.argv) > 3 else 0

def rgb(h):
    h = h.lstrip('#')
    # Sheets lưu màu 8 bit bằng cách CẮT (floor) giá trị × 255: 0.949 → F1 (không phải F2), 0.0392 → 09 (không phải 0A).
    # Cộng 1/4 bậc → luôn ra đúng bậc dù Sheets cắt hay làm tròn.
    return {k: min(1.0, round((int(h[i:i + 2], 16) + 0.25) / 255, 6)) for k, i in (('red', 0), ('green', 2), ('blue', 4))}
GIAY, GIAY2, SUONG, KE, TRO, DA, THAN, MUC = map(rgb, ['FAFAFA', 'F2F2F2', 'EFEFEF', 'E2E2E2', 'B0B0B0', '737373', '4A4A4A', '0A0A0A'])
INTER, MONO = 'Inter', 'JetBrains Mono'
LOG, DAT = "'Sổ đặt lịch'", "'_dữ liệu'"

# ---------------- lưới ----------------
# cột: A lề 40 · B giờ 48 · C khe 4 · D T2 150 · E khe 4 · F T3 · … · N T7 · O khe · P CN 150 · Q lề 40 · R 40 · S phụ · T:U tên gọi coach · V coach chưa đặt (S…AB ẩn)
DAY_COLS = [3, 5, 7, 9, 11, 13]
CN_COL = 15
NCOL, HIDE_FROM = 28, 18
WIDTHS = {0: 40, 1: 48, 2: 4, 14: 4, 16: 40, 17: 40}
for c in DAY_COLS + [CN_COL]: WIDTHS[c] = 150
for c in [4, 6, 8, 10, 12]: WIDTHS[c] = 4
# hàng (0-based): 0 lề · 1 tiêu đề · 2 dòng phụ · 3 khoảng · 4 Thứ · 5 ngày · 6 vạch hôm nay 14 · 7–17 sáng (06–11) · 18 khe · 19 nghỉ trưa · 20 khe · 21–33 chiều (14–20)
AM_TOP, AM_ROWS = 7, 11                   # 06:00 ở hàng 8, 11:00 ở hàng 18 (khe ở giữa)
LUNCH_ROW = 19
PM_TOP, PM_ROWS = 21, 13                  # 14:00 ở hàng 22, 20:00 ở hàng 34
GRID_TOP, GRID_END = 7, 34
HOUR_ROWS = [AM_TOP + 2 * k for k in range(6)] + [PM_TOP + 2 * k for k in range(7)]
HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
R_COACH_T, R_COACH_SUB, R_COACH_HEAD, R_COACH_D0 = 35, 36, 38, 40      # "Theo coach": tiêu đề hàng 36 · đầu cột hàng 39 · T2..T7 hàng 41–46
R_MISS_T, R_MISS_SUB, R_MISS_0 = 47, 48, 50                             # "Chưa đặt lịch": tiêu đề hàng 48 · 8 coach hàng 51–58
NROW = 60
OLD_ROWS, OLD_COLS = 60, 17               # tab hiện có: 60 hàng × 17 cột (A..Q)
HEIGHTS = {0: 24, 1: 40, 2: 18, 3: 32, 4: 17, 5: 25, 6: 14, 34: 56, R_COACH_T: 32, R_COACH_SUB: 18, 37: 16, R_COACH_HEAD: 22, 39: 6,
           46: 56, R_MISS_T: 32, R_MISS_SUB: 18, 49: 16, 58: 24, 59: 40}
# lưới: khe 4 px, giờ 64 px, nghỉ trưa 24 px · hàng 41–46 và 51–58 để Sheets tự giãn theo số dòng chữ

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
    {'appendDimension': {'sheetId': SID, 'dimension': 'COLUMNS', 'length': NCOL - OLD_COLS}},
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
for r in HOUR_ROWS: s1.append(dim('ROWS', r, r + 1, pixelSize=64))
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
for cc in [9, 11, 13, 15]:
    s2 += [style(grid(1, cc), INTER, 21, MUC, h='LEFT', v='BOTTOM'), style(grid(2, cc), MONO, 8, DA, h='LEFT')]
s2 += [
    # đầu cột ngày (CN màu Tro)
    style(grid(4, 3, 5, 15), MONO, 8, THAN, h='CENTER', v='BOTTOM'),
    style(grid(5, 3, 6, 15), MONO, 12, MUC, h='CENTER'),
    style(grid(4, CN_COL), MONO, 8, TRO, h='CENTER', v='BOTTOM'),
    style(grid(5, CN_COL), MONO, 12, TRO, h='CENTER'),
    style(grid(6, 3, 7, 14), MONO, 12, MUC, h='CENTER'),
    # cột giờ
    style(grid(GRID_TOP, 1, GRID_END, 2), MONO, 8, DA),
    # một ô mẫu (D8: viền Kẻ, chữ Inter giữa ô, xuống dòng) → nhân ra cả lưới theo khuôn 2×2 (ô · khe cột / khe hàng · khe)
    style(grid(AM_TOP, 3), INTER, 8, MUC, h='CENTER', wrap='WRAP'),
    {'updateBorders': {'range': grid(AM_TOP, 3), 'top': B, 'bottom': B, 'left': B, 'right': B}},
    {'copyPaste': {'source': grid(AM_TOP, 3, AM_TOP + 2, 5), 'destination': grid(AM_TOP, 3, AM_TOP + 12, 15), 'pasteType': 'PASTE_FORMAT'}},
    {'copyPaste': {'source': grid(AM_TOP, 3, AM_TOP + 2, 5), 'destination': grid(PM_TOP, 3, PM_TOP + 14, 15), 'pasteType': 'PASTE_FORMAT'}},
    # nghỉ trưa · CN coach nghỉ: Giấy 2, chữ Mono Tro (sau khi nhân khuôn: hàng 35 nhận định dạng khe — trả lại nền trơn ở dưới)
    {'mergeCells': {'range': grid(LUNCH_ROW, 3, LUNCH_ROW + 1, 14), 'mergeType': 'MERGE_ALL'}},
    style(grid(LUNCH_ROW, 3, LUNCH_ROW + 1, 14), MONO, 8, TRO, h='CENTER', bg=GIAY2),
    {'mergeCells': {'range': grid(GRID_TOP, CN_COL, GRID_END, CN_COL + 1), 'mergeType': 'MERGE_ALL'}},
    style(grid(GRID_TOP, CN_COL, GRID_END, CN_COL + 1), MONO, 8, TRO, h='CENTER', wrap='WRAP', bg=GIAY2),
    style(grid(GRID_END, 0, GRID_END + 1, NCOL), INTER, 8, MUC, h='LEFT', wrap='OVERFLOW_CELL'),
    # Theo coach
    style(grid(R_COACH_T, 1), INTER, 16, MUC, v='BOTTOM'),
    style(grid(R_COACH_SUB, 1), MONO, 8, THAN),
    style(grid(R_COACH_HEAD, 3, R_COACH_HEAD + 1, 16), INTER, 9, MUC, v='BOTTOM'),
    style(grid(R_COACH_D0, 1, R_COACH_D0 + 6, 2), MONO, 8, THAN, v='TOP', wrap='WRAP'),
    style(grid(R_COACH_D0, 3, R_COACH_D0 + 6, 16), INTER, 8, MUC, v='TOP', wrap='WRAP'),
    {'updateBorders': {'range': grid(R_COACH_HEAD, 1, R_COACH_HEAD + 1, 16), 'bottom': B}},
    {'updateBorders': {'range': grid(R_COACH_D0, 1, R_COACH_D0 + 6, 16), 'bottom': B, 'innerHorizontal': B}},
    # Chưa đặt lịch
    style(grid(R_MISS_T, 1), INTER, 16, MUC, v='BOTTOM'),
    style(grid(R_MISS_SUB, 1), MONO, 8, THAN),
    style(grid(R_MISS_0, 3, R_MISS_0 + 8, 4), INTER, 9, MUC, v='TOP'),
]
for k in range(8):
    s2.append({'mergeCells': {'range': grid(R_MISS_0 + k, 5, R_MISS_0 + k + 1, 16), 'mergeType': 'MERGE_ALL'}})
s2.append(style(grid(R_MISS_0, 5, R_MISS_0 + 8, 16), INTER, 8, THAN, v='TOP', wrap='WRAP'))

# ---------------- s3: giá trị + định dạng có điều kiện ----------------
def F(s): return {'userEnteredValue': {'formulaValue': s}}
def S(s): return {'userEnteredValue': {'stringValue': s}}
E, G, L, R, J, I, O, D, Q = [LOG + '!$' + x + '$5:$' + x for x in 'EGLRJIODQ']
ON = '"Đã đặt"'
WEEK_ON = f'{D},$S$3,{L},{ON}'
cells = {}
# phụ (cột S, ẩn): S2 thứ Hai của tuần đang xem (CN → tuần sau, như trang đặt lịch) · S3 mã tuần · S4 sức chứa · S5:S11 coach (tối đa 7)
cells[(0, 18)] = S('_phụ · tuần đang xem · mã tuần · sức chứa · coach')
cells[(1, 18)] = F('=IF(WEEKDAY(TODAY(),2)=7,TODAY()+1,TODAY()-WEEKDAY(TODAY(),2)+1)')
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
cells[(2, 1)] = F(f'=TEXT($S$2,"dd.mm")&" — "&TEXT($S$2+5,"dd.mm.yyyy")&"  ·  "&IFERROR(LET(s,INDEX(SORT(FILTER({O},{O}<>"",{D}=$S$3),1,FALSE),1),'
                  f'"CẬP NHẬT "&MID(s,9,2)&"."&MID(s,6,2)&" · "&MID(s,12,5)),"CHƯA CÓ LƯỢT ĐẶT")')
cells[(1, 9)], cells[(2, 9)] = F(f'=COUNTIFS({WEEK_ON})'), S('BUỔI ĐÃ ĐẶT')
cells[(1, 11)], cells[(2, 11)] = F(f'=COUNTUNIQUEIFS({Q},{WEEK_ON})'), S('HỘI VIÊN ĐÃ ĐẶT')
BODY = '$D$8:$N$34'
cells[(1, 13)], cells[(2, 13)] = F(f'=SUMPRODUCT(({BODY}<>"")*((LEN({BODY})-LEN(SUBSTITUTE({BODY},CHAR(10),""))+1)>=$S$4))'), S('KHUNG ĐẦY')
# _dữ liệu chưa có ảnh chụp danh sách (Worker ghi khi hội viên đầu tiên mở trang) → "—", không hiện 0 sai
cells[(1, 15)], cells[(2, 15)] = F(f'=IF(COUNTA({DAT}!$F$5:$F)=0,"—",IFERROR(ROWS(FILTER({DAT}!$F$5:$F,{DAT}!$F$5:$F<>"",COUNTIFS({Q},{DAT}!$F$5:$F,{WEEK_ON})=0)),0))'), S('CHƯA ĐẶT LỊCH')
# đầu cột
for k, cc in enumerate(DAY_COLS + [CN_COL]):
    cells[(4, cc)] = S(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][k])
    cells[(5, cc)] = F('=TEXT($S$2' + ('+' + str(k) if k else '') + ',"dd.mm")')
# vạch hôm nay (UI: vạch Mực 20 × 2 px dưới ngày): hàng 7 (14 px — thấp hơn thì Sheets không vẽ chữ) ghi "━━" Mono 16 px = 19,2 px dưới cột của hôm nay
for k, cc in enumerate(DAY_COLS):
    cells[(6, cc)] = F('=IF($S$2' + ('+' + str(k) if k else '') + '=TODAY(),"━━","")')
# lưới: MỘT công thức mỗi khối (sáng 11 × 11 từ D8 · chiều 13 × 11 từ D22). Hàng / cột chẵn của khối = khe → "".
def block(nrows, h0):
    return F(f'=LET(e,{E},g,{G},l,{L},c,{J},n,ARRAYFORMULA({I}&" · "&IFERROR(VLOOKUP({J},{CALL},2,FALSE),{J})),'
             f'MAKEARRAY({nrows},11,LAMBDA(i,j,IF(OR(ISEVEN(i),ISEVEN(j)),"",'
             f'IFERROR(TEXTJOIN(CHAR(10),TRUE,INDEX(SORT(FILTER({{n,c}},e=TEXT($S$2+(j-1)/2,"yyyy-mm-dd"),g=TEXT((i-1)/2+{h0},"00")&":00",l={ON}),'
             f'2,TRUE,1,TRUE),0,1)),"")))))')
cells[(AM_TOP, 3)] = block(AM_ROWS, 6)
cells[(PM_TOP, 3)] = block(PM_ROWS, 14)
for i, r in enumerate(HOUR_ROWS): cells[(r, 1)] = S(HOURS[i])
cells[(LUNCH_ROW, 3)] = S('NGHỈ TRƯA · 12:00–14:00')
cells[(GRID_TOP, CN_COL)] = S('COACH\nNGHỈ')
# Theo coach: đầu cột = coach (cột khe ""), mỗi ô "06:00   H. Đức Nam" theo giờ — một công thức trải 6 × 13 từ D41
cells[(R_COACH_T, 1)] = S('Theo coach')
cells[(R_COACH_SUB, 1)] = S('GIỜ VÀ HỘI VIÊN CỦA TỪNG COACH TRONG NGÀY')
cells[(R_COACH_HEAD, 3)] = F(f'=MAKEARRAY(1,13,LAMBDA(i,j,IF(ISEVEN(j),"",LET(k,INDEX($S$5:$S$11,(j+1)/2),IF(k="","",IFERROR(VLOOKUP(k,{CALL},2,FALSE),k))))))')
for d in range(6):
    cells[(R_COACH_D0 + d, 1)] = F('="' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d] + '"&CHAR(10)&TEXT($S$2' + ('+' + str(d) if d else '') + ',"dd.mm")')
cells[(R_COACH_D0, 3)] = F(f'=LET(e,{E},g,{G},l,{L},n,{I},c,{J},MAKEARRAY(6,13,LAMBDA(i,j,LET(k,IF(ISEVEN(j),"",INDEX($S$5:$S$11,(j+1)/2)),IF(k="","",'
                           f'IFERROR(TEXTJOIN(CHAR(10),TRUE,SORT(FILTER(g&"   "&n,c=k,e=TEXT($S$2+i-1,"yyyy-mm-dd"),l={ON}))),""))))))')
# Chưa đặt lịch: coach (trải xuống từ D51) · tên hội viên còn buổi mà chưa có buổi nào trong tuần
cells[(R_MISS_T, 1)] = S('Chưa đặt lịch')
cells[(R_MISS_SUB, 1)] = S('HỘI VIÊN CÒN BUỔI NHƯNG CHƯA CÓ BUỔI NÀO TRONG TUẦN')
cells[(R_MISS_0, 21)] = F(f'=IFERROR(ARRAY_CONSTRAIN(SORT(UNIQUE(FILTER({DAT}!$C$5:$C,{DAT}!$C$5:$C<>""))),8,1),"")')
cells[(R_MISS_0, 3)] = F(f'=ARRAYFORMULA(IF($V$51:$V$58="","",IFERROR(VLOOKUP($V$51:$V$58,{CALL},2,FALSE),$V$51:$V$58)))')
for k in range(8):
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
body = [grid(GRID_TOP, 3, GRID_END, 14)]
DAY_OF_COL = '$S$2+(COLUMN()-4)/2'
s3 += [
    cf(body, '=AND(ISEVEN(COLUMN()),D8<>"",LEN(D8)-LEN(SUBSTITUTE(D8,CHAR(10),""))+1>=$S$4)', {'backgroundColor': SUONG}),
    cf(body, f'=AND(ISEVEN(COLUMN()),$B8<>"",{DAY_OF_COL}<TODAY())', {'backgroundColor': GIAY2, 'textFormat': {'foregroundColor': DA}}),
    cf([grid(4, 3, 5, 14)], f'=AND(ISEVEN(COLUMN()),{DAY_OF_COL}=TODAY())', {'textFormat': {'foregroundColor': MUC}}),
    cf([grid(4, 3, 6, 14)], f'=AND(ISEVEN(COLUMN()),{DAY_OF_COL}<TODAY())', {'textFormat': {'foregroundColor': TRO}}),
    cf([grid(R_COACH_D0, 1, R_COACH_D0 + 6, 16)], f'=$S$2+ROW()-{R_COACH_D0 + 1}<TODAY()', {'textFormat': {'foregroundColor': DA}}),
]

for name, reqs in (('s1', s1), ('s2', s2), ('s3', s3)):
    txt = json.dumps(reqs, ensure_ascii=False, separators=(',', ':'))
    with open(f'{OUT}/{name}_{SID}.json', 'w', encoding='utf-8') as fh: fh.write(txt)
    print(name, len(reqs), 'requests', len(txt), 'bytes')
