import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getConfigSafe, validateConfig, getConfig, saveOverrides, type EditableConfig } from '@/lib/config';
import { getEmailConfig, sendNotification } from '@/lib/email';
import { addLog } from '@/lib/storage';

export async function GET() {
  const [config, emailConfig] = await Promise.all([
    getConfigSafe(),
    Promise.resolve(getEmailConfig()),
  ]);
  const fullConfig = await getConfig();
  const errors = validateConfig(fullConfig);

  return NextResponse.json({
    config,
    email: {
      enabled: emailConfig.enabled,
      smtpHost: emailConfig.smtpHost,
      smtpPort: emailConfig.smtpPort,
      smtpUser: emailConfig.smtpUser ? '••••' : '',
      emailTo: emailConfig.emailTo,
    },
    valid: errors.length === 0,
    errors,
  });
}

/**
 * PUT /api/config
 * Update editable config fields (checkinTime, checkoutTime, workingDays, isEnabled)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as EditableConfig;
    const updates: EditableConfig = {};

    if (body.checkinTime !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(body.checkinTime)) {
        return NextResponse.json({ error: 'checkinTime phải đúng format HH:mm' }, { status: 400 });
      }
      updates.checkinTime = body.checkinTime;
    }

    if (body.checkoutTime !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(body.checkoutTime)) {
        return NextResponse.json({ error: 'checkoutTime phải đúng format HH:mm' }, { status: 400 });
      }
      updates.checkoutTime = body.checkoutTime;
    }

    if (body.workingDays !== undefined) {
      if (!Array.isArray(body.workingDays) || body.workingDays.some(d => d < 1 || d > 7)) {
        return NextResponse.json({ error: 'workingDays phải là mảng số từ 1-7' }, { status: 400 });
      }
      updates.workingDays = body.workingDays;
    }

    if (body.isEnabled !== undefined) {
      updates.isEnabled = Boolean(body.isEnabled);
    }

    if (body.emailEnabled !== undefined) {
      updates.emailEnabled = Boolean(body.emailEnabled);
    }

    // Build change description
    const changedFields = Object.entries(updates)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`)
      .join(', ');

    // Send email BEFORE saving (so "email disabled" notification can still be sent)
    await sendNotification('config_change', 'success', `Cấu hình đã được cập nhật: ${changedFields}`, {
      'Thay đổi': changedFields,
      'Thời gian': new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    }).catch(() => {});

    await saveOverrides(updates);

    // Log config change
    await addLog({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: 'config_change',
      status: 'success',
      message: `⚙️ Cập nhật cấu hình: ${changedFields}`,
      executionTimeMs: 0,
      randomDelayApplied: 0,
    });

    return NextResponse.json({
      success: true,
      message: 'Cấu hình đã được cập nhật',
      config: await getConfigSafe(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi cập nhật cấu hình' },
      { status: 500 }
    );
  }
}
