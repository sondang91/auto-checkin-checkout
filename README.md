# 🕐 Auto Checkin-Checkout

> Hệ thống tự động chấm công check-in / check-out trên Odoo HR Attendance, tích hợp báo cáo ngày từ Google Sheet lên Odoo project.task, cùng quản lý ngày lễ và ngày nghỉ phép.

## ✨ Tính năng

### 🤖 Tự động hóa
- **Auto Check-in / Check-out** — Chạy theo lịch cấu hình, hỗ trợ delay ngẫu nhiên
- **Auto Daily Report** — Sau checkout thành công, tự động đọc nội dung từ Google Sheet và tạo `project.task` trên Odoo
- **Bỏ qua cuối tuần** — Chỉ chạy vào ngày làm việc được cấu hình (mặc định T2–T6)
- **Bỏ qua ngày lễ** — Tích hợp ngày lễ từ Odoo (`hr.public.holiday`) qua JSON-RPC
- **Bỏ qua ngày nghỉ phép** — Hỗ trợ thêm ngày nghỉ thủ công từ dashboard

### 📝 Daily Report (Báo cáo Ngày)
- Đọc nội dung báo cáo từ **Google Sheet** (Service Account JWT)
- Tạo `project.task` trên Odoo với đầy đủ thông tin: tên, mô tả, deadline, tag, planned hours
- Tự động cập nhật cột **Status** trong Google Sheet sau khi gửi thành công
- Guard đầy đủ: bỏ qua ngày lễ, cuối tuần, nghỉ phép — giống check-in/out
- Preview nội dung và trigger thủ công ngay từ dashboard

### 🎌 Quản lý Ngày Lễ (Public Holidays)
- Đồng bộ từ Odoo (`hr.public.holiday`), cache Redis 24h
- **Thêm ngày lễ thủ công** khi Odoo chưa có dữ liệu đầy đủ
- Phân biệt nguồn: **🔗 Odoo** (chỉ đọc) vs **✏️ Thủ công** (có thể xóa)
- Nút "Làm mới từ Odoo" để cập nhật cache

### 🗓 Quản lý Ngày Nghỉ Phép (Leave Days)
- Thêm/xóa ngày nghỉ thủ công từ dashboard
- Lưu trữ trong Redis (không mất khi restart)
- Hiển thị banner cảnh báo nếu hôm nay là ngày nghỉ

### 📋 Dashboard
- Giao diện dark-mode hiện đại, responsive
- Card **Báo cáo Ngày**: xem content Sheet, trạng thái đã gửi, trigger thủ công
- Xem lịch sử thực thi (check-in / check-out / report / skip / error)
- Thống kê tỷ lệ thành công
- Test kết nối Odoo / Email / Google Sheets
- Override thủ công: trigger check-in/out ngay lập tức

### 📧 Thông báo Email
- Gửi email mỗi lần check-in/out/report thành công (tùy chọn)
- Hỗ trợ SMTP (Gmail, Outlook, ...)

---

## 🔄 Flow tổng quát

```
[cron-job.org 8:30]    [cron-job.org 17:30]    [cron-job.org 17:30]
       │                       │                        │
       ▼                       ▼                        ▼
/api/trigger               /api/trigger           /api/cron/report
?action=checkin            ?action=checkout               │
       │                       │                   executeReport()
  executeAction          executeAction                    │
  ('checkin')            ('checkout')         getDailyReport() ← Google Sheet
       │                       │                          │
  ✅ Check-in            ✅ Check-out           OdooClient.createDailyReport()
                                                          │
                                                  ✅ Task Odoo #xxx
                                                          │
                                              markReportSent() → cập nhật Sheet
```

> 3 jobs chạy **song song, độc lập** nhau. Report không phụ thuộc checkout phải thành công.

---

## 🚀 Quick Start

```bash
# 1. Cài dependencies
pnpm install

# 2. Tạo file môi trường
cp .env.example .env.local

# 3. Điền thông tin vào .env.local (xem bảng bên dưới)

# 4. Chạy local
pnpm dev
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

### 📊 Google Sheets (Daily Report)

> **Setup**: Xem hướng dẫn chi tiết ở mục [Cấu hình Google Sheets](#-cấu-hình-google-sheets) bên dưới.

| Variable | Mô tả | Ví dụ |
|----------|--------|-------|
| `GOOGLE_SHEET_ID` | ID của Google Sheet | `1BxiMVs0XRA5nFM...` |
| `GOOGLE_SHEET_NAME` | Tên tab trong sheet | `Daily Report` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email Service Account | `bot@project.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key từ JSON key file | `-----BEGIN PRIVATE KEY-----\n...` |

### 📋 Odoo Daily Report Config

| Variable | Mô tả | Mặc định |
|----------|--------|---------|
| `REPORT_PROJECT_ID` | ID của `project.project` trên Odoo | `230` |
| `REPORT_PLANNED_HOURS` | Số giờ dự kiến của task | `8` |
| `REPORT_COMPANY_ID` | `company_id` context | `1` |
| `REPORT_TAG_ID` | Tag ID gán cho task (0 = không gán) | `5` |
| `REPORT_TASK_NAME` | Prefix tên task (ngày thêm tự động) | `Daily report` |

---

## 📊 Cấu hình Google Sheets

### 1. Tạo Google Sheet

Tạo một Google Sheet với cấu trúc tab **`Daily Report`**:

| A (Date) | B (Description) | C (Status) |
|----------|----------------|------------|
| 2026-06-02 | PM System:\n- Implemented feature X... | _(tự động điền)_ |
| 2026-06-03 | ... | |

- **Cột A**: Ngày theo format `YYYY-MM-DD` hoặc `DD/MM/YYYY`
- **Cột B**: Nội dung báo cáo (hỗ trợ nhiều dòng với `Alt+Enter`)
- **Cột C**: App tự điền `✅ Sent — Task #xxx` sau khi gửi thành công

> ⚠️ Format cột A: vào **Format → Number → Plain text** để tránh Google tự convert.

### 2. Tạo Google Cloud Service Account

```
1. Vào https://console.cloud.google.com → New Project
2. APIs & Services → Library → Enable "Google Sheets API"
3. APIs & Services → Credentials → Create Credentials → Service Account
4. Tab Keys → Add Key → Create new key → JSON → Download
5. Mở Google Sheet → Share → paste client_email → Editor
```

### 3. Điền env vars từ file JSON key

```
GOOGLE_SERVICE_ACCOUNT_EMAIL  = "client_email" trong JSON
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "private_key" trong JSON
```

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
| `POST` | `/api/test` | Test kết nối — `{ type: 'odoo'\|'email'\|'sheets' }` |

### Cron Jobs

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/cron/checkin` | Trigger check-in (kèm guard đầy đủ) |
| `GET` | `/api/cron/checkout` | Trigger check-out → tự chain report sau đó |
| `GET` | `/api/cron/report` | Trigger báo cáo độc lập (không cần checkout trước) |

### Daily Report

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/report` | Preview content Sheet hôm nay + trạng thái đã gửi |
| `POST` | `/api/report` | Trigger gửi báo cáo thủ công |

### Ngày Lễ & Nghỉ Phép

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| `GET` | `/api/holidays` | Lấy tất cả ngày lễ (Odoo + thủ công) |
| `POST` | `/api/holidays` | Thêm ngày lễ thủ công `{ name, date_from, date_to? }` |
| `DELETE` | `/api/holidays` | Xóa ngày lễ thủ công hoặc clear Odoo cache |
| `GET` | `/api/leaves` | Lấy danh sách ngày nghỉ thủ công |
| `POST` | `/api/leaves` | Thêm ngày nghỉ `{ date: 'YYYY-MM-DD', reason }` |
| `DELETE` | `/api/leaves` | Xóa ngày nghỉ `{ id }` |

---

## 🧠 Logic Skip (Check-in/out & Report)

Mọi action đều kiểm tra theo thứ tự sau trước khi thực thi:

```
1. Thiếu credentials Odoo?          → failed
2. Không phải ngày làm việc?        → skip  (cuối tuần)
3. Là ngày lễ quốc gia?             → skip  (Odoo hoặc thủ công)
4. Là ngày nghỉ phép thủ công?      → skip
── chỉ với report ─────────────────────────────
5. REPORT_PROJECT_ID chưa config?   → skip
6. Sheet không có content hôm nay?  → skip
── ─────────────────────────────────────────────
7. ✅ Thực hiện action
```

> Cron job chạy **mỗi ngày** — các guard đảm bảo bỏ qua an toàn vào ngày lễ/nghỉ mà không cần config thêm.

---

## 🗄️ Redis Storage Keys

| Key | Nội dung | TTL |
|-----|----------|-----|
| `auto_checkin:config_overrides` | Config override từ dashboard | Không hết hạn |
| `auto_checkin:logs` | Lịch sử thực thi (check-in/out/report) | Không hết hạn |
| `auto_checkin:public_holidays` | Cache ngày lễ từ Odoo | 24 giờ |
| `auto_checkin:custom_holidays` | Ngày lễ thêm thủ công | Không hết hạn |
| `auto_checkin:leave_days` | Ngày nghỉ phép thủ công | Không hết hạn |

---

## 🚢 Deploy lên Vercel

### Bước 1: Push code lên GitHub & Import vào Vercel

```bash
git push origin main
# → Import tại https://vercel.com/new
```

### Bước 2: Thêm Environment Variables trên Vercel Dashboard

Copy tất cả từ `.env.local` lên **Vercel → Project Settings → Environment Variables**:

**Bắt buộc:**
```
ODOO_URL, ODOO_USERNAME, ODOO_PASSWORD, ODOO_DATABASE
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
CRON_SECRET
```

**Daily Report (nếu dùng):**
```
GOOGLE_SHEET_ID, GOOGLE_SHEET_NAME
GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
REPORT_PROJECT_ID, REPORT_PLANNED_HOURS, REPORT_COMPANY_ID
REPORT_TAG_ID, REPORT_TASK_NAME
```

### Bước 3: Cấu hình cron-job.org

Project này dùng [cron-job.org](https://cron-job.org) làm external cron (không dùng Vercel Cron).
Tạo **3 jobs** với cấu hình sau:

| # | Title | URL | Crontab | Timezone |
|---|-------|-----|---------|----------|
| 1 | Auto Check-in | `https://your-app.vercel.app/api/trigger?action=checkin` | `30 1 * * 1-5` | UTC |
| 2 | Auto Check-out | `https://your-app.vercel.app/api/trigger?action=checkout` | `30 10 * * 1-5` | UTC |
| 3 | Trigger Create Daily Report | `https://your-app.vercel.app/api/cron/report` | `30 10 * * 1-5` | UTC |

> **Lưu ý timezone**: cron-job.org mặc định UTC. `01:30 UTC = 08:30 VN`, `10:30 UTC = 17:30 VN`.

#### Cấu hình Header xác thực (tab Advanced)

Cả 3 jobs đều cần thêm header sau trong tab **Advanced → Headers**:

| Key | Value |
|-----|-------|
| `Authorization` | `Bearer <CRON_SECRET>` |

Thay `<CRON_SECRET>` bằng giá trị `CRON_SECRET` trong Vercel env của bạn.

> ⚠️ **Bảo mật**: Dùng Authorization header thay vì `?secret=` trong URL để tránh secret bị lộ trong server logs.

---

## 🗂️ Cấu trúc project

```
src/
├── app/
│   ├── page.tsx                    # Dashboard UI (dark mode)
│   └── api/
│       ├── config/                 # Cấu hình
│       ├── trigger/                # Trigger thủ công
│       ├── cron/
│       │   ├── checkin/            # Cron check-in
│       │   ├── checkout/           # Cron check-out + chain report
│       │   └── report/             # Cron report độc lập
│       ├── report/                 # Preview & manual trigger report
│       ├── logs/                   # Lịch sử thực thi
│       ├── holidays/               # Ngày lễ (Odoo + thủ công)
│       ├── leaves/                 # Ngày nghỉ phép
│       └── test/                   # Test kết nối (Odoo/Email/Sheets)
└── lib/
    ├── automation/
    │   ├── odoo-client.ts          # Odoo JSON-RPC client + createDailyReport
    │   └── scheduler.ts            # executeAction / executeReport / guards
    ├── google-sheets.ts            # Google Sheets JWT client
    ├── config.ts                   # Đọc config từ env + Redis
    ├── storage.ts                  # Redis: logs, leaves, custom holidays
    ├── redis.ts                    # Upstash Redis singleton
    └── email.ts                    # SMTP email notification
```

---

## 🛠️ Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) + React |
| Styling | Vanilla CSS (dark mode, glassmorphism) |
| Odoo API | JSON-RPC (`/web/dataset/call_kw`, `/web/session/authenticate`) |
| Report Sheet | Google Sheets API (Service Account JWT, zero npm deps) |
| Storage | Upstash Redis (REST API) |
| Scheduling | External cron-job.org → `/api/cron/*` |
| Email | Nodemailer (SMTP) |
| Deploy | Vercel (Serverless Functions) |
| CI | GitHub Actions (lint + type-check + build) |

---

## 📝 License

MIT
