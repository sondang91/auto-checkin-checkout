import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auto Checkin-Checkout | Odoo Attendance Automation",
  description: "Tự động chấm công check-in / check-out trên hệ thống Odoo theo thời gian cấu hình.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
