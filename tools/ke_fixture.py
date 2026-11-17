#!/usr/bin/env python3
"""Dữ liệu thật cho "Để B0DY kể về bạn" → fixture JSON cho tools/ke_real.mjs (chạy máy kể trên cả phòng, chỉ in số đếm).

  python3 tools/ke_fixture.py <Customer database.xlsx> <Lịch tập tuần.xlsx> [.local/fixture_ke.json]

Hai file tải từ Google Sheets (Tệp ▸ Tải xuống ▸ Microsoft Excel):
  · Customer database (logbook app coach): mọi tab "Khách của <coach>" + "Tổng hợp bài" (ngày đã lưu trữ)
  · Lịch tập tuần: tab "Sổ đặt lịch" (giờ của buổi đã đặt — SESSION LOG thường không ghi khung giờ)
Cùng với .local/fixture_ba.json (tools/ba_fixture.py: MEMBERS, SESSION LOG…).

Fixture chứa DỮ LIỆU THẬT → chỉ để trong .local/ (đã .gitignore), không in, không đẩy lên repo.
Mỗi tab = {"head": [tên cột], "rows": [[ô…]]}; ô ngày → "yyyy-mm-dd", giờ → "HH:MM". Cần: pip install openpyxl
"""
import datetime, json, os, sys
import openpyxl


def cell(v):
    if isinstance(v, datetime.datetime):
        if v.year < 1901: return v.strftime('%H:%M')
        return v.strftime('%Y-%m-%d') if not (v.hour or v.minute or v.second) else v.strftime('%Y-%m-%d %H:%M')
    if isinstance(v, datetime.date): return v.isoformat()
    if isinstance(v, datetime.time): return v.strftime('%H:%M')
    return '' if v is None else v


def tab(ws, head_row=0):
    rows = [[cell(v) for v in r] for r in ws.iter_rows(values_only=True)]
    if len(rows) <= head_row: return {'head': [], 'rows': []}
    head = [str(h or '').strip() for h in rows[head_row]]
    body = [r for r in rows[head_row + 1:] if any(x != '' for x in r)]
    return {'head': head, 'rows': body}


def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    cdb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
    out = openpyxl.load_workbook(sys.argv[2], data_only=True, read_only=True)
    dst = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', '.local', 'fixture_ke.json')
    fx = {'logbook': {}, 'summary': None, 'ledger': None}
    for n in cdb.sheetnames:
        if n.startswith('Khách của '): fx['logbook'][n] = tab(cdb[n])
        elif n == 'Tổng hợp bài': fx['summary'] = tab(cdb[n])
    fx['ledger'] = tab(out['Sổ đặt lịch'], 3)          # tiêu đề hàng 4 (B4:R)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f: json.dump(fx, f, ensure_ascii=False)
    n = sum(len(t['rows']) for t in fx['logbook'].values())
    print('ghi', dst, '· logbook:', len(fx['logbook']), 'tab,', n, 'dòng · tổng hợp bài:', len(fx['summary']['rows']) if fx['summary'] else 0,
          'dòng · sổ đặt lịch:', len(fx['ledger']['rows']), 'dòng')


if __name__ == '__main__':
    main()
