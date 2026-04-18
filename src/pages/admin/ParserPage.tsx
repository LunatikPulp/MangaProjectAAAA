import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  fetchMangaInfo,
  massParseMangas,
  importCatalog,
  startChapterCrawler,
  updateChapterCrawler,
  getCrawlerStatus,
} from '../../services/externalApiService';
import { MangaContext } from '../../contexts/MangaContext';
import { Manga } from '../../types';

type MassResult = { url: string; status: string; title?: string; chapters_count?: number; error?: string };

const ParserPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [massUrls, setMassUrls] = useState('');
  const [massLoading, setMassLoading] = useState(false);
  const [massError, setMassError] = useState<string | null>(null);
  const [massResults, setMassResults] = useState<MassResult[] | null>(null);
  const [massSummary, setMassSummary] = useState<{ success: number; failed: number } | null>(null);

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<{ imported: number; total: number; errors: number } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [crawlerActive, setCrawlerActive] = useState(false);
  const [crawlerStatus, setCrawlerStatus] = useState<{
    running: boolean; processed: number; total: number; current_title: string; errors: number;
  } | null>(null);

  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);

  const [logLines, setLogLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { addManga, refreshMangas } = useContext(MangaContext);

  const addLog = (line: string) => {
    const ts = new Date().toLocaleTimeString('ru-RU');
    setLogLines(prev => [...prev, `[${ts}] ${line}`]);
  };

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logLines]);
  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getCrawlerStatus();
        setCrawlerStatus(status);
        setCrawlerActive(status.running);
        if (status.running) addLog(`КРАУЛЕР: ${status.processed}/${status.total} — ${status.current_title}`);
        if (!status.running) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          addLog('КРАУЛЕР ЗАВЕРШЁН');
          if (refreshMangas) refreshMangas();
        }
      } catch {}
    }, 3000);
  };

  const handleImport = async () => {
    if (!url.trim()) { setError('ВВЕДИТЕ URL'); return; }
    setLoading(true); setError(null); setSuccess(null);
    addLog(`ИМПОРТ: ${url}`);
    try {
      const manga: Manga = await fetchMangaInfo(url.trim());
      addManga(manga);
      setSuccess(`"${manga.title}" ИМПОРТИРОВАНО`);
      addLog(`УСПЕХ: "${manga.title}" — ${manga.chapters.length} ГЛАВ`);
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'ОШИБКА');
      addLog(`ОШИБКА: ${err.message}`);
    } finally { setLoading(false); }
  };

  const handleMassImport = async () => {
    const urls = massUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) { setMassError('ВВЕДИТЕ ХОТЯ БЫ ОДИН URL'); return; }
    setMassLoading(true); setMassError(null); setMassResults(null); setMassSummary(null);
    addLog(`МАССОВЫЙ ИМПОРТ: ${urls.length} URL`);
    try {
      const data = await massParseMangas(urls);
      setMassResults(data.results);
      setMassSummary({ success: data.success, failed: data.failed });
      addLog(`МАССОВЫЙ ИМПОРТ: ${data.success} УСПЕХ, ${data.failed} ОШИБОК`);
      if (refreshMangas) refreshMangas();
    } catch (err: any) {
      setMassError(err.message || 'ОШИБКА');
      addLog(`МАССОВАЯ ОШИБКА: ${err.message}`);
    } finally { setMassLoading(false); }
  };

  const handleCatalogImport = async () => {
    setCatalogLoading(true); setCatalogError(null); setCatalogResult(null);
    addLog('ИМПОРТ КАТАЛОГА...');
    try {
      const result = await importCatalog();
      setCatalogResult(result);
      addLog(`КАТАЛОГ: ${result.imported}/${result.total} ИМПОРТИРОВАНО`);
      if (refreshMangas) refreshMangas();
    } catch (err: any) {
      setCatalogError(err.message || 'ОШИБКА');
      addLog(`ОШИБКА КАТАЛОГА: ${err.message}`);
    } finally { setCatalogLoading(false); }
  };

  const handleStartCrawler = async () => {
    try {
      addLog('ЗАПУСК КРАУЛЕРА ГЛАВ...');
      await startChapterCrawler();
      const status = await getCrawlerStatus();
      setCrawlerStatus(status); setCrawlerActive(status.running);
      startPolling();
    } catch (err: any) {
      setCatalogError(err.message || 'ОШИБКА');
      addLog(`ОШИБКА КРАУЛЕРА: ${err.message}`);
    }
  };

  const handleUpdateChapters = async () => {
    try {
      addLog('ОБНОВЛЕНИЕ ГЛАВ...');
      await updateChapterCrawler();
      const status = await getCrawlerStatus();
      setCrawlerStatus(status); setCrawlerActive(status.running);
      startPolling();
    } catch (err: any) {
      setCatalogError(err.message || 'ОШИБКА');
      addLog(`ОШИБКА: ${err.message}`);
    }
  };

  const handleTriggerCron = async () => {
    setCronLoading(true);
    setCronError(null);
    addLog('ЗАПУСК АВТОМАТИЧЕСКОГО ПАРСИНГА ОБНОВЛЕНИЙ...');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/admin/cron/trigger`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Ошибка запуска');
      addLog('АВТОПАРСИНГ ЗАПУЩЕН — ПРОВЕРКА ОБНОВЛЕНИЙ С MANGABUFF.RU');
    } catch (err: any) {
      setCronError(err.message || 'ОШИБКА');
      addLog(`ОШИБКА АВТОПАРСИНГА: ${err.message}`);
    } finally {
      setCronLoading(false);
    }
  };

  const toggleCrawler = () => {
    if (crawlerActive) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      setCrawlerActive(false);
      addLog('КРАУЛЕР ОСТАНОВЛЕН ВРУЧНУЮ');
    } else {
      handleStartCrawler();
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          ПАРСЕР — ПАНЕЛЬ УПРАВЛЕНИЯ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/parser</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>./crawler_ctl --interactive</span>
        </div>
      </div>

      {/* Top Row: Lever + Controls */}
      <div className="flex gap-6 mb-6 flex-wrap">
        {/* Power Lever */}
        <div className="springos-metal-frame springos-rust-dots rounded p-5 flex flex-col items-center" style={{ minWidth: 120 }}>
          <div className="relative z-10 flex flex-col items-center">
            <div className="font-terminal text-[12px] tracking-[3px] mb-4" style={{ color: '#7a7060' }}>
              ПИТАНИЕ
            </div>
            <div
              className={`springos-lever ${crawlerActive ? 'active' : ''}`}
              onClick={toggleCrawler}
            />
            <div
              className="font-terminal text-[14px] mt-3 tracking-[2px]"
              style={{ color: crawlerActive ? '#39ff14' : '#7a7060' }}
            >
              {crawlerActive ? 'АКТИВЕН' : 'ОТКЛЮЧЁН'}
            </div>
          </div>
        </div>

        {/* Quick Actions + Status */}
        <div className="springos-metal-frame springos-rust-dots rounded p-4 flex-1" style={{ minWidth: 300 }}>
          <div className="relative z-10">
            <div className="flex gap-2 mb-3 flex-wrap">
              <button className="springos-btn springos-btn-glow text-[13px] springos-glitch-hover" onClick={handleCatalogImport} disabled={catalogLoading}>
                {catalogLoading ? 'ИМПОРТ...' : 'ИМПОРТ КАТАЛОГА'}
              </button>
              <button className="springos-btn springos-btn-primary text-[13px]" onClick={handleStartCrawler} disabled={crawlerActive}>
                ЗАГРУЗИТЬ ГЛАВЫ
              </button>
              <button className="springos-btn text-[13px]" onClick={handleUpdateChapters} disabled={crawlerActive}>
                ОБНОВИТЬ ГЛАВЫ
              </button>
              <button className="springos-btn text-[13px]" onClick={handleTriggerCron} disabled={cronLoading}>
                {cronLoading ? 'ЗАПУСК...' : '🔄 АВТОПАРСИНГ'}
              </button>
            </div>

            {catalogLoading && (
              <div className="font-terminal text-[14px]" style={{ color: '#9b8c3b' }}>
                ИМПОРТ КАТАЛОГА<span className="springos-cursor" />
              </div>
            )}
            {catalogError && <div className="font-code text-[11px] mt-1" style={{ color: '#7a1616' }}>{catalogError}</div>}
            {cronError && <div className="font-code text-[11px] mt-1" style={{ color: '#7a1616' }}>{cronError}</div>}
            {catalogResult && (
              <div className="font-code text-[12px] mt-1 springos-glow-green">
                ИМПОРТИРОВАНО: {catalogResult.imported}/{catalogResult.total}
                {catalogResult.errors > 0 && <span className="springos-glow-blood ml-2">(ОШИБОК: {catalogResult.errors})</span>}
              </div>
            )}

            {crawlerStatus && (
              <div className="mt-3">
                <div className="flex justify-between font-terminal text-[13px]" style={{ color: '#d4c8b0' }}>
                  <span>{crawlerStatus.running ? 'КРАУЛЕР РАБОТАЕТ' : 'КРАУЛЕР ЗАВЕРШЁН'}</span>
                  <span>
                    {crawlerStatus.processed}/{crawlerStatus.total}
                    {crawlerStatus.errors > 0 && <span className="ml-2" style={{ color: '#7a1616' }}>({crawlerStatus.errors} ОШ.)</span>}
                  </span>
                </div>
                {crawlerStatus.total > 0 && (
                  <div className="springos-progress mt-2">
                    <div
                      className="springos-progress-bar"
                      style={{ width: `${Math.round((crawlerStatus.processed / crawlerStatus.total) * 100)}%` }}
                    />
                  </div>
                )}
                {crawlerStatus.current_title && (
                  <div className="font-code text-[10px] mt-1 truncate" style={{ color: '#7a7060' }}>
                    СЕЙЧАС: {crawlerStatus.current_title}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Single Import */}
      <section className="springos-metal-frame rounded p-4 mb-5">
        <div className="relative z-10">
          <div className="font-terminal text-[18px] mb-3" style={{ color: '#9b8c3b' }}>ОДИНОЧНЫЙ ИМПОРТ</div>
          <div className="flex gap-2">
            <input
              className="springos-input py-2 px-3 flex-1"
              placeholder="> ВСТАВЬТЕ ССЫЛКУ С MANGABUFF.RU..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImport()}
            />
            <button className="springos-btn springos-btn-glow text-[13px] springos-glitch-hover" onClick={handleImport} disabled={loading}>
              {loading ? 'ЗАГРУЗКА...' : 'ИМПОРТ'}
            </button>
          </div>
          {error && <div className="font-code text-[11px] mt-2" style={{ color: '#7a1616' }}>{error}</div>}
          {success && <div className="font-code text-[11px] mt-2 springos-glow-green">{success}</div>}
        </div>
      </section>

      {/* Mass Import */}
      <section className="springos-metal-frame springos-rust-dots rounded p-4 mb-5">
        <div className="relative z-10">
          <div className="font-terminal text-[18px] mb-3" style={{ color: '#9b8c3b' }}>МАССОВЫЙ ИМПОРТ</div>
          <textarea
            className="springos-input w-full py-2 px-3 resize-y"
            style={{ minHeight: 100 }}
            placeholder={"ССЫЛКИ (ПО ОДНОЙ НА СТРОКУ):\nhttps://mangabuff.ru/manga/...\nhttps://mangabuff.ru/manga/..."}
            value={massUrls}
            onChange={e => setMassUrls(e.target.value)}
          />
          <button className="springos-btn springos-btn-glow text-[13px] mt-2 springos-glitch-hover" onClick={handleMassImport} disabled={massLoading}>
            {massLoading ? 'ИМПОРТ...' : 'ИМПОРТИРОВАТЬ ВСЁ'}
          </button>
          {massError && <div className="font-code text-[11px] mt-2" style={{ color: '#7a1616' }}>{massError}</div>}
          {massSummary && (
            <div className="font-code text-[12px] mt-2">
              <span className="springos-glow-green">{massSummary.success} УСПЕШНО</span>
              {massSummary.failed > 0 && <span className="ml-2" style={{ color: '#7a1616' }}>{massSummary.failed} ОШИБОК</span>}
            </div>
          )}
          {massResults && (
            <div className="max-h-[180px] overflow-y-auto mt-2 springos-scroll" style={{ border: '1px solid #1e1a16' }}>
              {massResults.map((r, i) => (
                <div
                  key={i}
                  className="font-code text-[11px] px-2 py-1"
                  style={{
                    color: r.status === 'ok' ? '#39ff14' : '#7a1616',
                    background: r.status === 'ok' ? 'rgba(57,255,20,0.03)' : 'rgba(122,22,22,0.06)',
                    borderBottom: '1px solid rgba(30,26,22,0.5)',
                  }}
                >
                  {r.status === 'ok' ? `${r.title} — ${r.chapters_count} ГЛАВ` : `${r.url} — ${r.error}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Log Terminal — Linux Style */}
      <section>
        <div className="rounded overflow-hidden" style={{ border: '1px solid #2a2420' }}>
          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#1a1816', borderBottom: '1px solid #2a2420' }}>
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ff4444' }} />
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#ffdd57' }} />
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#39ff14' }} />
            </div>
            <span className="font-code text-[11px] ml-2" style={{ color: '#8a8070' }}>
              springtrap@afton-robotics: ~/parser/journal.log
            </span>
            <span className="ml-auto font-code text-[9px]" style={{ color: '#7a7060' }}>
              {logLines.length} строк
            </span>
          </div>

          {/* Terminal body */}
          <div
            ref={logRef}
            className="springos-scroll font-code"
            style={{
              background: '#0a0908',
              padding: 12,
              minHeight: 180,
              maxHeight: 350,
              overflowY: 'auto',
              fontSize: 11,
              lineHeight: 1.7,
            }}
          >
            {/* Initial prompt */}
            <div className="mb-1">
              <span style={{ color: '#39ff14' }}>springtrap@afton</span>
              <span style={{ color: '#8a8070' }}>:</span>
              <span style={{ color: '#6cacff' }}>~/parser</span>
              <span style={{ color: '#8a8070' }}>$ </span>
              <span style={{ color: '#d4c8b0' }}>tail -f journal.log</span>
            </div>

            {logLines.length === 0 ? (
              <div style={{ color: '#7a7060' }}>
                {'>'} ОЖИДАНИЕ КОМАНД<span className="springos-cursor" />
              </div>
            ) : (
              logLines.map((line, i) => (
                <div
                  key={i}
                  className="springos-log-line"
                  style={{
                    color: line.includes('ОШИБКА') ? '#ff6b6b' :
                      line.includes('УСПЕХ') || line.includes('ИМПОРТИРОВАНО') ? '#39ff14' :
                      line.includes('КРАУЛЕР') ? '#ffdd57' : '#d4c8b0',
                  }}
                >
                  {line}
                </div>
              ))
            )}

            {/* Blinking cursor */}
            {logLines.length > 0 && (
              <div className="mt-1">
                <span style={{ color: '#39ff14' }}>springtrap@afton</span>
                <span style={{ color: '#8a8070' }}>:</span>
                <span style={{ color: '#6cacff' }}>~/parser</span>
                <span style={{ color: '#8a8070' }}>$ </span>
                <span className="springos-cursor" />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ParserPage;
