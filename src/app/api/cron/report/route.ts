/**
 * GET /api/cron/report
 * Standalone endpoint to trigger daily report creation independently.
 * Call this from cron-job.org if you want to decouple report from checkout.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeReport } from '@/lib/automation/scheduler';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = await executeReport();
  return NextResponse.json({ success: log.status === 'success', log });
}
