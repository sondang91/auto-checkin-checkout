'use client';

import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  id: string;
  timestamp: string;
  action: 'checkin' | 'checkout';
  status: 'success' | 'failed' | 'skipped';
  message: string;
  executionTimeMs: number;
}

interface Stats {
  total: number;
  todayCount: number;
  successRate: number;
  lastCheckin?: LogEntry;
  lastCheckout?: LogEntry;
  recentErrors: LogEntry[];
}

interface Config {
  odooUrl: string;
  odooUsername: string;
  odooPassword: string;
  checkinTime: string;
  checkoutTime: string;
  timezone: string;
  workingDays: number[];
  isEnabled: boolean;
}

interface EmailConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  emailTo: string;
}

const DAY_NAMES = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [configErrors, setConfigErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [now, setNow] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, configRes] = await Promise.all([
        fetch('/api/logs'),
        fetch('/api/config'),
      ]);
      const logsData = await logsRes.json();
      const configData = await configRes.json();

      setLogs(logsData.logs || []);
      setStats(logsData.stats || null);
      setConfig(configData.config || null);
      setEmailConfig(configData.email || null);
      setConfigErrors(configData.errors || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    const timeInterval = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(timeInterval); };
  }, [fetchData]);

  const triggerAction = async (action: 'checkin' | 'checkout') => {
    setActionLoading(action);
    setTestResult(null);
    try {
      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.log?.message || data.error || 'Unknown result',
      });
      fetchData();
    } catch {
      setTestResult({ success: false, message: 'Lỗi kết nối tới server' });
    } finally {
      setActionLoading(null);
    }
  };

  const testConnection = async (type: 'odoo' | 'email') => {
    setActionLoading(`test-${type}`);
    setTestResult(null);
    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
    } catch {
      setTestResult({ success: false, message: 'Lỗi kết nối' });
    } finally {
      setActionLoading(null);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Xóa tất cả lịch sử?')) return;
    await fetch('/api/logs', { method: 'DELETE' });
    fetchData();
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-emerald)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ marginBottom: 32 }} className="animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ⏰ Auto Checkin-Checkout
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: 14 }}>
              Odoo Attendance Automation System
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`status-dot ${config?.isEnabled ? 'success' : 'error'}`} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {config?.isEnabled ? 'Đang hoạt động' : 'Đã tắt'}
            </span>
            <div style={{ padding: '6px 12px', background: 'var(--bg-card)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
            </div>
          </div>
        </div>
      </header>

      {/* Alert for test results */}
      {testResult && (
        <div className="animate-fade-in" style={{
          padding: '14px 20px', borderRadius: 12, marginBottom: 20,
          background: testResult.success ? 'var(--accent-emerald-glow)' : 'var(--accent-red-glow)',
          border: `1px solid ${testResult.success ? 'var(--accent-emerald)' : 'var(--accent-red)'}`,
          color: testResult.success ? 'var(--accent-emerald)' : 'var(--accent-red)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14,
        }}>
          <span>{testResult.success ? '✅' : '❌'} {testResult.message}</span>
          <button onClick={() => setTestResult(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Config errors */}
      {configErrors.length > 0 && (
        <div className="card animate-fade-in" style={{ marginBottom: 20, borderColor: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--accent-amber)' }}>⚠️ Cấu hình chưa hoàn tất</h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            {configErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Schedule Card */}
        <div className="card animate-fade-in">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Lịch trình</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ flex: 1, padding: '12px', background: 'var(--accent-emerald-glow)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--accent-emerald)', marginBottom: 4 }}>CHECK-IN</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>{config?.checkinTime || '--:--'}</div>
            </div>
            <div style={{ flex: 1, padding: '12px', background: 'var(--accent-blue-glow)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--accent-blue)', marginBottom: 4 }}>CHECK-OUT</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{config?.checkoutTime || '--:--'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5,6,7].map(d => (
              <span key={d} style={{
                flex: 1, textAlign: 'center', padding: '4px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: config?.workingDays?.includes(d) ? 'var(--accent-blue-glow)' : 'transparent',
                color: config?.workingDays?.includes(d) ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}>
                {DAY_NAMES[d]}
              </span>
            ))}
          </div>
        </div>

        {/* Success Rate */}
        <div className="card animate-fade-in">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Tỷ lệ thành công</div>
          <div style={{ fontSize: 48, fontWeight: 800, fontFamily: 'var(--font-mono)', color: (stats?.successRate ?? 0) >= 90 ? 'var(--accent-emerald)' : (stats?.successRate ?? 0) >= 70 ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
            {stats?.successRate ?? 0}%
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Tổng: {stats?.total ?? 0} lần · Hôm nay: {stats?.todayCount ?? 0}
          </div>
        </div>

        {/* Last Actions */}
        <div className="card animate-fade-in">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Lần cuối</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--accent-emerald)', marginBottom: 4 }}>Check-in gần nhất</div>
            {stats?.lastCheckin ? (
              <>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{formatTimeAgo(stats.lastCheckin.timestamp)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(stats.lastCheckin.timestamp)}</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chưa có</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--accent-blue)', marginBottom: 4 }}>Check-out gần nhất</div>
            {stats?.lastCheckout ? (
              <>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{formatTimeAgo(stats.lastCheckout.timestamp)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(stats.lastCheckout.timestamp)}</div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chưa có</div>
            )}
          </div>
        </div>
      </div>

      {/* Actions + Connection Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Manual Actions */}
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>🎯 Thao tác thủ công</h2>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!!actionLoading}
              onClick={() => triggerAction('checkin')}
            >
              {actionLoading === 'checkin' ? '⏳ Đang xử lý...' : '🟢 Check-in'}
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              disabled={!!actionLoading}
              onClick={() => triggerAction('checkout')}
            >
              {actionLoading === 'checkout' ? '⏳ Đang xử lý...' : '🔴 Check-out'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1, fontSize: 13 }}
              disabled={!!actionLoading}
              onClick={() => testConnection('odoo')}
            >
              {actionLoading === 'test-odoo' ? '⏳...' : '🔗 Test Odoo'}
            </button>
            <button
              className="btn btn-outline"
              style={{ flex: 1, fontSize: 13 }}
              disabled={!!actionLoading}
              onClick={() => testConnection('email')}
            >
              {actionLoading === 'test-email' ? '⏳...' : '📧 Test Email'}
            </button>
          </div>
        </div>

        {/* Connection Info */}
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>🔌 Kết nối</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Odoo URL</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{config?.odooUrl || 'Chưa cấu hình'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Username</span>
              <span style={{ color: 'var(--text-primary)' }}>{config?.odooUsername || 'Chưa cấu hình'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Password</span>
              <span style={{ color: 'var(--text-primary)' }}>{config?.odooPassword || 'Chưa cấu hình'}</span>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Email</span>
              <span className={`badge ${emailConfig?.enabled ? 'success' : 'error'}`}>
                {emailConfig?.enabled ? 'Bật' : 'Tắt'}
              </span>
            </div>
            {emailConfig?.enabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gửi tới</span>
                <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>{emailConfig.emailTo}</span>
              </div>
            )}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            💡 Cấu hình qua Environment Variables (.env hoặc Vercel Dashboard)
          </p>
        </div>
      </div>

      {/* Execution History */}
      <div className="card animate-fade-in" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📋 Lịch sử thực hiện</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={fetchData}>
              🔄 Làm mới
            </button>
            {logs.length > 0 && (
              <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }} onClick={clearLogs}>
                🗑️ Xóa
              </button>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ margin: 0 }}>Chưa có lịch sử. Thử nhấn Check-in hoặc Check-out ở trên.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Thời gian</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hành động</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trạng thái</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Chi tiết</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Thời gian XL</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${log.action === 'checkin' ? 'success' : 'info'}`}>
                        {log.action === 'checkin' ? '🟢 Check-in' : '🔵 Check-out'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${log.status === 'success' ? 'success' : log.status === 'skipped' ? 'info' : 'error'}`}>
                        {log.status === 'success' ? '✅ OK' : log.status === 'skipped' ? '⏭️ Bỏ qua' : '❌ Lỗi'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {log.executionTimeMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--border-color)' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          Auto Checkin-Checkout v0.1.0 · Powered by Odoo JSON-RPC · Deploy on Vercel
        </p>
      </footer>
    </div>
  );
}
