import React, { useState, useContext, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MangaCard from '../components/MangaCard';
import { useBookmarks } from '../hooks/useBookmarks';
import { MangaContext } from '../contexts/MangaContext';
import { BookmarkStatus, Manga } from '../types';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';
import { API_BASE } from '../services/externalApiService';

const coverSrc = (url: string) => url?.startsWith('/') ? `${API_BASE}${url}` : url;

const tabs: { name: 'Все' | BookmarkStatus }[] = [
    { name: 'Все' },
    { name: 'Читаю' },
    { name: 'Буду читать' },
    { name: 'Прочитано' },
    { name: 'Брошено' },
    { name: 'Отложено' },
    { name: 'Не интересно' },
];

const BookmarksPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'Все' | BookmarkStatus>('Читаю');
    const { bookmarks } = useBookmarks();
    const { mangaList, loading, fetchMangaById } = useContext(MangaContext);
    const [loadingMissing, setLoadingMissing] = useState(false);
    // Randomizer state
    const [randomResult, setRandomResult] = useState<{ manga_id: string; title: string; cover_url: string; status: string; last_read: string | null } | null>(null);
    const [randomLoading, setRandomLoading] = useState(false);
    const [showRandom, setShowRandom] = useState(false);

    const handleRandom = async () => {
        const token = localStorage.getItem('backend_token');
        if (!token) return;
        setRandomLoading(true);
        setShowRandom(true);
        try {
            const res = await fetch(`${API_BASE}/auth/bookmarks/random`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setRandomResult(await res.json());
            } else {
                setRandomResult(null);
            }
        } catch {
            setRandomResult(null);
        }
        setRandomLoading(false);
    };

    // Подгружаем манги, которых нет в mangaList, но есть в закладках
    useEffect(() => {
        if (loading || bookmarks.length === 0) return;
        const mangaIds = new Set(mangaList.map(m => m.id));
        const missingIds = bookmarks.map(b => b.mangaId).filter(id => !mangaIds.has(id));
        if (missingIds.length === 0) return;

        setLoadingMissing(true);
        Promise.all(missingIds.map(id => fetchMangaById(id)))
            .finally(() => setLoadingMissing(false));
    }, [bookmarks, mangaList, loading, fetchMangaById]);

    const bookmarkedManga = useMemo(() => {
        const mangaMap = new Map(mangaList.map(m => [m.id, m]));
        return bookmarks
            .filter(b => activeTab === 'Все' || b.status === activeTab)
            .map(b => mangaMap.get(b.mangaId))
            .filter((m): m is Manga => !!m);
    }, [bookmarks, mangaList, activeTab]);
    
    const getCountForTab = (tabName: 'Все' | BookmarkStatus) => {
        if (tabName === 'Все') return bookmarks.length;
        return bookmarks.filter(b => b.status === tabName).length;
    };
    
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
            },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-bold">Закладки</h1>
                {bookmarks.length > 0 && (
                    <button
                        onClick={handleRandom}
                        disabled={randomLoading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-bold transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'rgba(169,255,0,0.1)',
                            border: '1px solid rgba(169,255,0,0.3)',
                            color: '#A9FF00',
                            borderRadius: '0px',
                        }}
                    >
                        <span className="text-lg">🎲</span>
                        {randomLoading ? 'Выбираю...' : 'Рандом'}
                    </button>
                )}
            </div>

            {/* Randomizer Modal */}
            <AnimatePresence>
                {showRandom && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowRandom(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.8, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="relative max-w-sm w-full mx-4"
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: '#1A1A1A',
                                border: '1px solid #3D2B1F',
                            }}
                        >
                            {randomLoading ? (
                                <div className="p-12 text-center">
                                    <div className="text-4xl mb-4 animate-spin">🎲</div>
                                    <p className="text-sm font-mono" style={{ color: '#A9FF00' }}>Выбираю случайную мангу...</p>
                                </div>
                            ) : randomResult ? (
                                <div>
                                    {randomResult.cover_url && (
                                        <div className="relative h-48 overflow-hidden">
                                            <img
                                                src={coverSrc(randomResult.cover_url)}
                                                alt={randomResult.title}
                                                className="w-full h-full object-cover"
                                                style={{ filter: 'brightness(0.6)' }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] to-transparent" />
                                            <div className="absolute bottom-3 left-4 right-4">
                                                <p className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: '#A9FF00' }}>
                                                    🎲 Рандом выбрал для тебя:
                                                </p>
                                                <h3 className="text-lg font-bold text-white font-mono leading-tight">{randomResult.title}</h3>
                                            </div>
                                        </div>
                                    )}
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: 'rgba(224,224,224,0.5)' }}>
                                            <span>Статус: <span style={{ color: '#A9FF00' }}>{randomResult.status}</span></span>
                                            <span>{randomResult.last_read ? `Читал: ${new Date(randomResult.last_read).toLocaleDateString('ru')}` : 'Ещё не читал'}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link
                                                to={`/manga/${randomResult.manga_id}`}
                                                className="flex-1 py-2.5 text-center text-sm font-mono font-bold transition-all"
                                                style={{
                                                    background: '#A9FF00',
                                                    color: '#121212',
                                                }}
                                                onClick={() => setShowRandom(false)}
                                            >
                                                Открыть →
                                            </Link>
                                            <button
                                                onClick={handleRandom}
                                                className="px-4 py-2.5 text-sm font-mono font-bold transition-all"
                                                style={{
                                                    background: 'rgba(169,255,0,0.1)',
                                                    border: '1px solid rgba(169,255,0,0.3)',
                                                    color: '#A9FF00',
                                                }}
                                            >
                                                🎲
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setShowRandom(false)}
                                            className="w-full py-2 text-xs font-mono transition-colors"
                                            style={{ color: 'rgba(224,224,224,0.3)' }}
                                        >
                                            Закрыть
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-12 text-center">
                                    <div className="text-4xl mb-4">😿</div>
                                    <p className="text-sm font-mono" style={{ color: 'rgba(224,224,224,0.5)' }}>Нет подходящих закладок</p>
                                    <button
                                        onClick={() => setShowRandom(false)}
                                        className="mt-4 px-6 py-2 text-xs font-mono"
                                        style={{ color: '#A9FF00', border: '1px solid rgba(169,255,0,0.3)' }}
                                    >
                                        Закрыть
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="border-b border-surface mb-6">
                <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
                    {tabs.map(tab => (
                        <TabButton
                            key={tab.name}
                            name={tab.name}
                            count={getCountForTab(tab.name)}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                        />
                    ))}
                </div>
            </div>

            {(loading || loadingMissing) ? (
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
                    {Array.from({ length: 6 }).map((_, i) => <MangaCardSkeleton key={i} />)}
                </div>
            ) : bookmarkedManga.length > 0 ? (
                <motion.div 
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {bookmarkedManga.map(manga => (
                        <motion.div key={manga.id} variants={itemVariants}>
                            <MangaCard manga={manga} />
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <div className="text-center py-16">
                    <h2 className="text-2xl font-bold text-text-primary">Здесь пока пусто</h2>
                    <p className="text-muted mt-2">Добавляйте мангу в закладки, чтобы она появилась здесь.</p>
                    <Link to="/catalog" className="mt-6 inline-block bg-brand hover:bg-brand-hover text-white font-bold py-2 px-6 rounded-lg transition-colors">
                        Перейти в каталог
                    </Link>
                </div>
            )}
        </div>
    );
};

const TabButton: React.FC<{ name: 'Все' | BookmarkStatus; count: number; activeTab: 'Все' | BookmarkStatus; setActiveTab: (name: 'Все' | BookmarkStatus) => void; }> = ({ name, count, activeTab, setActiveTab }) => {
    const isActive = name === activeTab;
    return (
        <button
            onClick={() => setActiveTab(name)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                isActive
                    ? 'border-brand text-text-primary'
                    : 'border-transparent text-muted hover:text-text-primary'
            }`}
        >
            {name} <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-none ${isActive ? 'bg-brand text-white' : 'bg-surface text-text-secondary'}`}>{count}</span>
        </button>
    );
};

export default BookmarksPage;
