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

    if (!isVercelCron && cronSecret) {
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
