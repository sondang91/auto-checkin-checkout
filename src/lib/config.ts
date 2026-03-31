import { Redis } from '@upstash/redis';

export interface AppConfig {
  // Odoo Connection
  odooUrl: string;
  odooUsername: string;
  odooPassword: string;
  odooDatabase: string;

  // Schedule
  checkinTime: string;
  checkoutTime: string;
  timezone: string;

  // Working Days (1=Mon, 7=Sun)
  workingDays: number[];

  // Random Delay (minutes)
  randomDelayMin: number;
  randomDelayMax: number;

  // Automation
  isEnabled: boolean;
  headless: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

/** Fields that can be edited from the dashboard */
export interface EditableConfig {
  checkinTime?: string;
  checkoutTime?: string;
  workingDays?: number[];
  isEnabled?: boolean;
  emailEnabled?: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  odooUrl: '',
  odooUsername: '',
  odooPassword: '',
  odooDatabase: '',
  checkinTime: '08:30',
  checkoutTime: '17:30',
  timezone: 'Asia/Ho_Chi_Minh',
  workingDays: [1, 2, 3, 4, 5],
  randomDelayMin: 0,
  randomDelayMax: 10,
  isEnabled: true,
  headless: true,
  maxRetries: 3,
  retryDelayMs: 5000,
};

const CONFIG_KEY = 'auto_checkin:config_overrides';
// Config không có TTL – tồn tại vĩnh viễn cho đến khi bị xoá rõ ràng

// ---------------------------------------------------------------------------
// Redis client (lazy singleton)
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Thiếu biến môi trường UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN.'
      );
    }

    _redis = new Redis({ url, token });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Đọc config overrides từ Redis.
 * Trả về {} nếu chưa có gì được lưu.
 */
export async function getOverrides(): Promise<Partial<EditableConfig>> {
  try {
    const redis = getRedis();
    const data = await redis.get<Partial<EditableConfig>>(CONFIG_KEY);
    return data ?? {};
  } catch (err) {
    console.error('[config] getOverrides error:', err);
    return {};
  }
}

/**
 * Lưu config overrides vào Redis (merge với overrides hiện tại).
 */
export async function saveOverrides(overrides: EditableConfig): Promise<void> {
  try {
    const redis = getRedis();
    const current = await getOverrides();
    const merged = { ...current, ...overrides };
    // Không set TTL cho config – giữ vĩnh viễn
    await redis.set(CONFIG_KEY, merged);
  } catch (err) {
    console.error('[config] saveOverrides error:', err);
    throw err; // Re-throw để API route xử lý lỗi đúng cách
  }
}

export async function getConfig(): Promise<AppConfig> {
  const overrides = await getOverrides();

  return {
    odooUrl: process.env.ODOO_URL || DEFAULT_CONFIG.odooUrl,
    odooUsername: process.env.ODOO_USERNAME || DEFAULT_CONFIG.odooUsername,
    odooPassword: process.env.ODOO_PASSWORD || DEFAULT_CONFIG.odooPassword,
    odooDatabase: process.env.ODOO_DATABASE || DEFAULT_CONFIG.odooDatabase,
    checkinTime: overrides.checkinTime || process.env.CHECKIN_TIME || DEFAULT_CONFIG.checkinTime,
    checkoutTime: overrides.checkoutTime || process.env.CHECKOUT_TIME || DEFAULT_CONFIG.checkoutTime,
    timezone: process.env.TIMEZONE || DEFAULT_CONFIG.timezone,
    workingDays: overrides.workingDays || (process.env.WORKING_DAYS
      ? process.env.WORKING_DAYS.split(',').map(Number)
      : DEFAULT_CONFIG.workingDays),
    randomDelayMin: Number(process.env.RANDOM_DELAY_MIN) || DEFAULT_CONFIG.randomDelayMin,
    randomDelayMax: Number(process.env.RANDOM_DELAY_MAX) || DEFAULT_CONFIG.randomDelayMax,
    isEnabled: overrides.isEnabled ?? process.env.AUTOMATION_ENABLED !== 'false',
    headless: process.env.HEADLESS !== 'false',
    maxRetries: Number(process.env.MAX_RETRIES) || DEFAULT_CONFIG.maxRetries,
    retryDelayMs: Number(process.env.RETRY_DELAY_MS) || DEFAULT_CONFIG.retryDelayMs,
  };
}

export async function getConfigSafe(): Promise<Omit<AppConfig, 'odooPassword'> & { odooPassword: string }> {
  const config = await getConfig();
  return {
    ...config,
    odooPassword: config.odooPassword ? '••••••••' : '',
  };
}

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];
  if (!config.odooUrl) errors.push('ODOO_URL is required');
  if (!config.odooUsername) errors.push('ODOO_USERNAME is required');
  if (!config.odooPassword) errors.push('ODOO_PASSWORD is required');
  if (!/^\d{2}:\d{2}$/.test(config.checkinTime)) errors.push('CHECKIN_TIME must be in HH:mm format');
  if (!/^\d{2}:\d{2}$/.test(config.checkoutTime)) errors.push('CHECKOUT_TIME must be in HH:mm format');
  if (config.workingDays.length === 0) errors.push('At least one working day must be set');
  if (config.workingDays.some((d) => d < 1 || d > 7)) errors.push('Working days must be between 1 and 7');
  return errors;
}
