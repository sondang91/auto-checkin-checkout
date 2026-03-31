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

interface PublicHoliday {
  id: string | number;
  name: string;
  date_from: string;
  date_to: string;
  source: 'odoo' | 'custom';
}

interface LeaveDay {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
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
  const [editing, setEditing] = useState<'checkin' | 'checkout' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isHolidayToday, setIsHolidayToday] = useState(false);
  const [todayHolidayName, setTodayHolidayName] = useState<string | null>(null);
  const [holidayRefreshing, setHolidayRefreshing] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayFrom, setNewHolidayFrom] = useState('');
  const [newHolidayTo, setNewHolidayTo] = useState('');
  const [holidayAddLoading, setHolidayAddLoading] = useState(false);
  const [leaves, setLeaves] = useState<LeaveDay[]>([]);
  const [isLeaveToday, setIsLeaveToday] = useState(false);
  const [todayLeaveReason, setTodayLeaveReason] = useState<string | null>(null);
  const [newLeaveDate, setNewLeaveDate] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('Nghỉ phép');
  const [leaveLoading, setLeaveLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [logsRes, configRes, holidaysRes, leavesRes] = await Promise.all([
        fetch('/api/logs'),
        fetch('/api/config'),
        fetch('/api/holidays'),
        fetch('/api/leaves'),
      ]);
      const logsData = await logsRes.json();
      const configData = await configRes.json();
      const holidaysData = await holidaysRes.json();
      const leavesData = await leavesRes.json();

      setLogs(logsData.logs || []);
      setStats(logsData.stats || null);
      setConfig(configData.config || null);
      setEmailConfig(configData.email || null);
      setConfigErrors(configData.errors || []);
      if (holidaysData.success) {
        setHolidays(holidaysData.holidays || []);
        setIsHolidayToday(!!holidaysData.isHolidayToday);
        setTodayHolidayName(holidaysData.todayHolidayName ?? null);
      }
      if (leavesData.success) {
        const leaveList: LeaveDay[] = leavesData.leaves || [];
        setLeaves(leaveList);
        const todayISO = new Date().toISOString().slice(0, 10);
        const todayLeave = leaveList.find((l) => l.date === todayISO);
        setIsLeaveToday(!!todayLeave);
        setTodayLeaveReason(todayLeave?.reason ?? null);
      }
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

  const saveTime = async (field: 'checkinTime' | 'checkoutTime', value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setTestResult({ success: false, message: 'Giờ phải đúng format HH:mm' });
      return;
    }
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `✅ Đã cập nhật ${field === 'checkinTime' ? 'giờ Check-in' : 'giờ Check-out'} thành ${value}` });
        fetchData();
      } else {
        setTestResult({ success: false, message: data.error || 'Lỗi cập nhật' });
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi kết nối server' });
    }
    setEditing(null);
  };

  const toggleEmail = async () => {
    const newValue = !emailConfig?.enabled;
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailEnabled: newValue }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `✉️ Email đã ${newValue ? 'Bật' : 'Tắt'}` });
        fetchData();
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi cập nhật' });
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
      fetchData();
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

  const refreshHolidays = async () => {
    setHolidayRefreshing(true);
    try {
      await fetch('/api/holidays', { method: 'DELETE' });
      const res = await fetch('/api/holidays');
      const data = await res.json();
      if (data.success) {
        setHolidays(data.holidays || []);
        setIsHolidayToday(!!data.isHolidayToday);
        setTodayHolidayName(data.todayHolidayName ?? null);
        setTestResult({ success: true, message: `🎌 Đã làm mới: ${data.odooCount ?? data.count} ngày lễ từ Odoo` });
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi khi tải danh sách ngày lễ' });
    } finally {
      setHolidayRefreshing(false);
    }
  };

  const addCustomHolidayHandler = async () => {
    if (!newHolidayName || !newHolidayFrom) {
      setTestResult({ success: false, message: 'Vui lòng nhập tên và ngày bắt đầu' });
      return;
    }
    setHolidayAddLoading(true);
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newHolidayName,
          date_from: newHolidayFrom,
          date_to: newHolidayTo || newHolidayFrom,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `🎌 Đã thêm ngày lễ: ${newHolidayName}` });
        setNewHolidayName(''); setNewHolidayFrom(''); setNewHolidayTo('');
        fetchData();
      } else {
        setTestResult({ success: false, message: data.error || 'Lỗi thêm ngày lễ' });
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi kết nối server' });
    } finally {
      setHolidayAddLoading(false);
    }
  };

  const removeCustomHolidayHandler = async (id: string | number) => {
    try {
      const res = await fetch('/api/holidays', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: '🗑️ Đã xóa ngày lễ thủ công' });
        fetchData();
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi xóa' });
    }
  };

  const addLeave = async () => {
    if (!newLeaveDate) {
      setTestResult({ success: false, message: 'Vui lòng chọn ngày nghỉ' });
      return;
    }
    setLeaveLoading(true);
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newLeaveDate, reason: newLeaveReason || 'Nghỉ phép' }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `🏢 Đã thêm ngày nghỉ: ${newLeaveDate}` });
        setNewLeaveDate('');
        setNewLeaveReason('Nghỉ phép');
        fetchData();
      } else {
        setTestResult({ success: false, message: data.error || 'Lỗi thêm ngày' });
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi kết nối server' });
    } finally {
      setLeaveLoading(false);
    }
  };

  const removeLeave = async (id: string) => {
    try {
      const res = await fetch('/api/leaves', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: '🗑️ Đã xóa ngày nghỉ' });
        fetchData();
      }
    } catch {
      setTestResult({ success: false, message: 'Lỗi xóa ngày' });
    }
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

      {/* Today is Holiday Banner */}
      {isHolidayToday && (
        <div className="animate-fade-in" style={{
          padding: '14px 20px', borderRadius: 12, marginBottom: 20,
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid var(--accent-amber)',
          color: 'var(--accent-amber)',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 14,
        }}>
          <span style={{ fontSize: 24 }}>🎌</span>
          <div>
            <strong>Hôm nay là ngày lễ: {todayHolidayName}</strong>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              Hệ thống sẽ tự động bỏ qua check-in và check-out hôm nay.
            </div>
          </div>
        </div>
      )}

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
            {/* CHECK-IN time */}
            <div style={{ flex: 1, padding: '12px', background: 'var(--accent-emerald-glow)', borderRadius: 10, textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, color: 'var(--accent-emerald)', marginBottom: 4 }}>CHECK-IN</div>
              {editing === 'checkin' ? (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                  <input
                    type="time"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', background: 'var(--bg-primary)', color: 'var(--accent-emerald)', border: '1px solid var(--accent-emerald)', borderRadius: 6, padding: '4px 8px', width: 100, textAlign: 'center' }}
                    autoFocus
                  />
                  <button onClick={() => saveTime('checkinTime', editValue)} style={{ background: 'var(--accent-emerald)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>✓</button>
                  <button onClick={() => setEditing(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>{config?.checkinTime || '--:--'}</div>
                  <button onClick={() => { setEditing('checkin'); setEditValue(config?.checkinTime || '08:30'); }} style={{ position: 'absolute', top: 6, left: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.5, padding: 2 }} title="Chỉnh giờ Check-in">✏️</button>
                </>
              )}
            </div>
            {/* CHECK-OUT time */}
            <div style={{ flex: 1, padding: '12px', background: 'var(--accent-blue-glow)', borderRadius: 10, textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 11, color: 'var(--accent-blue)', marginBottom: 4 }}>CHECK-OUT</div>
              {editing === 'checkout' ? (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                  <input
                    type="time"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', background: 'var(--bg-primary)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: 6, padding: '4px 8px', width: 100, textAlign: 'center' }}
                    autoFocus
                  />
                  <button onClick={() => saveTime('checkoutTime', editValue)} style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>✓</button>
                  <button onClick={() => setEditing(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{config?.checkoutTime || '--:--'}</div>
                  <button onClick={() => { setEditing('checkout'); setEditValue(config?.checkoutTime || '17:30'); }} style={{ position: 'absolute', top: 6, left: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.5, padding: 2 }} title="Chỉnh giờ Check-out">✏️</button>
                </>
              )}
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

      {/* Public Holidays Card */}
      <div className="card animate-fade-in" style={{ marginBottom: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🎌 Ngày Lễ</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Hệ thống sẽ tự động bỏ qua check-in/out vào các ngày này
            </p>
          </div>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
            disabled={holidayRefreshing}
            onClick={refreshHolidays}
          >
            {holidayRefreshing ? '⏳ Đang tải...' : '🔄 Làm mới từ Odoo'}
          </button>
        </div>

        {/* Add custom holiday form */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
          padding: '14px', background: 'rgba(245,158,11,0.05)',
          borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 140 }}>
            <label htmlFor="h-name" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tên ngày lễ</label>
            <input id="h-name" type="text" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)}
              placeholder="Tết Dương Lịch 2025..."
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
            <label htmlFor="h-from" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Từ ngày</label>
            <input id="h-from" type="date" value={newHolidayFrom} onChange={(e) => setNewHolidayFrom(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
            <label htmlFor="h-to" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Đến ngày</label>
            <input id="h-to" type="date" value={newHolidayTo} onChange={(e) => setNewHolidayTo(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 18px', background: '#f59e0b', border: 'none', color: '#000' }}
              disabled={holidayAddLoading || !newHolidayName || !newHolidayFrom}
              onClick={addCustomHolidayHandler}>
              {holidayAddLoading ? '⏳...' : '+ Thêm'}
            </button>
          </div>
        </div>

        {/* Table */}
        {holidays.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
            <p style={{ margin: 0, fontSize: 13 }}>Chưa có ngày lễ nào. Nhấn &ldquo;Làm mới từ Odoo&rdquo; hoặc thêm thủ công.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lý do</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Từ</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Đến</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Số ngày</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nguồn</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}></th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isActive = today >= h.date_from && today <= h.date_to;
                  const isPast = h.date_to < today;
                  const dayCount = Math.round((new Date(h.date_to).getTime() - new Date(h.date_from).getTime()) / 86400000) + 1;
                  const isCustom = h.source === 'custom';
                  return (
                    <tr key={`${h.source}-${h.id}`} style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isActive ? 'rgba(245,158,11,0.07)' : 'transparent',
                      opacity: isPast ? 0.5 : 1,
                    }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isActive && <span style={{ fontSize: 10, background: 'var(--accent-amber)', color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>Hôm nay</span>}
                          {h.name}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {h.date_from.split('-').reverse().join('/')}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {h.date_to.split('-').reverse().join('/')}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: isActive ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)',
                          color: isActive ? 'var(--accent-amber)' : 'var(--text-secondary)',
                        }}>
                          {dayCount} ngày
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                          background: isCustom ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)',
                          color: isCustom ? '#8b5cf6' : '#3b82f6',
                        }}>
                          {isCustom ? '✏️ Thủ công' : '🔗 Odoo'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {isCustom && (
                          <button
                            onClick={() => removeCustomHolidayHandler(h.id)}
                            style={{
                              background: 'none', border: '1px solid var(--accent-red)',
                              color: 'var(--accent-red)', borderRadius: 6,
                              padding: '3px 10px', cursor: 'pointer', fontSize: 12,
                            }}
                          >
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leave Today Banner */}
      {isLeaveToday && (
        <div className="animate-fade-in" style={{
          padding: '14px 20px', borderRadius: 12, marginBottom: 20,
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid #8b5cf6',
          color: '#8b5cf6',
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 14,
        }}>
          <span style={{ fontSize: 24 }}>🏢</span>
          <div>
            <strong>Hôm nay bạn đang nghỉ: {todayLeaveReason}</strong>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              Hệ thống sẽ tự động bỏ qua check-in và check-out hôm nay.
            </div>
          </div>
        </div>
      )}

      {/* Leave Days Card */}
      <div className="card animate-fade-in" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>🏢 Ngày Nghỉ Phép</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Thêm ngày nghỉ thủ công — hệ thống sẽ không chạy check-in/out vào các ngày này
          </p>
        </div>

        {/* Add leave form */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
          padding: '14px', background: 'rgba(139,92,246,0.05)',
          borderRadius: 10, border: '1px solid rgba(139,92,246,0.2)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
            <label htmlFor="leave-date" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ngày</label>
            <input
              id="leave-date"
              type="date"
              value={newLeaveDate}
              onChange={(e) => setNewLeaveDate(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
            <label htmlFor="leave-reason" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lý do</label>
            <input
              id="leave-reason"
              type="text"
              value={newLeaveReason}
              onChange={(e) => setNewLeaveReason(e.target.value)}
              placeholder="Nghỉ phép, Việc cá nhân..."
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 18px', background: '#8b5cf6', border: 'none' }}
              disabled={leaveLoading || !newLeaveDate}
              onClick={addLeave}
            >
              {leaveLoading ? '⏳...' : '+ Thêm'}
            </button>
          </div>
        </div>

        {/* Leave list */}
        {leaves.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📆</div>
            <p style={{ margin: 0, fontSize: 13 }}>Chưa có ngày nghỉ nào. Thêm ngày nghỉ bằng form trên.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ngày</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Lý do</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Thạo tác</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => {
                  const todayISO = new Date().toISOString().slice(0, 10);
                  const isToday = l.date === todayISO;
                  const isPast = l.date < todayISO;
                  return (
                    <tr key={l.id} style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isToday ? 'rgba(139,92,246,0.07)' : 'transparent',
                      opacity: isPast ? 0.5 : 1,
                    }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isToday && <span style={{ fontSize: 10, background: '#8b5cf6', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>Hôm nay</span>}
                          {l.date.split('-').reverse().join('/')}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{l.reason}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => removeLeave(l.id)}
                          style={{
                            background: 'none', border: '1px solid var(--accent-red)',
                            color: 'var(--accent-red)', borderRadius: 6,
                            padding: '3px 10px', cursor: 'pointer', fontSize: 12,
                          }}
                          title="Xóa ngày nghỉ"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions + Connection Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Manual Actions */}
        <div className="card animate-fade-in">
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>🎯 Thao tác thủ công</h2>
          {(() => {
            const isSkipDay = isHolidayToday || isLeaveToday;
            let skipReason: string | null = null;
            if (isHolidayToday) skipReason = `Ngày lễ: ${todayHolidayName}`;
            else if (isLeaveToday) skipReason = `Ngày nghỉ: ${todayLeaveReason}`;
            return (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: skipReason ? 8 : 16 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, opacity: isSkipDay ? 0.45 : 1 }}
                    disabled={!!actionLoading || isSkipDay}
                    title={skipReason ?? undefined}
                    onClick={() => triggerAction('checkin')}
                  >
                    {actionLoading === 'checkin' ? '⏳ Đang xử lý...' : '🟢 Check-in'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, opacity: isSkipDay ? 0.45 : 1 }}
                    disabled={!!actionLoading || isSkipDay}
                    title={skipReason ?? undefined}
                    onClick={() => triggerAction('checkout')}
                  >
                    {actionLoading === 'checkout' ? '⏳ Đang xử lý...' : '🔴 Check-out'}
                  </button>
                </div>
                {skipReason && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 8, padding: '8px 12px',
                    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span>⛔</span>
                    <span>Check-in/out đã bị vô hiệu hóa — {skipReason}</span>
                  </div>
                )}
              </>
            );
          })()}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Email</span>
              <button
                onClick={toggleEmail}
                style={{
                  position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: emailConfig?.enabled ? 'var(--accent-emerald)' : 'var(--border-color)',
                  transition: 'background 0.2s',
                }}
                title={emailConfig?.enabled ? 'Nhấn để tắt' : 'Nhấn để bật'}
              >
                <span style={{
                  position: 'absolute', top: 2, left: emailConfig?.enabled ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
            {emailConfig?.enabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gửi tới</span>
                <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>{emailConfig.emailTo}</span>
              </div>
            )}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            💡 Bật email để nhận thông báo: Check-in/Check-out, thay đổi cấu hình, kết quả test
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
                      <span className={`badge ${log.action === 'checkin' ? 'success' : log.action === 'checkout' ? 'info' : 'info'}`}>
                        {log.action === 'checkin' ? '🟢 Check-in' : log.action === 'checkout' ? '🔵 Check-out' : log.action === 'test_odoo' ? '🔗 Test Odoo' : log.action === 'test_email' ? '📧 Test Email' : '⚙️ Config'}
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
