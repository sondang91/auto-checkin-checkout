import { NextResponse } from 'next/server';
import { getConfigSafe, validateConfig, getConfig } from '@/lib/config';
import { getEmailConfig } from '@/lib/email';

export async function GET() {
  const config = getConfigSafe();
  const emailConfig = getEmailConfig();
  const errors = validateConfig(getConfig());

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
