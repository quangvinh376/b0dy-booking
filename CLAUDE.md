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
   Đang chạy **V44 = `backend/LichTuan.gs` của `1ce87d6`** (05/11; 31/10 chủ studio "mọi quyền deploy đều được cho phép"). Số version là của
   cả project: V39 (28/10) là của deployment tập thử, không phải trang đặt lịch. Đổi luật ở repo thì đưa
   bản mới lên cùng lúc với Worker (chạy parity trước). Ô "Description" của New version để trống → deployment mất tên ("Untitled"):
   luôn gõ mô tả.
5. Sửa hàng loạt Google Sheets dùng chung (sổ, bảng lịch tập, BA) cần chủ studio đồng ý rõ. Không ghi dòng bịa vào `Sổ đặt lịch`
   trừ khi chủ studio yêu cầu (như mô phỏng 18/10).
6. Sau mỗi lần đẩy: xác minh commit bằng hash và SHA-256 từng tệp trên `raw.githubusercontent.com/quangvinh376/b0dy-booking/<commit>/…`.
7. Chỉ MỘT tiến trình Playwright / Chromium một lúc (máy test nhỏ từng hết RAM).

## Đang ở đâu (09/11/2026)

- **1.9.0 · "Để B0DY kể về bạn" + header L3** (chủ studio 09/11 16:30: "dev lên bản booking QC toàn bộ journey, đảm bảo chuẩn với artifact").
  (1) **Header L3, mọi khách**: bỏ tín hiệu "Đang mở đặt · Tuần N" và dãy bước (chủ studio 09/11: vô nghĩa). Trái: logo · ngày giờ Hà Nội
  (desktop, cách logo 32) · `#hdOff` "Mất kết nối" (chỉ khi đang xem bản lưu trên máy) · `#sigN` số người đang xem. Phải `#hdR`: thẻ H4
  `#kchip` (Figma 02d `1893:6213`: 181 × 40 / 159 × 36, khối Chàm, dải Cam 8 / 6 → 14 / 10 khi rê, nhãn Archivo XC 20 / 18, chấm Cam
  = chưa mở, đã xem tới biệt danh → nhãn = biệt danh) chỉ khi hội viên đã xác minh có câu chuyện; hoặc nút "← Phiếu" (`.hd-back`,
  `data-a="back-ticket"`) trong đổi lịch / thêm buổi (thay bước "01 Phiếu" desktop + "← Phiếu" mobile). Câu gợi ý lần đầu dưới thẻ (một
  lần / hội viên / phiên bản câu chuyện, 6 s, chạm đâu cũng tắt). (2) **Hành trình** = trang riêng `ke.html` (+ `ke.css` · `ke.js` ·
  `ke-core.js` · `ke-b0b.js`, phông Archivo tự host `fonts/Archivo*.woff2` + OFL): bản artifact 3.3 (22 khoảnh khắc, hướng chữ C), dữ
  liệu theo hội viên — `ke-core.js` sinh mọi câu; bộ số artifact ra đúng từng câu + đúng nbsp (test so từng câu), khoảnh khắc thiếu dữ
  liệu tự bỏ. Bấm thẻ → `sessionStorage` `ke_payload` = {story, next, nav, tk = đuôi mã nhớ máy} rồi mở ke.html (không gọi máy chủ,
  CSP `connect-src 'none'`; không đúng phiên → về trang đặt lịch). Khác artifact có chủ đích: "← Đặt lịch" (bỏ Sảnh), PDF tự viết một
  trang ("TRANG 1 / 1", không tải jsPDF), điện thoại "Lưu ảnh" mở bảng chia sẻ. (3) **Máy chủ** `lt_story` (chỉ Worker; Apps Script
  trả `unknown_action` → không thẻ): tab **"Kể về bạn"** của file Lịch tập tuần (A Mã KH · B phiên bản · C cập nhật · D JSON v1, dạng ở
  `worker/README.md`) — **chưa có tab trên file thật → bản thật chưa ai thấy thẻ**; công cụ sinh JSON từ dữ liệu tập (logbook app coach +
  SESSION LOG + số đo) là việc sau. (4) **QC**: tab 205 giả (`qc-ke.js`) — Trịnh Minh Khôi 1111 = bộ số artifact (22 khoảnh khắc, "Đặt
  lịch tuần 43"), Phùng Diệu Linh 7777 = dạng khác (07:00, thứ Bảy, nghỉ 2 tuần, 18 khoảnh khắc, "Xem phiếu tuần 43"); `WORLD_V` 8.
  Chữ mới (ngoài artifact) chờ chủ studio soát: câu ngày tập T3–CN · "Hồi đầu / giữa tháng …" · "ngủ khò những k tuần" · "Kỷ lục …" ·
  tỉ lệ mức tạ / so cân nặng · giảm ≥ 6 kg / tăng cân · hít xà 1 cái · mục tiêu đạt hết / còn nhiều · 4 biệt danh (giữ nhịp · nhấc núi ·
  quay lại · bền bỉ) · tuần sau đã đặt / chưa mở / không đặt được · câu gợi ý header.
  Test: `ke_core` 3111 (mới) · `gas_lt` 404 · parity 457 (1075 lượt giống hệt) · concurrency 37 · robust 86 · http 13 · live 25 · story 37
  (mới) · ui_states 119 · ui_qc 84 · ui_duo 48 · ui_live 28 · ui_notice 110 · ui_smoke 24 · ui_sw 8 · ui_peak 71 · ui_ke 97 (mới) · ui_tk3d
  81 · ui_png 93 · rv_* PASS (`rv_tilt` trượt mốc lắc gợi ý rồi chạy lại PASS 2/2 · `b0b_check` trượt "Idle ~30 fps" — nhiễu máy test, b0b.js
  không đổi) · realdata / workerd bỏ qua (máy này không có fixture / Miniflare). So ảnh 22 khoảnh khắc với bản artifact (393 × 852 và 1440 × 900): khớp (lệch ≤ 2,3 % điểm ảnh — B0B đang chuyển động); 10 cỡ màn
  (320 × 568 → 2560 × 1080, cả ngang) × 2 dạng câu chuyện: không tràn, không lỗi.
  Rà soát độc lập 1 vòng (agent riêng): 2 lỗi thật + 8 lỗi nhỏ — đã sửa + có test (đăng xuất trên máy dùng chung vẫn mở lại được câu chuyện
  người trước qua nút Tiến → xoá `ke_payload` + kiểm phiên; chuỗi tuần / "0 tuần nghỉ thêm" tính tới tuần của `asOf`; "Thiếu mất 0 tấn";
  lời coach dài tràn bản in; tên tab dạng tổ hợp; Mã KH chữ thường; Google lỗi không gọi dồn; chỉ trả trường v1; lượt hỏi cũ sau đăng xuất).

- **1.8.3 · nhận diện hội viên theo NGƯỜI** (chủ studio 05/11: "sửa tận gốc, không muốn trường hợp này xảy ra nữa"). Sự cố: một khách
  gia hạn hợp đồng, dòng MEMBERS của HĐ mới chưa có Mã KH → máy chủ coi là người mới (khoá `#tên`, phiếu "Đặt" bản 1, buổi cùng tuần không
  thấy); sau khi điền Mã KH mới thành khoá thứ ba → phiếu trống, buổi của mình hiện "coach bận", đặt trùng ngày được. Trước đó tìm tên ra HAI
  người cùng tên. **Cột MEMBERS!X `_kh` = `IF(U="","",…)` — trống khi dòng chưa có Mã KH** → không dựa được vào nó. Sửa (`core.js` ·
  `persons` / `LichTuan.gs` · `ltPersons_`, parity): union-find nối dòng cùng SĐT + tên · cùng `_kh` + tên · cùng Mã KH + tên · cùng Mã KH
  khi cả hai dòng còn hiệu lực và SĐT không mâu thuẫn (gói A/B, kể cả tên gõ lệch) · dòng thiếu cả mã lẫn SĐT vào người cùng tên nếu chỉ có
  một. Khoá = Mã KH dòng đang tính; trống → Mã KH riêng của người đó (luật dòng đang tính, không nhảy theo HĐ tương lai) → `#tên` (tên của
  hơn một người → `#tên|số HĐ`, không ai giữ khoá trần, không chứa SĐT). SĐT xác minh như cũ (+ dự phòng: mọi dòng cùng mã).
  `list.alias`: Mã KH cũ (của đúng một người) · `#tên` (tên của đúng một người) · `#tên|số HĐ` → khoá. `canonRows` / `ltCanonRows_`: dòng
  sổ (và mã trong ghi chú Mời / Từ chối) đổi về khoá hiện tại cho phiếu, suất coach, lời mời — Worker vẫn tìm dòng trên sheet bằng mã gốc
  (`L.rows`), Apps Script ghi theo số hàng. `findPerson` hiểu bí danh (mã nhớ máy cũ vẫn vào). `snap:ba` fmt 4 · Apps Script `lt:mem4`
  (dòng có `kh`, `no`). VER 1.8.3 (qc.js nạp worker/src). Dữ liệu thật (BA 05/11, chỉ đếm): 56 hội viên, khoá / SĐT / số buổi không đổi
  với ai; 5 khách gia hạn có bí danh mã cũ. Sổ: một dòng `#tên` của khách bị sự cố đã đổi về Mã KH hiện tại (chủ studio đồng ý).
  Test: `gas_lt` 404 · parity 457 (1075 lượt giống hệt) · robust 86 (ảnh chụp BA dạng 4) · concurrency 37 · http 13 · live 25 · realdata 17
  · `coach_cases` mục 24 mới (a–m: gia hạn khi Mã KH trống / đã có, mã nhớ máy cũ, đổi buổi dòng `#tên`, chung SĐT khác tên, trùng tên,
  lời mời 1:2 mã cũ, mã gõ nhầm dòng hết hạn / còn hiệu lực, hai người trùng tên chưa mã, gói thiếu SĐT, A/B lệch tên) — chạy trên mã cũ:
  mục 24 trượt đúng như sự cố · MEMBERS giả có cột `_kh` tính y công thức thật · ui_states 117 · ui_qc 84 · ui_duo 48 · ui_live 28 ·
  ui_notice 110 · ui_smoke 24 · ui_sw 8 · ui_peak 71 · rv_* PASS. Rà soát độc lập 2 vòng (agent riêng), mọi phát hiện đã sửa + có test.
  Deploy: `main` `1ce87d6` (10 tệp SHA khớp raw) · Worker `1ce87d6` (7 module SHA khớp, `OK etag=36c05b1a39`, 5 binding, cron) →
  `lt_ping` pending 0 · `lt_boot` tuần 45 · trang thật index · app.js · sw.js khớp (1.8.3) · Apps Script **V44** 13:30 05/11 (chủ studio "đồng ý deploy
  Apps Script dự phòng" — lần đầu bộ kiểm quyền chặn) "Lich tap tuan (booking.b0dy.studio) - nhan dien khach gia han theo nguoi, 05/11",
  ID giữ; LichTuan.gs `d11f0645…` đọc lại ở tab mới, Code.gs / Discord.gs không đổi → `/exec` `lt_boot` tuần 45 · `lt_find` 'zqxj' → `[]`
  · tìm một khách gia hạn ra 1 kết quả như Worker.
  `Bảng lịch tập` đếm HỘI VIÊN ĐÃ ĐẶT / Chưa đặt lịch theo Mã KH thô của sổ → tuần có buổi dưới mã cũ + mã mới của cùng người đếm hai
  lần — **giữ nguyên** (chủ studio 05/11: hai hợp đồng khác nhau, đếm riêng là đúng bản chất; không đổi mã dòng sổ cũ). Mã nhớ máy `#tên` của người đã bị xoá khỏi MEMBERS có thể vào người cùng tên (rất hiếm). Dòng HĐ mới nên điền đủ SĐT ngay.

- **1.8.2 live 04/11 ~23:10** (chủ studio 04/11 20:47: "Cho phép đổi giờ trong ngày" — chốt: giữ buổi đang có ≥ 24 giờ, khung mới ≥ 12 giờ;
  đổi trong ngày tính 1 lượt như mọi lần đổi; "Ghép" vào nhóm 1:2 vẫn miễn lượt). Nguồn: khách 1:1 không dời được T6 19:00 → T6 07:00 vì
  `checkChange` trả `cung_ngay` và trang khoá cả cột ngày của buổi đang đổi. Máy chủ (`core.js` · `LichTuan.gs`, parity): bỏ `cung_ngay`;
  thêm chặn "đổi" sang chính buổi đang có (`khong_hop_le` · `khung` — trước đây `cung_ngay` chặn luôn ca này). Trang: `cellModel` cờ
  `sameDay` (ô giờ khác cùng ngày buổi đang đổi đi luồng ô thường; hết lượt / chỉ còn Ghép giữ lối cũ), `toOk` bỏ chặn cùng ngày, luật
  "Đổi sang ngày khác, hoặc giờ khác trong cùng ngày, trong cùng tuần." (bỏ biến thể 1:2 "trừ khi dời vào nhóm"). Mã `cung_ngay` trang vẫn
  hiểu (máy chủ cũ). Test: `gas_lt` 379 · parity 432 (1023 lượt giống hệt) · concurrency 37 · robust 86 · http 13 · live 25 ·
  `coach_cases` mục 23 mới (đổi trong ngày: dưới 12 giờ · ok + dòng sổ · coach bận → het_cho · trùng chính buổi · mỗi ngày một buổi · hết
  lượt) + mục 15 viết lại · ui_states 117 (E13 mới: cột T6 mở, T3 vẫn khoá, máy chủ nhận đổi) · ui_qc 84 · ui_duo 48 (đổi ca "rời cặp
  trong ngày không được" → chọn được) · ui_live 28 · ui_notice 110 · ui_smoke 24 · ui_sw 8 · ui_peak 71 · rv_* PASS. `ui_peak` ca "Chọn
  1 buổi" trượt cả trên 1.8.1 (đọc chữ nút 250 ms trong lúc mờ chéo) → chờ 900 ms. Deploy: `main` `6c4c70a` (11 tệp SHA-256 khớp raw) ·
  Worker `6c4c70a` (7 module SHA khớp, `OK etag=007ad63bed`, 5 binding, cron) → `lt_ping` pending 0 · `lt_boot` tuần 45 7 ngày · trang thật
  `index.html` · `app.js` · `sw.js` khớp, VER 1.8.2 · Apps Script **V43** 23:11 ("Lich tap tuan (booking.b0dy.studio) - doi gio trong cung
  ngay, 04/11", ID giữ; LichTuan.gs SHA `fda7da38…` sau khi tải lại, Code.gs / Discord.gs không đổi) → `/exec` `lt_boot` tuần 45 ·
  `lt_find` 'zqxj' → `[]`. Lần này bộ kiểm quyền chặn deploy Worker tới khi chủ studio nói rõ "tiến hành deploy, tôi đồng ý".

- **`Bảng lịch tập` · hàng ô con 13 / 14 → 18 px** (chủ studio 16:41: "đang bị cắt xén mất text"): 13 px cắt chân chữ g · y · ọ (Inter 8).
  Chỉ đổi chiều cao 70 hàng lưới + 56 hàng Theo coach (`SUB_H` = `KC_H` = 18 trong script), không đụng công thức / màu. Đọc ngược
  `rowMetadata` đúng bố cục script; nhìn trên Chrome đủ chân chữ, dấu; rộng nhất 185 / 244 px (đo bằng phông Inter) → không cắt ngang.
- **Lịch tập tuần · `Bảng lịch tập` dựng lại: mỗi suất coach một ô, chữ đỏ #c2182b đúng ô khách 1:2 đang lẻ** (chủ studio 01/11 15:53:
  "tô đỏ toàn bộ ô … khá misleading" → chọn "Mỗi coach một ô"; thay bản 14:47 tô đỏ cả ô). Lưới: mỗi khung giờ = 5 ô con cao 18 px (một
  suất coach mỗi ô, xếp theo coach; hơn 5 suất dồn vào ô cuối), khe 4 px giữa các giờ, viền hộp quanh từng giờ. Theo coach: mỗi ngày 8 ô con
  (một buổi mỗi ô, theo giờ). Bảng cờ ẩn **AD:AP** cùng hình lưới (cột + 26; 0 · 1 = lẻ · +2 = khung đủ suất), quy tắc đọc ô cờ cùng hàng
  (`=AD8=1` …); KHUNG ĐẦY = `COUNTIF(AD8:AP92,">=2")/5`. Tab 168 hàng × 42 cột · 8 quy tắc · 30 ô gộp; H2 giữ 02.11. Đối chiếu tuần 45
  với tính độc lập từ sổ (xuất xlsx, script chỉ đếm): 98 khung × 7 ngày đúng chữ + thứ tự + cờ, 21/21 coach × ngày Theo coach đúng, 0 ô lỗi;
  màu thật (`effectiveFormat`): đỏ đúng 13/13 ô lưới + 13/13 ô Theo coach, 0 ô đỏ thừa. **Bẫy**: Sheets nhận công thức lệch ngoặc mà API
  không báo lỗi (ô D99 thừa ")" → `#ERROR!`, Theo coach trống) → `bang_lich_tap.py` nay tự kiểm cân ngoặc mọi công thức trước khi ghi.
  Không đổi mã trang / máy chủ.

- **1.8.1 live 01/11 11:58** (chủ studio 11:42: "được đặt từ 6:00 đến HẾT khung 16:00, tức tới 17:00 là kết thúc") — gói ban ngày thêm khung
  16:00: `LT.OFF_HOURS` = 06 · 07 · 08 · 09 · 10 · 11 · 12 · 14 · 15 · **16** (cửa sổ hiển thị 06:00–17:00). **Bài học**: "giờ A–B" của chủ
  studio = khung bắt đầu A tới khung bắt đầu B (B là khung cuối được đặt), KHÔNG phải buổi kết thúc trước B như cách hiểu 31/10 / 1.8.0.
  Chỉ đổi hằng số + chữ dự phòng của trang + test (khung "ngoài gói" trong test = 17:00). Worker `fba48ff` deploy 11:4x (7 module SHA khớp,
  `OK etag=dc1dccca57`, 5 binding, cron) → `lt_ping` pending 0 · `lt_boot` tuần 45 — trang 1.8.0 đang chạy lấy khung từ `offpeak.hours`
  của máy chủ nên khách thấy khung 16:00 ngay sau Worker · Apps Script **V42** 11:47 ("… goi Ban ngay 06-17 (het khung 16:00) + 1:2 moi
  khung, 01/11", LichTuan.gs SHA `508484de…` sau khi tải lại) → `/exec` `lt_boot` tuần 45 · trang 1.8.1 (VER, `?v=`): `main` `b7bf8e1`, Pages success 11:57:51, 10 tệp SHA-256 khớp trên raw, trang thật
  `/index.html` + `app.js` khớp, `__lt.ver` 1.8.1, 4 thẻ `?v=1.8.1`. Test: `gas_lt` 367 ·
  parity 420 (994 lượt giống hệt) · robust 86 · realdata 17 · ui_peak 71 (gợi ý khi vừa mất T2 12:00 = 14 · 15 · 16, cách đều ưu tiên
  giờ muộn) · ui_states 107 · ui_qc 84 · ui_duo 48 · ui_notice 110 · ui_smoke 24 · ui_sw 8.

- **1.8.0 live 01/11 11:32** (chủ studio 10:24 + 10:31, "đẩy lên live ngay") — (1) gói **"Thấp điểm" đổi tên "Ban ngày"**, khung đặt **06:00–16:00**:
  `LT.OFF_HOURS` = 06 · 07 · 08 · 09 · 10 · 11 · 12 · 14 · 15 (buổi 60 phút nằm trọn trong cửa sổ, như cách hiểu 31/10; 13:00 nghỉ trưa).
  Máy chủ nhận cả "Ban ngày" lẫn tên cũ "Thấp điểm" (`isOffPeak` / `ltIsOffPeak_`); khoá nội bộ giữ tên cũ (`thap_diem`, `offpeak`) để trang cũ
  còn trong bộ nhớ đệm vẫn hiểu. (2) **Bỏ luật khung ghép 1:2**: gói 1:2 đặt mọi khung như 1:1, ghép / mời / "Ghép" ở khung bất kỳ —
  `LT.DUO_HOURS` = đúng `LT.SLOTS`, `why` không còn `gio_ghep` (trang vẫn hiểu mã này). Trang: `duoAll()` → thông báo / luật / bảng Tập đôi
  không còn "khung ghép"; khách 1:2 toàn thời gian dùng bảng đủ 14 hàng → lớp `.cmp` (bảng đủ, hoặc bảng con ≥ 8 hàng): ô Ghép gọn = icon +
  tên một dòng (vừa hàng 26 px mobile / 30 px desktop, đo 6 cỡ màn hình), bảng con nhiều hàng trên mobile hạ hàng tối thiểu 44 → 30 px.
  `snap:ba` fmt 3 / Apps Script `lt:mem3` (ảnh chụp cũ tính `off` theo luật cũ → bỏ). QC `WORLD_V` 7.
  **BA · MEMBERS cột Y "Khung giờ"**: danh sách chọn "Toàn thời gian / Ban ngày" (Y6:Y1013), 36 ô "Thấp điểm" → "Ban ngày" (đọc ngược:
  1.008/1.008 ô danh sách mới, 36 Ban ngày · 48 Toàn thời gian · 0 Thấp điểm). **Bẫy**: tab MEMBERS có bộ lọc ẩn hàng —
  `setDataValidation` theo dải BỎ QUA hàng bị lọc (24 ô giữ danh sách cũ) → ghi từng ô bằng `updateCells` (`fields: dataValidation`);
  `findReplace` thì vẫn đổi giá trị hàng bị lọc. Không đổi CAPACITY!H10 (chữ chú thích "thấp điểm" của bảng độ đầy, không phải tên gói).
  Deploy: Worker `14ed554` (7 module SHA khớp, `OK etag=bd8a63c2d4`, 5 binding, cron) → `lt_ping` pending 0 · `lt_boot` tuần 45 7 ngày ·
  Apps Script **V41** 11:24 ("Lich tap tuan (booking.b0dy.studio) - goi Ban ngay 06-16 + 1:2 dat moi khung, 01/11", ID giữ; LichTuan.gs
  SHA `23640fae…` cả sau khi tải lại, Code.gs / Discord.gs không đổi) → `/exec` `lt_boot` tuần 45 · BA → trang: `main` fast-forward
  `534c343` → `19030ba`, Pages success 11:32:23; 11 tệp SHA-256 khớp trên raw tại commit; trang thật `/index.html` khớp, `__lt.ver`
  1.8.0, 4 thẻ `?v=1.8.0`, bộ đệm SW chỉ còn `lt-1.8.0`, không lỗi console của trang (`/` trong Chrome còn trả HTML 1.7.1 từ bộ đệm vài phút
  trước khi SW mới nhận — như 1.7.0).
  Test: `gas_lt` 367 · parity 420 (994 lượt giống hệt) · concurrency 37 · robust 86 · http 13 · live 25 · realdata 17 (BA xuất 01/11 sau
  khi đổi: 36 hội viên ban ngày) · `coach_cases` mục 20–21 viết lại cho 06–16 + mục 22 mới (1:2 mọi khung: đặt 06 / 10 / 14 / 20, vào nhóm,
  mời, "Ghép" khác ngày) · ui_states 107 · ui_qc 84 · ui_duo 48 · ui_live 28 · ui_notice 110 · ui_smoke 24 · ui_sw 8 · ui_peak 71 ·
  ui_tk3d 81 · ui_png 93 · rv_* PASS · `b0b_check` trượt ca "Idle ~30 fps" như ghi chú dưới (b0b.js không đổi). Rà soát độc lập 1 vòng
  (agent riêng): không lỗi logic; bắt được ô Ghép tràn hàng trên bảng 14 hàng → đã sửa.

- **1.7.1 live 31/10 15:52** (`df69040` trên `main`, chỉ trang — Worker / Apps Script không đổi, vẫn `aee113b` / V40): Pages success 15:52:53,
  9 tệp đổi SHA-256 khớp trên raw, trang thật index · app.js · sw.js khớp, `lt_ping` `pending 0`. Chủ studio hỏi giao thoa "khách thấp
  điểm mà coach cũng bận các khung đó" → `coach_cases` mục 21 (Apps Script + Worker, parity 973 lượt giống hệt): coach bận cả 5 khung
  trong gói (khách khác + tập thử) · hai khách thấp điểm tranh khung · coach kín 4/5 ngày → tối thiểu / tối đa tự hạ về 1 · kín cả tuần →
  `closed` · Lịch coach không nhận 09–15 (CN nhận; CN 15:00 tick vẫn `thap_diem`) · phòng đầy · 1:2 thấp điểm vào nhóm khi phòng đầy, không
  vào nhóm 15:00 · Ghép ngoài gói bị chặn · buổi cũ ngoài gói giữ, đổi / thêm vào gói · hết hạn giữa tuần (`het_han` trước `thap_diem`) ·
  đặt muộn + coach bận. `ui_peak` 71 (thêm phần giao thoa desktop + mobile, máy chủ giả LichTuan.gs): ô X trên bảng con, vừa hết chỗ chỉ gợi
  ý khung trong gói còn trống, "Chọn 1 buổi", màn kín lịch / coach nghỉ, đổi buổi cũ ngoài gói. **Sửa trang**: màn kín lịch của khách thấp
  điểm trước ghi "Không còn khung trống nào đặt được trong tuần" (sai — phòng còn khung ngoài 09–15) → "Các khung trong gói thấp điểm
  (09:00–15:00) đã kín." / coach không nhận khách mọi khung trong gói còn lại của tuần → "Coach nghỉ trong giờ thấp điểm. · Tuần này coach
  của bạn không nhận khách trong 09:00–15:00." (chữ mới, chưa vào doc UX writing). `ui_harness` nhận thêm `extra` (có "Khung giờ") ·
  `log` · `sched`. Đủ bộ test PASS 31/10 15:40 (`rv_tilt` trượt 2 mốc thời gian như bản cũ). Khách sổ bịa của test dùng mã B7xx (không
  trùng hội viên bịa B9xx / mã thật).

- **1.7.0 live 31/10** (`aee113b` trên `main`): Worker `b0dy-booking-api` deploy **14:28:49** qua Claude in Chrome (tab dash, đoạn
  `tools/worker_deploy_snippet.mjs aee113b` — 7 module SHA khớp): `OK etag=9f2d05f773`, 5 binding (DO `BOOK` · `ALLOW_ORIGINS` · `BA_ID` ·
  `OUT_ID` · secret `SA_JSON`), cron `* * * * *`; `lt_ping` `pending 0`, `lastError` rỗng · `lt_boot` tuần 44 7 ngày · `lt_find` 'zqxj' →
  `results: []`. Apps Script **V40** 14:31 = `LichTuan.gs` của `aee113b` (thay nội dung bằng Monaco `pushEditOperations` từ raw ở đúng
  commit, SHA-256 `e95bb642…` khớp cả sau khi tải lại trình soạn thảo), deployment "Lich tap tuan (booking.b0dy.studio) - ca 12:00 + goi
  thap diem, 31/10" giữ ID `AKfycbxyoH2Ipok…qGYnqdA`; `/exec` `lt_boot` tuần 44 · `lt_find` 'zqxj' → `[]`. Deployment tập thử
  (`AKfycbxiZL…`) đang **V39** (28/10, "V39 avatar B0B moi (BOT_AVATAR)…" — không do phiên này) — không đụng. Trang: "pages build and
  deployment" success 14:33:25; 31 tệp SHA-256 khớp trên raw tại commit; trang thật (tab booking.b0dy.studio, từ `/img/og.png` fetch
  no-store) 8 tệp tĩnh khớp, `__lt.ver` 1.7.0, CSS 7 + dải + 7 hàng; 14:41 (hết hạn bộ nhớ đệm HTML) 4 thẻ `?v=1.7.0`, SW lưu HTML mới; state
  đăng nhập sẵn trên Chrome chủ studio có `coachAt` khung 12:00 (chỉ CN 'off', như 11:00) → Worker đọc đúng hàng 12:00 của Lịch coach. Thứ tự: Worker → Apps Script → trang (trang 1.6.2 với Worker mới
  chạy được: không có hàng 12:00, chưa ai thấp điểm).
- **1.7.0 (chủ studio 31/10)** — (1) BA · MEMBERS cột **Y "Khung giờ"** (cuối bảng, không chen giữa để không lệch công thức / QUERY theo
  vị trí cột; ô chọn "Toàn thời gian" / "Thấp điểm", cùng định dạng sheet), cả 81 dòng có Mã KH = "Toàn thời gian" — chủ studio tự đổi.
  (2) **Mở ca 12:00**, nghỉ trưa còn 13:00–14:00: `LT.SLOTS` thêm 12; trang 14 hàng (`LUNCH` 13; CSS `repeat(7) dải repeat(7)`, `.lunch`
  hàng 8; `--rh` chia 14; vạch "bây giờ" tính theo đoạn). (3) **Gói thấp điểm** = buổi nằm trọn trong 09:00–15:00 → `LT.OFF_HOURS`
  09 · 10 · 11 · 12 · 14 (cùng cách hiểu "Giờ mở cửa 06:00 – 21:00" ↔ khung 06…20; muốn tính cả 15:00 chỉ đổi hằng số): why `thap_diem`
  (sau `gio_ghep` → 1:2 thấp điểm chỉ 09 · 11), mời bạn thấp điểm vào khung ngoài gói → `nguoi_moi`, `duo.wait` bỏ khung ngoài gói,
  `duo.peers[].hours`, state `offpeak: {hours}`; trang: bảng con (`.wk.sub` — cùng lối với khung ghép 1:2, giữ giờ của buổi đã đặt trước),
  thông báo "Gói thấp điểm · 09:00–15:00.", Gói & luật (dòng "Khung giờ · Thấp điểm · 09:00–15:00" + luật), Tập đôi lọc bạn thấp điểm.
  Đổi dạng dữ liệu: `snap:ba` fmt 2 (`SNAP_BA_FMT`), cache Apps Script `lt:mem2` / `lt:sc2`. Sheets 31/10 (chủ studio cho sửa): `Lịch coach`
  chèn hàng 12:00 vào 5 khối (T2–T7 tick, CN trống), vạch nghỉ trưa dưới 12:00 · `Bảng lịch tập` chèn 2 hàng (12:00 + khe), D8 MAKEARRAY 13
  hàng, nhãn "NGHỈ TRƯA · 13:00–14:00", quy tắc CF "Theo coach" `ROW()-43` (đọc ngược: 88 ô · 5 quy tắc · 9 gộp · 63 hàng khớp script; J2:P2
  19 · 7 · 0 · 50) · BA `⚙️ 2`!C29 "Số khung tối đa / ngày" 13 → **14** (C30 = 70; CAPACITY tính lại cả tuần cũ theo 14 khung). QC: Văn Thục
  Đoan 1313 (thấp điểm 1:1 · Ngọc) · Tiêu Hạ Miên 1414 (thấp điểm 1:2 · Lâm), `WORLD_V` 6 — tên / SĐT / mã so với MEMBERS + TRIAL thật:
  0 trùng (đổi "Tiêu Hải Yến" vì trùng 2 chữ cuối một khách thật). Test: `gas_lt` 305 · parity 358 (897 lượt giống hệt) · concurrency 37 ·
  robust 86 · http 13 · live 25 · realdata 17 (BA xuất 31/10, 57 hội viên — bỏ số cứng 54) · workerd 20 + 3 ca lỗi test đã biết (bản cũ
  y hệt) · `ui_states` 107 · `ui_qc` 84 · `ui_duo` 48 · `ui_live` 28 · `ui_notice` 110 · `ui_smoke` 24 · `ui_sw` 8 · `ui_peak` 41 (mới) ·
  `ui_tk3d` 81 · `ui_png` 93 · `b0b_check` 31 · `rv_*` PASS (trừ `rv_tilt` trượt mốc lắc gợi ý / về dáng nghỉ — bản cũ cũng trượt trên máy
  này). Sửa test: `ui_sw` trượt từ 25/10 cả trên bản cũ (giờ giả 18/10 lệch giờ thật > 7 ngày → `boot` bỏ `lt_skew` khi mất mạng tải lại)
  → dời `Date` của trang theo máy chủ giả; `rv_h7` đợi tấm trượt vào hẳn rồi mới đo nút (máy bận chạm rơi ra ngoài màn).
  Còn biết: GitHub Pages cho tệp `max-age=600` → máy đã mở trang trong 10 phút trước deploy có thể nhận lại HTML cũ (`?v=1.6.2`) từ bộ nhớ
  đệm trình duyệt tới khi hết hạn (SW còn lưu bản đó làm bản dự phòng tới lượt mở có mạng kế tiếp). Tab kiểm 14:34: HTML cũ, CSS + JS mới.

- Trang **v1.6.2** (`3ec8ef4`) trên GitHub Pages `main` — "pages build and deployment" success 16:05:26 23/10; 8 tệp tĩnh SHA-256 khớp trên
  raw.githubusercontent tại commit (trang thật: Claude chat kiểm `__lt.ver` 1.6.2). Worker không đổi (`8db2ac5`).
- **1.6.2 (chủ studio 23/10 "đổi nốt cho thống nhất")** — chỉ đổi chữ theo từ của bản soát 1.6.1: lời mời "… mời bạn tập cùng" ở mọi nơi
  (dòng mobile, dòng Tập đôi trên phiếu, bảng Tập đôi); "nhóm" thay "cặp" (thông báo dời, 2 luật gói 1:2, toast hết lượt); "Chọn …" thay
  "Bấm …" (desktop) và "buổi" thay "ô mới / ô Ghép" (cả mobile "Chạm …"); đọc to "chọn lại để bỏ" / "chọn để đổi". Tên tính năng "Tập đôi",
  "tập đôi cùng {tên}" giữ. Doc UX writing cập nhật theo. Đủ bộ test giao diện PASS 23/10.
- Trang **v1.6.1** (`3722239`) trên GitHub Pages `main` — "pages build and deployment" success 12:04:26 23/10; 8 tệp tĩnh (index · app.js ·
  app.css · sw.js · qc.js · qc.css · b0b.js · tk3d.js) SHA-256 khớp trên raw.githubusercontent tại commit. Chưa đọc được trang thật từ máy cloud
  (WebFetch booking.b0dy.studio cần quyền, proxy chặn curl) → Claude chat kiểm `__lt.ver` 1.6.1 trong tab. Worker không đổi (`8db2ac5`).
- **1.6.1 (chủ studio 23/10: tự soát văn phong trên doc "B0DY Booking · Toàn bộ UX writing" — claude.ai artifact `3qGqN1DJqKkNNcJqjA3Ace`)** —
  chỉ đổi chữ, 34 ô sửa → 27 chỗ trong `app.js`: lỗi kết nối ("Lỗi kết nối. Vui lòng thử lại."), "Không phải tôi" → "Không phải bạn?", màn
  khoá, phụ đề đặt muộn, tiêu đề lời mời trên sàn + cửa sổ "… mời bạn tập cùng." (dòng mobile / phiếu / bảng Tập đôi vẫn "tập đôi"), màn đổi
  lịch ("Chọn …" thay "Bấm …" trên desktop, "Dời vào nhóm" / "Dời sang nhóm khác", câu lỗi đổi lịch "Buổi mới … cách hiện tại …"), bảng
  Tập đôi ("đang chờ ghép nhóm", "Chờ người ghép", ghi chú cuối). Test sửa theo chữ mới (ui_duo · ui_notice · ui_qc); đủ bộ PASS 23/10.
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
- **Apps Script dự phòng V38** (22/10 19:34, chủ studio "sửa cả appscript, không cần hỏi tôi duyệt" — từ 31/10 là **V40**, mục 1.7.0): project "B0DY Booking API"
  (`1QjIkBPOj3s7DiJF2iFNDAmcBZxi8m7qBVgPLSfXg9juzaxy3daCZ2jRe`), tệp LichTuan.gs = repo `8db2ac5` (SHA-256 `6cf7706f…`, đọc lại sau khi
  tải lại trình soạn thảo; Code.gs · Discord.gs không đổi; 0 tên hàm trùng). Deployment **"Lich tap tuan (booking.b0dy.studio) - luat 12/24 gio,
  22/10"** giữ ID `AKfycbxyoH2Ipok…qGYnqdA` (V37 19:31 lỡ để trống mô tả → V38 cùng mã, có tên). Deployment tập thử "V35 cot Ghi chu…"
  (`AKfycbxiZL…`) vẫn Version 35. Kiểm (chỉ đọc, từ tab booking.b0dy.studio): `lt_find` 'zqxj' → `results: []` không còn `need` (V36 trả
  `need: 2`) · `lt_boot` tuần 43 7 ngày. Trang vẫn chạy Worker; chỉ chuyển sang Apps Script khi Worker hỏng hẳn (mục Máy chủ).

## Phối hợp Claude Code ↔ Claude chat

- Claude chat (project "Vinh") đọc repo này (GitHub gắn vào project) và tự gộp vào runbook / doc thiết kế trong project knowledge.
  Sau mỗi thay đổi: **cập nhật mục "Đang ở đâu" trên `main`** rồi báo chủ studio — không cần gửi file runbook.
- Claude chat có Claude in Chrome (tab dash.cloudflare.com, booking.b0dy.studio) → deploy Worker / kiểm trong tab do Claude chat chạy
  (từ 19/10 không cần hỏi lại chủ studio khi test đã PASS — luật 3). Máy cloud của Claude Code: không có trình duyệt hay token Cloudflare; gọi được
  `workers.dev` bằng `curl` (Node `fetch` không đi qua proxy).

## Phiên bản trang

Mỗi lần đổi tệp tĩnh: tăng `VER` trong `app.js` **và** `sw.js`, cùng `?v=` trong `index.html` (app.css, b0b.js, ke-core.js, tk3d.js, app.js) **và**
`ke.html` (ke.css, ke-core.js, ke-b0b.js, ke.js). `qc.js` / `qc.css` tự theo `VER` (`qc-ke.js`, `worker/src` nạp không kèm `?v=`: bộ đệm SW theo `VER`). Bảng các bản đã phát hành: runbook.

## Test (phải PASS trước khi đẩy)

```bash
npm i playwright && npx playwright install chromium   # máy mới; hoặc PW_CHROMIUM=<đường dẫn chrome>
node test/gas_lt.js                      # luật + Apps Script (358)
cd worker && node test/run_all.mjs       # parity · concurrency · robust · http · live · story · realdata
node test/ke_core.js                     # "Để B0DY kể về bạn": câu chữ đúng artifact + dữ liệu ngẫu nhiên
node test/ui_states.js && node test/ui_qc.js && node test/ui_duo.js && node test/ui_live.js && node test/ui_notice.js && node test/ui_smoke.js && node test/ui_sw.js && node test/ui_peak.js && node test/ui_ke.js
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
  Bố cục 01/11: mỗi khung giờ 5 ô con (một suất coach mỗi ô) · Theo coach 8 ô con / ngày · bảng cờ ẩn AD:AP (cột + 26) cho quy tắc màu.
  Ô H2 "Xem tuần" (người dùng chọn ngày, kiểm định ngày — file locale en_US nên gõ "26/10" bị từ chối, bấm đúp chọn trên lịch) → S2 = thứ Hai
  của tuần đó; trống = tuần này (CN vẫn là tuần này). Dựng lại: `python3 tools/bang_lich_tap.py 0 <ra> <số CF> <số hàng> <số cột>`
  (đếm bằng `spreadsheets.get` **không** kèm `ranges` — có `ranges` thì chỉ trả quy tắc CF chạm vùng đó; 01/11: 8 quy tắc · 168 hàng · 42 cột),
  áp s1 → s2 → s3, rồi ghi lại H2 (s1 xoá hết hàng cũ → mất ngày đang chọn). Kiểm sau khi dựng: đọc J2:P3 · S2:S4 · đầu cột — **đừng** đọc
  lưới bằng `includeGridData` (mask `effectiveValue.errorValue` vẫn trả cả `effectiveValue` → lộ tên hội viên); so lưới với sổ: xuất cả file
  dạng xlsx (Drive `download_file_content`, kết quả tự lưu ra tệp) rồi script so, chỉ in số. Quy tắc CF "Theo coach" ngày đã qua có số hàng
  trong công thức (`ROW()-99`) → chèn / xoá hàng phía trên thì sửa tay quy tắc đó (hoặc dựng lại).
- `Lịch coach` (713): ô tick từng giờ × 7 ngày cho từng coach, chủ studio sửa tay; máy chủ đọc `A1:AD400` (luật đọc: `worker/README.md`).
  Tạo 19/10 bằng `tools/lich_coach.py`, mặc định = luật cũ (T2–T7 đủ, CN trống). Bỏ tick chỉ chặn đặt / đổi mới, buổi đã đặt giữ nguyên.
  31/10: chèn hàng 12:00 vào cả 5 khối (T2–T7 tick, CN trống), vạch nghỉ trưa dưới 12:00. Khối thiếu hàng 12:00 = coach nghỉ 12:00.
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
