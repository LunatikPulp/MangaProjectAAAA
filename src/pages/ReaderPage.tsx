import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MangaContext } from '../contexts/MangaContext';
import { Chapter, Page, BookmarkStatus } from '../types';
import { useHistory } from '../hooks/useHistory';
import { useIntersection } from '../hooks/useIntersection';
import { useReadingProgress } from '../hooks/useReadingProgress';
import ReaderSidebar from '../components/ReaderSidebar';
import ReaderHeader from '../components/ReaderHeader';
import ChapterListModal from '../components/ChapterListModal';
import ReaderSettingsModal, { ReaderSettings, defaultHotkeys } from '../components/ReaderSettingsModal';
import ChapterEnd from '../components/ChapterEnd';
import { ToasterContext } from '../contexts/ToasterContext';
import { useReports } from '../hooks/useReports';
import { AuthContext } from '../contexts/AuthContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import PagedChapterView from '../components/PagedChapterView';
import { API_BASE, fetchChapterPages, prefetchChapterPages, proxyImageUrl } from '../services/externalApiService';
import { useBookmarks } from '../hooks/useBookmarks';

/** Prefetch cache for instant image loading */
const prefetchCache = new Set<string>();
const prefetchImages = (urls: string[], start: number, count: number) => {
    for (let i = start; i < Math.min(start + count, urls.length); i++) {
        const url = urls[i];
        if (url && !prefetchCache.has(url)) {
            prefetchCache.add(url);
            const img = new Image();
            img.src = url;
        }
    }
};

/** Fetch with retry (for network hiccups like ERR_NETWORK_CHANGED) */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, delay * (i + 1))); }
  }
  throw new Error('unreachable');
}

/** ---------- Helpers ---------- */
const getPageSrc = (p: Page, wm: string = ""): string => {
  if (p.file) return URL.createObjectURL(p.file);
  if (p.url) {
    const raw = p.url.startsWith('//') ? 'https:' + p.url : p.url;
    return proxyImageUrl(raw, wm);
  }
  return '';
};

const getChapterImages = (ch: Chapter): string[] => {
  if (!Array.isArray(ch.pages)) return [];
  return ch.pages.map((p, i) => {
    let wm = "";
    if (i === 0 && ch.pages.length > 1) wm = "top";
    else if (i === ch.pages.length - 1 && ch.pages.length > 1) wm = "bottom";
    else if (ch.pages.length === 1) wm = "both";
    return getPageSrc(p, wm);
  }).filter(Boolean);
};
/** ----------------------------- */

const ScrollChapterView: React.FC<{
  chapters: Chapter[];
  onImageVisible: (chapterId: string, page: number) => void;
  containerWidth: number;
  brightness: number;
  imageFit: 'width' | 'height';
  imageUpscale: 'none' | 'auto';
  imageGap: number;
  mangaId?: string;
  onLastChapterReady?: () => void;
}> = React.memo(({ chapters, onImageVisible, containerWidth, brightness, imageFit, imageUpscale, imageGap, mangaId, onLastChapterReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onImageVisibleRef = useRef(onImageVisible);
  onImageVisibleRef.current = onImageVisible;

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const centerY = window.innerHeight / 2;
        const imgs = containerRef.current.querySelectorAll<HTMLImageElement>('img[data-chapter-id]');
        let best: HTMLImageElement | null = null;
        let bestDist = Infinity;
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          const dist = Math.abs((rect.top + rect.bottom) / 2 - centerY);
          if (dist < bestDist) {
            bestDist = dist;
            best = img;
          }
        }
        if (best) {
          const chId = best.getAttribute('data-chapter-id') || '';
          const pageNum = parseInt(best.getAttribute('data-page-num') || '1', 10);
          onImageVisibleRef.current(chId, pageNum);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [chapters]);

  return (
    <div ref={containerRef}>
      {chapters.map((chapter, index) => (
        <ChapterContent
          key={chapter.id}
          chapter={chapter}
          containerWidth={containerWidth}
          isLastChapter={index === chapters.length - 1}
          brightness={brightness}
          imageFit={imageFit}
          imageUpscale={imageUpscale}
          imageGap={imageGap}
          mangaId={mangaId}
          onReady={index === chapters.length - 1 ? onLastChapterReady : undefined}
        />
      ))}
    </div>
  );
});

const ChapterContent: React.FC<{
  chapter: Chapter;
  containerWidth: number;
  isLastChapter?: boolean;
  brightness: number;
  imageFit: 'width' | 'height';
  imageUpscale: 'none' | 'auto';
  imageGap: number;
  mangaId?: string;
  onReady?: () => void;
}> = React.memo(({ chapter, containerWidth, brightness, imageFit, imageUpscale, imageGap, mangaId, onReady }) => {
  const [lazyPages, setLazyPages] = useState<string[]>([]);
  const [lazyLoading, setLazyLoading] = useState(false);
  const staticImages = useMemo(() => getChapterImages(chapter), [chapter]);

  // Notify parent immediately if chapter already has static images
  useEffect(() => {
    if (staticImages.length > 0) onReady?.();
  }, [staticImages.length]);

  // Lazy-load pages if chapter has none (with retry on network errors)
  useEffect(() => {
    if (staticImages.length > 0 || lazyPages.length > 0 || lazyLoading) return;
    setLazyLoading(true);
    fetchWithRetry(() => fetchChapterPages(chapter.id, mangaId))
      .then((data) => {
        setLazyPages(data.pages || []);
        onReady?.();
      })
      .catch(() => {
        setLazyPages([]);
        onReady?.();
      })
      .finally(() => setLazyLoading(false));
  }, [chapter.id, staticImages.length, lazyPages.length, lazyLoading, mangaId]);

  const proxiedLazyPages = useMemo(() => {
    if (lazyPages.length === 0) return [];
    return lazyPages.map((url, i) => {
      let wm = "";
      if (i === 0 && lazyPages.length > 1) wm = "top";
      else if (i === lazyPages.length - 1 && lazyPages.length > 1) wm = "bottom";
      else if (lazyPages.length === 1) wm = "both";
      const raw = url.startsWith('//') ? 'https:' + url : url;
      return proxyImageUrl(raw, wm);
    });
  }, [lazyPages]);

  const images = staticImages.length > 0 ? staticImages : proxiedLazyPages;

  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

  // Reset loaded state when images change (new chapter)
  useEffect(() => {
    setLoadedImages(new Set());
  }, [images]);

  const handleImageLoad = useCallback((idx: number) => {
    setLoadedImages(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    // Prefetch next 3 images when current image loads
    prefetchImages(images, idx + 1, 3);
  }, [images]);

  // Retry loading image on network error (max 3 attempts)
  const retryCountRef = useRef<Record<number, number>>({});
  const handleImageError = useCallback((idx: number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const count = retryCountRef.current[idx] || 0;
    if (count < 3) {
      retryCountRef.current[idx] = count + 1;
      const img = e.currentTarget;
      setTimeout(() => {
        const src = img.src;
        img.src = '';
        img.src = src;
      }, 1000 * (count + 1));
    }
  }, []);

  const imgClass = imageFit === 'height'
    ? `h-[100dvh] w-auto mx-auto block ${imageUpscale === 'none' ? 'max-h-[100dvh]' : ''}`
    : `mx-auto block ${imageUpscale === 'none' ? 'max-w-full' : 'w-full'} h-auto`;

  if (lazyLoading) {
    return (
      <p className="text-center text-muted py-8 bg-surface rounded-md animate-pulse">
        Загрузка страниц главы {chapter.chapterNumber}...
      </p>
    );
  }

  if (!images || images.length === 0) {
    return (
      <p className="text-center text-muted py-8 bg-surface rounded-md">
        В главе {chapter.chapterNumber} нет страниц.
      </p>
    );
  }

  return (
    <div id={`chapter-${chapter.id}`} className="chapter-container mb-8">
      <div
        style={{
          width: `${containerWidth}%`,
          margin: '0 auto',
          filter: brightness < 100 ? `brightness(${brightness / 100})` : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: `${imageGap}px`,
        }}
      >
        <h2 className="text-center text-muted text-lg font-semibold my-4">
          Глава {chapter.chapterNumber}
        </h2>
        {images.map((src, idx) => {
          const showWatermark = true;
          return (
            <div key={`${chapter.id}-${idx}`} className="relative mx-auto w-full" style={{ containerType: 'inline-size' }}>
              <img
                src={src}
                alt={`Страница ${idx + 1}`}
                className={imgClass}
                data-chapter-id={chapter.id}
                data-page-num={idx + 1}
                onLoad={() => handleImageLoad(idx)}
                onError={(e) => handleImageError(idx, e)}
              />
              {showWatermark && loadedImages.has(idx) && (
                <div
                  className="absolute pointer-events-none select-none"
                  style={{
                    top: '50%',
                    right: '2cqw',
                    transform: 'translateY(-50%)',
                    opacity: 0.35,
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: '4cqw', fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1.2, color: '#ff3b3b', textTransform: 'uppercase', textShadow: '0 0 8px rgba(0,0,0,0.6)' }}>
                    SPRINGMANGA
                  </div>
                  <div style={{ fontSize: '2cqw', fontWeight: 700, letterSpacing: '0.05em', color: '#ff3b3b', textShadow: '0 0 5px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                    быстрее только у нас
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ReaderPage: React.FC<{ mangaId: string; chapterId: string; startPage?: number }> = ({
  mangaId: initialMangaId,
  chapterId: initialChapterId,
  startPage: startPageProp = 1,
}) => {
  const { getMangaById, likeChapter, updateManga, fetchMangaById, fetchMangaChapters } = useContext(MangaContext);
  const { addHistoryItem } = useHistory();
  const { updateProgress, getChapterProgress, isChapterRead } = useReadingProgress(initialMangaId);
  const updateProgressRef = useRef(updateProgress);
  updateProgressRef.current = updateProgress;

  // If no explicit startPage was passed (cold open / tab restore), restore from saved progress
  const startPage = useMemo(() => {
    if (startPageProp > 1) return startPageProp; // explicit navigation — use it
    const saved = getChapterProgress(initialChapterId);
    if (saved && !saved.isComplete && saved.currentPage > 1) return saved.currentPage;
    return 1;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChapterId]);
  const navigate = useNavigate();

  const { user } = useContext(AuthContext);
  const { showToaster } = useContext(ToasterContext);
  const { addReport } = useReports();
  const { getBookmarkStatus, updateBookmarkStatus, removeBookmark } = useBookmarks();

  // Common State
  const [settings, setSettings] = useLocalStorage<ReaderSettings>('reader_settings', {
    readerType: 'scroll',
    containerWidth: 100,
    imageServer: 'main',
    autoLoadNextChapter: true,
    showNotes: false,
    showPageIndicator: true,
    brightness: 100,
    imageFit: 'width',
    imageUpscale: 'none',
    clickZone: 'page',
    imageGap: 0,
    autoScrollSpeed: 2,
    hotkeys: { ...defaultHotkeys },
  });
  const [visibleChapterId, setVisibleChapterId] = useState<string>(initialChapterId);
  const [visiblePageInfo, setVisiblePageInfo] = useState<{ page: number; total: number }>({
    page: 1,
    total: 1,
  });
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [likedChapterIds, setLikedChapterIds] = useLocalStorage<string[]>(
    `liked_chapters_${user?.email || 'guest'}`,
    []
  );

  // Синхронизируем is_liked из бэкенда при загрузке
  const mangaForLikes = getMangaById(initialMangaId);
  useEffect(() => {
    if (!mangaForLikes || !user) return;
    const backendLiked = mangaForLikes.chapters
      .filter(ch => ch.is_liked)
      .map(ch => ch.id);
    if (backendLiked.length > 0) {
      setLikedChapterIds(prev => {
        const merged = new Set([...prev, ...backendLiked]);
        return Array.from(merged);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMangaId, user?.email]);

  // Header visibility state — тогглится по тапу
  const [isHeaderVisible, setHeaderVisible] = useState(true);

  // Modal States
  const [isChapterListOpen, setChapterListOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isCommentsOpen, setCommentsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Lock scroll on mobile when settings or report open
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && (isSettingsOpen || isReportOpen)) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isSettingsOpen, isReportOpen]);

  // Scroll Mode State
  const [loadedChapters, setLoadedChapters] = useState<Chapter[]>([]);

  // Reset loaded chapters when switching manga
  const prevMangaIdRef = useRef(initialMangaId);
  useEffect(() => {
    if (prevMangaIdRef.current !== initialMangaId) {
      setLoadedChapters([]);
      setVisibleChapterId(initialChapterId);
      setCurrentPagedChapterId(initialChapterId);
      prevMangaIdRef.current = initialMangaId;
    }
  }, [initialMangaId]);

  // Paged Mode State
  const [currentPagedChapterId, setCurrentPagedChapterId] = useState(initialChapterId);

  const manga = getMangaById(initialMangaId);
  const likeCount = useMemo(() => {
    if (!manga) return 0;
    const chapter = manga.chapters.find(ch => ch.id === visibleChapterId);
    return chapter?.likes || 0;
  }, [manga, visibleChapterId]);
  // Fetch manga and chapters if not available
  useEffect(() => {
    if (!manga) {
      fetchMangaById(initialMangaId);
    } else if (manga.chapters.length === 0) {
      fetchMangaChapters(initialMangaId);
    }
  }, [manga, initialMangaId, fetchMangaById, fetchMangaChapters]);

  const bookmarkStatus = getBookmarkStatus(initialMangaId);
  const isBookmarked = !!bookmarkStatus;
  const bookmarkStatuses: BookmarkStatus[] = ['Читаю', 'Буду читать', 'Прочитано', 'Отложено', 'Брошено', 'Не интересно'];

  // Auto-scrolling logic
  const scrollSpeed = settings.autoScrollSpeed ?? 2;
  useEffect(() => {
    let scrollInterval: number | null = null;
    if (isAutoScrolling) {
      scrollInterval = window.setInterval(() => {
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
          setIsAutoScrolling(false);
        } else {
          window.scrollBy(0, scrollSpeed);
        }
      }, 15);
    }
    return () => {
      if (scrollInterval) clearInterval(scrollInterval);
    };
  }, [isAutoScrolling, scrollSpeed]);


  // Track chapter view on backend + update local state (debounced — only after 5s on same chapter)
  useEffect(() => {
    if (!visibleChapterId || !initialMangaId || !manga) return;
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/chapters/${visibleChapterId}/view?manga_id=${initialMangaId}`, {
        method: 'POST',
        credentials: 'include',
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.status === 'viewed') {
            const updatedChapters = manga.chapters.map(ch =>
              ch.id === visibleChapterId ? { ...ch, views: (ch.views || 0) + 1 } : ch
            );
            updateManga(initialMangaId, { chapters: updatedChapters });
          }
        })
        .catch(() => {/* ignore errors */});
    }, 5000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChapterId, initialMangaId]);

  const sortedChapters = useMemo(() => {
    if (!manga) return [];
    return [...manga.chapters].sort(
      (a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber)
    );
  }, [manga]);

  // === Paged Mode Logic ===
  const { currentPagedChapter, pagedPrevChapter, pagedNextChapter } = useMemo(() => {
    const currentIndex = sortedChapters.findIndex((c) => c.id === currentPagedChapterId);
    if (currentIndex === -1)
      return { currentPagedChapter: null, pagedPrevChapter: null, pagedNextChapter: null };
    return {
      currentPagedChapter: sortedChapters[currentIndex],
      pagedPrevChapter: currentIndex > 0 ? sortedChapters[currentIndex - 1] : null,
      pagedNextChapter:
        currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null,
    };
  }, [sortedChapters, currentPagedChapterId]);

  const handleNavigateChapter = (chapterId: string | null) => {
    if (chapterId) {
      setCurrentPagedChapterId(chapterId);
      setVisibleChapterId(chapterId);
      navigate(`/manga/${initialMangaId}/chapter/${encodeURIComponent(chapterId)}`, { replace: true });
    }
  };

  useEffect(() => {
    setCurrentPagedChapterId(initialChapterId);
  }, [initialChapterId]);

  // === Scroll Mode Logic ===
  const isLastChapterLoaded = useMemo(() => {
    if (loadedChapters.length === 0 || sortedChapters.length === 0) return false;
    const lastLoadedChapterId = loadedChapters[loadedChapters.length - 1].id;
    const lastAvailableChapterId = sortedChapters[sortedChapters.length - 1].id;
    return lastLoadedChapterId === lastAvailableChapterId;
  }, [loadedChapters, sortedChapters]);

  const startPageScrolledRef = useRef(false);

  useEffect(() => {
    const startingChapter = sortedChapters.find((c) => c.id === initialChapterId);
    if (!startingChapter) return;
    setLoadedChapters((prev) => {
      if (settings.readerType === 'scroll') {
        // Only keep prev if it belongs to current manga chapters
        const belongsToCurrent = prev.length > 0 && sortedChapters.some(sc => sc.id === prev[0].id);
        return (prev.length === 0 || !belongsToCurrent) ? [startingChapter] : prev;
      }
      return [startingChapter];
    });
  }, [initialChapterId, sortedChapters, initialMangaId, settings.readerType]);

  // Прокрутка к нужной странице при загрузке (режим ленты)
  useEffect(() => {
    if (startPageScrolledRef.current || startPage <= 1 || settings.readerType !== 'scroll') return;
    // Ждём пока картинки отрендерятся
    const timer = setTimeout(() => {
      const img = document.querySelector(`img[data-chapter-id="${initialChapterId}"][data-page-num="${startPage}"]`);
      if (img) {
        img.scrollIntoView({ behavior: 'auto', block: 'start' });
        startPageScrolledRef.current = true;
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [loadedChapters, startPage, initialChapterId, settings.readerType]);

  // Prefetch next 2 chapters' pages when current chapter changes (instant loading)
  useEffect(() => {
    if (!visibleChapterId || sortedChapters.length === 0) return;
    const idx = sortedChapters.findIndex(c => c.id === visibleChapterId);
    if (idx === -1) return;
    const toFetch: string[] = [];
    for (let i = 1; i <= 2; i++) {
      if (idx + i < sortedChapters.length) toFetch.push(sortedChapters[idx + i].id);
    }
    if (toFetch.length > 0) prefetchChapterPages(toFetch, initialMangaId);
  }, [visibleChapterId, sortedChapters, initialMangaId]);

  // Debounced history sync — only record after 6s on same chapter to prevent false reads
  useEffect(() => {
    if (!visibleChapterId) return;
    const timer = setTimeout(() => {
      addHistoryItem(initialMangaId, visibleChapterId);
    }, 6000);
    return () => clearTimeout(timer);
  }, [visibleChapterId, initialMangaId, addHistoryItem]);

  // Block auto-loading next chapter until the last loaded chapter has fetched its pages.
  // We use a counter that increments when the last chapter becomes ready, which triggers
  // a re-check of intersection in case the sentinel is already visible.
  const lastChapterReadyRef = useRef(true);
  const [readyTick, setReadyTick] = useState(0);

  const handleLastChapterReady = useCallback(() => {
    lastChapterReadyRef.current = true;
    setReadyTick(t => t + 1); // Force re-evaluation of loadNextChapter
  }, []);

  const loadNextChapter = useCallback(() => {
    if (isLastChapterLoaded || loadedChapters.length === 0 || !settings.autoLoadNextChapter) return;
    if (!lastChapterReadyRef.current) return;
    lastChapterReadyRef.current = false;
    const lastLoadedChapter = loadedChapters[loadedChapters.length - 1];
    const lastLoadedIndex = sortedChapters.findIndex((c) => c.id === lastLoadedChapter.id);
    if (lastLoadedIndex !== -1 && lastLoadedIndex < sortedChapters.length - 1) {
      const nextRaw = sortedChapters[lastLoadedIndex + 1];
      setLoadedChapters((prev) => [...prev, nextRaw]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedChapters, sortedChapters, isLastChapterLoaded, settings.autoLoadNextChapter, readyTick]);

  const intersectionRef = useIntersection(loadNextChapter, { rootMargin: '500px' });

  // === Common Logic ===
  const handleImageVisible = useCallback(
    (chapterId: string, page: number) => {
      setVisibleChapterId(chapterId);
      const ch = sortedChapters.find((c) => c.id === chapterId);
      if (ch) {
        const chapterEl = document.getElementById(`chapter-${chapterId}`);
        const total = chapterEl
          ? chapterEl.querySelectorAll('img[data-chapter-id]').length
          : getChapterImages(ch).length;
        setVisiblePageInfo({ page, total });
        updateProgressRef.current(chapterId, ch.chapterNumber, page, total);
      }
    },
    [sortedChapters]
  );

  const handlePagedPageChange = useCallback((page: number, total: number) => {
    setVisiblePageInfo({ page, total });
    if (currentPagedChapter) {
      updateProgressRef.current(currentPagedChapter.id, currentPagedChapter.chapterNumber, page, total);
    }
  }, [currentPagedChapter]);

  const handleReport = (reason: string, message: string) => {
    if (!user || !manga) {
      showToaster('Пожалуйста, войдите, чтобы отправить жалобу.');
      return;
    }
    addReport({ mangaId: manga.id, mangaTitle: manga.title, reason, message });
    showToaster('Жалоба отправлена. Спасибо!');
  };

  const handleBookmarkStatusSelect = (status: string) => {
    if (!user) {
      showToaster('Пожалуйста, войдите, чтобы управлять закладками.');
      navigate('/login');
      return;
    }
    updateBookmarkStatus(initialMangaId, status as BookmarkStatus);
    showToaster(`Статус: ${status}`);
  };

  const handleBookmarkRemove = () => {
    if (!user) {
      showToaster('Пожалуйста, войдите, чтобы управлять закладками.');
      navigate('/login');
      return;
    }
    removeBookmark(initialMangaId);
    showToaster('Закладка удалена');
  };

  // === Navigation helpers for sidebar (работают и в ленте, и в постраничном режиме) ===
  const handlePrevChapterJump = useCallback(() => {
    const idx = sortedChapters.findIndex((c) => c.id === visibleChapterId);
    if (idx > 0) {
      const prev = sortedChapters[idx - 1];
      if (settings.readerType === 'scroll') {
        setLoadedChapters([prev]);
        setVisibleChapterId(prev.id);
        navigate(`/manga/${initialMangaId}/chapter/${encodeURIComponent(prev.id)}`, { replace: true });
        window.scrollTo(0, 0);
      } else {
        handleNavigateChapter(prev.id);
      }
    }
  }, [sortedChapters, visibleChapterId, settings.readerType, handleNavigateChapter, navigate, initialMangaId]);

  const handleNextChapterJump = useCallback(() => {
    const idx = sortedChapters.findIndex((c) => c.id === visibleChapterId);
    if (idx !== -1 && idx < sortedChapters.length - 1) {
      const next = sortedChapters[idx + 1];
      if (settings.readerType === 'scroll') {
        setLoadedChapters([next]);
        setVisibleChapterId(next.id);
        navigate(`/manga/${initialMangaId}/chapter/${encodeURIComponent(next.id)}`, { replace: true });
        window.scrollTo(0, 0);
      } else {
        handleNavigateChapter(next.id);
      }
    }
  }, [sortedChapters, visibleChapterId, settings.readerType, handleNavigateChapter, navigate, initialMangaId]);

  const handleLike = useCallback(async () => {
    if (!user || !manga) {
      showToaster('Пожалуйста, войдите, чтобы поблагодарить.');
      return;
    }
    const result = await likeChapter(manga.id, visibleChapterId);
    if (result === 'liked') {
      setLikedChapterIds((prev) => [...prev, visibleChapterId]);
      showToaster('Спасибо за поддержку!');
    } else if (result === 'unliked') {
      setLikedChapterIds((prev) => prev.filter((id) => id !== visibleChapterId));
      showToaster('Лайк убран.');
    } else if ((result as any) === 'no_token') {
      showToaster('Выйдите и войдите заново для активации лайков.');
    } else {
      showToaster('Не удалось выполнить действие.');
    }
  }, [user, manga, likeChapter, visibleChapterId, showToaster, setLikedChapterIds]);

  useEffect(() => {
    const lastTapRef = { time: 0, x: 0, y: 0 };
    let tapTimer: number | null = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let hasMoved = false;
    let touchStartTime = 0;
    let scrollYOnStart = 0;

    const isInteractive = (el: Node): boolean => {
      if (el instanceof HTMLElement) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
        if (el.closest('.reader-header, .reader-bottom-bar, [role="dialog"], .reader-comments-sheet')) return true;
      }
      return false;
    };

    const isCenter = (x: number, y: number) => {
      if (settings.clickZone === 'anywhere') return true;
      const w = window.innerWidth;
      const h = window.innerHeight;
      return x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75;
    };

    const onTouchStart = (e: TouchEvent) => {
      hasMoved = false;
      touchStartTime = Date.now();
      scrollYOnStart = window.scrollY;
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const dx = Math.abs(e.touches[0].clientX - touchStartX);
        const dy = Math.abs(e.touches[0].clientY - touchStartY);
        if (dx > 15 || dy > 15) hasMoved = true;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      if (e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;

      const touchDuration = Date.now() - touchStartTime;
      const scrollDelta = Math.abs(window.scrollY - scrollYOnStart);
      if (touchDuration > 400 || scrollDelta > 10) return;

      if (isInteractive(e.target as Node)) return;
      if (isReportOpen) return;
      if (!isCenter(e.clientX, e.clientY)) return;

      const now = Date.now();
      const timeDiff = now - lastTapRef.time;
      const distX = Math.abs(e.clientX - lastTapRef.x);
      const distY = Math.abs(e.clientY - lastTapRef.y);

      if (timeDiff < 300 && distX < 50 && distY < 50) {
        if (tapTimer) {
          window.clearTimeout(tapTimer);
          tapTimer = null;
        }
        lastTapRef.time = 0;
        handleLike();
        return;
      }

      lastTapRef.time = now;
      lastTapRef.x = e.clientX;
      lastTapRef.y = e.clientY;

      tapTimer = window.setTimeout(() => {
        setHeaderVisible((v) => !v);
      }, 260);
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('pointerup', onPointerUp);
      if (tapTimer) window.clearTimeout(tapTimer);
    };
  }, [handleLike, settings.clickZone, isReportOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const hotkeys = settings.hotkeys ?? defaultHotkeys;
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or modals
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (isSettingsOpen || isChapterListOpen) return;

      const code = e.code;
      if (code === hotkeys.nextChapter) {
        e.preventDefault();
        handleNextChapterJump();
      } else if (code === hotkeys.prevChapter) {
        e.preventDefault();
        handlePrevChapterJump();
      } else if (code === hotkeys.nextPage) {
        e.preventDefault();
        window.scrollBy(0, window.innerHeight * 0.9);
      } else if (code === hotkeys.prevPage) {
        e.preventDefault();
        window.scrollBy(0, -window.innerHeight * 0.9);
      } else if (code === hotkeys.widthUp) {
        e.preventDefault();
        setSettings(prev => ({ ...prev, containerWidth: Math.min(100, prev.containerWidth + 5) }));
      } else if (code === hotkeys.widthDown) {
        e.preventDefault();
        setSettings(prev => ({ ...prev, containerWidth: Math.max(10, prev.containerWidth - 5) }));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settings.hotkeys, isSettingsOpen, isChapterListOpen, handleNextChapterJump, handlePrevChapterJump, setSettings]);

  const handleCommentsClick = () => {
    setCommentsOpen(true);
  };

  const handleBackToManga = () => {
    navigate(`/manga/${initialMangaId}`);
  };

  if (!manga) return <div className="text-center p-8">Загрузка манги...</div>;
  if (sortedChapters.length === 0) return <div className="text-center p-8">В этой манге пока нет глав.</div>;

  return (
    <div className="mx-auto pb-20 md:pb-0">
      <ReaderHeader
        mangaTitle={manga.title}
        mangaId={manga.id}
        isVisible={isHeaderVisible}
        chapterNumber={
          (sortedChapters.find(c => c.id === visibleChapterId)?.chapterNumber) || '1'
        }
        onPrevChapter={handlePrevChapterJump}
        onNextChapter={handleNextChapterJump}
        hasPrev={sortedChapters.findIndex(c => c.id === visibleChapterId) > 0}
        hasNext={sortedChapters.findIndex(c => c.id === visibleChapterId) < sortedChapters.length - 1}
        onReport={handleReport}
        onReportOpenChange={setIsReportOpen}
      />
      <ReaderSidebar
        currentPage={visiblePageInfo.page}
        totalPages={visiblePageInfo.total}
        showPageIndicator={settings.showPageIndicator}
        onChapterListClick={() => setChapterListOpen(true)}
        onCommentsClick={handleCommentsClick}
        onSettingsClick={() => setSettingsOpen(true)}
        onReportClick={() => {}}
        onReport={handleReport}
        onLikeClick={handleLike}
        isLiked={likedChapterIds.includes(visibleChapterId)}
        likeCount={likeCount}
        onAutoScrollToggle={() => setIsAutoScrolling((prev) => !prev)}
        isAutoScrolling={isAutoScrolling}
        onBackToManga={handleBackToManga}
        onPrevChapterClick={handlePrevChapterJump}
        onNextChapterClick={handleNextChapterJump}
        readerType={settings.readerType}
        isVisible={isHeaderVisible}
        isBookmarked={isBookmarked}
        bookmarkStatus={bookmarkStatus || null}
        bookmarkStatuses={bookmarkStatuses}
        onBookmarkStatusSelect={handleBookmarkStatusSelect}
        onBookmarkRemove={handleBookmarkRemove}
      />

      <ChapterListModal
        isOpen={isChapterListOpen}
        onClose={() => setChapterListOpen(false)}
        chapters={manga.chapters}
        mangaId={manga.id}
        currentChapterId={visibleChapterId}
        isChapterRead={isChapterRead}
      />
      <ReaderSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isCommentsOpen && (
            <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setCommentsOpen(false)}>
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                className="reader-comments-sheet w-full md:max-w-2xl bg-base rounded-t-2xl md:rounded-2xl border-t md:border border-text-primary-10 shadow-2xl max-h-[85vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-text-primary-10">
                  <div className="font-bold text-text-primary">Комментарии к главе</div>
                  <button onClick={() => setCommentsOpen(false)} className="p-2 rounded-full hover:bg-text-primary-10 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4">
                  <ChapterEnd mangaId={initialMangaId} />
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="mx-auto w-full lg:w-[40vw]">
        {settings.readerType === 'scroll' ? (
          <>
            <ScrollChapterView
              chapters={loadedChapters}
              onImageVisible={handleImageVisible}
              containerWidth={settings.containerWidth}
              brightness={settings.brightness ?? 100}
              imageFit={settings.imageFit ?? 'width'}
              imageUpscale={settings.imageUpscale ?? 'none'}
              imageGap={settings.imageGap ?? 0}
              mangaId={initialMangaId}
              onLastChapterReady={handleLastChapterReady}
            />
            {!isLastChapterLoaded && settings.autoLoadNextChapter && (
              <div ref={intersectionRef} className="h-48 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
              </div>
            )}
          </>
        ) : currentPagedChapter ? (
          <PagedChapterView
            key={currentPagedChapterId}
            chapter={currentPagedChapter}
            onNextChapter={() => handleNavigateChapter(pagedNextChapter?.id || null)}
            onPrevChapter={() => handleNavigateChapter(pagedPrevChapter?.id || null)}
            onPageChange={handlePagedPageChange}
            initialPage={currentPagedChapterId === initialChapterId ? startPage : 1}
            mangaId={initialMangaId}
          />
        ) : (
          <div className="text-center p-8">Глава не найдена.</div>
        )}
      </div>
    </div>
  );
};

export default ReaderPage;
