# CLAUDE.md — làm việc trên repo b0dy-booking

Trang đặt lịch tập theo tuần cho hội viên B0DY Studio (https://booking.b0dy.studio). Chủ studio: Quang Vinh (GitHub `quangvinh376`).
**Luôn trao đổi bằng tiếng Việt.** Chuẩn của chủ studio: code sạch, logic chuẩn, QC kỹ, không được sai — kiểm bằng test / đọc ngược,
không đoán. README.md tả thành phần; `worker/README.md` tả máy chủ.

## Tài liệu sống (ngoài repo)

Runbook đầy đủ nằm trong project claude.ai "Vinh" (riêng tư, không có trong repo): `claude/b0dy-booking-trien-khai.md`
(ở đâu · deploy · kiểm sức khoẻ · bẫy · việc tồn), `claude/b0dy-booking-ghep-cap-1-2.md` (ghép lớp 1:2),
`claude/b0dy-booking-hoi-vien-tuan.md` (thiết kế + luật). Có công cụ Projects thì đọc runbook trước khi làm; không có thì hỏi chủ studio.
ID hai file Google Sheets: `BA_ID` (file BA: MEMBERS · SESSION LOG · TRIAL · B0B · ⚙️ 2) và `OUT_ID` ("Lịch tập tuần": `Sổ đặt lịch` sheetId 711 · `Bảng lịch tập` 0 · `_dữ liệu` 712 · `Lịch coach` 713) trong `worker/wrangler.jsonc`.

## Luật không được phá (repo này CÔNG KHAI)

1. Không đưa vào repo / commit / test: PIN, khoá, token, SA_JSON, số điện thoại, họ tên hội viên thật, số doanh thu, IP thật.
   Dữ liệu thật (BA xuất ra, kết quả mô phỏng) chỉ ở `.local/` (đã .gitignore). Test dùng dữ liệu bịa — tên bịa phải so với BA
   (bản ở `.local/`) trước khi đẩy, không được trùng hội viên thật. Không in tên / SĐT thật ra màn hình: script chỉ in số đếm.
2. Không tự nhập mật khẩu, mã xác minh, secret ở đâu cả; không gõ mã hội viên thử của QC trên tên miền thật (chỉ test local).
   SA_JSON chủ studio tự dán.
3. **Deploy Worker production = cần câu đồng ý của chủ studio cho từng lần.** Cách deploy: mục "Máy chủ" dưới.
4. Apps Script dự phòng (`backend/LichTuan.gs`): đưa lên bằng Deploy ▸ Manage deployments ▸ New version; KHÔNG bấm Run.
   Đang chạy V36 (cũ hơn repo) — đưa V37 lên chỉ khi cần và được duyệt, chạy parity trước.
5. Sửa hàng loạt Google Sheets dùng chung (sổ, bảng lịch tập, BA) cần chủ studio đồng ý rõ. Không ghi dòng bịa vào `Sổ đặt lịch`
   trừ khi chủ studio yêu cầu (như mô phỏng 18/10).
6. Sau mỗi lần đẩy: xác minh commit bằng hash và SHA-256 từng tệp trên `raw.githubusercontent.com/quangvinh376/b0dy-booking/<commit>/…`.
7. Chỉ MỘT tiến trình Playwright / Chromium một lúc (máy test nhỏ từng hết RAM).

## Đang ở đâu (18/10/2026, 23:45)

- Trang **v1.0.14** (`9211a1f`, chú thích "Ghép nhóm", bỏ mục Nghỉ trưa) trên GitHub Pages `main` (live, SHA-256 khớp). Worker `b0dy-booking-api` chạy `worker/src` của
  `1f83687` — deploy **23:42 18/10**, etag `05ace7dde3`: Claude chat (project "Vinh") chạy `tools/worker_deploy_snippet.mjs` qua Claude
  in Chrome sau câu đồng ý của chủ studio; `lt_ping` `pending 0`, `lastError` rỗng; Claude Code kiểm lại 23:45 bằng `curl`: `lt_find`
  trả tên ≥ 4 chữ dạng mới 11/11. Có hiệu lực: luật suất coach + ghép lớp 1:2 (1.0.8–1.0.11) · khách tập thử có "Coach tiếp nhận"
  chiếm suất của coach đó (1.0.12) · tên = 2 chữ cuối, chữ trước viết tắt + ô Đầy / coach bận gạch X + ô Ghép mobile icon + tên (1.0.13).
- **Sức chứa 5 suất / khung** (5 coach: 5 khách 1:1 hay 10 khách 1:2) — ô dữ liệu BA `' ⚙️ 2'!C27` (đổi 18/10), không phải mã;
  `LT.CAP` = 4 chỉ là dự phòng khi không đọc được ô đó. Thế giới giả `?qc` vẫn sức chứa 4 (`qc.js` · cfg + BUSY).
- **`Sổ đặt lịch` tuần 43 (19–24/10) là dữ liệu MÔ PHỎNG**: 120 dòng, Mã yêu cầu `mophong43-001…046`, ghi chú "Mô phỏng · …"
  (tên ngắn trên các dòng này còn kiểu cũ). Xoá trước khi dùng thật. Khôi phục bản trước: Lịch sử phiên bản (trước 17:19 18/10).
- Chủ studio đã quyết (18/10): giữ tối thiểu 2 buổi; buổi 1:2 lẻ giờ cao điểm: chưa làm, đo sau tuần 44. Tìm tên không đổi
  (gõ tên đệm hiện tắt vẫn ra). Khách 1:2 của Lâm → Ngọc: chủ studio tự đổi trong BA. Tuần 44 chạy thử nội bộ, ra mắt chính thức tháng 11.
- Apps Script dự phòng vẫn V36 (cũ hơn repo nhiều bản) — đưa V37 lên chỉ khi cần và được duyệt, chạy parity trước.
- **19/10 — 1.1.0 (lịch coach + Chủ Nhật) trên nhánh `claude/focused-fermi-5jwgv4`, CHƯA live** (chờ chủ studio duyệt đưa lên `main` +
  deploy Worker). Chủ studio chốt 19/10: ô X không chữ (= coach không nhận vì đã bận), ô xám giữ như cũ, chú thích luôn có mục xám khi
  bảng có ô xám; lịch nhận khách của coach = lưới ô tick từng giờ × 7 ngày ở tab mới `Lịch coach` (file Lịch tập tuần), ô ngoài lịch xám
  "Coach nghỉ"; CN đặt được nếu coach tick; Bảng lịch tập = tuần này + ô chọn tuần. Đã làm trên sheet thật (được đồng ý 19/10): tạo tab
  `Lịch coach` (713, mặc định = luật cũ → chưa đổi gì cho hội viên) · dựng lại `Bảng lịch tập` 7 cột + hàng CN ở "Theo coach" + ô H2
  "Xem tuần" (đọc ngược: 122 buổi · 46 hội viên · 0 khung đầy · 10 chưa đặt, giống hệt trước khi dựng). Thứ tự đưa lên: trang trước
  (trang 1.1.0 chạy được với Worker cũ), Worker sau (trang cũ gặp Worker mới vẽ thừa cột CN).

## Phối hợp Claude Code ↔ Claude chat

- Claude chat (project "Vinh") đọc repo này (GitHub gắn vào project) và tự gộp vào runbook / doc thiết kế trong project knowledge.
  Sau mỗi thay đổi: **cập nhật mục "Đang ở đâu" trên `main`** rồi báo chủ studio — không cần gửi file runbook.
- Claude chat có Claude in Chrome (tab dash.cloudflare.com, booking.b0dy.studio) → deploy Worker / kiểm trong tab do Claude chat chạy,
  vẫn cần câu đồng ý của chủ studio cho từng lần. Máy cloud của Claude Code: không có trình duyệt hay token Cloudflare; gọi được
  `workers.dev` bằng `curl` (Node `fetch` không đi qua proxy).

## Phiên bản trang

Mỗi lần đổi tệp tĩnh: tăng `VER` trong `app.js` **và** `sw.js`, cùng `?v=` trong `index.html` (app.css, b0b.js, tk3d.js, app.js).
`qc.js` / `qc.css` tự theo `VER`. Bảng các bản đã phát hành: runbook.

## Test (phải PASS trước khi đẩy)

```bash
npm i playwright && npx playwright install chromium   # máy mới; hoặc PW_CHROMIUM=<đường dẫn chrome>
node test/gas_lt.js                      # luật + Apps Script (218)
cd worker && node test/run_all.mjs       # parity · concurrency · robust · http · realdata
node test/ui_states.js && node test/ui_qc.js && node test/ui_duo.js && node test/ui_smoke.js && node test/ui_sw.js
node test/ui_tk3d.js all && node test/ui_png.js all && node test/b0b_check.js && for f in test/rv_*.js; do node $f; done
```

- `realdata` cần `.local/fixture_ba.json` (hoặc `BA_FIXTURE=…`): `python3 tools/ba_fixture.py <BA.xlsx>` (BA tải về dạng
  Excel). Không có thì tự bỏ qua. Ra 0 hội viên xác minh được → cột SĐT trong bản xuất bị đổi định dạng.
- `MINIFLARE=… node worker/test/workerd.mjs`: Worker thật trong workerd.
- Phiếu 3D mặc định tắt trên WebGL bằng CPU → test dùng `?tk3d=1`. `b0b_check` đo khung hình, máy bận có thể trượt — chạy lại.
  Tối 18/10 ca "Idle ~30 fps (≤ 36)" trượt liên tục (35–42 fps) cả trên bản không đổi `b0b.js` → nhiễu máy test, không phải lỗi;
  bộ này chỉ nạp `test/b0b_demo.html` + `b0b.js`, sửa tệp khác không ảnh hưởng.

## Máy chủ

- Worker gọi Google bằng service account (secret `SA_JSON`). Kiểm sức khoẻ (chỉ đọc, chạy trong tab booking.b0dy.studio — CORS):
  `fetch('https://b0dy-booking-api.little-bonus-1d87.workers.dev/', {method:'POST', headers:{'Content-Type':'text/plain'},
  body:JSON.stringify({action:'lt_ping'})}).then(r=>r.json())` → `pending` 0, `lastError` rỗng.
- Deploy (khi được đồng ý): đẩy code → `node tools/worker_deploy_snippet.mjs <commit>` → dán đoạn in ra vào Console tab
  dash.cloudflare.com của Worker (script tự so SHA từng module, giữ 3 plain_text + DO binding + secret, không gửi migrations)
  → kết quả `OK etag=…`, 5 binding, cron `* * * * *` → `lt_ping`. Có wrangler đã đăng nhập thì `cd worker && npx wrangler deploy`
  cũng được (secret giữ nguyên; `vars` + DO + cron lấy từ `wrangler.jsonc`), vẫn phải được đồng ý và `lt_ping` sau đó.
- Chỉ chạy MỘT máy chủ một lúc (Worker hoặc Apps Script) — mã nhớ máy ký khác khoá, nhật ký ghi sau nằm trong DO.

## Google Sheets

- `Sổ đặt lịch`: tiêu đề hàng 4, dữ liệu B5:R (17 cột như `LT.LOG_HEAD`), mỗi buổi một dòng. Ghi giá trị dạng chữ
  (stringValue / pasteData vào ô định dạng TEXT) — đừng dùng USER_ENTERED: '1:2' thành giờ, '2026-10-19' thành ngày.
  Kiểm bằng `userEnteredValue`, không bằng giá trị hiển thị.
- `Bảng lịch tập`: toàn công thức, 7 cột T2–CN (J2 · L2 · N2 · P2 = buổi · hội viên · khung đầy · chưa đặt). Không gõ tay vào khối lưới.
  Ô H2 "Xem tuần" (người dùng chọn ngày, kiểm định ngày — file locale en_US nên gõ "26/10" bị từ chối, bấm đúp chọn trên lịch) → S2 = thứ Hai
  của tuần đó; trống = tuần này (CN vẫn là tuần này). Dựng lại: `python3 tools/bang_lich_tap.py 0 <ra> <số CF> <số hàng> <số cột>`
  (đếm bằng `spreadsheets.get`), áp s1 → s2 → s3. Kiểm sau khi dựng: đọc J2:P3 · S2:S4 · đầu cột — **đừng** đọc lưới bằng `includeGridData`
  (mask `effectiveValue.errorValue` vẫn trả cả `effectiveValue` → lộ tên hội viên).
- `Lịch coach` (713): ô tick từng giờ × 7 ngày cho từng coach, chủ studio sửa tay; máy chủ đọc `A1:AD400` (luật đọc: `worker/README.md`).
  Tạo 19/10 bằng `tools/lich_coach.py`, mặc định = luật cũ (T2–T7 đủ, CN trống). Bỏ tick chỉ chặn đặt / đổi mới, buổi đã đặt giữ nguyên.
- `_dữ liệu`: Worker ghi ảnh chụp hội viên còn gói (A tên · B tên ngắn · C coach · D còn lại · E hết hạn · F Mã KH · G hiển thị).
- Kết quả đọc sheet lớn chứa tên → xử lý bằng script, chỉ in số / so khớp.

## Công cụ (`tools/`)

| Tệp | Việc |
|---|---|
| `bang_lich_tap.py` | Dựng tab `Bảng lịch tập` (tham số: sheetId, thư mục ra, số quy tắc CF, số hàng, số cột đang có) |
| `lich_coach.py` | Tạo tab `Lịch coach` (chỉ lần đầu; tab đã có thì sửa tay) |
| `ba_fixture.py` | BA.xlsx → `.local/fixture_ba.json` (cho realdata + mô phỏng) |
| `sim_week.mjs` | Mô phỏng cả phòng đặt tuần tới từ lịch tập thật tuần trước, đúng luật máy chủ → `.local/sim/` (chỉ in số) |
| `sim_week_payload.mjs` | Từ kết quả mô phỏng → 2 lượt `batchUpdate` ghi sổ (tên điền bằng công thức tra `_dữ liệu` rồi dán giá trị) — **xoá sổ**, chỉ chạy khi được yêu cầu |
| `sim_week_verify.py` | So sổ đọc ngược với dòng dự kiến (không in tên) |
| `worker_deploy_snippet.mjs` | In đoạn deploy Worker cho Console dashboard, SHA tính từ git |
