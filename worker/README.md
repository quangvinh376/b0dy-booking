# B0DY Booking API · Cloudflare Worker + Durable Object

Máy chủ của trang **booking.b0dy.studio**, thay cho Apps Script để mọi thao tác gần như tức thì.

| Thao tác | Apps Script | Worker này |
|---|---|---|
| Mở trang, tìm tên, xác minh 4 số | 1,5–4 s mỗi lượt | ~0,1 s (đọc từ bộ nhớ của Durable Object) |
| Chốt đặt lịch / đổi buổi | 3–5 s, khoá 28 s khi đông | ~0,7 s: một nhịp đọc song song + một lệnh ghi Google Sheets |
| 30 người bấm cùng lúc lúc 06:00 | xếp hàng từng người | gom thành 1–2 lệnh ghi, không bao giờ quá 4 người/khung |

**Hợp đồng API giống hệt `backend/LichTuan.gs`** (`lt_ping` · `lt_boot` · `lt_find` · `lt_verify` · `lt_book` · `lt_change`, cùng trường, cùng mã lỗi). Trang web chỉ đổi một hằng số URL. Sổ **"Sổ đặt lịch"** trên Google Sheets vẫn là nguồn sự thật: anh sửa tay vẫn được, và Apps Script vẫn dùng lại được làm đường lùi (cùng định dạng dòng).

## Cách chạy

- **Durable Object `Booking`** (SQLite, một bản duy nhất, đặt ở châu Á – Thái Bình Dương) giữ trong RAM: hội viên (MEMBERS), tập thử (TRIAL), ngày đóng cửa (B0B), sức chứa (⚙️ 2), điểm danh (3 cột SESSION LOG) và sổ đặt lịch. Lượt **xem** trả ngay từ bộ nhớ rồi làm mới ngầm (BA 30 s · điểm danh 60 s · sổ 15 s). Ảnh chụp được lưu vào storage của DO, nên DO bị dọn khỏi RAM thì lần sau vẫn trả lời ngay.
- Lượt **ghi** xếp hàng trong DO; các lượt đến cùng lúc gom thành một lô: đọc sổ + TRIAL mới (song song) → kiểm từng lượt theo thứ tự đến bằng đúng luật của Apps Script → **một** lệnh `spreadsheets.batchUpdate` (tất cả hoặc không). Đổi buổi luôn đọc sổ mới trước khi sửa dòng cũ.
- **Không bao giờ ghi lại mù.** Mạng đứt lúc ghi → đọc lại sổ, tìm mã yêu cầu: có thì trả thành công, chưa có thì trả `he_thong_ban` để trình duyệt gửi lại cùng mã (an toàn, không trùng).
- Đợi quá 25 s chưa tới lượt → `he_thong_ban` (như `tryLock` của Apps Script).
- **Cron mỗi phút** giữ dữ liệu ấm (đặc biệt 05:45–06:30 Chủ Nhật) và dọn bộ đếm hết hạn.
- Bộ đếm tìm tên / sai mã / khoá máy / khoá tên nằm trong storage của DO, cùng ngưỡng với Apps Script.
- Nhật ký (Observability) chỉ có tên lệnh, mã lỗi, thời gian — không có body (mã nhớ máy, 4 số cuối).

## Tệp

| Tệp | Vai trò |
|---|---|
| `src/core.js` | Lõi nghiệp vụ, chép 1:1 từ LichTuan.gs (tuần, 24 giờ, giới hạn buổi, đổi lịch, tên, state) + đọc ô Sheets API |
| `src/booking.js` | Durable Object: bộ nhớ đệm, hàng đợi ghi, các lệnh API |
| `src/sheets.js` | Google Sheets API (JWT service account bằng WebCrypto, timeout, luật thử lại) |
| `src/crypto.js` | Mã nhớ máy + mã hội viên (HMAC, giống hệt Apps Script) |
| `src/http.js` · `src/index.js` | CORS, giới hạn body 8 KB, gọi DO qua RPC, cron |
| `test/*.mjs` | `node test/run_all.mjs` — parity với Apps Script, đồng thời, lỗi ghi, DO thức dậy, HTTP, dữ liệu thật (chỉ chạy khi có bản xuất cục bộ, không nằm trong repo) |

## Triển khai (chủ studio làm, khoảng 10 phút)

### 0. Gói Cloudflare

Workers & Pages ▸ **Plans** ▸ **Workers Paid** (5 USD/tháng). Gói Free cũng chạy được Durable Object SQLite nhưng trần CPU 10 ms/lượt quá sát khi đọc Google; Worker check-in `b0dy-kiosk-api` cũng được hưởng.

### 1. Tạo Worker từ repo (khuyên dùng)

Durable Object **không tạo được bằng cách dán code** trên dashboard; phải deploy bằng Wrangler. Cách không cần cài gì:

1. Cloudflare ▸ **Workers & Pages** ▸ **Create** ▸ **Import a repository** ▸ kết nối GitHub ▸ chọn `quangvinh376/b0dy-booking`.
2. **Project name**: `b0dy-booking-api` · **Root directory**: `worker` · **Build command**: để trống · **Deploy command**: `npx wrangler deploy`.
3. **Save and Deploy**. Lần đầu Wrangler tạo luôn lớp Durable Object (migration `v1`).

Từ đó mỗi lần có commit mới trong thư mục `worker/` trên nhánh `main`, Cloudflare tự deploy lại.

*Cách CLI (nếu máy có Node):* `cd worker && npx wrangler login && npx wrangler deploy`.

### 2. Secret bắt buộc: `SA_JSON`

Worker ▸ **Settings** ▸ **Variables and Secrets** ▸ **Add** ▸ Type **Secret** ▸ Name `SA_JSON` ▸ Value = **toàn bộ nội dung** file JSON của service account đang dùng cho kiosk (`b0dy-checkin-….json` trong Downloads) ▸ **Deploy**.
(CLI: `npx wrangler secret put SA_JSON < đường-dẫn/file.json`.) Đừng dán nội dung file này vào chat.

Tuỳ chọn `LT_SECRET`: nếu muốn mã "ghi nhớ máy" dùng chung với bản Apps Script, chép giá trị Script Property `LT_SECRET` của project "B0DY Booking API" vào một secret cùng tên. Không đặt thì Worker tự sinh bí mật riêng (lưu trong DO); đổi qua lại hai máy chủ thì hội viên xác minh lại 4 số một lần.

### 3. Quyền trên Google Sheets

Share file **"[B0DY Studio] Lịch tập tuần"** cho `b0dy-kiosk-api@b0dy-checkin.iam.gserviceaccount.com` quyền **Editor** (Worker ghi tab "Sổ đặt lịch" và "_dữ liệu"). File BA đã share sẵn cho tài khoản này; Worker chỉ đọc BA.

### 4. Biến (đã có sẵn trong `wrangler.jsonc`)

| Biến | Giá trị |
|---|---|
| `BA_ID` | `1QCsIqBHYqqyVYohs9syWt3jT8_wb1JQRbWZp6YF1V14` |
| `OUT_ID` | `16Ccj-W5aigVzC3mSKM8YUFkW--jPV4Sva0hspdDcq30` |
| `ALLOW_ORIGINS` | `https://booking.b0dy.studio` (thêm origin khác, ngăn bằng dấu phẩy) |

Binding: `BOOK` → Durable Object `Booking`. Cron: `* * * * *`.

## Kiểm tra sau khi deploy

1. Mở `https://b0dy-booking-api.<tên-tài-khoản>.workers.dev/` → `{"ok":true,"pong":true,…}`.
2. Từ trang booking.b0dy.studio (Console): `fetch(API,{method:'POST',body:JSON.stringify({action:'lt_boot',dev:'kiemtra0000000001'})}).then(r=>r.json())` → `ok:true, auth:false, week…`. Lỗi `loi_he_thong` + `detail` `thieu_SA_JSON` / `google_auth_400` = secret chưa đúng; `google_403` = file chưa share cho service account.
3. **Logs**: Workers ▸ `b0dy-booking-api` ▸ **Logs** — mỗi lượt một dòng `{a, ok, e, why, ms}`.

## Trang web dùng Worker

- URL: `https://b0dy-booking-api.<tên-tài-khoản>.workers.dev/` (POST, body JSON, `Content-Type: text/plain` để không có preflight — y như Apps Script, nhưng không có bước chuyển hướng 302).
- Phản hồi có header `Server-Timing` (`do;dur=…, total;dur=…`).
- **Chỉ trỏ trang vào MỘT máy chủ một lúc.** Hai máy chủ cùng ghi một sổ thì hàng đợi của DO không thấy lượt ghi của Apps Script trong 3 s đầu.
