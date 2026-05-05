import { useLocalStorage } from './useLocalStorage';
import { useContext, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../services/externalApiService';

export interface ReadingProgress {
  chapterId: string;
  chapterNumber: string;
  currentPage: number;
  totalPages: number;
  isComplete: boolean;
  lastReadAt: string;
}

export const useReadingProgress = (mangaId: string) => {
  const { user } = useContext(AuthContext);
  const userId = user?.email || 'guest';
  const isLoggedIn = !!user;
  const syncedRef = useRef(false);
  const pendingRef = useRef<{ chapterId: string; chapterNumber: string; currentPage: number; totalPages: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<{ chapterId: string; currentPage: number } | null>(null);

  const [readingProgress, setReadingProgress] = useLocalStorage<Record<string, ReadingProgress>>(
    `reading_progress_${mangaId}_${userId}`,
    {}
  );

  useEffect(() => {
    if (!isLoggedIn || syncedRef.current) return;
    syncedRef.current = true;
    fetch(`${API_BASE}/reading-progress?manga_id=${encodeURIComponent(mangaId)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: { manga_id: string; chapter_id: string; chapter_number: string; current_page: number; total_pages: number; is_complete: boolean; last_read_at: string }[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setReadingProgress(prev => {
          const next = { ...prev };
          for (const item of data) {
            const existing = prev[item.chapter_id];
            if (existing && existing.currentPage >= item.current_page) continue;
            next[item.chapter_id] = {
              chapterId: item.chapter_id,
              chapterNumber: item.chapter_number || '',
              currentPage: item.current_page,
              totalPages: item.total_pages,
              isComplete: item.is_complete,
              lastReadAt: item.last_read_at,
            };
          }
          if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
          return next;
        });
      })
      .catch(() => {});
  }, [isLoggedIn, mangaId]);

  const updateProgress = useCallback((chapterId: string, chapterNumber: string, currentPage: number, totalPages: number) => {
    const isComplete = currentPage >= totalPages;
    const now = new Date().toISOString();

    setReadingProgress(prev => {
      const existing = prev[chapterId];
      if (existing && existing.currentPage >= currentPage && existing.totalPages === totalPages) return prev;
      return {
        ...prev,
        [chapterId]: { chapterId, chapterNumber, currentPage, totalPages, isComplete, lastReadAt: now },
      };
    });

    pendingRef.current = { chapterId, chapterNumber, currentPage, totalPages };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const p = pendingRef.current;
      if (!p || !isLoggedIn) return;
      const lastSynced = lastSyncedRef.current;
      if (lastSynced && lastSynced.chapterId === p.chapterId && lastSynced.currentPage === p.currentPage) {
        pendingRef.current = null;
        return;
      }
      lastSyncedRef.current = { chapterId: p.chapterId, currentPage: p.currentPage };
      fetch(`${API_BASE}/reading-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          manga_id: mangaId,
          chapter_id: p.chapterId,
          chapter_number: p.chapterNumber,
          current_page: p.currentPage,
          total_pages: p.totalPages,
        }),
      }).catch(() => {});
      pendingRef.current = null;
    }, 5000);
  }, [mangaId, isLoggedIn, setReadingProgress]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const getChapterProgress = useCallback((chapterId: string): ReadingProgress | null => {
    return readingProgress[chapterId] || null;
  }, [readingProgress]);

  const getLastReadChapter = useCallback((): ReadingProgress | null => {
    const chapters = Object.values(readingProgress);
    if (chapters.length === 0) return null;
    return chapters.reduce((latest, current) => {
      return new Date(current.lastReadAt) > new Date(latest.lastReadAt) ? current : latest;
    });
  }, [readingProgress]);

  const isChapterRead = useCallback((chapterId: string): boolean => {
    const progress = readingProgress[chapterId];
    return progress ? progress.isComplete : false;
  }, [readingProgress]);

  return {
    readingProgress,
    updateProgress,
    getChapterProgress,
    getLastReadChapter,
    isChapterRead,
  };
};
