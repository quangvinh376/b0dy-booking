# So ô thật trên 'Sổ đặt lịch' với dòng dự kiến của tools/sim_week_payload.mjs — KHÔNG in tên.
# Đầu vào: kết quả spreadsheets.get (ranges 'Sổ đặt lịch'!B5:R<n>, fields sheets.data.rowData.values.effectiveValue
# [+ userEnteredValue]) đã lưu ra tệp JSON. Công cụ MCP trả kết quả lớn thành tệp — dùng thẳng tệp đó.
#   python3 tools/sim_week_verify.py <kết quả.json> [.local/sim/expected_final.json]
import json, os, sys
p = sys.argv[1]
EXP = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '.local', 'sim', 'expected_final.json')
d = json.loads(open(p, encoding='utf-8').read())
rows = d['sheets'][0]['data'][0].get('rowData', [])
exp = json.load(open(EXP, encoding='utf-8'))
NAME = {6, 7, 16}
INIT = {'Quyết Hán': 'QH', 'Hiền Mai': 'HM', 'Bích Ngọc': 'BN', 'Khải Phan': 'KP', 'Lâm Nguyễn': 'LN'}
def val(c):
    ev = c.get('effectiveValue') or {}
    uv = c.get('userEnteredValue') or {}
    if 'errorValue' in ev: return ('ERR', None)
    if 'formulaValue' in uv: return ('FORMULA', ev.get('stringValue'))
    if 'numberValue' in ev: return ('num', ev['numberValue'])
    if 'stringValue' in ev: return ('str', ev['stringValue'])
    return ('empty', None)
bad = 0; formulas = 0; kinds = {}
if len(rows) != len(exp): print('SO DONG', len(rows), len(exp)); bad += 1
for i, e in enumerate(exp):
    vals = (rows[i].get('values', []) if i < len(rows) else []) + [{}] * 17
    for c in range(17):
        t, v = val(vals[c])
        kinds[(c, t)] = kinds.get((c, t), 0) + 1
        if t == 'FORMULA': formulas += 1; t = 'str'
        if c in NAME:
            if t != 'str' or not v or not v.strip(): print('TEN', i + 5, c, t); bad += 1
            continue
        want = e[c]
        if c == 1:
            if t != 'num' or v != want: print('BAN', i + 5, t, v); bad += 1
        elif t != 'str' or v != want: print('LECH', i + 5, 'cot', c, t, repr(v), '≠', repr(want)); bad += 1
    # đối chiếu tên ngắn ↔ hiển thị ↔ coach (không in)
    t7, short = val(vals[7]); t16, disp = val(vals[16])
    if short and disp and disp != short + ' · ' + INIT.get(e[8], '?'): print('HIEN_THI', i + 5); bad += 1
print('rows', len(rows), 'expected', len(exp), 'formula cells', formulas, 'mismatch', bad)
print(sorted((k, n) for k, n in kinds.items() if k[1] not in ('str',)))
