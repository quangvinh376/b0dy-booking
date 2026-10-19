# -*- coding: utf-8 -*-
"""
Tab "Lịch coach" (file "Lịch tập tuần"): lưới ô tick từng giờ × 7 ngày cho từng coach — tick = coach nhận khách khung đó.
Máy chủ đọc bằng schedFrom (worker/src/core.js) · ltSchedFrom_ (backend/LichTuan.gs): hàng có đủ 7 nhãn T2…CN là đầu khối,
ô có chữ gần nhất bên trái nhãn đầu tiên là tên coach (so như cột Coach của BA: bỏ hậu tố "(…)", bỏ dấu, chữ thường),
các hàng dưới cùng cột đó là giờ ("06:00" hay giá trị giờ) cho tới hàng đầu tiên không có giờ. Coach không có khối → T2–T7 nhận
đủ giờ, CN nghỉ (như trước 1.1.0). Mặc định của tab này = đúng như vậy (T2–T7 tick đủ, CN trống) → tạo tab không đổi gì cho tới
khi chủ studio sửa ô tick.

python3 tools/lich_coach.py <thư mục ra> [sheetId mới, mặc định 713] [vị trí tab, mặc định 1]
  → lich_coach.json: requests cho spreadsheets.batchUpdate (addSheet + giá trị + ô tick + định dạng), áp một lần.
Chỉ dùng để TẠO tab (addSheet trùng tên thì Sheets từ chối cả lượt). Tab đã có thì sửa tay, đừng chạy lại.
"""
import json, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
SID = int(sys.argv[2]) if len(sys.argv) > 2 else 713
POS = int(sys.argv[3]) if len(sys.argv) > 3 else 1
TITLE = 'Lịch coach'                     # = LT.SCHED

def rgb(h):
    h = h.lstrip('#')
    # như tools/bang_lich_tap.py: Sheets cắt (floor) giá trị × 255 → cộng 1/4 bậc
    return {k: min(1.0, round((int(h[i:i + 2], 16) + 0.25) / 255, 6)) for k, i in (('red', 0), ('green', 2), ('blue', 4))}
GIAY, GIAY2, KE, DA, THAN, MUC = map(rgb, ['FAFAFA', 'F2F2F2', 'E2E2E2', '737373', '4A4A4A', '0A0A0A'])
INTER, MONO = 'Inter', 'JetBrains Mono'

COACHES = ['Quyết Hán', 'Hiền Mai', 'Khải Phan', 'Lâm Nguyễn', 'Bích Ngọc']
DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']   # = LT.SLOTS
# cột: A lề 24 · B tên coach / giờ 96 · C..I T2..CN 44 · J lề 24
C_NAME, C_D0 = 1, 2
NCOL = C_D0 + len(DAYS) + 1
# hàng: 0 lề · 1 tiêu đề · 2 dòng phụ · 3–6 ghi chú (mỗi ý một dòng — chữ tràn quá cột cuối của tab thì bị cắt) · 7 khoảng
# · rồi mỗi coach: đầu khối + 13 giờ + 1 khoảng
NOTES = ['Có hiệu lực trên trang đặt lịch sau 1–2 phút.',
         'Bỏ tick không huỷ buổi đã đặt — chỉ chặn đặt / đổi mới vào khung đó.',
         'Coach không có khối ở đây: T2–T7 nhận đủ giờ, CN nghỉ.',
         'Thêm coach: chép một khối xuống dưới, ô đầu khối ghi tên như cột Coach của BA.']
R0 = 3 + len(NOTES) + 1
BLOCK = 1 + len(HOURS) + 1
NROW = R0 + BLOCK * len(COACHES) + 4

def grid(r1, c1, r2=None, c2=None):
    return {'sheetId': SID, 'startRowIndex': r1, 'endRowIndex': r1 + 1 if r2 is None else r2,
            'startColumnIndex': c1, 'endColumnIndex': c1 + 1 if c2 is None else c2}
def tf(font, size, color):
    return {'fontFamily': font, 'fontSize': size, 'foregroundColor': color, 'bold': False, 'italic': False, 'underline': False}
def style(rng, font, size, color, h=None, v=None, bg=None, nf=None):
    f, fields = {'textFormat': tf(font, size, color)}, ['textFormat']
    for k, val in (('horizontalAlignment', h), ('verticalAlignment', v), ('backgroundColor', bg), ('numberFormat', nf)):
        if val: f[k] = val; fields.append(k)
    return {'repeatCell': {'range': rng, 'cell': {'userEnteredFormat': f}, 'fields': ','.join('userEnteredFormat.' + x for x in fields)}}
def dim(kind, a, b, px):
    return {'updateDimensionProperties': {'range': {'sheetId': SID, 'dimension': kind, 'startIndex': a, 'endIndex': b},
                                          'properties': {'pixelSize': px}, 'fields': 'pixelSize'}}
def S(s): return {'userEnteredValue': {'stringValue': s}}
def T(b): return {'userEnteredValue': {'boolValue': b}}
def put(r, c, row): return {'updateCells': {'range': grid(r, c, r + 1, c + len(row)), 'rows': [{'values': row}], 'fields': 'userEnteredValue'}}

B = {'style': 'SOLID', 'width': 1, 'color': KE}
reqs = [
    {'addSheet': {'properties': {'sheetId': SID, 'title': TITLE, 'index': POS,
                                 'gridProperties': {'rowCount': NROW, 'columnCount': NCOL, 'hideGridlines': True}}}},
    style(grid(0, 0, NROW, NCOL), INTER, 8, MUC, h='LEFT', v='MIDDLE', bg=GIAY),
    dim('COLUMNS', 0, 1, 24), dim('COLUMNS', C_NAME, C_NAME + 1, 96), dim('COLUMNS', C_D0, C_D0 + len(DAYS), 44), dim('COLUMNS', NCOL - 1, NCOL, 24),
    dim('ROWS', 0, 1, 24), dim('ROWS', 1, 2, 40), dim('ROWS', 2, 3, 22), dim('ROWS', 3, R0 - 1, 16), dim('ROWS', R0 - 1, R0, 16),
    style(grid(1, C_NAME), INTER, 24, MUC, v='BOTTOM'),
    style(grid(2, C_NAME), MONO, 8, THAN),
    style(grid(3, C_NAME, R0 - 1, C_NAME + 1), INTER, 8, DA),
    put(1, C_NAME, [S(TITLE)]),
    put(2, C_NAME, [S('TICK = COACH NHẬN KHÁCH · BỎ TICK = COACH NGHỈ')]),
    {'updateCells': {'range': grid(3, C_NAME, R0 - 1, C_NAME + 1), 'rows': [{'values': [S(t)]} for t in NOTES], 'fields': 'userEnteredValue'}},
]
# khối mẫu (coach đầu tiên) dựng đủ định dạng + giá trị, rồi nhân ra các khối sau bằng copyPaste (giá trị, định dạng, ô tick, viền)
r, H, CN = R0, len(HOURS), C_D0 + DAYS.index('CN')
reqs += [
    # đầu khối: tên coach (Inter 12) · T2..CN (Mono 8 Than, giữa ô) · gạch chân Kẻ
    style(grid(r, C_NAME), INTER, 12, MUC, v='BOTTOM'),
    style(grid(r, C_D0, r + 1, C_D0 + len(DAYS)), MONO, 8, THAN, h='CENTER', v='BOTTOM'),
    {'updateBorders': {'range': grid(r, C_NAME, r + 1, C_D0 + len(DAYS)), 'bottom': B}},
    put(r, C_NAME, [S(COACHES[0])] + [S(d) for d in DAYS]),
    # giờ: chữ "06:00" (định dạng TEXT — gõ lại tay vẫn là chữ) · ô tick Mực, giữa ô
    style(grid(r + 1, C_NAME, r + 1 + H, C_NAME + 1), MONO, 8, DA, nf={'type': 'TEXT'}),
    style(grid(r + 1, C_D0, r + 1 + H, C_D0 + len(DAYS)), INTER, 10, MUC, h='CENTER'),
    {'setDataValidation': {'range': grid(r + 1, C_D0, r + 1 + H, C_D0 + len(DAYS)), 'rule': {'condition': {'type': 'BOOLEAN'}}}},
    {'updateBorders': {'range': grid(r + 1, C_NAME, r + 1 + H, C_D0 + len(DAYS)), 'bottom': B, 'innerHorizontal': B}},
    # nghỉ trưa (11:00 → 14:00): vạch Đá dưới hàng 11:00
    {'updateBorders': {'range': grid(r + 1 + HOURS.index('11:00'), C_NAME, r + 2 + HOURS.index('11:00'), C_D0 + len(DAYS)),
                       'bottom': {'style': 'SOLID_MEDIUM', 'color': DA}}},
    # CN: cột nền Giấy 2 để dễ thấy (mặc định không tick)
    {'repeatCell': {'range': grid(r, CN, r + 1 + H, CN + 1), 'cell': {'userEnteredFormat': {'backgroundColor': GIAY2}},
                    'fields': 'userEnteredFormat.backgroundColor'}},
    # giá trị: cột giờ · T2..T7 tick đủ · CN không tick
    {'updateCells': {'range': grid(r + 1, C_NAME, r + 1 + H, C_NAME + 1), 'rows': [{'values': [S(h)]} for h in HOURS], 'fields': 'userEnteredValue'}},
    {'repeatCell': {'range': grid(r + 1, C_D0, r + 1 + H, CN), 'cell': T(True), 'fields': 'userEnteredValue'}},
    {'repeatCell': {'range': grid(r + 1, CN, r + 1 + H, C_D0 + len(DAYS)), 'cell': T(False), 'fields': 'userEnteredValue'}},
]
for k, name in enumerate(COACHES):
    r = R0 + k * BLOCK
    reqs += [dim('ROWS', r, r + 1, 28), dim('ROWS', r + 1, r + 1 + H, 22), dim('ROWS', r + 1 + H, r + BLOCK, 16)]
    if k:
        reqs += [{'copyPaste': {'source': grid(R0, 0, R0 + BLOCK, NCOL), 'destination': grid(r, 0, r + BLOCK, NCOL), 'pasteType': 'PASTE_NORMAL'}},
                 put(r, C_NAME, [S(name)])]

txt = json.dumps(reqs, ensure_ascii=False, separators=(',', ':'))
with open(f'{OUT}/lich_coach.json', 'w', encoding='utf-8') as fh: fh.write(txt)
print('lich_coach', len(reqs), 'requests', len(txt), 'bytes')
