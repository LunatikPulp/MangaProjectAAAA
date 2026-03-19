import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/externalApiService';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import FramedAvatar from '../components/FramedAvatar';
import RankBadge from '../components/RankBadge';
import { motion, AnimatePresence } from 'framer-motion';

/* Achievement registry (same as ProfilePage) */
interface Achievement { icon: string; title: string; description: string; rarity: 'common' | 'rare' | 'epic' | 'legendary'; secret?: boolean; }
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
const RARITY_GLOW: Record<string, string> = { common: '', rare: 'badge-glow-rare', epic: 'badge-glow-epic', legendary: 'badge-glow-legendary' };

function heatmapColor(count: number): string {
    if (count === 0) return 'rgba(255,255,255,0.06)';
    if (count <= 2) return 'rgba(169,255,0,0.2)';
    if (count <= 5) return 'rgba(169,255,0,0.4)';
    if (count <= 10) return 'rgba(169,255,0,0.6)';
    return 'rgba(169,255,0,0.85)';
}
function generateHeatmapDays(): string[] {
    const days: string[] = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(d.toISOString().split('T')[0]); }
    return days;
}

interface WallComment {
    id: number;
    author_id: number;
    author: string;
    author_avatar?: string;
    author_avatar_frame?: string;
    text: string;
    timestamp: string;
    replies?: WallReply[];
}
interface WallReply {
    id: number;
    author_id: number;
    author: string;
    author_avatar?: string;
    author_avatar_frame?: string;
    text: string;
    timestamp: string;
}

const UserProfilePage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const { user: currentUser } = useContext(AuthContext);
    const { showToaster } = useContext(ToasterContext);
    const navigate = useNavigate();
    const token = localStorage.getItem('backend_token');

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isFriend, setIsFriend] = useState(false);
    const [iBlocked, setIBlocked] = useState(false);
    const [theyBlocked, setTheyBlocked] = useState(false);
    const [friendLoading, setFriendLoading] = useState(false);

    // Wall
    const [wallComments, setWallComments] = useState<WallComment[]>([]);
    const [wallInput, setWallInput] = useState('');
    const [wallLoading, setWallLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<number | null>(null);
    const [replyText, setReplyText] = useState('');

    // Heatmap tooltip
    const [hoveredDay, setHoveredDay] = useState<{ day: string; count: number; x: number; y: number } | null>(null);
    const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
    const [bannerImgError, setBannerImgError] = useState(false);


    const heatmapDays = useMemo(() => generateHeatmapDays(), []);

    const isOwnProfile = currentUser?.id === Number(userId);

    // Redirect to own profile page
    useEffect(() => {
        if (isOwnProfile) navigate('/profile', { replace: true });
    }, [isOwnProfile, navigate]);

    // Load profile
    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        fetch(`${API_BASE}/users/${userId}/profile-full`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => setProfile(data))
            .catch(() => setProfile(null))
            .finally(() => setLoading(false));
    }, [userId]);

    // Check friendship & block
    useEffect(() => {
        if (!token || !userId) return;
        fetch(`${API_BASE}/friends/check/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(d => setIsFriend(d.is_friend)).catch(() => {});
        fetch(`${API_BASE}/blocks/check/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(d => { setIBlocked(d.i_blocked); setTheyBlocked(d.they_blocked); }).catch(() => {});
    }, [token, userId]);

    // Load wall comments with replies
    useEffect(() => {
        if (!userId) return;
        fetch(`${API_BASE}/auth/wall-comments/${userId}/with-replies`)
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setWallComments(data); })
            .catch(() => {});
    }, [userId]);

    const toggleFriend = async () => {
        if (!token || !userId) return;
        setFriendLoading(true);
        try {
            const res = await fetch(`${API_BASE}/friends/${userId}`, { method: isFriend ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { setIsFriend(!isFriend); showToaster(isFriend ? 'Удалён из друзей' : 'Добавлен в друзья!'); }
        } catch {}
        setFriendLoading(false);
    };

    const toggleBlock = async () => {
        if (!token || !userId) return;
        try {
            const res = await fetch(`${API_BASE}/blocks/${userId}`, { method: iBlocked ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                setIBlocked(!iBlocked);
                if (!iBlocked) { setIsFriend(false); showToaster('Добавлен в чёрный список'); }
                else { showToaster('Убран из чёрного списка'); }
            }
        } catch {}
    };

    const handleWallComment = async () => {
        if (!wallInput.trim() || !token || !userId) return;
        setWallLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/wall-comments/${userId}`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: wallInput.trim() }),
            });
            if (res.ok) {
                const c = await res.json();
                setWallComments(prev => [{ ...c, replies: [] }, ...prev]);
                setWallInput('');
            }
        } catch {}
        setWallLoading(false);
    };

    const handleReply = async (commentId: number) => {
        if (!replyText.trim() || !token) return;
        try {
            const res = await fetch(`${API_BASE}/auth/wall-comments/${commentId}/reply`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: replyText.trim() }),
            });
            if (res.ok) {
                const r = await res.json();
                setWallComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: [...(c.replies || []), r] } : c));
                setReplyText('');
                setReplyingTo(null);
            }
        } catch {}
    };

    const handleDeleteWallComment = async (id: number) => {
        if (!token) return;
        try {
            await fetch(`${API_BASE}/auth/wall-comments/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            setWallComments(prev => prev.filter(c => c.id !== id));
        } catch {}
    };

    const handleDeleteReply = async (replyId: number, commentId: number) => {
        if (!token) return;
        try {
            await fetch(`${API_BASE}/auth/wall-replies/${replyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            setWallComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: (c.replies || []).filter(r => r.id !== replyId) } : c));
        } catch {}
    };

    const bannerSrcEarly = profile?.profile_banner_url ? (profile.profile_banner_url.startsWith('http') ? profile.profile_banner_url : `${API_BASE}${profile.profile_banner_url}`) : '';

    // Set body background from user's banner (exact same logic as ProfilePage)
    useEffect(() => {
        if (!profile || !bannerSrcEarly) return;
        const root = document.getElementById('root');
        const origHtmlBgImage = document.documentElement.style.backgroundImage;
        const origHtmlBgSize = document.documentElement.style.backgroundSize;
        const origHtmlBgPosition = document.documentElement.style.backgroundPosition;
        const origHtmlBgAttachment = document.documentElement.style.backgroundAttachment;
        const origHtmlBgRepeat = document.documentElement.style.backgroundRepeat;
        const origHtmlBgColor = document.documentElement.style.backgroundColor;
        const origBodyBgImage = document.body.style.backgroundImage;
        const origBodyBgRepeat = document.body.style.backgroundRepeat;
        const origBodyBgSize = document.body.style.backgroundSize;
        const origBodyBgPosition = document.body.style.backgroundPosition;
        const origBodyBg = document.body.style.backgroundColor;
        const origRootBg = root?.style.backgroundColor || '';

        document.body.style.backgroundColor = 'transparent';
        if (root) root.style.backgroundColor = 'transparent';

        const isVid = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(bannerSrcEarly);

        if (!isVid) {
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundImage = `linear-gradient(rgba(18,18,18,0.72), rgba(18,18,18,0.72)), url(${bannerSrcEarly})`;
            document.documentElement.style.backgroundSize = 'cover';
            document.documentElement.style.backgroundPosition = 'center';
            document.documentElement.style.backgroundAttachment = 'fixed';
            document.documentElement.style.backgroundRepeat = 'no-repeat';
            document.documentElement.style.backgroundColor = '#121212';
        }

        // For video — inject a fixed video element behind #root
        let videoBg: HTMLDivElement | null = null;
        if (isVid) {
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
                <video src="${bannerSrcEarly}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(18,18,18,0.72);pointer-events:none;"></div>
            `;
            document.body.insertBefore(videoBg, document.body.firstChild);

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
    }, [profile, bannerSrcEarly]);

    if (loading) return <div className="max-w-6xl mx-auto px-4 py-16 text-center"><div className="animate-pulse text-muted font-mono">Загрузка...</div></div>;
    if (!profile) return <div className="max-w-6xl mx-auto px-4 py-16 text-center"><p className="text-muted font-mono">Пользователь не найден</p><Link to="/" className="text-brand-accent text-sm font-mono mt-4 inline-block">← На главную</Link></div>;

    const bannerSrc = profile.profile_banner_url ? (profile.profile_banner_url.startsWith('http') ? profile.profile_banner_url : `${API_BASE}${profile.profile_banner_url}`) : '';
    const avatarSrc = profile.avatar_url ? (profile.avatar_url.startsWith('http') ? profile.avatar_url : `${API_BASE}${profile.avatar_url}`) : '';
    const badges: string[] = profile.badge_ids || [];
    const heatmap: Record<string, number> = profile.heatmap || {};
    const level = profile.level || 1;
    const xp = profile.xp || 0;
    const xpCurrentLevel = profile.xp_current_level || 0;
    const xpNextLevel = profile.xp_next_level || 50;
    const xpProgress = xpNextLevel > xpCurrentLevel ? ((xp - xpCurrentLevel) / (xpNextLevel - xpCurrentLevel)) * 100 : 100;
    const corruption = profile.corruption || 0;
    const corruptionLabel = corruption >= 75 ? 'КРИТИЧЕСКИЙ' : corruption >= 50 ? 'ПОВЫШЕННЫЙ' : corruption >= 25 ? 'УМЕРЕННЫЙ' : 'СИСТЕМА В НОРМЕ';
    const corruptionColor = corruption >= 75 ? '#FF2020' : corruption >= 50 ? '#FF8800' : corruption >= 25 ? '#FFD700' : '#00FF64';
    const genderLabel = (g: string) => g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : '';
    const formatBirthday = (b: string) => { if (!b) return ''; try { return new Date(b).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return b; } };

    const isPrivate = profile.private_profile && !isOwnProfile;

    return (
        <div data-profile-theme={profile.profile_theme || 'base'}>
            <div className="max-w-6xl mx-auto px-2 sm:px-4 relative z-[1]">

            {/* Back button */}
            <div className="flex items-center gap-3 mb-4 pt-4">
                <button onClick={() => navigate(-1)} className="text-muted hover:text-text-primary transition-colors text-sm font-mono">← Назад</button>
            </div>

            {/* HEADER CARD */}
            <div className="relative z-[1] mb-6 border profile-border bg-surface/60 backdrop-blur-md overflow-visible">
                {/* Banner */}
                {bannerSrc && !/\.(mp4|webm|ogg|mov)(\?|$)/i.test(bannerSrc) && !bannerImgError && (
                    <div className="relative h-32 sm:h-44 overflow-hidden profile-scanlines">
                        <img src={bannerSrc} alt="" className="w-full h-full object-cover" onError={() => setBannerImgError(true)} />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
                    </div>
                )}
                <div className="relative z-[4] px-4 sm:px-8 py-6 sm:py-8">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6">
                        {/* Avatar */}
                        <div className="shrink-0 glitch-avatar" style={{ marginTop: bannerSrc && !/\.(mp4|webm|ogg|mov)(\?|$)/i.test(bannerSrc) && !bannerImgError ? '-3rem' : undefined }}>
                            <FramedAvatar
                                avatarUrl={avatarSrc}
                                username={profile.username}
                                size={112}
                                frameKey={profile.avatar_frame}
                            />
                        </div>

                        {/* Name & meta */}
                        <div className="flex-1 text-center sm:text-left min-w-0">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 flex-wrap">
                                <h1 className="text-2xl sm:text-3xl font-display font-bold text-text-primary spring-glitch truncate">{profile.username}</h1>
                                <RankBadge chaptersRead={profile.stats?.chapters_read || 0} size="md" />
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 shrink-0 ${
                                    profile.role === 'admin' ? 'bg-brand-accent/20 text-brand-accent' :
                                    profile.role === 'moderator' ? 'bg-brand/20 text-brand' :
                                    'profile-badge-bg profile-accent-text'
                                }`}>
                                    {profile.role === 'admin' ? 'ADMIN' : profile.role === 'moderator' ? 'MOD' : `LVL ${level}`}
                                </span>
                            </div>
                            {/* XP bar */}
                            <div className="flex items-center gap-3 mb-2 max-w-md mx-auto sm:mx-0">
                                <div className="flex-1 h-5 bg-base border border-overlay relative overflow-hidden">
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(xpProgress, 100)}%` }} transition={{ duration: 1.2, ease: 'easeOut' }}
                                        className="h-full relative" style={{ background: 'linear-gradient(90deg, rgba(169,255,0,0.3), rgba(169,255,0,0.8))' }}>
                                        <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)' }} />
                                    </motion.div>
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-text-primary mix-blend-difference">{xp} / {xpNextLevel} XP</span>
                                </div>
                                <span className="text-xs font-mono font-bold profile-glow-text shrink-0">LV.{level}</span>
                            </div>
                            {profile.bio && <p className="text-text-secondary text-sm mt-1 line-clamp-2 max-w-lg mx-auto sm:mx-0">{profile.bio}</p>}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2 text-[10px] text-muted font-mono">
                                {profile.gender && genderLabel(profile.gender) && <span className="bg-overlay px-2 py-0.5">{genderLabel(profile.gender)}</span>}
                                {profile.birthday && <span className="bg-overlay px-2 py-0.5">{formatBirthday(profile.birthday)}</span>}
                                <span className="bg-overlay px-2 py-0.5">📖 {profile.stats?.chapters_read || 0} глав</span>
                                <span className="bg-overlay px-2 py-0.5">🔖 {profile.stats?.total_bookmarks || 0} закладок</span>
                            </div>
                        </div>

                        {/* Action buttons */}
                        {currentUser && !isOwnProfile && (
                            <div className="flex items-center gap-2 shrink-0">
                                {!iBlocked && !theyBlocked && (
                                    <>
                                        {isFriend ? (
                                            <button onClick={toggleFriend} disabled={friendLoading}
                                                className={`w-10 h-10 flex items-center justify-center text-lg transition-all border rounded border-red-500/30 text-red-400 hover:bg-red-500/10 ${friendLoading ? 'opacity-50' : ''}`}
                                                title="Удалить из друзей">
                                                🗑
                                            </button>
                                        ) : (
                                            <button onClick={toggleFriend} disabled={friendLoading}
                                                className={`px-4 py-2.5 text-xs font-mono font-bold transition-all border bg-brand text-white hover:bg-brand-hover border-brand-hover ${friendLoading ? 'opacity-50' : ''}`}>
                                                + Добавить в друзья
                                            </button>
                                        )}
                                        <Link to={`/messages/${userId}`}
                                            className="px-4 py-2.5 text-xs font-mono font-bold bg-overlay text-text-primary hover:bg-surface-hover border border-overlay transition-all">
                                            ✉ Написать
                                        </Link>
                                    </>
                                )}
                                <div className="relative group/block">
                                    <button onClick={toggleBlock}
                                        className={`w-10 h-10 flex items-center justify-center text-lg transition-all border rounded ${
                                            iBlocked ? 'border-red-500/30 text-red-400 hover:bg-red-500/10 bg-red-500/5' : 'border-overlay text-muted hover:text-red-400 hover:border-red-500/30'
                                        }`}>
                                        {iBlocked ? '🔓' : '🚫'}
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-base border border-overlay text-[10px] font-mono text-text-primary whitespace-nowrap opacity-0 group-hover/block:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                        {iBlocked ? 'Убрать из ЧС' : 'Добавить в ЧС'}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-base border-r border-b border-overlay rotate-45 -mt-1" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {theyBlocked && (
                <div className="text-center py-16"><p className="text-muted font-mono text-sm">🚫 Этот пользователь заблокировал вас</p></div>
            )}

            {isPrivate && !theyBlocked && (
                <div className="text-center py-16"><p className="text-muted font-mono text-sm">🔒 Профиль скрыт</p></div>
            )}

            {!isPrivate && !theyBlocked && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                {/* LEFT COLUMN */}
                <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
                    {/* System Data */}
                    <div className="profile-surface-bg border profile-border p-4">
                        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                            <span className="profile-glow-text">■</span> СИСТЕМНЫЕ ДАННЫЕ
                        </h3>
                        <div className="space-y-2.5">
                            <StatRow label="Уровень" value={`${level}`} accent />
                            <StatRow label="Опыт" value={`${xp} XP`} />
                            <StatRow label="Глав прочитано" value={`${profile.stats?.chapters_read || 0}`} />
                            <StatRow label="Лайков" value={`${profile.stats?.total_likes || 0}`} />
                            <StatRow label="Оценок" value={`${profile.stats?.total_ratings || 0}`} />
                            <StatRow label="Закладок" value={`${profile.stats?.total_bookmarks || 0}`} />
                            <StatRow label="Ачивок" value={`${badges.length}/${Object.keys(ACHIEVEMENTS).length}`} />
                        </div>
                    </div>

                    {/* Friends */}
                    <div className="profile-surface-bg border profile-border p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> ДРУЗЬЯ
                                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent/20 text-brand-accent text-[9px] font-mono font-bold">{profile.stats?.friends || 0}</span>
                            </h3>
                        </div>
                        {(profile.friends || []).length > 0 ? (
                            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                                {profile.friends.map((f: any) => (
                                    <Link to={`/user/${f.id}`} key={f.id} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group" style={{ minWidth: '56px' }}>
                                        <FramedAvatar avatarUrl={f.avatar_url} username={f.username} size={36} frameKey={f.avatar_frame} />
                                        <span className="text-[8px] font-mono text-muted group-hover:text-text-primary transition-colors truncate w-full text-center">{f.username}</span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center py-3 font-mono text-[9px] text-muted">[ НЕТ ДРУЗЕЙ ]</p>
                        )}
                    </div>

                    {/* Bookmark status breakdown */}
                    {(profile.bookmarks || []).length > 0 && (
                        <div className="profile-surface-bg border profile-border p-4">
                            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                                <span className="profile-glow-text">■</span> СТАТУСЫ ЗАКЛАДОК
                            </h3>
                            <div className="space-y-1.5">
                                {Object.entries(
                                    (profile.bookmarks as any[]).reduce((acc: Record<string, number>, b: any) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {})
                                ).map(([s, count]) => (
                                    <div key={s} className="flex items-center justify-between text-xs">
                                        <span className="text-text-secondary font-mono">{s}</span>
                                        <span className="text-text-primary font-mono font-bold">{count as number}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent comments */}
                    <div className="profile-surface-bg border profile-border p-4">
                        <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                            <span className="profile-glow-text">■</span> КОММЕНТАРИИ
                            <span className="ml-1 text-[9px] text-muted">{profile.stats?.comments || 0}</span>
                        </h3>
                        {(profile.recent_comments || []).length > 0 ? (
                            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                                {profile.recent_comments.map((c: any, i: number) => (
                                    <Link to={`/manga/${c.manga_id}`} key={i} className="block p-2 bg-base/50 border profile-border hover:bg-surface-hover transition-all text-[10px] font-mono">
                                        <span className="text-brand-accent truncate block text-[9px]">{c.manga_title}</span>
                                        <span className="text-text-secondary truncate block">{c.text.length > 50 ? c.text.slice(0, 50) + '...' : c.text}</span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center py-3 font-mono text-[9px] text-muted">[ ПУСТО ]</p>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">

                    {/* Activity heatmap */}
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">⚡</span>Активность чтения
                        </h3>
                        <div className="relative overflow-x-auto scrollbar-hide">
                            <div className="inline-grid gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gridAutoColumns: '11px' }}>
                                {heatmapDays.map(day => {
                                    const count = heatmap[day] || 0;
                                    return (
                                        <div key={day} className="w-[11px] h-[11px] rounded-[2px] cursor-default transition-all hover:scale-150 hover:z-10 relative"
                                            style={{ backgroundColor: heatmapColor(count), boxShadow: count > 5 ? `0 0 6px rgba(169,255,0,${Math.min(count/20, 0.6)})` : 'none' }}
                                            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoveredDay({ day, count, x: r.left, y: r.top }); }}
                                            onMouseLeave={() => setHoveredDay(null)} />
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2 mt-3 text-[10px] text-muted font-mono">
                                <span>Меньше</span>
                                {[0, 2, 5, 10, 15].map(n => <div key={n} className="w-[11px] h-[11px] rounded-[2px]" style={{ backgroundColor: heatmapColor(n) }} />)}
                                <span>Больше</span>
                            </div>
                        </div>
                    </div>

                    {/* Bookmarks */}
                    {(profile.bookmarks || []).length > 0 && (
                        <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                                    <span className="profile-glow-text">🔖</span>Закладки
                                    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-brand-accent/20 text-brand-accent text-[9px] font-mono font-bold">{profile.stats?.total_bookmarks || 0}</span>
                                </h3>
                                <Link to={`/user/${userId}/bookmarks`} className="text-[10px] font-mono text-muted hover:text-brand-accent transition-colors flex items-center gap-1">
                                    Подробнее <span className="text-xs">›</span>
                                </Link>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                                {(profile.bookmarks as any[]).slice(0, 5).map((b: any) => {
                                    const coverSrc = b.cover ? (b.cover.startsWith('http') ? b.cover : `${API_BASE}${b.cover}`) : '';
                                    return (
                                        <Link to={`/manga/${b.manga_id}`} key={b.manga_id} className="group relative">
                                            <div className="aspect-[2/3] overflow-hidden border profile-border relative profile-card-hover">
                                                {coverSrc ? (
                                                    <img src={coverSrc} alt={b.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full bg-overlay flex items-center justify-center text-muted text-xs font-mono">No cover</div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-[9px] font-mono font-bold text-white truncate">{b.title}</p>
                                                    <p className="text-[8px] font-mono text-white/60">{b.status}</p>
                                                    <span className="inline-block mt-1 text-[8px] font-mono font-bold text-brand-accent bg-brand-accent/20 px-1.5 py-0.5">Подробнее →</span>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Achievements */}
                    <div className="profile-surface-bg border profile-border p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                                <span className="profile-glow-text">🔓</span>Достижения
                            </h3>
                            <span className="text-[10px] text-muted font-mono">{badges.length}/{Object.keys(ACHIEVEMENTS).length}</span>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-9 gap-3">
                            {badges.map((badgeId, idx) => {
                                const ach = ACHIEVEMENTS[badgeId];
                                if (!ach) return null;
                                return (
                                    <div key={badgeId} className={`relative group cursor-default flex flex-col items-center gap-1.5 achievement-glitch-in achievement-delay-${Math.min(idx, 9)}`}
                                        onMouseEnter={() => setHoveredBadge(badgeId)} onMouseLeave={() => setHoveredBadge(null)}>
                                        <div className={`w-16 h-16 sm:w-[72px] sm:h-[72px] overflow-hidden broken-frame-sm ${RARITY_GLOW[ach.rarity]} border profile-border transition-all duration-200 group-hover:scale-110 group-hover:-translate-y-1`}>
                                            <img src={ach.icon} alt={ach.title} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-[9px] font-mono text-text-secondary text-center truncate w-full">{ach.title}</span>
                                        <BadgeTooltip show={hoveredBadge === badgeId} ach={ach} />
                                    </div>
                                );
                            })}
                            {Object.entries(ACHIEVEMENTS).filter(([id]) => !badges.includes(id)).map(([id, ach]) => (
                                <div key={id} className="relative group cursor-default flex flex-col items-center gap-1.5"
                                    onMouseEnter={() => setHoveredBadge(id)} onMouseLeave={() => setHoveredBadge(null)}>
                                    <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] overflow-hidden broken-frame-sm border profile-border bg-base/30 opacity-25 grayscale transition-all duration-200 group-hover:opacity-40 flex items-center justify-center">
                                        {ach.secret ? <span className="text-2xl">❓</span> : <img src={ach.icon} alt={ach.title} className="w-full h-full object-cover" />}
                                    </div>
                                    <span className="text-[9px] font-mono text-muted/40 text-center truncate w-full">{ach.secret ? '???' : ach.title}</span>
                                    <BadgeTooltip show={hoveredBadge === id} ach={ach} locked secret={ach.secret} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Corruption Level */}
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">☣</span>УРОВЕНЬ ЗАРАЖЕНИЯ
                        </h3>
                        <div className="relative">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-muted">0%</span>
                                <span className={`text-xs font-mono font-bold ${corruption >= 50 ? 'corruption-pulse' : ''}`} style={{ color: corruptionColor }}>{corruptionLabel}</span>
                                <span className="text-[10px] font-mono text-muted">100%</span>
                            </div>
                            <div className="h-6 bg-base border border-overlay relative overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${corruption}%` }} transition={{ duration: 1.5, ease: 'easeOut' }}
                                    className="h-full relative" style={{ background: `linear-gradient(90deg, rgba(0,255,100,0.3), ${corruptionColor}90)`, boxShadow: corruption >= 50 ? `0 0 15px ${corruptionColor}40` : 'none' }}>
                                    <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 4px)' }} />
                                </motion.div>
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white mix-blend-difference">{corruption}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Profile Wall */}
                    <div className="profile-surface-bg border profile-border p-4 sm:p-5">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-text-primary mb-4 flex items-center gap-2">
                            <span className="profile-glow-text">💬</span>Стена профиля
                        </h3>
                        {/* Write comment */}
                        {currentUser && !iBlocked && !theyBlocked && (
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={wallInput} onChange={e => setWallInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleWallComment()}
                                    placeholder="Написать на стене..."
                                    className="flex-1 bg-base border border-overlay px-3 py-2 text-xs text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50 transition-colors" />
                                <button onClick={handleWallComment} disabled={!wallInput.trim() || wallLoading}
                                    className="px-4 py-2 bg-brand text-white text-xs font-mono font-bold hover:bg-brand-hover disabled:opacity-30 transition-all shrink-0">
                                    {wallLoading ? '...' : '▸'}
                                </button>
                            </div>
                        )}
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
                                                <div className="flex items-center gap-3 mt-1">
                                                    {currentUser && (
                                                        <button onClick={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(''); }}
                                                            className="text-[9px] font-mono text-muted hover:text-brand-accent transition-colors">Ответить</button>
                                                    )}
                                                </div>
                                            </div>
                                            {currentUser && (c.author_id === currentUser.id || Number(userId) === currentUser.id || currentUser.role === 'admin') && (
                                                <button onClick={() => handleDeleteWallComment(c.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 text-[10px] transition-all shrink-0 mt-1">✕</button>
                                            )}
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
                                                        {currentUser && (r.author_id === currentUser.id || Number(userId) === currentUser.id || currentUser.role === 'admin') && (
                                                            <button onClick={() => handleDeleteReply(r.id, c.id)}
                                                                className="opacity-0 group-hover/reply:opacity-100 text-muted hover:text-red-400 text-[9px] transition-all shrink-0">✕</button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Reply input */}
                                        {replyingTo === c.id && currentUser && (
                                            <div className="flex gap-2 px-2.5 pb-2.5 pl-10">
                                                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleReply(c.id)}
                                                    placeholder="Ваш ответ..." autoFocus
                                                    className="flex-1 bg-base border border-overlay px-2 py-1.5 text-[11px] text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50" />
                                                <button onClick={() => handleReply(c.id)} disabled={!replyText.trim()}
                                                    className="px-3 py-1.5 bg-brand text-white text-[10px] font-mono font-bold hover:bg-brand-hover disabled:opacity-30 transition-all shrink-0">↵</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 font-mono text-[10px]">
                                <p className="text-muted">[ СТЕНА ПУСТА ]</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Heatmap tooltip */}
            <AnimatePresence>
                {hoveredDay && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="fixed z-[9999] bg-base border border-overlay px-3 py-2 shadow-xl pointer-events-none"
                        style={{ left: hoveredDay.x - 30, top: hoveredDay.y - 50 }}>
                        <p className="text-[10px] font-mono text-text-primary font-bold">{hoveredDay.count} глав</p>
                        <p className="text-[9px] font-mono text-muted">{hoveredDay.day}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            </div>
        </div>
    );
};

const StatRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
    <div className="stat-row-noise flex items-center justify-between text-xs px-2 py-1.5 -mx-2 cursor-default">
        <span className="text-muted font-mono">{label}</span>
        <span className={`font-mono font-bold ${accent ? 'profile-glow-text' : 'text-text-primary'}`}>{value}</span>
    </div>
);

const BadgeTooltip: React.FC<{ show: boolean; ach: Achievement; locked?: boolean; secret?: boolean }> = ({ show, ach, locked, secret }) => (
    <AnimatePresence>
        {show && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-base border border-overlay px-3 py-2 whitespace-nowrap z-50 shadow-xl">
                <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-text-primary">{locked ? '🔒 ' : ''}{secret && locked ? '???' : ach.title}</p>
                    {ach.secret && !locked && <span className="text-[8px] font-mono font-bold text-brand-accent bg-brand-accent/10 px-1">SECRET</span>}
                </div>
                <p className="text-[10px] text-muted">{secret && locked ? 'Секретное достижение' : ach.description}</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-base border-r border-b border-overlay rotate-45 -mt-1" />
            </motion.div>
        )}
    </AnimatePresence>
);

export default UserProfilePage;
