/**
 * Google Sheets integration — reads daily report content from a designated sheet.
 *
 * Auth: Google Service Account JWT (RSA-SHA256).
 * Zero external dependencies — uses Node.js built-in `crypto` + native `fetch`.
 *
 * Expected sheet layout (configurable via env):
 *   Column A: Date  — YYYY-MM-DD  or  DD/MM/YYYY
 *   Column B: Description / report content
 *   Column C: Status  — auto-updated by app after sending to Odoo
 */
import crypto from 'crypto';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';

// ---------------------------------------------------------------------------
// JWT / OAuth2 (Service Account)
// ---------------------------------------------------------------------------

let _tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Reuse cached token if still valid (with 60s buffer)
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey     = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '';

  // Normalize private key — Vercel may store the key in different formats:
  // 1. Literal \n (two chars) — when pasted as single line with \n
  // 2. Real newlines (\n) — when pasted as multiline in Vercel UI
  // 3. Mixed — some platforms double-escape the key
  const privateKey = rawKey
    .replace(/\\n/g, '\n')      // literal \n → real newline
    .replace(/\\\\n/g, '\n')    // double-escaped \\n → real newline
    .trim();

  if (!email || !privateKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY. ' +
      'See README for Google Service Account setup.'
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   TOKEN_URL,
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey).toString('base64url');

  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };

  if (!data.access_token) {
    throw new Error(
      `Google OAuth failed: ${data.error ?? 'unknown'} — ${data.error_description ?? ''}`
    );
  }

  // Cache with 60-second safety buffer
  _tokenCache = { token: data.access_token, expiresAt: (now + 3540) * 1000 };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise various date formats → YYYY-MM-DD
 * Supports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, M/D/YYYY (Google's default)
 */
function normalizeDate(raw: string): string {
  const s = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // M/D/YYYY (Google Sheets default locale US)
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (mdy && Number(mdy[1]) <= 12 && Number(mdy[2]) <= 31) {
    // Ambiguous — assume DD/MM/YYYY (Vietnam locale)
    return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  return s; // assume already YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DailyReportRow {
  date:        string; // YYYY-MM-DD
  description: string; // report content from column B
  rowIndex:    number; // 1-based row index (for updating status)
}

export interface SheetConfig {
  sheetId:   string;
  sheetName: string;
}

function getSheetConfig(): SheetConfig {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
  return {
    sheetId,
    sheetName: process.env.GOOGLE_SHEET_NAME ?? 'Daily Report',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up the row whose date column matches `date` (YYYY-MM-DD).
 * Returns null if not found or if the description is empty.
 */
export async function getDailyReport(date: string): Promise<DailyReportRow | null> {
  const { sheetId, sheetName } = getSheetConfig();
  const token = await getAccessToken();

  const range = encodeURIComponent(`${sheetName}!A:B`);
  const res   = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Sheets API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { values?: string[][] };
  if (!data.values || data.values.length === 0) return null;

  for (let i = 0; i < data.values.length; i++) {
    const row = data.values[i];
    if (!row[0]) continue;

    const rowDate = normalizeDate(row[0]);
    if (rowDate === date) {
      const description = (row[1] ?? '').trim();
      // Skip rows with empty description — nothing to report
      if (!description) return null;
      return { date: rowDate, description, rowIndex: i + 1 };
    }
  }

  return null;
}

/**
 * Update column C of the given row with a sent status message.
 * Call this after successfully creating the Odoo task.
 */
export async function markReportSent(rowIndex: number, taskId: number | string): Promise<void> {
  try {
    const { sheetId, sheetName } = getSheetConfig();
    const token = await getAccessToken();

    const range = encodeURIComponent(`${sheetName}!C${rowIndex}`);
    await fetch(
      `${SHEETS_API}/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      {
        method:  'PUT',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [[`✅ Sent — Task #${taskId}`]] }),
      }
    );
  } catch (err) {
    // Non-fatal — don't fail the whole report job just because status update failed
    console.warn('[google-sheets] markReportSent error (non-fatal):', err);
  }
}

/**
 * Test Google Sheets connectivity — reads the first row of the sheet.
 */
export async function testSheetsConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const { sheetId, sheetName } = getSheetConfig();
    const token = await getAccessToken();

    const range = encodeURIComponent(`${sheetName}!A1:C1`);
    const res   = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `Sheets API error ${res.status}: ${text}` };
    }

    const data = await res.json() as { values?: string[][] };
    const firstRow = data.values?.[0] ?? [];
    return {
      success: true,
      message: `Kết nối Google Sheets thành công! Header row: [${firstRow.join(', ')}]`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Lỗi kết nối Google Sheets: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
