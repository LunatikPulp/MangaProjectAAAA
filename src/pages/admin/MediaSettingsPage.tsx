import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/externalApiService';

const MediaSettingsPage: React.FC = () => {
  const headers = { 'Content-Type': 'application/json' };

  const [cdnProvider, setCdnProvider] = useState('local');
  const [cdnUrl, setCdnUrl] = useState('');
  const [maxFileSize, setMaxFileSize] = useState(50);
  const [allowedFormats, setAllowedFormats] = useState<string[]>(['PNG', 'JPG', 'GIF', 'WEBP']);
  const [autoConvertWebP, setAutoConvertWebP] = useState(false);
  const [imageQuality, setImageQuality] = useState(80);
  const [storageType, setStorageType] = useState('local');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [backupMedia, setBackupMedia] = useState(false);
  const [backupInterval, setBackupInterval] = useState('daily');
  const [backupDestination, setBackupDestination] = useState('local');
  const [backupRetention, setBackupRetention] = useState(7);
  const [backupS3Endpoint, setBackupS3Endpoint] = useState('');
  const [backupS3Bucket, setBackupS3Bucket] = useState('');
  const [lastBackupTime, setLastBackupTime] = useState('');
  const [backupRunning, setBackupRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`, { headers, credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          setCdnProvider(d.cdn_provider ?? 'local');
          setCdnUrl(d.cdn_url ?? '');
          setMaxFileSize(d.max_file_size_mb ?? 50);
          setAllowedFormats(d.allowed_formats ?? ['PNG', 'JPG', 'GIF', 'WEBP']);
          setAutoConvertWebP(d.auto_convert_webp ?? false);
          setImageQuality(d.image_quality ?? 80);
          setStorageType(d.storage_type ?? 'local');
          setS3Endpoint(d.s3_endpoint ?? '');
          setS3Bucket(d.s3_bucket ?? '');
          setS3AccessKey(d.s3_access_key ?? '');
          setS3SecretKey(d.s3_secret_key ?? '');
          setBackupMedia(d.backup_media ?? false);
          setBackupInterval(d.backup_interval ?? 'daily');
          setBackupDestination(d.backup_destination ?? 'local');
          setBackupRetention(d.backup_retention ?? 7);
          setBackupS3Endpoint(d.backup_s3_endpoint ?? '');
          setBackupS3Bucket(d.backup_s3_bucket ?? '');
          setLastBackupTime(d.last_backup_time ?? '');
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
          cdn_provider: cdnProvider,
          cdn_url: cdnUrl,
          max_file_size_mb: maxFileSize,
          allowed_formats: allowedFormats,
          auto_convert_webp: autoConvertWebP,
          image_quality: imageQuality,
          storage_type: storageType,
          s3_endpoint: s3Endpoint,
          s3_bucket: s3Bucket,
          s3_access_key: s3AccessKey,
          s3_secret_key: s3SecretKey,
          backup_media: backupMedia,
          backup_interval: backupInterval,
          backup_destination: backupDestination,
          backup_retention: backupRetention,
          backup_s3_endpoint: backupS3Endpoint,
          backup_s3_bucket: backupS3Bucket,
        }),
      });
      setMsg(res.ok ? 'НАСТРОЙКИ СОХРАНЕНЫ' : 'ОШИБКА СОХРАНЕНИЯ');
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const toggleFormat = (f: string) => {
    setAllowedFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const Toggle = ({ val, setVal }: { val: boolean; setVal: (v: boolean) => void }) => (
    <div
      className={`springos-toggle ${val ? 'active' : ''}`}
      onClick={() => setVal(!val)}
      style={{ transform: 'scale(1.1)', cursor: 'pointer' }}
    />
  );

  const allFormats = ['PNG', 'JPG', 'GIF', 'WEBP', 'MP4', 'ZIP'];

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          МЕДИА — НАСТРОЙКИ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/media</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>nano /etc/springos/media.yml</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>CDN И ХРАНИЛИЩЕ</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>CDN ПРОВАЙДЕР</div>
              <select className="springos-input py-2 px-3 w-full" value={cdnProvider} onChange={e => setCdnProvider(e.target.value)}>
                <option value="local">Локальное</option>
                <option value="cloudflare">CloudFlare</option>
                <option value="bunnycdn">BunnyCDN</option>
                <option value="aws_s3">AWS S3</option>
              </select>
            </div>

            {(cdnProvider === 'cloudflare' || cdnProvider === 'bunnycdn') && (
              <div className="mb-4">
                <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>CDN URL</div>
                <input className="springos-input py-2 px-3 w-full" placeholder="https://cdn.example.com" value={cdnUrl} onChange={e => setCdnUrl(e.target.value)} />
              </div>
            )}

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ТИП ХРАНИЛИЩА</div>
              <select className="springos-input py-2 px-3 w-full" value={storageType} onChange={e => setStorageType(e.target.value)}>
                <option value="local">Локальное</option>
                <option value="s3">S3</option>
                <option value="cloud">Облако</option>
              </select>
            </div>

            {storageType === 's3' && (
              <div className="p-4 rounded mb-4" style={{ background: 'rgba(90,102,56,0.04)', border: '1px solid rgba(90,102,56,0.15)' }}>
                <div className="font-terminal text-[16px] mb-3" style={{ color: '#5a6638' }}>S3 РЕКВИЗИТЫ</div>
                <div className="grid grid-cols-1 gap-3">
                  <input className="springos-input py-2 px-3" placeholder="ENDPOINT" value={s3Endpoint} onChange={e => setS3Endpoint(e.target.value)} />
                  <input className="springos-input py-2 px-3" placeholder="BUCKET" value={s3Bucket} onChange={e => setS3Bucket(e.target.value)} />
                  <input className="springos-input py-2 px-3" placeholder="ACCESS KEY" value={s3AccessKey} onChange={e => setS3AccessKey(e.target.value)} />
                  <input className="springos-input py-2 px-3" type="password" placeholder="SECRET KEY" value={s3SecretKey} onChange={e => setS3SecretKey(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>ЗАГРУЗКА ФАЙЛОВ</div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>МАКС. РАЗМЕР ФАЙЛА (МБ)</div>
              <input className="springos-input py-2 px-3 w-full" type="number" min={1} max={500} value={maxFileSize} onChange={e => setMaxFileSize(Number(e.target.value))} />
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-2" style={{ color: '#7a7060' }}>РАЗРЕШЁННЫЕ ФОРМАТЫ</div>
              <div className="flex flex-wrap gap-2">
                {allFormats.map(f => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowedFormats.includes(f)}
                      onChange={() => toggleFormat(f)}
                      style={{ accentColor: '#39ff14' }}
                    />
                    <span className="font-code text-[12px]" style={{ color: allowedFormats.includes(f) ? '#39ff14' : '#7a7060' }}>{f}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>АВТОКОНВЕРТАЦИЯ В WEBP</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>АВТОМАТИЧЕСКАЯ КОНВЕРТАЦИЯ ИЗОБРАЖЕНИЙ</div>
                </div>
                <Toggle val={autoConvertWebP} setVal={setAutoConvertWebP} />
              </div>
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>КАЧЕСТВО ИЗОБРАЖЕНИЯ: {imageQuality}%</div>
              <input
                type="range"
                min={1}
                max={100}
                value={imageQuality}
                onChange={e => setImageQuality(Number(e.target.value))}
                className="w-full"
                style={{ accentColor: '#5a6638' }}
              />
              <div className="flex justify-between font-code text-[9px]" style={{ color: '#5a5040' }}>
                <span>1%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>РЕЗЕРВНОЕ КОПИРОВАНИЕ</div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>РЕЗЕРВНОЕ КОПИРОВАНИЕ МЕДИА</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>АВТОМАТИЧЕСКОЕ СОЗДАНИЕ БЭКАПОВ</div>
                </div>
                <Toggle val={backupMedia} setVal={setBackupMedia} />
              </div>
            </div>

            {backupMedia && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ИНТЕРВАЛ БЭКАПА</div>
                    <select className="springos-input py-2 px-3 w-full" value={backupInterval} onChange={e => setBackupInterval(e.target.value)}>
                      <option value="daily">Ежедневно</option>
                      <option value="weekly">Еженедельно</option>
                      <option value="monthly">Ежемесячно</option>
                    </select>
                  </div>
                  <div>
                    <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ХРАНЕНИЕ КОПИЙ</div>
                    <input className="springos-input py-2 px-3 w-full" type="number" min={1} max={90} value={backupRetention} onChange={e => setBackupRetention(Number(e.target.value))} />
                    <div className="font-code text-[9px]" style={{ color: '#5a5040' }}>КОЛИЧЕСТВО ХРАНИМЫХ КОПИЙ</div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>НАЗНАЧЕНИЕ БЭКАПА</div>
                  <select className="springos-input py-2 px-3 w-full" value={backupDestination} onChange={e => setBackupDestination(e.target.value)}>
                    <option value="local">Локальное хранилище</option>
                    <option value="s3">S3-совместимое хранилище</option>
                  </select>
                </div>

                {backupDestination === 's3' && (
                  <div className="p-4 rounded mb-4" style={{ background: 'rgba(90,102,56,0.04)', border: '1px solid rgba(90,102,56,0.15)' }}>
                    <div className="font-terminal text-[16px] mb-3" style={{ color: '#5a6638' }}>S3 РЕКВИЗИТЫ ДЛЯ БЭКАПА</div>
                    <div className="grid grid-cols-1 gap-3">
                      <input className="springos-input py-2 px-3" placeholder="S3 ENDPOINT" value={backupS3Endpoint} onChange={e => setBackupS3Endpoint(e.target.value)} />
                      <input className="springos-input py-2 px-3" placeholder="BUCKET" value={backupS3Bucket} onChange={e => setBackupS3Bucket(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <button
                    className="springos-btn springos-btn-primary text-[13px]"
                    onClick={async () => {
                      setBackupRunning(true);
                      try {
                        const res = await fetch(`${API_BASE}/admin/backup`, { method: 'POST', headers, credentials: 'include' });
                        if (res.ok) {
                          setLastBackupTime(new Date().toISOString());
                        }
                      } catch {}
                      setBackupRunning(false);
                    }}
                    disabled={backupRunning}
                  >
                    {backupRunning ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ БЭКАП ВРУЧНУЮ'}
                  </button>
                </div>

                {lastBackupTime && (
                  <div className="p-3 rounded" style={{ background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.15)' }}>
                    <div className="font-code text-[11px]" style={{ color: '#39ff14' }}>
                      {'>'} ПОСЛЕДНИЙ БЭКАП: {new Date(lastBackupTime).toLocaleString('ru-RU')}
                    </div>
                  </div>
                )}
              </>
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

export default MediaSettingsPage;
