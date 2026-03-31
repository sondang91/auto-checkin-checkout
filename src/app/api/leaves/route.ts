/**
 * /api/leaves
 * GET    — list all leave days
 * POST   — add a new leave day { date: 'YYYY-MM-DD', reason: string }
 * DELETE — remove a leave day by id  { id: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getLeaves, addLeave, removeLeave } from '@/lib/storage';

export async function GET() {
  try {
    const leaves = await getLeaves();
    // Sort by date ascending
    leaves.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ success: true, count: leaves.length, leaves });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { date?: string; reason?: string };
    const date = body.date?.trim();
    const reason = body.reason?.trim() || 'Nghỉ phép';

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'date phải đúng format YYYY-MM-DD' },
        { status: 400 }
      );
    }

    await addLeave({
      id: uuidv4(),
      date,
      reason,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: `Đã thêm ngày nghỉ: ${date}` });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string };
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    await removeLeave(body.id);
    return NextResponse.json({ success: true, message: 'Đã xóa ngày nghỉ' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
