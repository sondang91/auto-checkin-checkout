import { Redis } from '@upstash/redis';

export interface ExecutionLog {
  id: string;
  timestamp: string;
  action: 'checkin' | 'checkout' | 'test_odoo' | 'test_email' | 'config_change';
  status: 'success' | 'failed' | 'skipped';
  message: string;
  screenshotPath?: string;
  executionTimeMs: number;
  randomDelayApplied: number;
}

const LOGS_KEY = 'auto_checkin:logs';
const MAX_LOGS = 500;
// 90 ngày TTL – tự xoá nếu không dùng lâu
const TTL_SECONDS = 90 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Redis client (lazy singleton để tránh lỗi khi biến môi trường chưa có)
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Thiếu biến môi trường UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN.\n' +
        'Xem hướng dẫn: https://console.upstash.com → tạo database → copy REST URL & Token.'
      );
    }

    _redis = new Redis({ url, token });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLogs(limit = 50, offset = 0): Promise<ExecutionLog[]> {
  try {
    const redis = getRedis();
    // LRANGE trả về mảng đã đúng thứ tự (mới nhất trước – do unshift khi thêm)
    const raw = await redis.lrange<ExecutionLog>(LOGS_KEY, offset, offset + limit - 1);
    return raw ?? [];
  } catch (err) {
    console.error('[storage] getLogs error:', err);
    return [];
  }
}

export async function addLog(log: ExecutionLog): Promise<void> {
  try {
    const redis = getRedis();
    // Thêm vào đầu danh sách (mới nhất trước)
    await redis.lpush(LOGS_KEY, log);
    // Giữ tối đa MAX_LOGS entries
    await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1);
    // Refresh TTL mỗi lần ghi
    await redis.expire(LOGS_KEY, TTL_SECONDS);
  } catch (err) {
    console.error('[storage] addLog error:', err);
  }
}

export async function clearLogs(): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(LOGS_KEY);
  } catch (err) {
    console.error('[storage] clearLogs error:', err);
  }
}

export async function getLogStats() {
  const logs = await getLogs(MAX_LOGS, 0);
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter((l) => l.timestamp.startsWith(today));

  return {
    total: logs.length,
    todayCount: todayLogs.length,
    lastCheckin: logs.find((l) => l.action === 'checkin'),
    lastCheckout: logs.find((l) => l.action === 'checkout'),
    successRate:
      logs.length > 0
        ? Math.round((logs.filter((l) => l.status === 'success').length / logs.length) * 100)
        : 0,
    recentErrors: logs.filter((l) => l.status === 'failed').slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Leave Days
// ---------------------------------------------------------------------------

export interface LeaveDay {
  id: string;        // uuid
  date: string;      // YYYY-MM-DD
  reason: string;    // e.g. "Nghỉ phép", "Việc cá nhân"
  createdAt: string; // ISO timestamp
}

const LEAVES_KEY = 'auto_checkin:leave_days';

export async function getLeaves(): Promise<LeaveDay[]> {
  try {
    const redis = getRedis();
    const data = await redis.get<LeaveDay[]>(LEAVES_KEY);
    return data ?? [];
  } catch (err) {
    console.error('[storage] getLeaves error:', err);
    return [];
  }
}

export async function addLeave(leave: LeaveDay): Promise<void> {
  try {
    const redis = getRedis();
    const current = await getLeaves();
    // Avoid duplicate dates — replace if same date exists
    const filtered = current.filter((l) => l.date !== leave.date);
    await redis.set(LEAVES_KEY, [...filtered, leave]);
  } catch (err) {
    console.error('[storage] addLeave error:', err);
    throw err;
  }
}

export async function removeLeave(id: string): Promise<void> {
  try {
    const redis = getRedis();
    const current = await getLeaves();
    await redis.set(LEAVES_KEY, current.filter((l) => l.id !== id));
  } catch (err) {
    console.error('[storage] removeLeave error:', err);
    throw err;
  }
}

export async function isLeaveDay(dateStr: string): Promise<{ isLeave: boolean; reason?: string }> {
  const leaves = await getLeaves();
  const match = leaves.find((l) => l.date === dateStr);
  return { isLeave: !!match, reason: match?.reason };
}

// ---------------------------------------------------------------------------
// Custom Holidays (user-added, separate from Odoo source)
// ---------------------------------------------------------------------------

export interface CustomHoliday {
  id: string;         // uuid
  name: string;       // e.g. "Tết Dương Lịch 2025"
  date_from: string;  // YYYY-MM-DD
  date_to: string;    // YYYY-MM-DD (can equal date_from for single day)
  createdAt: string;  // ISO timestamp
}

const CUSTOM_HOLIDAYS_KEY = 'auto_checkin:custom_holidays';

export async function getCustomHolidays(): Promise<CustomHoliday[]> {
  try {
    const redis = getRedis();
    const data = await redis.get<CustomHoliday[]>(CUSTOM_HOLIDAYS_KEY);
    return data ?? [];
  } catch (err) {
    console.error('[storage] getCustomHolidays error:', err);
    return [];
  }
}

export async function addCustomHoliday(holiday: CustomHoliday): Promise<void> {
  try {
    const redis = getRedis();
    const current = await getCustomHolidays();
    await redis.set(CUSTOM_HOLIDAYS_KEY, [...current, holiday]);
  } catch (err) {
    console.error('[storage] addCustomHoliday error:', err);
    throw err;
  }
}

export async function removeCustomHoliday(id: string): Promise<void> {
  try {
    const redis = getRedis();
    const current = await getCustomHolidays();
    await redis.set(CUSTOM_HOLIDAYS_KEY, current.filter((h) => h.id !== id));
  } catch (err) {
    console.error('[storage] removeCustomHoliday error:', err);
    throw err;
  }
}
