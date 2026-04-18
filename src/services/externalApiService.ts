import { Manga, Chapter, Page } from "../types";

// В development: используем Vite proxy (/api → backend) чтобы избежать CORS и проблем с cookie domain
// В production (nginx): /api проксируется на backend на том же сервере
export const API_BASE = (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
  ? "/api"
  : "/api";


/** Simple MD5 hash (sync) — matches Python hashlib.md5 for cache key parity */
function md5(str: string): string {
  // Minimal MD5 implementation
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (a + q + x + t) | 0;
    return (((a << s) | (a >>> (32 - s))) + b) | 0;
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)); }
    else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)); }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < bytes.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) w[j] = bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24);
    let aa = a, bb = b, cc = c, dd = d;
    a=ff(a,b,c,d,w[0],7,-680876936);d=ff(d,a,b,c,w[1],12,-389564586);c=ff(c,d,a,b,w[2],17,606105819);b=ff(b,c,d,a,w[3],22,-1044525330);
    a=ff(a,b,c,d,w[4],7,-176418897);d=ff(d,a,b,c,w[5],12,1200080426);c=ff(c,d,a,b,w[6],17,-1473231341);b=ff(b,c,d,a,w[7],22,-45705983);
    a=ff(a,b,c,d,w[8],7,1770035416);d=ff(d,a,b,c,w[9],12,-1958414417);c=ff(c,d,a,b,w[10],17,-42063);b=ff(b,c,d,a,w[11],22,-1990404162);
    a=ff(a,b,c,d,w[12],7,1804603682);d=ff(d,a,b,c,w[13],12,-40341101);c=ff(c,d,a,b,w[14],17,-1502002290);b=ff(b,c,d,a,w[15],22,1236535329);
    a=gg(a,b,c,d,w[1],5,-165796510);d=gg(d,a,b,c,w[6],9,-1069501632);c=gg(c,d,a,b,w[11],14,643717713);b=gg(b,c,d,a,w[0],20,-373897302);
    a=gg(a,b,c,d,w[5],5,-701558691);d=gg(d,a,b,c,w[10],9,38016083);c=gg(c,d,a,b,w[15],14,-660478335);b=gg(b,c,d,a,w[4],20,-405537848);
    a=gg(a,b,c,d,w[9],5,568446438);d=gg(d,a,b,c,w[14],9,-1019803690);c=gg(c,d,a,b,w[3],14,-187363961);b=gg(b,c,d,a,w[8],20,1163531501);
    a=gg(a,b,c,d,w[13],5,-1444681467);d=gg(d,a,b,c,w[2],9,-51403784);c=gg(c,d,a,b,w[7],14,1735328473);b=gg(b,c,d,a,w[12],20,-1926607734);
    a=hh(a,b,c,d,w[5],4,-378558);d=hh(d,a,b,c,w[8],11,-2022574463);c=hh(c,d,a,b,w[11],16,1839030562);b=hh(b,c,d,a,w[14],23,-35309556);
    a=hh(a,b,c,d,w[1],4,-1530992060);d=hh(d,a,b,c,w[4],11,1272893353);c=hh(c,d,a,b,w[7],16,-155497632);b=hh(b,c,d,a,w[10],23,-1094730640);
    a=hh(a,b,c,d,w[13],4,681279174);d=hh(d,a,b,c,w[0],11,-358537222);c=hh(c,d,a,b,w[3],16,-722521979);b=hh(b,c,d,a,w[6],23,76029189);
    a=hh(a,b,c,d,w[9],4,-640364487);d=hh(d,a,b,c,w[12],11,-421815835);c=hh(c,d,a,b,w[15],16,530742520);b=hh(b,c,d,a,w[2],23,-995338651);
    a=ii(a,b,c,d,w[0],6,-198630844);d=ii(d,a,b,c,w[7],10,1126891415);c=ii(c,d,a,b,w[14],15,-1416354905);b=ii(b,c,d,a,w[5],21,-57434055);
    a=ii(a,b,c,d,w[12],6,1700485571);d=ii(d,a,b,c,w[3],10,-1894986606);c=ii(c,d,a,b,w[10],15,-1051523);b=ii(b,c,d,a,w[1],21,-2054922799);
    a=ii(a,b,c,d,w[8],6,1873313359);d=ii(d,a,b,c,w[15],10,-30611744);c=ii(c,d,a,b,w[6],15,-1560198380);b=ii(b,c,d,a,w[13],21,1309151649);
    a=ii(a,b,c,d,w[4],6,-145523070);d=ii(d,a,b,c,w[11],10,-1120210379);c=ii(c,d,a,b,w[2],15,718787259);b=ii(b,c,d,a,w[9],21,-343485551);
    a = (a + aa) | 0; b = (b + bb) | 0; c = (c + cc) | 0; d = (d + dd) | 0;
  }
  const hex = (n: number) => { let s = ''; for (let i = 0; i < 4; i++) s += ('0' + ((n >> (i * 8)) & 0xff).toString(16)).slice(-2); return s; };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

/** Проксирует внешний URL изображения через бэкенд.
 *  Генерирует чистый URL /img/<hash>.webp — скрывает источник и явно показывает формат. */
export function proxyImageUrl(url: string, wm: string = ""): string {
  if (!url) return "";
  if (url.startsWith("/static/") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  const hash = md5(url + "|" + wm);
  return `${API_BASE}/img/${hash}.webp?url=${encodeURIComponent(url)}${wm ? `&wm=${wm}` : ''}`;
}

/** Build user-facing manga URL path using slug */
export function mangaPath(manga: { id: string; slug?: string }): string {
  return `/manga/${manga.slug || manga.id}`;
}

/** Достаём номер главы */
function extractChapterNumber(name: string, fallback: string): string {
  if (!name) return fallback;
  const m = name.match(/(?:Глава|Chapter)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m?.[1] ?? fallback;
}

/** Определяем тип манги по жанрам */
function inferTypeFromGenres(genres: string[] = []): Manga["type"] {
  const g = genres.map((s) => s.toLowerCase());
  if (g.some((x) => x.includes("маньхуа"))) return "Manhua";
  if (g.some((x) => x.includes("манхва"))) return "Manhwa";
  return "Manga";
}

/** Маппинг статуса */
function mapStatus(additional?: any): Manga["status"] {
  const s: string = (additional?.status || "").toLowerCase();
  if (s.includes("заверш")) return "Завершено";
  return "В процессе";
}

/** Нормализация страниц */
function normalizePages(pages: string[], chapterId: string): Page[] {
  return (pages || [])
    .filter((p) => !p.includes("/user_photo/")) // 🚫 убираем мусор
    .map((p, idx) => ({
      id: `${chapterId}-${idx}`,
      url: p.startsWith("http") ? p : undefined,
    }));
}

/** Нормализация главы */
function normalizeChapter(ch: any, idx: number): Chapter {
  const title = ch?.name ?? `Глава ${idx + 1}`;
  const id = ch?.chapter_id?.toString?.() ?? String(idx + 1);
  return {
    id,
    chapterNumber: extractChapterNumber(title, String(idx + 1)),
    title,
    date: ch?.date_added ?? new Date().toISOString(),
    views: ch?.views ?? 0,
    pages: normalizePages(ch?.pages || [], id),
    likes: ch?.likes ?? 0,
  };
}

/** Выбор корректной обложки */
function pickCoverUrl(data: any): string {
  const cover = data?.cover_url ?? "";

  // если cover_url нормальный → берём его
  if (cover && !cover.includes("/user_photo/") && !cover.includes("s_56x56")) {
    return cover;
  }

  // иначе ищем первую страницу с /media/catalog/publication/
  const firstChapter = Array.isArray(data?.chapters) ? data.chapters[0] : null;
  const firstPage = firstChapter?.pages?.find((p: string) =>
    p.includes("/media/catalog/publication/")
  );

  return firstPage || cover || "";
}

/** Нормализация манги */
function normalizeManga(data: any): Manga {
  const genres: string[] = Array.isArray(data?.genres) ? data.genres : [];
  const additional = data?.additional_info ?? {};
  return {
    id: data?.manga_id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
    title: data?.title ?? "Без названия",
    type: inferTypeFromGenres(genres),
    year: Number(additional?.year ?? new Date().getFullYear()),
    rating: 0,
    userRatings: {},
    views: String(
      Array.isArray(data?.chapters)
        ? data.chapters.reduce((sum: number, ch: any) => sum + (ch?.views ?? 0), 0)
        : 0
    ),
    cover: pickCoverUrl(data), // ✅ фиксированная обложка
    description: data?.description ?? "",
    chapters: Array.isArray(data?.chapters)
      ? data.chapters.map((ch: any, idx: number) => normalizeChapter(ch, idx))
      : [],
    genres,
    status: mapStatus(additional),
    ageRating: additional?.age_rating || undefined,
    alternativeNames: Array.isArray(additional?.alternative_names)
      ? additional.alternative_names.map((n: string) => n.replace(/^[\s\/]+/, '').trim()).filter(Boolean)
      : [],
    statistics: additional?.statistics || undefined,
  };
}

/** Загрузка информации о манге */
export async function fetchMangaInfo(url: string): Promise<Manga> {
  const res = await fetch(`${API_BASE}/manga?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Ошибка при получении манги: ${res.status} ${res.statusText} ${text}`
    );
  }
  const raw = await res.json();
  return normalizeManga(raw); // ✅ уже с Page[] и правильной обложкой
}

/** Импорт каталога */
export async function importCatalog(): Promise<{
  imported: number;
  total: number;
  errors: number;
}> {
  const res = await fetch(`${API_BASE}/catalog/import`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка импорта каталога: ${res.status} ${text}`);
  }
  return res.json();
}

/** Запустить краулер глав (только тайтлы без глав) */
export async function startChapterCrawler(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/catalog/crawl-chapters`, { method: "POST" });
  if (!res.ok) throw new Error("Ошибка запуска краулера");
  return res.json();
}

/** Обновить главы: проверить ВСЕ тайтлы и добавить только новые главы */
export async function updateChapterCrawler(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/catalog/crawl-chapters?update=true`, { method: "POST" });
  if (!res.ok) throw new Error("Ошибка запуска обновления глав");
  return res.json();
}

/** Статус краулера */
export async function getCrawlerStatus(): Promise<{
  running: boolean;
  processed: number;
  total: number;
  current_title: string;
  errors: number;
}> {
  const res = await fetch(`${API_BASE}/catalog/crawler-status`);
  if (!res.ok) throw new Error("Ошибка получения статуса");
  return res.json();
}

/** Lazy-load страниц главы по slug */
export async function fetchChapterPages(chapterSlug: string, mangaId?: string): Promise<{
  pages: string[];
  total_pages: number;
}> {
  let url = `${API_BASE}/catalog/chapter-pages/${encodeURIComponent(chapterSlug)}`;
  if (mangaId) url += `?manga_id=${encodeURIComponent(mangaId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка загрузки страниц: ${res.status} ${text}`);
  }
  return res.json();
}

/** Массовый парсинг манг */
export async function massParseMangas(
  urls: string[]
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{
    url: string;
    status: string;
    title?: string;
    chapters_count?: number;
    error?: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/manga/mass-parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ошибка массового парсинга: ${res.status} ${text}`);
  }
  return res.json();
}
