import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MangaContext } from '../contexts/MangaContext';
import MangaCard from '../components/MangaCard';
import FilterSidebar from '../components/FilterSidebar';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';
import { motion } from 'framer-motion';
import { Manga } from '../types';
import { API_BASE } from '../services/externalApiService';

export type SortKey = 'popularity' | 'rating' | 'views' | 'chapters' | 'newest' | 'updated';
const VALID_SORT_KEYS: SortKey[] = ['popularity', 'rating', 'views', 'chapters', 'newest', 'updated'];

interface FiltersMeta {
    types: string[];
    statuses: string[];
    genres: string[];
    categories: string[];
}

const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('backend_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const defaultFilters = {
    type: 'all',
    status: 'all',
    genres: [] as string[],
    category: 'all',
    ageRating: 'all',
    ratingMin: '',
    ratingMax: '',
    yearMin: '',
    yearMax: '',
    chaptersMin: '',
    chaptersMax: '',
};

const parseFiltersFromParams = (params: URLSearchParams) => ({
    type: params.get('type') || 'all',
    status: params.get('status') || 'all',
    genres: params.getAll('genres'),
    category: params.get('category') || 'all',
    ageRating: params.get('ageRating') || 'all',
    ratingMin: params.get('ratingMin') || '',
    ratingMax: params.get('ratingMax') || '',
    yearMin: params.get('yearMin') || '',
    yearMax: params.get('yearMax') || '',
    chaptersMin: params.get('chaptersMin') || '',
    chaptersMax: params.get('chaptersMax') || '',
});

const filtersToParams = (filters: typeof defaultFilters, sortKey: SortKey): URLSearchParams => {
    const params = new URLSearchParams();
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.status !== 'all') params.set('status', filters.status);
    filters.genres.forEach(g => params.append('genres', g));
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.ageRating !== 'all') params.set('ageRating', filters.ageRating);
    if (filters.ratingMin) params.set('ratingMin', filters.ratingMin);
    if (filters.ratingMax) params.set('ratingMax', filters.ratingMax);
    if (filters.yearMin) params.set('yearMin', filters.yearMin);
    if (filters.yearMax) params.set('yearMax', filters.yearMax);
    if (filters.chaptersMin) params.set('chaptersMin', filters.chaptersMin);
    if (filters.chaptersMax) params.set('chaptersMax', filters.chaptersMax);
    if (sortKey !== 'popularity') params.set('sort', sortKey);
    return params;
};

const CatalogPage: React.FC = () => {
    const { getMangaById } = useContext(MangaContext);
    const [searchParams, setSearchParams] = useSearchParams();

    // Initialize from URL params
    const initialFilters = useMemo(() => parseFiltersFromParams(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
    const initialSort = useMemo(() => {
        const s = searchParams.get('sort');
        return (s && VALID_SORT_KEYS.includes(s as SortKey)) ? s as SortKey : 'popularity';
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [filters, setFilters] = useState(initialFilters);
    const [sortKey, setSortKey] = useState<SortKey>(initialSort);
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    // Sync filters/sort to URL (replace, not push, to avoid polluting history on every filter change)
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const params = filtersToParams(filters, sortKey);
        setSearchParams(params, { replace: true });
    }, [filters, sortKey, setSearchParams]);

    // Listen for popstate (browser back) — restore filters from URL
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            setFilters(parseFiltersFromParams(params));
            const s = params.get('sort');
            setSortKey((s && VALID_SORT_KEYS.includes(s as SortKey)) ? s as SortKey : 'popularity');
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Server-driven data
    const [mangaItems, setMangaItems] = useState<Manga[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const pageRef = useRef(1);
    const loaderRef = useRef<HTMLDivElement>(null);

    // Metadata for filters
    const [filtersMeta, setFiltersMeta] = useState<FiltersMeta>({ types: [], statuses: [], genres: [], categories: [] });

    // Fetch filters metadata
    useEffect(() => {
        fetch(`${API_BASE}/manga/filters-meta`)
            .then(r => r.json())
            .then(setFiltersMeta)
            .catch(() => {});
    }, []);

    // Build query params from filters
    const buildQuery = useCallback((page: number) => {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '30');
        params.set('sort', sortKey);
        if (filters.type !== 'all') params.set('manga_type', filters.type);
        if (filters.status !== 'all') params.set('status', filters.status);
        if (filters.ageRating !== 'all') params.set('age_rating', filters.ageRating);
        if (filters.category !== 'all') params.set('category', filters.category);
        if (filters.ratingMin) params.set('rating_min', filters.ratingMin);
        if (filters.ratingMax) params.set('rating_max', filters.ratingMax);
        if (filters.yearMin) params.set('year_min', filters.yearMin);
        if (filters.yearMax) params.set('year_max', filters.yearMax);
        if (filters.chaptersMin) params.set('chapters_min', filters.chaptersMin);
        if (filters.chaptersMax) params.set('chapters_max', filters.chaptersMax);
        // Send genres as multiple params
        filters.genres.forEach(g => params.append('genre', g));
        return params.toString();
    }, [filters, sortKey]);

    // Normalize backend item to Manga (simplified)
    const normalizeItem = useCallback((item: any): Manga => {
        const existing = getMangaById(item.manga_id);
        if (existing) return existing;

        const additional = item.additional_info || {};
        const genres: string[] = item.genres || [];
        const g = genres.map((s: string) => s.toLowerCase());
        let type = item.manga_type || 'Manga';
        if (g.some((x: string) => x.includes('маньхуа'))) type = 'Manhua';
        else if (g.some((x: string) => x.includes('манхва'))) type = 'Manhwa';

        return {
            id: item.manga_id,
            title: item.title || 'Без названия',
            description: item.description || '',
            cover: item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || ''),
            genres,
            type,
            year: item.year || 0,
            rating: item.rating_info?.average || 0,
            views: String(item.views || 0),
            status: item.status || '',
            chapters: [],
            alternativeNames: additional.alternative_names || [],
            ageRating: additional.age_rating || '',
            statistics: additional.statistics,
            ratingInfo: item.rating_info,
            userRatings: {},
            userStatuses: {},
        };
    }, [getMangaById]);

    // Fetch data from server
    const fetchData = useCallback(async (page: number, append: boolean = false) => {
        try {
            const query = buildQuery(page);
            const res = await fetch(`${API_BASE}/manga/list?${query}`, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const items = data.items.map(normalizeItem);

            if (append) {
                setMangaItems(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const unique = items.filter((m: Manga) => !existingIds.has(m.id));
                    return [...prev, ...unique];
                });
            } else {
                setMangaItems(items);
            }
            setTotalCount(data.total);
            setHasMore(data.page < data.pages);
            pageRef.current = page;
        } catch (e) {
            console.error('Ошибка загрузки каталога:', e);
        }
    }, [buildQuery, normalizeItem]);

    // Reset and fetch on filter/sort change
    useEffect(() => {
        setLoading(true);
        setMangaItems([]);
        pageRef.current = 1;
        fetchData(1).finally(() => setLoading(false));
    }, [filters, sortKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load more
    const handleLoadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchData(pageRef.current + 1, true);
        setLoadingMore(false);
    }, [fetchData, hasMore, loadingMore]);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    handleLoadMore();
                }
            },
            { threshold: 0.1 }
        );
        if (loaderRef.current) observer.observe(loaderRef.current);
        return () => observer.disconnect();
    }, [handleLoadMore, hasMore, loadingMore, loading]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.03 },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <div className="flex gap-8">
            <FilterSidebar
                filtersMeta={filtersMeta}
                filters={filters}
                setFilters={setFilters}
                sortKey={sortKey}
                setSortKey={setSortKey}
                resultsCount={totalCount}
                isOpen={isSidebarOpen}
                setIsOpen={setSidebarOpen}
            />
            <div className="flex-1">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">Каталог</h1>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden bg-surface p-2 rounded-md"
                    >
                        Фильтры
                    </button>
                </div>
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
                        {Array.from({ length: 10 }).map((_, i) => <MangaCardSkeleton key={i} />)}
                    </div>
                ) : (
                    mangaItems.length > 0 ? (
                        <>
                            <motion.div
                                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8"
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                            >
                                {mangaItems.map(manga => (
                                    <motion.div key={manga.id} variants={itemVariants}>
                                        <MangaCard manga={manga} />
                                    </motion.div>
                                ))}
                            </motion.div>
                            <div ref={loaderRef} className="py-8 flex justify-center">
                                {loadingMore && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8 w-full">
                                        {Array.from({ length: 5 }).map((_, i) => <MangaCardSkeleton key={`loading-${i}`} />)}
                                    </div>
                                )}
                                {!hasMore && mangaItems.length > 0 && (
                                    <p className="text-muted text-sm">Все тайтлы загружены ({totalCount})</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-16">
                            <h2 className="text-2xl font-bold text-text-primary">Ничего не найдено</h2>
                            <p className="text-muted mt-2">Попробуйте изменить или сбросить фильтры.</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default CatalogPage;
