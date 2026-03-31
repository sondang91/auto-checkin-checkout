# 🕐 Auto Checkin-Checkout

> Hệ thống tự động chấm công check-in / check-out trên Odoo HR Attendance, tích hợp quản lý ngày lễ và ngày nghỉ phép.

## ✨ Tính năng

### 🤖 Tự động hóa
- **Auto Check-in / Check-out** — Chạy theo lịch cấu hình, hỗ trợ delay ngẫu nhiên để trông tự nhiên
- **Bỏ qua cuối tuần** — Chỉ chạy vào ngày làm việc được cấu hình (mặc định T2–T6)
- **Bỏ qua ngày lễ** — Tích hợp ngày lễ từ Odoo (`hr.public.holiday`) qua JSON-RPC
- **Bỏ qua ngày nghỉ phép** — Hỗ trợ thêm ngày nghỉ thủ công từ dashboard

### 🎌 Quản lý Ngày Lễ (Public Holidays)
- Đồng bộ từ Odoo (`hr.public.holiday`), cache Redis 24h
- **Thêm ngày lễ thủ công** khi Odoo chưa có dữ liệu đầy đủ
- Phân biệt nguồn: **🔗 Odoo** (chỉ đọc) vs **✏️ Thủ công** (có thể xóa)
- Nút "Làm mới từ Odoo" để cập nhật cache
- Lấy dữ liệu 3 năm: năm trước, năm hiện tại, năm sau

### 🗓 Quản lý Ngày Nghỉ Phép (Leave Days)
- Thêm/xóa ngày nghỉ thủ công từ dashboard
- Lưu trữ trong Redis (không mất khi restart)
- Hiển thị banner cảnh báo nếu hôm nay là ngày nghỉ

### 📋 Dashboard
- Giao diện dark-mode hiện đại, responsive
- Xem lịch sử thực thi (check-in/out/skip/error)
- Thống kê tỷ lệ thành công
- Test kết nối Odoo / SMTP Email
- Override thủ công: trigger check-in/out ngay lập tức
- Button check-in/out **tự động vô hiệu hóa** vào ngày lễ và ngày nghỉ

### 📧 Thông báo Email
- Gửi email mỗi lần check-in/out thành công (tùy chọn)
- Hỗ trợ SMTP (Gmail, Outlook, ...)

---

## 🚀 Quick Start

```bash
# 1. Cài dependencies
npm install

# 2. Tạo file môi trường
cp .env.example .env.local

# 3. Điền thông tin vào .env.local (xem bảng bên dưới)

# 4. Chạy local
npm run dev
```

Truy cập **http://localhost:3000** để vào dashboard.

---

## ⚙️ Cấu hình Environment Variables

### Odoo

| Variable | Mô tả | Ví dụ |
|----------|--------|-------|
| `ODOO_URL` | URL Odoo server | `https://your-company.hr24.vn` |
| `ODOO_USERNAME` | Email đăng nhập Odoo | `user@company.com` |
| `ODOO_PASSWORD` | Mật khẩu Odoo | `your_password` |
| `ODOO_DATABASE` | Tên database (để trống = auto-detect) | `your_db` |

### Lịch làm việc

| Variable | Mô tả | Mặc định |
|----------|--------|---------|
| `CHECKIN_TIME` | Giờ check-in (HH:mm) | `08:30` |
| `CHECKOUT_TIME` | Giờ check-out (HH:mm) | `17:30` |
| `TIMEZONE` | Múi giờ | `Asia/Ho_Chi_Minh` |
| `WORKING_DAYS` | Ngày làm việc (1=T2 … 7=CN) | `1,2,3,4,5` |
| `RANDOM_DELAY_MAX` | Delay ngẫu nhiên tối đa (giây) | `300` |

### Redis (Upstash)

| Variable | Mô tả |
|----------|--------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |

> **Lưu ý**: Redis là bắt buộc để lưu cấu hình, logs, ngày lễ và ngày nghỉ. Đăng ký miễn phí tại [upstash.com](https://upstash.com).

### Email (tùy chọn)

| Variable | Mô tả | Ví dụ |
|----------|--------|-------|
| `EMAIL_ENABLED` | Bật thông báo email | `true` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `your@gmail.com` |
| `SMTP_PASSWORD` | App password | |
| `EMAIL_TO` | Địa chỉ nhận | `notify@company.com` |

### Bảo mật

| Variable | Mô tả |
|----------|--------|
| `CRON_SECRET` | Secret key xác thực cron trigger |

---

## 📡 API Endpoints

### Hệ thống

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/config` | Xem cấu hình hiện tại |
| `POST` | `/api/config` | Cập nhật cấu hình override |
| `DELETE` | `/api/config` | Reset về cấu hình môi trường |

### Trigger & Logs

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `POST` | `/api/trigger` | Trigger thủ công `{ action: 'checkin'\|'checkout', secret }` |
| `GET` | `/api/logs` | Lấy lịch sử thực thi |
| `DELETE` | `/api/logs` | Xóa lịch sử |
| `POST` | `/api/test` | Test kết nối Odoo / Email |

### Cron Jobs

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/cron/checkin` | Vercel Cron check-in (hoặc external cron) |
| `GET` | `/api/cron/checkout` | Vercel Cron check-out (hoặc external cron) |

### Ngày Lễ (Public Holidays)

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/holidays` | Lấy tất cả ngày lễ (Odoo + thủ công) |
| `POST` | `/api/holidays` | Thêm ngày lễ thủ công `{ name, date_from, date_to? }` |
| `DELETE` | `/api/holidays` | Nếu có `{ id }` → xóa ngày lễ thủ công; không có `id` → clear Odoo cache |

### Ngày Nghỉ Phép (Leave Days)

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/leaves` | Lấy danh sách ngày nghỉ thủ công |
| `POST` | `/api/leaves` | Thêm ngày nghỉ `{ date: 'YYYY-MM-DD', reason }` |
| `DELETE` | `/api/leaves` | Xóa ngày nghỉ `{ id }` |

---

## 🧠 Logic Skip Check-in/out

Khi cron trigger (hoặc gọi thủ công), hệ thống kiểm tra theo thứ tự:

```
1. Automation bị tắt?           → skip
2. Thiếu credentials Odoo?      → skip
3. Không phải ngày làm việc?    → skip  (cuối tuần, ...)
4. Là ngày lễ quốc gia?         → skip  (Odoo hoặc thủ công)
5. Là ngày nghỉ phép thủ công?  → skip
6. ✅ Thực hiện check-in/out
```

> Cron job có thể được set chạy **mỗi ngày** — các guard trên đảm bảo hệ thống bỏ qua an toàn mà không cần config thủ công lịch bỏ qua.

---

## 🗄️ Redis Storage Keys

| Key | Nội dung | TTL |
|-----|----------|-----|
| `auto_checkin:config` | Config override | Không hết hạn |
| `auto_checkin:logs` | Lịch sử thực thi | Không hết hạn |
| `auto_checkin:public_holidays` | Cache ngày lễ từ Odoo | 24 giờ |
| `auto_checkin:custom_holidays` | Ngày lễ thêm thủ công | Không hết hạn |
| `auto_checkin:leave_days` | Ngày nghỉ phép thủ công | Không hết hạn |

---

## 🚢 Deploy lên Vercel

1. Push code lên GitHub
2. Import project vào [Vercel](https://vercel.com)
3. Thêm tất cả Environmental Variables trên Vercel Dashboard
4. Vercel Cron Jobs sẽ tự động chạy theo `vercel.json`

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/checkin",  "schedule": "0 0 * * *" },
    { "path": "/api/cron/checkout", "schedule": "0 9 * * *" }
  ]
}
```

> **Lưu ý**: Vercel Hobby plan giới hạn cron chạy **1 lần/ngày**. Để chạy theo giờ chính xác, dùng external cron ([cron-job.org](https://cron-job.org)) gọi `/api/trigger` với `CRON_SECRET`.

---

## 🗂️ Cấu trúc project

```
src/
├── app/
│   ├── page.tsx                    # Dashboard UI
│   └── api/
│       ├── config/                 # Cấu hình
│       ├── trigger/                # Trigger thủ công
│       ├── cron/checkin|checkout/  # Cron endpoints
│       ├── logs/                   # Lịch sử
│       ├── holidays/               # Ngày lễ (Odoo + thủ công)
│       ├── leaves/                 # Ngày nghỉ phép
│       └── test/                   # Test kết nối
└── lib/
    ├── automation/
    │   ├── odoo-client.ts          # Odoo JSON-RPC client
    │   ├── scheduler.ts            # Logic thực thi, guards
    │   └── selectors.ts            # CSS selectors (legacy)
    ├── config.ts                   # Đọc config từ env + Redis
    ├── storage.ts                  # Redis: logs, leaves, custom holidays
    └── email.ts                    # SMTP email notification
```

---

## 🛠️ Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | Next.js (App Router) + React |
| Styling | Vanilla CSS (dark mode, glassmorphism) |
| Odoo API | JSON-RPC (`/web/dataset/call_kw`) |
| Storage | Upstash Redis (REST API) |
| Scheduling | Vercel Cron / External cron-job.org |
| Email | Nodemailer (SMTP) |
| Deploy | Vercel (Serverless) |

---

## 📝 License

MIT
