import { NextRequest, NextResponse } from 'next/server';
import { executeAction, type ActionType } from '@/lib/automation/scheduler';

/**
 * POST /api/trigger
 * Trigger check-in or check-out.
 * Called by Vercel Cron, external cron, or manual UI action.
 * 
 * Body: { action: 'checkin' | 'checkout', secret?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: string; secret?: string };
    const { action, secret } = body;

    // Validate secret for external calls
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const referer = request.headers.get('referer') || '';
    const host = request.headers.get('host') || '';
    const isSameOrigin = referer.includes(host);

    if (!isVercelCron && !isSameOrigin && cronSecret) {
      const providedSecret = secret || authHeader?.replace('Bearer ', '');
      if (providedSecret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!action || !['checkin', 'checkout'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use "checkin" or "checkout".' },
        { status: 400 }
      );
    }

    const log = await executeAction(action as ActionType);

    return NextResponse.json({
      success: log.status === 'success',
      log,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trigger?action=checkin&secret=xxx
 * Alternative entry for external cron services (cron-job.org, etc.)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret');

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!action || !['checkin', 'checkout'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Use ?action=checkin or ?action=checkout' },
      { status: 400 }
    );
  }

  const log = await executeAction(action as ActionType);
  return NextResponse.json({ success: log.status === 'success', log });
}
