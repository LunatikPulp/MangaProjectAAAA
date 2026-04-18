import React, { useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '../contexts/AuthContext';
import { useBookmarks } from '../hooks/useBookmarks';
import { useHistory } from '../hooks/useHistory';
import { MangaContext } from '../contexts/MangaContext';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import FramedAvatar from '../components/FramedAvatar';
import { ToasterContext } from '../contexts/ToasterContext';
import RankBadge from '../components/RankBadge';
import ProfilePageSkeleton from '../components/skeletons/ProfilePageSkeleton';
import { BookmarkStatus } from '../types';
import { API_BASE } from '../services/externalApiService';
import { motion, AnimatePresence } from 'framer-motion';
import { getFrameImage } from '../config/avatarFrames';
import ShopModal from '../components/ShopModal';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

/** Crop helper — returns a Blob from the cropped pixel area */
function getCroppedBlob(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = pixelCrop.width * scaleX;
    canvas.height = pixelCrop.height * scaleY;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
        image,
        pixelCrop.x * scaleX, pixelCrop.y * scaleY,
        pixelCrop.width * scaleX, pixelCrop.height * scaleY,
        0, 0, canvas.width, canvas.height,
    );
    return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.92));
}

type EditTab = 'profile' | 'security' | 'notifications' | 'content' | 'appearance';

/* ═══════════════════════════════════════════════════════════════
   ACHIEVEMENT REGISTRY
   ═══════════════════════════════════════════════════════════════ */
interface Achievement {
    icon: string;
    title: string;
    description: string;
    flavorText: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    secret?: boolean;
}

const ACHIEVEMENTS: Record<string, Achievement> = {
    first_login:  {
        icon: '/Achievement Icons/first_login.png',
        title: 'Первый вход',
        description: 'Добро пожаловать в SPRINGMANGA',
        flavorText: 'Первый шаг в мир, где страницы оживают. Добро пожаловать, читатель.',
        rarity: 'common'
    },
    reader_10:    {
        icon: '/Achievement Icons/reader_10.png',
        title: 'Читатель',
        description: 'Прочитано 10 глав',
        flavorText: 'Путешествие начинается с первых страниц. Ты только начал свой путь.',
        rarity: 'common'
    },
    reader_50:    {
        icon: '/Achievement Icons/reader_50.png',
        title: 'Книжный червь',
        description: 'Прочитано 50 глав',
        flavorText: 'Страницы шелестят под твоими пальцами. История поглощает тебя всё глубже.',
        rarity: 'rare'
    },
    reader_100:   {
        icon: '/Achievement Icons/reader_100.png',
        title: 'Мастер чтения',
        description: 'Прочитано 100 глав',
        flavorText: 'Сотни историй прошли через твой разум. Ты стал частью этих миров.',
        rarity: 'epic'
    },
    reader_500:   {
        icon: '/Achievement Icons/reader_500.png',
        title: 'Легенда',
        description: 'Прочитано 500 глав',
        flavorText: 'Твоё имя эхом разносится по библиотекам вечности. Ты — живая легенда.',
        rarity: 'legendary'
    },
    bookworm:     {
        icon: '/Achievement Icons/bookworm.png',
        title: 'Коллекционер',
        description: '10 манг в закладках',
        flavorText: 'Твоя коллекция растёт. Каждая история — драгоценный артефакт.',
        rarity: 'rare'
    },
    collector:    {
        icon: '/Achievement Icons/collector.png',
        title: 'Собиратель',
        description: '50 манг в закладках',
        flavorText: 'Твоя библиотека превратилась в лабиринт миров и судеб.',
        rarity: 'epic'
    },
    critic:       {
        icon: '/Achievement Icons/critic.png',
        title: 'Критик',
        description: 'Оценено 5 манг',
        flavorText: 'Твоё мнение имеет вес. Ты начинаешь видеть то, что скрыто от других.',
        rarity: 'rare'
    },
    judge:        {
        icon: '/Achievement Icons/judge.png',
        title: 'Верховный судья',
        description: 'Оценено 20 манг',
        flavorText: 'Твой вердикт безапелляционен. Ты видишь суть каждой истории.',
        rarity: 'epic'
    },
    social:       {
        icon: '/Achievement Icons/social.png',
        title: 'Социальный',
        description: 'Заполнил биографию',
        flavorText: 'Ты открыл миру частичку себя. Теперь другие знают, кто ты.',
        rarity: 'common'
    },
    stylist:      {
        icon: '/Achievement Icons/stylist.png',
        title: 'Стилист',
        description: 'Изменил тему профиля',
        flavorText: 'Реальность подчиняется твоей воле. Ты создаёшь свой мир.',
        rarity: 'epic'
    },
    decorator:    {
        icon: '/Achievement Icons/decorator.png',
        title: 'Декоратор',
        description: 'Загрузил баннер профиля',
        flavorText: 'Твоё пространство обрело лицо. Каждый, кто войдёт, увидит твою душу.',
        rarity: 'rare'
    },
    night_guard:  {
        icon: '/Achievement Icons/night_guard.png',
        title: 'Ночной охранник',
        description: 'Зашёл на сайт между 00:00 и 05:00',
        flavorText: 'В глубокой тьме ночи ты не спишь. Тени шепчут тебе истории.',
        rarity: 'legendary',
        secret: true
    },
    five_nights:  {
        icon: '/Achievement Icons/five_nights.png',
        title: 'Пять ночей',
        description: 'Читал мангу в 5 разных дней',
        flavorText: 'Пять ночей, пять миров. Ты выжил там, где другие сломались.',
        rarity: 'epic',
        secret: true
    },
    marathon:     {
        icon: '/Achievement Icons/marathon.png',
        title: 'Марафонщик',
        description: '20+ глав за один день',
        flavorText: 'Время потеряло смысл. Ты погрузился в бездну историй и не можешь остановиться.',
        rarity: 'epic',
        secret: true
    },
    early_bird:   {
        icon: '/Achievement Icons/early_bird.png',
        title: 'Ранняя пташка',
        description: 'Зашёл с 5:00 до 7:00 утра',
        flavorText: 'Рассвет застал тебя за чтением. Первые лучи солнца освещают страницы.',
        rarity: 'rare',
        secret: true
    },
    halloween:    {
        icon: '/Achievement Icons/halloween.png',
        title: 'Хэллоуинский дух',
        description: 'Зашёл 31 октября',
        flavorText: 'В ночь, когда грань между мирами тонка, ты пришёл сюда. Что ты ищешь?',
        rarity: 'legendary',
        secret: true
    },
    new_year:     {
        icon: '/Achievement Icons/new_year.png',
        title: 'Новогоднее чудо',
        description: 'Зашёл в новогоднюю ночь',
        flavorText: 'Когда мир празднует, ты выбрал истории. Новый год начинается с новой главы.',
        rarity: 'legendary',
        secret: true
    },
    konami_master: {
        icon: '/Achievement Icons/Konami_code.png',
        title: 'Konami Master',
        description: 'Ввёл легендарный код Konami',
        flavorText: '↑↑↓↓←→←→BA — древний шифр открыл тебе путь. Ты знаешь секреты старых богов.',
        rarity: 'legendary',
        secret: true
    },
    horror_discoverer: {
        icon: '/Achievement Icons/horror_mode.png',
        title: 'Кошмарный исследователь',
        description: 'Обнаружил Horror Mode',
        flavorText: 'Ты заглянул за занавеску реальности и увидел то, что не должен был видеть.',
        rarity: 'legendary',
        secret: true
    },
};

const RARITY_GLOW_CLASS: Record<string, string> = {
    common: 'badge-glow-common',
    rare: 'badge-glow-rare',
    epic: 'badge-glow-epic',
    legendary: 'badge-glow-legendary',
};

const RARITY_LABEL: Record<string, { text: string; color: string }> = {
    common: { text: 'ОБЫЧНОЕ', color: '#888' },
    rare: { text: 'РЕДКОЕ', color: '#4A9EFF' },
    epic: { text: 'ЭПИЧЕСКОЕ', color: '#A855F7' },
    legendary: { text: 'ЛЕГЕНДАРНОЕ', color: '#FFD700' },
};

/* AVATAR_FRAMES — imported from ../config/avatarFrames */

/* ═══════════════════════════════════════════════════════════════
   THEME CONFIG (CSS variables in index.css do the heavy lifting)
   ═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   HEATMAP HELPERS
   ═══════════════════════════════════════════════════════════════ */
function isVideo(url: string): boolean {
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.ogg');
}

function generateHeatmapDays(): string[] {
    const days: string[] = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function heatmapColor(count: number): string {
    if (count === 0) return 'rgba(255,255,255,0.06)';
    if (count <= 2) return 'rgba(169,255,0,0.2)';
    if (count <= 5) return 'rgba(169,255,0,0.4)';
    if (count <= 10) return 'rgba(169,255,0,0.6)';
    return 'rgba(169,255,0,0.85)';
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const ProfilePage: React.FC = () => {
    const { user, updateUser, refreshUser, loading: authLoading } = useContext(AuthContext);
    const { bookmarks } = useBookmarks();
    const { history } = useHistory();
    const { getMangaById, mangaList, fetchMangaById, loading: mangaLoading } = useContext(MangaContext);
    const { showToaster } = useContext(ToasterContext);
    const navigate = useNavigate();

    // UI state
    const [isEditOpen] = useState(false);
    const [editTab] = useState<EditTab>('profile');
    const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
    const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
    const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<{ day: string; count: number; x: number; y: number } | null>(null);

    // Profile form
    const [previewTheme, setPreviewTheme] = useState<string>('base');
    const [previewFrame] = useState('none');



    const [allShopItems, setAllShopItems] = useState<any[]>([]);

    // Shop modal
    const [shopModalOpen, setShopModalOpen] = useState(false);
    const [previewBgUrl, setPreviewBgUrl] = useState<string | null>(null);
    const [previewFrameKey, setPreviewFrameKey] = useState<string | null>(null);

    // Skin system
    const [myPurchases, setMyPurchases] = useState<string[]>([]);
    const [shopSkins, setShopSkins] = useState<any[]>([]);
    const [previewSkinKey, setPreviewSkinKey] = useState<string | null>(null);
    const [isPreviewingLocked, setIsPreviewingLocked] = useState(false);
    const [previewCssVars, setPreviewCssVars] = useState<Record<string, string>>({});
    // Mythic controls
    const [, setEditNicknameColor] = useState('');
    const [editNicknameFont, setEditNicknameFont] = useState('');

    // Avatar crop
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const cropImgRef = useRef<HTMLImageElement>(null);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (selectedBadge) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [selectedBadge]);

    // Loadings
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [bannerLoading, setBannerLoading] = useState(false);
    const [backgroundLoading, setBackgroundLoading] = useState(false);

    // Cache-buster for banner/background (forces browser to re-fetch after upload)
    const [mediaCacheBuster, setMediaCacheBuster] = useState(Date.now());

    // Rich profile data from /auth/profile-full
    const [profileData, setProfileData] = useState<any>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [badges, setBadges] = useState<string[]>([]);
    const badgesRef = useRef<string[]>([]);

    useEffect(() => { badgesRef.current = badges; }, [badges]);

    // Konami code easter egg
    const [, setKonamiProgress] = useState(0);
    const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

    // Typewriter ref (kept for potential future use)
    const typewriterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



    // Подгружаем манги из закладок, которых нет в mangaList
    useEffect(() => {
        if (mangaLoading || bookmarks.length === 0) return;
        const mangaIds = new Set(mangaList.map(m => m.id));
        const missingIds = bookmarks.map(b => b.mangaId).filter(id => !mangaIds.has(id));
        if (missingIds.length > 0) {
            missingIds.forEach(id => fetchMangaById(id));
        }
    }, [bookmarks, mangaList, mangaLoading, fetchMangaById]);

    const totalChaptersRead = history.length;

    const bookmarkStats = useMemo(() => bookmarks.reduce((acc, b) => {
        acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
    }, {} as Record<BookmarkStatus, number>), [bookmarks]);

    // Combined genre analysis — single iteration over bookmarks for both favoriteGenres and corruption
    const { favoriteGenres, corruptionData } = useMemo(() => {
        const darkGenres = ['Хоррор', 'Ужасы', 'Трагедия', 'Психология', 'Триллер', 'Драма', 'Тёмное фэнтези', 'Мистика', 'Детектив'];
        const lightGenres = ['Комедия', 'Повседневность', 'Романтика', 'Сёнэн', 'Школа', 'Спорт'];
        const genreCounts: Record<string, number> = {};
        let darkCount = 0, lightCount = 0, totalGenres = 0;

        bookmarks.forEach(b => {
            const manga = getMangaById(b.mangaId);
            if (manga) {
                manga.genres.forEach(g => {
                    genreCounts[g] = (genreCounts[g] || 0) + 1;
                    totalGenres++;
                    if (darkGenres.some(dg => g.toLowerCase().includes(dg.toLowerCase()))) darkCount++;
                    if (lightGenres.some(lg => g.toLowerCase().includes(lg.toLowerCase()))) lightCount++;
                });
            }
        });

        // Favorite genres
        const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
        const maxCount = sorted[0]?.[1] || 1;
        const favoriteGenres = sorted.slice(0, 6).map(([name, count]) => ({ name, count, pct: Math.round((count / maxCount) * 100) }));

        // Corruption
        let corruptionData: { level: number; label: string; color: string };
        if (totalGenres === 0) {
            corruptionData = { level: 0, label: 'НЕТ ДАННЫХ', color: '#666' };
        } else {
            const ratio = (darkCount - lightCount * 0.5) / Math.max(totalGenres, 1);
            const corruption = Math.max(0, Math.min(100, Math.round((ratio + 0.3) * 100)));
            if (corruption >= 75) corruptionData = { level: corruption, label: 'КРИТИЧЕСКИЙ', color: '#FF2020' };
            else if (corruption >= 50) corruptionData = { level: corruption, label: 'ПОВЫШЕННЫЙ', color: '#FF8800' };
            else if (corruption >= 25) corruptionData = { level: corruption, label: 'УМЕРЕННЫЙ', color: '#FFD700' };
            else corruptionData = { level: corruption, label: 'СИСТЕМА В НОРМЕ', color: '#00FF64' };
        }

        return { favoriteGenres, corruptionData };
    }, [bookmarks, getMangaById]);

    // Last read manga for "Continue Reading"
    const lastReadItem = useMemo(() => {
        if (history.length === 0) return null;
        const last = history[0];
        const manga = getMangaById(last.mangaId);
        if (!manga) return null;
        const chapter = manga.chapters.find(ch => ch.id === last.chapterId);
        return { manga, chapter, chapterId: last.chapterId };
    }, [history, getMangaById]);

    // Real friends from backend
    const [realFriends, setRealFriends] = useState<{ id: number; username: string; avatar_url: string; avatar_frame: string; level: number; bio: string; }[]>([]);
    useEffect(() => {
        fetch(`${API_BASE}/friends`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then(data => setRealFriends(data))
            .catch(() => {});
    }, [user?.id]);

    // Profile wall comments (backend) with replies
    const [wallComments, setWallComments] = useState<{ id: number; author_id: number; author: string; author_avatar?: string; author_avatar_frame?: string; text: string; timestamp: string; replies?: { id: number; author_id: number; author: string; author_avatar?: string; author_avatar_frame?: string; text: string; timestamp: string }[] }[]>([]);
    const [wallInput, setWallInput] = useState('');
    const [wallLoading, setWallLoading] = useState(false);
    const [wallReplyingTo, setWallReplyingTo] = useState<number | null>(null);
    const [wallReplyText, setWallReplyText] = useState('');

    // Load wall comments from backend with replies (paginated)
    const loadWallComments = useCallback((offset = 0, append = false) => {
        if (!user?.id) return;
        fetch(`${API_BASE}/auth/wall-comments/${user.id}/with-replies?offset=${offset}&limit=10`)
            .then(r => r.json())
            .then(data => {
                if (data && data.comments) {
                    setWallComments(prev => append ? [...prev, ...data.comments] : data.comments);
                    setWallTotal(data.total);
                    setHasMoreWall(data.has_more);
                    setWallOffset(offset + (data.comments?.length || 0));
                } else if (Array.isArray(data)) {
                    setWallComments(data);
                }
            })
            .catch(() => {});
    }, [user?.id]);

    useEffect(() => { loadWallComments(0); }, [loadWallComments]);

    const handleWallComment = async () => {
        if (!wallInput.trim() || !user?.id) return;
        setWallLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/wall-comments/${user.id}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: wallInput.trim() }),
            });
            if (res.ok) {
                const newComment = await res.json();
                setWallComments(prev => [newComment, ...prev]);
                setWallInput('');
                showToaster('Комментарий добавлен!');
                if (newComment.scrap_earned > 0) showToaster(`+${newComment.scrap_earned} за комментарий!`);
            } else {
                showToaster('Ошибка отправки');
            }
        } catch { showToaster('Ошибка сети'); }
        finally { setWallLoading(false); }
    };

    const handleDeleteWallComment = async (id: number) => {
        try {
            await fetch(`${API_BASE}/auth/wall-comments/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            setWallComments(prev => prev.filter(c => c.id !== id));
        } catch { showToaster('Ошибка удаления'); }
    };

    const handleWallReply = async (commentId: number) => {
        if (!wallReplyText.trim()) return;
        try {
            const res = await fetch(`${API_BASE}/auth/wall-comments/${commentId}/reply`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: wallReplyText.trim() }),
            });
            if (res.ok) {
                const r = await res.json();
                setWallComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: [...(c.replies || []), r] } : c));
                setWallReplyText('');
                setWallReplyingTo(null);
            }
        } catch { showToaster('Ошибка ответа'); }
    };

    const handleDeleteWallReply = async (replyId: number, commentId: number) => {
        try {
            await fetch(`${API_BASE}/auth/wall-replies/${replyId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            setWallComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: (c.replies || []).filter(r => r.id !== replyId) } : c));
        } catch { showToaster('Ошибка удаления'); }
    };

    // XP tooltip
    const [showXpTooltip, setShowXpTooltip] = useState(false);

    // Wall pagination
    const [wallOffset, setWallOffset] = useState(0);
    const [wallTotal, setWallTotal] = useState(0);
    const [hasMoreWall, setHasMoreWall] = useState(false);

    // Shop & Scrap (removed shopItems/myPurchases — no longer needed for titles)

    // Sound
    const [soundEnabled, setSoundEnabled] = useState(false);


    // User comments from server
    const [userComments, setUserComments] = useState<{ text: string; mangaId: string; mangaTitle: string; mangaSlug: string; cover: string; timestamp: string }[]>([]);
    useEffect(() => {
        if (!user) return;
        fetch(`${API_BASE}/auth/my-comments`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then((data: { id: number; mangaId: string; mangaTitle?: string; mangaSlug?: string; coverUrl?: string; chapterId?: string; text: string; timestamp: string }[]) => {
                setUserComments(data.map(c => ({
                    text: c.text,
                    mangaId: c.mangaId,
                    mangaTitle: c.mangaTitle || c.mangaId,
                    mangaSlug: c.mangaSlug || c.mangaId,
                    cover: c.coverUrl || '',
                    timestamp: c.timestamp,
                })));
            })
            .catch(() => {});
    }, [user]);

    // Bookmarked manga for "add to showcase/favorites"
    const bookmarkedManga = useMemo(() => {
        return bookmarks.map(b => ({ ...b, manga: getMangaById(b.mangaId) })).filter(b => b.manga);
    }, [bookmarks, getMangaById]);



    // Theme keys
    const currentThemeKey = user?.profile_theme || 'base';
    const activeThemeKey = previewSkinKey ? previewSkinKey : (isEditOpen && previewTheme !== currentThemeKey ? previewTheme : currentThemeKey);

    const glowOverride = useMemo(() => {
        const color = profileData?.nickname_color;
        if (activeThemeKey !== 'phantom' || !color || !color.startsWith('#') || color.length < 7) return {};
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return { '--profile-glow': color, '--profile-glow-rgb': `${r}, ${g}, ${b}` } as React.CSSProperties;
    }, [activeThemeKey, profileData?.nickname_color]);

    const canUploadBanner = user?.role === 'admin' || !!profileData?.subscription_active;

    // Current frame (shop modal preview takes priority)
    const currentFrame = user?.avatar_frame || 'none';
    const activeFrame = previewFrameKey || (isEditOpen && editTab === 'appearance' ? previewFrame : currentFrame);
    const frameImage = getFrameImage(activeFrame);

    // Heatmap data
    const heatmap: Record<string, number> = profileData?.heatmap || {};
    const heatmapDays = useMemo(() => generateHeatmapDays(), []);

    // Gamification
    const xp = profileData?.gamification?.xp ?? 0;
    const level = profileData?.gamification?.level ?? 0;
    const xpCurrentLevel = profileData?.gamification?.xp_current_level ?? 0;
    const xpNextLevel = profileData?.gamification?.xp_next_level ?? 50;
    const xpProgress = profileData ? (xpNextLevel > xpCurrentLevel ? ((xp - xpCurrentLevel) / (xpNextLevel - xpCurrentLevel)) * 100 : 100) : 0;



    // Load profile-full + check achievements
    useEffect(() => {
        if (!user) { setProfileLoading(false); return; }
        try { setBadges(JSON.parse(user.badge_ids || '[]')); } catch { setBadges([]); }

        setProfileLoading(true);

        Promise.all([
            fetch(`${API_BASE}/auth/profile-full`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
            fetch(`${API_BASE}/auth/check-achievements`, { method: 'POST', credentials: 'include' }).then(r => r.json()).catch(() => null),
            fetch(`${API_BASE}/auth/sync-xp`, { method: 'POST', credentials: 'include' }).then(r => r.json()).catch(() => null),
            fetch(`${API_BASE}/auth/my-purchases`, { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch(`${API_BASE}/shop/items`, { credentials: 'include' }).then(r => r.json()).catch(() => []),
        ]).then(([profileData, achData, xpData, purchases, shopItems]) => {
            if (profileData) {
                setProfileData(profileData);
                if (profileData.user?.badge_ids) setBadges(profileData.user.badge_ids);
                if (profileData?.nickname_font) {
                    const fontLink = document.createElement('link');
                    fontLink.rel = 'stylesheet';
                    fontLink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(profileData.nickname_font)}&display=swap`;
                    fontLink.id = 'nickname-font-link';
                    const existing = document.getElementById('nickname-font-link');
                    if (existing) existing.remove();
                    document.head.appendChild(fontLink);
                }
            }
            if (achData?.badges) setBadges(achData.badges);
            if (achData?.new_badges?.length > 0) {
                const manualAchievements = ['konami_master', 'horror_discoverer'];
                achData.new_badges.forEach((b: string) => {
                    if (manualAchievements.includes(b)) return;
                    const ach = ACHIEVEMENTS[b];
                    if (ach) showToaster(`🎉 Новая ачивка: ${ach.title}!`);
                });
            }
            if (xpData) {
                if (xpData.level_up) showToaster(`⚡ Уровень повышен! Теперь вы ${xpData.level} ур.`);
                if (xpData.daily_scrap > 0) showToaster(`+${xpData.daily_scrap} за ежедневный вход!`);
                if (xpData.level_scrap > 0) showToaster(`+${xpData.level_scrap} за повышение уровня!`);
            }
            if (Array.isArray(purchases)) setMyPurchases(purchases);
            if (Array.isArray(shopItems)) {
                const filteredData = shopItems.filter((item: any) => !(item.category === 'frame' && item.preview.includes('/Frames_lvl/')));
                setAllShopItems(filteredData);
                setShopSkins(filteredData.filter((i: any) => i.category === 'skin'));
            }
        }).finally(() => setProfileLoading(false));
    }, [user?.id]);

    // Listen for real-time achievement unlocks from other components (e.g. SpringtrapNightmare)
    useEffect(() => {
        const handler = (e: Event) => {
            const id = (e as CustomEvent).detail as string;
            if (id && !badgesRef.current.includes(id)) {
                setBadges(prev => [...prev, id]);
            }
        };
        window.addEventListener('achievement-unlocked', handler);
        return () => window.removeEventListener('achievement-unlocked', handler);
    }, []);

    // Konami code listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (badgesRef.current.includes('konami_master')) return;
            setKonamiProgress(prev => {
                const expected = KONAMI_CODE[prev];
                if (e.code === expected) {
                    const next = prev + 1;
                    if (next === KONAMI_CODE.length) {
                        fetch(`${API_BASE}/auth/unlock-achievement?achievement_id=konami_master`, {
                            method: 'POST',
                            credentials: 'include',
                        })
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    setBadges(prev => [...prev, 'konami_master']);
                                    showToaster('🎮 СЕКРЕТНАЯ АЧИВКА РАЗБЛОКИРОВАНА: Konami Master!');
                                }
                            })
                            .catch(() => {});
                        return 0;
                    }
                    return next;
                }
                return e.code === KONAMI_CODE[0] ? 1 : 0;
            });
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Avatar click glitch — Springtrap horror effect
    const [avatarGlitching, setAvatarGlitching] = useState(false);
    const handleAvatarClick = useCallback(() => {
        if (avatarGlitching) return;
        setAvatarGlitching(true);
        setTimeout(() => setAvatarGlitching(false), 600);
    }, [avatarGlitching]);

    // Cleanup typewriter timer on unmount
    useEffect(() => () => { if (typewriterTimer.current) clearTimeout(typewriterTimer.current); }, []);

    // Sound effect helper (Web Audio API — no files)
    const playBeep = useCallback(() => {
        if (!soundEnabled) return;
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 880;
            gain.gain.value = 0.08;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch {}
    }, [soundEnabled]);


    // Load sound_enabled from profile data
    useEffect(() => {
        if (profileData) {
            setSoundEnabled(profileData.sound_enabled || false);
        }
    }, [profileData]);

    // Load Google Font dynamically for nickname preview in edit modal
    useEffect(() => {
        if (!editNicknameFont) return;
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(editNicknameFont)}&display=swap`;
        fontLink.id = 'nickname-font-link-preview';
        const existing = document.getElementById('nickname-font-link-preview');
        if (existing) existing.remove();
        document.head.appendChild(fontLink);
    }, [editNicknameFont]);

    if (authLoading || mangaLoading) return <ProfilePageSkeleton />;
    if (!user) return <div className="text-center p-8 font-mono text-muted">[ ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН ]</div>;

    const avatarSrc = user.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`) : '';
    const cacheSuffix = mediaCacheBuster ? `?v=${mediaCacheBuster}` : '';
    const bannerRaw = user.profile_banner_url ? (user.profile_banner_url.startsWith('http') ? user.profile_banner_url : `${API_BASE}${user.profile_banner_url}`) : '';
    const bannerSrc = bannerRaw ? `${bannerRaw}${cacheSuffix}` : '';
    const profileBgUrl = profileData?.profile_background_url || (user as any).profile_background_url || '';
    const bgRaw = profileBgUrl ? (profileBgUrl.startsWith('http') ? profileBgUrl : `${API_BASE}${profileBgUrl}`) : '';
    const backgroundSrcBase = bgRaw ? `${bgRaw}${cacheSuffix}` : '';
    const backgroundSrc = previewBgUrl || backgroundSrcBase;

    // Skin preview helpers
    const FREE_SKINS: Record<string, { name: string; subtitle: string; previewColors: string[]; bannerGradient: string }> = {
        base: { name: 'Base', subtitle: 'Стандартная тема', previewColors: ['#7A8755', '#A9FF00', '#121212'], bannerGradient: 'from-brand/30 via-brand/10 to-brand-accent/20' },
        neon: { name: 'Neon', subtitle: 'Токсичное свечение', previewColors: ['#A9FF00', '#7FFF00', '#141814'], bannerGradient: 'from-[#A9FF00]/30 via-[#A9FF00]/5 to-brand/20' },
        corroded: { name: 'Corroded', subtitle: 'Ржавый распад', previewColors: ['#8B5E3C', '#C17A4A', '#171311'], bannerGradient: 'from-[#8B5E3C]/40 via-[#8B5E3C]/15 to-[#3D2B1F]/30' },
    };

    const allSkins = useMemo(() => {
        const free = Object.entries(FREE_SKINS).map(([key, s]) => ({
            key, name: s.name, subtitle: s.subtitle, previewColors: s.previewColors,
            price: 0, rarity: 'common' as string, owned: true, isFree: true,
            css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '',
        }));
        const paid = shopSkins.map(s => ({
            key: s.key.replace('skin_', ''),
            name: s.name,
            subtitle: s.description,
            previewColors: [s.preview, s.preview + '88', '#0a0a0a'],
            price: s.price,
            rarity: s.rarity || 'common',
            owned: myPurchases.includes(s.key),
            isFree: false,
            css_variables: s.css_variables || '{}',
            block_style: s.block_style || 'none',
            nickname_effect: s.nickname_effect || 'none',
            font_family: s.font_family || '',
        }));
        return [...free, ...paid];
    }, [shopSkins, myPurchases]);

    // @ts-ignore - unused but kept for potential future use
    const handleSkinPreview = (skin: typeof allSkins[0]) => {
        setPreviewTheme(skin.key as string);
        setPreviewSkinKey(skin.key);
        setIsPreviewingLocked(!skin.owned);
        if (skin.rarity !== 'mythic') {
            setEditNicknameColor('');
            setEditNicknameFont('');
        }
        try {
            const vars = JSON.parse(skin.css_variables);
            setPreviewCssVars(vars);
        } catch { setPreviewCssVars({}); }
    };

    // @ts-ignore - unused but kept for potential future use
    const handleSkinBuy = async (skin: typeof allSkins[0]) => {
        try {
            const res = await fetch(`${API_BASE}/shop/buy/skin_${skin.key}`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setMyPurchases(prev => [...prev, `skin_${skin.key}`]);
                if (profileData) {
                    setProfileData({ ...profileData, gamification: { ...profileData.gamification, scrap: data.scrap } });
                }
                setIsPreviewingLocked(false);
                // Auto-equip
                setPreviewTheme(skin.key as string);
                showToaster(`Скин "${skin.name}" разблокирован!`);
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка покупки');
            }
        } catch { showToaster('Ошибка сети'); }
    };

    // @ts-ignore - unused but kept for potential future use
    const getActiveSkinData = () => allSkins.find(s => s.key === (previewSkinKey || currentThemeKey));
    const currentScrap = (profileData?.gamification?.scrap ?? 0) + (profileData?.gamification?.donated_scrap ?? 0);

    // Handlers for CustomizationDrawer
    // @ts-ignore - unused but kept for potential future use
    const handleDrawerEquip = async (itemKey: string, category: string) => {
        if (category === 'skin') {
            // For free skins, use profile_theme directly; for shop skins, use activate endpoint
            const isFree = ['base', 'neon', 'corroded'].includes(itemKey) || ['base', 'neon', 'corroded'].includes(itemKey.replace('skin_', ''));
            if (isFree) {
                const themeKey = itemKey.replace('skin_', '');
                await updateUser({ profile_theme: themeKey } as any);
                showToaster('Скин применён!');
                return;
            }
            const activateKey = itemKey.startsWith('skin_') ? itemKey : `skin_${itemKey}`;
            const res = await fetch(`${API_BASE}/shop/activate/${activateKey}`, {
                method: 'POST', credentials: 'include',
            });
            if (res.ok) showToaster('Скин применён!');
            else showToaster('Ошибка применения');
        } else if (category === 'frame') {
            await updateUser({ avatar_frame: itemKey } as any);
            showToaster('Рамка применена!');
        } else {
            const res = await fetch(`${API_BASE}/shop/activate/${itemKey}`, {
                method: 'POST', credentials: 'include',
            });
            if (res.ok) showToaster('Предмет применён!');
            else showToaster('Ошибка применения');
        }
        // Refresh profile data
        const pfRes = await fetch(`${API_BASE}/auth/profile-full`, { credentials: 'include' });
        if (pfRes.ok) setProfileData(await pfRes.json());
    };

    // @ts-ignore - unused but kept for potential future use
    const handleDrawerBuy = async (itemKey: string): Promise<boolean> => {
        const res = await fetch(`${API_BASE}/shop/buy/${itemKey}`, {
            method: 'POST', credentials: 'include',
        });
        if (res.ok) {
            const data = await res.json();
            setMyPurchases(prev => [...prev, itemKey]);
            if (profileData) {
                setProfileData({
                    ...profileData,
                    gamification: {
                        ...profileData.gamification,
                        scrap: data.earned_scrap ?? data.scrap ?? profileData.gamification.scrap,
                        donated_scrap: data.donated_scrap ?? profileData.gamification.donated_scrap,
                    },
                });
            }
            showToaster('Куплено!');
            return true;
        }
        const err = await res.json().catch(() => ({}));
        showToaster(err.detail || 'Ошибка покупки');
        return false;
    };

    // Compute nickname effect class for the active (or previewed) skin
    const nicknameEffectClass = useMemo(() => {
        const skin = allSkins.find(s => s.key === activeThemeKey);
        if (!skin || skin.nickname_effect === 'none') return '';
        if (skin.nickname_effect === 'gradient-pulse') return 'nickname-gradient-pulse';
        if (skin.nickname_effect === 'toxic-glitch') return 'nickname-toxic-glitch';
        return `nickname-${skin.nickname_effect}`;
    }, [activeThemeKey, allSkins]);

    // Block style class for the active (or previewed) skin
    const blockStyleClass = useMemo(() => {
        const skin = allSkins.find(s => s.key === activeThemeKey);
        if (!skin || skin.block_style === 'none') return '';
        return `skin-block-${skin.block_style}`;
    }, [activeThemeKey, allSkins]);

    // Overlay class for the active (or previewed) skin
    const overlayClass = useMemo(() => {
        const skin = allSkins.find(s => s.key === activeThemeKey);
        if (!skin) return '';
        const key = skin.key;
        if (key === 'biohazard') return 'skin-overlay-biohazard';
        if (key === 'golden-era') return 'skin-overlay-golden-era';
        if (key === 'phantom') return 'skin-overlay-phantom';
        if (skin.nickname_effect === 'toxic-glitch') return 'skin-overlay-scanlines';
        if (skin.block_style === 'rusted-metal-bg') return 'skin-overlay-embers';
        return '';
    }, [activeThemeKey, allSkins]);

    // Nickname custom style for mythic (includes preview skin font)
    const nicknameCustomStyle = useMemo(() => {
        const style: React.CSSProperties = {};
        const skin = allSkins.find(s => s.key === activeThemeKey);
        const isMythic = skin?.rarity === 'mythic';

        // Skin-specific font (for non-mythic skins)
        if (skin?.font_family && !isMythic) {
            style.fontFamily = `'${skin.font_family}', monospace`;
        }

        // User's custom color/font for mythic skins (has priority)
        if (isMythic) {
            const nc = profileData?.nickname_color;
            const nf = profileData?.nickname_font;
            if (nc) style.color = nc;
            if (nf) style.fontFamily = `'${nf}', monospace`;
        }

        return style;
    }, [profileData, activeThemeKey, allSkins]);

    const onCropImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const size = Math.min(width, height, 300);
        const x = (width - size) / 2;
        const y = (height - size) / 2;
        setCrop({ unit: 'px', x, y, width: size, height: size });
    }, []);

    const handleCropConfirm = async () => {
        if (!cropImgRef.current || !completedCrop) return;
        setAvatarLoading(true);
        try {
            const blob = await getCroppedBlob(cropImgRef.current, completedCrop);
            const formData = new FormData();
            formData.append('file', blob, 'avatar.jpg');
            const res = await fetch(`${API_BASE}/auth/avatar`, { method: 'POST', credentials: 'include', body: formData });
            if (res.ok) {
                await refreshUser();
                setMediaCacheBuster(Date.now());
                showToaster('Аватарка обновлена!');
                setCropImageSrc(null);
            } else { showToaster('Ошибка загрузки'); }
        } catch { showToaster('Ошибка сети'); }
        finally { setAvatarLoading(false); }
    };

    // Refresh profile & user data from backend
    const refreshProfileAndUser = useCallback(async () => {
        const [profileRes] = await Promise.all([
            fetch(`${API_BASE}/auth/profile-full`, { credentials: 'include' }),
            refreshUser(),
        ]);
        if (profileRes.ok) {
            const data = await profileRes.json();
            setProfileData(data);
            // Update purchases list from profile data
            if (data.purchases) setMyPurchases(data.purchases);
        }
        // Also refresh purchases separately in case profile-full doesn't include them
        fetch(`${API_BASE}/auth/my-purchases`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then(data => setMyPurchases(data))
            .catch(() => {});
    }, [refreshUser]);

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBannerLoading(true);
        try {
            const formData = new FormData(); formData.append('file', file);
            const res = await fetch(`${API_BASE}/auth/banner`, { method: 'POST', credentials: 'include', body: formData });
            if (res.ok) {
                await refreshProfileAndUser();
                setMediaCacheBuster(Date.now());
                showToaster('Баннер обновлен!');
            }
            else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка загрузки');
            }
        } catch (err) {
            console.error('Banner upload error:', err);
            showToaster('Ошибка сети');
        }
        finally { setBannerLoading(false); }
    };

    const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBackgroundLoading(true);
        try {
            const formData = new FormData(); formData.append('file', file);
            const res = await fetch(`${API_BASE}/auth/background`, { method: 'POST', credentials: 'include', body: formData });
            if (res.ok) {
                await refreshProfileAndUser();
                setMediaCacheBuster(Date.now());
                showToaster('Фон обновлен!');
            }
            else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка загрузки');
            }
        } catch (err) {
            console.error('Background upload error:', err);
            showToaster('Ошибка сети');
        }
        finally { setBackgroundLoading(false); }
    };

    const handleShopBuy = useCallback(async (itemKey: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE}/shop/buy/${itemKey}`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                showToaster('Куплено!');
                await refreshProfileAndUser();
                return true;
            }
            const err = await res.json().catch(() => ({}));
            showToaster(err.detail || 'Ошибка покупки');
            return false;
        } catch {
            showToaster('Ошибка сети');
            return false;
        }
    }, [showToaster, refreshProfileAndUser]);

    const handleShopEquip = useCallback(async (itemKey: string) => {
        // Free skins: update profile_theme directly instead of calling /shop/activate
        const FREE_SKIN_KEYS = ['skin_base', 'skin_neon', 'skin_corroded'];
        if (FREE_SKIN_KEYS.includes(itemKey)) {
            const themeVal = itemKey.replace('skin_', '');
            try {
                await updateUser({ profile_theme: themeVal } as any);
                showToaster('Применено!');
                setPreviewCssVars({});
                setPreviewSkinKey(null);
                setIsPreviewingLocked(false);
            } catch { showToaster('Ошибка'); }
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/shop/activate/${itemKey}`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                showToaster('Применено!');
                await refreshProfileAndUser();
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка применения');
            }
        } catch {
            showToaster('Ошибка сети');
        }
    }, [showToaster, refreshProfileAndUser, updateUser]);

    const handleShopPreview = useCallback((cssVars: Record<string, string> | null, themeKey: string | null) => {
        if (cssVars === null) {
            setPreviewCssVars({});
            setPreviewSkinKey(null);
            setIsPreviewingLocked(false);
        } else {
            setPreviewCssVars(cssVars);
            setPreviewSkinKey(themeKey);
            setIsPreviewingLocked(!myPurchases.includes(`skin_${themeKey}`) && !['base','neon','corroded'].includes(themeKey || ''));
        }
    }, [myPurchases]);

    const handleBackgroundPreview = useCallback((url: string | null) => {
        setPreviewBgUrl(url);
    }, []);

    const handleFramePreview = useCallback((frameKey: string | null) => {
        setPreviewFrameKey(frameKey);
    }, []);

    const genderLabel = (g: string) => g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : '';
    const formatBirthday = (b: string) => { if (!b) return ''; try { return new Date(b).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return b; } };
    // Deduplicate history: one entry per manga, keep latest chapter
    const recentHistory = useMemo(() => {
        const seen = new Map<string, typeof history[0]>();
        for (const h of history) {
            if (!seen.has(h.mangaId)) {
                seen.set(h.mangaId, h);
            }
        }
        return Array.from(seen.values()).slice(0, 6).map(h => {
            const manga = getMangaById(h.mangaId);
            if (!manga) return null;
            const chapter = manga.chapters.find(ch => ch.id === h.chapterId);
            const chapterIndex = chapter ? manga.chapters.findIndex(ch => ch.id === h.chapterId) + 1 : 0;
            const totalChapters = manga.chapters.length;
            return { ...h, manga, chapter, chapterIndex, totalChapters };
        }).filter(Boolean) as any[];
    }, [history, getMangaById]);

    /* ═══════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════ */
    // Set body background image/video — cleanup on unmount
    useEffect(() => {
        const root = document.getElementById('root');
        let cancelled = false;

        const origBodyBg = document.body.style.backgroundColor;
        const origBodyBgImage = document.body.style.backgroundImage;
        const origBodyBgRepeat = document.body.style.backgroundRepeat;
        const origBodyBgSize = document.body.style.backgroundSize;
        const origBodyBgPosition = document.body.style.backgroundPosition;
        const origHtmlBgImage = document.documentElement.style.backgroundImage;
        const origHtmlBgSize = document.documentElement.style.backgroundSize;
        const origHtmlBgPosition = document.documentElement.style.backgroundPosition;
        const origHtmlBgAttachment = document.documentElement.style.backgroundAttachment;
        const origHtmlBgRepeat = document.documentElement.style.backgroundRepeat;
        const origHtmlBgColor = document.documentElement.style.backgroundColor;
        const origRootBg = root?.style.backgroundColor || '';

        const applyImageBg = (src: string) => {
            document.body.style.backgroundColor = 'transparent';
            if (root) root.style.backgroundColor = 'transparent';
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundImage = `linear-gradient(rgba(18,18,18,0.72), rgba(18,18,18,0.72)), url(${src})`;
            document.documentElement.style.backgroundSize = 'cover';
            document.documentElement.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundAttachment = 'fixed';
            document.documentElement.style.backgroundRepeat = 'no-repeat';
            document.documentElement.style.backgroundColor = '#121212';
        };

        const restoreOrig = () => {
            document.documentElement.style.backgroundImage = origHtmlBgImage;
            document.documentElement.style.backgroundSize = origHtmlBgSize;
            document.documentElement.style.backgroundPosition = origHtmlBgPosition;
            document.documentElement.style.backgroundAttachment = origHtmlBgAttachment;
            document.documentElement.style.backgroundRepeat = origHtmlBgRepeat;
            document.documentElement.style.backgroundColor = origHtmlBgColor;
            document.body.style.backgroundImage = origBodyBgImage;
            document.body.style.backgroundRepeat = origBodyBgRepeat;
            document.body.style.backgroundSize = origBodyBgSize;
            document.body.style.backgroundPosition = origBodyBgPosition;
            document.body.style.backgroundColor = origBodyBg;
            if (root) root.style.backgroundColor = origRootBg;
        };

        if (backgroundSrc && !isVideo(backgroundSrc)) {
            // Set dark bg immediately to avoid white flash while image loads
            document.documentElement.style.backgroundColor = '#121212';
            document.body.style.backgroundColor = '#121212';
            if (root) root.style.backgroundColor = 'transparent';
            // Preload image before applying as background
            const img = new Image();
            img.onload = () => {
                if (!cancelled) applyImageBg(backgroundSrc);
            };
            img.onerror = () => {
                if (!cancelled) applyImageBg(backgroundSrc);
            };
            img.src = backgroundSrc;
        } else if (!backgroundSrc) {
            restoreOrig();
        }

        // For video — inject a fixed video element behind #root
        let videoBg: HTMLDivElement | null = null;
        if (backgroundSrc && isVideo(backgroundSrc)) {
            document.documentElement.style.backgroundColor = '#121212';
            document.body.style.backgroundColor = 'transparent';
            if (root) root.style.backgroundColor = 'transparent';
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';

            const existing = document.getElementById('profile-video-bg');
            if (existing) existing.remove();

            videoBg = document.createElement('div');
            videoBg.id = 'profile-video-bg';
            videoBg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;overflow:hidden;pointer-events:none;';
            videoBg.innerHTML = `
                <video src="${backgroundSrc}" autoplay loop muted playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s ease;"></video>
                <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(18,18,18,0.72);pointer-events:none;"></div>
            `;
            document.body.insertBefore(videoBg, document.body.firstChild);
            // Fade in video once it has enough data to play
            const videoEl = videoBg.querySelector('video');
            if (videoEl) {
                videoEl.addEventListener('canplay', () => { videoEl.style.opacity = '1'; }, { once: true });
            }

            // Make sure body and root are transparent and positioned correctly
            document.body.style.position = 'relative';
            document.body.style.backgroundColor = 'transparent';
            if (root) {
                root.style.position = 'relative';
                root.style.zIndex = '1';
                root.style.backgroundColor = 'transparent';
            }

        }

        return () => {
            cancelled = true;
            restoreOrig();
            const vid = document.getElementById('profile-video-bg');
            if (vid) vid.remove();
        };
    }, [backgroundSrc]);

    if (profileLoading) return <ProfilePageSkeleton />;

    return (
        <>
        <div data-profile-theme={activeThemeKey} style={{ ...glowOverride, ...(Object.keys(previewCssVars).length > 0 ? previewCssVars : {}) } as React.CSSProperties} className={isPreviewingLocked ? 'preview-watermark' : ''}>


            {/* ═══ MAIN CONTENT ═══ */}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 relative z-[1]">

            {/* ═══ HEADER CARD (over fixed background) ═══ */}
            <div className={`relative z-[1] mb-6 overflow-hidden ${!bannerSrc ? `border profile-border profile-surface-bg ${blockStyleClass} ${overlayClass}` : ''}`} style={{ minHeight: '250px' }} {...(bannerSrc ? { 'data-profile-theme': 'base' } : {})}>

                {/* Cover banner — абсолютно на весь контейнер */}
                {bannerSrc ? (
                    <div className="absolute inset-0 z-0">
                        {isVideo(bannerSrc) ? (
                            <video src={bannerSrc} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
                        ) : (
                            <img src={bannerSrc} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/110 via-black/50 to-black/20" />
                    </div>
                ) : (
                    <div className="absolute inset-0 z-0 profile-surface-bg" />
                )}

                {/* Profile info */}
                <div className="relative z-[4] px-4 sm:px-8 pt-24 sm:pt-32 pb-8 sm:pb-10">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">

                        {/* Avatar with frame + glitch */}
                        <div className={`spring-avatar relative flex shrink-0 overflow-visible cursor-pointer ${avatarGlitching ? 'springtrap-glitch' : ''}`} style={{ width: frameImage ? '8rem' : '6rem', height: frameImage ? '8rem' : '6rem', margin: frameImage ? '1rem' : 0, borderRadius: 12 }} onClick={handleAvatarClick}>
                            {avatarSrc ? (
                                <img src={avatarSrc} alt={user.username} className="z-[1] aspect-square size-full object-cover select-none transition-all duration-500" style={{ borderRadius: 12 }} />
                            ) : (
                                <div className="z-[1] aspect-square size-full flex items-center justify-center transition-all duration-500" style={{ borderRadius: 12, overflow: 'hidden' }}>
                                    <Avatar name={user.avatar || user.username} size={144} />
                                </div>
                            )}
                            {frameImage && (
                                <span className="inline-flex shrink-0 absolute top-0 left-0 z-[2] scale-125 select-none pointer-events-none">
                                    <img src={frameImage} alt="frame" style={{ width: '8rem', height: '8rem' }} />
                                </span>
                            )}
                            {/* Online dot */}
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-brand-accent rounded-full border-2 border-surface z-10" />
                        </div>

                        {/* Name + Level + Meta */}
                        <div className="flex-1 text-center sm:text-left min-w-0">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
                                <h1 className={`text-2xl sm:text-3xl md:text-4xl font-display font-bold text-text-primary spring-glitch truncate max-w-[300px] sm:max-w-none ${nicknameEffectClass}`} style={nicknameCustomStyle} data-text={user.username}>{user.username}</h1>
                                <RankBadge chaptersRead={profileData?.stats?.chapters_read ?? totalChaptersRead} size="md" />
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 shrink-0 ${
                                    user.role === 'admin' ? 'bg-brand-accent/20 text-brand-accent' :
                                    user.role === 'moderator' ? 'bg-brand/20 text-brand' :
                                    'profile-badge-bg profile-accent-text'
                                }`}>
                                    {user.role === 'admin' ? 'ADMIN' : user.role === 'moderator' ? 'MOD' : (profileData ? `LVL ${level}` : '')}
                                </span>
                                {profileData?.subscription_active && user.role !== 'admin' && (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border border-yellow-500/30 shrink-0">
                                        PRO
                                    </span>
                                )}
                            </div>

                            {/* XP Progress Bar — "System Battery" */}
                            {profileData && (
                            <div className="flex items-center gap-3 mb-2 max-w-md mx-auto sm:mx-0 relative">
                                <div className="flex-1 h-5 bg-base border border-overlay relative overflow-hidden group/xp cursor-help"
                                    onMouseEnter={() => setShowXpTooltip(true)} onMouseLeave={() => setShowXpTooltip(false)}>
                                    {/* XP info tooltip */}
                                    <AnimatePresence>
                                        {showXpTooltip && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-base border border-overlay px-4 py-3 z-50 shadow-xl whitespace-nowrap"
                                            >
                                                <p className="text-[10px] font-mono font-bold text-text-primary mb-2">📊 НАЧИСЛЕНИЕ ОПЫТА</p>
                                                <div className="space-y-1 text-[10px] font-mono">
                                                    <div className="flex justify-between gap-4 text-text-secondary"><span>📖 Прочитана глава</span><span className="text-brand-accent">+10 XP</span></div>
                                                    <div className="flex justify-between gap-4 text-text-secondary"><span>⭐ Оценка манги</span><span className="text-brand-accent">+5 XP</span></div>
                                                    <div className="flex justify-between gap-4 text-text-secondary"><span>🔖 Добавление в закладки</span><span className="text-brand-accent">+3 XP</span></div>
                                                    <div className="border-t border-overlay pt-1 mt-1 flex justify-between text-text-primary font-bold">
                                                        <span>Формула</span><span className="text-muted">50 × Ур² XP</span>
                                                    </div>
                                                </div>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-base border-r border-b border-overlay rotate-45 -mt-1" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    {/* Battery fill */}
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(xpProgress, 100)}%` }}
                                        transition={{ duration: 1.2, ease: 'easeOut' }}
                                        className="h-full relative xp-bar-fill"
                                        style={{ background: 'linear-gradient(90deg, rgba(169,255,0,0.3), rgba(169,255,0,0.8))' }}
                                    >
                                        {/* Scanline effect on bar */}
                                        <div className="absolute inset-0" style={{
                                            backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
                                        }} />
                                    </motion.div>
                                    {/* Label */}
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-text-primary mix-blend-difference">
                                        {xp} / {xpNextLevel} XP
                                    </span>
                                </div>
                                <span className="text-xs font-mono font-bold profile-glow-text shrink-0">LV.{level}</span>
                            </div>
                            )}

                            {user.bio && (
                                <p className="text-text-secondary text-sm mt-1 line-clamp-2 max-w-lg mx-auto sm:mx-0">{user.bio}</p>
                            )}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2 text-[10px] text-muted font-mono">
                                {user.gender && genderLabel(user.gender) && <span className="bg-overlay px-2 py-0.5">{genderLabel(user.gender)}</span>}
                                {user.birthday && <span className="bg-overlay px-2 py-0.5">{formatBirthday(user.birthday)}</span>}
                                <span className="bg-overlay px-2 py-0.5">📖 {totalChaptersRead} глав</span>
                                <span className="bg-overlay px-2 py-0.5">🔖 {bookmarks.length} закладок</span>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-center sm:justify-end">
                            {canUploadBanner && (
                                <label className="px-2 py-1.5 text-[10px] font-mono font-bold bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1 backdrop-blur-sm">
                                    📷 {bannerLoading ? '...' : 'Обложка'}
                                    <input type="file" accept="image/*,video/mp4,video/webm,.gif" className="hidden" onChange={handleBannerUpload} disabled={bannerLoading} />
                                </label>
                            )}
                            {user.role === 'admin' && (
                                <label className="px-2 py-1.5 text-[10px] font-mono font-bold bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1 backdrop-blur-sm">
                                    🖼 {backgroundLoading ? '...' : 'Фон'}
                                    <input type="file" accept="image/*,video/mp4,video/webm,.gif" className="hidden" onChange={handleBackgroundUpload} disabled={backgroundLoading} />
                                </label>
                            )}
                            <button onClick={() => setShopModalOpen(true)}
                                className="px-2 py-1.5 text-[10px] font-mono font-bold bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-all active:scale-95"
                                title="Магазин">
                                🛒
                            </button>
                            <button onClick={() => navigate('/settings')}
                                className="px-2.5 py-1.5 text-[10px] font-mono font-bold bg-brand text-white hover:bg-brand-hover transition-all active:scale-95">
                                ⚙
                            </button>
                            {(user.role === 'admin' || user.role === 'moderator') && (
                                <Link to="/admin"
                                    className="px-2.5 py-1.5 text-[10px] font-mono font-bold bg-overlay text-text-primary hover:bg-surface-hover transition-all border border-overlay">
                                    ПАНЕЛЬ
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ MAIN GRID: Left identity + Right content ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

                {/* LEFT COLUMN — Identity card */}
                <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">

                    {/* Quick Stats */}
                    <div className={`profile-surface-bg border profile-border p-4 ${blockStyleClass}`}>
                        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                            <span className="profile-glow-text">■</span> СИСТЕМНЫЕ ДАННЫЕ
                        </h3>
                        <div className="space-y-2.5">
                            {profileData && <StatRow label="Уровень" value={`${level}`} accent />}
                            {profileData && <StatRow label="Опыт" value={`${xp} XP`} />}
                            <StatRow label="Глав прочитано" value={`${profileData?.stats?.chapters_read ?? totalChaptersRead}`} />
                            <StatRow label="Лайков" value={`${profileData?.stats?.total_likes ?? 0}`} />
                            <StatRow label="Оценок" value={`${profileData?.stats?.total_ratings ?? 0}`} />
                            <StatRow label="Закладок" value={`${profileData?.stats?.total_bookmarks ?? bookmarks.length}`} />
                            <StatRow label="Ачивок" value={`${badges.length}/${Object.keys(ACHIEVEMENTS).length}`} />
                        </div>
                    </div>

                    {/* Friends — horizontal scroll, swipeable */}
                    <div className={`profile-surface-bg border profile-border p-4 ${blockStyleClass}`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> ДРУЗЬЯ
                                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent/20 text-brand-accent text-[9px] font-mono font-bold">{realFriends.length}</span>
                            </h3>
                            <Link to="/profile/friends" className="text-[10px] font-mono text-muted hover:text-brand-accent transition-colors flex items-center gap-0.5">
                                список <span className="text-xs">›</span>
                            </Link>
                        </div>
                        {realFriends.length > 0 ? (
                        <div
                            className="flex gap-2 overflow-x-auto pb-1 cursor-grab active:cursor-grabbing"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                            onMouseDown={(e) => {
                                const el = e.currentTarget;
                                const startX = e.pageX - el.offsetLeft;
                                const scrollLeft = el.scrollLeft;
                                const onMove = (ev: MouseEvent) => { el.scrollLeft = scrollLeft - (ev.pageX - el.offsetLeft - startX); };
                                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                                document.addEventListener('mousemove', onMove);
                                document.addEventListener('mouseup', onUp);
                            }}
                        >
                            {realFriends.map(f => (
                                <Link to={`/user/${f.id}`} key={f.id} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group" style={{ minWidth: '56px' }}>
                                    <FramedAvatar avatarUrl={f.avatar_url} username={f.username} size={36} frameKey={f.avatar_frame} />
                                    <span className="text-[8px] font-mono text-muted group-hover:text-text-primary transition-colors truncate w-full text-center">{f.username}</span>
                                </Link>
                            ))}
                        </div>
                        ) : (
                            <div className="text-center py-2">
                                <Link to="/profile/friends" className="text-[9px] font-mono text-muted hover:text-brand-accent transition-colors">Найти друзей →</Link>
                            </div>
                        )}
                    </div>

                    {/* Bookmark breakdown */}
                    {Object.keys(bookmarkStats).length > 0 && (
                        <div className={`profile-surface-bg border profile-border p-4 ${blockStyleClass}`}>
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> СТАТУСЫ ЗАКЛАДОК
                            </h3>
                            <div className="space-y-1.5">
                                {Object.entries(bookmarkStats).map(([s, count]) => (
                                    <div key={s} className="flex items-center justify-between text-xs">
                                        <span className="text-text-secondary font-mono">{s}</span>
                                        <span className="text-text-primary font-mono font-bold">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Favorite Genres — Spider Chart */}
                    {favoriteGenres.length > 0 && (
                        <div className={`profile-surface-bg border profile-border p-4 ${blockStyleClass}`}>
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> РАДАР ЖАНРОВ
                            </h3>
                            <div className="flex justify-center">
                                <svg viewBox="0 0 200 200" width="180" height="180">
                                    {/* Grid levels */}
                                    {[0.25, 0.5, 0.75, 1].map((scale, si) => {
                                        const n = Math.max(favoriteGenres.length, 3);
                                        const pts = Array.from({ length: n }, (_, i) => {
                                            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                            return `${100 + Math.cos(angle) * 80 * scale},${100 + Math.sin(angle) * 80 * scale}`;
                                        }).join(' ');
                                        return <polygon key={si} points={pts} fill="none" stroke="#00FF64" strokeWidth="0.5" opacity={0.15 + si * 0.05} />;
                                    })}
                                    {/* Axis lines */}
                                    {favoriteGenres.map((_, i) => {
                                        const n = Math.max(favoriteGenres.length, 3);
                                        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                        return <line key={i} x1="100" y1="100" x2={100 + Math.cos(angle) * 80} y2={100 + Math.sin(angle) * 80} stroke="#00FF64" strokeWidth="0.5" opacity="0.2" />;
                                    })}
                                    {/* Data polygon */}
                                    <polygon
                                        points={favoriteGenres.map((g, i) => {
                                            const n = Math.max(favoriteGenres.length, 3);
                                            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                            const r = (g.pct / 100) * 80;
                                            return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`;
                                        }).join(' ')}
                                        fill="rgba(169,255,0,0.15)" stroke="#A9FF00" strokeWidth="1.5"
                                    />
                                    {/* Data points + labels */}
                                    {favoriteGenres.map((g, i) => {
                                        const n = Math.max(favoriteGenres.length, 3);
                                        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                        const r = (g.pct / 100) * 80;
                                        const lx = 100 + Math.cos(angle) * 92;
                                        const ly = 100 + Math.sin(angle) * 92;
                                        return (
                                            <g key={i}>
                                                <circle cx={100 + Math.cos(angle) * r} cy={100 + Math.sin(angle) * r} r="3" fill="#A9FF00" />
                                                <text x={lx} y={ly} fill="#888" fontSize="7" fontFamily="monospace" textAnchor="middle" dominantBaseline="central">
                                                    {g.name.length > 10 ? g.name.slice(0, 9) + '…' : g.name}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>
                        </div>
                    )}

                    {/* My Comments — compact sidebar block */}
                    <div className={`profile-surface-bg border profile-border p-4 ${blockStyleClass}`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> МОИ КОММЕНТАРИИ
                            </h3>
                            <span className="text-[9px] text-muted font-mono">{userComments.length}</span>
                        </div>
                        {userComments.length > 0 ? (
                            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                                {userComments.map((c, i) => (
                                    <Link key={i} to={`/manga/${c.mangaSlug}`} className="block p-2 bg-base/50 border profile-border hover:bg-surface-hover transition-all text-[10px] font-mono">
                                        <span className="text-brand-accent truncate block text-[9px]">{c.mangaTitle}</span>
                                        <span className="text-text-secondary truncate block">{c.text.length > 50 ? c.text.slice(0, 50) + '...' : c.text}</span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center py-3 font-mono text-[9px] text-muted">[ ПУСТО ]</p>
                        )}
                    </div>

                </div>

                {/* RIGHT COLUMN — Activity & Showcase */}
                <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

                    {/* Section 0: "Continue Reading" — Last Read */}
                    {lastReadItem && (
                        <div className={`profile-surface-bg border profile-border p-4 sm:p-5 relative overflow-hidden group scan-line-effect ${blockStyleClass}`}>
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                                <span className="profile-glow-text">📡</span>ПОСЛЕДНИЙ РАСШИФРОВАННЫЙ ФАЙЛ
                            </h3>
                            <Link to={`/manga/${lastReadItem.manga.slug || lastReadItem.manga.id}/chapter/${lastReadItem.chapterId}`} className="flex gap-4 items-center">
                                <div className="relative w-24 h-36 shrink-0 overflow-hidden border profile-border">
                                    <img src={lastReadItem.manga.cover} alt={lastReadItem.manga.title} className="w-full h-full object-cover" />
                                    {/* Scan line */}
                                    <div className="scan-line absolute left-0 w-full h-8 bg-gradient-to-b from-transparent via-[rgba(169,255,0,0.15)] to-transparent pointer-events-none" style={{ top: '-100%' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-lg font-bold text-text-primary truncate">{lastReadItem.manga.title}</h4>
                                    <p className="text-xs text-muted font-mono mt-1">
                                        {lastReadItem.chapter ? `Глава ${lastReadItem.chapter.chapterNumber}` : 'Продолжить'}
                                    </p>
                                    <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-brand-accent/20 border border-brand-accent/40 text-brand-accent text-xs font-mono font-bold hover:bg-brand-accent/30 transition-all">
                                        <span>▶</span> ПРОДОЛЖИТЬ ВЗЛОМ: Глава {lastReadItem.chapter?.chapterNumber || '?'}
                                    </div>
                                </div>
                            </Link>
                        </div>
                    )}

                    {/* Section 1: "System Logs" — Activity Heatmap */}
                    {profileData && (
                    <div className={`profile-surface-bg border profile-border p-4 sm:p-5 ${blockStyleClass}`}>
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">⚡</span>Активность чтения
                        </h3>
                        <div className="relative overflow-x-auto scrollbar-hide">
                            <div className="inline-grid gap-[3px]" style={{
                                gridTemplateRows: 'repeat(7, 1fr)',
                                gridAutoFlow: 'column',
                                gridAutoColumns: '11px',
                            }}>
                                {heatmapDays.map(day => {
                                    const count = heatmap[day] || 0;
                                    return (
                                        <div
                                            key={day}
                                            className="w-[11px] h-[11px] rounded-[2px] cursor-default transition-all hover:scale-150 hover:z-10 relative"
                                            style={{
                                                backgroundColor: heatmapColor(count),
                                                boxShadow: count > 5 ? `0 0 6px rgba(169,255,0,${Math.min(count/20, 0.6)})` : 'none',
                                            }}
                                            onMouseEnter={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setHoveredHeatmapDay({ day, count, x: rect.left, y: rect.top });
                                            }}
                                            onMouseLeave={() => setHoveredHeatmapDay(null)}
                                        />
                                    );
                                })}
                            </div>
                            {/* Heatmap legend */}
                            <div className="flex items-center gap-2 mt-3 text-[10px] text-muted font-mono">
                                <span>Меньше</span>
                                {[0, 2, 5, 10, 15].map(n => (
                                    <div key={n} className="w-[11px] h-[11px] rounded-[2px]" style={{ backgroundColor: heatmapColor(n) }} />
                                ))}
                                <span>Больше</span>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Section 2: Bookmarks (Закладки) */}
                    <div className={`profile-surface-bg border profile-border p-4 sm:p-5 ${blockStyleClass}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                                <span className="profile-glow-text">🔖</span>Закладки
                                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-brand-accent/20 text-brand-accent text-[9px] font-mono font-bold">{bookmarks.length}</span>
                            </h3>
                            <Link to="/bookmarks" className="text-[10px] font-mono text-muted hover:text-brand-accent transition-colors flex items-center gap-1">
                                Подробнее <span className="text-xs">›</span>
                            </Link>
                        </div>
                        {bookmarkedManga.length > 0 ? (
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                                {bookmarkedManga.slice(0, 5).map((b) => (
                                    <div key={b.mangaId} className="group relative">
                                        <Link to={`/manga/${b.manga!.slug || b.manga!.id}`}>
                                            <div className="aspect-[2/3] overflow-hidden border profile-border relative profile-card-hover">
                                                <img src={b.manga!.cover} alt={b.manga!.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-[9px] font-mono font-bold text-white truncate">{b.manga!.title}</p>
                                                    <p className="text-[8px] font-mono text-white/60">{b.status}</p>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <p className="text-muted text-xs font-mono">[ НЕТ ЗАКЛАДОК ]</p>
                                <Link to="/catalog" className="text-[10px] font-mono text-brand-accent hover:underline mt-2 inline-block">Перейти в каталог ›</Link>
                            </div>
                        )}
                    </div>

                    {/* Section 3: "Recovered Data" — Achievements (Full Width) */}
                    <div className={`profile-surface-bg border profile-border p-5 sm:p-6 overflow-visible ${blockStyleClass}`}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                                <span className="profile-glow-text">🔓</span>Достижения
                            </h3>
                            <span className="text-[10px] text-muted font-mono">{badges.length}/{Object.keys(ACHIEVEMENTS).length}</span>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 gap-3 overflow-visible">
                            {/* Unlocked */}
                            {badges.map((badgeId, idx) => {
                                const ach = ACHIEVEMENTS[badgeId];
                                if (!ach) return null;
                                return (
                                    <div key={badgeId} className={`relative group cursor-pointer flex flex-col items-center gap-1.5 achievement-glitch-in achievement-delay-${Math.min(idx, 9)}`}
                                        onClick={() => setSelectedBadge(badgeId)}
                                        onMouseEnter={() => setHoveredBadge(badgeId)} onMouseLeave={() => setHoveredBadge(null)}>
                                        <div
                                            className={`w-16 h-16 sm:w-[72px] sm:h-[72px]
                                            broken-frame-sm ${RARITY_GLOW_CLASS[ach.rarity]}
                                            transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1`}
                                            style={{
                                                border: ach.rarity === 'common' ? '2px solid rgba(136, 136, 136, 0.4)' :
                                                        ach.rarity === 'rare' ? '2px solid rgba(74, 158, 255, 0.5)' :
                                                        ach.rarity === 'epic' ? '2px solid rgba(168, 85, 247, 0.6)' :
                                                        ach.rarity === 'legendary' ? '2px solid rgba(255, 215, 0, 0.7)' : undefined
                                            }}
                                        >
                                            <img src={ach.icon} alt={ach.title} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-[9px] font-mono text-text-secondary text-center truncate w-full">{ach.title}</span>
                                        <BadgeTooltip show={hoveredBadge === badgeId} ach={ach} />
                                    </div>
                                );
                            })}
                            {/* Locked */}
                            {Object.entries(ACHIEVEMENTS).filter(([id]) => !badges.includes(id)).map(([id, ach], idx) => (
                                <div key={id} className={`relative group cursor-default flex flex-col items-center gap-1.5 achievement-glitch-in achievement-delay-${Math.min(badges.length + idx, 9)}`}
                                    onMouseEnter={() => setHoveredBadge(id)} onMouseLeave={() => setHoveredBadge(null)}>
                                    <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] overflow-hidden
                                        broken-frame-sm border profile-border bg-base/30 opacity-30 grayscale
                                        transition-all duration-200 group-hover:opacity-40 flex items-center justify-center">
                                        {ach.secret ? (
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#665544" strokeWidth="1.5" opacity="0.5">
                                                <circle cx="12" cy="12" r="9" /><path d="M12 7v0M9.5 9.5l5 5M14.5 9.5l-5 5"/><circle cx="12" cy="12" r="3" strokeDasharray="2 2"/>
                                            </svg>
                                        ) : (
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5" opacity="0.4">
                                                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-mono text-muted/40 text-center truncate w-full">{ach.secret ? '???' : ach.title}</span>
                                    <BadgeTooltip show={hoveredBadge === id} ach={ach} locked secret={ach.secret} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Achievement detail modal */}
                    {selectedBadge && ACHIEVEMENTS[selectedBadge] && createPortal(
                        (() => {
                            const ach = ACHIEVEMENTS[selectedBadge];
                            const rarity = RARITY_LABEL[ach.rarity];
                            return (
                                <AnimatePresence>
                                    <motion.div
                                        key="badge-modal"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                                        onClick={() => setSelectedBadge(null)}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0, y: -50 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.5, opacity: 0, y: -50 }}
                                            transition={{ type: "spring", damping: 20, stiffness: 300 }}
                                            className="bg-surface border-2 border-overlay p-6 sm:p-10 max-w-lg w-full text-center relative shadow-2xl"
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                boxShadow: `0 0 40px ${rarity.color}40, 0 20px 60px rgba(0,0,0,0.5)`,
                                                maxHeight: '90vh',
                                                overflowY: 'auto'
                                            }}
                                        >
                                        {/* Close button in top RIGHT corner */}
                                        <button
                                            onClick={() => setSelectedBadge(null)}
                                            className="absolute top-3 right-3 w-10 h-10 text-muted hover:text-text-primary transition-all flex items-center justify-center text-3xl font-bold z-10"
                                        >
                                            &times;
                                        </button>

                                        {/* Icon with glow */}
                                        <div className={`w-32 h-32 mx-auto mb-6 ${RARITY_GLOW_CLASS[ach.rarity]} border-2 profile-border relative`}>
                                            <img src={ach.icon} alt={ach.title} className="w-full h-full object-cover" />
                                        </div>

                                        {/* Title */}
                                        <h3 className="text-2xl font-display font-bold text-text-primary mb-2">{ach.title}</h3>

                                        {/* Rarity badge */}
                                        <div className="flex items-center justify-center gap-2 mb-4">
                                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-overlay"></div>
                                            <p className="text-xs font-mono font-bold px-3 py-1 border border-overlay" style={{ color: rarity.color, backgroundColor: `${rarity.color}10` }}>
                                                {rarity.text}
                                            </p>
                                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-overlay"></div>
                                        </div>

                                        {/* Secret badge */}
                                        {ach.secret && (
                                            <span className="text-[10px] font-mono font-bold text-brand-accent bg-brand-accent/10 px-2 py-1 mb-3 inline-block border border-brand-accent/30">
                                                🔒 SECRET ACHIEVEMENT
                                            </span>
                                        )}

                                        {/* Flavor text - main text in center */}
                                        <p className="text-base text-text-primary leading-relaxed italic mb-4">"{ach.flavorText}"</p>

                                        {/* Description - small text at bottom */}
                                        <div className="mt-4 pt-4 border-t border-overlay">
                                            <p className="text-xs text-muted">{ach.description}</p>
                                        </div>
                                    </motion.div>
                                </motion.div>
                                </AnimatePresence>
                            );
                        })(),
                        document.body
                    )}

                    {/* Corruption Level ☣️ */}
                    <div className={`profile-surface-bg border profile-border p-4 sm:p-5 ${blockStyleClass}`}>
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">☣</span>УРОВЕНЬ ЗАРАЖЕНИЯ
                        </h3>
                        <div className="relative">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-muted">0%</span>
                                <span className={`text-xs font-mono font-bold ${corruptionData.level >= 50 ? 'corruption-pulse' : ''}`}
                                    style={{ color: corruptionData.color }}>
                                    {corruptionData.label}
                                </span>
                                <span className="text-[10px] font-mono text-muted">100%</span>
                            </div>
                            <div className={`h-6 bg-base border border-overlay relative overflow-hidden ${corruptionData.level >= 70 ? 'corruption-critical' : ''}`}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${corruptionData.level}%` }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                    className="h-full relative corruption-barberpole"
                                    style={{
                                        background: `linear-gradient(90deg, rgba(0,255,100,0.3), ${corruptionData.color}90)`,
                                        boxShadow: corruptionData.level >= 50 ? `0 0 15px ${corruptionData.color}40` : 'none',
                                    }}
                                >
                                    <div className="absolute inset-0" style={{
                                        backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 4px)',
                                    }} />
                                </motion.div>
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white mix-blend-difference">
                                    {corruptionData.level}%
                                </span>
                            </div>
                            <p className="text-[10px] text-muted font-mono mt-2">
                                {corruptionData.level >= 75 ? '⚠ Критический уровень тёмных жанров. Система нестабильна.' :
                                 corruptionData.level >= 50 ? '⚡ Повышенное содержание хоррора и психологии.' :
                                 corruptionData.level >= 25 ? '📊 Умеренный баланс жанров.' :
                                 '✅ Преобладают лёгкие жанры. Система стабильна.'}
                            </p>
                        </div>
                    </div>

                    {/* Profile Wall — Comments from other users */}
                    <div className={`profile-surface-bg border profile-border p-4 sm:p-5 ${blockStyleClass}`}>
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">💬</span>Стена профиля
                        </h3>
                        {/* Write comment — terminal style */}
                        <div className="flex items-center gap-1 sm:gap-2 mb-4 bg-[#0a0a0a] border border-[#00FF64]/30 px-2 sm:px-3 py-2 min-w-0">
                            <span className="text-[#00FF64] text-[10px] font-mono font-bold shrink-0 select-none hidden sm:inline">root@springmanga:~#</span>
                            <span className="text-[#00FF64] text-[10px] font-mono font-bold shrink-0 select-none sm:hidden">~#</span>
                            <input
                                type="text"
                                value={wallInput}
                                onChange={e => setWallInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleWallComment()}
                                placeholder="Ввод команды..."
                                className="flex-1 min-w-0 bg-transparent border-none px-0 py-0 text-xs text-[#00FF64] font-mono placeholder:text-[#00FF64]/30 focus:outline-none terminal-input"
                                style={{ background: 'transparent', border: 'none' }}
                            />
                            <button
                                onClick={() => { handleWallComment(); playBeep(); }}
                                disabled={!wallInput.trim() || wallLoading}
                                className="px-2 sm:px-3 py-1 bg-[#00FF64]/10 text-[#00FF64] text-[10px] font-mono font-bold border border-[#00FF64]/30 hover:bg-[#00FF64]/20 disabled:opacity-30 transition-all shrink-0 whitespace-nowrap"
                            >
                                {wallLoading ? '...' : '[ EXECUTE ]'}
                            </button>
                        </div>
                        {/* Comments list */}
                        {wallComments.length > 0 ? (
                            <div className="space-y-3">
                                {wallComments.map(c => (
                                    <div key={c.id} className="bg-base/50 border profile-border">
                                        <div className="flex items-start gap-2.5 p-2.5 group">
                                            <Link to={`/user/${c.author_id}`} className="shrink-0 hover:opacity-80">
                                                <FramedAvatar avatarUrl={c.author_avatar} username={c.author} size={28} frameKey={c.author_avatar_frame} />
                                            </Link>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <Link to={`/user/${c.author_id}`} className="text-[10px] font-mono font-bold text-brand-accent hover:underline">{c.author}</Link>
                                                    <span className="text-[9px] font-mono text-muted">{c.timestamp}</span>
                                                </div>
                                                <p className="text-xs text-text-secondary leading-relaxed">{c.text}</p>
                                                <button onClick={() => { setWallReplyingTo(wallReplyingTo === c.id ? null : c.id); setWallReplyText(''); }}
                                                    className="text-[9px] font-mono text-muted hover:text-brand-accent transition-colors mt-1">Ответить</button>
                                            </div>
                                            <button onClick={() => handleDeleteWallComment(c.id)}
                                                className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 text-[10px] transition-all shrink-0 mt-1">✕</button>
                                        </div>
                                        {/* Replies */}
                                        {(c.replies || []).length > 0 && (
                                            <div className="pl-10 pr-2.5 pb-2 space-y-1.5">
                                                {c.replies!.map(r => (
                                                    <div key={r.id} className="flex items-start gap-2 p-2 bg-surface/30 group/reply">
                                                        <Link to={`/user/${r.author_id}`} className="shrink-0 hover:opacity-80">
                                                            <FramedAvatar avatarUrl={r.author_avatar} username={r.author} size={22} frameKey={r.author_avatar_frame} />
                                                        </Link>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <Link to={`/user/${r.author_id}`} className="text-[9px] font-mono font-bold text-brand-accent hover:underline">{r.author}</Link>
                                                                <span className="text-[8px] font-mono text-muted">{r.timestamp}</span>
                                                            </div>
                                                            <p className="text-[11px] text-text-secondary">{r.text}</p>
                                                        </div>
                                                        <button onClick={() => handleDeleteWallReply(r.id, c.id)}
                                                            className="opacity-0 group-hover/reply:opacity-100 text-muted hover:text-red-400 text-[9px] transition-all shrink-0">✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Reply input */}
                                        {wallReplyingTo === c.id && (
                                            <div className="flex gap-2 px-2.5 pb-2.5 pl-10">
                                                <input type="text" value={wallReplyText} onChange={e => setWallReplyText(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleWallReply(c.id)}
                                                    placeholder="Ваш ответ..." autoFocus
                                                    className="flex-1 bg-base border border-overlay px-2 py-1.5 text-[11px] text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50" />
                                                <button onClick={() => handleWallReply(c.id)} disabled={!wallReplyText.trim()}
                                                    className="px-3 py-1.5 bg-brand text-white text-[10px] font-mono font-bold hover:bg-brand-hover disabled:opacity-30 transition-all shrink-0">↵</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {hasMoreWall && (
                                    <button
                                        onClick={() => loadWallComments(wallOffset, true)}
                                        className="w-full py-2 text-[10px] font-mono font-bold text-[#00FF64]/70 bg-[#0a0a0a] border border-[#00FF64]/20 hover:bg-[#00FF64]/10 transition-all mt-2"
                                    >
                                        [ ЗАГРУЗИТЬ СТАРЫЕ ЛОГИ ] ({wallTotal - wallOffset} ост.)
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-6 font-mono text-[10px]">
                                <p className="text-muted">[ СТЕНА ПУСТА ]</p>
                                <p className="text-muted/50 mt-1">Будьте первым, кто оставит сообщение</p>
                            </div>
                        )}
                    </div>

                    {/* Recent Activity */}
                    {recentHistory.length > 0 && (
                        <div className={`profile-surface-bg border profile-border p-4 sm:p-5 ${blockStyleClass}`}>
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                                <span className="profile-glow-text">▸</span> ПОСЛЕДНЯЯ АКТИВНОСТЬ
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                {recentHistory.map((item: any) => (
                                    <Link to={`/manga/${item.manga.slug || item.manga.id}/chapter/${item.chapterId}`} key={item.manga.id}
                                        className="flex items-center gap-3 p-2.5 bg-base/50 border profile-border hover:bg-surface-hover transition-all group profile-card-hover">
                                        <div className="relative w-10 h-14 shrink-0">
                                            <img src={item.manga.cover} alt={item.manga.title} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <h4 className="text-xs font-medium text-text-primary truncate">{item.manga.title}</h4>
                                            <p className="text-[10px] text-muted mt-0.5 font-mono">
                                                Глава {item.chapter?.chapterNumber || '?'} из {item.totalChapters}
                                            </p>
                                            {/* Progress bar */}
                                            <div className="w-full h-1 bg-overlay mt-1 overflow-hidden">
                                                <div
                                                    className="h-full bg-brand-accent/60"
                                                    style={{ width: `${item.totalChapters > 0 ? (item.chapterIndex / item.totalChapters) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ HEATMAP TOOLTIP (portal-like) ═══ */}
            <AnimatePresence>
                {hoveredHeatmapDay && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="fixed z-[9999] bg-base border border-overlay px-3 py-2 shadow-xl pointer-events-none"
                        style={{ left: hoveredHeatmapDay.x - 30, top: hoveredHeatmapDay.y - 50 }}
                    >
                        <p className="text-[10px] font-mono text-text-primary font-bold">{hoveredHeatmapDay.count} глав</p>
                        <p className="text-[9px] font-mono text-muted">{hoveredHeatmapDay.day}</p>
                    </motion.div>
                )}
            </AnimatePresence>





            </div>
        </div>

        {/* CustomizationDrawer removed — use Shop > Персонализация */}
        <ShopModal
            isOpen={shopModalOpen}
            onClose={() => { setShopModalOpen(false); setPreviewCssVars({}); setPreviewSkinKey(null); setIsPreviewingLocked(false); setPreviewBgUrl(null); setPreviewFrameKey(null); }}
            scrap={currentScrap}
            purchases={myPurchases}
            shopItems={allShopItems}
            onBuy={handleShopBuy}
            onEquip={handleShopEquip}
            onPreview={handleShopPreview}
            onBackgroundPreview={handleBackgroundPreview}
            onFramePreview={handleFramePreview}
            activeChecks={{
                avatarUrl: user.avatar_url || '',
                bannerUrl: user.profile_banner_url || '',
                backgroundUrl: profileBgUrl,
                profileTheme: user.profile_theme || 'base',
                avatarFrame: user.avatar_frame || 'none',
                bio: user.bio || '',
            }}
        />

        {/* Avatar crop modal — portal to body so it's always centered & on top */}
        {cropImageSrc && createPortal(
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[13000] bg-black/85 flex items-center justify-center p-4"
                    onMouseDown={e => { if (e.target === e.currentTarget) setCropImageSrc(null); }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onMouseDown={e => e.stopPropagation()}
                        className="w-full max-w-sm bg-surface border border-overlay shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="px-4 py-3 border-b border-overlay flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-text-primary tracking-wider">ОБРЕЗКА АВАТАРКИ</span>
                            <button onClick={() => setCropImageSrc(null)} className="text-muted hover:text-text-primary text-sm">✕</button>
                        </div>
                        <div className="p-3 bg-base flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                            <ReactCrop
                                crop={crop}
                                onChange={c => setCrop(c)}
                                onComplete={c => setCompletedCrop(c)}
                                aspect={1}
                                circularCrop={false}
                            >
                                <img
                                    ref={cropImgRef}
                                    src={cropImageSrc}
                                    alt="crop"
                                    onLoad={onCropImageLoad}
                                    style={{ maxHeight: '55vh', maxWidth: '100%', display: 'block' }}
                                />
                            </ReactCrop>
                        </div>
                        <div className="px-4 py-3 flex gap-3">
                            <button
                                onClick={() => setCropImageSrc(null)}
                                className="flex-1 py-2.5 text-xs font-mono font-bold bg-base text-text-secondary border border-overlay hover:bg-surface-hover transition-all"
                            >
                                ОТМЕНА
                            </button>
                            <button
                                onClick={handleCropConfirm}
                                disabled={avatarLoading}
                                className="flex-1 py-2.5 text-xs font-mono font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-all"
                            >
                                {avatarLoading ? 'ЗАГРУЗКА...' : 'ПРИМЕНИТЬ'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>,
            document.body
        )}
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const StatRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
    <div className="stat-row-noise flex items-center justify-between text-xs px-2 py-1.5 -mx-2 cursor-default">
        <span className="text-muted font-mono">{label}</span>
        <span className={`font-mono font-bold ${accent ? 'profile-glow-text' : 'text-text-primary'}`}>{value}</span>
    </div>
);

const BadgeTooltip: React.FC<{ show: boolean; ach: Achievement; locked?: boolean; secret?: boolean }> = ({ show, ach, locked, secret }) => (
    <AnimatePresence>
        {show && (
            <motion.div
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-base border border-overlay px-3 py-2 whitespace-nowrap z-50 shadow-xl"
            >
                <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-text-primary">
                        {locked ? '🔒 ' : ''}{secret && locked ? '???' : ach.title}
                    </p>
                    {ach.secret && !locked && <span className="text-[8px] font-mono font-bold text-brand-accent bg-brand-accent/10 px-1">SECRET</span>}
                </div>
                <p className="text-[10px] text-muted">{secret && locked ? 'Секретное достижение' : ach.description}</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-base border-r border-b border-overlay rotate-45 -mt-1" />
            </motion.div>
        )}
    </AnimatePresence>
);

export default ProfilePage;
