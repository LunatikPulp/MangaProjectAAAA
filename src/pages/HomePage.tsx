import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Carousel from '../components/Carousel';
import MangaCard from '../components/MangaCard';
import { Manga, typeDisplayNames } from '../types';
import HeroCarousel from '../components/HeroCarousel';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';
import { useBookmarks } from '../hooks/useBookmarks';
import { API_BASE, getPreloadedData } from '../services/externalApiService';
import ArrowUpRightIcon from '../components/icons/ArrowUpRightIcon';

/* ───── helpers ───── */

const timeAgo = (dateStr: string | null): string => {
    if (!dateStr) return '';
    let date = new Date(dateStr);
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        date = new Date(dateStr + 'Z');
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'только что';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    return `${Math.floor(days / 30)} мес. назад`;
};

const formatViews = (views: number): string => {
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
    return String(views);
};

/* ───── types ───── */

interface HomeSectionItem {
    manga_id: string;
    slug?: string;
    title: string;
    cover_url: string;
    manga_type: string;
    year: number;
    status: string;
    mangabuff_rating: string;
    mangabuff_views?: number;
    genres: string[];
    description?: string;
    user_rating_avg?: number | null;
    user_rating_count?: number;
}

interface LatestUpdateItem extends HomeSectionItem {
    latest_chapter: {
        chapter_id: string;
        chapter_number: string;
        title: string;
        date_added: string;
        created_at: string | null;
    } | null;
    recent_chapters_count: number;
    total_chapters: number;
}

interface HomeSections {
    popular: HomeSectionItem[];
    top_rated: HomeSectionItem[];
    newest: HomeSectionItem[];
    updated: LatestUpdateItem[];
    hot_new: HomeSectionItem[];
    new_season: HomeSectionItem[];
    trending: HomeSectionItem[];
    popular_today: HomeSectionItem[];
    fresh_chapters: HomeSectionItem[];
    featured: HomeSectionItem[];
    top_manhwa: HomeSectionItem[];
    top_manga: HomeSectionItem[];
    top_manhua: HomeSectionItem[];
}

/* ───── converters ───── */

const sectionItemToManga = (item: HomeSectionItem): Manga => ({
    id: item.manga_id,
    title: item.title,
    cover: item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || ''),
    type: (item.manga_type as Manga['type']) || 'Manga',
    year: item.year || 0,
    rating: item.user_rating_avg ?? (parseFloat(item.mangabuff_rating) || 0),
    views: item.mangabuff_views ? formatViews(item.mangabuff_views) : '0',
    description: item.description || '',
    chapters: [],
    genres: item.genres || [],
    status: item.status || '',
    userRatings: {},
});

/* ───── small components ───── */

interface ContinueReadingItem {
    mangaId: string;
    mangaTitle: string;
    mangaCover: string;
    mangaSlug: string;
    chapterId: string;
    chapterNumber: string;
    currentPage: number;
    totalPages: number;
    isComplete: boolean;
}

const ContinueReadingCard: React.FC<{ item: ContinueReadingItem }> = ({ item }) => {
    const { mangaTitle, mangaCover, mangaSlug, chapterId, chapterNumber, currentPage, totalPages, isComplete } = item;
    const displayNum = chapterNumber || '1';
    const percentage = totalPages > 0 ? (currentPage / totalPages) * 100 : (isComplete ? 100 : 10);
    const coverUrl = mangaCover && !mangaCover.startsWith('http') && !mangaCover.startsWith('//') ? `${API_BASE}${mangaCover}` : mangaCover;
    return (
        <Link to={`/manga/${mangaSlug}/chapter/${encodeURIComponent(chapterId)}${currentPage > 1 ? `?page=${currentPage}` : ''}`} className="block group bg-surface p-3 flex items-center gap-4 hover:bg-surface-hover border border-overlay hover:border-brand-accent-30 transition-all">
            <img src={coverUrl} alt={mangaTitle} className="w-12 h-16 object-cover border border-overlay" loading="lazy" decoding="async" />
            <div className="flex-1 overflow-hidden">
                <h4 className="text-md font-semibold truncate text-text-primary group-hover:text-brand-accent transition-colors">{mangaTitle}</h4>
                <p className="text-sm font-mono text-muted mt-1">Глава {displayNum}{totalPages > 0 ? ` · Стр. ${currentPage}/${totalPages}` : ''}</p>
                <div className="w-full bg-base h-1 mt-2">
                    <div className="bg-brand-accent h-1" style={{ width: `${percentage}%` }}></div>
                </div>
            </div>
        </Link>
    );
};

const GridSkeleton: React.FC<{ count: number }> = ({ count }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8">
        {Array.from({ length: count }).map((_, i) => <MangaCardSkeleton key={i} />)}
    </div>
);


/* ═══════════════════════════════════════════
   LatestUpdatesSection  — "Последние обновления"
   ═══════════════════════════════════════════ */

const LatestUpdatesSection: React.FC<{ items: LatestUpdateItem[] }> = ({ items }) => {
    const [visibleCount, setVisibleCount] = useState(8);
    const [filterMode, setFilterMode] = useState<'all' | 'exclude-bookmarks' | 'only-bookmarks'>('all');
    const [isFilterOpen, setFilterOpen] = useState(false);
    const { bookmarks } = useBookmarks();

    useEffect(() => { setVisibleCount(8); }, [items, filterMode]);

    const bookmarkIds = useMemo(() => new Set(bookmarks.map(b => b.mangaId)), [bookmarks]);
    const filtered = useMemo(() => {
        if (filterMode === 'exclude-bookmarks') return items.filter(m => !bookmarkIds.has(m.manga_id));
        if (filterMode === 'only-bookmarks') return items.filter(m => bookmarkIds.has(m.manga_id));
        return items;
    }, [bookmarkIds, filterMode, items]);

    const visibleList = filtered.slice(0, visibleCount);
    const hasMore = visibleCount < filtered.length;

    return (
        <div className="bg-surface p-6 md:p-8 border border-overlay spring-rust">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-brand-accent"></div>
                    <h2 className="text-2xl md:text-3xl font-display font-bold text-text-primary tracking-wide uppercase spring-glitch">Последние обновления</h2>
                </div>
                <div className="relative">
                    <button onClick={() => setFilterOpen(!isFilterOpen)} className="text-sm font-mono font-semibold text-muted hover:text-brand-accent transition-colors">[ФИЛЬТР]</button>
                    {isFilterOpen && (
                        <div className="absolute right-0 mt-2 w-52 bg-surface border border-overlay shadow-xl shadow-rust-20 overflow-hidden z-10">
                            {(['all', 'exclude-bookmarks', 'only-bookmarks'] as const).map(mode => (
                                <button key={mode} onClick={() => { setFilterMode(mode); setFilterOpen(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm font-mono ${filterMode === mode ? 'text-brand-accent font-semibold bg-brand-accent-5' : 'text-text-secondary hover:text-brand-accent hover:bg-surface-hover'}`}>
                                    {mode === 'all' ? 'Все тайтлы' : mode === 'exclude-bookmarks' ? 'Исключить закладки' : 'Только закладки'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                {visibleList.map((item) => {
                    const coverUrl = item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || '');
                    const ch = item.latest_chapter;
                    const ago = ch?.created_at ? timeAgo(ch.created_at) : (ch?.date_added || '');
                    const extraCount = item.recent_chapters_count > 1 ? item.recent_chapters_count - 1 : 0;
                    const mangaType = (item.manga_type as keyof typeof typeDisplayNames) || 'Manga';

                    return (
                        <div key={item.manga_id} className="flex items-start gap-4 p-3 text-text-primary hover:bg-surface-hover transition-all duration-300 border border-transparent hover:border-overlay">
                            <Link to={`/manga/${item.slug || item.manga_id}`} className="flex-shrink-0 relative">
                                <img src={coverUrl} alt={item.title} className="w-14 h-20 object-cover border border-overlay" loading="lazy" decoding="async" />
                                <span className="absolute top-1 left-1 text-[9px] font-mono font-bold text-white bg-brand-80 px-1.5 py-0.5 max-w-[calc(100%-0.5rem)] truncate">
                                    {typeDisplayNames[mangaType] || mangaType}
                                </span>
                            </Link>
                            <div className="flex-1 min-w-0">
                                <Link to={`/manga/${item.slug || item.manga_id}`} className="font-bold text-text-primary hover:text-brand-accent transition-colors text-sm md:text-base truncate block">
                                    {item.title}
                                </Link>
                                {ch && (
                                    <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-text-secondary gap-0.5 sm:gap-0">
                                        <Link
                                            to={`/manga/${item.slug || item.manga_id}/chapter/${encodeURIComponent(ch.chapter_id)}`}
                                            className="hover:text-brand transition-colors"
                                        >
                                            <span>Том 1 Глава {ch.chapter_number}</span>
                                        </Link>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {extraCount > 0 && (
                                                <span className="text-brand-accent font-mono font-semibold bg-brand-accent-10 px-1.5 py-0.5 text-[10px] whitespace-nowrap">
                                                    +{extraCount} {extraCount === 1 ? 'глава' : extraCount < 5 ? 'главы' : 'глав'}
                                                </span>
                                            )}
                                            <span className="text-muted">{ago}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {hasMore && (
                <div className="mt-6 flex justify-center">
                    <button onClick={() => setVisibleCount(prev => prev + 8)}
                        className="px-6 py-2.5 bg-surface border border-overlay text-sm font-mono font-semibold text-text-primary hover:bg-brand-accent hover:text-black hover:border-brand-accent transition-all">
                        Показать ещё
                    </button>
                </div>
            )}
        </div>
    );
};

/* ═══════════════════════════════════════════
   VerticalMangaList — "Топ Манхв" и т.п.
   ═══════════════════════════════════════════ */

const VerticalMangaList: React.FC<{ title: string; mangaList: Manga[]; viewAllLink?: string }> = ({ title, mangaList: list, viewAllLink = '/list/popular' }) => (
    <div className="bg-surface p-6 border border-overlay spring-rust">
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-brand-accent"></div>
                <h3 className="text-xl font-display font-bold text-text-primary tracking-wide uppercase">{title}</h3>
            </div>
            <Link to={viewAllLink} className="text-sm text-muted hover:text-brand-accent transition-colors p-2 hover:bg-brand-accent-5">
                <ArrowUpRightIcon className="w-5 h-5" />
            </Link>
        </div>
        <div className="space-y-3">
            {list.map((manga, index) => (
                <Link to={`/manga/${manga.slug || manga.id}`} key={manga.id} className="flex items-center gap-4 group p-3 text-text-primary hover:bg-surface-hover transition-all duration-300 border border-transparent hover:border-overlay">
                    <div className="relative">
                        <span className="absolute -left-2 -top-2 w-6 h-6 flex items-center justify-center bg-base text-xs font-mono font-bold text-brand-accent border border-overlay z-10">{String(index + 1).padStart(2, '0')}</span>
                        <img src={manga.cover} alt={manga.title} className="w-16 h-24 object-cover border border-overlay group-hover:border-brand-accent-30 transition-all duration-300" loading="lazy" decoding="async" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-mono font-bold text-brand bg-brand-10 px-2 py-0.5">{typeDisplayNames[manga.type]}</span>
                            <span className="text-xs font-mono text-muted">{manga.year}</span>
                        </div>
                        <h4 className="font-bold text-text-primary group-hover:text-brand-accent transition-colors leading-tight truncate text-sm md:text-base">{manga.title}</h4>
                        <div className="flex items-center text-xs text-muted mt-2 gap-3 font-mono">
                            <span>{manga.genres?.slice(0, 2).join(' / ')}</span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    </div>
);

/* ═══════════════════════════════════════════
   HomePage
   ═══════════════════════════════════════════ */

const HomePage: React.FC = () => {
    const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>([]);

    useEffect(() => {
        fetch(`${API_BASE}/continue-reading`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then((data: ContinueReadingItem[]) => setContinueReading(data))
            .catch(() => { });
    }, []);

    const [homeSections, setHomeSections] = useState<HomeSections | null>(() => {
        const preloaded = getPreloadedData();
        return preloaded?.home_sections || null;
    });
    const [sectionsLoading, setSectionsLoading] = useState(() => !getPreloadedData()?.home_sections);

    useEffect(() => {
        const preloaded = getPreloadedData();
        if (preloaded?.home_sections) {
            setHomeSections(preloaded.home_sections);
            setSectionsLoading(false);
        }
        fetch(`${API_BASE}/manga/home-sections`)
            .then(r => r.json())
            .then((data: HomeSections) => { setHomeSections(data); setSectionsLoading(false); })
            .catch(() => setSectionsLoading(false));
    }, []);

    const s = homeSections;

    // Wait for API data — no fallback to prevent flash of wrong content
    const hotUpdates = s?.hot_new?.length ? s.hot_new.map(sectionItemToManga) : [];
    const newSeason = s?.new_season?.length ? s.new_season.map(sectionItemToManga) : [];
    const trending = s?.trending?.length ? s.trending.map(sectionItemToManga) : [];
    const popularToday = s?.popular_today?.length ? s.popular_today.map(sectionItemToManga) : [];
    const popularCarousel = s?.popular?.length ? s.popular.map(sectionItemToManga) : [];
    const freshChapters = s?.fresh_chapters?.length ? s.fresh_chapters.map(sectionItemToManga) : [];
    const featuredManga = s?.featured?.length ? s.featured.map(sectionItemToManga) : [];
    const topManhwa = s?.top_manhwa?.length ? s.top_manhwa.map(sectionItemToManga) : [];
    const topManga = s?.top_manga?.length ? s.top_manga.map(sectionItemToManga) : [];
    const topManhua = s?.top_manhua?.length ? s.top_manhua.map(sectionItemToManga) : [];

    const hasTopTypes = topManhwa.length > 0 || topManga.length > 0 || topManhua.length > 0;

    if (sectionsLoading) return <GridSkeleton count={10} />;

    return (
        <div className="space-y-12 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-brand-accent-5 blur-[120px] rounded-full -z-10 pointer-events-none" />

            <HeroCarousel featuredManga={featuredManga} />

            <div className="space-y-16">
                {/* Горячие новинки */}
                <Carousel title="Горячие новинки" viewAllLink="/list/hot">
                    {hotUpdates.map(manga => (
                        <div key={manga.id} className="flex-shrink-0 w-40 md:w-52 snap-start">
                            <MangaCard manga={manga} />
                        </div>
                    ))}
                </Carousel>

                {/* Продолжить чтение */}
                {continueReading.length > 0 && (
                    <div className="bg-surface p-4 sm:p-8 border border-overlay spring-rust">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-1 h-8 bg-brand-accent"></div>
                                <h2 className="text-2xl md:text-3xl font-display font-bold text-text-primary tracking-wide uppercase">Продолжить чтение</h2>
                            </div>
                            <Link to="/history" className="text-sm font-mono text-muted hover:text-brand-accent transition-colors flex items-center gap-2 group">
                                <span>Вся история</span>
                                <div className="bg-surface border border-overlay p-1.5 group-hover:bg-brand-accent group-hover:text-black group-hover:border-brand-accent transition-all">
                                    <ArrowUpRightIcon className="w-4 h-4" />
                                </div>
                            </Link>
                        </div>
                        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-2 md:grid md:grid-cols-2 md:gap-6 md:overflow-x-visible md:snap-none md:-mx-0 md:px-0 md:pb-0 lg:grid-cols-4">
                            {continueReading.map(item => (
                                <div key={item.mangaId} className="flex-shrink-0 w-[85vw] max-w-sm snap-start md:w-auto md:max-w-none md:flex-shrink">
                                    <ContinueReadingCard item={item} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Новый сезон / В тренде / Популярно сегодня */}
                <div className="grid grid-cols-3 gap-8 max-md:flex max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:gap-4 max-md:-mx-4 max-md:px-4 max-md:pb-2 scrollbar-hide">
                    <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="Новый сезон" mangaList={newSeason} viewAllLink="/list/new-season" /></div>
                    <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="В тренде" mangaList={trending} viewAllLink="/list/trending" /></div>
                    <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="Популярно сегодня" mangaList={popularToday} viewAllLink="/list/popular-today" /></div>
                </div>

                {/* Популярное (карусель) */}
                <Carousel title="Популярное" viewAllLink="/list/popular">
                    {popularCarousel.map(manga => (
                        <div key={manga.id} className="flex-shrink-0 w-40 md:w-52 snap-start">
                            <MangaCard manga={manga} />
                        </div>
                    ))}
                </Carousel>

                {/* Свежие главы */}
                {freshChapters.length > 0 && (
                    <Carousel title="Свежие главы" viewAllLink="/list/fresh">
                        {freshChapters.map(manga => (
                            <div key={manga.id} className="flex-shrink-0 w-40 md:w-52 snap-start">
                                <MangaCard manga={manga} />
                            </div>
                        ))}
                    </Carousel>
                )}

                {/* Топ Манхв / Манг / Маньхуа */}
                {hasTopTypes && (
                    <div className="grid grid-cols-3 gap-8 max-md:flex max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:gap-4 max-md:-mx-4 max-md:px-4 max-md:pb-2 scrollbar-hide">
                        {topManhwa.length > 0 && <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="Топ Манхв" mangaList={topManhwa} viewAllLink="/list/top-manhwa" /></div>}
                        {topManga.length > 0 && <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="Топ Манг" mangaList={topManga} viewAllLink="/list/top-manga" /></div>}
                        {topManhua.length > 0 && <div className="max-md:flex-shrink-0 max-md:w-[85vw] max-md:snap-start"><VerticalMangaList title="Топ Маньхуа" mangaList={topManhua} viewAllLink="/list/top-manhua" /></div>}
                    </div>
                )}

                {/* Последние обновления */}
                {s?.updated && s.updated.length > 0 && (
                    <LatestUpdatesSection items={s.updated} />
                )}
            </div>
        </div>
    );
};

export default HomePage;
