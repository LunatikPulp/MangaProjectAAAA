import React, { createContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Manga, Chapter, Page, BookmarkStatus } from '../types';
import { API_BASE } from '../services/externalApiService';

interface MangaContextType {
  mangaList: Manga[];
  loading: boolean;
  hasMore: boolean;
  totalCount: number;
  addManga: (manga: Manga) => void;
  updateManga: (id: string, updatedManga: Partial<Omit<Manga, 'id' | 'userRatings' | 'userStatuses'>>) => void;
  deleteManga: (id: string) => void;
  getMangaById: (id: string) => Manga | undefined;
  fetchMangaById: (id: string) => Promise<Manga | undefined>;
  fetchMangaChapters: (mangaId: string) => Promise<Chapter[]>;
  updateChapters: (mangaId: string, chapters: Chapter[]) => void;
  updateChapterContent: (mangaId: string, chapterId: string, content: string[]) => void;
  rateManga: (mangaId: string, userEmail: string, rating: number) => void;
  updateUserStatus: (mangaId: string, userEmail: string, status: BookmarkStatus | null) => void;
  likeChapter: (mangaId: string, chapterId: string) => Promise<'liked' | 'unliked' | null>;
  refreshMangas: () => void;
  loadMore: () => Promise<void>;
  searchMangas: (query: string) => Promise<Manga[]>;
}

const LOCAL_CACHE_KEY = 'manga_local_cache_v2';

export const MangaContext = createContext<MangaContextType>({
  mangaList: [],
  loading: true,
  hasMore: true,
  totalCount: 0,
  addManga: () => {},
  updateManga: () => {},
  deleteManga: () => {},
  getMangaById: () => undefined,
  fetchMangaById: async () => undefined,
  fetchMangaChapters: async () => [],
  updateChapters: () => {},
  updateChapterContent: () => {},
  rateManga: () => {},
  updateUserStatus: () => {},
  likeChapter: async () => null,
  refreshMangas: () => {},
  loadMore: async () => {},
  searchMangas: async () => [],
});

const calculateAverageRating = (userRatings: { [userEmail: string]: number }): number => {
    const ratings = Object.values(userRatings);
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return sum / ratings.length;
}

function getLocalCache(): Record<string, Partial<Manga>> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalCache(cache: Record<string, Partial<Manga>>) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Не удалось сохранить локальный кеш:", e);
  }
}

function updateLocalCacheEntry(mangaId: string, patch: Partial<Manga>) {
  const cache = getLocalCache();
  cache[mangaId] = { ...cache[mangaId], ...patch };
  setLocalCache(cache);
}

function extractChapterNumber(name: string, fallback: string): string {
  if (!name) return fallback;
  const m = name.match(/(?:Глава|Chapter)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m?.[1] ?? fallback;
}

function normalizePages(pages: any[], chapterId: string): Page[] {
  if (!Array.isArray(pages)) return [];
  return pages
    .filter((p: any) => {
      const url = typeof p === 'string' ? p : p?.url;
      return url && !url.includes('/user_photo/');
    })
    .map((p: any, idx: number) => {
      const url = typeof p === 'string' ? p : p?.url;
      return {
        id: p?.id || `${chapterId}-${idx}`,
        url: url && url.startsWith('http') ? url : undefined,
      };
    });
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'Неизвестно') return dateStr || '';
  try {
    // Handle dd.mm.yy or dd.mm.yyyy format
    const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      const [, dd, mm, rawYear] = dotMatch;
      let yyyy = rawYear;
      if (rawYear.length === 2) {
        yyyy = (parseInt(rawYear, 10) > 50 ? '19' : '20') + rawYear;
      }
      return `${dd.padStart(2, '0')}.${mm.padStart(2, '0')}.${yyyy}`;
    }

    const cleaned = dateStr.replace(/(\.\d{3})\d+/, '$1');
    const d = new Date(cleaned);
    if (isNaN(d.getTime()) || d.getFullYear() < 1970) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch { return dateStr; }
}

function normalizeChapter(ch: any, idx: number): Chapter {
  const title = ch?.name ?? ch?.title ?? `Глава ${idx + 1}`;
  const id = ch?.chapter_id?.toString?.() ?? ch?.id?.toString?.() ?? String(idx + 1);
  const rawDate = ch?.date_added ?? ch?.date ?? new Date().toISOString();
  return {
    id,
    chapterNumber: ch?.chapterNumber ?? ch?.chapter_number ?? extractChapterNumber(title, String(idx + 1)),
    title,
    date: formatDate(rawDate),
    views: ch?.views ?? 0,
    pages: normalizePages(ch?.pages || [], id),
    likes: ch?.likes ?? 0,
    is_liked: ch?.is_liked ?? false,
  };
}

function backendItemToManga(item: any, localCache: Record<string, Partial<Manga>>): Manga {
  const cached = localCache[item.manga_id] || {};
  const additional = item.additional_info || {};

  const genres: string[] = item.genres || [];
  const g = genres.map((s: string) => s.toLowerCase());
  let type: Manga['type'] = 'Manga';
  if (g.some((x: string) => x.includes('маньхуа'))) type = 'Manhua';
  else if (g.some((x: string) => x.includes('манхва'))) type = 'Manhwa';
  if (additional.type) type = additional.type as Manga['type'];
  else if (item.manga_type) type = item.manga_type as Manga['type'];

  let status: Manga['status'] = item.status || additional.status || 'В процессе';

  const rawChapters: any[] = item.chapters || [];
  const chapters: Chapter[] = rawChapters.length > 0
    ? rawChapters.map((ch: any, idx: number) => normalizeChapter(ch, idx))
    : (cached.chapters ?? []);

  return {
    id: item.manga_id,
    title: item.title || 'Без названия',
    type,
    year: item.year || 0,
    rating: item.rating_info?.average ?? cached.rating ?? 0,
    userRatings: cached.userRatings ?? {},
    userStatuses: cached.userStatuses ?? {},
    views: item.views != null ? String(item.views) : (cached.views ?? '0'),
    cover: item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || ''),
    description: item.description || '',
    chapters,
    chapterCount: item.chapter_count ?? chapters.length,
    genres,
    status,
    ageRating: additional.age_rating || undefined,
    alternativeNames: (additional.alternative_names || []).map((n: string) => n.replace(/^[\s\/]+/, '').trim()).filter(Boolean),
    authors: additional.authors || [],
    publishers: additional.publishers || [],
    tags: additional.tags || [],
    statistics: additional.statistics || undefined,
    ratingInfo: item.rating_info || undefined,
    bookmarkCounts: item.bookmark_counts || undefined,
    userBookmark: item.user_bookmark || null,
  };
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('backend_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const MangaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mangaList, setMangaList] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const pageRef = useRef(1);
  const loadingMore = useRef(false);

  const fetchMangaList = useCallback(async () => {
    try {
      pageRef.current = 1;
      const res = await fetch(`${API_BASE}/manga/list?page=1&limit=30`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const localCache = getLocalCache();
      const list = data.items.map((item: any) => backendItemToManga(item, localCache));
      setMangaList(list);
      setTotalCount(data.total);
      setHasMore(data.page < data.pages);
    } catch (error) {
      console.error("Не удалось загрузить список манги с бэкенда:", error);
      setMangaList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    try {
      const nextPage = pageRef.current + 1;
      const res = await fetch(`${API_BASE}/manga/list?page=${nextPage}&limit=30`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const localCache = getLocalCache();
      const newItems = data.items.map((item: any) => backendItemToManga(item, localCache));
      setMangaList(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const unique = newItems.filter((m: Manga) => !existingIds.has(m.id));
        return [...prev, ...unique];
      });
      pageRef.current = nextPage;
      setHasMore(data.page < data.pages);
    } catch (error) {
      console.error("Ошибка загрузки следующей страницы:", error);
    } finally {
      loadingMore.current = false;
    }
  }, [hasMore]);

  const searchMangas = useCallback(async (query: string): Promise<Manga[]> => {
    try {
      const res = await fetch(`${API_BASE}/manga/list?search=${encodeURIComponent(query)}&limit=20`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      const localCache = getLocalCache();
      return data.items.map((item: any) => backendItemToManga(item, localCache));
    } catch {
      return [];
    }
  }, []);

  const fetchMangaById = useCallback(async (id: string): Promise<Manga | undefined> => {
    const existing = mangaList.find(m => m.id === id);
    if (existing && existing.chapters.length > 0) return existing;

    try {
      const res = await fetch(`${API_BASE}/manga/${id}/detail`, { headers: getAuthHeaders() });
      if (!res.ok) return existing;
      const item = await res.json();
      const localCache = getLocalCache();
      const manga = backendItemToManga(item, localCache);

      // Загружаем главы
      const chapRes = await fetch(`${API_BASE}/manga/${id}/chapters`, { headers: getAuthHeaders() });
      if (chapRes.ok) {
        const chapData = await chapRes.json();
        manga.chapters = chapData.map((ch: any, idx: number) => normalizeChapter(ch, idx));
      }

      setMangaList(prev => {
        const idx = prev.findIndex(m => m.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = manga;
          return updated;
        }
        return [manga, ...prev];
      });

      return manga;
    } catch {
      return existing;
    }
  }, [mangaList]);

  const fetchMangaChapters = useCallback(async (mangaId: string): Promise<Chapter[]> => {
    try {
      const res = await fetch(`${API_BASE}/manga/${mangaId}/chapters`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      const chapters = data.map((ch: any, idx: number) => normalizeChapter(ch, idx));

      // Обновляем мангу в списке
      setMangaList(prev => prev.map(m =>
        m.id === mangaId ? { ...m, chapters } : m
      ));

      return chapters;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    fetchMangaList();
  }, [fetchMangaList]);

  const addManga = useCallback((newManga: Manga) => {
    fetch(`${API_BASE}/manga/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manga_id: newManga.id,
        title: newManga.title,
        description: newManga.description,
        cover_url: newManga.cover,
        source_url: '',
        genres: newManga.genres,
        manga_type: newManga.type,
        year: newManga.year,
        status: newManga.status,
        additional_info: {
          alternative_names: newManga.alternativeNames || [],
          age_rating: newManga.ageRating || undefined,
          statistics: newManga.statistics || undefined,
        },
        chapters: newManga.chapters,
      }),
    }).catch(err => console.error("Ошибка сохранения манги на бэкенд:", err));

    setMangaList(prev => {
      if (prev.some(m => m.id === newManga.id)) return prev;
      return [newManga, ...prev];
    });

    updateLocalCacheEntry(newManga.id, {
      chapters: newManga.chapters,
      rating: newManga.rating,
      userRatings: newManga.userRatings,
      userStatuses: newManga.userStatuses,
      views: newManga.views,
    });
  }, []);

  const updateManga = useCallback((id: string, updatedMangaData: Partial<Omit<Manga, 'id' | 'userRatings' | 'userStatuses'>>) => {
    setMangaList(prev => prev.map(manga =>
      manga.id === id ? { ...manga, ...updatedMangaData } : manga
    ));
    updateLocalCacheEntry(id, updatedMangaData as Partial<Manga>);
  }, []);

  const updateChapters = useCallback((mangaId: string, chapters: Chapter[]) => {
    setMangaList(prev => prev.map(manga =>
      manga.id === mangaId ? { ...manga, chapters } : manga
    ));
    updateLocalCacheEntry(mangaId, { chapters });
  }, []);

  const updateChapterContent = useCallback((mangaId: string, chapterId: string, content: string[]) => {
    setMangaList(prev => {
      const newList = prev.map(manga => {
        if (manga.id === mangaId) {
          const updatedChapters = manga.chapters.map(chapter => {
            if (chapter.id === chapterId) {
              const pages = content.map((url, idx) => ({
                id: `${chapterId}-${idx}`,
                url: url.startsWith('http') ? url : undefined,
              }));
              return { ...chapter, pages };
            }
            return chapter;
          });
          return { ...manga, chapters: updatedChapters };
        }
        return manga;
      });
      const updated = newList.find(m => m.id === mangaId);
      if (updated) updateLocalCacheEntry(mangaId, { chapters: updated.chapters });
      return newList;
    });
  }, []);

  const rateManga = useCallback((mangaId: string, userEmail: string, rating: number) => {
    setMangaList(prev => {
      const newList = prev.map(manga => {
          if (manga.id === mangaId) {
              const newUserRatings = { ...manga.userRatings, [userEmail]: rating };
              const newAverageRating = calculateAverageRating(newUserRatings);
              return { ...manga, userRatings: newUserRatings, rating: newAverageRating };
          }
          return manga;
      });
      const updated = newList.find(m => m.id === mangaId);
      if (updated) updateLocalCacheEntry(mangaId, { userRatings: updated.userRatings, rating: updated.rating });
      return newList;
    });

    const token = localStorage.getItem('backend_token');
    if (token) {
      fetch(`${API_BASE}/manga/${mangaId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ rating }),
      }).then(res => res.json()).then(data => {
        if (data.average !== undefined) {
          setMangaList(prev => prev.map(m =>
            m.id === mangaId ? { ...m, rating: data.average, ratingInfo: { average: data.average, total: data.total, distribution: data.distribution, user_rating: rating } } : m
          ));
        }
      }).catch(err => console.error("Ошибка сохранения оценки:", err));
    }
  }, []);

  const updateUserStatus = useCallback((mangaId: string, userEmail: string, status: BookmarkStatus | null) => {
    setMangaList(prev => {
        const newList = prev.map(manga => {
            if (manga.id === mangaId) {
                const newUserStatuses = { ...manga.userStatuses };
                const newBookmarkCounts = { ...(manga.bookmarkCounts || {}) };
                const oldStatus = newUserStatuses[userEmail];
                if (oldStatus && newBookmarkCounts[oldStatus]) {
                    newBookmarkCounts[oldStatus] = Math.max(0, newBookmarkCounts[oldStatus] - 1);
                }
                if (status === null) {
                    delete newUserStatuses[userEmail];
                } else {
                    newUserStatuses[userEmail] = status;
                    newBookmarkCounts[status] = (newBookmarkCounts[status] || 0) + 1;
                }
                return { ...manga, userStatuses: newUserStatuses, bookmarkCounts: newBookmarkCounts, userBookmark: status };
            }
            return manga;
        });
        const updated = newList.find(m => m.id === mangaId);
        if (updated) updateLocalCacheEntry(mangaId, { userStatuses: updated.userStatuses });
        return newList;
    });

    const token = localStorage.getItem('backend_token');
    if (token) {
      if (status === null) {
        fetch(`${API_BASE}/manga/${mangaId}/bookmark`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(err => console.error("Ошибка удаления закладки:", err));
      } else {
        fetch(`${API_BASE}/manga/${mangaId}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ status }),
        }).catch(err => console.error("Ошибка сохранения закладки:", err));
      }
    }
  }, []);

  const likeChapter = useCallback(async (mangaId: string, chapterId: string): Promise<'liked' | 'unliked' | null> => {
      const token = localStorage.getItem('backend_token');
      if (!token) return null;

      try {
          const res = await fetch(`${API_BASE}/chapters/${chapterId}/like?manga_id=${mangaId}`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!res.ok) return null;
          const data = await res.json();
          const likeStatus: 'liked' | 'unliked' = data.status === 'liked' ? 'liked' : 'unliked';
          const delta = likeStatus === 'liked' ? 1 : -1;

          setMangaList(prev => prev.map(manga => {
              if (manga.id === mangaId) {
                  const updatedChapters = manga.chapters.map(chapter => {
                      if (chapter.id === chapterId) {
                          return { ...chapter, likes: Math.max(0, (chapter.likes || 0) + delta) };
                      }
                      return chapter;
                  });
                  return { ...manga, chapters: updatedChapters };
              }
              return manga;
          }));
          return likeStatus;
      } catch {
          return null;
      }
  }, []);

  const deleteManga = useCallback((id: string) => {
    fetch(`${API_BASE}/manga/${id}`, { method: 'DELETE' })
      .catch(err => console.error("Ошибка удаления манги с бэкенда:", err));
    setMangaList(prev => prev.filter(manga => manga.id !== id));
    const cache = getLocalCache();
    delete cache[id];
    setLocalCache(cache);
  }, []);

  const getMangaById = useCallback((id: string): Manga | undefined => {
    return mangaList.find(manga => manga.id === id);
  }, [mangaList]);

  return (
    <MangaContext.Provider value={{
      mangaList, loading, hasMore, totalCount,
      addManga, updateManga, deleteManga, getMangaById, fetchMangaById, fetchMangaChapters,
      updateChapters, updateChapterContent, rateManga, updateUserStatus, likeChapter,
      refreshMangas: fetchMangaList, loadMore, searchMangas,
    }}>
      {children}
    </MangaContext.Provider>
  );
};
