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

## Đang ở đâu (22/10/2026, 19:15)

- Trang **v1.6.0** (`8db2ac5`) trên GitHub Pages `main` — "pages build and deployment" success 19:06:56 22/10; 22 tệp tĩnh SHA-256 khớp
  trên raw.githubusercontent tại commit; trang thật (Claude chat, tab booking.b0dy.studio → `/img/favicon.svg` rồi fetch no-store) trả
  index · app.js · app.css · sw.js · qc.js · b0b.js · tk3d.js đúng SHA-256 của commit, `__lt.ver` 1.6.0, 3 thẻ script `?v=1.6.0`.
  **Worker `b0dy-booking-api` chạy `worker/src` của `8db2ac5`** — deploy 19:05:30 22/10 qua Claude chat (`tools/worker_deploy_snippet.mjs`,
  chủ studio đăng nhập lại Cloudflare): `OK etag=877e49cc64`, 5 binding (DO `BOOK` · `ALLOW_ORIGINS` · `BA_ID` · `OUT_ID` · secret `SA_JSON`),
  cron `* * * * *`; `lt_ping` `pending 0`, `lastError` rỗng · `lt_boot` tuần 43 7 ngày · `lt_find` 'zqxj' → `results: []`.
  Máy cloud của Claude Code 22/10 KHÔNG curl được `workers.dev` nữa (proxy 403) → kiểm sức khoẻ trong tab booking.b0dy.studio.
- **1.6.0 (chủ studio chốt 22/10, khớp hợp đồng dịch vụ mẫu mới)** — luật báo trước: `LT.LEAD` 24 → **12 giờ** (đặt muộn, thêm buổi,
  khung mới khi đổi lịch, lời mời); **`LT.CHG_LEAD` 24 giờ** cho buổi đang có muốn đổi (kể cả dời vào cặp "Ghép"). Ngày mở lịch (CN từ
  06:00, phase `open`) giữ ngoại lệ cho lượt đặt / thêm; khung mới khi đổi vẫn 12 giờ. Mã lỗi hạn đặt `duoi_12h` (`buoi_duoi_24h` giữ
  nguyên; trang vẫn hiểu `duoi_24h` của Apps Script V36). Hệ quả đã xử lý: (1) `anyOpen` / `publicOf` xét `Lịch coach` của các coach có
  hội viên còn gói — tối T7 khung CN tuần đang chạy còn ≥ 12 giờ mà mặc định coach nghỉ CN → vẫn đếm tới 06:00 CN; trang:
  `anyOpen(week, ms, off)` dùng `coachAt` 'off' ở màn chưa mở; (2) CN 00:00–05:59 (phase `before`) đóng đặt / đổi / mời (`why` →
  `dong_dat`) như thời 24 giờ. Chữ: ô "Dưới 12 giờ", thông báo "Đặt muộn: khung cách bây giờ ít nhất 12 giờ", Gói & luật (luật 04 đổi
  lịch 24 / 12 giờ, luật 08 đặt / thêm trước 12 giờ), câu lỗi đổi lịch. QC `?qc`: "Giữa tuần" (T4 08:30) theo 12 giờ; "Cuối tuần"
  (T7 21:00) còn khung CN của Quyết / Mai, hội viên coach khác thấy đếm ngược. Test: `gas_lt` 267 · parity 320 (836 lượt giống hệt) ·
  `coach_cases` mục 19 · `ui_states` 107 (E12 mới: màn đổi lịch) · `ui_qc` 84 · đủ bộ PASS 22/10 (`rv_tilt` / `b0b_check` trượt nhiễu,
  chạy lại PASS) · workerd 20 PASS + 3 ca lỗi test đã biết. Rà soát độc lập 1 vòng: tìm ra lỗi phase `before`, đã sửa + có test.
  Còn biết: khách chưa đăng nhập mở trang tối T7 khi có coach nhận CN thấy màn đếm ngược lóe ~0,1 s rồi sang tìm tên (tuần dựng trên máy
  trước khi máy chủ trả lời chỉ có T2–T7).
- **1.5.2 (chủ studio 21/10 16:54 + 17:05)** — "N người đang xem" (kênh live) bỏ khỏi chân B0B (mobile: đè thẻ thông báo; desktop: sát
  đáy màn; và biến B0B thành ô chữ của giao diện). Số người đang xem = trạng thái của CẢ PHÒNG → nằm trong tín hiệu header sau
  "Đang mở đặt · Tuần N": **icon mắt (lưới 24, nét 1,5, 14 px) + số** Mono (`#sigN`, `sigCount` trong `app.js`); câu đủ "N người đang
  xem" cho trình đọc màn hình (`#sigNs`) + chú thích rê chuột; số trượt khi đổi, n < 2 → mờ đi rồi gỡ. **B0B = linh vật đứng ngoài
  giao diện, người dẫn đường**: có thêm người → nhìn quanh (`scan`) rồi nhìn đúng con số trên header (`viewers` mang `el`), không còn số
  trên đầu, không còn chữ dưới chân. Test `ui_live` 28. `rv_tilt` (vé 3D WebGL trên CPU, không có hào quang) thỉnh thoảng trượt mốc
  thời gian lắc gợi ý / về dáng nghỉ — chạy lại PASS (nhiễu máy test như `b0b_check`).
- **1.5.1 (chủ studio 21/10 16:31)**: nguồn sáng (thẻ + tia sàn) 1,5 → **1 px** (`--bm-bw` 1px, bỏ bậc 2 px ở màn 1×; bóng phát sáng tính
  theo nét 1 px) · dải bóng mỗi phía nét 12 → **10 px** (`HQ.G`; `.flb` top −11 / cao 21) · **hồ sáng desktop dời lên trên cụm nút
  "Tập cùng · Không, cảm ơn"** (`.nt-act`; không có nút thì giữa thông báo) — tia sàn + viền nền vẫn xuất phát từ giữa thông báo.
- **1.5.0 (chủ studio 21/10: thiết kế "Hào quang Acid" trên Figma section 00e, "code lên bản live, tự deploy, cover mọi scenario, audit kỹ")**
  — thay phần HÌNH của tia viền 1.4.0, giữ chuẩn compositor + vòng đời (`beamMount` trong `app.js` mục "HÀO QUANG ACID", CSS mục "hào quang
  Acid"). Chu kỳ 8 s × **3 rồi đứng tĩnh** (viền nền + hào quang 45 % = giảm chuyển động): bật 0–1,5 s (viền nền 1 px Lá 40 % kẻ từ giữa mép
  trên tách hai ngả theo cubic-bezier(.65, 0, .35, 1) · hào quang bừng, nhoè 40 → 22 · hai nguồn sáng hiện 0,7–1,3 s) · duy trì (Acid +
  Bạc hà lệch nửa vòng, 1 vòng / 8 s, đều qua góc · hào quang thở 2 s, phổ xoay đúng 180° / chu kỳ, 2 s cuối chuỗi giảm tốc dừng ở 157,5°)
  · tắt 7–8 s (xoá cùng chiều kẻ). Chỉ chạy khi thật sự được thấy: IntersectionObserver · tab mở · không cửa sổ / ngăn kéo che.
  · Thẻ (`data-beam="card"`): `.bm` (mặt thẻ, clip-path một lần) = 6 đoạn viền nền + nắp 1 px · lõi 4 vùng cạnh × 2 cửa sổ (8 nấc màu Figma
  hợp "over", nội suy liền) · mặt thẻ · rê chuột │ `.bmx` bóng phát sáng 3·10·26 px = mặt nạ tổng 3 Gauss (σ = bán kính Figma / 2) quanh nét,
  góc bo bằng mặt nạ tròn, trên mặt thẻ dưới chữ │ `.bma` hào quang: `.bm-as` một lớp mang 2 mặt nạ Gauss σ 11 giao nhau + opacity +
  co giãn, phổ conic `.bm-ac` xoay bên trong. 27 Web Animations,
  một đồng hồ (cùng startTime, mốc nằm trong keyframe).
  · Sàn desktop (`.flb data-beam="strip"`, hộp trùm đường kẻ ±10 px từ 1.5.1): viền nền Lá 45 % kẻ từ giữa thông báo ra · tia Acid trái / Bạc hà
  phải 380 px/s, đuôi 150, lượt 0,9 s + 4,5 s (sàn rất rộng → phía đó tắt dần 7,1–7,85 s) · hồ sáng `.flp` (2 radial-gradient khớp bình
  phương tối thiểu với quầng 640 × 128 + lõi, nhoè 36 — sai số trung bình 0,2 %) nằm trong `#app` TRƯỚC `<main>` → dưới nội dung trang,
  tâm ở mép trên sàn (1.5.0 giữa thông báo → 1.5.1 trên cụm nút), neo đáy. 14 Web Animations.
  · Vòng đời giữ của 1.4.0: vẽ lại đúng chỗ → chạy tiếp từ đúng mốc (`.bm-now`), chữ mờ vào (`.swap`); mới thêm: đã đứng tĩnh mà chữ đổi
  (thông báo mới) → bật lại từ đầu; đổi cỡ → setKeyframes, đồng hồ giữ nguyên; huỷ sạch khi gỡ (cả hồ sáng nằm ngoài sàn).
  · Không filter / mix-blend-mode / @property / stroke-dashoffset (Figma ghi dashoffset + drop-shadow: vẽ lại mỗi khung). Bỏ
  `licenses/border-beam.txt` (không còn dùng màu / mã của gói). Loại B chờ chủ studio xem trên iPhone thật (máy cloud không tải được WebKit):
  độ đậm hào quang trên mobile, bóng phát sáng, tốc độ tia sàn.
  · Rà soát độc lập (agent riêng, 2 vòng) → đã sửa: WebKit cũ bỏ qua `iterationStart` trên compositor (hai nguồn sáng sẽ chồng nhau trên
  iPhone) → pha nằm sẵn trong keyframe, MỌI animation cùng timing {24 s, 1 lượt}; dải sàn so "thông báo đổi chưa" theo chữ thông báo trên
  sàn; hồ sáng chỉ vẽ nửa trên (clip-path) + tắt dần 160 ms khi dải bị gỡ; hào quang gộp 2 mặt nạ + opacity vào một lớp.
  · Đo (Chromium headless, swiftshader = vẽ bằng CPU): 0 Paint; khi hào quang chạy ~36 khung/s ở mobile 3× (1.4.0 ~54) vì cả vùng hào quang
  ghép lại mỗi khung — trên GPU thật không đáng kể, và hết 24 s thì 0 chi phí (1.4.0 chạy vô hạn). Test `ui_notice` 110 · `ui_duo` 48
  (đủ bộ test PASS 21/10 16:05).
- **1.4.0 (20/10)** — tia viền chỉ compositor (thay CSS sinh từ gói 1.3.x: `@property` vẽ lại mỗi khung, ~22 khung/s) · mặt thẻ thống nhất
  (`.mnt` = `.prl`, `pcIn`): nền Giấy 2, KHÔNG viền Mực ở mọi trạng thái (cảnh báo nhận ra bằng icon Mực), bo 4, icon ghép, chữ 16 ở x = 46;
  mobile thẻ có giờ (.w): tiêu đề dòng 1, giờ + nhãn dòng 2 (mono); rê chuột: lớp phủ `.bm-hv`, bấm lún .985. `.sig-in` / B0B nhìn thẻ giữ
  như 1.2.1 (chỉ #floor .nt · #mNote .mnt).
- **1.2.0 (chủ studio 19/10)**: (1) từ chối lời mời → người mời thấy "<tên> đã từ chối tham gia" + nút "Mời bạn khác" (bảng Tập đôi +
  dòng Tập đôi trên phiếu, bấm mở thẳng phần chọn bạn) · (2) thẻ thông báo "tín hiệu đến" (thay bằng tia viền ở 1.3.x → 1.4.0);
  B0B quay nhìn thẻ mới · (3) **kênh live mức 1**: WebSocket vào DO (`worker/src/live.js`), bảng tự cập nhật ~1 s
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
- Apps Script dự phòng vẫn V36 (cũ hơn repo nhiều bản, **còn luật 24 giờ**) — nếu phải lui về dự phòng, đưa bản repo (V37, đã luật 12 / 24 giờ,
  parity PASS) lên trước; chỉ khi cần và được duyệt (luật 4).

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
node test/gas_lt.js                      # luật + Apps Script (267)
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
