import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

const NotificationsPage: React.FC = () => {
  const [emailNotif, setEmailNotif] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [testMsg, setTestMsg] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [tgBotInfo, setTgBotInfo] = useState<{ configured: boolean; bot_id: string; bot_username: string }>({ configured: false, bot_id: '', bot_username: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const headers = { 'Content-Type': 'application/json' };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`, { credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          setEmailNotif(d.email_notifications === true || d.email_notifications === 'true');
          setSmtpHost(d.smtp_host ?? '');
          setSmtpPort(d.smtp_port ?? '587');
          setSmtpUser(d.smtp_user ?? '');
          setSmtpPassword(d.smtp_password ?? '');
          setSmtpFrom(d.smtp_from ?? '');
          setSmtpTls(d.smtp_tls === true || d.smtp_tls === 'true');
          setTelegramBotToken(d.telegram_bot_token ?? '');
        }
      } catch {}
      try {
        const infoRes = await fetch(`${API_BASE}/auth/telegram/info`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          setTgBotInfo(info);
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
        credentials: 'include',
        body: JSON.stringify({
          email_notifications: emailNotif,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          smtp_from: smtpFrom,
          smtp_tls: smtpTls,
          telegram_bot_token: telegramBotToken,
        }),
      });
      setMsg(res.ok ? 'НАСТРОЙКИ СОХРАНЕНЫ' : 'ОШИБКА СОХРАНЕНИЯ');
      if (res.ok) {
        try {
          const infoRes = await fetch(`${API_BASE}/auth/telegram/info`);
          if (infoRes.ok) {
            const info = await infoRes.json();
            setTgBotInfo(info);
          }
        } catch {}
      }
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const testEmail = async () => {
    setTestMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/test-email`, { method: 'POST', headers, credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setTestMsg(data.detail || 'ТЕСТОВОЕ ПИСЬМО ОТПРАВЛЕНО');
      } else {
        setTestMsg('ОШИБКА: ' + (data.detail || 'ОТПРАВКА НЕ УДАЛАСЬ'));
      }
    } catch {
      setTestMsg('ОШИБКА СЕТИ');
    }
    setTimeout(() => setTestMsg(''), 8000);
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
          УВЕДОМЛЕНИЯ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/notifications</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>postfix reload</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>EMAIL / SMTP</div>
            <div className="font-code text-[10px] mb-4" style={{ color: '#5a5040' }}>
              SMTP ДЛЯ ВОССТАНОВЛЕНИЯ ПАРОЛЯ
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>EMAIL УВЕДОМЛЕНИЯ</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>ВКЛЮЧИТЬ ОТПРАВКУ ПИСЕМ СБРОСА ПАРОЛЯ</div>
                </div>
                <Toggle val={emailNotif} setVal={setEmailNotif} />
              </div>
            </div>

            {emailNotif && (
              <>
                <div className="mb-3">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>SMTP HOST</div>
                  <input className="springos-input py-2 px-3 w-full" placeholder="smtp.example.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                </div>
                <div className="mb-3">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>SMTP PORT</div>
                  <input className="springos-input py-2 px-3 w-full" placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                </div>
                <div className="mb-3">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>SMTP USER</div>
                  <input className="springos-input py-2 px-3 w-full" placeholder="user@example.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                </div>
                <div className="mb-3">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>SMTP ПАРОЛЬ</div>
                  <input className="springos-input py-2 px-3 w-full" type="password" placeholder="••••••••" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} />
                </div>
                <div className="mb-3">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ОТПРАВИТЕЛЬ (FROM)</div>
                  <input className="springos-input py-2 px-3 w-full" placeholder="noreply@example.com" value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} />
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>SMTP TLS</div>
                      <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>ШИФРОВАНИЕ СОЕДИНЕНИЯ</div>
                    </div>
                    <Toggle val={smtpTls} setVal={setSmtpTls} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="springos-btn springos-btn-primary text-[14px]" onClick={testEmail}>
                    ТЕСТОВОЕ ПИСЬМО
                  </button>
                  {testMsg && (
                    <span
                      className="font-terminal text-[13px]"
                      style={{ color: testMsg.includes('ОШИБКА') ? '#7a1616' : '#39ff14' }}
                    >
                      {'>'} {testMsg}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>TELEGRAM LOGIN</div>
            <div className="font-code text-[10px] mb-4" style={{ color: '#5a5040' }}>
              БОТ ДЛЯ АВТОРИЗАЦИИ ПОЛЬЗОВАТЕЛЕЙ ЧЕРЕЗ TELEGRAM
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>BOT TOKEN</div>
              <input className="springos-input py-2 px-3 w-full" type="password" placeholder="123456:ABC-DEF..." value={telegramBotToken} onChange={e => setTelegramBotToken(e.target.value)} />
              <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>ТОКЕН БОТА ИЗ @BOTFATHER</div>
            </div>

            {tgBotInfo.configured ? (
              <div className="p-3 rounded" style={{ background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.15)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-terminal text-[14px]" style={{ color: '#39ff14' }}>✓</span>
                  <span className="font-terminal text-[14px]" style={{ color: '#d4c8b0' }}>
                    БОТ ПОДКЛЮЧЕН: @{tgBotInfo.bot_username}
                  </span>
                </div>
                <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>
                  BOT ID: {tgBotInfo.bot_id}
                </div>
                <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>
                  НЕ ЗАБУДЬТЕ: /SETDOMAIN В @BOTFATHER → ВАШ ДОМЕН (И LOCALHOST ДЛЯ РАЗРАБОТКИ)
                </div>
              </div>
            ) : (
              <div className="p-3 rounded" style={{ background: 'rgba(122,22,22,0.04)', border: '1px solid rgba(122,22,22,0.15)' }}>
                <div className="font-terminal text-[14px]" style={{ color: '#7a1616' }}>
                  БОТ НЕ НАСТРОЕН
                </div>
                <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>
                  ВВЕДИТЕ ТОКЕН И СОХРАНИТЕ НАСТРОЙКИ
                </div>
              </div>
            )}
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

export default NotificationsPage;
