# Backend — Hải Đăng Sức Khỏe

Backend Node.js/Express, lưu dữ liệu **bền vững** bằng MongoDB (không còn mất dữ liệu khi server restart/ngủ/deploy lại như bản cũ). Khớp 100% với các API mà frontend (`index_10.html`) đang gọi.

## 1. Tạo database miễn phí (MongoDB Atlas) — làm 1 lần

1. Vào https://www.mongodb.com/cloud/atlas/register, tạo tài khoản miễn phí.
2. Tạo **cluster miễn phí** (gói M0 — 512MB, đủ dùng lâu dài cho quy mô 1 cơ sở y tế).
3. Ở mục **Database Access**: tạo 1 user (ví dụ `haidang-app`) + mật khẩu, quyền `Read and write to any database`.
4. Ở mục **Network Access**: bấm **Allow Access From Anywhere** (`0.0.0.0/0`) — vì Render dùng IP động.
5. Ở mục **Database > Connect > Drivers**: copy connection string dạng:
   ```
   mongodb+srv://haidang-app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Thêm tên database vào sau dấu `/` (trước dấu `?`), ví dụ `.../haidang?retryWrites=true...`.

## 2. Cấu hình biến môi trường

Copy `.env.example` thành `.env` (chạy local) hoặc nhập trực tiếp vào phần **Environment** trên Render:

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `MONGODB_URI` | ✅ | Connection string ở bước 1 |
| `JWT_SECRET` | ✅ | Chuỗi ngẫu nhiên, dài, giữ bí mật |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Khuyến nghị | Tài khoản quản trị viên đầu tiên, tự tạo khi server khởi động lần đầu nếu **chưa có admin nào** trong DB. Đổi mật khẩu ngay sau khi đăng nhập lần đầu. |
| `ANTHROPIC_API_KEY` | Tuỳ chọn | Bật tính năng chat AI tư vấn sức khỏe. Không có thì phần còn lại của app vẫn chạy bình thường, chỉ riêng tab Chat AI báo lỗi rõ ràng. |
| `CORS_ORIGIN` | Tuỳ chọn | Domain frontend được phép gọi API. Để `*` nếu chưa rõ domain cố định. |
| `PORT` | Không cần chỉnh trên Render | Render tự set |

## 3. Chạy thử ở máy local (tuỳ chọn, để kiểm tra trước khi deploy)

```bash
npm install
cp .env.example .env   # rồi điền MONGODB_URI, JWT_SECRET...
npm start
```

Server chạy ở `http://localhost:4000`. Gọi thử: `curl http://localhost:4000/api/health` → phải trả `{"ok":true,...}`.

## 4. Deploy lên Render (hoặc dịch vụ tương tự)

1. Đẩy thư mục `backend/` này lên 1 repo GitHub riêng (hoặc thư mục con trong repo hiện có — nhớ set "Root Directory" đúng khi tạo Web Service).
2. Trên Render: **New > Web Service** → chọn repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Vào tab **Environment**, nhập toàn bộ biến ở bước 2.
4. Deploy. Khi log hiện `✅ Đã kết nối MongoDB thành công` và `🚀 Server đang chạy ở cổng ...` là xong.
5. Frontend hiện đã trỏ sẵn tới `https://hai-dang-suc-khoe.onrender.com` (biến `API_BASE_URL` trong file HTML) — nếu bạn deploy dưới domain Render khác, nhớ sửa lại đúng URL mới trong file HTML.

## 5. Vì sao lần này KHÔNG bị mất dữ liệu nữa

- Toàn bộ dữ liệu (tài khoản, hồ sơ gia đình, khám/thuốc/sinh hiệu, yêu cầu, SOS...) được lưu trong **MongoDB Atlas** — một dịch vụ database nằm **ngoài** vòng đời của server Render. Server có restart/ngủ/deploy lại bao nhiêu lần, dữ liệu trong Atlas vẫn còn nguyên.
- Mỗi request ghi/đọc hồ sơ đều đi qua middleware xác thực (`requireAuth`) để xác định đúng `req.user` từ token, rồi lọc/gắn dữ liệu theo `ownerId` — hồ sơ luôn thuộc đúng tài khoản, không phụ thuộc vào phía client.
- Atlas gói M0 có backup tự động ở mức cơ bản; nếu sau này dữ liệu quan trọng hơn, có thể nâng cấp gói trả phí để có backup định kỳ đầy đủ hơn.

## 6. Danh sách API đã cài đặt (khớp với frontend)

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/family`, `GET /api/family/lookup/:code`, `PATCH/DELETE /api/family/:id`
- `POST/DELETE /api/family/:id/exams(/:examId)`
- `POST/DELETE /api/family/:id/meds(/:medId)`
- `POST /api/family/:id/vitals`
- `POST /api/family/:id/behavior-assessment`
- `POST /api/family/:id/ai-insight`
- `POST /api/requests`, `GET /api/requests`, `PATCH /api/requests/:id`
- `GET /api/admin/users`, `PATCH /api/admin/users/:id`
- `GET/POST /api/supply-proposals`, `PATCH /api/supply-proposals/:id`
- `GET/POST /api/support-requests`, `PATCH /api/support-requests/:id`
- `POST /api/sos`, `PATCH /api/sos/:id/location`, `GET /api/sos/mine`, `PATCH /api/sos/:id/resolve`, `GET /api/sos`, `PATCH /api/sos/:id/status`
- `GET /api/medical/kpi`
- `POST /api/chat` (proxy Claude API cho trợ lý tư vấn sức khỏe)

## 7. Nếu bạn đã có backend cũ đang chạy

Bản backend cũ (lưu RAM) có thể **tắt hẳn và thay bằng bản này** — vì frontend gọi đúng cùng một tập endpoint, không cần sửa gì thêm ở file HTML. Tài khoản người dùng cũ (nếu có) sẽ **không tự chuyển sang được** vì trước đó chưa từng lưu bền vững — mọi người cần đăng ký lại một lần.
