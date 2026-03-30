import { NextRequest, NextResponse } from 'next/server';
import { getLogs, getLogStats, clearLogs } from '@/lib/storage';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit')) || 50;
  const offset = Number(searchParams.get('offset')) || 0;
  const statsOnly = searchParams.get('stats') === 'true';

  if (statsOnly) {
    return NextResponse.json(getLogStats());
  }

  const logs = getLogs(limit, offset);
  const stats = getLogStats();

  return NextResponse.json({ logs, stats });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ success: true, message: 'Logs cleared' });
}
