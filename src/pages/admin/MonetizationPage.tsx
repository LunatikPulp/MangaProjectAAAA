import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface RevenueStats {
  total_scrap: number;
  total_purchases: number;
  ad_revenue: number;
  payments_today: number;
}

const MonetizationPage: React.FC = () => {
  const token = localStorage.getItem('backend_token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [adsenseClientId, setAdsenseClientId] = useState('');
  const [directAdHtml, setDirectAdHtml] = useState('');
  const [donationUrl, setDonationUrl] = useState('');
  const [premiumPrice, setPremiumPrice] = useState('');
  const [adCpmRub, setAdCpmRub] = useState('50');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [revenue, setRevenue] = useState<RevenueStats>({ total_scrap: 0, total_purchases: 0, ad_revenue: 0, payments_today: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/admin/settings`, { headers }),
          fetch(`${API_BASE}/admin/stats`, { headers }),
        ]);
        if (settingsRes.ok) {
          const d = await settingsRes.json();
          setAdsenseClientId(d.adsense_client_id ?? '');
          setDirectAdHtml(d.direct_ad_html ?? '');
          setDonationUrl(d.donation_url ?? '');
          setPremiumPrice(d.premium_price ?? '');
          setAdCpmRub(d.ad_cpm_rub ?? '50');
        }
        if (statsRes.ok) {
          const s = await statsRes.json();
          setRevenue({
            total_scrap: s.total_scrap_earned ?? 0,
            total_purchases: s.total_purchases ?? 0,
            ad_revenue: s.ad_revenue_rub ?? 0,
            payments_today: s.payments_today_rub ?? 0,
          });
        }
      } catch {}
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          adsense_client_id: adsenseClientId,
          direct_ad_html: directAdHtml,
          donation_url: donationUrl,
          premium_price: premiumPrice,
          ad_cpm_rub: adCpmRub,
        }),
      });
      setMsg(res.ok ? 'НАСТРОЙКИ СОХРАНЕНЫ' : 'ОШИБКА СОХРАНЕНИЯ');
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          МОНЕТИЗАЦИЯ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/workshop/monetization</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>./revenue_ctl --config</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>SCRAP</div>
            <div className="font-terminal text-[28px] springos-glow-green">{revenue.total_scrap.toLocaleString('ru-RU')}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>ВСЕГО ЗАРАБОТАНО</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>ПОКУПКИ</div>
            <div className="font-terminal text-[28px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>{revenue.total_purchases.toLocaleString('ru-RU')}</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>ВСЕГО ТРАНЗАКЦИЙ</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>РЕКЛАМА</div>
            <div className="font-terminal text-[28px]" style={{ color: '#d4c8b0' }}>{revenue.ad_revenue.toLocaleString('ru-RU')}₽</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>ОЦЕНОЧНЫЙ ДОХОД (CPM × ПРОСМОТРЫ)</div>
          </div>
        </div>
        <div className="springos-metal-frame springos-rust-dots rounded p-4">
          <div className="relative z-10 text-center">
            <div className="font-terminal text-[12px] tracking-[2px]" style={{ color: '#7a7060' }}>ПЛАТЕЖИ</div>
            <div className="font-terminal text-[24px] springos-glow-green" style={{ color: '#39ff14' }}>{revenue.payments_today.toLocaleString('ru-RU')}₽</div>
            <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>СЕГОДНЯ</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>GOOGLE ADSENSE</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ADSENSE CLIENT ID</div>
              <input className="springos-input py-2 px-3 w-full" placeholder="ca-pub-XXXXXXXXXX" value={adsenseClientId} onChange={e => setAdsenseClientId(e.target.value)} />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>ИДЕНТИФИКАТОР КЛИЕНТА ADSENSE ДЛЯ АВТОМАТИЧЕСКОЙ РЕКЛАМЫ</div>
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>CPM СТАВКА (РУБ / 1000 ПРОСМОТРОВ)</div>
              <input className="springos-input py-2 px-3 w-full" type="number" min={0} step={0.01} placeholder="50" value={adCpmRub} onChange={e => setAdCpmRub(e.target.value)} />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>ОЦЕНКА ДОХОДА = ПРОСМОТРЫ × CPM / 1000. ОБНОВИТЕ ПО ДАННЫМ ADSENSE</div>
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>ПРЯМАЯ РЕКЛАМА</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>HTML-КОД БАННЕРА</div>
              <textarea
                className="springos-input w-full py-2 px-3 resize-none"
                style={{ height: 120 }}
                placeholder={'<div class="ad-banner">...</div>'}
                value={directAdHtml}
                onChange={e => setDirectAdHtml(e.target.value)}
              />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>ПРОИЗВОЛЬНЫЙ HTML-КОД ДЛЯ РАЗМЕЩЕНИЯ БАННЕРА</div>
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>ДОНАТЫ</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>URL ДЛЯ ДОНАТОВ</div>
              <input className="springos-input py-2 px-3 w-full" placeholder="https://boosty.to/..." value={donationUrl} onChange={e => setDonationUrl(e.target.value)} />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>ССЫЛКА НА ПЛАТФОРМУ ДЛЯ ПОДДЕРЖКИ ПРОЕКТА</div>
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>PREMIUM ПОДПИСКА</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ЦЕНА PREMIUM (РУБ/МЕС)</div>
              <input className="springos-input py-2 px-3 w-full" type="number" placeholder="149" value={premiumPrice} onChange={e => setPremiumPrice(e.target.value)} />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>СТОИМОСТЬ МЕСЯЧНОЙ ПОДПИСКИ В РУБЛЯХ</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="springos-btn springos-btn-glow text-[16px] springos-glitch-hover" onClick={save} disabled={saving}>
          {saving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ НАСТРОЙКИ'}
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

export default MonetizationPage;
