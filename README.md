# B0DY · Đặt lịch tập tuần

Trang đặt lịch cho hội viên B0DY Studio: https://booking.b0dy.studio (GitHub Pages, nhánh `main`, thư mục gốc).

Hội viên tìm tên (tên đệm + tên, có dấu hay không dấu đều được) → xác minh 4 số cuối điện thoại (nhớ máy 60 ngày) →
chọn 2–4 buổi trên bảng tuần → nhận phiếu. Trong tuần: thêm buổi, đổi buổi (tối đa 2 lần, trước 24 giờ). Mở đặt 06:00 Chủ Nhật.

## Thành phần

| Thư mục / tệp | Vai trò |
|---|---|
| `index.html` · `app.css` · `app.js` | Trang (JavaScript thuần, không build). Luật khung giờ chạy cả ở trang (hiện bảng) lẫn máy chủ (quyết định) |
| `b0b.js` | Linh vật B0B (WebGL, tâm trạng theo màn, nhìn theo con trỏ) |
| `tk3d.js` | Phiếu giấy 3D (WebGL2) vẽ lại đúng phiếu DOM; máy không có GPU → phiếu DOM |
| `sw.js` | Service worker: mở lại trang tức thì, không bao giờ chạm vào lệnh gọi máy chủ |
| `worker/` | Máy chủ chính: Cloudflare Worker + Durable Object (`b0dy-booking-api`). Xem `worker/README.md` |
| `backend/LichTuan.gs` | Cùng hợp đồng API trên Apps Script (máy chủ dự phòng); parity test so từng phản hồi với Worker |
| `test/` | Test Playwright (giả máy chủ bằng chính `LichTuan.gs`), test Apps Script, test B0B |

Dữ liệu vào: file BA (MEMBERS, TRIAL, B0B, ⚙️ 2, SESSION LOG). Dữ liệu ra: sheet *[B0DY Studio] Lịch tập tuần* —
tab `Sổ đặt lịch` (mỗi buổi một dòng) và `Bảng lịch tập` (bảng tuần cho coach, tự tính).

Repo công khai: không có PIN, khoá, số điện thoại hay dữ liệu hội viên thật. Test chỉ dùng dữ liệu bịa.

## Test

```bash
npm i playwright   # một lần; Chromium có sẵn trong máy test
node test/gas_lt.js                 # luật + Apps Script
node test/ui_states.js              # 87 trạng thái giao diện (E01–E12, desktop + mobile)
node test/ui_smoke.js && node test/ui_sw.js && node test/ui_tk3d.js all && node test/b0b_check.js
node test/rv_h6_rid_discard.js      # … và các rv_*.js: tái hiện lỗi đã sửa (mất phản hồi, máy dùng chung, 06:00, …)
(cd worker && node test/run_all.mjs)
```

## Deploy trang

Mỗi lần đổi tệp tĩnh: tăng `VER` trong `app.js` **và** `sw.js`, cùng `?v=` trong `index.html` (4 thẻ). Đẩy lên `main`,
so SHA-256 tệp trên raw.githubusercontent.com với bản đã test.
