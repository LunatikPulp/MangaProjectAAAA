import React, { useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useBookmarks } from '../hooks/useBookmarks';
import { useHistory } from '../hooks/useHistory';
import { MangaContext } from '../contexts/MangaContext';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import FramedAvatar from '../components/FramedAvatar';
import Modal from '../components/Modal';
import { ToasterContext } from '../contexts/ToasterContext';
import RankBadge from '../components/RankBadge';
import ProfilePageSkeleton from '../components/skeletons/ProfilePageSkeleton';
import { BookmarkStatus } from '../types';
import { API_BASE } from '../services/externalApiService';
import { motion, AnimatePresence } from 'framer-motion';
import { AVATAR_FRAMES } from '../config/avatarFrames';

type EditTab = 'profile' | 'security' | 'notifications' | 'content' | 'appearance';

/* ═══════════════════════════════════════════════════════════════
   ACHIEVEMENT REGISTRY
   ═══════════════════════════════════════════════════════════════ */
interface Achievement {
    icon: string;
    title: string;
    description: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    secret?: boolean;
}

const ACHIEVEMENTS: Record<string, Achievement> = {
    first_login:  { icon: '/Achievement Icons/first_login.png',  title: 'Первый вход',      description: 'Добро пожаловать в SPRINGMANGA',       rarity: 'common' },
    reader_10:    { icon: '/Achievement Icons/reader_10.png',     title: 'Читатель',          description: 'Прочитано 10 глав',                    rarity: 'common' },
    reader_50:    { icon: '/Achievement Icons/reader_50.png',     title: 'Книжный червь',     description: 'Прочитано 50 глав',                    rarity: 'rare' },
    reader_100:   { icon: '/Achievement Icons/reader_100.png',    title: 'Мастер чтения',     description: 'Прочитано 100 глав',                   rarity: 'epic' },
    reader_500:   { icon: '/Achievement Icons/reader_500.png',    title: 'Легенда',           description: 'Прочитано 500 глав',                   rarity: 'legendary' },
    bookworm:     { icon: '/Achievement Icons/bookworm.png',      title: 'Коллекционер',      description: '10 манг в закладках',                  rarity: 'rare' },
    collector:    { icon: '/Achievement Icons/collector.png',      title: 'Собиратель',         description: '50 манг в закладках',                  rarity: 'epic' },
    critic:       { icon: '/Achievement Icons/critic.png',         title: 'Критик',            description: 'Оценено 5 манг',                       rarity: 'rare' },
    judge:        { icon: '/Achievement Icons/judge.png',          title: 'Верховный судья',   description: 'Оценено 20 манг',                      rarity: 'epic' },
    social:       { icon: '/Achievement Icons/social.png',         title: 'Социальный',        description: 'Заполнил биографию',                   rarity: 'common' },
    stylist:      { icon: '/Achievement Icons/stylist.png',        title: 'Стилист',           description: 'Изменил тему профиля',                 rarity: 'epic' },
    decorator:    { icon: '/Achievement Icons/decorator.png',      title: 'Декоратор',         description: 'Загрузил баннер профиля',              rarity: 'rare' },
    night_guard:  { icon: '/Achievement Icons/night_guard.png',    title: 'Ночной охранник',   description: 'Зашёл на сайт между 00:00 и 05:00',   rarity: 'legendary', secret: true },
    five_nights:  { icon: '/Achievement Icons/five_nights.png',    title: 'Пять ночей',        description: 'Читал мангу в 5 разных дней',          rarity: 'epic', secret: true },
    marathon:     { icon: '/Achievement Icons/marathon.png',       title: 'Марафонщик',        description: '20+ глав за один день',                rarity: 'epic', secret: true },
    early_bird:   { icon: '/Achievement Icons/early_bird.png',     title: 'Ранняя пташка',     description: 'Зашёл с 5:00 до 7:00 утра',           rarity: 'rare', secret: true },
    halloween:    { icon: '/Achievement Icons/halloween.png',      title: 'Хэллоуинский дух',  description: 'Зашёл 31 октября',                     rarity: 'legendary', secret: true },
    new_year:     { icon: '/Achievement Icons/new_year.png',       title: 'Новогоднее чудо',   description: 'Зашёл в новогоднюю ночь',              rarity: 'legendary', secret: true },
};

const RARITY_GLOW_CLASS: Record<string, string> = {
    common: '',
    rare: 'badge-glow-rare',
    epic: 'badge-glow-epic',
    legendary: 'badge-glow-legendary',
};

/* AVATAR_FRAMES — imported from ../config/avatarFrames */

/* ═══════════════════════════════════════════════════════════════
   THEME CONFIG (CSS variables in index.css do the heavy lifting)
   ═══════════════════════════════════════════════════════════════ */
const PROFILE_THEMES = {
    base: {
        name: 'Base',
        subtitle: 'Стандартная тема «Springtrap»',
        description: 'Классическая палитра заброшенной пиццерии',
        bannerGradient: 'from-brand/30 via-brand/10 to-brand-accent/20',
        previewColors: ['#7A8755', '#A9FF00', '#121212'],
    },
    neon: {
        name: 'Neon',
        subtitle: 'Токсичное свечение',
        description: 'Кислотный неон повреждённых систем',
        bannerGradient: 'from-[#A9FF00]/30 via-[#A9FF00]/5 to-brand/20',
        previewColors: ['#A9FF00', '#7FFF00', '#141814'],
    },
    corroded: {
        name: 'Corroded',
        subtitle: 'Ржавый распад',
        description: 'Коррозия и распад — тёмная сторона',
        bannerGradient: 'from-[#8B5E3C]/40 via-[#8B5E3C]/15 to-[#3D2B1F]/30',
        previewColors: ['#8B5E3C', '#C17A4A', '#171311'],
    },
};

/* ═══════════════════════════════════════════════════════════════
   HEATMAP HELPERS
   ═══════════════════════════════════════════════════════════════ */
function isVideo(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg') || lower.includes('video');
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
    const { user, updateUser, deleteAccount, loading: authLoading } = useContext(AuthContext);
    const { bookmarks } = useBookmarks();
    const { history } = useHistory();
    const { getMangaById, mangaList, fetchMangaById, loading: mangaLoading } = useContext(MangaContext);
    const { showToaster } = useContext(ToasterContext);
    const navigate = useNavigate();

    // UI state
    const [isEditOpen, setEditOpen] = useState(false);
    const [editTab, setEditTab] = useState<EditTab>('profile');
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
    const [hoveredHeatmapDay, setHoveredHeatmapDay] = useState<{ day: string; count: number; x: number; y: number } | null>(null);

    // Profile form
    const [newUsername, setNewUsername] = useState('');
    const [newAbout, setNewAbout] = useState('');
    const [newBio, setNewBio] = useState('');
    const [newBirthday, setNewBirthday] = useState('');
    const [newGender, setNewGender] = useState('');
    const [previewTheme, setPreviewTheme] = useState<'base' | 'neon' | 'corroded'>('base');
    const [previewFrame, setPreviewFrame] = useState('none');

    // Security
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);

    // Content/privacy
    const [newEroticFilter, setNewEroticFilter] = useState('hide');
    const [newPrivateProfile, setNewPrivateProfile] = useState(false);
    const [newAllowTrades, setNewAllowTrades] = useState(true);

    // Notifications
    const [newNotifyEmail, setNewNotifyEmail] = useState(true);
    const [newNotifyVk, setNewNotifyVk] = useState(false);
    const [newNotifyTelegram, setNewNotifyTelegram] = useState(false);



    // Loadings
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [bannerLoading, setBannerLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);

    // Rich profile data from /auth/profile-full
    const [profileData, setProfileData] = useState<any>(null);
    const [badges, setBadges] = useState<string[]>([]);

    // Easter egg: avatar click counter for glitch
    const [_avatarClicks, setAvatarClicks] = useState(0);
    const avatarClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showGlitchOverlay, setShowGlitchOverlay] = useState(false);

    // Konami code easter egg
    const [, setKonamiProgress] = useState(0);
    const [konamiUnlocked, setKonamiUnlocked] = useState(false);
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

    const favoriteGenres = useMemo(() => {
        const genreCounts = bookmarks.reduce((acc, b) => {
            const manga = getMangaById(b.mangaId);
            if (manga) manga.genres.forEach(g => { acc[g] = (acc[g] || 0) + 1; });
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    }, [bookmarks, getMangaById]);

    // Corruption Level — based on genres read
    const corruptionData = useMemo(() => {
        const darkGenres = ['Хоррор', 'Ужасы', 'Трагедия', 'Психология', 'Триллер', 'Драма', 'Тёмное фэнтези', 'Мистика', 'Детектив'];
        const lightGenres = ['Комедия', 'Повседневность', 'Романтика', 'Сёнэн', 'Школа', 'Спорт'];
        let darkCount = 0, lightCount = 0, totalGenres = 0;
        bookmarks.forEach(b => {
            const manga = getMangaById(b.mangaId);
            if (manga) {
                manga.genres.forEach(g => {
                    totalGenres++;
                    if (darkGenres.some(dg => g.toLowerCase().includes(dg.toLowerCase()))) darkCount++;
                    if (lightGenres.some(lg => g.toLowerCase().includes(lg.toLowerCase()))) lightCount++;
                });
            }
        });
        if (totalGenres === 0) return { level: 0, label: 'НЕТ ДАННЫХ', color: '#666' };
        const ratio = (darkCount - lightCount * 0.5) / Math.max(totalGenres, 1);
        const corruption = Math.max(0, Math.min(100, Math.round((ratio + 0.3) * 100)));
        if (corruption >= 75) return { level: corruption, label: 'КРИТИЧЕСКИЙ', color: '#FF2020' };
        if (corruption >= 50) return { level: corruption, label: 'ПОВЫШЕННЫЙ', color: '#FF8800' };
        if (corruption >= 25) return { level: corruption, label: 'УМЕРЕННЫЙ', color: '#FFD700' };
        return { level: corruption, label: 'СИСТЕМА В НОРМЕ', color: '#00FF64' };
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
        const token = localStorage.getItem('backend_token');
        if (!token) return;
        fetch(`${API_BASE}/friends`, { headers: { Authorization: `Bearer ${token}` } })
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

    // Load wall comments from backend with replies
    useEffect(() => {
        if (!user?.id) return;
        fetch(`${API_BASE}/auth/wall-comments/${user.id}/with-replies`)
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setWallComments(data); })
            .catch(() => {});
    }, [user?.id]);

    const handleWallComment = async () => {
        if (!wallInput.trim() || !user?.id) return;
        setWallLoading(true);
        try {
            const token = localStorage.getItem('backend_token');
            const res = await fetch(`${API_BASE}/auth/wall-comments/${user.id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: wallInput.trim() }),
            });
            if (res.ok) {
                const newComment = await res.json();
                setWallComments(prev => [newComment, ...prev]);
                setWallInput('');
                showToaster('Комментарий добавлен!');
            } else {
                showToaster('Ошибка отправки');
            }
        } catch { showToaster('Ошибка сети'); }
        finally { setWallLoading(false); }
    };

    const handleDeleteWallComment = async (id: number) => {
        try {
            const token = localStorage.getItem('backend_token');
            await fetch(`${API_BASE}/auth/wall-comments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setWallComments(prev => prev.filter(c => c.id !== id));
        } catch { showToaster('Ошибка удаления'); }
    };

    const handleWallReply = async (commentId: number) => {
        if (!wallReplyText.trim()) return;
        try {
            const token = localStorage.getItem('backend_token');
            const res = await fetch(`${API_BASE}/auth/wall-comments/${commentId}/reply`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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
            const token = localStorage.getItem('backend_token');
            await fetch(`${API_BASE}/auth/wall-replies/${replyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setWallComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: (c.replies || []).filter(r => r.id !== replyId) } : c));
        } catch { showToaster('Ошибка удаления'); }
    };

    // XP tooltip
    const [showXpTooltip, setShowXpTooltip] = useState(false);

    // User comments from server
    const [userComments, setUserComments] = useState<{ text: string; mangaId: string; mangaTitle: string; cover: string; timestamp: string }[]>([]);
    useEffect(() => {
        if (!user) return;
        const token = localStorage.getItem('backend_token');
        if (!token) return;
        fetch(`${API_BASE}/auth/my-comments`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.ok ? res.json() : [])
            .then((data: { id: number; mangaId: string; chapterId?: string; text: string; timestamp: string }[]) => {
                setUserComments(data.map(c => {
                    const manga = getMangaById(c.mangaId);
                    return {
                        text: c.text,
                        mangaId: c.mangaId,
                        mangaTitle: manga?.title || c.mangaId,
                        cover: manga?.cover || '',
                        timestamp: c.timestamp,
                    };
                }));
            })
            .catch(() => {});
    }, [user, getMangaById]);

    // Bookmarked manga for "add to showcase/favorites"
    const bookmarkedManga = useMemo(() => {
        return bookmarks.map(b => ({ ...b, manga: getMangaById(b.mangaId) })).filter(b => b.manga);
    }, [bookmarks, getMangaById]);



    // Theme keys
    const currentThemeKey = user?.profile_theme || 'base';
    const activeThemeKey = isEditOpen && editTab === 'appearance' ? previewTheme : currentThemeKey;

    // Current frame
    const currentFrame = user?.avatar_frame || 'none';
    const activeFrame = isEditOpen && editTab === 'appearance' ? previewFrame : currentFrame;
    const frameImage = AVATAR_FRAMES[activeFrame]?.image || null;

    // Heatmap data
    const heatmap: Record<string, number> = profileData?.heatmap || {};
    const heatmapDays = useMemo(() => generateHeatmapDays(), []);

    // Gamification
    const xp = profileData?.gamification?.xp ?? (user?.xp || 0);
    const level = profileData?.gamification?.level ?? (user?.level || 1);
    const xpCurrentLevel = profileData?.gamification?.xp_current_level ?? 0;
    const xpNextLevel = profileData?.gamification?.xp_next_level ?? 50;
    const xpProgress = xpNextLevel > xpCurrentLevel ? ((xp - xpCurrentLevel) / (xpNextLevel - xpCurrentLevel)) * 100 : 100;



    // Load profile-full + check achievements
    useEffect(() => {
        if (!user) return;
        try { setBadges(JSON.parse(user.badge_ids || '[]')); } catch { setBadges([]); }


        const token = localStorage.getItem('backend_token');
        if (!token) return;

        // Fetch full profile
        fetch(`${API_BASE}/auth/profile-full`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setProfileData(data);
                if (data.user?.badge_ids) setBadges(data.user.badge_ids);

            })
            .catch(() => {});

        // Check achievements
        fetch(`${API_BASE}/auth/check-achievements`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.badges) setBadges(data.badges);
                if (data.new_badges?.length > 0) {
                    data.new_badges.forEach((b: string) => {
                        const ach = ACHIEVEMENTS[b];
                        if (ach) showToaster(`🎉 Новая ачивка: ${ach.title}!`);
                    });
                }
            })
            .catch(() => {});

        // Sync XP
        fetch(`${API_BASE}/auth/sync-xp`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        }).then(r => r.json()).then(data => {
            if (data.level_up) showToaster(`⚡ Уровень повышен! Теперь вы ${data.level} ур.`);
        }).catch(() => {});
    }, [user?.id]);

    // Konami code listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            setKonamiProgress(prev => {
                const expected = KONAMI_CODE[prev];
                if (e.code === expected) {
                    const next = prev + 1;
                    if (next === KONAMI_CODE.length) {
                        setKonamiUnlocked(true);
                        showToaster('🎮 СЕКРЕТНАЯ АЧИВКА РАЗБЛОКИРОВАНА: Konami Master!');
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

    // Avatar 5-click glitch
    const handleAvatarClick = useCallback(() => {
        setAvatarClicks(prev => {
            const next = prev + 1;
            if (avatarClickTimer.current) clearTimeout(avatarClickTimer.current);
            avatarClickTimer.current = setTimeout(() => setAvatarClicks(0), 1500);
            if (next >= 5) {
                setShowGlitchOverlay(true);
                setTimeout(() => setShowGlitchOverlay(false), 500);
                return 0;
            }
            return next;
        });
    }, []);

    // Cleanup typewriter timer on unmount
    useEffect(() => () => { if (typewriterTimer.current) clearTimeout(typewriterTimer.current); }, []);



    if (authLoading || mangaLoading) return <ProfilePageSkeleton />;
    if (!user) return <div className="text-center p-8 font-mono text-muted">[ ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН ]</div>;

    const avatarSrc = user.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`) : '';
    const bannerSrc = user.profile_banner_url ? (user.profile_banner_url.startsWith('http') ? user.profile_banner_url : `${API_BASE}${user.profile_banner_url}`) : '';
    
    console.log('=== PROFILE PAGE DEBUG ===');
    console.log('user:', user);
    console.log('user.profile_banner_url:', user.profile_banner_url);
    console.log('bannerSrc:', bannerSrc);
    console.log('API_BASE:', API_BASE);

    const openEdit = (tab: EditTab = 'profile') => {
        setNewUsername(user.username);
        setNewAbout(user.about || '');
        setNewBio(user.bio || '');
        setNewBirthday(user.birthday || '');
        setNewGender(user.gender || '');
        setNewEroticFilter(user.erotic_filter || 'hide');
        setNewPrivateProfile(user.private_profile || false);
        setNewAllowTrades(user.allow_trades !== false);
        setNewNotifyEmail(user.notify_email !== false);
        setNewNotifyVk(user.notify_vk || false);
        setNewNotifyTelegram(user.notify_telegram || false);
        setPreviewTheme((user.profile_theme || 'base') as 'base' | 'neon' | 'corroded');
        setPreviewFrame(user.avatar_frame || 'none');
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        setNewEmail(''); setEmailPassword('');
        setEditTab(tab);
        setEditOpen(true);
    };

    const handleSaveProfile = async () => {
        if (!newUsername.trim()) return;
        setProfileSaving(true);
        await updateUser({
            username: newUsername, about: newAbout, birthday: newBirthday,
            gender: newGender, erotic_filter: newEroticFilter as any,
            private_profile: newPrivateProfile, allow_trades: newAllowTrades,
            notify_email: newNotifyEmail, notify_vk: newNotifyVk, notify_telegram: newNotifyTelegram,
            bio: newBio,
        });
        setProfileSaving(false);
        setEditOpen(false);
        showToaster('Профиль обновлен!');
    };

    const handleSaveAppearance = async () => {
        setProfileSaving(true);
        await updateUser({ profile_theme: previewTheme, avatar_frame: previewFrame } as any);
        setProfileSaving(false);
        setEditOpen(false);
        showToaster('Внешний вид обновлен!');
    };

    const handlePasswordChange = async () => {
        if (!oldPassword || !newPassword) return;
        if (newPassword.length < 6) { showToaster('Минимум 6 символов'); return; }
        if (newPassword !== confirmPassword) { showToaster('Пароли не совпадают'); return; }
        setPasswordLoading(true);
        try {
            const token = localStorage.getItem('backend_token');
            const res = await fetch(`${API_BASE}/auth/password`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
            });
            if (res.ok) { showToaster('Пароль изменен!'); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }
            else { const err = await res.json().catch(() => ({})); showToaster(err.detail || 'Ошибка'); }
        } catch { showToaster('Ошибка сети'); }
        finally { setPasswordLoading(false); }
    };

    const handleEmailChange = async () => {
        if (!newEmail || !emailPassword) return;
        setEmailLoading(true);
        try {
            const token = localStorage.getItem('backend_token');
            const res = await fetch(`${API_BASE}/auth/email`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: emailPassword, new_email: newEmail }),
            });
            if (res.ok) { showToaster('Email изменен!'); updateUser({ email: newEmail }); setNewEmail(''); setEmailPassword(''); }
            else { const err = await res.json().catch(() => ({})); showToaster(err.detail || 'Ошибка'); }
        } catch { showToaster('Ошибка сети'); }
        finally { setEmailLoading(false); }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarLoading(true);
        try {
            const token = localStorage.getItem('backend_token');
            const formData = new FormData(); formData.append('file', file);
            const res = await fetch(`${API_BASE}/auth/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (res.ok) { const data = await res.json(); updateUser({ avatar_url: data.avatar_url, avatar: data.avatar_url }); showToaster('Аватарка обновлена!'); }
            else { showToaster('Ошибка загрузки'); }
        } catch { showToaster('Ошибка сети'); }
        finally { setAvatarLoading(false); }
    };

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBannerLoading(true);
        try {
            const token = localStorage.getItem('backend_token');
            const formData = new FormData(); formData.append('file', file);
            const res = await fetch(`${API_BASE}/auth/banner`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (res.ok) { 
                const data = await res.json(); 
                await updateUser({ profile_banner_url: data.banner_url } as any); 
                showToaster('Баннер обновлен!'); 
            }
            else { showToaster('Ошибка загрузки'); }
        } catch (err) { 
            console.error('Banner upload error:', err);
            showToaster('Ошибка сети'); 
        }
        finally { setBannerLoading(false); }
    };

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

    const tabs: { key: EditTab; label: string; icon: string }[] = [
        { key: 'profile', label: 'Профиль', icon: '👤' },
        { key: 'appearance', label: 'Стиль', icon: '🎨' },
        { key: 'security', label: 'Безопасность', icon: '🔒' },
        { key: 'content', label: 'Контент', icon: '⚙️' },
        { key: 'notifications', label: 'Уведомления', icon: '🔔' },
    ];

    /* ═══════════════════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════════════════ */
    // Set body background image/video — cleanup on unmount
    useEffect(() => {
        const root = document.getElementById('root');

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

        document.body.style.backgroundColor = 'transparent';
        if (root) root.style.backgroundColor = 'transparent';

        if (bannerSrc && !isVideo(bannerSrc)) {
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundImage = `linear-gradient(rgba(18,18,18,0.72), rgba(18,18,18,0.72)), url(${bannerSrc})`;
            document.documentElement.style.backgroundSize = 'cover';
            document.documentElement.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundAttachment = 'fixed';
            document.documentElement.style.backgroundRepeat = 'no-repeat';
            document.documentElement.style.backgroundColor = '#121212';
        } else if (!bannerSrc) {
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
        }

        // For video — inject a fixed video element behind #root
        let videoBg: HTMLDivElement | null = null;
        if (bannerSrc && isVideo(bannerSrc)) {
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
                <video src="${bannerSrc}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(18,18,18,0.72);pointer-events:none;"></div>
            `;
            document.body.insertBefore(videoBg, document.body.firstChild);
            
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
            const vid = document.getElementById('profile-video-bg');
            if (vid) vid.remove();
        };
    }, [bannerSrc]);

    return (
        <div data-profile-theme={activeThemeKey}>

            {/* Background upload button (floating) */}
            <div className="fixed top-20 right-4 z-[50] group">
                <label className="bg-black/60 backdrop-blur-sm text-white text-xs font-mono px-3 py-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all hover:bg-black/80 flex items-center gap-1.5">
                    📷 {bannerLoading ? '...' : 'Фон / Видео'}
                    <input type="file" accept="image/*,video/mp4,video/webm,video/ogg" className="hidden" onChange={handleBannerUpload} disabled={bannerLoading} />
                </label>
            </div>

            {/* ═══ MAIN CONTENT ═══ */}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 relative z-[1]">

            {/* ═══ HEADER CARD (over fixed background) ═══ */}
            <div className="relative z-[1] mb-6 border profile-border bg-surface/60 backdrop-blur-md">

                {/* Profile info */}
                <div className="relative z-[4] px-4 sm:px-8 py-6 sm:py-8">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">

                        {/* Avatar with frame + glitch */}
                        <div className="relative group shrink-0 glitch-avatar overflow-visible" style={{ width: frameImage ? '10rem' : undefined, height: frameImage ? '10rem' : undefined }} onClick={handleAvatarClick}>
                            <div className="rounded-full overflow-hidden border-4 border-surface transition-all duration-500" style={frameImage ? { position: 'absolute', top: '50%', left: '50%', width: '70%', height: '70%', transform: 'translate(-50%, -50%)' } : { width: '7rem', height: '7rem' }}>
                                {avatarSrc ? (
                                    <img src={avatarSrc} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <Avatar name={user.avatar || user.username} size={144} />
                                )}
                            </div>
                            {frameImage && (
                                <img src={frameImage} alt="frame" className="absolute inset-0 w-full h-full pointer-events-none z-[5] transition-all duration-1000" style={{ objectFit: 'fill' }} />
                            )}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-all z-10" onClick={e => e.stopPropagation()}>
                                <span className="text-white text-xs font-mono">{avatarLoading ? '...' : '📷'}</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarLoading} />
                            </label>
                            {/* Online dot */}
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-brand-accent rounded-full border-2 border-surface z-10" />
                        </div>

                        {/* Name + Level + Meta */}
                        <div className="flex-1 text-center sm:text-left min-w-0">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-text-primary spring-glitch truncate max-w-[300px] sm:max-w-none">{user.username}</h1>
                                <RankBadge chaptersRead={profileData?.stats?.chapters_read ?? totalChaptersRead} size="md" />
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 shrink-0 ${
                                    user.role === 'admin' ? 'bg-brand-accent/20 text-brand-accent' :
                                    user.role === 'moderator' ? 'bg-brand/20 text-brand' :
                                    'profile-badge-bg profile-accent-text'
                                }`}>
                                    {user.role === 'admin' ? 'ADMIN' : user.role === 'moderator' ? 'MOD' : `LVL ${level}`}
                                </span>
                            </div>

                            {/* XP Progress Bar — "System Battery" */}
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
                                        className="h-full relative"
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

                        {/* Action buttons — "industrial metal switches" */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => openEdit('profile')}
                                className="px-4 py-2.5 text-xs font-mono font-bold bg-brand text-white hover:bg-brand-hover transition-all active:scale-95 border border-brand-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.2)]">
                                ⚙ НАСТРОЙКИ
                            </button>
                            {(user.role === 'admin' || user.role === 'moderator') && (
                                <Link to={user.role === 'admin' ? '/admin' : '/moderator'}
                                    className="px-4 py-2.5 text-xs font-mono font-bold bg-overlay text-text-primary hover:bg-surface-hover transition-all border border-overlay shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-2px_0_rgba(0,0,0,0.2)]">
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
                    <div className="profile-surface-bg border profile-border p-4">
                        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                            <span className="profile-glow-text">■</span> СИСТЕМНЫЕ ДАННЫЕ
                        </h3>
                        <div className="space-y-2.5">
                            <StatRow label="Уровень" value={`${level}`} accent />
                            <StatRow label="Опыт" value={`${xp} XP`} />
                            <StatRow label="Глав прочитано" value={`${profileData?.stats?.chapters_read ?? totalChaptersRead}`} />
                            <StatRow label="Лайков" value={`${profileData?.stats?.total_likes ?? 0}`} />
                            <StatRow label="Оценок" value={`${profileData?.stats?.total_ratings ?? 0}`} />
                            <StatRow label="Закладок" value={`${profileData?.stats?.total_bookmarks ?? bookmarks.length}`} />
                            <StatRow label="Ачивок" value={`${badges.length}/${Object.keys(ACHIEVEMENTS).length}`} />
                        </div>
                    </div>

                    {/* Friends — horizontal scroll, swipeable */}
                    <div className="profile-surface-bg border profile-border p-4">
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
                        <div className="profile-surface-bg border profile-border p-4">
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

                    {/* Favorite Genres */}
                    {favoriteGenres.length > 0 && (
                        <div className="profile-surface-bg border profile-border p-4">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> ЛЮБИМЫЕ ЖАНРЫ
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {favoriteGenres.map(g => (
                                    <span key={g} className="text-[10px] font-mono px-2 py-1 profile-badge-bg border profile-border text-text-secondary">{g}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* My Comments — compact sidebar block */}
                    <div className="profile-surface-bg border profile-border p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> МОИ КОММЕНТАРИИ
                            </h3>
                            <span className="text-[9px] text-muted font-mono">{userComments.length}</span>
                        </div>
                        {userComments.length > 0 ? (
                            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                                {userComments.map((c, i) => (
                                    <div key={i} className="p-2 bg-base/50 border profile-border hover:bg-surface-hover transition-all text-[10px] font-mono">
                                        <span className="text-brand-accent truncate block text-[9px]">{c.mangaTitle}</span>
                                        <span className="text-text-secondary truncate block">{c.text.length > 50 ? c.text.slice(0, 50) + '...' : c.text}</span>
                                    </div>
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
                        <div className="profile-surface-bg border profile-border p-4 sm:p-5 relative overflow-hidden group scan-line-effect">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                                <span className="profile-glow-text">📡</span>ПОСЛЕДНИЙ РАСШИФРОВАННЫЙ ФАЙЛ
                            </h3>
                            <Link to={`/manga/${lastReadItem.manga.id}/chapter/${lastReadItem.chapterId}`} className="flex gap-4 items-center">
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
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
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

                    {/* Section 2: Bookmarks (Закладки) */}
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
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
                                        <Link to={`/manga/${b.manga!.id}`}>
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
                    <div className="profile-surface-bg border profile-border p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                                <span className="profile-glow-text">🔓</span>Достижения
                            </h3>
                            <span className="text-[10px] text-muted font-mono">{badges.length}/{Object.keys(ACHIEVEMENTS).length}</span>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 gap-3">
                            {/* Unlocked */}
                            {badges.map((badgeId, idx) => {
                                const ach = ACHIEVEMENTS[badgeId];
                                if (!ach) return null;
                                return (
                                    <div key={badgeId} className={`relative group cursor-default flex flex-col items-center gap-1.5 achievement-glitch-in achievement-delay-${Math.min(idx, 9)}`}
                                        onMouseEnter={() => setHoveredBadge(badgeId)} onMouseLeave={() => setHoveredBadge(null)}>
                                        <div className={`w-16 h-16 sm:w-[72px] sm:h-[72px] overflow-hidden
                                            broken-frame-sm ${RARITY_GLOW_CLASS[ach.rarity]}
                                            border profile-border
                                            transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1`}>
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
                                        broken-frame-sm border profile-border bg-base/30 opacity-25 grayscale
                                        transition-all duration-200 group-hover:opacity-40 flex items-center justify-center">
                                        {ach.secret ? <span className="text-2xl">❓</span> : <img src={ach.icon} alt={ach.title} className="w-full h-full object-cover" />}
                                    </div>
                                    <span className="text-[9px] font-mono text-muted/40 text-center truncate w-full">{ach.secret ? '???' : ach.title}</span>
                                    <BadgeTooltip show={hoveredBadge === id} ach={ach} locked secret={ach.secret} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Corruption Level ☣️ */}
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
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
                            <div className="h-6 bg-base border border-overlay relative overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${corruptionData.level}%` }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                    className="h-full relative"
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
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">💬</span>Стена профиля
                        </h3>
                        {/* Write comment */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={wallInput}
                                onChange={e => setWallInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleWallComment()}
                                placeholder="Написать на стене..."
                                className="flex-1 bg-base border border-overlay px-3 py-2 text-xs text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50 transition-colors"
                            />
                            <button
                                onClick={handleWallComment}
                                disabled={!wallInput.trim() || wallLoading}
                                className="px-4 py-2 bg-brand text-white text-xs font-mono font-bold hover:bg-brand-hover disabled:opacity-30 transition-all shrink-0"
                            >
                                {wallLoading ? '...' : '▸'}
                            </button>
                        </div>
                        {/* Comments list */}
                        {wallComments.length > 0 ? (
                            <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
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
                        <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                                <span className="profile-glow-text">▸</span> ПОСЛЕДНЯЯ АКТИВНОСТЬ
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                {recentHistory.map((item: any) => (
                                    <Link to={`/manga/${item.manga.id}/chapter/${item.chapterId}`} key={item.manga.id}
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

            {/* ═══ EDIT PANEL ═══ */}
            <AnimatePresence>
                {isEditOpen && (
                    <div className="fixed inset-0 z-[11000] flex">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
                        <motion.div
                            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="relative ml-auto w-full max-w-xl bg-surface h-full overflow-y-auto shadow-2xl border-l border-overlay">
                            {/* Header */}
                            <div className="sticky top-0 bg-surface/95 backdrop-blur-md z-10 border-b border-overlay px-6 py-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-sm font-mono font-bold text-text-primary uppercase tracking-widest">⚙ НАСТРОЙКИ</h2>
                                    <button onClick={() => setEditOpen(false)} className="w-8 h-8 bg-overlay flex items-center justify-center text-muted hover:text-text-primary transition-colors">✕</button>
                                </div>
                                <div className="flex gap-1 mt-3 bg-overlay p-1 overflow-x-auto scrollbar-hide">
                                    {tabs.map(t => (
                                        <button key={t.key} onClick={() => setEditTab(t.key)}
                                            className={`flex-shrink-0 text-[10px] font-mono font-medium py-2 px-2 sm:px-3 transition-all ${
                                                editTab === t.key ? 'bg-surface text-brand-accent shadow-sm' : 'text-muted hover:text-text-secondary'
                                            }`}>
                                            {t.icon} {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6">
                                {/* PROFILE TAB */}
                                {editTab === 'profile' && (
                                    <div className="space-y-5">
                                        <SectionTitle>Основная информация</SectionTitle>
                                        <InputField label="Имя пользователя" value={newUsername} onChange={setNewUsername} />
                                        <div>
                                            <label className="text-xs font-mono font-medium text-muted block mb-1.5">Био <span className="text-muted/50">({newBio.length}/500)</span></label>
                                            <textarea value={newBio} onChange={e => setNewBio(e.target.value.slice(0, 500))} rows={3}
                                                placeholder="Краткое описание..."
                                                className="w-full bg-base border border-overlay p-3 text-sm text-text-primary placeholder:text-muted/50 resize-none focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent transition-colors font-mono" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-mono font-medium text-muted block mb-1.5">Дата рождения</label>
                                                <input type="date" value={newBirthday} onChange={e => setNewBirthday(e.target.value)}
                                                    className="w-full bg-base border border-overlay p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition-colors" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-mono font-medium text-muted block mb-1.5">Пол</label>
                                                <select value={newGender} onChange={e => setNewGender(e.target.value)}
                                                    className="w-full bg-base border border-overlay p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition-colors">
                                                    <option value="">Не указан</option>
                                                    <option value="male">Мужской</option>
                                                    <option value="female">Женский</option>
                                                </select>
                                            </div>
                                        </div>
                                        <button onClick={handleSaveProfile} disabled={profileSaving}
                                            className="w-full py-3 bg-brand text-white font-mono font-bold hover:bg-brand-hover disabled:opacity-50 transition-all active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.2)]">
                                            {profileSaving ? '...' : 'СОХРАНИТЬ'}
                                        </button>
                                    </div>
                                )}

                                {/* APPEARANCE TAB */}
                                {editTab === 'appearance' && (
                                    <div className="space-y-6">
                                        <SectionTitle>Тема профиля</SectionTitle>
                                        <div className="grid grid-cols-1 gap-3">
                                            {(Object.keys(PROFILE_THEMES) as Array<keyof typeof PROFILE_THEMES>).map(key => {
                                                const t = PROFILE_THEMES[key];
                                                const sel = previewTheme === key;
                                                return (
                                                    <button key={key} onClick={() => setPreviewTheme(key)}
                                                        className={`relative p-4 border-2 text-left transition-all ${sel ? 'border-brand-accent bg-brand-accent/5' : 'border-overlay hover:border-muted bg-base'}`}>
                                                        <div className={`h-10 mb-3 bg-gradient-to-r ${t.bannerGradient} relative overflow-hidden profile-scanlines`}>
                                                            <div className="absolute bottom-1 right-2 flex gap-1">
                                                                {t.previewColors.map((c, i) => <div key={i} className="w-4 h-4 border border-white/20" style={{ backgroundColor: c }} />)}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-mono font-bold text-text-primary">{t.name}</p>
                                                                <p className="text-[10px] text-muted font-mono">{t.description}</p>
                                                            </div>
                                                            {sel && <div className="w-5 h-5 bg-brand-accent flex items-center justify-center shrink-0"><span className="text-black text-xs">✓</span></div>}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="border-t border-overlay pt-4">
                                            <SectionTitle>Рамка аватара</SectionTitle>
                                            <p className="text-[10px] text-muted font-mono mb-3">Рамки открываются по мере повышения уровня</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {Object.entries(AVATAR_FRAMES).map(([key, frame]) => {
                                                    const sel = previewFrame === key;
                                                    const locked = level < frame.requiredLevel;
                                                    return (
                                                        <button key={key}
                                                            onClick={() => !locked && setPreviewFrame(key)}
                                                            disabled={locked}
                                                            className={`p-3 border-2 text-center transition-all ${
                                                                sel ? 'border-brand-accent bg-brand-accent/5' :
                                                                locked ? 'border-overlay/30 bg-base/30 opacity-40 cursor-not-allowed' :
                                                                'border-overlay hover:border-muted bg-base'
                                                            }`}>
                                                            {/* Mini avatar preview with frame */}
                                                            {!locked && frame.image ? (
                                                                <div className="relative mx-auto mb-2" style={{ width: 56, height: 56 }}>
                                                                    <div className="rounded-full bg-overlay absolute" style={{ width: '70%', height: '70%', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                                                                    <img src={frame.image} alt={frame.name} className="absolute inset-0 w-full h-full pointer-events-none" style={{ objectFit: 'fill' }} />
                                                                </div>
                                                            ) : (
                                                                <div className="w-12 h-12 mx-auto rounded-full bg-overlay mb-2" />
                                                            )}
                                                            <p className="text-[10px] font-mono font-bold text-text-primary">{frame.name}</p>
                                                            {locked && <p className="text-[9px] font-mono text-muted">🔒 Ур. {frame.requiredLevel}</p>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="border-t border-overlay pt-4">
                                            <SectionTitle>Баннер профиля</SectionTitle>
                                            <label className="flex items-center justify-center p-6 border-2 border-dashed border-overlay hover:border-brand-accent/50 bg-base cursor-pointer transition-all group mt-3">
                                                <div className="text-center">
                                                    <p className="text-2xl mb-1">📷</p>
                                                    <p className="text-xs text-muted font-mono">{bannerLoading ? 'Загрузка...' : 'Загрузить баннер или видео'}</p>
                                                    <p className="text-[10px] text-muted/50 font-mono mt-1">JPG, PNG, GIF, WEBP, MP4, WEBM</p>
                                                </div>
                                                <input type="file" accept="image/*,video/mp4,video/webm,video/ogg" className="hidden" onChange={handleBannerUpload} disabled={bannerLoading} />
                                            </label>
                                        </div>

                                        <button onClick={handleSaveAppearance} disabled={profileSaving}
                                            className="w-full py-3 bg-brand-accent text-black font-mono font-bold hover:shadow-[0_0_20px_rgba(169,255,0,0.3)] disabled:opacity-50 transition-all active:scale-[0.98]">
                                            {profileSaving ? '...' : 'ПРИМЕНИТЬ'}
                                        </button>
                                    </div>
                                )}

                                {/* SECURITY TAB */}
                                {editTab === 'security' && (
                                    <div className="space-y-6">
                                        <div>
                                            <SectionTitle>Сменить email</SectionTitle>
                                            <p className="text-xs text-muted mb-3 font-mono">Текущий: {user.email}</p>
                                            <div className="space-y-3">
                                                <InputField label="Новый email" value={newEmail} onChange={setNewEmail} type="email" />
                                                <InputField label="Пароль" value={emailPassword} onChange={setEmailPassword} type="password" />
                                                <button onClick={handleEmailChange} disabled={emailLoading || !newEmail || !emailPassword}
                                                    className="w-full py-2.5 bg-overlay text-text-primary text-sm font-mono font-medium hover:bg-surface-hover disabled:opacity-50 transition-colors">
                                                    {emailLoading ? '...' : 'СМЕНИТЬ'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="border-t border-overlay" />
                                        <div>
                                            <SectionTitle>Сменить пароль</SectionTitle>
                                            <div className="space-y-3">
                                                <InputField label="Текущий" value={oldPassword} onChange={setOldPassword} type="password" />
                                                <InputField label="Новый" value={newPassword} onChange={setNewPassword} type="password" />
                                                <InputField label="Повтор" value={confirmPassword} onChange={setConfirmPassword} type="password" />
                                                <button onClick={handlePasswordChange} disabled={passwordLoading || !oldPassword || !newPassword}
                                                    className="w-full py-2.5 bg-overlay text-text-primary text-sm font-mono font-medium hover:bg-surface-hover disabled:opacity-50 transition-colors">
                                                    {passwordLoading ? '...' : 'СМЕНИТЬ'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="border-t border-overlay" />
                                        <div className="bg-red-500/5 border border-red-500/20 p-4">
                                            <h3 className="text-[10px] font-mono font-bold text-red-400/80 mb-2 uppercase tracking-widest">⚠ DANGER ZONE</h3>
                                            <p className="text-[10px] text-muted font-mono mb-3">Это действие необратимо. Все данные будут удалены.</p>
                                            <button onClick={() => setDeleteModalOpen(true)}
                                                className="px-4 py-2 text-[10px] font-mono font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors">
                                                УДАЛИТЬ АККАУНТ
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* CONTENT TAB */}
                                {editTab === 'content' && (
                                    <div className="space-y-5">
                                        <SectionTitle>Контент и приватность</SectionTitle>
                                        <div>
                                            <label className="text-xs font-mono font-medium text-muted block mb-1.5">Фильтр эротики</label>
                                            <select value={newEroticFilter} onChange={e => setNewEroticFilter(e.target.value)}
                                                className="w-full bg-base border border-overlay p-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition-colors">
                                                <option value="hide">Скрывать</option>
                                                <option value="show">Показывать</option>
                                                <option value="hentai_only">Только хентай</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <Toggle label="Закрытый профиль" description="Скрыть от других" checked={newPrivateProfile} onChange={setNewPrivateProfile} />
                                            <Toggle label="Обмены" description="Разрешить предложения обмена" checked={newAllowTrades} onChange={setNewAllowTrades} />
                                        </div>
                                        <button onClick={handleSaveProfile} disabled={profileSaving}
                                            className="w-full py-3 bg-brand text-white font-mono font-bold hover:bg-brand-hover disabled:opacity-50 transition-all active:scale-[0.98]">
                                            {profileSaving ? '...' : 'СОХРАНИТЬ'}
                                        </button>
                                    </div>
                                )}

                                {/* NOTIFICATIONS TAB */}
                                {editTab === 'notifications' && (
                                    <div className="space-y-5">
                                        <SectionTitle>Уведомления</SectionTitle>
                                        <div className="space-y-3">
                                            <Toggle label="Email" description="На почту" checked={newNotifyEmail} onChange={setNewNotifyEmail} />
                                            <Toggle label="ВКонтакте" description="В VK" checked={newNotifyVk} onChange={setNewNotifyVk} />
                                            <Toggle label="Telegram" description="В Telegram" checked={newNotifyTelegram} onChange={setNewNotifyTelegram} />
                                        </div>
                                        <button onClick={handleSaveProfile} disabled={profileSaving}
                                            className="w-full py-3 bg-brand text-white font-mono font-bold hover:bg-brand-hover disabled:opacity-50 transition-all active:scale-[0.98]">
                                            {profileSaving ? '...' : 'СОХРАНИТЬ'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Удалить аккаунт"
                onConfirm={() => { deleteAccount(); setDeleteModalOpen(false); showToaster('Аккаунт удален.'); navigate('/'); }}
                confirmText="Да, удалить">
                <p className="text-text-secondary">Вы уверены? Все данные будут безвозвратно удалены.</p>
            </Modal>



            {/* Glitch overlay easter egg */}
            {showGlitchOverlay && <div className="full-glitch-overlay" />}

            {/* Konami code secret badge indicator */}
            {konamiUnlocked && (
                <div className="fixed bottom-4 right-4 z-[9999] bg-base border border-brand-accent/50 px-4 py-2 font-mono text-xs text-brand-accent shadow-[0_0_20px_rgba(169,255,0,0.3)]">
                    🎮 KONAMI MASTER — Секретная ачивка получена!
                </div>
            )}

            </div>
        </div>
    );
};

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-sm font-mono font-bold text-text-primary tracking-wider uppercase">{children}</h3>
);

const InputField: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }> = ({ label, value, onChange, type = 'text', placeholder }) => (
    <div>
        <label className="text-xs font-mono font-medium text-muted block mb-1.5">{label}</label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className="w-full bg-base border border-overlay p-3 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent transition-colors font-mono" />
    </div>
);

const Toggle: React.FC<{ label: string; description: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, description, checked, onChange }) => (
    <label className="flex items-center justify-between p-3 bg-base cursor-pointer hover:bg-overlay/50 transition-colors">
        <div>
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-[10px] text-muted font-mono">{description}</p>
        </div>
        <div className={`relative w-11 h-6 transition-colors ${checked ? 'bg-brand-accent' : 'bg-overlay'}`}
            onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </div>
    </label>
);

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
