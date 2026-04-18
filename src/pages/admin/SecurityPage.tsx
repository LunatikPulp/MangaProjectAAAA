import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface LoginEntry {
  id: number;
  ip: string;
  username: string;
  time: string;
  status: string;
}

const SecurityPage: React.FC = () => {
  const headers = { 'Content-Type': 'application/json' };

  const [sslEnforce, setSslEnforce] = useState(true);
  const [ipBlacklist, setIpBlacklist] = useState('');
  const [rateLimit, setRateLimit] = useState(true);
  const [rateLimitRpm, setRateLimitRpm] = useState(60);
  const [antiBot, setAntiBot] = useState(false);
  const [captchaRegister, setCaptchaRegister] = useState(true);
  const [captchaLogin, setCaptchaLogin] = useState(false);
  const [suspiciousAlerts, setSuspiciousAlerts] = useState(true);
  const [dmcaEmail, setDmcaEmail] = useState('');
  const [dmcaAutoTakedown, setDmcaAutoTakedown] = useState(0);
  const [hotlinkProtection, setHotlinkProtection] = useState(false);
  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [middlewareStatus, setMiddlewareStatus] = useState<{ active: string[]; inactive: string[] }>({ active: [], inactive: [] });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`, { headers });
        if (res.ok) {
          const d = await res.json();
          setSslEnforce(d.ssl_enforce ?? true);
          setIpBlacklist(d.ip_blacklist ?? '');
          setRateLimit(d.rate_limit ?? true);
          setRateLimitRpm(d.rate_limit_rpm ?? 60);
          setAntiBot(d.anti_bot ?? false);
          setCaptchaRegister(d.captcha_register ?? true);
          setCaptchaLogin(d.captcha_login ?? false);
          setSuspiciousAlerts(d.suspicious_alerts ?? true);
          setDmcaEmail(d.dmca_email ?? '');
          setDmcaAutoTakedown(d.dmca_auto_takedown ?? 0);
          setHotlinkProtection(d.hotlink_protection ?? false);
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/admin/logins`, { headers });
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d)) setLogins(d.slice(0, 20));
        }
      } catch {}
      const active: string[] = [];
      const inactive: string[] = [];
      if (sslEnforce) active.push('SSL/HTTPS'); else inactive.push('SSL/HTTPS');
      if (rateLimit) active.push('RATE LIMIT'); else inactive.push('RATE LIMIT');
      if (antiBot) active.push('АНТИ-БОТ'); else inactive.push('АНТИ-БОТ');
      if (captchaRegister) active.push('КАПЧА РЕГИСТРАЦИИ'); else inactive.push('КАПЧА РЕГИСТРАЦИИ');
      if (captchaLogin) active.push('КАПЧА ВХОДА'); else inactive.push('КАПЧА ВХОДА');
      if (hotlinkProtection) active.push('HOTLINK ЗАЩИТА'); else inactive.push('HOTLINK ЗАЩИТА');
      if (ipBlacklist.trim()) active.push('IP ЧЁРНЫЙ СПИСОК'); else inactive.push('IP ЧЁРНЫЙ СПИСОК');
      setMiddlewareStatus({ active, inactive });
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
          ssl_enforce: sslEnforce,
          ip_blacklist: ipBlacklist,
          rate_limit: rateLimit,
          rate_limit_rpm: rateLimitRpm,
          anti_bot: antiBot,
          captcha_register: captchaRegister,
          captcha_login: captchaLogin,
          suspicious_alerts: suspiciousAlerts,
          dmca_email: dmcaEmail,
          dmca_auto_takedown: dmcaAutoTakedown,
          hotlink_protection: hotlinkProtection,
        }),
      });
      setMsg(res.ok ? 'НАСТРОЙКИ СОХРАНЕНЫ' : 'ОШИБКА СОХРАНЕНИЯ');
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const Toggle = ({ val, setVal }: { val: boolean; setVal: (v: boolean) => void }) => (
    <div
      className={`springos-toggle ${val ? 'active' : ''}`}
      onClick={() => setVal(!val)}
      style={{ transform: 'scale(1.1)', cursor: 'pointer' }}
    />
  );

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          БЕЗОПАСНОСТЬ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/security</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>iptables -L --springos</span>
        </div>
      </div>

      <div className="springos-metal-frame springos-rust-dots rounded p-4 mb-6">
        <div className="relative z-10">
          <div className="font-terminal text-[18px] mb-3" style={{ color: '#d4c8b0' }}>СТАТУС MIDDLEWARE</div>
          <div className="font-code text-[10px] mb-3" style={{ color: '#5a5040' }}>БЕЗОПАСНОСТЬ ПРИМЕНЯЕТСЯ АВТОМАТИЧЕСКИ (КЕШ 60С) ПРИ СОХРАНЕНИИ НАСТРОЕК</div>
          <div className="flex flex-wrap gap-2">
            {middlewareStatus.active.map(s => (
              <span key={s} className="springos-badge-alive font-terminal text-[11px]">{s} ✓</span>
            ))}
            {middlewareStatus.inactive.map(s => (
              <span key={s} className="font-terminal text-[11px] px-2 py-1 rounded" style={{ color: '#7a7060', border: '1px solid #2a2420' }}>{s} ✗</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>ЗАЩИТА СЕТИ</div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>ПРИНУДИТЕЛЬНЫЙ SSL/HTTPS</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>РЕДИРЕКТ HTTP → HTTPS</div>
                </div>
                <Toggle val={sslEnforce} setVal={setSslEnforce} />
              </div>
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ЧЁРНЫЙ СПИСОК IP</div>
              <textarea
                className="springos-input w-full py-2 px-3 resize-none"
                style={{ height: 100 }}
                placeholder={"192.168.1.1\n10.0.0.0/24\n91.202.114.3"}
                value={ipBlacklist}
                onChange={e => setIpBlacklist(e.target.value)}
              />
              <div className="font-code text-[9px] mt-1" style={{ color: '#5a5040' }}>ОДИН IP / CIDR НА СТРОКУ</div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>ОГРАНИЧЕНИЕ ЗАПРОСОВ</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>RATE LIMITING</div>
                </div>
                <Toggle val={rateLimit} setVal={setRateLimit} />
              </div>
            </div>

            {rateLimit && (
              <div className="mb-4">
                <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ЗАПРОСОВ В МИНУТУ</div>
                <input className="springos-input py-2 px-3 w-full" type="number" min={1} max={10000} value={rateLimitRpm} onChange={e => setRateLimitRpm(Number(e.target.value))} />
              </div>
            )}

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>АНТИ-БОТ ЗАЩИТА</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>ОБНАРУЖЕНИЕ АВТОМАТИЗИРОВАННЫХ ЗАПРОСОВ</div>
                </div>
                <Toggle val={antiBot} setVal={setAntiBot} />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>КАПЧА ПРИ РЕГИСТРАЦИИ</div>
                </div>
                <Toggle val={captchaRegister} setVal={setCaptchaRegister} />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>КАПЧА ПРИ ВХОДЕ</div>
                </div>
                <Toggle val={captchaLogin} setVal={setCaptchaLogin} />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>АЛЕРТЫ ПОДОЗРИТЕЛЬНОЙ АКТИВНОСТИ</div>
                </div>
                <Toggle val={suspiciousAlerts} setVal={setSuspiciousAlerts} />
              </div>
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>DMCA И HOTLINK</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>DMCA CONTACT EMAIL</div>
              <input className="springos-input py-2 px-3 w-full" placeholder="dmca@example.com" value={dmcaEmail} onChange={e => setDmcaEmail(e.target.value)} />
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>АВТО-УДАЛЕНИЕ ПОСЛЕ N ЖАЛОБ</div>
              <input className="springos-input py-2 px-3 w-full" type="number" min={0} max={100} value={dmcaAutoTakedown} onChange={e => setDmcaAutoTakedown(Number(e.target.value))} />
              <div className="font-code text-[9px] mt-1" style={{ color: '#5a5040' }}>0 = ОТКЛЮЧЕНО</div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>ЗАЩИТА ОТ HOTLINK</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>БЛОКИРОВАТЬ ВНЕШНИЕ ССЫЛКИ НА МЕДИА</div>
                </div>
                <Toggle val={hotlinkProtection} setVal={setHotlinkProtection} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #2a2420', margin: '16px 0' }} />

            <div className="font-terminal text-[20px] mb-3" style={{ color: '#d4c8b0' }}>ЖУРНАЛ ВХОДОВ</div>
            <div className="font-code text-[10px] mb-3" style={{ color: '#5a5040' }}>ПОСЛЕДНИЕ 20 АВТОРИЗАЦИЙ</div>

            <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420', maxHeight: 320 }}>
              <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>ЮЗЕР</th>
                    <th>ВРЕМЯ</th>
                    <th>СТАТУС</th>
                  </tr>
                </thead>
                <tbody>
                  {logins.map(l => (
                    <tr key={l.id}>
                      <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{l.ip}</td>
                      <td className="font-code text-[12px]" style={{ color: l.username === '-' ? '#7a1616' : '#9b8c3b' }}>{l.username}</td>
                      <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>{l.time}</td>
                      <td>
                        {l.status === 'OK' ? (
                          <span className="springos-badge-alive">OK</span>
                        ) : (
                          <span className="springos-badge-springlocked">FAIL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

export default SecurityPage;
