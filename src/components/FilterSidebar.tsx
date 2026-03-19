import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SortKey } from '../pages/CatalogPage';
import { typeDisplayNames } from '../types';

interface FiltersMeta {
    types: string[];
    statuses: string[];
    genres: string[];
    categories: string[];
}

interface FilterSidebarProps {
    filtersMeta: FiltersMeta;
    filters: any;
    setFilters: (filters: any) => void;
    sortKey: SortKey;
    setSortKey: (key: SortKey) => void;
    resultsCount: number;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

type SectionName = 'sort' | 'genres' | 'categories' | 'type' | 'status' | 'age' | 'rating' | 'year' | 'chapters';

const FilterSection: React.FC<{
    title: string;
    name: SectionName;
    openSection: SectionName | null;
    setOpenSection: (s: SectionName | null) => void;
    children: React.ReactNode;
}> = ({ title, name, openSection, setOpenSection, children }) => {
    const isOpen = openSection === name;
    return (
        <div className="border-b border-surface">
            <button
                onClick={() => setOpenSection(isOpen ? null : name)}
                className="w-full flex justify-between items-center py-3 px-4 font-semibold text-text-primary hover:bg-overlay/30 transition-colors"
            >
                {title}
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="pb-3">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const RangeInput: React.FC<{
    minVal: string;
    maxVal: string;
    onMinChange: (v: string) => void;
    onMaxChange: (v: string) => void;
    placeholderMin?: string;
    placeholderMax?: string;
}> = ({ minVal, maxVal, onMinChange, onMaxChange, placeholderMin = 'от', placeholderMax = 'до' }) => (
    <div className="flex gap-2 px-4">
        <input
            type="number"
            value={minVal}
            onChange={(e) => onMinChange(e.target.value)}
            placeholder={placeholderMin}
            className="w-1/2 bg-base border border-overlay rounded-md p-2 text-sm text-text-primary placeholder:text-muted"
        />
        <input
            type="number"
            value={maxVal}
            onChange={(e) => onMaxChange(e.target.value)}
            placeholder={placeholderMax}
            className="w-1/2 bg-base border border-overlay rounded-md p-2 text-sm text-text-primary placeholder:text-muted"
        />
    </div>
);

const QuickTag: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1 text-xs font-mono font-semibold transition-colors ${active ? 'bg-brand-accent text-black font-mono' : 'bg-surface-30 text-text-secondary hover:bg-overlay'}`}
    >
        {label}
    </button>
);

const FilterSidebar: React.FC<FilterSidebarProps> = ({
    filtersMeta,
    filters,
    setFilters,
    sortKey,
    setSortKey,
    resultsCount,
    isOpen,
    setIsOpen,
}) => {
    const [openSection, setOpenSection] = useState<SectionName | null>(null);

    const handleGenreChange = (genre: string) => {
        const newGenres = filters.genres.includes(genre)
            ? filters.genres.filter((g: string) => g !== genre)
            : [...filters.genres, genre];
        setFilters({ ...filters, genres: newGenres });
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters({ ...filters, [key]: value });
    };

    const handleRangeChange = (key: string, value: string) => {
        setFilters({ ...filters, [key]: value });
    };

    const resetFilters = () => {
        setFilters({
            type: 'all',
            status: 'all',
            genres: [],
            category: 'all',
            ageRating: 'all',
            ratingMin: '',
            ratingMax: '',
            yearMin: '',
            yearMax: '',
            chaptersMin: '',
            chaptersMax: '',
        });
        setSortKey('popularity');
    };

    const isRatingPreset = (min: string, max: string) =>
        filters.ratingMin === min && filters.ratingMax === max;
    const setRatingPreset = (min: string, max: string) => {
        if (isRatingPreset(min, max)) {
            setFilters({ ...filters, ratingMin: '', ratingMax: '' });
        } else {
            setFilters({ ...filters, ratingMin: min, ratingMax: max });
        }
    };

    const isChaptersPreset = (min: string, max: string) =>
        filters.chaptersMin === min && filters.chaptersMax === max;
    const setChaptersPreset = (min: string, max: string) => {
        if (isChaptersPreset(min, max)) {
            setFilters({ ...filters, chaptersMin: '', chaptersMax: '' });
        } else {
            setFilters({ ...filters, chaptersMin: min, chaptersMax: max });
        }
    };

    // Active filter count indicator
    const activeCount = [
        filters.type !== 'all',
        filters.status !== 'all',
        filters.genres.length > 0,
        filters.category !== 'all',
        filters.ageRating !== 'all',
        filters.ratingMin || filters.ratingMax,
        filters.yearMin || filters.yearMax,
        filters.chaptersMin || filters.chaptersMax,
    ].filter(Boolean).length;

    const sidebarContent = (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-surface flex justify-between items-center">
                <h2 className="text-xl font-bold">
                    Фильтры
                    {activeCount > 0 && (
                        <span className="ml-2 text-xs bg-brand-accent text-black font-mono px-1.5 py-0.5">{activeCount}</span>
                    )}
                </h2>
                <button
                    onClick={() => setIsOpen(false)}
                    className="lg:hidden text-muted hover:text-text-primary text-2xl"
                >&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {/* Сортировка */}
                <FilterSection title="Сортировка" name="sort" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="px-4 py-1">
                        <select
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                            className="w-full bg-base border border-overlay rounded-md p-2 text-sm"
                        >
                            <option value="popularity">По популярности</option>
                            <option value="rating">По рейтингу</option>
                            <option value="views">По просмотрам</option>
                            <option value="chapters">По количеству глав</option>
                            <option value="newest">По новизне</option>
                            <option value="updated">По обновлениям</option>
                        </select>
                    </div>
                </FilterSection>

                {/* Жанры */}
                <FilterSection title={`Жанры${filters.genres.length ? ` (${filters.genres.length})` : ''}`} name="genres" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="max-h-48 overflow-y-auto px-4 space-y-0.5">
                        {filtersMeta.genres.map(genre => (
                            <label key={genre} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-overlay">
                                <input
                                    type="checkbox"
                                    checked={filters.genres.includes(genre)}
                                    onChange={() => handleGenreChange(genre)}
                                    className="h-4 w-4 rounded bg-base border-muted text-brand focus:ring-brand"
                                />
                                <span className="text-sm text-text-secondary">{genre}</span>
                            </label>
                        ))}
                        {filtersMeta.genres.length === 0 && (
                            <p className="text-xs text-muted py-2">Загрузка...</p>
                        )}
                    </div>
                </FilterSection>

                {/* Категории */}
                <FilterSection title={`Категории${filters.category !== 'all' ? ' (1)' : ''}`} name="categories" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="px-4 flex flex-wrap gap-1.5">
                        <button
                            onClick={() => handleFilterChange('category', 'all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                filters.category === 'all' ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                            }`}
                        >Все</button>
                        {filtersMeta.categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => handleFilterChange('category', cat)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    filters.category === cat ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </FilterSection>

                {/* Тип */}
                <FilterSection title="Тип" name="type" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="px-4 flex flex-wrap gap-1.5">
                        <button
                            onClick={() => handleFilterChange('type', 'all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                filters.type === 'all' ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                            }`}
                        >Все</button>
                        {filtersMeta.types.map(type => (
                            <button
                                key={type}
                                onClick={() => handleFilterChange('type', type)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    filters.type === type ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                                }`}
                            >
                                {typeDisplayNames[type] || type}
                            </button>
                        ))}
                    </div>
                </FilterSection>

                {/* Статус */}
                <FilterSection title="Статус" name="status" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="px-4 flex flex-wrap gap-1.5">
                        <button
                            onClick={() => handleFilterChange('status', 'all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                filters.status === 'all' ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                            }`}
                        >Все</button>
                        {filtersMeta.statuses.map(status => (
                            <button
                                key={status}
                                onClick={() => handleFilterChange('status', status)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    filters.status === status ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </FilterSection>

                {/* Возрастной рейтинг */}
                <FilterSection title="Возрастной рейтинг" name="age" openSection={openSection} setOpenSection={setOpenSection}>
                    <div className="px-4 flex gap-1.5">
                        {['all', '16+', '18+'].map(ar => (
                            <button
                                key={ar}
                                onClick={() => handleFilterChange('ageRating', ar)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    filters.ageRating === ar ? 'bg-brand-accent text-black font-mono' : 'bg-base hover:bg-overlay text-text-secondary'
                                }`}
                            >
                                {ar === 'all' ? 'Все' : ar}
                            </button>
                        ))}
                    </div>
                </FilterSection>

                {/* Рейтинг */}
                <FilterSection title="Рейтинг" name="rating" openSection={openSection} setOpenSection={setOpenSection}>
                    <RangeInput
                        minVal={filters.ratingMin}
                        maxVal={filters.ratingMax}
                        onMinChange={(v) => handleRangeChange('ratingMin', v)}
                        onMaxChange={(v) => handleRangeChange('ratingMax', v)}
                        placeholderMin="от 0"
                        placeholderMax="до 10"
                    />
                    <div className="flex gap-1.5 px-4 mt-2">
                        <QuickTag label="Лучшее" active={isRatingPreset('9', '10')} onClick={() => setRatingPreset('9', '10')} />
                        <QuickTag label="Хорошее" active={isRatingPreset('7', '10')} onClick={() => setRatingPreset('7', '10')} />
                    </div>
                </FilterSection>

                {/* Год выпуска */}
                <FilterSection title="Год выпуска" name="year" openSection={openSection} setOpenSection={setOpenSection}>
                    <RangeInput
                        minVal={filters.yearMin}
                        maxVal={filters.yearMax}
                        onMinChange={(v) => handleRangeChange('yearMin', v)}
                        onMaxChange={(v) => handleRangeChange('yearMax', v)}
                        placeholderMin="от"
                        placeholderMax="до"
                    />
                </FilterSection>

                {/* Количество глав */}
                <FilterSection title="Количество глав" name="chapters" openSection={openSection} setOpenSection={setOpenSection}>
                    <RangeInput
                        minVal={filters.chaptersMin}
                        maxVal={filters.chaptersMax}
                        onMinChange={(v) => handleRangeChange('chaptersMin', v)}
                        onMaxChange={(v) => handleRangeChange('chaptersMax', v)}
                        placeholderMin="от"
                        placeholderMax="до"
                    />
                    <div className="flex flex-wrap gap-1.5 px-4 mt-2">
                        <QuickTag label="<20" active={isChaptersPreset('', '20')} onClick={() => setChaptersPreset('', '20')} />
                        <QuickTag label="<50" active={isChaptersPreset('', '50')} onClick={() => setChaptersPreset('', '50')} />
                        <QuickTag label="50+" active={isChaptersPreset('50', '')} onClick={() => setChaptersPreset('50', '')} />
                        <QuickTag label="100+" active={isChaptersPreset('100', '')} onClick={() => setChaptersPreset('100', '')} />
                    </div>
                </FilterSection>
            </div>

            <div className="p-4 border-t border-surface mt-auto">
                <button
                    onClick={resetFilters}
                    className="w-full text-center bg-surface hover:bg-overlay text-text-primary font-bold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                    Сбросить ({resultsCount} найдено)
                </button>
            </div>
        </div>
    );

    return (
        <>
            <aside className="hidden lg:block w-72 flex-shrink-0 bg-surface rounded-lg sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-hidden">
                {sidebarContent}
            </aside>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/50 z-[998] lg:hidden"
                    >
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-80 bg-surface h-full"
                        >
                            {sidebarContent}
                        </motion.aside>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default FilterSidebar;
