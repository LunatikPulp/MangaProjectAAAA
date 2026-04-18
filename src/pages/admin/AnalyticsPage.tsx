import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface MangaViewEntry {
  title: string;
  views: number;
}

interface ChapterViewEntry {
  manga: string;
  chapter: string;
  views: number;
}

interface TrafficSource {
  source: string;
  visits: number;
  percent: number;
}

interface ErrorEntry {
  time: string;
  code: number;
  path: string;
  message: string;
}

interface Stats {
  top_manga: MangaViewEntry[];
  top_chapters: ChapterViewEntry[];
  dau: number;
  mau: number;
  total_manga: number;
  total_views: number;
  popular_tags: { tag: string; count: number }[];
  traffic_sources: TrafficSource[];
  recent_errors: ErrorEntry[];
}

const EMPTY_STATS: Stats = {
  top_manga: [],
  top_chapters: [],
  dau: 0,
  mau: 0,
  total_manga: 0,
  total_views: 0,
  popular_tags: [],
  traffic_sources: [],
  recent_errors: [],
};

const AnalyticsPage: React.FC = () => {
  const token = localStorage.getItem('backend_token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [period, setPeriod] = useState<string>('');

  const fetchStats = async (p?: string) => {
    try {
      const url = p ? `${API_BASE}/admin/stats?period=${p}` : `${API_BASE}/admin/stats`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const d = await res.json();
        setStats({
          top_manga: (d.top_manga || []).map((m: any) => ({ title: m.title || m.manga_id, views: m.views || 0 })),
          top_chapters: (d.top_chapters || []).map((c: any) => ({ manga: c.manga || c.chapter_id, chapter: c.chapter || c.chapter_id, views: c.views || 0 })),
          dau: d.dau ?? 0,
          mau: d.mau ?? 0,
          total_manga: d.total_manga ?? 0,
          total_views: d.total_views ?? 0,
          popular_tags: (d.popular_genres || []).map((g: any) => ({ tag: g.tag || g.genre, count: g.count || 0 })),
          traffic_sources: (d.traffic_sources || []).map((s: any) => ({ source: s.source || '', visits: s.visits || 0, percent: s.percent || 0 })),
          recent_errors: d.recent_errors ?? [],
        });
      }
    } catch {}
  };

  useEffect(() => { fetchStats(period || undefined); }, [period]);

  const clearCache = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/clear-cache`, { method: 'POST', headers });
      setMsg(res.ok ? 'КЭШ ОЧИЩЕН' : 'ОШИБКА');
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const maxTagCount = Math.max(...stats.popular_tags.map(t => t.count), 1);
  const maxViews = Math.max(...stats.top_manga.map(m => m.views), 1);

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          АНАЛИТИКА<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/analytics</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>htop --springos</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>DAU</div>
            <div className="font-terminal text-[28px] springos-glow-green">{stats.dau.toLocaleString()}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>АКТИВНЫЕ В ДЕНЬ</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>MAU</div>
            <div className="font-terminal text-[28px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>{stats.mau.toLocaleString()}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>АКТИВНЫЕ В МЕСЯЦ</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>ТАЙТЛОВ</div>
            <div className="font-terminal text-[28px] springos-glow-green">{stats.total_manga.toLocaleString()}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>ВСЕГО В КАТАЛОГЕ</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>ПРОСМОТРЫ</div>
            <div className="font-terminal text-[24px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>{stats.total_views.toLocaleString()}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>ВСЕГО</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid #2a2420' }}>
        {([
          { key: '', label: 'ВСЁ ВРЕМЯ' },
          { key: 'month', label: 'ЗА МЕСЯЦ' },
          { key: 'week', label: 'ЗА НЕДЕЛЮ' },
          { key: 'day', label: 'ЗА СУТКИ' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setPeriod(tab.key)}
            className="font-terminal text-[13px] tracking-[1px] px-3 py-2 transition-all"
            style={{
              color: period === tab.key ? '#d4c8b0' : '#7a7060',
              background: period === tab.key ? 'rgba(90, 102, 56, 0.1)' : 'transparent',
              borderBottom: period === tab.key ? '2px solid #5a6638' : '2px solid transparent',
              cursor: 'pointer',
              border: 'none',
              borderBottomWidth: '2px',
              borderBottomStyle: 'solid',
              borderBottomColor: period === tab.key ? '#5a6638' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>ТОП 10 МАНГИ ПО ПРОСМОТРАМ</div>
            {stats.top_manga.length > 0 ? (
              <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
                <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                  <thead>
                    <tr><th>#</th><th>ТАЙТЛ</th><th>ПРОСМОТРЫ</th></tr>
                  </thead>
                  <tbody>
                    {stats.top_manga.map((m, i) => (
                      <tr key={i}>
                        <td className="font-code text-[12px]" style={{ color: '#7a7060' }}>{i + 1}</td>
                        <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{m.title}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div style={{ width: `${(m.views / maxViews) * 100}%`, minWidth: 2, height: 10, background: '#5a6638' }} />
                            <span className="font-code text-[11px] springos-glow-green">{m.views.toLocaleString()}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="font-code text-[12px] py-8 text-center" style={{ color: '#5a5040' }}>НЕТ ДАННЫХ</div>
            )}
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>ТОП 10 ГЛАВ</div>
            <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
              <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                <thead>
                  <tr><th>#</th><th>МАНГА</th><th>ГЛАВА</th><th>ПРОСМОТРЫ</th></tr>
                </thead>
                <tbody>
                  {stats.top_chapters.map((c, i) => (
                    <tr key={i}>
                      <td className="font-code text-[12px]" style={{ color: '#7a7060' }}>{i + 1}</td>
                      <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{c.manga}</td>
                      <td className="font-code text-[11px]" style={{ color: '#9b8c3b' }}>{c.chapter}</td>
                      <td className="font-code text-[11px] springos-glow-green">{c.views.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>ПОПУЛЯРНЫЕ ТЭГИ / ЖАНРЫ</div>
            <div className="flex flex-col gap-2">
              {stats.popular_tags.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="font-terminal text-[13px] w-[100px] text-right" style={{ color: '#9b8c3b' }}>{t.tag}</span>
                  <div className="flex-1" style={{ background: '#0e0d0c', height: 18, border: '1px solid #1e1a16' }}>
                    <div
                      style={{
                        width: `${(t.count / maxTagCount) * 100}%`,
                        minWidth: 2,
                        height: '100%',
                        background: i < 3 ? '#5a6638' : '#3a3028',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <span className="font-code text-[11px] w-[50px]" style={{ color: '#d4c8b0' }}>{t.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>ИСТОЧНИКИ ТРАФИКА</div>
            {stats.traffic_sources.length > 0 ? (
              <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
                <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                  <thead>
                    <tr><th>ИСТОЧНИК</th><th>ВИЗИТЫ</th><th>%</th></tr>
                  </thead>
                  <tbody>
                    {stats.traffic_sources.map((s, i) => (
                      <tr key={i}>
                        <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{s.source}</td>
                        <td className="font-code text-[12px]" style={{ color: '#9b8c3b' }}>{s.visits.toLocaleString()}</td>
                        <td className="font-code text-[12px] springos-glow-green">{s.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="font-code text-[12px] py-4 text-center" style={{ color: '#5a5040' }}>НЕТ ДАННЫХ — ТРЕКИНГ НЕ НАСТРОЕН</div>
            )}

            <div style={{ borderTop: '1px solid #2a2420', margin: '16px 0' }} />

            <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>ОШИБКИ И СКОРОСТЬ</div>
            {stats.recent_errors.length > 0 ? (
              <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
                <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                  <thead>
                    <tr><th>ВРЕМЯ</th><th>КОД</th><th>ПУТЬ</th><th>СООБЩЕНИЕ</th></tr>
                  </thead>
                  <tbody>
                    {stats.recent_errors.map((e, i) => (
                      <tr key={i}>
                        <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>{e.time}</td>
                        <td>
                          <span className={e.code >= 500 ? 'springos-badge-springlocked' : e.code >= 400 ? 'springos-badge-alive' : ''} style={{ fontSize: 12 }}>
                            {e.code}
                          </span>
                        </td>
                        <td className="font-code text-[11px]" style={{ color: '#d4c8b0' }}>{e.path}</td>
                        <td className="font-code text-[10px]" style={{ color: '#7a1616' }}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="font-code text-[12px] py-4 text-center" style={{ color: '#5a6638' }}>НЕТ ОШИБОК</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="springos-btn springos-btn-primary text-[14px]" onClick={clearCache} disabled={saving}>
          {saving ? '...' : 'ОЧИСТИТЬ КЭШ'}
        </button>
        {msg && (
          <div
            className="font-terminal text-[15px]"
            style={{
              color: msg.includes('ОШИБКА') ? '#7a1616' : '#39ff14',
              textShadow: `0 0 8px ${msg.includes('ОШИБКА') ? 'rgba(122,22,22,0.5)' : 'rgba(57,255,20,0.4)'}`,
            }}
          >
            {'>'} {msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
