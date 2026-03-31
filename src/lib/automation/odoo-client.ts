/**
 * Odoo JSON-RPC API Client
 * Handles authentication and attendance toggle via Odoo's native API.
 * Works on serverless (Vercel) — no browser needed.
 */

// Bypass SSL certificate verification for Odoo servers with self-signed certs
// This is safe because we only call our own known Odoo instance
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface OdooSession {
  sessionId: string;
  uid: number;
  username: string;
  database: string;
}

export interface AttendanceResult {
  action: 'checkin' | 'checkout';
  success: boolean;
  message: string;
  timestamp: string;
  hoursToday?: number;
}

export interface PublicHoliday {
  id: number;
  name: string;
  date_from: string; // ISO date string 'YYYY-MM-DD'
  date_to: string;   // ISO date string 'YYYY-MM-DD'
}

export class OdooClient {
  private readonly baseUrl: string;
  private sessionId: string | null = null;
  private uid: number | null = null;

  constructor(baseUrl: string) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Make a JSON-RPC call to Odoo
   */
  private async rpc(endpoint: string, params: Record<string, unknown>, retryOnAbort = true): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.sessionId) {
      // Odoo expects session in BOTH headers for reliable delivery
      headers['Cookie'] = `session_id=${this.sessionId}`;
      headers['X-Openerp-Session-Id'] = this.sessionId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        id: Date.now(),
        params,
      }),
    });

    // Extract session_id from Set-Cookie header (multiple methods for compatibility)
    let cookieHeader: string | null = null;
    try {
      // Method 1: getSetCookie() (Node 20+)
      const setCookies = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
      if (setCookies && setCookies.length > 0) {
        cookieHeader = setCookies.join('; ');
      }
    } catch { /* ignore */ }

    if (!cookieHeader) {
      // Method 2: standard get
      cookieHeader = response.headers.get('set-cookie');
    }

    if (cookieHeader) {
      const match = /session_id=([^;]+)/.exec(cookieHeader);
      if (match) {
        this.sessionId = match[1];
      }
    }

    const data = await response.json() as {
      result?: { session_id?: string } | Record<string, unknown>;
      error?: { message: string; data?: { message: string } };
    };

    // Method 3: fallback - extract session_id from response body (authenticate endpoint)
    if (!this.sessionId && data.result && typeof data.result === 'object' && 'session_id' in data.result) {
      this.sessionId = (data.result as { session_id: string }).session_id;
    }

    if (data.error) {
      const errorMsg = data.error.data?.message || data.error.message || 'Unknown Odoo error';

      // Retry once if Odoo reports a transaction-aborted error (PostgreSQL race condition)
      const isTransactionAborted = errorMsg.includes('transaction is aborted') || errorMsg.includes('InternalError');
      if (isTransactionAborted && retryOnAbort) {
        // Small delay to let Odoo rollback the aborted transaction
        await new Promise(r => setTimeout(r, 800));
        return this.rpc(endpoint, params, false /* no more retries */);
      }

      throw new Error(`Odoo RPC Error: ${errorMsg}`);
    }

    return data.result;
  }

  /**
   * Get list of available databases
   */
  async getDatabases(): Promise<string[]> {
    try {
      const result = await this.rpc('/web/database/list', {}) as string[];
      return result || [];
    } catch {
      // Some Odoo instances disable database listing
      return [];
    }
  }

  /**
   * Authenticate with Odoo
   */
  async authenticate(database: string, login: string, password: string): Promise<OdooSession> {
    // If no database provided, try to auto-detect
    let db = database;
    if (!db) {
      const databases = await this.getDatabases();
      if (databases.length === 1) {
        db = databases[0];
      } else if (databases.length > 1) {
        throw new Error(`Multiple databases found: ${databases.join(', ')}. Please specify ODOO_DATABASE.`);
      } else {
        throw new Error('Could not auto-detect database. Please specify ODOO_DATABASE.');
      }
    }

    const result = await this.rpc('/web/session/authenticate', {
      db,
      login,
      password,
    }) as { uid: number | false; username: string; db: string; session_id: string };

    if (!result || result.uid === false) {
      throw new Error('Authentication failed. Check your credentials.');
    }

    this.uid = result.uid;

    // Odoo cần một chút thời gian để commit session transaction trước khi nhận request tiếp theo
    // Bỏ qua delay này có thể gây lỗi "transaction is aborted" ở request kế tiếp
    await new Promise(r => setTimeout(r, 300));

    return {
      sessionId: this.sessionId || result.session_id,
      uid: result.uid,
      username: result.username || login,
      database: db,
    };
  }

  /**
   * Get the current user's employee ID
   */
  async getEmployeeId(): Promise<number> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('/web/dataset/call_kw/hr.employee/search_read', {
      model: 'hr.employee',
      method: 'search_read',
      args: [[['user_id', '=', this.uid]]],
      kwargs: {
        fields: ['id', 'name', 'attendance_state'],
        limit: 1,
      },
    }) as Array<{ id: number; name: string; attendance_state: string }>;

    if (!result || result.length === 0) {
      throw new Error('No employee record found for this user.');
    }

    return result[0].id;
  }

  /**
   * Get current attendance state
   */
  async getAttendanceState(): Promise<{ state: 'checked_in' | 'checked_out'; employeeName: string }> {
    if (!this.uid) throw new Error('Not authenticated');

    const result = await this.rpc('/web/dataset/call_kw/hr.employee/search_read', {
      model: 'hr.employee',
      method: 'search_read',
      args: [[['user_id', '=', this.uid]]],
      kwargs: {
        fields: ['id', 'name', 'attendance_state'],
        limit: 1,
      },
    }) as Array<{ id: number; name: string; attendance_state: string }>;

    if (!result || result.length === 0) {
      throw new Error('No employee record found.');
    }

    return {
      state: result[0].attendance_state === 'checked_in' ? 'checked_in' : 'checked_out',
      employeeName: result[0].name,
    };
  }

  /**
   * Toggle attendance (check-in if checked-out, check-out if checked-in)
   */
  async toggleAttendance(): Promise<AttendanceResult> {
    if (!this.uid) throw new Error('Not authenticated');

    const employeeId = await this.getEmployeeId();
    const beforeState = await this.getAttendanceState();

    try {
      await this.rpc('/web/dataset/call_kw/hr.employee/attendance_manual', {
        model: 'hr.employee',
        method: 'attendance_manual',
        args: [[employeeId], 'hr_attendance.hr_attendance_action_my_attendances'],
        kwargs: {},
      });

      // Verify the state changed
      const afterState = await this.getAttendanceState();
      const actionPerformed = afterState.state === 'checked_in' ? 'checkin' : 'checkout';

      return {
        action: actionPerformed,
        success: beforeState.state !== afterState.state,
        message: actionPerformed === 'checkin'
          ? `✅ Check-in thành công cho ${afterState.employeeName}`
          : `✅ Check-out thành công cho ${afterState.employeeName}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        action: beforeState.state === 'checked_out' ? 'checkin' : 'checkout',
        success: false,
        message: `❌ Lỗi: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Perform check-in (only if currently checked-out)
   */
  async checkin(): Promise<AttendanceResult> {
    const state = await this.getAttendanceState();

    if (state.state === 'checked_in') {
      return {
        action: 'checkin',
        success: true,
        message: `⏭️ Đã check-in rồi, bỏ qua. (${state.employeeName})`,
        timestamp: new Date().toISOString(),
      };
    }

    return this.toggleAttendance();
  }

  /**
   * Perform check-out (only if currently checked-in)
   */
  async checkout(): Promise<AttendanceResult> {
    const state = await this.getAttendanceState();

    if (state.state === 'checked_out') {
      return {
        action: 'checkout',
        success: true,
        message: `⏭️ Đã check-out rồi, bỏ qua. (${state.employeeName})`,
        timestamp: new Date().toISOString(),
      };
    }

    return this.toggleAttendance();
  }

  /**
   * Test connection — authenticate and get employee info
   */
  async testConnection(database: string, login: string, password: string): Promise<{
    success: boolean;
    message: string;
    employeeName?: string;
    currentState?: string;
  }> {
    try {
      await this.authenticate(database, login, password);
      const state = await this.getAttendanceState();

      return {
        success: true,
        message: `Kết nối thành công! Trạng thái hiện tại: ${state.state === 'checked_in' ? 'Đã check-in' : 'Đã check-out'}`,
        employeeName: state.employeeName,
        currentState: state.state,
      };
    } catch (error) {
      return {
        success: false,
        message: `Kết nối thất bại: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Fetch public holidays from Odoo (hr.public.holiday model).
   * Optionally filter by year; defaults to current + next year to ensure we have coverage.
   */
  async getPublicHolidays(fromYear?: number, toYear?: number): Promise<PublicHoliday[]> {
    if (!this.uid) throw new Error('Not authenticated');

    const now = new Date();
    const yearFrom = fromYear ?? now.getFullYear();
    const yearTo = toYear ?? now.getFullYear() + 1;

    const dateFrom = `${yearFrom}-01-01`;
    const dateTo   = `${yearTo}-12-31`;

    const result = await this.rpc('/web/dataset/call_kw/hr.public.holiday/search_read', {
      model:  'hr.public.holiday',
      method: 'search_read',
      args: [[
        ['date_to',   '>=', dateFrom],
        ['date_from', '<=', dateTo],
      ]],
      kwargs: {
        fields: ['id', 'name', 'date_from', 'date_to'],
        order:  'date_from asc',
        limit:  200,
      },
    }) as Array<{ id: number; name: string; date_from: string; date_to: string }>;

    return (result ?? []).map((h) => ({
      id:        h.id,
      name:      h.name,
      date_from: h.date_from.slice(0, 10), // strip time part if any
      date_to:   h.date_to.slice(0, 10),
    }));
  }

  /**
   * Returns true if the given date string (YYYY-MM-DD) falls within any public holiday.
   */
  isDatePublicHoliday(date: string, holidays: PublicHoliday[]): boolean {
    return holidays.some((h) => date >= h.date_from && date <= h.date_to);
  }
}
