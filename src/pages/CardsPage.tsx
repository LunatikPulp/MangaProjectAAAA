import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../services/externalApiService';

const coverSrc = (url: string) => url?.startsWith('/') ? `${API_BASE}${url}` : url;
import { AuthContext } from '../contexts/AuthContext';

/* ═══════════════════════════════════════════════════
   SPRINGMANGA — COLLECTIBLE CARDS
   "Techno-Organic Decay" Card Collection
   ═══════════════════════════════════════════════════ */

interface Card {
    id: number;
    manga_id: string;
    title: string;
    cover_url: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    obtained_at: string | null;
}

interface CardStats {
    total_cards: number;
    total_manga: number;
    completion: number;
    rarity_counts: Record<string, number>;
}

const RARITY_CONFIG = {
    common:    { label: 'Обычная',     color: '#7A7A7A', border: 'rgba(122,122,122,0.4)', bg: 'rgba(122,122,122,0.05)', glow: 'none' },
    rare:      { label: 'Редкая',      color: '#29B6F6', border: 'rgba(41,182,246,0.5)',   bg: 'rgba(41,182,246,0.06)',  glow: '0 0 12px rgba(41,182,246,0.2)' },
    epic:      { label: 'Эпическая',   color: '#AB47BC', border: 'rgba(171,71,188,0.5)',   bg: 'rgba(171,71,188,0.06)', glow: '0 0 14px rgba(171,71,188,0.3)' },
    legendary: { label: 'Легендарная',  color: '#FFD740', border: 'rgba(255,215,64,0.6)',   bg: 'rgba(255,215,64,0.08)', glow: '0 0 18px rgba(255,215,64,0.35)' },
};

type FilterRarity = 'all' | 'common' | 'rare' | 'epic' | 'legendary';

const CardsPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const token = localStorage.getItem('backend_token');
    const [cards, setCards] = useState<Card[]>([]);
    const [stats, setStats] = useState<CardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterRarity>('all');
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        Promise.all([
            fetch(`${API_BASE}/auth/cards`, { headers }).then(r => r.json()),
            fetch(`${API_BASE}/auth/cards/stats`, { headers }).then(r => r.json()),
        ]).then(([cardsData, statsData]) => {
            setCards(cardsData);
            setStats(statsData);
        }).finally(() => setLoading(false));
    }, [token]);

    const filteredCards = filter === 'all' ? cards : cards.filter(c => c.rarity === filter);

    if (!user) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center font-mono">
                <p style={{ color: 'rgba(169,255,0,0.4)' }}>[ АВТОРИЗУЙТЕСЬ ]</p>
            </div>
        );
    }

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">🃏</span>
                    <h1 className="text-2xl font-bold tracking-widest uppercase" style={{ color: '#A9FF00' }}>
                        Коллекция
                    </h1>
                </div>
                <p className="text-xs" style={{ color: 'rgba(224,224,224,0.4)' }}>
                    Карточки выпадают при чтении манги. Прочти 3+ главы — получи шанс на дроп.
                </p>
            </div>

            {/* Stats bar */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
                    <StatBox label="Всего" value={`${stats.total_cards}`} accent />
                    <StatBox label="Обычных" value={`${stats.rarity_counts.common || 0}`} color="#7A7A7A" />
                    <StatBox label="Редких" value={`${stats.rarity_counts.rare || 0}`} color="#29B6F6" />
                    <StatBox label="Эпических" value={`${stats.rarity_counts.epic || 0}`} color="#AB47BC" />
                    <StatBox label="Легендарных" value={`${stats.rarity_counts.legendary || 0}`} color="#FFD740" />
                </div>
            )}

            {/* Completion bar */}
            {stats && (
                <div className="mb-6">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                        <span style={{ color: 'rgba(224,224,224,0.4)' }}>Прогресс коллекции</span>
                        <span style={{ color: '#A9FF00' }}>{stats.total_cards} / {stats.total_manga} ({stats.completion}%)</span>
                    </div>
                    <div className="h-2 w-full" style={{ background: '#1A1A1A', border: '1px solid #3D2B1F' }}>
                        <div
                            className="h-full transition-all duration-500"
                            style={{
                                width: `${stats.completion}%`,
                                background: 'linear-gradient(90deg, #A9FF00, #7FFF00)',
                                boxShadow: '0 0 8px rgba(169,255,0,0.3)',
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 mb-6 overflow-x-auto">
                {(['all', 'common', 'rare', 'epic', 'legendary'] as FilterRarity[]).map(f => {
                    const isActive = filter === f;
                    const label = f === 'all' ? 'Все' : RARITY_CONFIG[f].label;
                    const color = f === 'all' ? '#A9FF00' : RARITY_CONFIG[f].color;
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all shrink-0"
                            style={{
                                background: isActive ? `${color}15` : 'transparent',
                                border: `1px solid ${isActive ? color : 'rgba(61,43,31,0.3)'}`,
                                color: isActive ? color : 'rgba(224,224,224,0.4)',
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Cards grid */}
            {loading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="animate-pulse" style={{ background: '#1A1A1A', border: '1px solid #3D2B1F' }}>
                            <div className="aspect-[2/3]" />
                        </div>
                    ))}
                </div>
            ) : filteredCards.length > 0 ? (
                <motion.div
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
                    initial="hidden"
                    animate="visible"
                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.03 } } }}
                >
                    {filteredCards.map(card => {
                        const rc = RARITY_CONFIG[card.rarity];
                        return (
                            <motion.div
                                key={card.id}
                                variants={{ hidden: { y: 15, opacity: 0 }, visible: { y: 0, opacity: 1 } }}
                                className="group cursor-pointer relative"
                                onClick={() => setSelectedCard(card)}
                                style={{
                                    border: `1px solid ${rc.border}`,
                                    background: rc.bg,
                                    boxShadow: rc.glow,
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                }}
                                whileHover={{ scale: 1.03, boxShadow: rc.glow.replace(/[\d.]+\)$/, '0.6)') }}
                            >
                                <div className="aspect-[2/3] overflow-hidden relative">
                                    <img
                                        src={coverSrc(card.cover_url)}
                                        alt={card.title}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                    {/* Rarity strip */}
                                    <div className="absolute bottom-0 left-0 right-0 py-0.5 text-center text-[7px] font-bold uppercase tracking-widest"
                                         style={{ background: `${rc.color}30`, color: rc.color, backdropFilter: 'blur(4px)' }}>
                                        {rc.label}
                                    </div>
                                </div>
                                <div className="p-1.5">
                                    <p className="text-[9px] truncate" style={{ color: '#E0E0E0' }}>{card.title}</p>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            ) : (
                <div className="text-center py-20">
                    <div className="text-4xl mb-4 opacity-20">🃏</div>
                    <p className="text-sm" style={{ color: 'rgba(224,224,224,0.4)' }}>
                        {cards.length === 0
                            ? 'Карточек пока нет. Читай мангу — они будут выпадать!'
                            : 'Нет карточек с таким фильтром'}
                    </p>
                    {cards.length === 0 && (
                        <Link
                            to="/catalog"
                            className="mt-4 inline-block px-6 py-2 text-sm font-bold"
                            style={{ background: '#A9FF00', color: '#121212' }}
                        >
                            Перейти в каталог
                        </Link>
                    )}
                </div>
            )}

            {/* Card detail modal */}
            <AnimatePresence>
                {selectedCard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        onClick={() => setSelectedCard(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.8, rotateY: -15, opacity: 0 }}
                            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                            exit={{ scale: 0.8, rotateY: 15, opacity: 0 }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="relative max-w-xs w-full mx-4"
                            onClick={e => e.stopPropagation()}
                            style={{
                                border: `2px solid ${RARITY_CONFIG[selectedCard.rarity].color}`,
                                background: '#1A1A1A',
                                boxShadow: `0 0 40px ${RARITY_CONFIG[selectedCard.rarity].color}40`,
                            }}
                        >
                            {/* Cover */}
                            <div className="aspect-[2/3] overflow-hidden relative">
                                <img
                                    src={coverSrc(selectedCard.cover_url)}
                                    alt={selectedCard.title}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-transparent to-transparent" />

                                {/* Rarity label */}
                                <div className="absolute top-3 right-3 px-2 py-1 text-[9px] font-bold uppercase tracking-widest"
                                     style={{
                                         background: `${RARITY_CONFIG[selectedCard.rarity].color}25`,
                                         border: `1px solid ${RARITY_CONFIG[selectedCard.rarity].border}`,
                                         color: RARITY_CONFIG[selectedCard.rarity].color,
                                         backdropFilter: 'blur(8px)',
                                     }}>
                                    {RARITY_CONFIG[selectedCard.rarity].label}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-4 space-y-3">
                                <h3 className="text-sm font-bold" style={{ color: '#E0E0E0' }}>{selectedCard.title}</h3>
                                <div className="flex items-center justify-between text-[9px]" style={{ color: 'rgba(224,224,224,0.4)' }}>
                                    <span>Получена: {selectedCard.obtained_at ? new Date(selectedCard.obtained_at).toLocaleDateString('ru') : '—'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Link
                                        to={`/manga/${selectedCard.manga_id}`}
                                        className="flex-1 py-2 text-center text-xs font-bold"
                                        style={{ background: '#A9FF00', color: '#121212' }}
                                        onClick={() => setSelectedCard(null)}
                                    >
                                        Открыть мангу →
                                    </Link>
                                    <button
                                        onClick={() => setSelectedCard(null)}
                                        className="px-4 py-2 text-xs"
                                        style={{ border: '1px solid #3D2B1F', color: 'rgba(224,224,224,0.4)' }}
                                    >
                                        Закрыть
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const StatBox: React.FC<{ label: string; value: string; color?: string; accent?: boolean }> = ({ label, value, color, accent }) => (
    <div className="p-3 text-center" style={{ background: '#1A1A1A', border: '1px solid #3D2B1F' }}>
        <div className="text-lg font-bold" style={{ color: accent ? '#A9FF00' : color || '#E0E0E0' }}>{value}</div>
        <div className="text-[8px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(224,224,224,0.35)' }}>{label}</div>
    </div>
);

export default CardsPage;
