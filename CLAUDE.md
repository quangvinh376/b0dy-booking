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
3. **Deploy (chủ studio chốt 19/10): test PASS là tự deploy, KHÔNG hỏi lại** — Worker và trang (`main`), đúng thứ tự ghi trong thay
   đổi (mặc định Worker trước, trang sau), rồi kiểm sức khoẻ + SHA-256 + cập nhật "Đang ở đâu" và báo chủ studio. Máy cloud của Claude Code
   chưa có token Cloudflare → Worker vẫn qua Claude chat (đoạn `tools/worker_deploy_snippet.mjs`, chủ studio chuyển giúp); khi môi trường có
   biến `CLOUDFLARE_API_TOKEN` (quyền Workers Scripts: Edit) + `CLOUDFLARE_ACCOUNT_ID` thì `cd worker && npx wrangler deploy` trực tiếp.
   Không áp dụng cho: sửa hàng loạt Google Sheets (luật 5), đưa Apps Script dự phòng lên (luật 4). Cách deploy: mục "Máy chủ" dưới.
4. Apps Script dự phòng (`backend/LichTuan.gs`): đưa lên bằng Deploy ▸ Manage deployments ▸ New version; KHÔNG bấm Run.
   Đang chạy V36 (cũ hơn repo) — đưa V37 lên chỉ khi cần và được duyệt, chạy parity trước.
5. Sửa hàng loạt Google Sheets dùng chung (sổ, bảng lịch tập, BA) cần chủ studio đồng ý rõ. Không ghi dòng bịa vào `Sổ đặt lịch`
   trừ khi chủ studio yêu cầu (như mô phỏng 18/10).
6. Sau mỗi lần đẩy: xác minh commit bằng hash và SHA-256 từng tệp trên `raw.githubusercontent.com/quangvinh376/b0dy-booking/<commit>/…`.
7. Chỉ MỘT tiến trình Playwright / Chromium một lúc (máy test nhỏ từng hết RAM).

## Đang ở đâu (19/10/2026, 17:05)

- Trang **v1.2.0** (`441d7cc`) trên GitHub Pages `main` — live 17:03 19/10, 11 tệp SHA-256 khớp (CSP có `wss://` của Worker). Worker
  `b0dy-booking-api` chạy `worker/src` của `3f91f21` (7 module, có `live.js`) — deploy ~17:01 19/10 qua Claude chat
  (`tools/worker_deploy_snippet.mjs`; chủ studio đồng ý 19/10 và cho tự deploy từ nay — luật 3): `OK etag=c1dc6462b7`, 5 binding (DO `BOOK` ·
  `ALLOW_ORIGINS` · `BA_ID` · `OUT_ID` · secret `SA_JSON`), cron `* * * * *`, `lt_ping` `pending 0`. Claude Code kiểm 17:01–17:05
  bằng `curl`: `lt_ping` `pending 0`, `lastError` rỗng · tuần 43 trả 7 ngày · `/live` trả 101 + `{"t":"hi","r":0,"n":1}` · origin lạ 403.
- **1.2.0 (chủ studio 19/10)**: (1) từ chối lời mời → người mời thấy "<tên> đã từ chối tham gia" + nút "Mời bạn khác" (bảng Tập đôi +
  dòng Tập đôi trên phiếu, bấm mở thẳng phần chọn bạn) · (2) thẻ thông báo "tín hiệu đến": vạch Acid quét mép trên + chữ trồi + chấm Acid
  viền Mực phát một vòng sóng; toast có vạch Acid mép dưới; B0B quay nhìn thẻ mới (3 điểm loại B chờ chủ studio xem trên máy thật:
  vạch 740 ms, vòng sóng 640 ms, chấm từ 40 %) · (3) **kênh live mức 1**: WebSocket vào DO (`worker/src/live.js`), bảng tự cập nhật ~1 s
  sau mỗi lượt đặt / đổi / mời của người khác (sửa tay trên sheet ≤ 1 phút), ô đang chọn bị lấy → báo trước khi bấm, B0B nhìn quanh +
  "N người đang xem" (ẩn danh, theo mã máy). Trang chỉ nối từ booking.b0dy.studio. Chi phí Cloudflare (bảng giá 19/10): mở kết nối =
  1 request, tin gửi đi miễn phí, tin nhận 20:1 — vài chục khách nằm gọn trong 1 triệu request / 400.000 GB-s có sẵn của gói Paid.
- **1.1.0 (chủ studio chốt 19/10)**: ô X không chữ (= coach không nhận vì đã bận), ô xám giữ như cũ, chú thích luôn có mục xám khi bảng
  có ô xám. Giờ / ngày coach nhận khách = tab `Lịch coach` (713, file Lịch tập tuần): ô tick từng giờ × T2–CN, ô ngoài lịch xám
  "Coach nghỉ", ngày nghỉ trọn ngày = một khối cả cột; CN đặt được nếu coach tick. Tab tạo 19/10, **mặc định = luật cũ** (T2–T7 đủ,
  CN trống) → hội viên chưa thấy gì khác cho tới khi chủ studio sửa ô tick (hiệu lực sau 1–2 phút). `Bảng lịch tập` dựng lại 19/10:
  7 cột + hàng CN ở "Theo coach" + ô H2 "Xem tuần" (đọc ngược: 122 buổi · 46 hội viên · 0 khung đầy · 10 chưa đặt, giống trước khi dựng).
- **Sức chứa 5 suất / khung** (5 coach: 5 khách 1:1 hay 10 khách 1:2) — ô dữ liệu BA `' ⚙️ 2'!C27` (đổi 18/10), không phải mã;
  `LT.CAP` = 4 chỉ là dự phòng khi không đọc được ô đó. Thế giới giả `?qc` vẫn sức chứa 4 (`qc.js` · cfg + BUSY).
- **`Sổ đặt lịch` tuần 43 (19–24/10) là dữ liệu MÔ PHỎNG**: 120 dòng, Mã yêu cầu `mophong43-001…046`, ghi chú "Mô phỏng · …"
  (tên ngắn trên các dòng này còn kiểu cũ). Xoá trước khi dùng thật. Khôi phục bản trước: Lịch sử phiên bản (trước 17:19 18/10).
- Chủ studio đã quyết (18/10): giữ tối thiểu 2 buổi; buổi 1:2 lẻ giờ cao điểm: chưa làm, đo sau tuần 44. Tìm tên không đổi
  (gõ tên đệm hiện tắt vẫn ra). Khách 1:2 của Lâm → Ngọc: chủ studio tự đổi trong BA. Tuần 44 chạy thử nội bộ, ra mắt chính thức tháng 11.
- Apps Script dự phòng vẫn V36 (cũ hơn repo nhiều bản) — đưa V37 lên chỉ khi cần và được duyệt, chạy parity trước.

## Phối hợp Claude Code ↔ Claude chat

- Claude chat (project "Vinh") đọc repo này (GitHub gắn vào project) và tự gộp vào runbook / doc thiết kế trong project knowledge.
  Sau mỗi thay đổi: **cập nhật mục "Đang ở đâu" trên `main`** rồi báo chủ studio — không cần gửi file runbook.
- Claude chat có Claude in Chrome (tab dash.cloudflare.com, booking.b0dy.studio) → deploy Worker / kiểm trong tab do Claude chat chạy
  (từ 19/10 không cần hỏi lại chủ studio khi test đã PASS — luật 3). Máy cloud của Claude Code: không có trình duyệt hay token Cloudflare; gọi được
  `workers.dev` bằng `curl` (Node `fetch` không đi qua proxy).

## Phiên bản trang

Mỗi lần đổi tệp tĩnh: tăng `VER` trong `app.js` **và** `sw.js`, cùng `?v=` trong `index.html` (app.css, b0b.js, tk3d.js, app.js).
`qc.js` / `qc.css` tự theo `VER`. Bảng các bản đã phát hành: runbook.

## Test (phải PASS trước khi đẩy)

```bash
npm i playwright && npx playwright install chromium   # máy mới; hoặc PW_CHROMIUM=<đường dẫn chrome>
node test/gas_lt.js                      # luật + Apps Script (218)
cd worker && node test/run_all.mjs       # parity · concurrency · robust · http · realdata
node test/ui_states.js && node test/ui_qc.js && node test/ui_duo.js && node test/ui_live.js && node test/ui_notice.js && node test/ui_smoke.js && node test/ui_sw.js
node test/ui_tk3d.js all && node test/ui_png.js all && node test/b0b_check.js && for f in test/rv_*.js; do node $f; done
```

- `realdata` cần `.local/fixture_ba.json` (hoặc `BA_FIXTURE=…`): `python3 tools/ba_fixture.py <BA.xlsx>` (BA tải về dạng
  Excel). Không có thì tự bỏ qua. Ra 0 hội viên xác minh được → cột SĐT trong bản xuất bị đổi định dạng.
- `MINIFLARE=… node worker/test/workerd.mjs`: Worker thật trong workerd (kể cả kênh live WebSocket). Máy cloud cài được Miniflare vào
  scratchpad: `npm i miniflare@4` + `overrides: {workerd: "1.20260916.1"}` (bản kèm theo chưa nhận compat date 2026-09-15). Với bản này,
  3 ca "DO bị tắt khi nhật ký còn mục" trượt cả trên `main` cũ (storage DO không giữ qua hai lần tạo Miniflare) — lỗi của test, chưa sửa.
- Phiếu 3D mặc định tắt trên WebGL bằng CPU → test dùng `?tk3d=1`. `b0b_check` đo khung hình, máy bận có thể trượt — chạy lại.
  Tối 18/10 ca "Idle ~30 fps (≤ 36)" trượt liên tục (35–42 fps) cả trên bản không đổi `b0b.js` → nhiễu máy test, không phải lỗi;
  bộ này chỉ nạp `test/b0b_demo.html` + `b0b.js`, sửa tệp khác không ảnh hưởng.

## Máy chủ

- Worker gọi Google bằng service account (secret `SA_JSON`). Kiểm sức khoẻ (chỉ đọc, chạy trong tab booking.b0dy.studio — CORS):
  `fetch('https://b0dy-booking-api.little-bonus-1d87.workers.dev/', {method:'POST', headers:{'Content-Type':'text/plain'},
  body:JSON.stringify({action:'lt_ping'})}).then(r=>r.json())` → `pending` 0, `lastError` rỗng.
- Deploy (luật 3): đẩy code → `node tools/worker_deploy_snippet.mjs <commit>` → dán đoạn in ra vào Console tab
  dash.cloudflare.com của Worker (script tự so SHA từng module, giữ 3 plain_text + DO binding + secret, không gửi migrations)
  → kết quả `OK etag=…`, 5 binding, cron `* * * * *` → `lt_ping`. Có wrangler đã đăng nhập thì `cd worker && npx wrangler deploy`
  cũng được (secret giữ nguyên; `vars` + DO + cron lấy từ `wrangler.jsonc`), rồi `lt_ping` sau đó.
- Kênh live (1.2.0, `worker/src/live.js`): WebSocket `/live` vào DO, chỉ báo "có thay đổi" + số người đang xem — xem `worker/README.md`.
  Deploy có thêm module `live.js` (`tools/worker_deploy_snippet.mjs` đã có). Thứ tự: **Worker trước, trang sau** (trang 1.2.0 gặp Worker
  cũ thì thử nối 4 lần rồi thôi — chạy được nhưng ghi lỗi vào console của khách; Worker 1.2.0 với trang cũ không sao).
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
