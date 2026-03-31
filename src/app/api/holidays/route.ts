/**
 * GET  /api/holidays  — return cached public holidays from Odoo
 * DELETE /api/holidays — invalidate cache (force refresh on next GET)
 */
import { NextResponse } from 'next/server';
import { getPublicHolidaysWithCache, invalidateHolidaysCache } from '@/lib/automation/scheduler';
import { getConfig } from '@/lib/config';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET() {
  try {
    const config = await getConfig();
    const holidays = await getPublicHolidaysWithCache();
    const today = dayjs().tz(config.timezone).format('YYYY-MM-DD');
    const todayHoliday = holidays.find((h) => today >= h.date_from && today <= h.date_to);

    return NextResponse.json({
      success: true,
      today,
      isHolidayToday: !!todayHoliday,
      todayHolidayName: todayHoliday?.name ?? null,
      count: holidays.length,
      holidays,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await invalidateHolidaysCache();
    return NextResponse.json({ success: true, message: 'Holiday cache invalidated. Next GET will refresh from Odoo.' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
