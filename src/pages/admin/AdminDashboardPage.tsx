import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../../services/externalApiService';

// Simple SVG Icons as components
const IconEye = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconBook = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const IconDollar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconActivity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconHardDrive = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="12" x2="2" y2="12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    <line x1="6" y1="16" x2="6.01" y2="16" />
    <line x1="10" y1="16" x2="10.01" y2="16" />
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconTerminal = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconShopping = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const IconFileText = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconCpu = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);

interface SystemLog {
  icon: string;
  tag: string;
  tagColor: string;
  text: string;
  time: string;
}

interface TopTitle {
  rank: number;
  title: string;
  views: string;
  type: string;
  status: string;
}

interface DashboardStats {
  views_today: number;
  views_delta: number;
  active_users: number;
  active_delta: number;
  new_chapters: number;
  income_month: number;
  income_delta: number;
  total_accounts: number;
  online_now: number;
  premium_count: number;
  banned_count: number;
  banned_delta: number;
  coins_circulation: number;
  diamonds_issued: number;
  transactions_today: number;
  payments_today: number;
  top_titles: TopTitle[];
  recent_logs: SystemLog[];
  visits_30d: number[];
  visits_dates: string[];
  storage_total_bytes: number;
  storage_used_bytes: number;
  storage_percent: number;
  shop_purchases_today: number;
  scrap_spent_today: number;
  broken_reports: number;
  dmca_reports: number;
  recent_comments: {
    id: number;
    text: string;
    username: string;
    avatar_url: string;
    manga_title: string;
    manga_id: string;
    slug?: string;
    created_at: string | null;
  }[];
  comments_today: number;
}

interface CronStatus {
  status: string;
  is_running: boolean;
  last_run: string | null;
  chapters_found: number;
  errors: number;
}

const EMPTY_STATS: DashboardStats = {
  views_today: 0,
  views_delta: 0,
  active_users: 0,
  active_delta: 0,
  new_chapters: 0,
  income_month: 0,
  income_delta: 0,
  total_accounts: 0,
  online_now: 0,
  premium_count: 0,
  banned_count: 0,
  banned_delta: 0,
  coins_circulation: 0,
  diamonds_issued: 0,
  transactions_today: 0,
  payments_today: 0,
  top_titles: [],
  recent_logs: [],
  visits_30d: [],
  visits_dates: [],
  storage_total_bytes: 0,
  storage_used_bytes: 0,
  storage_percent: 0,
  shop_purchases_today: 0,
  scrap_spent_today: 0,
  broken_reports: 0,
  dmca_reports: 0,
  recent_comments: [],
  comments_today: 0,
};

const AdminDashboardPage: React.FC = () => {
  const [pendingReports, setPendingReports] = useState(0);

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [cronStatus, setCronStatus] = useState<CronStatus>({
    status: 'idle',
    is_running: false,
    last_run: null,
    chapters_found: 0,
    errors: 0
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; value: number; date: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('backend_token');
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [statsRes, visitsRes, auditRes, reportsRes, cronRes] = await Promise.all([
          fetch(`${API_BASE}/admin/stats`, { headers }),
          fetch(`${API_BASE}/admin/stats/visits`, { headers }),
          fetch(`${API_BASE}/admin/audit-log?limit=5`, { headers }).catch(() => null),
          fetch(`${API_BASE}/admin/reports`, { headers }).catch(() => null),
          fetch(`${API_BASE}/admin/cron/status`, { headers }).catch(() => null),
        ]);
        let serverStats: any = {};
        if (statsRes.ok) serverStats = await statsRes.json();

        let visits30d: number[] = [];
        let visitsDates: string[] = [];
        if (visitsRes.ok) {
          const vd: { date: string; visits: number }[] = await visitsRes.json();
          if (vd?.length > 0) {
            visits30d = vd.map(v => v.visits);
            visitsDates = vd.map(v => {
              const d = new Date(v.date);
              return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            });
          }
        }

        let recentLogs: SystemLog[] = [];
        if (auditRes?.ok) {
          const auditData = await auditRes.json();
          recentLogs = auditData.map((e: any) => {
            const isDanger = e.action.includes('УДАЛЕНИЕ') || e.action.includes('БЛОКИРОВКА');
            const isGrant = e.action.includes('НАЧИСЛЕНИЕ') || e.action.includes('ОДОБРЕНИЕ');
            return {
              icon: isDanger ? 'danger' : isGrant ? 'success' : 'info',
              tag: e.admin?.substring(0, 3).toUpperCase() || 'SYS',
              tagColor: isDanger ? '#8a3a3a' : isGrant ? '#5a8a3a' : '#b8a060',
              text: `${e.action} ${e.target}`.trim(),
              time: e.timestamp ? new Date(e.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
            };
          });
        }

        if (reportsRes?.ok) {
          const reportsData = await reportsRes.json();
          setPendingReports(Array.isArray(reportsData) ? reportsData.filter((r: any) => r.status === 'pending').length : 0);
        }

        if (cronRes?.ok) {
          const cronData = await cronRes.json();
          setCronStatus(cronData);
        }

        setStats({
          ...EMPTY_STATS,
          total_accounts: serverStats.total_users || 0,
          views_today: serverStats.total_views || 0,
          active_users: serverStats.dau || 0,
          online_now: serverStats.online_now || 0,
          new_chapters: serverStats.new_chapters_today || 0,
          premium_count: serverStats.premium_count || 0,
          banned_count: serverStats.banned_count || 0,
          coins_circulation: serverStats.total_scrap_circulation || 0,
          diamonds_issued: serverStats.total_scrap_earned || 0,
          transactions_today: serverStats.transactions_today || 0,
          payments_today: serverStats.payments_today_rub || 0,
          storage_total_bytes: serverStats.storage_total_bytes || 0,
          storage_used_bytes: serverStats.storage_used_bytes || 0,
          storage_percent: serverStats.storage_percent || 0,
          shop_purchases_today: serverStats.shop_purchases_today || 0,
          scrap_spent_today: serverStats.scrap_spent_today || 0,
          broken_reports: serverStats.broken_reports || 0,
          dmca_reports: serverStats.dmca_reports || 0,
          recent_comments: serverStats.recent_comments || [],
          comments_today: serverStats.comments_today || 0,
          income_month: serverStats.payments_today_rub || 0,
          top_titles: (serverStats.top_manga || []).map((m: any, i: number) => ({
            rank: i + 1,
            title: m.title || m.manga_id,
            views: m.views?.toLocaleString('ru-RU') || '0',
            type: 'Манга',
            status: 'Онгоинг',
          })),
          recent_logs: recentLogs,
          visits_30d: visits30d,
          visits_dates: visitsDates,
        });
      } catch {}
    })();
  }, []);

  const drawPulse = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const data = stats.visits_30d;
    if (!data.length) return;

    ctx.fillStyle = '#161412';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(196, 180, 84, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const step = w / (data.length - 1);
    const range = max - min || 1;

    // Area fill
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 24) - 12;
      i === 0 ? ctx.moveTo(x, h) : null;
      ctx.lineTo(x, y);
      if (i === data.length - 1) ctx.lineTo(x, h);
    });
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(90, 138, 58, 0.2)');
    grad.addColorStop(0.5, 'rgba(90, 138, 58, 0.08)');
    grad.addColorStop(1, 'rgba(90, 138, 58, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#7ab45a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 24) - 12;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 24) - 12;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#7ab45a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90, 138, 58, 0.2)';
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = 'rgba(184, 176, 168, 0.5)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(max.toLocaleString('ru-RU'), 8, 16);
    ctx.fillText(min.toLocaleString('ru-RU'), 8, h - 4);
  }, [stats.visits_30d]);

  useEffect(() => {
    drawPulse();
    const handleResize = () => drawPulse();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawPulse]);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'k';
    return n.toLocaleString('ru-RU');
  };

  const fmtRub = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₽`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}к₽`;
    return `${n}₽`;
  };

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <div className="sp-header-premium">
        <div className="sp-header-breadcrumb">
          <span>Dashboard</span> / <span style={{ color: '#c4b454' }}>Обзор</span>
        </div>
        <div className="sp-header-title">
          <span className="sp-status-dot success" style={{ animation: 'none' }} />
          Главная панель
        </div>
        <div className="sp-header-subtitle">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconTerminal />
            Система мониторинга и управления
          </span>
        </div>
      </div>

      {/* Premium Metrics Grid */}
      <div className="sp-grid-4">
        <div className="sp-metric-premium">
          <div className="sp-metric-icon success">
            <IconEye />
          </div>
          <div className="sp-metric-label-premium">Просмотров сегодня</div>
          <div className="sp-metric-value-premium success">{fmt(stats.views_today)}</div>
        </div>

        <div className="sp-metric-premium">
          <div className="sp-metric-icon success">
            <IconUsers />
          </div>
          <div className="sp-metric-label-premium">Активные пользователи</div>
          <div className="sp-metric-value-premium success">{fmt(stats.active_users)}</div>
        </div>

        <div className="sp-metric-premium">
          <div className="sp-metric-icon warning">
            <IconBook />
          </div>
          <div className="sp-metric-label-premium">Новых глав</div>
          <div className="sp-metric-value-premium warning">{stats.new_chapters}</div>
        </div>

        <div className="sp-metric-premium">
          <div className="sp-metric-icon warning">
            <IconDollar />
          </div>
          <div className="sp-metric-label-premium">Платежи сегодня</div>
          <div className="sp-metric-value-premium warning">{fmtRub(stats.payments_today)}</div>
        </div>
      </div>

      {/* Chart & Status Section */}
      <div className="sp-grid-2">
        {/* Chart Card */}
        <div className="sp-chart-premium" style={{ minHeight: '320px' }}>
          <div className="sp-chart-header-premium">
            <div>
              <div className="sp-chart-title-premium">
                <IconActivity />
                Посещаемость
              </div>
              <div className="sp-chart-subtitle">Статистика за последние 30 дней</div>
            </div>
            <div className="sp-chart-badge">
              <span style={{ width: '6px', height: '6px', background: '#7ab45a', borderRadius: '50%', boxShadow: '0 0 6px #7ab45a' }} />
              LIVE
            </div>
          </div>
          <div className="rounded overflow-hidden relative" style={{ height: '220px', background: '#161412', border: '1px solid #2a2620', borderRadius: '6px' }}>
            <canvas
              ref={canvasRef}
              className="w-full block"
              style={{ height: '220px', cursor: 'crosshair' }}
              onMouseMove={e => {
                const canvas = canvasRef.current;
                if (!canvas || stats.visits_30d.length === 0) { setHoveredPoint(null); return; }
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const stepX = rect.width / (stats.visits_30d.length - 1);
                const idx = Math.round(mouseX / stepX);
                if (idx < 0 || idx >= stats.visits_30d.length) { setHoveredPoint(null); return; }
                const maxVal = Math.max(...stats.visits_30d, 1);
                const minVal = Math.min(...stats.visits_30d, 0);
                const rangeY = maxVal - minVal || 1;
                const px = idx * stepX;
                const py = rect.height - ((stats.visits_30d[idx] - minVal) / rangeY) * (rect.height - 24) - 12;
                setHoveredPoint({ x: px, y: py, value: stats.visits_30d[idx], date: stats.visits_dates[idx] || '' });
              }}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            {hoveredPoint && (
              <>
                <div className="absolute top-0 pointer-events-none" style={{ left: hoveredPoint.x, width: 1, height: '100%', background: 'rgba(196, 180, 84, 0.3)' }} />
                <div className="absolute pointer-events-none font-mono text-xs px-3 py-2 rounded shadow-lg" style={{ left: Math.min(hoveredPoint.x + 12, (canvasRef.current?.getBoundingClientRect().width || 300) - 100), top: Math.max(hoveredPoint.y - 40, 8), background: '#1e1a16', border: '1px solid #3a3430', color: '#c4b454', whiteSpace: 'nowrap' }}>
                  {hoveredPoint.date}: <span style={{ color: '#7ab45a', fontWeight: 600 }}>{hoveredPoint.value}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* System Status Card */}
        <div className="sp-card-premium">
          <div className="sp-card-header">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
            <div className="sp-card-title">Состояние системы</div>
          </div>
          <div className="p-5 space-y-5">
            {/* Storage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2" style={{ color: '#7a7570', fontSize: '13px' }}>
                  <IconHardDrive />
                  Хранилище
                </div>
                <span className="font-mono text-sm" style={{ color: stats.storage_percent > 85 ? '#b45858' : '#b8b0a8' }}>
                  {(stats.storage_used_bytes / 1024 / 1024 / 1024).toFixed(1)} / {(stats.storage_total_bytes / 1024 / 1024 / 1024).toFixed(1)} GB
                </span>
              </div>
              <div className="sp-progress">
                <div 
                  className={`sp-progress-bar ${stats.storage_percent > 85 ? 'danger' : stats.storage_percent > 70 ? 'warning' : 'success'}`}
                  style={{ width: `${stats.storage_percent}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs font-mono" style={{ color: '#7a7570' }}>{stats.storage_percent}% использовано</span>
              </div>
            </div>

            {/* Shop & Scrap */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded" style={{ background: 'rgba(196, 180, 84, 0.05)', border: '1px solid #2a2620' }}>
                <div className="flex items-center gap-2 mb-1" style={{ color: '#7a7570', fontSize: '12px' }}>
                  <IconShopping />
                  Покупки
                </div>
                <div className="font-mono text-xl font-bold" style={{ color: '#7ab45a' }}>{stats.shop_purchases_today}</div>
              </div>
              <div className="p-3 rounded" style={{ background: 'rgba(196, 180, 84, 0.05)', border: '1px solid #2a2620' }}>
                <div className="flex items-center gap-2 mb-1" style={{ color: '#7a7570', fontSize: '12px' }}>
                  <IconDollar />
                  Scrap
                </div>
                <div className="font-mono text-xl font-bold" style={{ color: '#7ab45a' }}>{stats.scrap_spent_today.toLocaleString('ru-RU')}</div>
              </div>
            </div>

            {/* Alerts */}
            {stats.broken_reports > 0 || stats.dmca_reports > 0 ? (
              <div className="sp-alert-premium danger">
                <div className="sp-alert-icon-premium">
                  <IconAlert />
                </div>
                <div className="sp-alert-content-premium">
                  <div className="sp-alert-title-premium">Требуют внимания</div>
                  <div className="sp-alert-text-premium">
                    {stats.broken_reports > 0 && <div>{stats.broken_reports} жалоб на битые страницы</div>}
                    {stats.dmca_reports > 0 && <div>{stats.dmca_reports} DMCA запросов</div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="sp-alert-premium success">
                <div className="sp-alert-icon-premium">
                  <IconCheck />
                </div>
                <div className="sp-alert-content-premium">
                  <div className="sp-alert-title-premium">Все системы в норме</div>
                  <div className="sp-alert-text-premium">Критических инцидентов не обнаружено</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column: Logs & Top Titles */}
      <div className="sp-grid-2">
        {/* Audit Log */}
        <div className="sp-card-premium">
          <div className="sp-card-header">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
            <div className="sp-card-title">Аудит действий</div>
            <div className="ml-auto">
              <span className="sp-badge inactive">5 последних</span>
            </div>
          </div>
          <div>
            {stats.recent_logs.map((log, i) => (
              <div key={i} className="sp-list-item">
                <div className={`sp-list-icon ${log.icon}`}>
                  {log.icon === 'success' ? <IconCheck /> : log.icon === 'danger' ? <IconAlert /> : <IconActivity />}
                </div>
                <div className="sp-list-content">
                  <div className="sp-list-title">{log.text}</div>
                  <div className="sp-list-subtitle">
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '4px', 
                      background: `${log.tagColor}15`, 
                      color: log.tagColor,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}>
                      {log.tag}
                    </span>
                  </div>
                </div>
                <div className="sp-list-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <IconClock />
                    {log.time}
                  </span>
                </div>
              </div>
            ))}
            {stats.recent_logs.length === 0 && (
              <div className="p-8 text-center" style={{ color: '#7a7570' }}>
                Нет действий
              </div>
            )}
          </div>
        </div>

        {/* Top Titles */}
        <div className="sp-card-premium">
          <div className="sp-card-header">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
            <div className="sp-card-title">Топ тайтлов</div>
            <div className="ml-auto">
              <span className="sp-badge success">Сегодня</span>
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="sp-table-premium">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th>Тайтл</th>
                  <th className="w-24 text-right">Просмотры</th>
                  <th className="w-20">Статус</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_titles.length > 0 ? stats.top_titles.map(t => (
                  <tr key={t.rank}>
                    <td className="sp-table-rank">{t.rank}</td>
                    <td style={{ color: '#e8e0d8', fontWeight: 500 }}>{t.title}</td>
                    <td className="sp-table-value">{t.views}</td>
                    <td>
                      <span className={`sp-badge ${t.status === 'Завершён' ? 'inactive' : 'success'}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="text-center py-8" style={{ color: '#7a7570' }}>
                      Нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Users Summary */}
      <div className="sp-card-premium">
        <div className="sp-card-header">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
          <div className="sp-card-title">Пользователи</div>
          <div className="ml-auto">
            <Link to="/admin/night-staff/users" className="sp-btn-premium text-xs no-underline" style={{ padding: '6px 12px' }}>
              Подробнее →
            </Link>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg" style={{ background: 'rgba(196, 180, 84, 0.03)', border: '1px solid #2a2620' }}>
              <div style={{ color: '#7a7570', fontSize: '12px', marginBottom: '8px' }}>Всего аккаунтов</div>
              <div className="font-mono text-2xl font-bold" style={{ color: '#e8e0d8' }}>{fmt(stats.total_accounts)}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'rgba(90, 138, 58, 0.05)', border: '1px solid #2a2620' }}>
              <div style={{ color: '#7a7570', fontSize: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="sp-status-dot success" />
                Онлайн
              </div>
              <div className="font-mono text-2xl font-bold" style={{ color: '#7ab45a' }}>{fmt(stats.online_now)}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'rgba(196, 180, 84, 0.05)', border: '1px solid #2a2620' }}>
              <div style={{ color: '#7a7570', fontSize: '12px', marginBottom: '8px' }}>SPRINGPRO</div>
              <div className="font-mono text-2xl font-bold" style={{ color: '#c4b454' }}>{stats.premium_count}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'rgba(138, 58, 58, 0.05)', border: '1px solid #2a2620' }}>
              <div style={{ color: '#7a7570', fontSize: '12px', marginBottom: '8px' }}>Заблокировано</div>
              <div className="font-mono text-2xl font-bold" style={{ color: '#b45858' }}>{stats.banned_count}</div>
            </div>
          </div>
          
          {pendingReports > 0 && (
            <div className="mt-4 p-4 rounded-lg flex items-center gap-3" style={{ background: 'rgba(138, 58, 58, 0.08)', border: '1px solid rgba(138, 58, 58, 0.2)' }}>
              <IconAlert />
              <span style={{ color: '#b45858', fontWeight: 500 }}>
                {pendingReports} неотвеченных жалоб требуют внимания
              </span>
              <Link to="/admin/night-staff/reports" className="ml-auto sp-btn-premium-danger text-xs no-underline" style={{ padding: '6px 12px' }}>
                Перейти
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Two Column: Cron & Comments */}
      <div className="sp-grid-2">
        {/* Cron Status */}
        <div className="sp-card-premium">
          <div className="sp-card-header">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: cronStatus.is_running ? '#7ab45a' : '#7a7570' }} />
            <div className="sp-card-title">Активность автоматов</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(196, 180, 84, 0.03)', border: '1px solid #2a2620' }}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${cronStatus.is_running ? 'sp-status-dot success' : ''}`} style={{ background: cronStatus.is_running ? '#7ab45a' : '#7a7570' }} />
                <span style={{ color: '#b8b0a8' }}>Статус Cron</span>
              </div>
              <span className={`sp-badge ${cronStatus.is_running ? 'success' : 'inactive'}`}>
                {cronStatus.is_running ? 'Активен' : 'Остановлен'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(196, 180, 84, 0.03)', border: '1px solid #2a2620' }}>
              <div className="flex items-center gap-3">
                <IconFileText />
                <span style={{ color: '#b8b0a8' }}>Найдено глав</span>
              </div>
              <span className="font-mono text-lg font-bold" style={{ color: cronStatus.chapters_found > 0 ? '#7ab45a' : '#7a7570' }}>
                {cronStatus.chapters_found}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(196, 180, 84, 0.03)', border: '1px solid #2a2620' }}>
              <div className="flex items-center gap-3">
                <IconAlert />
                <span style={{ color: '#b8b0a8' }}>Ошибки парсинга</span>
              </div>
              <span className="font-mono text-lg font-bold" style={{ color: cronStatus.errors > 0 ? '#b45858' : '#7a7570' }}>
                {cronStatus.errors}
              </span>
            </div>

            {cronStatus.last_run && (
              <div className="p-3 rounded text-xs font-mono" style={{ background: 'rgba(90, 138, 58, 0.05)', border: '1px solid rgba(90, 138, 58, 0.2)', color: '#7ab45a' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconClock />
                  Последний запуск: {new Date(cronStatus.last_run).toLocaleString('ru-RU')}
                </span>
              </div>
            )}
            
            {!cronStatus.is_running && (
              <div className="sp-alert-premium danger">
                <div className="sp-alert-icon-premium">
                  <IconAlert />
                </div>
                <div className="sp-alert-content-premium">
                  <div className="sp-alert-title-premium">Парсеры остановлены</div>
                  <div className="sp-alert-text-premium">Запустите в разделе "Импорт каталога"</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Comments */}
        <div className="sp-card-premium">
          <div className="sp-card-header">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
            <div className="sp-card-title">Последние комментарии</div>
            {stats.comments_today > 0 && (
              <div className="ml-auto">
                <span className="sp-badge success">+{stats.comments_today} сегодня</span>
              </div>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {stats.recent_comments && stats.recent_comments.length > 0 ? (
              <div>
                {stats.recent_comments.map((c) => {
                  const ago = c.created_at ? (() => {
                    const diff = Date.now() - new Date(c.created_at + 'Z').getTime();
                    const m = Math.floor(diff / 60000);
                    if (m < 1) return 'только что';
                    if (m < 60) return `${m} мин.`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `${h} ч.`;
                    return `${Math.floor(h / 24)} дн.`;
                  })() : '';
                  return (
                    <Link
                      key={c.id}
                      to={`/manga/${c.slug || c.manga_id}`}
                      className="sp-list-item no-underline"
                    >
                      <img
                        src={c.avatar_url?.startsWith('/') ? `${API_BASE}${c.avatar_url}` : (c.avatar_url || `${API_BASE}/static/avatars/default.png`)}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        style={{ border: '2px solid #2a2620' }}
                      />
                      <div className="sp-list-content">
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color: '#c4b454', fontWeight: 600 }}>{c.username}</span>
                          <span style={{ color: '#5a5040', fontSize: '12px' }}>• {ago}</span>
                        </div>
                        <div className="sp-list-subtitle" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {c.text}
                        </div>
                        <div style={{ color: '#5a5040', fontSize: '12px', marginTop: '4px' }}>{c.manga_title}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center" style={{ color: '#7a7570' }}>
                Нет активности
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="sp-card-premium">
        <div className="sp-card-header">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#c4b454' }} />
          <div className="sp-card-title">Быстрые действия</div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'Создать мангу', to: '/admin/archives/manga/new', variant: 'primary', icon: <IconPlus /> },
              { label: 'Импорт', to: '/admin/network/parser', variant: 'default', icon: <IconDownload /> },
              { label: 'Пользователи', to: '/admin/night-staff/users', variant: 'default', icon: <IconUsers /> },
              { label: 'Жалобы', to: '/admin/night-staff/reports', variant: pendingReports > 0 ? 'danger' : 'default', icon: <IconAlert />, badge: pendingReports },
              { label: 'Магазин', to: '/admin/workshop/shop', variant: 'default', icon: <IconShopping /> },
              { label: 'Аудит', to: '/admin/network/audit', variant: 'default', icon: <IconFileText /> },
              { label: 'Безопасность', to: '/admin/network/security', variant: 'default', icon: <IconShield /> },
              { label: 'Настройки', to: '/admin/network/settings', variant: 'default', icon: <IconSettings /> },
            ].map((action, i) => (
              <Link
                key={i}
                to={action.to}
                className={`sp-btn-premium ${action.variant === 'primary' ? 'sp-btn-premium-primary' : action.variant === 'danger' ? 'sp-btn-premium-danger' : ''} no-underline flex-col gap-2`}
                style={{ padding: '16px 12px', textAlign: 'center' }}
              >
                <span style={{ color: action.variant === 'primary' ? '#7ab45a' : action.variant === 'danger' ? '#b45858' : '#c4b454', fontSize: '20px' }}>
                  {action.icon}
                </span>
                <span className="text-xs">{action.label}</span>
                {action.badge && action.badge > 0 && (
                  <span className="sp-badge danger" style={{ position: 'absolute', top: '-6px', right: '-6px', padding: '2px 8px', fontSize: '10px' }}>
                    {action.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Premium Footer */}
      <div className="sp-footer-premium">
        <div className="sp-footer-left">
          <IconCpu />
          <span>AFTON ROBOTICS INC. — SPRINGOS v4.0</span>
        </div>
        <div className="sp-footer-right">
          <div className="sp-footer-status">
            <span className="sp-status-dot success" />
            Система онлайн
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;