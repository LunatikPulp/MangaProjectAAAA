import React, { useState, useContext, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Manga, CharacterInfo, typeDisplayNames } from '../types';
import { isGeminiAvailable, generateCharacterInfo } from '../services/geminiService';
import ReportIcon from '../components/icons/ReportIcon';
import { useHistory } from '../hooks/useHistory';
import { useReadingProgress } from '../hooks/useReadingProgress';
import { useBookmarks } from '../hooks/useBookmarks';
import CommentSection from '../components/CommentSection';
import Modal from '../components/Modal';
import { MangaContext } from '../contexts/MangaContext';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import BookmarkButton from '../components/BookmarkButton';
import { useReports } from '../hooks/useReports';
import SubscribeButton from '../components/SubscribeButton';
import { API_BASE } from '../services/externalApiService';
import StarIcon from '../components/icons/StarIcon';
import HeartIcon from '../components/icons/HeartIcon';
import { BookmarkStatus } from '../types';

interface DetailPageProps {
    manga: Manga;
}

const getChapterLabel = (ch: { title: string; chapterNumber: string }) => {
    const title = ch.title || '';
    // "Том X Глава Y" -> "X Глава Y" (just volume number, no "Том" word)
    const tomMatch = title.match(/Том\s+(\S+)\s+Глава\s+(\S+)/i);
    if (tomMatch) return `${tomMatch[1]} Глава ${tomMatch[2]}`;
    // Otherwise show clean "Глава N"
    const num = ch.chapterNumber || '?';
    return `Глава ${num}`;
};
const formatChapterName = getChapterLabel;

const formatChapterDate = (dateStr: string) => {
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
    } catch {
        return dateStr;
    }
};
const formatAgeRating = (value?: string, genres?: string[], tags?: string[]) => {
    // Check explicit value first
    if (value) {
        const trimmed = value.trim();
        if (trimmed) {
            if (/^\d+$/.test(trimmed)) return `${trimmed}+`;
            if (/^\d+\+$/.test(trimmed)) return trimmed;
            return trimmed;
        }
    }
    // Fallback: check genres/tags for age rating patterns like "16+", "18+"
    const allTags = [...(genres || []), ...(tags || [])];
    const ageTag = allTags.find(t => /^\d+\+$/.test(t.trim()));
    if (ageTag) return ageTag.trim();
    return 'Для всех';
};

const DetailPage: React.FC<DetailPageProps> = ({ manga }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [isReportModalOpen, setReportModalOpen] = useState(false);
    const [characters, setCharacters] = useState<CharacterInfo[]>([]);
    const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
    const [isStatsExpanded, setStatsExpanded] = useState(false);
    const [isRatingModalOpen, setRatingModalOpen] = useState(false);
    const [isMenuOpen, setMenuOpen] = useState(false);
    const [isBookmarkMenuOpen, setBookmarkMenuOpen] = useState(false);
    const [showAllGenres, setShowAllGenres] = useState(false);
    const [ratingDraft, setRatingDraft] = useState(10);
    const navigate = useNavigate();

    const { user, subscribeToManga, unsubscribeFromManga } = useContext(AuthContext);
    const { mangaList, rateManga, fetchMangaChapters } = useContext(MangaContext);
    const { history } = useHistory();
    const { showToaster } = useContext(ToasterContext);
    const { addReport } = useReports();
    const { getLastReadChapter, isChapterRead } = useReadingProgress(manga.id);
    const { getBookmarkStatus, updateBookmarkStatus, removeBookmark } = useBookmarks();

    const bookmarkStatus = getBookmarkStatus(manga.id);
    const statuses: BookmarkStatus[] = ['Читаю', 'Буду читать', 'Прочитано', 'Отложено', 'Брошено', 'Не интересно'];

    // Подгружаем главы если их нет
    useEffect(() => {
        if (manga.chapters.length === 0) {
            fetchMangaChapters(manga.id);
        }
    }, [manga.id, manga.chapters.length, fetchMangaChapters]);



    useEffect(() => {
        const headers: Record<string, string> = {};
        const token = localStorage.getItem('backend_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch(`${API_BASE}/manga/${manga.id}/view`, {
            method: 'POST',
            headers,
        }).catch(() => {});
    }, [manga.id]);

    useEffect(() => {
        const fetchCharacters = async () => {
            if (isGeminiAvailable()) {
                const cacheKey = `gemini-chars-${manga.id}`;
                try {
                    const cachedData = sessionStorage.getItem(cacheKey);
                    if (cachedData) {
                        setCharacters(JSON.parse(cachedData));
                        return;
                    }
                } catch (e) {
                    console.warn("Corrupted characters cache, fetching again.", e);
                    sessionStorage.removeItem(cacheKey);
                }
                
                setIsLoadingCharacters(true);
                const chars = await generateCharacterInfo(manga);
                if (chars.length > 0) {
                    setCharacters(chars);
                    sessionStorage.setItem(cacheKey, JSON.stringify(chars));
                }
                setIsLoadingCharacters(false);
            }
        };

        if (activeTab === 'characters' && characters.length === 0) {
            fetchCharacters();
        }
    }, [activeTab, manga, characters.length]);

    
    const handleReport = () => {
        if (!user) {
            showToaster("Пожалуйста, войдите, чтобы отправить жалобу.");
            return;
        }
        addReport({ mangaId: manga.id, mangaTitle: manga.title });
        setReportModalOpen(false);
        showToaster("Жалоба отправлена. Спасибо!");
    }
    
    const handleRating = (rating: number) => {
        if (!user) {
            showToaster("Пожалуйста, войдите, чтобы оценить.");
            return;
        }
        rateManga(manga.id, user.email, rating);
        showToaster(`Вы оценили "${manga.title}" на ${rating} звезд!`);
    }

    const { lastReadChapterId, readChapterIds, continueChapterId, continueButtonText, continueAction, continueSubtitle, continueStartPage } = useMemo(() => {
        const mangaHistory = history.filter(h => h.mangaId === manga.id);
        const readChapterIds = new Set(mangaHistory.map(h => h.chapterId));
        const lastReadItem = mangaHistory.sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())[0];
        const sortedChaptersAsc = [...manga.chapters].sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));
        
        const lastReadProgress = getLastReadChapter();
        let continueChapterId = sortedChaptersAsc[0]?.id || '';
        let continueButtonText = 'Начать чтение';
        let continueAction = 'Читать';
        let continueSubtitle = sortedChaptersAsc[0] ? getChapterLabel(sortedChaptersAsc[0]) : '';
        let continueStartPage = 1;

        if (lastReadProgress) {
            const lastReadChapter = sortedChaptersAsc.find(c => c.id === lastReadProgress.chapterId);
            if (lastReadChapter) {
                const lastReadIndex = sortedChaptersAsc.findIndex(c => c.id === lastReadProgress.chapterId);

                if (lastReadProgress.isComplete && lastReadIndex < sortedChaptersAsc.length - 1) {
                    const nextCh = sortedChaptersAsc[lastReadIndex + 1];
                    continueChapterId = nextCh.id;
                    continueStartPage = 1;
                    continueButtonText = `Продолжить: ${getChapterLabel(nextCh)} Страница 1`;
                    continueAction = 'Продолжить';
                    continueSubtitle = getChapterLabel(nextCh);
                } else if (!lastReadProgress.isComplete) {
                    continueChapterId = lastReadProgress.chapterId;
                    continueStartPage = lastReadProgress.currentPage;
                    continueButtonText = `Продолжить: ${getChapterLabel(lastReadChapter)} Страница ${lastReadProgress.currentPage}`;
                    continueAction = 'Продолжить';
                    continueSubtitle = `${getChapterLabel(lastReadChapter)} (Стр. ${lastReadProgress.currentPage})`;
                } else {
                    continueChapterId = lastReadProgress.chapterId;
                    continueButtonText = `Продолжить: ${getChapterLabel(lastReadChapter)}`;
                    continueAction = 'Продолжить';
                    continueSubtitle = getChapterLabel(lastReadChapter);
                }
            }
        } else if (lastReadItem) {
            const lastReadIndex = sortedChaptersAsc.findIndex(c => c.id === lastReadItem.chapterId);
            if (lastReadIndex > -1 && lastReadIndex < sortedChaptersAsc.length - 1) {
                const nextCh = sortedChaptersAsc[lastReadIndex + 1];
                continueChapterId = nextCh.id;
                continueStartPage = 1;
                continueButtonText = `Продолжить: ${getChapterLabel(nextCh)} Страница 1`;
                continueAction = 'Продолжить';
                continueSubtitle = getChapterLabel(nextCh);
            } else {
                continueChapterId = lastReadItem.chapterId;
                const currentChapter = sortedChaptersAsc.find(c => c.id === lastReadItem.chapterId);
                continueButtonText = currentChapter ? `Продолжить: ${getChapterLabel(currentChapter)}` : 'Продолжить';
                continueAction = 'Продолжить';
                continueSubtitle = currentChapter ? getChapterLabel(currentChapter) : '';
            }
        }

        return {
            lastReadChapterId: lastReadItem?.chapterId || lastReadProgress?.chapterId,
            readChapterIds,
            continueChapterId,
            continueButtonText,
            continueAction,
            continueSubtitle,
            continueStartPage,
        };
    }, [history, manga.id, manga.chapters, getLastReadChapter]);

    const similarManga = useMemo(() => {
        if (!mangaList || mangaList.length === 0) return [];
        return mangaList
            .filter(m => m.id !== manga.id)
            .map(m => {
                const commonGenres = m.genres.filter(g => manga.genres.includes(g));
                return { manga: m, score: commonGenres.length };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(item => item.manga);
    }, [manga, mangaList]);
    
    const userRating = user ? manga.userRatings[user.email] : undefined;
    const sortedChapters = useMemo(() => [...manga.chapters].sort((a, b) => parseFloat(b.chapterNumber) - parseFloat(a.chapterNumber)), [manga.chapters]);

    const totalChapterLikes = useMemo(() => manga.chapters.reduce((sum, chapter) => sum + (chapter.likes || 0), 0), [manga.chapters]);

    const { ratingDistribution, totalVotes } = useMemo(() => {
        const dist = Array(10).fill(0);
        // Приоритет: данные с бэкенда (ratingInfo), потом локальные (userRatings)
        if (manga.ratingInfo?.distribution) {
            Object.entries(manga.ratingInfo.distribution).forEach(([score, count]) => {
                const idx = 10 - Number(score);
                if (idx >= 0 && idx < 10) dist[idx] = count;
            });
            return { ratingDistribution: dist, totalVotes: manga.ratingInfo.total };
        }
        const ratings = Object.values(manga.userRatings);
        ratings.forEach(r => {
            if (r >= 1 && r <= 10) {
                dist[10 - r]++;
            }
        });
        return { ratingDistribution: dist, totalVotes: ratings.length };
    }, [manga.userRatings, manga.ratingInfo]);

    const isSubscribed = user?.subscribedMangaIds?.includes(manga.id) ?? false;

    useEffect(() => {
        if (isRatingModalOpen) {
            setRatingDraft(userRating ?? 10);
        }
    }, [isRatingModalOpen, userRating]);

    // Статистика закладок: приоритет бэкенд (bookmarkCounts), потом локальные (userStatuses)
    const statusStats = useMemo(() => {
        const stats: Record<string, number> = {
            'Читаю': 0,
            'Буду читать': 0,
            'Прочитано': 0,
            'Отложено': 0,
            'Не интересно': 0,
            'Брошено': 0,
        };

        if (manga.bookmarkCounts && Object.keys(manga.bookmarkCounts).length > 0) {
            Object.entries(manga.bookmarkCounts).forEach(([status, count]) => {
                if (stats[status] !== undefined) stats[status] = count;
            });
        } else if (manga.userStatuses) {
            Object.values(manga.userStatuses).forEach(status => {
                if (stats[status] !== undefined) stats[status]++;
            });
        }
        return stats;
    }, [manga.userStatuses, manga.bookmarkCounts]);

    return (
        <div className="min-h-screen pb-20 bg-base text-text-primary">
             {/* Hero Background */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-[500px] overflow-hidden">
                <img src={manga.cover} alt={manga.title} className="w-full h-full object-cover blur-3xl opacity-30" />
                <div className="absolute inset-0 bg-gradient-to-b from-base-90 via-base-80 to-base" />
             </div>

             <div className="w-full px-4 relative z-10 pt-24 md:pt-32">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Sidebar (Cover & Actions) */}
                    <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-4">
                        <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-text-primary-10 aspect-[2/3] max-h-[50vh] md:max-h-none mx-auto w-auto relative group bg-surface">
                             <img src={manga.cover} alt={manga.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        </div>
                        
                        <button 
                            onClick={() => navigate(`/manga/${manga.id}/chapter/${encodeURIComponent(continueChapterId)}`, { state: { startPage: continueStartPage } })}
                            className="w-full py-3.5 bg-brand hover:bg-brand-hover text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-20 active:scale-95 flex items-center justify-center gap-2 hidden md:flex"
                        >
                            <span>{continueButtonText}</span>
                        </button>
                        
                        <div className="grid grid-cols-2 gap-3 hidden md:grid">
                             <BookmarkButton mangaId={manga.id} />
                             <SubscribeButton mangaId={manga.id} />
                        </div>

                        {/* Admin/User Links */}
                         <div className="flex flex-col gap-2 mt-2 hidden md:flex">
                            {user?.role === 'admin' && (
                                <Link to={`/manga/${manga.id}/edit`} className="text-center text-xs font-medium text-muted hover:text-brand py-1 transition-colors">
                                    Редактировать
                                </Link>
                            )}
                            <button onClick={() => setReportModalOpen(true)} className="text-center text-xs font-medium text-muted hover:text-brand-accent py-1 transition-colors flex items-center justify-center gap-1">
                                <ReportIcon className="w-3 h-3" />
                                Пожаловаться
                            </button>
                        </div>
                    </div>

                    {/* Center Content (Info & Tabs) */}
                    <div className="lg:col-span-7 xl:col-span-7 flex flex-col gap-6">
                        {/* Header Info */}
                        <div>
                            <div className="text-xs font-mono font-bold text-brand-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span>{typeDisplayNames[manga.type]}</span>
                                <span className="w-1 h-1 rounded-full bg-text-primary-20"></span>
                                <span>{manga.year || 'Неизвестно'}</span>
                            </div>
                            {/* Title + Rating */}
                            <div className="relative pr-20 md:pr-28">
                                <h1 className="text-3xl md:text-5xl font-display font-bold leading-tight text-text-primary drop-shadow-lg">{manga.title}</h1>
                                
                                {/* Rating Block - absolute so it doesn't affect height */}
                                <div className="absolute top-0 right-0 flex flex-col items-center">
                                    <div className="text-3xl md:text-4xl font-bold text-brand-accent leading-none">{manga.rating.toFixed(1)}</div>
                                    <div className="text-[10px] text-muted mt-0.5">{totalVotes} голосов</div>
                                    <button
                                        onClick={() => setRatingModalOpen(true)}
                                        className="bg-brand-accent text-black text-[10px] md:text-xs font-mono font-bold px-2 md:px-3 py-0.5 md:py-1 mt-1 hover:shadow-[0_0_12px_rgba(169,255,0,0.3)] transition-all"
                                    >
                                        Оценить
                                    </button>
                                </div>
                            </div>
                            
                            {/* Stats Row */}
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-text-secondary font-medium mb-4 mt-2">
                                <div className="flex items-center gap-1.5 hover:text-brand-accent transition-colors cursor-default" title="Всего лайков">
                                    <HeartIcon className="w-4 h-4" />
                                    <span>{totalChapterLikes}</span>
                                </div>
                                <div className="flex items-center gap-1.5 hover:text-brand transition-colors cursor-default" title="Просмотры">
                                    <EyeIcon className="w-4 h-4" />
                                    <span>{manga.views}</span>
                                </div>
                                <div className="flex items-center gap-1.5 hover:text-brand-accent transition-colors cursor-default" title="Закладок">
                                    <BookmarkIcon className="w-4 h-4" />
                                    <span>{Object.values(statusStats).reduce((a, b) => a + b, 0)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex items-center gap-0 p-0 bg-surface border border-overlay overflow-x-auto scrollbar-hide">
                             <TabButton name="overview" activeTab={activeTab} setActiveTab={setActiveTab}>Главная</TabButton>
                             <TabButton name="chapters" activeTab={activeTab} setActiveTab={setActiveTab}>Главы <span className="ml-1.5 opacity-60 text-xs">({manga.chapters.length})</span></TabButton>
                             {isGeminiAvailable() && <TabButton name="characters" activeTab={activeTab} setActiveTab={setActiveTab}>Персонажи</TabButton>}
                             <TabButton name="discussion" activeTab={activeTab} setActiveTab={setActiveTab}>Обсуждение</TabButton>
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[400px]">
                            <AnimatePresence mode="wait">
                                {activeTab === 'overview' && (
                                    <motion.div 
                                        key="overview"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-8"
                                    >
                                        {/* Description */}
                                        <div className="prose max-w-none">
                                            <p className="text-text-secondary leading-relaxed text-base whitespace-pre-line">{manga.description}</p>
                                        </div>



                                        {/* Genres */}
                                        <div className="flex flex-wrap gap-2">
                                            {(showAllGenres ? manga.genres : manga.genres.slice(0, 11)).map(genre => (
                                                <Link 
                                                    key={genre} 
                                                    to={`/genre/${genre}`} 
                                                    className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-text-primary-10 rounded-lg text-xs font-bold text-text-secondary hover:text-brand transition-all"
                                                >
                                                    #{genre}
                                                </Link>
                                            ))}
                                            {manga.genres.length > 11 && !showAllGenres && (
                                                <button
                                                    onClick={() => setShowAllGenres(true)}
                                                    className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-text-primary-10 rounded-lg text-xs font-bold text-brand hover:text-brand-hover transition-all"
                                                >
                                                    +{manga.genres.length - 11}
                                                </button>
                                            )}
                                        </div>

                                        {/* Info & Statistics */}
                                        <div className="space-y-8">
                                            {/* Info List */}
                                            <div className="space-y-4 bg-surface-30 rounded-xl p-6 border border-text-primary-5">
                                                <div className="flex flex-col sm:grid sm:grid-cols-[10rem,1fr] gap-y-0.5 sm:gap-y-0 gap-x-3 sm:items-start">
                                                    <span className="text-muted text-sm">Паблишеры</span>
                                                    <div className="flex items-center gap-2 min-w-0">

                                                        <span className="font-medium">Admin</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col sm:grid sm:grid-cols-[10rem,1fr] gap-y-0.5 sm:gap-y-0 gap-x-3 sm:items-start">
                                                    <span className="text-muted text-sm">Выпуск</span>
                                                    <span className="font-medium flex items-center gap-1 min-w-0">
                                                        {manga.year || 'Неизвестно'}
                                                        <ArrowUpRightIcon className="w-3 h-3 text-muted" />
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:grid sm:grid-cols-[10rem,1fr] gap-y-0.5 sm:gap-y-0 gap-x-3 sm:items-start">
                                                    <span className="text-muted text-sm">Статус перевода</span>
                                                    <span className="font-medium flex items-center gap-1 min-w-0">
                                                        {manga.status}
                                                        <ArrowUpRightIcon className="w-3 h-3 text-muted" />
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:grid sm:grid-cols-[10rem,1fr] gap-y-0.5 sm:gap-y-0 gap-x-3 sm:items-start">
                                                    <span className="text-muted text-sm">Возрастное ограничение</span>
                                                    <span className="font-medium flex items-center gap-1 min-w-0">
                                                        {formatAgeRating(manga.ageRating, manga.genres, manga.tags)}
                                                        <ArrowUpRightIcon className="w-3 h-3 text-muted" />
                                                    </span>
                                                </div>
                                                <div className="flex flex-col sm:grid sm:grid-cols-[10rem,1fr] gap-y-0.5 sm:gap-y-0 gap-x-3 sm:items-start">
                                                    <span className="text-muted text-sm">Альтернативные названия</span>
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        {manga.alternativeNames && manga.alternativeNames.length > 0 ? (
                                                            manga.alternativeNames.map((name, idx) => (
                                                                <div key={idx} className="flex items-start gap-1.5 min-w-0">
                                                                    <span className="font-medium break-words min-w-0">{name}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(name);
                                                                            showToaster('Успешно скопировано');
                                                                        }}
                                                                        className="w-4 h-4 mt-0.5 flex items-center justify-center text-muted hover:text-text-primary transition-colors shrink-0"
                                                                        title="Скопировать"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                                            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                                                            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <span className="text-subtle text-xs">Нет альтернативных названий</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Statistics */}
                                            <div>
                                                <h3 className="text-xl font-bold mb-1">Статистика</h3>
                                                <div className="flex items-center gap-2 mb-6">
                                                    <span className="text-muted text-sm">Рейтинг за последнее время:</span>
                                                    <span className="font-bold text-text-primary">{manga.rating.toFixed(2)}</span>
                                                    <StarIcon className="w-4 h-4 text-brand-accent" />
                                                </div>

                                                {/* Preview: first 3 rating bars (10, 9, 8) — always visible */}
                                                <div className="space-y-2">
                                                    {[10, 9, 8].map((score) => {
                                                        const count = ratingDistribution[10 - score] || 0;
                                                        const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                                                        return (
                                                            <div key={score} className="flex items-center gap-3 text-sm">
                                                                <span className="w-4 text-right font-mono text-muted">{score}</span>
                                                                <StarIcon className="w-3 h-3 text-brand-accent" />
                                                                <div className="flex-1 h-2 bg-text-primary-5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-brand-accent rounded-full" style={{ width: `${percent}%` }} />
                                                                </div>
                                                                <span className="w-8 text-right text-muted text-xs">{count}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Expandable: remaining rating bars + status bars */}
                                                <AnimatePresence initial={false}>
                                                {isStatsExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-2">
                                                            {/* Remaining Rating Bars (7 down to 1) */}
                                                            <div className="space-y-2">
                                                            {[7, 6, 5, 4, 3, 2, 1].map((score) => {
                                                                    const count = ratingDistribution[10 - score] || 0;
                                                                    const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                                                                    return (
                                                                        <div key={score} className="flex items-center gap-3 text-sm">
                                                                            <span className="w-4 text-right font-mono text-muted">{score}</span>
                                                                            <StarIcon className="w-3 h-3 text-brand-accent" />
                                                                            <div className="flex-1 h-2 bg-text-primary-5 rounded-full overflow-hidden">
                                                                                <div className="h-full bg-brand-accent rounded-full" style={{ width: `${percent}%` }} />
                                                                            </div>
                                                                            <span className="w-8 text-right text-muted text-xs">{count}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Status Bars */}
                                                            <div className="space-y-3">
                                                                {[
                                                                    { label: 'Читаю', key: 'Читаю', color: 'bg-brand' },
                                                                    { label: 'Буду читать', key: 'Буду читать', color: 'bg-brand-hover' },
                                                                    { label: 'Прочитано', key: 'Прочитано', color: 'bg-brand-50' },
                                                                    { label: 'Отложено', key: 'Отложено', color: 'bg-brand-50' },
                                                                    { label: 'Не интересно', key: 'Не интересно', color: 'bg-brand-50' },
                                                                    { label: 'Брошено', key: 'Брошено', color: 'bg-brand-50' },
                                                                ].map((status) => {
                                                                    const count = statusStats[status.key] || 0;
                                                                    const totalStatuses = Object.values(statusStats).reduce((a, b) => a + b, 0);
                                                                    const percent = totalStatuses > 0 ? (count / totalStatuses) * 100 : 0;

                                                                    return (
                                                                        <div key={status.label} className="flex items-center gap-3 text-sm">
                                                                            <span className="w-28 text-muted">{status.label}</span>
                                                                            <div className="flex-1 h-2 bg-text-primary-5 rounded-full overflow-hidden">
                                                                                <div className={`h-full ${status.color} rounded-full`} style={{ width: `${percent}%` }} />
                                                                            </div>
                                                                            <span className="w-8 text-right text-muted text-xs">{count}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                                </AnimatePresence>
                                                
                                                <button 
                                                    onClick={() => setStatsExpanded(!isStatsExpanded)}
                                                    className="w-full mt-6 py-2 border border-text-primary-10 rounded-lg text-sm font-bold hover:bg-text-primary-5 transition-colors"
                                                >
                                                    {isStatsExpanded ? 'Скрыть' : 'Показать статистику'}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'chapters' && (
                                    <motion.div 
                                        key="chapters"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-2"
                                    >
                                         {sortedChapters.length > 0 ? sortedChapters.map(chapter => {
                                                const isRead = isChapterRead(chapter.id) || readChapterIds.has(chapter.id);
                                                const isLastRead = lastReadChapterId === chapter.id;
                                                
                                                return (
                                                    <Link 
                                                        key={chapter.id} 
                                                        to={`/manga/${manga.id}/chapter/${encodeURIComponent(chapter.id)}`}
                                                        className={`group w-full flex items-center justify-between p-3.5 rounded-xl transition-all border ${
                                                            isLastRead 
                                                            ? 'bg-brand-10 border-brand-30' 
                                                            : 'bg-surface-30 border-transparent hover:bg-surface hover:border-text-primary-5'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isRead ? 'bg-brand' : 'bg-brand'}`} />
                                                            <span className={`font-bold ${isRead ? 'text-muted' : 'text-text-secondary group-hover:text-brand transition-colors'}`}>
                                                                {formatChapterName(chapter)}
                                                            </span>
                                                            {isLastRead && <span className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded font-bold">Продолжить</span>}
                                                        </div>
                                                        <div className="flex items-center gap-4 text-xs text-muted font-mono">
                                                            <span className="flex items-center gap-1" title="Просмотры">
                                                                <EyeIcon className="w-3 h-3" />
                                                                {chapter.views || 0}
                                                            </span>
                                                            <span className="flex items-center gap-1" title="Лайки главы">
                                                                <HeartIcon className="w-3 h-3" />
                                                                {chapter.likes || 0}
                                                            </span>
                                                            <span>{formatChapterDate(chapter.date)}</span>
                                                        </div>
                                                    </Link>
                                                );
                                            }) : <div className="text-center py-8 text-muted text-sm">Главы еще не добавлены.</div>}
                                    </motion.div>
                                )}
                                
                                {activeTab === 'characters' && isGeminiAvailable() && (
                                     <motion.div 
                                        key="characters"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                     >
                                        {isLoadingCharacters ? (
                                            <div className="space-y-4 animate-pulse">
                                                {[1,2].map(i => <div key={i} className="h-20 bg-surface rounded-xl"></div>)}
                                            </div>
                                        ) : (
                                            <div className="grid gap-4">
                                                {characters.map((char, idx) => (
                                                    <div key={idx} className="flex gap-4 p-4 bg-surface-50 rounded-xl border border-text-primary-5">
                                                        <div className="w-12 h-12 rounded-full bg-brand-20 flex items-center justify-center font-bold text-brand shrink-0">
                                                            {char.name[0]}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-sm">{char.name}</h4>
                                                            <p className="text-xs text-muted mt-1 leading-relaxed">{char.description}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                     </motion.div>
                                )}

                                {activeTab === 'discussion' && (
                                     <motion.div 
                                        key="discussion"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                     >
                                         <CommentSection mangaId={manga.id} initialComments={[]} />
                                     </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Right Sidebar (Similar) */}
                    <div className="lg:col-span-2 xl:col-span-2 flex flex-col gap-6">
                         <div className="flex items-center justify-between">
                            <h3 className="font-bold text-lg text-text-primary">Похожее</h3>
                            {/* Dummy Add button from reference */}
                            <button 
                                onClick={() => showToaster('Функция добавления похожей манги пока в разработке')}
                                className="text-xs font-bold text-brand hover:text-brand-hover transition-colors"
                            >
                                Добавить
                            </button>
                        </div>
                        
                        <div className="flex flex-col gap-3">
                            {similarManga.map(m => (
                                <Link key={m.id} to={`/manga/${m.id}`} className="flex gap-3 group p-2 rounded-xl hover:bg-surface-50 transition-colors text-text-primary">
                                    <div className="w-16 h-24 rounded-lg overflow-hidden shrink-0 relative">
                                        <img src={m.cover} className="w-full h-full object-cover" />
                                        <div className="absolute top-1 left-1 bg-black/60 backdrop-blur text-[10px] font-bold px-1.5 rounded text-white">
                                            {m.rating.toFixed(1)}
                                        </div>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <h4 className="text-sm font-bold text-text-secondary group-hover:text-brand transition-colors line-clamp-2 leading-snug mb-1">{m.title}</h4>
                                        <div className="text-xs text-muted">{typeDisplayNames[m.type]} • {m.year || 'Неизвестно'}</div>
                                        <div className="text-xs text-muted mt-1">{m.views} просмотров</div>
                                    </div>
                                </Link>
                            ))}
                            {similarManga.length === 0 && <div className="text-xs text-muted">Нет похожей манги</div>}
                        </div>
                    </div>
                </div>
             </div>
            
            <Modal
                isOpen={isReportModalOpen}
                onClose={() => setReportModalOpen(false)}
                title="Пожаловаться на контент"
                onConfirm={handleReport}
                confirmText="Отправить жалобу"
            >
                <p className="text-text-secondary">Вы уверены, что хотите пожаловаться на "{manga.title}"? Это действие уведомит модераторов о возможном нарушении.</p>
            </Modal>

            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isRatingModalOpen && (
                        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm" onClick={() => setRatingModalOpen(false)}>
                            <motion.div 
                                initial={{ opacity: 0, y: 100 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 100 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-surface border-t md:border border-overlay rounded-t-none md:rounded-2xl p-6 w-full md:max-w-sm relative shadow-2xl text-white"
                            >
                                <div className="flex justify-between items-start mb-8">
                                    <h3 className="text-xl font-bold text-center w-full leading-snug">Понравился тайтл? <br/> Поставь оценку!</h3>
                                    <button onClick={() => setRatingModalOpen(false)} className="absolute right-6 top-6 p-1 text-muted hover:text-white transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                
                                <div className="flex items-center justify-center gap-8 mb-8">
                                    <button 
                                        onClick={() => {
                                            const newRating = Math.max(1, ratingDraft - 1);
                                            setRatingDraft(newRating);
                                        }}
                                        className="w-12 h-12 rounded-full bg-surface-hover hover:bg-overlay text-white font-bold text-2xl transition-all active:scale-95 flex items-center justify-center"
                                    >
                                        -
                                    </button>
                                    <div className="text-6xl font-black text-white w-24 text-center tracking-tighter">{ratingDraft}</div>
                                    <button 
                                        onClick={() => {
                                            const newRating = Math.min(10, ratingDraft + 1);
                                            setRatingDraft(newRating);
                                        }}
                                        className="w-12 h-12 rounded-full bg-surface-hover hover:bg-overlay text-white font-bold text-2xl transition-all active:scale-95 flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                                
                                <button
                                    onClick={() => {
                                        handleRating(ratingDraft);
                                        setRatingModalOpen(false);
                                    }}
                                    className="w-full py-4 bg-brand-accent hover:bg-brand text-white rounded-xl font-bold text-lg transition-all active:scale-95 shadow-lg shadow-brand-accent-20"
                                >
                                    Поставить оценку
                                </button>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {typeof document !== 'undefined' && createPortal(
                <div className="md:hidden fixed bottom-20 left-4 right-4 z-[60]">
                    <div className="bg-surface/95 backdrop-blur-xl border border-overlay  shadow-2xl p-2 flex items-center justify-between gap-3">
                        <div className="relative">
                            <button 
                                onClick={() => setMenuOpen(!isMenuOpen)}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-hover-30 text-white active:bg-white/10 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                </svg>
                            </button>
                            <AnimatePresence>
                                {isMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                        className="absolute bottom-full left-0 mb-2 w-48 bg-surface-hover border border-overlay rounded-xl shadow-xl overflow-hidden"
                                    >
                                    <button
                                        onClick={() => {
                                            if (!user) {
                                                showToaster('Пожалуйста, войдите, чтобы управлять подписками');
                                                navigate('/login');
                                                return;
                                            }
                                            if (isSubscribed) {
                                                unsubscribeFromManga(manga.id);
                                                showToaster('Вы отписались от обновлений');
                                            } else {
                                                subscribeToManga(manga.id);
                                                showToaster('Вы подписались на обновления!');
                                            }
                                            setMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${isSubscribed ? 'text-brand-accent' : 'text-text-secondary'} hover:bg-surface-hover`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                        </svg>
                                        {isSubscribed ? 'Отписаться' : 'Подписаться'}
                                    </button>
                                    <div className="h-px bg-white/10"></div>
                                    {user?.role === 'admin' && (
                                            <Link to={`/manga/${manga.id}/edit`} className="flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-surface-hover transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                                Редактировать
                                            </Link>
                                        )}
                                        <button onClick={() => { setReportModalOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-accent hover:bg-surface-hover transition-colors text-left">
                                            <ReportIcon className="w-4 h-4" />
                                            Пожаловаться
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <button 
                            onClick={() => navigate(`/manga/${manga.id}/chapter/${encodeURIComponent(continueChapterId)}`, { state: { startPage: continueStartPage } })}
                            className="flex-1 h-12 bg-brand-accent hover:bg-brand rounded-full flex flex-col items-center justify-center text-black shadow-lg active:scale-95 transition-all"
                        >
                            <span className="text-sm font-bold leading-tight">{continueAction}</span>
                            {continueSubtitle && <span className="text-[10px] opacity-80 leading-tight truncate max-w-[120px]">{continueSubtitle}</span>}
                        </button>

                        <div className="relative">
                            <button 
                                onClick={() => setBookmarkMenuOpen(!isBookmarkMenuOpen)}
                                className={`w-12 h-12 flex items-center justify-center rounded-full ${bookmarkStatus ? 'bg-brand-accent text-white' : 'bg-surface-hover-30 text-white'} active:scale-95 transition-all`}
                            >
                                <BookmarkIcon className="w-5 h-5" />
                            </button>
                            <AnimatePresence>
                                {isBookmarkMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                        className="absolute bottom-full right-0 mb-2 w-48 bg-surface-hover border border-overlay rounded-xl shadow-xl overflow-hidden py-1"
                                    >
                                        {statuses.map(status => (
                                            <button
                                                key={status}
                                                onClick={() => { updateBookmarkStatus(manga.id, status); setBookmarkMenuOpen(false); showToaster(`Статус: ${status}`); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${bookmarkStatus === status ? 'text-brand-accent font-bold' : 'text-text-secondary'}`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                        {bookmarkStatus && (
                                            <>
                                                <div className="h-px bg-white/10 my-1"></div>
                                                <button
                                                    onClick={() => { removeBookmark(manga.id); setBookmarkMenuOpen(false); showToaster('Закладка удалена'); }}
                                                    className="w-full text-left px-4 py-2.5 text-sm text-brand-accent hover:bg-surface-hover transition-colors"
                                                >
                                                    Удалить закладку
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const TabButton: React.FC<{ name: string; activeTab: string; setActiveTab: (name: string) => void; children: React.ReactNode }> = ({ name, activeTab, setActiveTab, children }) => (
    <button
        onClick={() => setActiveTab(name)}
        className={`relative py-2.5 px-5 text-sm font-mono font-bold transition-all whitespace-nowrap z-10 border-b-2 ${
            activeTab === name
                ? 'text-brand-accent border-brand-accent bg-brand-accent-5'
                : 'text-muted hover:text-text-primary border-transparent'
        }`}
    >
        {children}
    </button>
);

const EyeIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const BookmarkIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
);

const ArrowUpRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
);

export default DetailPage;
