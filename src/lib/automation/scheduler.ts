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
  action: ActionType,
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

