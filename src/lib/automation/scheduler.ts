/**
 * Attendance action executor.
 * Called by Vercel Cron or API trigger to perform check-in/check-out.
 */
import { v4 as uuidv4 } from 'uuid';
import { Redis } from '@upstash/redis';
import { getConfig } from '../config';
import { addLog, isLeaveDay, getCustomHolidays, type ExecutionLog } from '../storage';
import { OdooClient, type PublicHoliday } from './odoo-client';
import { sendNotification } from '../email';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------------------------------------------------------------------
// Public Holiday helpers
// ---------------------------------------------------------------------------

const HOLIDAYS_CACHE_KEY = 'auto_checkin:public_holidays';
// Cache 24 hours – holidays rarely change day-to-day
const HOLIDAYS_CACHE_TTL = 24 * 60 * 60;

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    const url  = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error('Missing Upstash Redis env vars');
    _redis = new Redis({ url, token });
  }
  return _redis;
}

/**
 * Fetch public holidays from Odoo, using Redis as a 24-hour cache.
 * On any error (network, auth, Redis), returns an empty array so
 * automation keeps running normally rather than blocking forever.
 */
export async function getPublicHolidaysWithCache(): Promise<PublicHoliday[]> {
  try {
    const redis = getRedis();
    const cached = await redis.get<PublicHoliday[]>(HOLIDAYS_CACHE_KEY);
    if (cached && cached.length > 0) return cached;
  } catch {
    // Redis unavailable — fall through to Odoo
  }

  try {
    const config = await getConfig();
    if (!config.odooUrl || !config.odooUsername || !config.odooPassword) return [];

    const client = new OdooClient(config.odooUrl);
    await client.authenticate(config.odooDatabase, config.odooUsername, config.odooPassword);
    const holidays = await client.getPublicHolidays();

    // Persist to cache (best-effort)
    try {
      const redis = getRedis();
      await redis.set(HOLIDAYS_CACHE_KEY, holidays, { ex: HOLIDAYS_CACHE_TTL });
    } catch { /* ignore cache write failure */ }

    return holidays;
  } catch (err) {
    console.error('[scheduler] getPublicHolidaysWithCache error:', err);
    return [];
  }
}

/**
 * Check if a given YYYY-MM-DD date is a public holiday.
 * Checks both Odoo-cached holidays AND user-added custom holidays.
 */
export async function isPublicHoliday(dateStr?: string): Promise<{ isHoliday: boolean; holidayName?: string }> {
  const config = await getConfig();
  const today = dateStr ?? dayjs().tz(config.timezone).format('YYYY-MM-DD');

  // Check Odoo holidays (cached)
  const odooHolidays = await getPublicHolidaysWithCache();
  const odooMatch = odooHolidays.find((h) => today >= h.date_from && today <= h.date_to);
  if (odooMatch) return { isHoliday: true, holidayName: odooMatch.name };

  // Check custom holidays stored in Redis
  const customHolidays = await getCustomHolidays();
  const customMatch = customHolidays.find((h) => today >= h.date_from && today <= h.date_to);
  if (customMatch) return { isHoliday: true, holidayName: customMatch.name };

  return { isHoliday: false };
}

/**
 * Invalidate the cached holiday list (e.g. after user forces a refresh).
 */
export async function invalidateHolidaysCache(): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(HOLIDAYS_CACHE_KEY);
  } catch { /* ignore */ }
}

import { getDailyReport, markReportSent } from '../google-sheets';

export type ActionType = 'checkin' | 'checkout';

/**
 * Check if today is a working day
 */
export async function isWorkingDay(): Promise<boolean> {
  const config = await getConfig();
  const now = dayjs().tz(config.timezone);
  // dayjs: 0=Sun, 1=Mon, ..., 6=Sat → convert to 1=Mon, ..., 7=Sun
  const dayOfWeek = now.day() === 0 ? 7 : now.day();
  return config.workingDays.includes(dayOfWeek);
}

/**
 * Check if it's time to perform an action
 */
export async function shouldRunNow(action: ActionType): Promise<boolean> {
  const config = await getConfig();
  if (!config.isEnabled) return false;
  if (!(await isWorkingDay())) return false;

  const now = dayjs().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  const targetTime = action === 'checkin' ? config.checkinTime : config.checkoutTime;

  return currentTime === targetTime;
}

// ---------------------------------------------------------------------------
// Helpers (extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

function makeLog(
  logId: string,
  action: ActionType | 'report',
  status: ExecutionLog['status'],
  message: string,
  startTime: number
): ExecutionLog {
  return {
    id: logId,
    timestamp: new Date().toISOString(),
    action,
    status,
    message,
    executionTimeMs: Date.now() - startTime,
    randomDelayApplied: 0,
  };
}

async function tryOdooAction(
  action: ActionType,
  client: OdooClient,
  database: string,
  username: string,
  password: string
) {
  await client.authenticate(database, username, password);
  return action === 'checkin' ? client.checkin() : client.checkout();
}

interface RetryContext {
  action: ActionType;
  logId: string;
  startTime: number;
  config: Awaited<ReturnType<typeof getConfig>>;
}

/** Attempt Odoo action with retries. Returns ExecutionLog on success, null if all retries failed. */
async function runWithRetry(ctx: RetryContext): Promise<{ log: ExecutionLog; lastError: string }> {
  const { action, logId, startTime, config } = ctx;
  let lastError = '';

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const client = new OdooClient(config.odooUrl);
      const result = await tryOdooAction(action, client, config.odooDatabase, config.odooUsername, config.odooPassword);
      const log = makeLog(logId, action, result.success ? 'success' : 'failed', result.message, startTime);

      await addLog(log);
      await sendNotification(action, log.status as 'success' | 'failed', log.message, {
        'Hành động': action === 'checkin' ? 'Check-in' : 'Check-out',
        'Trạng thái': log.status === 'success' ? 'Thành công' : 'Thất bại',
        'Thời gian': dayjs().tz(config.timezone).format('DD/MM/YYYY HH:mm:ss'),
        'Thời gian xử lý': `${log.executionTimeMs}ms`,
      }).catch(() => { /* email failure shouldn't break the flow */ });

      return { log, lastError: '' };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      const isLastAttempt = attempt === config.maxRetries;
      if (!isLastAttempt) {
        await new Promise(r => setTimeout(r, config.retryDelayMs));
      }
    }
  }

  return { log: makeLog(logId, action, 'failed', '', startTime), lastError };
}

/**
 * Execute check-in or check-out with retry logic
 */
export async function executeAction(action: ActionType): Promise<ExecutionLog> {
  const config = await getConfig();
  const startTime = Date.now();
  const logId = uuidv4();

  // Guard: missing credentials
  if (!config.odooUrl || !config.odooUsername || !config.odooPassword) {
    const log = makeLog(logId, action, 'failed', 'Missing Odoo credentials. Check your configuration.', startTime);
    await addLog(log);
    return log;
  }

  // Guard: not a working day
  if (!(await isWorkingDay())) {
    const log = makeLog(logId, action, 'skipped', 'Hôm nay không phải ngày làm việc.', startTime);
    await addLog(log);
    return log;
  }

  // Guard: public holiday
  const { isHoliday, holidayName } = await isPublicHoliday();
  if (isHoliday) {
    const log = makeLog(
      logId, action, 'skipped',
      `🎌 Hôm nay là ngày lễ: "${holidayName}". Bỏ qua check-in/out.`,
      startTime
    );
    await addLog(log);
    return log;
  }

  // Guard: manual leave day
  const todayStr = dayjs().tz(config.timezone).format('YYYY-MM-DD');
  const { isLeave, reason: leaveReason } = await isLeaveDay(todayStr);
  if (isLeave) {
    const log = makeLog(
      logId, action, 'skipped',
      `🏢 Hôm nay là ngày nghỉ: "${leaveReason}". Bỏ qua check-in/out.`,
      startTime
    );
    await addLog(log);
    return log;
  }

  const { log, lastError } = await runWithRetry({ action, logId, startTime, config });

  if (!lastError) return log; // success or non-retry failure handled inside runWithRetry

  // All retries failed – build final failure log
  const failLog = makeLog(logId, action, 'failed', `Thất bại sau ${config.maxRetries} lần thử. Lỗi: ${lastError}`, startTime);
  await addLog(failLog);
  await sendNotification(action, 'failed', failLog.message, {
    'Hành động': action === 'checkin' ? 'Check-in' : 'Check-out',
    'Số lần thử': `${config.maxRetries}`,
    'Lỗi cuối': lastError,
  }).catch(() => {});

  return failLog;
}

// ---------------------------------------------------------------------------
// Daily Report
// ---------------------------------------------------------------------------

/**
 * Execute daily report: read description from Google Sheet → create Odoo task.
 * Applies same skip-guards as check-in/out (holiday, leave day, not working day).
 * Designed to be called right after a successful checkout.
 */
export async function executeReport(): Promise<ExecutionLog> {
  const config = await getConfig();
  const startTime = Date.now();
  const logId = uuidv4();
  const todayStr = dayjs().tz(config.timezone).format('YYYY-MM-DD');
  const todayLabel = dayjs().tz(config.timezone).format('DD/MM/YYYY');

  // Guard: report feature not configured
  if (!config.reportProjectId) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'skipped', '📝 REPORT_PROJECT_ID chưa được cấu hình. Bỏ qua tạo báo cáo.', startTime),
    };
    await addLog(log);
    return log;
  }

  // Guard: missing Odoo credentials
  if (!config.odooUrl || !config.odooUsername || !config.odooPassword) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'failed', 'Missing Odoo credentials.', startTime),
    };
    await addLog(log);
    return log;
  }

  // Guard: not a working day
  if (!(await isWorkingDay())) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'skipped', 'Hôm nay không phải ngày làm việc. Bỏ qua báo cáo.', startTime),
    };
    await addLog(log);
    return log;
  }

  // Guard: public holiday
  const { isHoliday, holidayName } = await isPublicHoliday();
  if (isHoliday) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'skipped', `🎌 Ngày lễ: "${holidayName}". Bỏ qua báo cáo.`, startTime),
    };
    await addLog(log);
    return log;
  }

  // Guard: leave day
  const { isLeave, reason: leaveReason } = await isLeaveDay(todayStr);
  if (isLeave) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'skipped', `🏢 Ngày nghỉ: "${leaveReason}". Bỏ qua báo cáo.`, startTime),
    };
    await addLog(log);
    return log;
  }

  // Read today's report content from Google Sheet
  let reportRow: Awaited<ReturnType<typeof getDailyReport>>;
  try {
    reportRow = await getDailyReport(todayStr);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'failed', `❌ Không thể đọc Google Sheet: ${errMsg}`, startTime),
    };
    await addLog(log);
    return log;
  }

  if (!reportRow) {
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'skipped', `📝 Không tìm thấy nội dung báo cáo cho ngày ${todayLabel} trong Google Sheet.`, startTime),
    };
    await addLog(log);
    return log;
  }

  // Create Odoo task
  try {
    const client = new OdooClient(config.odooUrl);
    await client.authenticate(config.odooDatabase, config.odooUsername, config.odooPassword);

    const taskName = `${config.reportTaskName} - ${todayLabel}`;
    const result = await client.createDailyReport({
      name:         taskName,
      projectId:    config.reportProjectId,
      description:  reportRow.description,
      deadline:     todayStr,
      plannedHours: config.reportPlannedHours,
      companyId:    config.reportCompanyId,
      tagId:        config.reportTagId,
    });

    // Update Google Sheet status column (non-fatal)
    if (result.taskId) {
      await markReportSent(reportRow.rowIndex, result.taskId);
    }

    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'success', result.message, startTime),
      taskId: result.taskId,
    };
    await addLog(log);

    await sendNotification('report', 'success', result.message, {
      'Báo cáo': taskName,
      'Task ID': `#${result.taskId}`,
      'Thời gian': dayjs().tz(config.timezone).format('DD/MM/YYYY HH:mm:ss'),
    }).catch(() => {});

    return log;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const log: ExecutionLog = {
      ...makeLog(logId, 'report', 'failed', `❌ Lỗi tạo task Odoo: ${errMsg}`, startTime),
    };
    await addLog(log);
    return log;
  }
}


