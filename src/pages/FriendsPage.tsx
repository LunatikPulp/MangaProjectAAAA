import React, { useMemo, useContext, useState, useEffect, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import FramedAvatar from '../components/FramedAvatar';
import { API_BASE } from '../services/externalApiService';

interface FriendUser {
    id: number;
    username: string;
    avatar_url: string;
    avatar_frame: string;
    level: number;
    bio: string;
}

interface PublicUser {
    id: number;
    username: string;
    avatar_url: string;
    avatar_frame: string;
    level: number;
    bio: string;
    profile_theme: string;
}

const FriendsPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const token = localStorage.getItem('backend_token');
    const [tab, setTab] = useState<'friends' | 'search'>('friends');
    const [friends, setFriends] = useState<FriendUser[]>([]);
    const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
    const [search, setSearch] = useState('');
    const [friendSearch, setFriendSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [friendIds, setFriendIds] = useState<Set<number>>(new Set());

    // Load friends
    const loadFriends = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/friends`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data: FriendUser[] = await res.json();
                setFriends(data);
                setFriendIds(new Set(data.map(f => f.id)));
            }
        } catch {}
    }, [token]);

    useEffect(() => { loadFriends(); }, [loadFriends]);

    // Search users
    useEffect(() => {
        if (tab !== 'search' || !search.trim()) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_BASE}/users?q=${encodeURIComponent(search)}&limit=20`);
                if (res.ok) {
                    const data = await res.json();
                    // Filter out self
                    setSearchResults(data.users.filter((u: PublicUser) => u.id !== user?.id));
                }
            } catch {}
            setLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, tab, user?.id]);

    const addFriend = async (userId: number) => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/friends/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                await loadFriends();
            }
        } catch {}
    };

    const removeFriend = async (userId: number) => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/friends/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                await loadFriends();
            }
        } catch {}
    };

    const filteredFriends = useMemo(() => {
        if (!friendSearch.trim()) return friends;
        const q = friendSearch.toLowerCase();
        return friends.filter(f => f.username.toLowerCase().includes(q));
    }, [friends, friendSearch]);

    if (!user) return <div className="text-center p-8 font-mono text-muted">[ АВТОРИЗУЙТЕСЬ ]</div>;

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link to="/profile" className="text-muted hover:text-text-primary transition-colors text-sm font-mono">
                    ← Профиль
                </Link>
            </div>

            <div className="profile-surface-bg border profile-border p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                    <h1 className="text-lg font-mono font-bold text-text-primary flex items-center gap-2">
                        👥 Друзья
                        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-brand-accent/20 text-brand-accent text-xs font-mono font-bold">
                            {friends.length}
                        </span>
                    </h1>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-overlay p-1 mb-5">
                    {([
                        { key: 'friends' as const, label: `Мои друзья (${friends.length})` },
                        { key: 'search' as const, label: '🔍 Найти людей' },
                    ]).map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 text-xs font-mono py-2 transition-all ${
                                tab === t.key ? 'bg-surface text-brand-accent shadow-sm' : 'text-muted hover:text-text-secondary'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Friends tab */}
                {tab === 'friends' && (
                    <>
                        <input
                            type="text"
                            value={friendSearch}
                            onChange={e => setFriendSearch(e.target.value)}
                            placeholder="Поиск среди друзей..."
                            className="w-full bg-base border border-overlay px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50 transition-colors mb-4"
                        />

                        {filteredFriends.length > 0 ? (
                            <div className="space-y-2">
                                {filteredFriends.map(f => (
                                    <div key={f.id} className="flex items-center gap-3 p-3 bg-base/50 border profile-border hover:bg-surface-hover transition-all group">
                                        <Link to={`/user/${f.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="shrink-0 w-10 h-10 flex items-center justify-center">
                                                <FramedAvatar
                                                    avatarUrl={f.avatar_url}
                                                    username={f.username}
                                                    size={36}
                                                    frameKey={f.avatar_frame}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-mono font-bold text-text-primary group-hover:text-brand-accent transition-colors truncate">
                                                        {f.username}
                                                    </span>
                                                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-overlay text-muted shrink-0">
                                                        LVL {f.level}
                                                    </span>
                                                </div>
                                                {f.bio && (
                                                    <span className="text-[10px] font-mono text-muted line-clamp-1">{f.bio}</span>
                                                )}
                                            </div>
                                        </Link>
                                        <button
                                            onClick={() => removeFriend(f.id)}
                                            className="w-8 h-8 flex items-center justify-center text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 shrink-0 border border-transparent hover:border-red-500/30 rounded"
                                            title="Удалить из друзей"
                                        >
                                            🗑
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 font-mono">
                                <p className="text-muted text-sm">
                                    {friendSearch ? '[ НЕ НАЙДЕНО ]' : '[ НЕТ ДРУЗЕЙ — НАЙДИТЕ НОВЫХ ]'}
                                </p>
                                {!friendSearch && (
                                    <button
                                        onClick={() => setTab('search')}
                                        className="mt-3 text-brand-accent text-xs font-mono hover:underline"
                                    >
                                        Найти людей →
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Search tab */}
                {tab === 'search' && (
                    <>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Введите имя пользователя..."
                            className="w-full bg-base border border-overlay px-3 py-2.5 text-sm text-text-primary font-mono placeholder:text-muted/50 focus:outline-none focus:border-brand-accent/50 transition-colors mb-4"
                            autoFocus
                        />

                        {loading && (
                            <div className="text-center py-6 text-muted font-mono text-sm animate-pulse">Поиск...</div>
                        )}

                        {!loading && search.trim() && searchResults.length === 0 && (
                            <div className="text-center py-12 font-mono">
                                <p className="text-muted text-sm">[ НИКОГО НЕ НАЙДЕНО ]</p>
                            </div>
                        )}

                        {!loading && searchResults.length > 0 && (
                            <div className="space-y-2">
                                {searchResults.map(u => {
                                    const alreadyFriend = friendIds.has(u.id);
                                    return (
                                        <div key={u.id} className="flex items-center gap-3 p-3 bg-base/50 border profile-border hover:bg-surface-hover transition-all group">
                                            <Link to={`/user/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="shrink-0">
                                                    <FramedAvatar
                                                        avatarUrl={u.avatar_url}
                                                        username={u.username}
                                                        size={48}
                                                        frameKey={u.avatar_frame}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-mono font-bold text-text-primary group-hover:text-brand-accent transition-colors truncate">
                                                            {u.username}
                                                        </span>
                                                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-overlay text-muted shrink-0">
                                                            LVL {u.level}
                                                        </span>
                                                    </div>
                                                    {u.bio && (
                                                        <span className="text-[10px] font-mono text-muted line-clamp-1">{u.bio}</span>
                                                    )}
                                                </div>
                                            </Link>
                                            {alreadyFriend ? (
                                                <span className="text-[10px] font-mono text-brand-accent shrink-0 px-2">✓ Друг</span>
                                            ) : (
                                                <button
                                                    onClick={() => addFriend(u.id)}
                                                    className="text-[10px] font-mono text-brand-accent hover:text-brand shrink-0 px-2 py-1 border border-brand-accent/30 hover:bg-brand-accent/10 transition-all"
                                                >
                                                    + Добавить
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {!search.trim() && !loading && (
                            <div className="text-center py-12 font-mono">
                                <p className="text-muted text-sm">Начните вводить имя для поиска</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default FriendsPage;
