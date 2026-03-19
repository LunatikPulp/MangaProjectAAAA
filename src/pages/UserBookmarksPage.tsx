import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/externalApiService';
import { motion } from 'framer-motion';

const STATUS_TABS = ['Все', 'Читаю', 'Буду читать', 'Прочитано', 'Брошено', 'Отложено', 'Не интересно'] as const;

interface UserBookmark {
    manga_id: string;
    title: string;
    cover: string;
    status: string;
}

const UserBookmarksPage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const [bookmarks, setBookmarks] = useState<UserBookmark[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>('Все');
    const [username, setUsername] = useState('');

    useEffect(() => {
        if (!userId) return;
        // Fetch username
        fetch(`${API_BASE}/users/${userId}/profile-full`)
            .then(r => r.json())
            .then(d => setUsername(d.username || ''))
            .catch(() => {});
        // Fetch all bookmarks
        setLoading(true);
        fetch(`${API_BASE}/users/${userId}/bookmarks`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => setBookmarks(data))
            .catch(() => setBookmarks([]))
            .finally(() => setLoading(false));
    }, [userId]);

    const filtered = activeTab === 'Все' ? bookmarks : bookmarks.filter(b => b.status === activeTab);

    const getCount = (tab: string) => {
        if (tab === 'Все') return bookmarks.length;
        return bookmarks.filter(b => b.status === tab).length;
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            {/* Back */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate(-1)} className="text-muted hover:text-text-primary transition-colors text-sm font-mono">← Назад</button>
                <h1 className="text-xl font-display font-bold text-text-primary">
                    Закладки {username && <span className="text-brand-accent">{username}</span>}
                </h1>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
                {STATUS_TABS.map(tab => {
                    const count = getCount(tab);
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1.5 text-xs font-mono font-bold border transition-all ${
                                activeTab === tab
                                    ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40'
                                    : 'bg-surface border-overlay text-muted hover:text-text-primary hover:border-overlay'
                            }`}
                        >
                            {tab} <span className="ml-1 opacity-60">{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div className="text-center py-16 text-muted font-mono animate-pulse">Загрузка...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted font-mono text-sm">[ ПУСТО ]</div>
            ) : (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
                >
                    {filtered.map(b => {
                        const coverSrc = b.cover ? (b.cover.startsWith('http') ? b.cover : `${API_BASE}${b.cover}`) : '';
                        return (
                            <Link to={`/manga/${b.manga_id}`} key={b.manga_id} className="group relative">
                                <div className="aspect-[2/3] overflow-hidden border border-overlay relative bg-surface hover:border-brand-accent/30 transition-all">
                                    {coverSrc ? (
                                        <img src={coverSrc} alt={b.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full bg-overlay flex items-center justify-center text-muted text-xs font-mono">No cover</div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-[10px] font-mono font-bold text-white truncate">{b.title}</p>
                                        <p className="text-[9px] font-mono text-white/60">{b.status}</p>
                                    </div>
                                </div>
                                <p className="text-[10px] font-mono text-text-secondary mt-1 truncate">{b.title}</p>
                                <p className="text-[8px] font-mono text-muted">{b.status}</p>
                            </Link>
                        );
                    })}
                </motion.div>
            )}
        </div>
    );
};

export default UserBookmarksPage;
