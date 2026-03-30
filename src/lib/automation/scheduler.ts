/**
 * Attendance action executor.
 * Called by Vercel Cron or API trigger to perform check-in/check-out.
 */
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config';
import { addLog, type ExecutionLog } from '../storage';
import { OdooClient } from './odoo-client';
import { sendNotification } from '../email';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export type ActionType = 'checkin' | 'checkout';

/**
 * Check if today is a working day
 */
export function isWorkingDay(): boolean {
  const config = getConfig();
  const now = dayjs().tz(config.timezone);
  // dayjs: 0=Sun, 1=Mon, ..., 6=Sat → convert to 1=Mon, ..., 7=Sun
  const dayOfWeek = now.day() === 0 ? 7 : now.day();
  return config.workingDays.includes(dayOfWeek);
}

/**
 * Check if it's time to perform an action
 */
export function shouldRunNow(action: ActionType): boolean {
  const config = getConfig();
  if (!config.isEnabled) return false;
  if (!isWorkingDay()) return false;

  const now = dayjs().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  const targetTime = action === 'checkin' ? config.checkinTime : config.checkoutTime;

  return currentTime === targetTime;
}

/**
 * Execute check-in or check-out with retry logic
 */
export async function executeAction(action: ActionType): Promise<ExecutionLog> {
  const config = getConfig();
  const startTime = Date.now();
  const logId = uuidv4();

  // Validate config
  if (!config.odooUrl || !config.odooUsername || !config.odooPassword) {
    const log: ExecutionLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      action,
      status: 'failed',
      message: 'Missing Odoo credentials. Check your configuration.',
      executionTimeMs: Date.now() - startTime,
      randomDelayApplied: 0,
    };
    addLog(log);
    return log;
  }

  // Skip if not a working day
  if (!isWorkingDay()) {
    const log: ExecutionLog = {
      id: logId,
      timestamp: new Date().toISOString(),
      action,
      status: 'skipped',
      message: 'Hôm nay không phải ngày làm việc.',
      executionTimeMs: Date.now() - startTime,
      randomDelayApplied: 0,
    };
    addLog(log);
    return log;
  }

  let lastError = '';

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const client = new OdooClient(config.odooUrl);
      await client.authenticate(config.odooDatabase, config.odooUsername, config.odooPassword);

      const result = action === 'checkin'
        ? await client.checkin()
        : await client.checkout();

      const log: ExecutionLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        action,
        status: result.success ? 'success' : 'failed',
        message: result.message,
        executionTimeMs: Date.now() - startTime,
        randomDelayApplied: 0,
      };

      addLog(log);

      // Send email notification
      await sendNotification(action, log.status as 'success' | 'failed', log.message, {
        'Hành động': action === 'checkin' ? 'Check-in' : 'Check-out',
        'Trạng thái': log.status === 'success' ? 'Thành công' : 'Thất bại',
        'Thời gian': dayjs().tz(config.timezone).format('DD/MM/YYYY HH:mm:ss'),
        'Thời gian xử lý': `${log.executionTimeMs}ms`,
      }).catch(() => { /* email failure shouldn't break the flow */ });

      return log;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      if (attempt < config.maxRetries) {
        await new Promise(r => setTimeout(r, config.retryDelayMs));
      }
    }
  }

  // All retries failed
  const log: ExecutionLog = {
    id: logId,
    timestamp: new Date().toISOString(),
    action,
    status: 'failed',
    message: `Thất bại sau ${config.maxRetries} lần thử. Lỗi: ${lastError}`,
    executionTimeMs: Date.now() - startTime,
    randomDelayApplied: 0,
  };

  addLog(log);

  await sendNotification(action, 'failed', log.message, {
    'Hành động': action === 'checkin' ? 'Check-in' : 'Check-out',
    'Số lần thử': `${config.maxRetries}`,
    'Lỗi cuối': lastError,
  }).catch(() => {});

  return log;
}
