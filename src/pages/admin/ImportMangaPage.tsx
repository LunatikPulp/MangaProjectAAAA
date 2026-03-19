// src/pages/admin/ImportMangaPage.tsx
import React, { useState, useContext, useEffect, useRef } from "react";
import {
  fetchMangaInfo,
  massParseMangas,
  importCatalog,
  startChapterCrawler,
  getCrawlerStatus,
} from "../../services/externalApiService";
import { MangaContext } from "../../contexts/MangaContext";
import { Manga } from "../../types";

type MassResult = {
  url: string;
  status: string;
  title?: string;
  chapters_count?: number;
  error?: string;
};

const ImportMangaPage: React.FC = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mass import state
  const [massUrls, setMassUrls] = useState("");
  const [massLoading, setMassLoading] = useState(false);
  const [massError, setMassError] = useState<string | null>(null);
  const [massResults, setMassResults] = useState<MassResult[] | null>(null);
  const [massSummary, setMassSummary] = useState<{ success: number; failed: number } | null>(null);

  // Catalog import state
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResult, setCatalogResult] = useState<{ imported: number; total: number; errors: number } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Crawler state
  const [crawlerStatus, setCrawlerStatus] = useState<{
    running: boolean;
    processed: number;
    total: number;
    current_title: string;
    errors: number;
  } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { addManga, refreshMangas } = useContext(MangaContext);

  // Poll crawler status
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getCrawlerStatus();
        setCrawlerStatus(status);
        if (!status.running) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (refreshMangas) refreshMangas();
        }
      } catch {
        // ignore
      }
    }, 3000);
  };

  const handleImport = async () => {
    if (!url.trim()) {
      setError("Введите URL манги с mangabuff.ru");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const manga: Manga = await fetchMangaInfo(url.trim());
      addManga(manga);
      setSuccess(`Манга "${manga.title}" успешно импортирована!`);
      setUrl("");
    } catch (err: any) {
      setError(err.message || "Не удалось загрузить мангу.");
    } finally {
      setLoading(false);
    }
  };

  const handleMassImport = async () => {
    const urls = massUrls.split("\n").map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      setMassError("Введите хотя бы один URL");
      return;
    }
    setMassLoading(true);
    setMassError(null);
    setMassResults(null);
    setMassSummary(null);
    try {
      const data = await massParseMangas(urls);
      setMassResults(data.results);
      setMassSummary({ success: data.success, failed: data.failed });
      if (refreshMangas) refreshMangas();
    } catch (err: any) {
      setMassError(err.message || "Не удалось выполнить массовый импорт.");
    } finally {
      setMassLoading(false);
    }
  };

  const handleCatalogImport = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogResult(null);
    try {
      const result = await importCatalog();
      setCatalogResult(result);
      if (refreshMangas) refreshMangas();
    } catch (err: any) {
      setCatalogError(err.message || "Ошибка импорта каталога");
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleStartCrawler = async () => {
    try {
      await startChapterCrawler();
      const status = await getCrawlerStatus();
      setCrawlerStatus(status);
      startPolling();
    } catch (err: any) {
      setCatalogError(err.message || "Ошибка запуска краулера");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Импорт манги</h1>

      {/* Catalog import */}
      <section className="mb-8 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
        <h2 className="text-lg font-semibold mb-2">Импорт каталога mangabuff.ru</h2>
        <p className="text-sm text-muted dark:text-muted mb-3">
          Импортирует все произведения из каталога (метаданные, без глав). Главы загружаются отдельно.
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={handleCatalogImport}
            disabled={catalogLoading}
            className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-hover disabled:bg-overlay"
          >
            {catalogLoading ? "Импорт каталога..." : "Импортировать каталог"}
          </button>
          <button
            onClick={handleStartCrawler}
            disabled={crawlerStatus?.running}
            className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:bg-overlay"
          >
            {crawlerStatus?.running ? "Краулер работает..." : "Загрузить главы"}
          </button>
        </div>

        {catalogLoading && (
          <p className="text-brand text-sm">Идёт импорт каталога, это может занять несколько минут...</p>
        )}
        {catalogError && <p className="text-brand-accent text-sm mb-2">{catalogError}</p>}
        {catalogResult && (
          <p className="text-brand text-sm mb-2">
            Импортировано: {catalogResult.imported} из {catalogResult.total}
            {catalogResult.errors > 0 && <span className="text-brand-accent"> (ошибок: {catalogResult.errors})</span>}
          </p>
        )}

        {crawlerStatus && (
          <div className="text-sm mt-2 p-2 bg-white dark:bg-gray-700 rounded">
            <div className="flex justify-between mb-1">
              <span>{crawlerStatus.running ? "Краулер работает" : "Краулер завершён"}</span>
              <span>
                {crawlerStatus.processed} / {crawlerStatus.total}
                {crawlerStatus.errors > 0 && <span className="text-brand-accent ml-2">({crawlerStatus.errors} ошибок)</span>}
              </span>
            </div>
            {crawlerStatus.total > 0 && (
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded h-2 mb-1">
                <div
                  className="bg-orange-500 h-2 rounded transition-all"
                  style={{ width: `${Math.round((crawlerStatus.processed / crawlerStatus.total) * 100)}%` }}
                />
              </div>
            )}
            {crawlerStatus.current_title && (
              <p className="text-muted text-xs truncate">Сейчас: {crawlerStatus.current_title}</p>
            )}
          </div>
        )}
      </section>

      {/* Single import */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Одиночный импорт</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Вставьте ссылку на мангу с mangabuff.ru"
            className="flex-1 border rounded px-3 py-2"
          />
          <button
            onClick={handleImport}
            disabled={loading}
            className="bg-brand-hover text-white px-4 py-2 rounded hover:bg-brand-hover disabled:bg-overlay"
          >
            {loading ? "Загрузка..." : "Загрузить"}
          </button>
        </div>
        {error && <p className="text-brand-accent">{error}</p>}
        {success && <p className="text-brand">{success}</p>}
      </section>

      {/* Mass import */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Массовый импорт</h2>
        <textarea
          value={massUrls}
          onChange={(e) => setMassUrls(e.target.value)}
          placeholder={"Вставьте ссылки (по одной на строку):\nhttps://mangabuff.ru/manga/...\nhttps://mangabuff.ru/manga/..."}
          rows={6}
          className="w-full border rounded px-3 py-2 mb-2 font-mono text-sm"
        />
        <button
          onClick={handleMassImport}
          disabled={massLoading}
          className="bg-brand-hover text-white px-4 py-2 rounded hover:bg-brand disabled:bg-overlay mb-4"
        >
          {massLoading ? "Импорт..." : "Импортировать всё"}
        </button>

        {massError && <p className="text-brand-accent mb-2">{massError}</p>}

        {massSummary && (
          <p className="mb-2">
            Готово: <span className="text-brand font-semibold">{massSummary.success} успешно</span>
            {massSummary.failed > 0 && (
              <>, <span className="text-brand-accent font-semibold">{massSummary.failed} ошибок</span></>
            )}
          </p>
        )}

        {massResults && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {massResults.map((r, i) => (
              <div
                key={i}
                className={`text-sm px-2 py-1 rounded ${
                  r.status === "ok" ? "bg-brand-10 text-brand" : "bg-brand-accent-10 text-brand-accent"
                }`}
              >
                {r.status === "ok" ? (
                  <span>{r.title} — {r.chapters_count} глав</span>
                ) : (
                  <span>{r.url} — {r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default ImportMangaPage;
