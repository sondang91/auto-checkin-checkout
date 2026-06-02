import { NextRequest, NextResponse } from 'next/server';
import { executeAction, executeReport } from '@/lib/automation/scheduler';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checkoutLog = await executeAction('checkout');

  // After a successful checkout, automatically submit the daily report
  let reportLog = null;
  if (checkoutLog.status === 'success') {
    reportLog = await executeReport();
  }

  return NextResponse.json({
    success: checkoutLog.status === 'success',
    checkout: checkoutLog,
    report: reportLog,
  });
}

