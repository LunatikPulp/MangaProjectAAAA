import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface AuditEntry {
  id: number;
  admin: string;
  action: string;
  target: string;
  timestamp: string;
}

const ACTION_COLORS: Record<string, string> = {
  'УДАЛЕНИЕ': '#7a1616',
  'БЛОКИРОВКА': '#7a1616',
  'НАЧИСЛЕНИЕ': '#39ff14',
  'ОДОБРЕНИЕ': '#39ff14',
  'ЗАПУСК': '#9b8c3b',
  'ИМПОРТ': '#9b8c3b',
  'СМЕНА': '#5a6638',
  'РЕДАКТИРОВАНИЕ': '#d4c8b0',
};

const getActionColor = (action: string): string => {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return color;
  }
  return '#d4c8b0';
};

const AuditPage: React.FC = () => {
  const headers = { 'Content-Type': 'application/json' };

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/audit-log`, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.map((e: any) => ({
          id: e.id,
          admin: e.admin || e.username || 'unknown',
          action: e.action,
          target: e.target,
          timestamp: e.timestamp || e.created_at,
        })));
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const filtered = filter
    ? entries.filter(e => e.action.toLowerCase().includes(filter.toLowerCase()) || e.admin.toLowerCase().includes(filter.toLowerCase()) || e.target.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  if (loading) return (
    <div className="p-10">
      <div className="font-terminal text-[22px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
        ЗАГРУЗКА КАССЕТЫ<span className="springos-cursor" />
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          КАССЕТА БЕЗОПАСНОСТИ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/audit</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>cat /var/log/vhs_audit.tape</span>
        </div>
      </div>

      {/* Terminal status bar */}
      <div className="rounded overflow-hidden mb-4" style={{ border: '1px solid #2a2420' }}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: '#1a1816' }}>
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ff4444' }} />
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#ffdd57' }} />
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#39ff14' }} />
          </div>
          <span className="font-code text-[11px] ml-2" style={{ color: '#8a8070' }}>
            springtrap@afton-robotics: ~/audit
          </span>
          <span className="springos-rec ml-auto">REC</span>
          <span className="font-code text-[9px]" style={{ color: '#7a7060' }}>
            {entries.length} записей
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="springos-input py-2 px-3"
          style={{ width: 300, maxWidth: '100%' }}
          placeholder="> ПОИСК ПО ЗАПИСЯМ..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="springos-metal-frame rounded p-10 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[22px]" style={{ color: '#7a7060' }}>КАССЕТА ПУСТА</div>
            <div className="font-code text-[10px] mt-2" style={{ color: '#5a5040' }}>НЕТ ЗАПИСЕЙ</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[2px]">
          {filtered.map((entry, idx) => {
            const actionColor = getActionColor(entry.action);
            const isDanger = entry.action.includes('УДАЛЕНИЕ') || entry.action.includes('БЛОКИРОВКА');

            return (
              <div
                key={entry.id}
                className="springos-vhs-entry"
                style={{
                  padding: '10px 16px 10px 26px',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 1fr 150px',
                  alignItems: 'center',
                  gap: 12,
                  animationDelay: `${idx * 30}ms`,
                }}
              >
                {/* Admin */}
                <div className="font-terminal text-[15px] truncate" style={{ color: '#9b8c3b' }}>
                  {entry.admin}
                </div>

                {/* Action */}
                <div className="flex items-center gap-2">
                  {isDanger && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: '#7a1616', boxShadow: '0 0 4px rgba(122,22,22,0.5)' }}
                    />
                  )}
                  <span
                    className="font-code text-[12px] uppercase tracking-wider"
                    style={{ color: actionColor }}
                  >
                    {entry.action}
                  </span>
                </div>

                {/* Target */}
                <div
                  className="font-code text-[12px] truncate"
                  style={{ color: '#d4c8b0' }}
                  title={entry.target}
                >
                  {entry.target}
                </div>

                {/* Timestamp */}
                <div className="font-code text-[10px] text-right" style={{ color: '#7a7060' }}>
                  {new Date(entry.timestamp).toLocaleString('ru-RU')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VHS Static Footer */}
      <div className="mt-4 py-2 text-center font-code text-[9px]" style={{ color: '#5a5040' }}>
        ▮▮▮ КОНЕЦ ЗАПИСИ — FAZBEAR ENTERTAINMENT INC. ▮▮▮
      </div>
    </div>
  );
};

export default AuditPage;
