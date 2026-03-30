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

export function getConfig(): AppConfig {
  return {
    odooUrl: process.env.ODOO_URL || DEFAULT_CONFIG.odooUrl,
    odooUsername: process.env.ODOO_USERNAME || DEFAULT_CONFIG.odooUsername,
    odooPassword: process.env.ODOO_PASSWORD || DEFAULT_CONFIG.odooPassword,
    odooDatabase: process.env.ODOO_DATABASE || DEFAULT_CONFIG.odooDatabase,
    checkinTime: process.env.CHECKIN_TIME || DEFAULT_CONFIG.checkinTime,
    checkoutTime: process.env.CHECKOUT_TIME || DEFAULT_CONFIG.checkoutTime,
    timezone: process.env.TIMEZONE || DEFAULT_CONFIG.timezone,
    workingDays: process.env.WORKING_DAYS
      ? process.env.WORKING_DAYS.split(',').map(Number)
      : DEFAULT_CONFIG.workingDays,
    randomDelayMin: Number(process.env.RANDOM_DELAY_MIN) || DEFAULT_CONFIG.randomDelayMin,
    randomDelayMax: Number(process.env.RANDOM_DELAY_MAX) || DEFAULT_CONFIG.randomDelayMax,
    isEnabled: process.env.AUTOMATION_ENABLED !== 'false',
    headless: process.env.HEADLESS !== 'false',
    maxRetries: Number(process.env.MAX_RETRIES) || DEFAULT_CONFIG.maxRetries,
    retryDelayMs: Number(process.env.RETRY_DELAY_MS) || DEFAULT_CONFIG.retryDelayMs,
  };
}

export function getConfigSafe(): Omit<AppConfig, 'odooPassword'> & { odooPassword: string } {
  const config = getConfig();
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
  if (config.workingDays.some(d => d < 1 || d > 7)) errors.push('Working days must be between 1 and 7');
  return errors;
}
