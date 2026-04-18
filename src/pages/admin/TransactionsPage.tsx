import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface Transaction {
  id: number;
  date: string;
  username: string;
  type: 'grant' | 'deduct';
  amount: number;
  reason: string;
}

const TransactionsPage: React.FC = () => {
  const token = localStorage.getItem('backend_token') || '';
  const headers = { Authorization: `Bearer ${token}` };

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'grant' | 'deduct'>('all');

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/transactions`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.map((t: any) => ({
          id: t.id,
          date: t.created_at || t.date,
          username: t.username,
          type: t.amount >= 0 ? 'grant' : 'deduct',
          amount: Math.abs(t.amount),
          reason: t.reason || '',
        })));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);

  const totalGrant = transactions.filter(t => t.type === 'grant').reduce((s, t) => s + t.amount, 0);
  const totalDeduct = transactions.filter(t => t.type === 'deduct').reduce((s, t) => s + t.amount, 0);

  if (loading) return (
    <div className="p-10">
      <div className="font-terminal text-[22px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
        ЗАГРУЗКА ТРАНЗАКЦИЙ<span className="springos-cursor" />
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          SCRAP — ЖУРНАЛ ТРАНЗАКЦИЙ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/workshop/transactions</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>tail -f scrap.log --count {transactions.length}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="springos-metal-frame springos-rust-dots rounded p-3 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[11px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ВСЕГО НАЧИСЛЕНО</div>
            <div className="font-terminal text-[24px] springos-glow-green">+{totalGrant}</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-3 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[11px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ВСЕГО СПИСАНО</div>
            <div className="font-terminal text-[24px] springos-glow-blood" style={{ color: '#7a1616' }}>-{totalDeduct}</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-3 text-center">
          <div className="relative z-10">
            <div className="font-terminal text-[11px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>БАЛАНС</div>
            <div className="font-terminal text-[24px] springos-glow-mustard">{totalGrant - totalDeduct}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'all', label: 'ВСЕ' },
          { key: 'grant', label: 'НАЧИСЛЕНИЯ' },
          { key: 'deduct', label: 'СПИСАНИЯ' },
        ] as const).map(f => (
          <button
            key={f.key}
            className={`springos-btn text-[13px] py-1 px-3 ${filter === f.key ? 'springos-btn-primary' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
        <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
          <thead>
            <tr>
              <th>ДАТА</th>
              <th>СУБЪЕКТ</th>
              <th>ТИП</th>
              <th>СУММА</th>
              <th>ПРИЧИНА</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>
                  {new Date(t.date).toLocaleString('ru-RU')}
                </td>
                <td className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>
                  {t.username}
                </td>
                <td>
                  {t.type === 'grant' ? (
                    <span className="springos-badge-alive text-[12px]">НАЧИСЛЕНИЕ</span>
                  ) : (
                    <span className="springos-badge-springlocked text-[12px]" style={{ animation: 'none' }}>СПИСАНИЕ</span>
                  )}
                </td>
                <td className="font-code text-[13px]">
                  <span className={t.type === 'grant' ? 'springos-glow-green' : 'springos-glow-blood'}>
                    {t.type === 'grant' ? '+' : '-'}{t.amount}
                  </span>
                </td>
                <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>
                  {t.reason || '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 font-terminal text-[18px]" style={{ color: '#7a7060' }}>
                  НЕТ ТРАНЗАКЦИЙ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsPage;
