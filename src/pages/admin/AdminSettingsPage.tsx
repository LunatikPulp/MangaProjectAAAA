import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';
import { API_BASE } from '../../services/externalApiService';

interface BackupFile {
  filename: string;
  size: number;
  created: number;
}

const AdminSettingsPage: React.FC = () => {
  const { user, refreshUser } = useContext(AuthContext);
  const headers = { 'Content-Type': 'application/json' };

  const [maintenance, setMaintenance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [bypassUrl, setBypassUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  const loadBackups = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/backups`, { headers, credentials: 'include' });
      if (res.ok) setBackups(await res.json());
    } catch {}
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`, { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setMaintenance(data.maintenance_mode === true || data.maintenance_mode === 'true');
        }
      } catch {}
      loadBackups();
    })();
  }, []);

  const toggleMaintenance = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ maintenance_mode: !maintenance }),
      });
      if (res.ok) {
        const data = await res.json();
        const turning_on = !maintenance;
        setMaintenance(turning_on);
        if (turning_on && data.bypass_key) {
          setBypassUrl(`${API_BASE}/admin/maintenance-bypass?key=${data.bypass_key}`);
        } else {
          setBypassUrl('');
        }
        setMsg(maintenance ? 'РЕЖИМ ОБСЛУЖИВАНИЯ ОТКЛЮЧЁН' : 'РЕЖИМ ОБСЛУЖИВАНИЯ АКТИВИРОВАН');
      } else {
        setMsg('ОШИБКА');
      }
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
          НАСТРОЙКИ СИСТЕМЫ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/settings</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>nano /etc/springos/config.yml</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-2" style={{ color: '#d4c8b0' }}>
              УПРАВЛЕНИЕ СИСТЕМОЙ
            </div>
            <div className="font-code text-[10px] mb-6" style={{ color: '#5a5040' }}>
              КРИТИЧЕСКИЕ ПАРАМЕТРЫ — ИЗМЕНЕНИЯ ВСТУПАЮТ В СИЛУ НЕМЕДЛЕННО
            </div>

            <div
              className="p-5 rounded"
              style={{
                background: maintenance
                  ? 'rgba(122, 22, 22, 0.06)'
                  : 'rgba(90, 102, 56, 0.04)',
                border: maintenance
                  ? '2px solid rgba(122, 22, 22, 0.3)'
                  : '2px solid rgba(90, 102, 56, 0.15)',
                transition: 'all 0.3s ease',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div
                    className="font-terminal text-[22px] tracking-[2px]"
                    style={{ color: maintenance ? '#7a1616' : '#9b8c3b' }}
                  >
                    РЕЖИМ ТЕХ. РАБОТ
                  </div>
                  <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>
                    {maintenance
                      ? 'АКТИВЕН — САЙТ НЕДОСТУПЕН ДЛЯ ПОЛЬЗОВАТЕЛЕЙ'
                      : 'ОТКЛЮЧЁН — САЙТ РАБОТАЕТ В ШТАТНОМ РЕЖИМЕ'}
                  </div>
                </div>
                <div
                  className={`springos-toggle ${maintenance ? 'active' : ''}`}
                  onClick={saving ? undefined : toggleMaintenance}
                  style={{
                    transform: 'scale(1.3)',
                    cursor: saving ? 'wait' : 'pointer',
                    borderColor: maintenance ? '#7a1616' : '#3a3028',
                  }}
                />
              </div>

              {maintenance && (
                <div
                  className="mt-3 p-3 rounded"
                  style={{ background: 'rgba(122, 22, 22, 0.08)' }}
                >
                  <div className="font-terminal text-[14px] springos-blink-blood" style={{ color: '#7a1616' }}>
                    ⚠ ВНИМАНИЕ: ВСЕ ЗАПРОСЫ НЕ-АДМИНОВ ПОЛУЧАЮТ HTTP 503
                  </div>
                  <div className="font-code text-[10px] mt-1" style={{ color: '#5a5040' }}>
                    Пользователи видят заглушку «Сайт на обслуживании». Админы проходят свободно.
                  </div>
                </div>
              )}

              {maintenance && bypassUrl && (
                <div
                  className="mt-3 p-4 rounded"
                  style={{ background: 'rgba(155, 140, 59, 0.06)', border: '1px solid rgba(155, 140, 59, 0.2)' }}
                >
                  <div className="font-terminal text-[13px] mb-2" style={{ color: '#9b8c3b' }}>
                    СЕКРЕТНАЯ ССЫЛКА ДЛЯ ВХОДА
                  </div>
                  <div className="font-code text-[10px] mb-3" style={{ color: '#5a5040' }}>
                    Откройте в браузере если вы разлогинены. Действует 1 час. Новый ключ при каждом включении.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={bypassUrl}
                      className="flex-1 font-code text-[11px] px-3 py-2 rounded"
                      style={{
                        background: '#0a0a08',
                        border: '1px solid #3a3028',
                        color: '#9b8c3b',
                        outline: 'none',
                      }}
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      className="springos-btn text-[12px] flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(bypassUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? 'СКОПИРОВАНО' : 'КОПИРОВАТЬ'}
                    </button>
                  </div>
                </div>
              )}

              {!maintenance && (
                <div className="mt-3 p-3 rounded" style={{ background: 'rgba(57, 255, 20, 0.03)' }}>
                  <div className="font-code text-[10px]" style={{ color: '#5a6638' }}>
                    Переключатель активирует middleware: все эндпоинты (кроме /auth/*, /admin/*) → 503 Service Unavailable
                  </div>
                </div>
              )}
            </div>

            {msg && (
              <div
                className="font-terminal text-[15px] mt-4"
                style={{
                  color: msg.includes('АКТИВИРОВАН') ? '#7a1616' : msg.includes('ОШИБКА') ? '#7a1616' : '#39ff14',
                  textShadow: `0 0 8px ${msg.includes('АКТИВИРОВАН') ? 'rgba(122,22,22,0.5)' : 'rgba(57,255,20,0.4)'}`,
                }}
              >
                {'>'} {msg}
              </div>
            )}
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-5" style={{ color: '#d4c8b0' }}>
              СИСТЕМНАЯ ИНФОРМАЦИЯ
            </div>

            <div>
              {[
                { label: 'АДМИНИСТРАТОР', value: user?.username || '—', color: '#d4c8b0' },
                { label: 'РОЛЬ', value: user?.role || '—', color: '#9b8c3b' },
                { label: 'API ENDPOINT', value: API_BASE, color: '#d4c8b0' },
                { label: 'ВЕРСИЯ SPRINGOS', value: 'v3.0', color: '#39ff14', glow: true },
                { label: 'ТОКЕН', value: 'httpOnly', badge: 'alive' },
                { label: 'СТАТУС СЕРВИСА', value: maintenance ? 'ОБСЛУЖИВАНИЕ' : 'ОНЛАЙН', badge: maintenance ? 'dead' : 'alive' },
              ].map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: i < 5 ? '1px solid #1e1a16' : 'none' }}
                >
                  <span className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>
                    {row.label}
                  </span>
                  {row.badge ? (
                    <span className={row.badge === 'alive' ? 'springos-badge-alive' : 'springos-badge-springlocked'}>
                      {row.value}
                    </span>
                  ) : (
                    <span
                      className={`font-code text-[13px] ${row.glow ? 'springos-glow-green' : ''}`}
                      style={{ color: row.color }}
                    >
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #2a2420', margin: '16px 0' }} />

            <button className="springos-btn springos-btn-primary text-[13px]" onClick={refreshUser}>
              ОБНОВИТЬ ДАННЫЕ
            </button>

            <pre className="font-code text-[7px] mt-6 text-center select-none" style={{ color: '#1e1a16', lineHeight: 1.1 }}>
{`      ▄████▄
     ▄██▀▀▀▀██▄
    ██▀  ▄▄  ▀██
    ██  ████  ██
    ██▄  ▀▀  ▄██
     ▀██▄▄▄▄██▀
    ▄██▀▀▀▀▀▀██▄
   ██ SPRINGOS ██
    ▀██▄▄▄▄▄▄██▀
       ▀▀▀▀▀▀`}
            </pre>
          </div>
        </div>
      </div>

      <div className="springos-metal-frame springos-rust-dots rounded p-6 mt-6">
        <div className="relative z-10">
          <div className="font-terminal text-[20px] mb-2" style={{ color: '#d4c8b0' }}>
            БЭКАПЫ БАЗЫ ДАННЫХ
          </div>
          <div className="font-code text-[10px] mb-4" style={{ color: '#5a5040' }}>
            СОЗДАНИЕ И ВОССТАНОВЛЕНИЕ КОПИЙ SQLITE БД
          </div>

          <div className="flex items-center gap-3 mb-4">
            <button
              className="springos-btn springos-btn-glow text-[13px] springos-glitch-hover"
              disabled={backupLoading}
              onClick={async () => {
                setBackupLoading(true);
                setBackupMsg('');
                try {
                  const res = await fetch(`${API_BASE}/admin/backup`, { method: 'POST', headers, credentials: 'include' });
                  if (res.ok) {
                    const d = await res.json();
                    setBackupMsg(`БЭКАП СОЗДАН: ${d.filename}`);
                    loadBackups();
                  } else {
                    setBackupMsg('ОШИБКА СОЗДАНИЯ');
                  }
                } catch {
                  setBackupMsg('ОШИБКА СЕТИ');
                }
                setBackupLoading(false);
                setTimeout(() => setBackupMsg(''), 5000);
              }}
            >
              {backupLoading ? '...' : 'СОЗДАТЬ БЭКАП'}
            </button>
            {backupMsg && (
              <span
                className="font-terminal text-[13px]"
                style={{
                  color: backupMsg.includes('ОШИБКА') ? '#7a1616' : '#39ff14',
                  textShadow: `0 0 8px ${backupMsg.includes('ОШИБКА') ? 'rgba(122,22,22,0.5)' : 'rgba(57,255,20,0.4)'}`,
                }}
              >
                {'>'} {backupMsg}
              </span>
            )}
          </div>

          {backups.length > 0 ? (
            <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
              <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px' }}>ФАЙЛ</th>
                    <th style={{ padding: '8px', width: 100 }}>РАЗМЕР</th>
                    <th style={{ padding: '8px', width: 140 }}>ДАТА</th>
                    <th style={{ padding: '8px', width: 180 }}>ДЕЙСТВИЯ</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.filename}>
                      <td className="font-code text-[11px]" style={{ color: '#d4c8b0', padding: '6px 8px' }}>{b.filename}</td>
                      <td className="font-code text-[11px]" style={{ color: '#9b8c3b', padding: '6px 8px' }}>
                        {(b.size / 1024 / 1024).toFixed(1)} МБ
                      </td>
                      <td className="font-code text-[11px]" style={{ color: '#7a7060', padding: '6px 8px' }}>
                        {new Date(b.created * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <div className="flex gap-2">
                          {restoreConfirm === b.filename ? (
                            <>
                              <button
                                className="springos-btn text-[10px] py-1 px-2"
                                style={{ borderColor: '#7a1616', color: '#7a1616' }}
                                onClick={async () => {
                                  setBackupLoading(true);
                                  try {
                                    const res = await fetch(`${API_BASE}/admin/backup/restore`, {
                                      method: 'POST', headers, credentials: 'include',
                                      body: JSON.stringify({ filename: b.filename }),
                                    });
                                    if (res.ok) {
                                      setBackupMsg('БД ВОССТАНОВЛЕНА — ПЕРЕЗАГРУЗИТЕ СЕРВЕР');
                                    } else {
                                      setBackupMsg('ОШИБКА ВОССТАНОВЛЕНИЯ');
                                    }
                                  } catch { setBackupMsg('ОШИБКА СЕТИ'); }
                                  setBackupLoading(false);
                                  setRestoreConfirm(null);
                                  setTimeout(() => setBackupMsg(''), 8000);
                                }}
                              >
                                ПОДТВЕРДИТЬ
                              </button>
                              <button
                                className="springos-btn text-[10px] py-1 px-2"
                                onClick={() => setRestoreConfirm(null)}
                              >
                                ОТМЕНА
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="springos-btn text-[10px] py-1 px-2"
                                onClick={() => setRestoreConfirm(b.filename)}
                              >
                                ВОССТАНОВИТЬ
                              </button>
                              <button
                                className="springos-btn text-[10px] py-1 px-2"
                                style={{ borderColor: '#7a1616', color: '#7a1616' }}
                                onClick={async () => {
                                  await fetch(`${API_BASE}/admin/backup/${b.filename}`, { method: 'DELETE', headers, credentials: 'include' });
                                  loadBackups();
                                }}
                              >
                                УДАЛИТЬ
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="font-code text-[12px] py-4 text-center" style={{ color: '#5a5040' }}>
              НЕТ БЭКАПОВ
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
