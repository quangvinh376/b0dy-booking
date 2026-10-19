# B0DY Booking API · Cloudflare Worker + Durable Object

Máy chủ của trang **booking.b0dy.studio**, thay cho Apps Script để mọi thao tác gần như tức thì.

| Thao tác | Apps Script | Worker này |
|---|---|---|
| Mở trang, tìm tên, xác minh 4 số | 1,5–4 s mỗi lượt | ~0,1 s (đọc từ bộ nhớ của Durable Object) |
| Chốt đặt lịch / đổi buổi | 3–5 s, khoá 28 s khi đông | **~0,05 s tại DO** (kiểm bằng bộ nhớ + ghi nhật ký trong DO); sổ Google cập nhật trong **~1 s** (đặt ~0,5 s, đổi ~0,8 s) |
| 30 người bấm cùng lúc lúc 06:00 | xếp hàng từng người | trả lời tức thì, gom thành 1–2 lệnh ghi, không bao giờ quá sức chứa (4 suất coach/khung), không coach nào hai suất một khung |
| Google chậm / lỗi khi ghi | báo lỗi, hội viên bấm lại | vẫn nhận đặt lịch; nhật ký tự ghi lên sổ khi Google ổn lại |

**Hợp đồng API giống hệt `backend/LichTuan.gs`** (`lt_ping` · `lt_boot` · `lt_find` · `lt_verify` · `lt_book` · `lt_change` · `lt_invite` · `lt_decline`, cùng trường, cùng mã lỗi; riêng `lt_ping` có thêm 4 trường tình trạng, xem dưới). Trang web chỉ đổi một hằng số URL. Sổ **"Sổ đặt lịch"** trên Google Sheets vẫn là nguồn sự thật: anh sửa tay vẫn được, và Apps Script vẫn dùng lại được làm đường lùi (dòng ghi ra giống hệt từng ô).

## Cách chạy

- **Durable Object `Booking`** (SQLite, một bản duy nhất, đặt ở châu Á – Thái Bình Dương) giữ trong RAM: hội viên (MEMBERS), tập thử (TRIAL), ngày đóng cửa (B0B), sức chứa (⚙️ 2), điểm danh (3 cột SESSION LOG), lịch nhận khách của coach (tab "Lịch coach" của file Lịch tập tuần, đọc cùng lượt với BA) và sổ đặt lịch. Lượt **xem** trả ngay từ bộ nhớ rồi làm mới ngầm (BA 30 s · điểm danh 60 s · sổ 15 s). **Cron mỗi phút** giữ BA + sổ không cũ quá 1 phút. Ảnh chụp được lưu vào storage của DO, nên DO bị dọn khỏi RAM thì lần sau vẫn trả lời ngay.
- Lượt **ghi** (đặt / đổi) **không đợi Google**: xếp hàng trong DO → kiểm từng lượt theo thứ tự đến bằng đúng luật của Apps Script, trên bộ nhớ (sổ = bản sheet ⊕ nhật ký, nên lượt sau thấy chỗ lượt trước vừa giữ) → lưu **một mục nhật ký** vào storage của DO → trả lời. Lưu storage lỗi → trả `he_thong_ban`, bộ nhớ trả lại như cũ.
- **flush** chạy ngầm sau ~150 ms: gom mọi mục đang chờ thành **một** lệnh `spreadsheets.batchUpdate` (tất cả hoặc không). Đổi buổi thì đọc sổ ngay trước khi ghi để sửa đúng dòng (tìm dòng theo mã phiếu + mã KH + ngày + giờ, không tin số dòng cũ).
- **Không bao giờ ghi trùng.** Mỗi mục mang mã yêu cầu (rid) của trình duyệt. Lần gửi trước không rõ kết quả (đứt mạng, hết giờ, 5xx, DO bị tắt giữa chừng) → lần sau đọc sổ trước, mục nào đã có rid trên sheet thì bỏ qua.
- Đợi quá 25 s chưa tới lượt kiểm → `he_thong_ban` (như `tryLock` của Apps Script).
- **Sức chứa tính theo suất coach** (`core.js` · `roomOf` / `coachAt` = `LichTuan.gs` · `ltRoom_` / `ltCoachAt_`, từ 18/10): mỗi coach mỗi khung
  một suất — một khách 1:1, hoặc một nhóm 1:2 (tối đa 2 khách gói 1:2 của cùng coach). Phòng tối đa `Sức chứa` suất (⚙️ 2, ô C27 — 5 từ 18/10):
  5 khách 1:1, 10 khách 1:2, hay 4 khách 1:1 + một cặp 1:2 đều là đầy. Khách 1:2 vào nhóm 1:2 có sẵn của coach mình không tốn suất (phòng đầy vẫn vào
  được); coach đã có suất ở khung đó với người khác → `coach_ban` (trả `het_cho` như phòng đầy). Khách tập thử đã có "Coach tiếp nhận"
  (TRIAL) chiếm suất của coach đó như một khách 1:1 (`trialsFrom` = `ltTrials_` trả `{khung: [coach, …]}`, chốt 18/10); tập thử chưa
  giao coach và dòng sổ không có coach: mỗi người một suất riêng. State có `coachAt: {"yyyy-MM-dd|h": "busy" | "join"}` — chỉ về coach của chính hội viên, không lộ ai đặt.
- **Lịch coach + Chủ Nhật** (1.1.0, chủ studio chốt 19/10; `core.js` · `schedFrom` / `offAt` = `LichTuan.gs` · `ltSchedFrom_` / `ltOffAt_`):
  tuần 7 ngày T2–CN (`LT.NDAYS` 7). Tab `LT.SCHED` "Lịch coach": hàng có đủ 7 nhãn T2…CN là đầu khối, ô có chữ gần nhất bên trái là
  tên coach (so như cột Coach của BA), các hàng dưới cùng cột là giờ, ô tick = nhận khách. Coach không có khối → T2–T7 đủ giờ, CN nghỉ
  (= trước 1.1.0). Khung coach không nhận → `why` `coach_nghi` (sau `het_han`, trước `gio_ghep`); state `coachAt` thêm `"off"`. Chỉ chặn
  lượt đặt / đổi mới — buổi đã đặt vẫn giữ. Tên tab dò trong meta (`META_FMT` 2): DO mang meta dạng cũ trả lời bằng meta cũ và dò lại
  ngầm; chưa có tab thì dò lại sau `META_RECHECK` (5 phút), mỗi lần thử cách nhau ≥ `META_TRY` (30 s) — Google lỗi không làm hỏng lượt xem.
  Trang 1.1.0 vẫn chạy với máy chủ cũ (tuần 6 ngày → cột CN cố định như cũ); trang cũ gặp máy chủ mới thì vẽ thừa cột → **đưa trang lên
  trước, deploy Worker sau**.
- **Kênh live** (1.2.0, chủ studio duyệt 19/10 "mức 1"; `src/live.js`): trang mở WebSocket `GET /live?dev=<mã máy>` (Worker kiểm
  origin như `ALLOW_ORIGINS` + mã máy đúng dạng, rồi chuyển nguyên request cho DO). DO dùng **WebSocket Hibernation API**
  (`acceptWebSocket`, `'ping'` → `'pong'` tự trả không đánh thức DO) và chỉ gửi `{t:'hi'|'bump', r}` / `{t:'n', n}` — **không có dữ
  liệu hội viên**: `bump` = phòng vừa đổi → trang tự gọi `lt_boot` (luật ai thấy gì giữ nguyên); `n` = số mã máy đang mở trang.
  BookingCore báo (`deps.notify`) khi một lượt đặt / đổi / mời / từ chối được nhận (ngay, trước khi lên sheet) và khi sổ / BA đọc lại
  khác lần trước (dấu FNV của các dòng tuần đang đặt · ngày nghỉ · sức chứa · Lịch coach · TRIAL) — sửa tay trên sheet tới trang trong
  ≤ 1 phút (cron). Gom 150 ms (bump) / 600 ms (đếm), tối đa 400 kết nối (quá → 503, trang lui về hỏi 2 phút một lần). Trang: chỉ nối khi
  tab đang hiện, nối lại lui 1 · 3 · 8 · 20 s, hỏng 4 lần liền (Worker cũ không có `/live`) thì thôi. Apps Script không có kênh này.
- **Ghép lớp 1:2** (chủ studio chốt 18/10 14:13; `core.js` · `duoState` / `pairMove` / `checkInvite` / `checkDecline` = `LichTuan.gs` ·
  `ltDuoState_` / `ltPairMove_` / `ltCheckInvite_` / `ltCheckDecline_`, parity so từng phản hồi):
  - Gói 1:2 chỉ đặt ở **khung ghép** `LT.DUO_HOURS` = 09 · 11 · 15 · 17 · 19 (giờ khác → `khong_hop_le` / `gio_ghep`).
  - Dời một buổi **đang lẻ** vào khung có đúng một khách 1:2 cùng coach đang chờ = **"Ghép"**: không tính lượt đổi, được khi đã hết
    lượt, được trong cùng ngày (dòng mới "Ghép từ …", dòng cũ "Ghép sang …"). Rời một cặp tính "Đổi" như thường.
  - **Lời mời / từ chối là dòng sổ** (Trạng thái + Thao tác "Mời" / "Từ chối", không đổi bản phiếu): `lt_invite {tok, dev, rid, week,
    date, h, to: id | ''}` (id như `lt_find`; `''` = huỷ) · `lt_decline {tok, dev, rid, week, date, h}`. Mời lại đúng người / từ chối hai
    lần = không ghi. Lời mời chỉ sống khi ghi sau lượt đặt hiện tại của người mời và người được mời chưa vào khung đó sau lời mời.
    Tối đa 20 dòng mời + từ chối / hội viên / tuần (`qua_luot_moi`). Bảng lịch tập lọc "Đã đặt" nên không hiện các dòng này.
  - State của khách 1:2 thêm `duo: {duoHours, wait, pairs, invOut, invIn, peers}` — chỉ **tên gọi** của khách 1:2 cùng coach, `peers`
    mang id (HMAC), không bao giờ có Mã KH / SĐT. Khách 1:1 không có `duo`.
- **Bản phiếu (`base`)**: `lt_book` / `lt_change` gửi kèm bản phiếu trang đang xem (`mine.ver`). Sổ đã lên bản khác → `ban_cu`, không ghi gì (kèm state mới nhất). Chặn trường hợp một lệnh mất phản hồi đã vào sổ rồi khách gửi thêm lựa chọn khác (thành thêm buổi ngoài ý muốn) hoặc một lệnh đổi cũ tới sau. Kiểm trùng `rid` chạy trước nên gửi lại đúng lệnh cũ vẫn ra `dup`. Không gửi `base` thì không kiểm (máy khách cũ). Apps Script (`ltLocked_`) kiểm y hệt.
- Lỗi theo khung (`khong_hop_le` kèm `why` của một khung cụ thể) trả thêm `date` + `h` để trang gọi đúng tên khung.
- Bộ đếm tìm tên / sai mã / khoá máy / khoá tên nằm trong storage của DO, cùng ngưỡng với Apps Script.
- Nhật ký (Observability) chỉ có tên lệnh, mã lỗi, thời gian, số mục — không có body (mã nhớ máy, 4 số cuối), không có tên hay SĐT.

## Nhật ký ghi sau (journal)

| | |
|---|---|
| Mục nhật ký | khoá `j:000000000042` trong storage của DO: `{seq, rid, kind, at, appends: [dòng 17 cột], moves: [dòng cũ → "Đã đổi" + ghi chú]}` |
| Khi nào trả lời | **sau khi** mục đã nằm bền trong storage (DO tắt ngay sau đó cũng không mất) |
| Khi nào lên sổ | ~150 ms sau lượt ghi (gom các lượt gần nhau) — 1 lệnh ghi, đổi buổi thêm 1 lượt đọc |
| Lỗi khi ghi | giữ nguyên mục, **alarm** của DO thử lại sau 1 → 2 → 5 → 15 → 30 → 60 s (rồi mỗi 60 s). Lệnh ghi bị hết giờ (Google có thể vẫn đang xử lý) → đợi ít nhất 60 s mới đọc lại + gửi lại |
| DO bị dọn khỏi RAM / khởi động lại | lần thức sau nạp lại nhật ký, đọc sổ, ghi nốt (alarm tự đánh thức DO, cron mỗi phút là lớp dự phòng thứ hai) |
| Sau khi lên sổ | xoá khoá `j:`; mục vẫn được "phủ" lên các lượt đọc sổ bắt đầu trước lúc ghi xong (ít nhất 120 s) → một lượt đọc chậm không bao giờ làm mất chỗ đã xác nhận |
| Anh xoá / sửa tay dòng cũ trước khi lượt đổi kịp ghi | bỏ phần "Đã đổi" của dòng đó (cảnh báo `move_target_missing` trong Logs), dòng mới vẫn được thêm, hàng đợi không kẹt |
| Khách tập thử đặt ở nơi khác đúng lúc đó | lượt đã nhận vẫn giữ; nếu khung vượt sức chứa (đếm suất coach) → cảnh báo `over_cap_after_trial` trong Logs |
| Deploy mã mới khi DO còn ảnh chụp sổ dạng cũ | ảnh chụp mang số dạng (`fmt`, hiện 2 = dòng có coach + loại gói); khác dạng → bỏ, đọc sổ mới từ Google trước lượt đầu |

**`lt_ping`** (không cần đăng nhập) trả thêm tình trạng nhật ký, không có dữ liệu cá nhân:

```json
{"ok": true, "now": 1792281600000, "pending": 0, "oldestMs": 0, "lastFlushAt": 1792281599123, "lastError": ""}
```

`pending` = số lượt đã nhận mà sổ chưa có · `oldestMs` = lượt cũ nhất đã chờ bao lâu · `lastFlushAt` = lần ghi sổ thành công gần nhất · `lastError` = lỗi Google hiện tại (rỗng khi ổn).

### Khi Google có sự cố

| Sự cố | Hội viên thấy | Sổ Google |
|---|---|---|
| Ghi chậm, 500, đứt mạng, hết giờ | đặt / đổi bình thường | tự cập nhật khi lần thử lại thành công, không trùng dòng |
| File "Lịch tập tuần" chỉ share quyền xem (403) | đặt / đổi bình thường, sức chứa vẫn giữ đúng | chưa cập nhật; `lt_ping` báo `pending` + `google_403` → share lại quyền Editor là sổ tự ghi nốt |
| Google sập hẳn | trong 15 phút đầu vẫn đặt được: dữ liệu hội viên bình thường phải ≤ 90 s, nhưng khi Google lỗi đúng lúc cần làm mới thì dùng bản đang có (≤ 15 phút, nhật ký vận hành ghi `dung_ban_cu`; lỗi trong 20 s gần nhất thì không đợi Google lần nữa). Quá 15 phút → lượt đặt mới báo `loi_he_thong`. Lượt đã nhận vẫn an toàn trong nhật ký | ghi nốt khi Google trở lại |

## Tệp

| Tệp | Vai trò |
|---|---|
| `src/core.js` | Lõi nghiệp vụ, chép 1:1 từ LichTuan.gs (tuần, 24 giờ, giới hạn buổi, đổi lịch, tên, state) + đọc ô Sheets API |
| `src/booking.js` | Durable Object: bộ nhớ đệm, hàng đợi kiểm, nhật ký ghi sau + flush, các lệnh API, alarm, cron |
| `src/sheets.js` | Google Sheets API (JWT service account bằng WebCrypto, timeout, luật thử lại) |
| `src/crypto.js` | Mã nhớ máy + mã hội viên (HMAC, giống hệt Apps Script) |
| `src/http.js` · `src/index.js` | CORS, giới hạn body 8 KB, gọi DO qua RPC, cron, alarm · cổng kênh live (`liveGate`) + sự kiện WebSocket của DO |
| `src/live.js` | Kênh live: nhận / đếm kết nối theo mã máy, gom tin `bump` / `n`, giới hạn kết nối |
| `test/*.mjs` | `node test/run_all.mjs` — parity với Apps Script, đồng thời + tốc độ, lỗi ghi / DO khởi động lại / đọc chạy đua, HTTP, dữ liệu thật (chỉ chạy khi có bản xuất cục bộ, không nằm trong repo), workerd (chỉ chạy khi đã `npm i`) |

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

Share file **"[B0DY Studio] Lịch tập tuần"** cho `b0dy-kiosk-api@b0dy-checkin.iam.gserviceaccount.com` quyền **Editor** (Worker ghi tab "Sổ đặt lịch" và "_dữ liệu", đọc tab "Lịch coach"). File BA đã share sẵn cho tài khoản này; Worker chỉ đọc BA.

### 4. Biến (đã có sẵn trong `wrangler.jsonc`)

| Biến | Giá trị |
|---|---|
| `BA_ID` | `1QCsIqBHYqqyVYohs9syWt3jT8_wb1JQRbWZp6YF1V14` |
| `OUT_ID` | `16Ccj-W5aigVzC3mSKM8YUFkW--jPV4Sva0hspdDcq30` |
| `ALLOW_ORIGINS` | `https://booking.b0dy.studio` (thêm origin khác, ngăn bằng dấu phẩy) |

Binding: `BOOK` → Durable Object `Booking`. Cron: `* * * * *`. Alarm của DO không cần cấu hình gì thêm.

## Kiểm tra sau khi deploy

1. Mở `https://b0dy-booking-api.<tên-tài-khoản>.workers.dev/` → `{"ok":true,"pong":true,…}`.
2. Từ trang booking.b0dy.studio (Console): `fetch(API,{method:'POST',body:JSON.stringify({action:'lt_boot',dev:'kiemtra0000000001'})}).then(r=>r.json())` → `ok:true, auth:false, week…`. Lỗi `loi_he_thong` + `detail` `thieu_SA_JSON` / `google_auth_400` = secret chưa đúng; `google_403` = file chưa share cho service account.
3. `fetch(API,{method:'POST',body:'{"action":"lt_ping"}'}).then(r=>r.json())` → `pending: 0, lastError: ""`. Sau một lượt đặt thử, `lastFlushAt` phải tăng và dòng xuất hiện trong "Sổ đặt lịch" trong khoảng 1 s.
4. **Kênh live** (Console của tab booking.b0dy.studio): `w=new WebSocket(API.replace('https','wss')+'live?dev=kiemtra0000000001');w.onmessage=e=>console.log(e.data)` → `{"t":"hi","r":0,"n":1}`; mở thêm tab trang → `{"t":"n","n":2}`.
5. **Logs**: Workers ▸ `b0dy-booking-api` ▸ **Logs** — mỗi lượt gọi một dòng `{a, ok, e, why, ms}`; mỗi lần ghi sổ một dòng `{a:"flush", ok, n, rows, read, ms}` (lỗi: `{a:"flush", ok:false, e, retryMs}`).

## Trang web dùng Worker

- URL: `https://b0dy-booking-api.<tên-tài-khoản>.workers.dev/` (POST, body JSON, `Content-Type: text/plain` để không có preflight — y như Apps Script, nhưng không có bước chuyển hướng 302).
- Phản hồi có header `Server-Timing` (`do;dur=…, total;dur=…`).
- **Chỉ trỏ trang vào MỘT máy chủ một lúc.** DO không thấy lượt ghi của Apps Script cho tới lần đọc sổ kế tiếp (≤ 15 s – 1 phút), nên hai máy chủ cùng nhận đặt có thể vượt sức chứa.
