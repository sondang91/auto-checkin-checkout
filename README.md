# Auto Checkin-Checkout

> 🕐 Tự động chấm công check-in / check-out trên hệ thống Odoo theo thời gian cấu hình.

## Tính năng

- ⏰ **Auto Check-in/Check-out** — Tự động chấm công theo giờ cấu hình
- 🔌 **Odoo JSON-RPC** — Kết nối trực tiếp tới Odoo API, không cần browser
- 📧 **Email Notification** — Thông báo qua email mỗi lần checkin/checkout
- 📋 **Dashboard** — Giao diện quản lý, xem lịch sử, test kết nối
- 🚀 **Vercel Deploy** — Deploy lên Vercel với Cron Jobs tự động

## Quick Start

```bash
# 1. Install
pnpm install

# 2. Copy env
cp .env.example .env

# 3. Edit .env — điền thông tin Odoo + Email

# 4. Run
pnpm dev
```

Mở http://localhost:3000 để truy cập dashboard.

## Cấu hình (.env)

| Variable | Mô tả | Ví dụ |
|----------|--------|-------|
| `ODOO_URL` | URL Odoo web | `https://arent.hr24.vn` |
| `ODOO_USERNAME` | Email đăng nhập | `your@email.com` |
| `ODOO_PASSWORD` | Mật khẩu | `your_password` |
| `ODOO_DATABASE` | Tên database (để trống nếu auto) | |
| `CHECKIN_TIME` | Giờ check-in (HH:mm) | `08:30` |
| `CHECKOUT_TIME` | Giờ check-out (HH:mm) | `17:30` |
| `TIMEZONE` | Múi giờ | `Asia/Ho_Chi_Minh` |
| `WORKING_DAYS` | Ngày làm việc (1=T2..7=CN) | `1,2,3,4,5` |
| `EMAIL_ENABLED` | Bật thông báo email | `true` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | |
| `SMTP_PASSWORD` | SMTP password/app password | |
| `EMAIL_TO` | Email nhận thông báo | |
| `CRON_SECRET` | Secret key cho API trigger | |

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/api/trigger` | Trigger check-in/out (body: `{action, secret}`) |
| GET | `/api/config` | Xem cấu hình hiện tại |
| GET | `/api/logs` | Xem lịch sử thực hiện |
| DELETE | `/api/logs` | Xóa lịch sử |
| POST | `/api/test` | Test kết nối Odoo / Email |
| GET | `/api/cron/checkin` | Vercel Cron check-in endpoint |
| GET | `/api/cron/checkout` | Vercel Cron check-out endpoint |

## Deploy lên Vercel

1. Push repo lên GitHub
2. Import vào Vercel
3. Thêm Environment Variables trên Vercel Dashboard
4. Vercel Cron Jobs sẽ tự động chạy theo `vercel.json`

> **Lưu ý**: Vercel Cron Jobs trên Hobby plan giới hạn 2 jobs/ngày. Upgrade Pro plan để chạy chính xác theo giờ, hoặc dùng external cron service (cron-job.org) gọi `/api/trigger`.

## Tech Stack

- **Next.js 16** + React 19
- **Odoo JSON-RPC API** — Không cần browser/Playwright
- **Nodemailer** — SMTP email
- **TailwindCSS v4** — Styling
- **Vercel Cron** — Scheduling
