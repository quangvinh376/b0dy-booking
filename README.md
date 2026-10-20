# B0DY · Đặt lịch tập tuần

Trang đặt lịch cho hội viên B0DY Studio: https://booking.b0dy.studio (GitHub Pages, nhánh `main`, thư mục gốc).

Hội viên tìm tên (gõ tới đâu ra tới đó: vài chữ của tên đệm / tên gọi, có dấu hay không dấu đều được; gõ riêng họ không ra ai vì trang chỉ hiện chữ cái đầu của họ)
→ xác minh 4 số cuối điện thoại (nhớ máy 60 ngày) →
chọn 2–4 buổi trên bảng tuần (T2–CN) → nhận phiếu. Trong tuần: thêm buổi, đổi buổi (tối đa 2 lần, trước 24 giờ). Mở đặt 06:00 Chủ Nhật.
Bảng cập nhật live (1.2.0): ai đó đặt / đổi / mời xong thì mọi trang đang mở hỏi lại trong khoảng 1 giây (ô mình đang chọn vừa
bị lấy → báo ngay, trước khi bấm Đặt lịch); B0B nhìn quanh khi có thêm người mở trang, dưới chân ghi "N người đang xem" (ẩn danh).
Giờ / ngày coach nhận khách: tab `Lịch coach` (file Lịch tập tuần, ô tick từng giờ × 7 ngày) — ô ngoài lịch hiện xám "Coach nghỉ",
ngày nghỉ trọn ngày thành một khối; coach không có khối trong tab: T2–T7 đủ giờ, CN nghỉ (từ 1.1.0, chủ studio chốt 19/10).
Mỗi khung giờ mỗi coach dạy một suất (một khách 1:1, hoặc hai khách gói 1:2 của cùng coach đó); phòng tối đa `Sức chứa` suất (⚙️ 2).
Gói 1:2 đặt ở các khung ghép 09 · 11 · 15 · 17 · 19, thấy tên gọi bạn cùng coach đang chờ, mời được một bạn vào buổi đang chờ,
và dời buổi đang chờ vào cặp có sẵn không tính lượt đổi.

## Thành phần

| Thư mục / tệp | Vai trò |
|---|---|
| `index.html` · `app.css` · `app.js` | Trang (JavaScript thuần, không build). Luật khung giờ chạy cả ở trang (hiện bảng) lẫn máy chủ (quyết định) |
| `b0b.js` | Linh vật B0B 1.1 (WebGL): hệ thần kinh 7 lớp — biểu cảm (lò xo tới hạn), chú ý (ngăn ưu tiên), đầu – mắt (giật mắt, bám, vi giật), cử chỉ, chớp mắt, hơi thở, bộ não (rảnh, ngủ gật, ngủ). Trang chỉ kể việc qua `B0B.emit(loại, dữ liệu)` (cầu nối `bobBridge` / `bobWatch` trong `app.js`), B0B tự phản ứng. Giảm chuyển động → tư thế tĩnh |
| `tk3d.js` | Phiếu giấy 3D (WebGL2) vẽ lại đúng phiếu DOM, xoay theo chuột / vuốt (`TK3D.rot`; không có GPU → vé DOM nghiêng bằng CSS 3D). `TK3D.snapshot(vé)` vẽ lại đúng vé đang hiện bằng canvas 2D cho "Lưu về máy" (desktop vé ngang, mobile vé dọc) |
| `sw.js` | Service worker: mở lại trang tức thì, không bao giờ chạm vào lệnh gọi máy chủ |
| `qc.js` · `qc.css` | Chế độ QC (`?qc`): máy chủ giả chạy ngay trong trình duyệt bằng chính mã `worker/src`, dữ liệu giả, không gọi mạng |
| `worker/` | Máy chủ chính: Cloudflare Worker + Durable Object (`b0dy-booking-api`). Xem `worker/README.md` |
| `backend/LichTuan.gs` | Cùng hợp đồng API trên Apps Script (máy chủ dự phòng); parity test so từng phản hồi với Worker |
| `test/` | Test Playwright (giả máy chủ bằng chính `LichTuan.gs`), test Apps Script, test B0B |
| `tools/bang_lich_tap.py` | Dựng tab `Bảng lịch tập` theo bảng giờ của trang (requests cho `spreadsheets.batchUpdate`, xem đầu tệp) |
| `tools/lich_coach.py` | Tạo tab `Lịch coach` (5 khối coach, mặc định T2–T7 tick đủ, CN trống = đúng luật cũ) — chỉ để tạo lần đầu |
| `tools/beam_css.mjs` | Sinh khối CSS tia viền (border beam) trong `app.css` từ chính mã gói `border-beam` 1.4.1 (libraries.dev/beam, MIT) — cấu hình của ví dụ, 9 đốm màu gốc chỉ sẫm lại cho đạt ≥ 4,5:1 trên nền thẻ (không Than / Mực); `--check` so khối đang nhúng |
| `tools/ba_fixture.py` · `tools/sim_week*.{mjs,py}` · `tools/worker_deploy_snippet.mjs` | BA xuất Excel → fixture riêng tư (`.local/`, không đẩy lên repo) · mô phỏng cả phòng đặt tuần tới theo lịch tập tuần trước (đúng luật máy chủ) + ghi / kiểm sổ · đoạn deploy Worker từ dashboard. Xem `CLAUDE.md` |

Dữ liệu vào: file BA (MEMBERS, TRIAL, B0B, ⚙️ 2, SESSION LOG) + tab `Lịch coach` của sheet *[B0DY Studio] Lịch tập tuần*.
Dữ liệu ra (cùng sheet đó): tab `Sổ đặt lịch` (mỗi buổi một dòng) và `Bảng lịch tập` (bảng tuần T2–CN cho coach, tự tính;
ô H2 "Xem tuần" chọn ngày để xem tuần khác, xoá ô = tuần này).

Repo công khai: không có PIN, khoá, số điện thoại hay dữ liệu hội viên thật. Test chỉ dùng dữ liệu bịa.

## Test

```bash
npm i playwright   # một lần; Chromium có sẵn trong máy test
node test/gas_lt.js                 # luật + Apps Script
node test/ui_states.js              # 97 kiểm tra trạng thái giao diện (E01–E12, desktop + mobile)
node test/ui_qc.js                  # chế độ QC: kịch bản, hội viên thử, gây lỗi, không gọi mạng, không chạm bộ nhớ trang thật
node test/ui_duo.js                 # gói 1:2: nhận lời mời bằng dời trong ngày, Ghép khác ngày, rời cặp tính lượt, từ chối → "Mời bạn khác"
node test/ui_live.js                # kênh live: người khác đặt → bảng tự cập nhật, ô đang chọn bị lấy, "N người đang xem", nối lại / lui
node test/ui_notice.js              # thẻ thông báo + tia viền (border beam) thẻ ghép cặp: bật sau khi trang vào xong, quay đúng nhịp của gói, liên tục, tab ẩn / cửa sổ che thì chờ
node test/ui_smoke.js && node test/ui_sw.js && node test/ui_tk3d.js all && node test/ui_png.js all && node test/b0b_check.js
node test/rv_h6_rid_discard.js      # … và các rv_*.js: tái hiện lỗi đã sửa (mất phản hồi, máy dùng chung, 06:00, …)
node test/rv_find_dynamic.js        # tìm tên gõ tới đâu ra tới đó: tô phần khớp, more, giữ danh sách khi chờ, máy chủ cũ (need: 2)
node test/rv_tilt.js                # phiếu xoay: góc luôn ≤ giới hạn + 22°, lắc gợi ý một lần, mất pointerup không kẹt
(cd worker && node test/run_all.mjs)
```

## Chế độ QC

`https://booking.b0dy.studio/?qc` — thử mọi luồng mà không chạm lịch thật. `qc.js` nạp `worker/src/booking.js` + `core.js`
(đúng mã đang chạy trên Worker) với Google Sheets giả và Durable Object giả trong `localStorage` (`qcsrv:*`); mọi khoá của
trang mang tiền tố `qc:` nên không đọc / ghi mã nhớ máy thật. Nút "QC · Dữ liệu giả" ở mép trên: đồng hồ giả + 4 kịch bản,
hội viên thử (mã = 4 số cuối SĐT giả), gây lỗi một lần (mất phản hồi, mất mạng, khung vừa bị giữ, máy chủ bận), kênh live giả
("Người khác vừa đặt một khung" — ưu tiên khung đang chọn · "Thêm 2 người đang xem"), sổ đặt lịch giả,
Thoát QC (xoá mọi khoá `qc:` / `qcsrv:`). Không nạp được `qc.js` → báo lỗi, không bao giờ lui về máy chủ thật.

## Deploy trang

Mỗi lần đổi tệp tĩnh: tăng `VER` trong `app.js` **và** `sw.js`, cùng `?v=` trong `index.html` (4 thẻ). Đẩy lên `main`,
so SHA-256 tệp trên raw.githubusercontent.com với bản đã test.
