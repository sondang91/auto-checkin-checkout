/**
 * Email notification service using Nodemailer SMTP.
 */
import nodemailer from 'nodemailer';

export interface EmailConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  emailTo: string;
  emailFrom: string;
}

export function getEmailConfig(): EmailConfig {
  return {
    enabled: process.env.EMAIL_ENABLED === 'true',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    emailTo: process.env.EMAIL_TO || '',
    emailFrom: process.env.EMAIL_FROM || 'Auto Checkin <noreply@auto-checkin.com>',
  };
}

export async function sendNotification(
  action: 'checkin' | 'checkout',
  status: 'success' | 'failed',
  message: string,
  details?: Record<string, string>
): Promise<{ sent: boolean; error?: string }> {
  const config = getEmailConfig();

  if (!config.enabled) {
    return { sent: false, error: 'Email notifications disabled' };
  }

  if (!config.smtpUser || !config.smtpPassword || !config.emailTo) {
    return { sent: false, error: 'Email configuration incomplete' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
    });

    const isSuccess = status === 'success';
    const actionLabel = action === 'checkin' ? 'Check-in' : 'Check-out';
    const statusEmoji = isSuccess ? '✅' : '❌';
    const statusLabel = isSuccess ? 'Thành công' : 'Thất bại';
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const detailsHtml = details
      ? Object.entries(details)
          .map(([key, value]) => `<tr><td style="padding:8px 16px;color:#94a3b8;font-size:14px;">${key}</td><td style="padding:8px 16px;color:#e2e8f0;font-size:14px;">${value}</td></tr>`)
          .join('')
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="padding:24px 32px;background:${isSuccess ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)'};">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">
        ${statusEmoji} ${actionLabel} — ${statusLabel}
      </h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${now}</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="color:#e2e8f0;font-size:15px;line-height:1.6;margin:0 0 16px;">${message}</p>
      ${detailsHtml ? `<table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">${detailsHtml}</table>` : ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #334155;">
      <p style="margin:0;color:#64748b;font-size:12px;text-align:center;">Auto Checkin-Checkout System</p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: config.emailFrom,
      to: config.emailTo,
      subject: `${statusEmoji} ${actionLabel} ${statusLabel} — ${now}`,
      html,
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Test email configuration by sending a test email
 */
export async function testEmail(): Promise<{ success: boolean; message: string }> {
  const config = getEmailConfig();

  if (!config.enabled) {
    return { success: false, message: 'Email notifications are disabled. Set EMAIL_ENABLED=true.' };
  }

  try {
    const result = await sendNotification(
      'checkin',
      'success',
      '🧪 Đây là email test từ Auto Checkin-Checkout System. Nếu bạn nhận được email này, cấu hình SMTP đã hoạt động!',
      { 'Test': 'OK', 'Thời gian': new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }
    );

    if (result.sent) {
      return { success: true, message: `Email test đã gửi thành công tới ${config.emailTo}` };
    }
    return { success: false, message: result.error || 'Unknown error' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed' };
  }
}
