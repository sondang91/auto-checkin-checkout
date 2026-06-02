/**
 * /api/report
 *
 * GET  — Preview today's report content from Google Sheet + last report log
 * POST — Manually trigger report creation (reads Sheet → creates Odoo task)
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeReport } from '@/lib/automation/scheduler';
import { getDailyReport } from '@/lib/google-sheets';
import { getLogs } from '@/lib/storage';
import { getConfig } from '@/lib/config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET() {
  try {
    const config = await getConfig();
    const todayStr = dayjs().tz(config.timezone).format('YYYY-MM-DD');
    const todayLabel = dayjs().tz(config.timezone).format('DD/MM/YYYY');

    // Check Google Sheet for today's content
    let sheetContent: string | null = null;
    let sheetError: string | null = null;
    try {
      const row = await getDailyReport(todayStr);
      sheetContent = row?.description ?? null;
    } catch (err) {
      sheetError = err instanceof Error ? err.message : String(err);
    }

    // Check if report was already sent today
    const logs = await getLogs(50, 0);
    const todayReportLog = logs.find(
      (l) => l.action === 'report' && l.status === 'success' && l.timestamp.startsWith(todayStr)
    );

    return NextResponse.json({
      success: true,
      today: todayStr,
      todayLabel,
      sheetContent,
      sheetError,
      alreadySentToday: !!todayReportLog,
      lastReportLog: todayReportLog ?? null,
      reportConfigured: config.reportProjectId > 0,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Optional: allow secret check for external callers
    const cronSecret = process.env.CRON_SECRET;
    const body = await request.json().catch(() => ({})) as { secret?: string };
    const authHeader = request.headers.get('authorization');
    const referer = request.headers.get('referer') || '';
    const host = request.headers.get('host') || '';
    const isSameOrigin = referer.includes(host);

    if (!isSameOrigin && cronSecret) {
      const provided = body.secret || authHeader?.replace('Bearer ', '');
      if (provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const log = await executeReport();
    return NextResponse.json({ success: log.status === 'success', log });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
