/**
 * /api/holidays
 *
 * GET    — merge Odoo holidays (cached) + custom holidays, each with `source` field
 * POST   — add a custom holiday { name, date_from, date_to }
 * DELETE — if body has `id`: remove a specific custom holiday
 *           if no body / no `id`: clear Odoo cache to force re-fetch
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from '@upstash/redis';
import { OdooClient } from '@/lib/automation/odoo-client';
import { getConfig } from '@/lib/config';
import { getCustomHolidays, addCustomHoliday, removeCustomHoliday } from '@/lib/storage';

const CACHE_KEY = 'auto_checkin:public_holidays';
const CACHE_TTL = 60 * 60 * 24; // 24 h

function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  });
}

/** Unified holiday shape returned to the client */
export interface HolidayItem {
  id: string | number;
  name: string;
  date_from: string;
  date_to: string;
  source: 'odoo' | 'custom';
}

async function getOdooHolidays() {
  // Try cache first
  const redis = getRedis();
  const cached = await redis.get<HolidayItem[]>(CACHE_KEY);
  if (cached && cached.length > 0) return cached;

  // Fetch from Odoo
  const config = await getConfig();
  const client = new OdooClient(config.odooUrl);
  await client.authenticate(config.odooDatabase, config.odooUsername, config.odooPassword);
  const raw = await client.getPublicHolidays();
  const mapped: HolidayItem[] = raw.map((h) => ({
    id: h.id,
    name: h.name,
    date_from: h.date_from,
    date_to: h.date_to,
    source: 'odoo' as const,
  }));
  if (mapped.length > 0) {
    await redis.set(CACHE_KEY, mapped, { ex: CACHE_TTL });
  }
  return mapped;
}

function isTodayInRange(date_from: string, date_to: string, today: string) {
  return today >= date_from && today <= date_to;
}

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [odooHolidays, customHolidays] = await Promise.all([
      getOdooHolidays().catch(() => [] as HolidayItem[]),
      getCustomHolidays(),
    ]);

    const customMapped: HolidayItem[] = customHolidays.map((h) => ({
      id: h.id,
      name: h.name,
      date_from: h.date_from,
      date_to: h.date_to,
      source: 'custom' as const,
    }));

    const all: HolidayItem[] = [...odooHolidays, ...customMapped].sort((a, b) =>
      a.date_from.localeCompare(b.date_from)
    );

    const todayHoliday = all.find((h) => isTodayInRange(h.date_from, h.date_to, today));

    return NextResponse.json({
      success: true,
      today,
      isHolidayToday: !!todayHoliday,
      todayHolidayName: todayHoliday?.name ?? null,
      count: all.length,
      odooCount: odooHolidays.length,
      customCount: customMapped.length,
      holidays: all,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { name?: string; date_from?: string; date_to?: string };
    const name = body.name?.trim();
    const date_from = body.date_from?.trim();

    if (!name || !date_from) {
      return NextResponse.json(
        { success: false, error: 'name và date_from là bắt buộc' },
        { status: 400 }
      );
    }

    // date_from is guaranteed string here; date_to defaults to same day if omitted
    const date_to = body.date_to?.trim() || date_from;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
      return NextResponse.json(
        { success: false, error: 'date phải đúng format YYYY-MM-DD' },
        { status: 400 }
      );
    }

    await addCustomHoliday({ id: uuidv4(), name, date_from, date_to, createdAt: new Date().toISOString() });
    return NextResponse.json({ success: true, message: `Đã thêm ngày lễ: ${name} (${date_from})` });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Try to parse body — if `id` present, delete custom holiday; otherwise clear Odoo cache
    let id: string | undefined;
    try {
      const body = await req.json() as { id?: string };
      id = body.id;
    } catch {
      // no body = cache clear intent
    }

    if (id) {
      await removeCustomHoliday(id);
      return NextResponse.json({ success: true, message: 'Đã xóa ngày lễ thủ công' });
    }

    // No id → clear Odoo cache
    const redis = getRedis();
    await redis.del(CACHE_KEY);
    return NextResponse.json({ success: true, message: 'Đã xóa cache ngày lễ từ Odoo' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
