import { NextRequest, NextResponse } from 'next/server';
import { executeAction } from '@/lib/automation/scheduler';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = await executeAction('checkout');
  return NextResponse.json({ success: log.status === 'success', log });
}
