import fs from 'fs';
import path from 'path';

export interface ExecutionLog {
  id: string;
  timestamp: string;
  action: 'checkin' | 'checkout';
  status: 'success' | 'failed' | 'skipped';
  message: string;
  screenshotPath?: string;
  executionTimeMs: number;
  randomDelayApplied: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const MAX_LOGS = 500;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getLogs(limit = 50, offset = 0): ExecutionLog[] {
  ensureDataDir();
  if (!fs.existsSync(LOGS_FILE)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8')) as ExecutionLog[];
    return data
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(offset, offset + limit);
  } catch {
    return [];
  }
}

export function addLog(log: ExecutionLog): void {
  ensureDataDir();
  let logs: ExecutionLog[] = [];

  if (fs.existsSync(LOGS_FILE)) {
    try {
      logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    } catch {
      logs = [];
    }
  }

  logs.unshift(log);

  // Keep only the latest MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }

  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

export function clearLogs(): void {
  ensureDataDir();
  fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
}

export function getLogStats() {
  const logs = getLogs(MAX_LOGS);
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.timestamp.startsWith(today));

  return {
    total: logs.length,
    todayCount: todayLogs.length,
    lastCheckin: logs.find(l => l.action === 'checkin'),
    lastCheckout: logs.find(l => l.action === 'checkout'),
    successRate: logs.length > 0
      ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100)
      : 0,
    recentErrors: logs.filter(l => l.status === 'failed').slice(0, 5),
  };
}
