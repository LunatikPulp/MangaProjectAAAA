import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useReports } from '../../hooks/useReports';

const ReportsPage: React.FC = () => {
  const { reports, resolveReport, fetchReports } = useReports();

  useEffect(() => { fetchReports(); }, [fetchReports]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);
  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          КАМЕРЫ НАБЛЮДЕНИЯ — ЖАЛОБЫ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/night-staff/reports</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>grep -c "ALERT" /var/log/reports — {reports.length}</span>
        </div>
      </div>

      {/* Alert */}
      {pendingCount > 0 && (
        <div
          className="springos-blink-blood flex items-center gap-2 mb-4 p-2.5 rounded"
          style={{ background: 'rgba(122, 22, 22, 0.06)', border: '1px solid rgba(122, 22, 22, 0.15)' }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
            style={{ background: '#7a1616', boxShadow: '0 0 8px rgba(122, 22, 22, 0.6)' }}
          />
          <span className="font-terminal text-[16px]" style={{ color: '#7a1616' }}>
            ОБНАРУЖЕНО НЕОБРАБОТАННЫХ СИГНАЛОВ: {pendingCount}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'pending', label: 'ОЖИДАЮТ' },
          { key: 'resolved', label: 'РЕШЕНО' },
          { key: 'all', label: 'ВСЕ' },
        ] as const).map(f => (
          <button
            key={f.key}
            className={`springos-btn text-[13px] py-1 px-3 ${filter === f.key ? 'springos-btn-primary' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 font-code text-[11px]" style={{ color: '#7a1616' }}>
                ({pendingCount})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {filtered.length === 0 ? (
        <div className="springos-metal-frame springos-rust-dots rounded p-10 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[22px]" style={{ color: '#7a7060' }}>
              НЕТ АКТИВНЫХ СИГНАЛОВ
            </div>
            <div className="font-code text-[11px] mt-2" style={{ color: '#2a2420' }}>
              ВСЕ КАМЕРЫ РАБОТАЮТ В ШТАТНОМ РЕЖИМЕ
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map(report => (
            <div
              key={report.id}
              className="springos-vhs-entry"
              style={{
                padding: '12px 16px 12px 24px',
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                alignItems: 'center',
                gap: 14,
              }}
            >
              {/* Content */}
              <div className="min-w-0">
                <Link
                  to={`/manga/${report.mangaId}`}
                  target="_blank"
                  className="font-code text-[13px] hover:underline block truncate"
                  style={{ color: '#d4c8b0', textDecoration: 'none' }}
                >
                  {report.mangaTitle}
                </Link>
                {report.reason && (
                  <div className="font-code text-[11px] mt-0.5" style={{ color: '#7a1616' }}>
                    ПРИЧИНА: {report.reason}
                  </div>
                )}
                {report.message && (
                  <div className="font-code text-[10px] mt-0.5 truncate" style={{ color: '#8a8070' }}>
                    {report.message}
                  </div>
                )}
              </div>

              {/* Reporter */}
              <div className="font-code text-[11px] flex-shrink-0" style={{ color: '#9a9080' }}>
                {report.reportedBy}
              </div>

              {/* Timestamp */}
              <div className="font-code text-[10px] flex-shrink-0" style={{ color: '#7a7060' }}>
                {new Date(report.timestamp).toLocaleString('ru-RU')}
              </div>

              {/* Action */}
              <div className="flex-shrink-0">
                {report.status === 'pending' ? (
                  <button
                    className="springos-btn springos-btn-primary text-[12px] py-1 px-2.5 springos-glitch-hover"
                    onClick={() => resolveReport(report.id)}
                  >
                    РЕШЕНО
                  </button>
                ) : (
                  <span className="springos-badge-alive text-[12px]">РЕШЕНО</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
