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
