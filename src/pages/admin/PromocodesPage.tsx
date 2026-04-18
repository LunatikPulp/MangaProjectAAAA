import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface Promocode {
  id: number;
  code: string;
  discount_percent: number;
  fixed_scrap: number;
  expires_at: string;
  usage_limit: number;
  usage_count: number;
  active: boolean;
}

const PromocodesPage: React.FC = () => {
  const [promocodes, setPromocodes] = useState<Promocode[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formDiscount, setFormDiscount] = useState(0);
  const [formFixedScrap, setFormFixedScrap] = useState(0);
  const [formExpires, setFormExpires] = useState('');
  const [formUsageLimit, setFormUsageLimit] = useState(100);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchPromocodes = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/promocodes`, { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d)) setPromocodes(d);
      }
    } catch {}
  };

  useEffect(() => { fetchPromocodes(); }, []);

  const create = async () => {
    if (!formCode.trim()) { setMsg('ВВЕДИТЕ КОД'); setTimeout(() => setMsg(''), 3000); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/promocodes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formCode.toUpperCase(),
          discount_percent: formDiscount,
          fixed_scrap: formFixedScrap,
          expires_at: formExpires || null,
          usage_limit: formUsageLimit,
          active: formActive,
        }),
      });
      if (res.ok) {
        setFormCode('');
        setFormDiscount(0);
        setFormFixedScrap(0);
        setFormExpires('');
        setFormUsageLimit(100);
        setFormActive(true);
        setShowForm(false);
        fetchPromocodes();
        setMsg('ПРОМОКОД СОЗДАН');
      } else {
        setMsg('ОШИБКА СОЗДАНИЯ');
      }
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const deletePromo = async (id: number) => {
    if (!confirm('УДАЛИТЬ ПРОМОКОД?')) return;
    try {
      await fetch(`${API_BASE}/admin/promocodes/${id}`, { method: 'DELETE', credentials: 'include' });
      fetchPromocodes();
    } catch {}
  };

  const isExpired = (expiresAt: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          ПРОМОКОДЫ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/workshop/promocodes</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>./promo_gen --list</span>
        </div>
      </div>

      <div className="mb-4">
        <button className="springos-btn springos-btn-glow text-[14px] springos-glitch-hover" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'ЗАКРЫТЬ' : '+ СОЗДАТЬ ПРОМОКОД'}
        </button>
      </div>

      {showForm && (
        <div className="springos-metal-frame springos-rust-dots rounded p-6 mb-6">
          <div className="relative z-10">
            <div className="font-terminal text-[18px] mb-4" style={{ color: '#d4c8b0' }}>НОВЫЙ ПРОМОКОД</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="font-terminal text-[13px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>КОД</div>
                <input className="springos-input py-2 px-3 w-full" placeholder="SPRING2026" value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} />
              </div>
              <div>
                <div className="font-terminal text-[13px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>СКИДКА %</div>
                <input className="springos-input py-2 px-3 w-full" type="number" min={0} max={100} value={formDiscount} onChange={e => setFormDiscount(Number(e.target.value))} />
              </div>
              <div>
                <div className="font-terminal text-[13px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ФИКСИРОВАННЫЙ SCRAP</div>
                <input className="springos-input py-2 px-3 w-full" type="number" min={0} value={formFixedScrap} onChange={e => setFormFixedScrap(Number(e.target.value))} />
              </div>
              <div>
                <div className="font-terminal text-[13px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ИСТЕКАЕТ</div>
                <input className="springos-input py-2 px-3 w-full" type="date" value={formExpires} onChange={e => setFormExpires(e.target.value)} />
              </div>
              <div>
                <div className="font-terminal text-[13px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ЛИМИТ ИСПОЛЬЗОВАНИЙ</div>
                <input className="springos-input py-2 px-3 w-full" type="number" min={1} value={formUsageLimit} onChange={e => setFormUsageLimit(Number(e.target.value))} />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`springos-toggle ${formActive ? 'active' : ''}`}
                    onClick={() => setFormActive(!formActive)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span className="font-terminal text-[13px]" style={{ color: formActive ? '#39ff14' : '#7a7060' }}>
                    {formActive ? 'АКТИВЕН' : 'ВЫКЛ'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button className="springos-btn springos-btn-glow text-[14px] springos-glitch-hover" onClick={create} disabled={saving}>
                {saving ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
        <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
          <thead>
            <tr>
              <th>КОД</th>
              <th>СКИДКА</th>
              <th>ИСПОЛЬЗОВАНИЯ</th>
              <th>ИСТЕКАЕТ</th>
              <th>СТАТУС</th>
              <th style={{ width: 80 }}>ДЕЙСТВИЕ</th>
            </tr>
          </thead>
          <tbody>
            {promocodes.map(p => {
              const expired = isExpired(p.expires_at) || !p.active;
              return (
                <tr key={p.id}>
                  <td className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{p.code}</td>
                  <td className="font-code text-[12px]">
                    {p.discount_percent > 0 && <span style={{ color: '#9b8c3b' }}>{p.discount_percent}%</span>}
                    {p.discount_percent > 0 && p.fixed_scrap > 0 && <span style={{ color: '#5a5040' }}> + </span>}
                    {p.fixed_scrap > 0 && <span className="springos-glow-green">{p.fixed_scrap} SCRAP</span>}
                    {p.discount_percent === 0 && p.fixed_scrap === 0 && <span style={{ color: '#7a7060' }}>—</span>}
                  </td>
                  <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>
                    {p.usage_count} / {p.usage_limit}
                  </td>
                  <td className="font-code text-[12px]" style={{ color: expired ? '#7a1616' : '#7a7060' }}>
                    {p.expires_at || 'БЕССРОЧНО'}
                  </td>
                  <td>
                    {expired ? (
                      <span className="springos-badge-springlocked">СПРИНГЛОК</span>
                    ) : (
                      <span className="springos-badge-alive">ЖИВ</span>
                    )}
                  </td>
                  <td>
                    <button className="springos-btn springos-btn-danger text-[12px] py-0.5 px-2" onClick={() => deletePromo(p.id)}>
                      УДАЛИТЬ
                    </button>
                  </td>
                </tr>
              );
            })}
            {promocodes.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="font-terminal text-[20px]" style={{ color: '#7a7060' }}>НЕТ ПРОМОКОДОВ</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div
          className="font-terminal text-[15px] mt-4"
          style={{
            color: msg.includes('ОШИБКА') || msg.includes('ВВЕДИТЕ') ? '#7a1616' : '#39ff14',
            textShadow: `0 0 8px ${msg.includes('ОШИБКА') || msg.includes('ВВЕДИТЕ') ? 'rgba(122,22,22,0.5)' : 'rgba(57,255,20,0.4)'}`,
          }}
        >
          {'>'} {msg}
        </div>
      )}
    </div>
  );
};

export default PromocodesPage;
