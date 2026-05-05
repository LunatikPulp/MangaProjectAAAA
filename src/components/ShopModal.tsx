import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { API_BASE } from '../services/externalApiService';

const ScrapIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <img src="/money/scrap.webp" alt="scrap" className={`inline-block align-middle ${className}`} />
);

interface ShopItem {
    key: string;
    name: string;
    description: string;
    category: string;
    price: number;
    preview: string;
    rarity?: string;
    css_variables?: string;
    block_style?: string;
    nickname_effect?: string;
    font_family?: string;
}

interface ShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    scrap: number;
    purchases: string[];
    shopItems: ShopItem[];
    onBuy: (itemKey: string) => Promise<boolean>;
    onEquip: (itemKey: string) => void;
    onPreview?: (cssVars: Record<string, string> | null, themeKey: string | null) => void;
    onBackgroundPreview?: (url: string | null) => void;
    onFramePreview?: (frameKey: string | null) => void;
    activeChecks?: {
        avatarUrl?: string;
        bannerUrl?: string;
        backgroundUrl?: string;
        profileTheme?: string;
        avatarFrame?: string;
        bio?: string;
    };
}

type ModalCategory = 'avatar' | 'frame' | 'cover' | 'background' | 'skin' | 'sticker';

const MODAL_CATEGORIES: { key: ModalCategory; label: string; icon: string }[] = [
    { key: 'skin', label: 'Скины', icon: '🎭' },
    { key: 'frame', label: 'Рамки', icon: '🖼️' },
    { key: 'avatar', label: 'Аватар', icon: '👤' },
    { key: 'cover', label: 'Обложка', icon: '🎨' },
    { key: 'background', label: 'Фон', icon: '🌄' },
    { key: 'sticker', label: 'Стикеры', icon: '😎' },
];

// Categories that use tall rectangle cards (parallelepiped)
const TALL_CATEGORIES = new Set<string>(['skin', 'cover', 'background']);
// Square categories: frame, avatar, sticker

const RARITY_COLORS: Record<string, { border: string; badge: string; badgeText: string }> = {
    common:  { border: 'border-zinc-600/40',   badge: 'bg-zinc-500/20 border-zinc-500/30',   badgeText: 'text-zinc-400' },
    rare:    { border: 'border-blue-500/40',    badge: 'bg-blue-500/20 border-blue-500/30',    badgeText: 'text-blue-400' },
    epic:    { border: 'border-purple-500/40',  badge: 'bg-purple-500/20 border-purple-500/30', badgeText: 'text-purple-400' },
    mythic:  { border: 'border-yellow-500/40',  badge: 'bg-yellow-500/20 border-yellow-500/30', badgeText: 'text-yellow-400' },
};

const RARITY_NAMES: Record<string, string> = {
    common: 'COMMON', rare: 'RARE', epic: 'EPIC', mythic: 'MYTHIC',
};

const FREE_SKINS: Record<string, { name: string; preview: string; css_variables: string }> = {
    base:     { name: 'Base',     preview: '#A9FF00', css_variables: '{}' },
    neon:     { name: 'Neon',     preview: '#7FFF00', css_variables: '{}' },
    corroded: { name: 'Corroded', preview: '#8B5E3C', css_variables: '{}' },
};

const ShopModal: React.FC<ShopModalProps> = ({
    isOpen, onClose, scrap, purchases, shopItems,
    onBuy, onEquip, onPreview, onBackgroundPreview, onFramePreview, activeChecks,
}) => {
    const [activeTab, setActiveTab] = useState<ModalCategory>('skin');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [buyingKey, setBuyingKey] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const onPreviewRef = useRef(onPreview);
    onPreviewRef.current = onPreview;

    const allItems = useMemo(() => {
        const freeSkinItems: ShopItem[] = Object.entries(FREE_SKINS).map(([key, s]) => ({
            key: `skin_${key}`, name: s.name, description: 'Бесплатная тема', category: 'skin',
            price: 0, preview: s.preview, rarity: 'common', css_variables: s.css_variables,
        }));
        return [...freeSkinItems, ...shopItems];
    }, [shopItems]);

    const filteredItems = useMemo(
        () => allItems
            .filter(i => {
                // Фильтруем по категории
                if (i.category !== activeTab) return false;
                return true;
            })
            .sort((a, b) => {
                // Сортируем по купленным (купленные наверх)
                const aOwned = purchases.includes(a.key);
                const bOwned = purchases.includes(b.key);
                if (aOwned && !bOwned) return -1;
                if (!aOwned && bOwned) return 1;
                return 0;
            }),
        [allItems, activeTab, purchases],
    );

    const selectedItem = useMemo(
        () => selectedKey ? allItems.find(i => i.key === selectedKey) || null : null,
        [allItems, selectedKey],
    );

    const isItemActive = useCallback((item: ShopItem): boolean => {
        if (!activeChecks) return false;
        if (item.category === 'skin') return activeChecks.profileTheme === item.key.replace('skin_', '');
        if (item.category === 'frame') return activeChecks.avatarFrame === item.key;
        if (item.category === 'avatar') return activeChecks.avatarUrl === item.preview;
        if (item.category === 'cover') return activeChecks.bannerUrl === item.preview;
        if (item.category === 'background') return activeChecks.backgroundUrl === item.preview;
        return false;
    }, [activeChecks]);

    const isOwned = useCallback((item: ShopItem): boolean => {
        if (item.price === 0) return true;
        return purchases.includes(item.key);
    }, [purchases]);

    // Apply live preview when selecting ANY item (skin applies CSS vars, background applies bg, frame applies frame)
    useEffect(() => {
        if (!selectedItem) {
            if (onBackgroundPreview) onBackgroundPreview(null);
            if (onFramePreview) onFramePreview(null);
            return;
        }
        if (selectedItem.category === 'skin' && onPreviewRef.current) {
            try {
                const vars = selectedItem.css_variables ? JSON.parse(selectedItem.css_variables) : {};
                onPreviewRef.current(vars, selectedItem.key.replace('skin_', ''));
            } catch {
                onPreviewRef.current({}, selectedItem.key.replace('skin_', ''));
            }
        }
        if (selectedItem.category === 'frame' && onFramePreview) {
            onFramePreview(selectedItem.key);
        } else if (onFramePreview) {
            onFramePreview(null);
        }
        if ((selectedItem.category === 'background' || selectedItem.category === 'cover') && onBackgroundPreview) {
            const src = getThumbSrc(selectedItem);
            onBackgroundPreview(src || selectedItem.preview);
        } else if (onBackgroundPreview) {
            onBackgroundPreview(null);
        }
    }, [selectedItem, onBackgroundPreview, onFramePreview]);

    const handleClose = () => {
        if (onPreview) onPreview(null, null);
        if (onBackgroundPreview) onBackgroundPreview(null);
        if (onFramePreview) onFramePreview(null);
        setSelectedKey(null);
        onClose();
    };

    const handleBuy = async () => {
        if (!selectedItem || buyingKey) return;
        if (scrap < selectedItem.price) return;
        setBuyingKey(selectedItem.key);
        const ok = await onBuy(selectedItem.key);
        setBuyingKey(null);
        if (ok) {
            onEquip(selectedItem.key);
            if (onPreview) onPreview(null, null);
        }
    };

    const handleEquip = () => {
        if (!selectedItem) return;
        onEquip(selectedItem.key);
        if (onPreview) onPreview(null, null);
    };

    const getThumbSrc = (item: ShopItem): string | null => {
        if (item.preview.startsWith('#')) return null;
        if (item.preview.startsWith('http')) return item.preview;
        if (item.preview.startsWith('/Frames_shop/')) return item.preview;
        if (item.preview.startsWith('/')) return `${API_BASE}${item.preview}`;
        return null;
    };

    const isTall = TALL_CATEGORIES.has(activeTab);
    // Card dimensions — compact for mobile
    const cardW = isTall ? 'w-[75px] md:w-[110px]' : 'w-[68px] md:w-[90px]';
    const thumbClass = isTall
        ? 'w-[75px] h-[100px] md:w-[110px] md:h-[148px]'
        : 'w-[68px] h-[68px] md:w-[90px] md:h-[90px]';

    const getActionButton = () => {
        if (!selectedItem) return null;
        const owned = isOwned(selectedItem);
        const active = owned && isItemActive(selectedItem);
        const canAfford = scrap >= selectedItem.price;
        const isBuying = buyingKey === selectedItem.key;

        if (active) {
            return <span className="px-4 py-2 text-[10px] font-mono font-bold text-green-400 bg-green-500/10 border border-green-500/30 shrink-0">✓ АКТИВНО</span>;
        }
        if (owned) {
            return (
                <button onClick={handleEquip} className="px-4 py-2 text-[10px] font-mono font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 transition-all active:scale-95 shrink-0">
                    НАДЕТЬ
                </button>
            );
        }
        if (!canAfford) {
            return <button disabled className="px-4 py-2 text-[10px] font-mono font-bold bg-red-500/10 text-red-400/60 border border-red-500/20 opacity-50 cursor-not-allowed shrink-0">НЕХВАТКА SCRAP</button>;
        }
        return (
            <button onClick={handleBuy} disabled={isBuying} className="px-4 py-2 text-[10px] font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all active:scale-95 shrink-0">
                {isBuying ? '...' : <span className="inline-flex items-center gap-1">КУПИТЬ {selectedItem.price} <ScrapIcon className="w-3.5 h-3.5" /></span>}
            </button>
        );
    };

    const content = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    className="fixed inset-0 bg-black/30 z-[11000] flex items-end justify-center"
                    style={{ pointerEvents: 'auto' }}
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                        onClick={e => e.stopPropagation()}
                        className="w-full max-w-2xl bg-surface border-t border-x border-overlay shadow-2xl"
                        style={{ borderRadius: '14px 14px 0 0' }}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-2 pb-1">
                            <div className="w-10 h-1 bg-overlay rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pb-2">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono font-bold text-text-primary tracking-wider">МАГАЗИН</span>
                                <span className="text-[11px] font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{scrap} <ScrapIcon className="w-3 h-3" /></span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Link to="/shop" onClick={handleClose} className="text-[10px] font-mono text-brand-accent hover:underline">
                                    Полный магазин →
                                </Link>
                                <button onClick={handleClose} className="text-muted hover:text-text-primary transition-colors text-sm leading-none">✕</button>
                            </div>
                        </div>

                        {/* Category tabs */}
                        <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
                            {MODAL_CATEGORIES.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => { setActiveTab(cat.key); setSelectedKey(null); if (onPreview) onPreview(null, null); }}
                                    className={`whitespace-nowrap px-2.5 py-1 text-[10px] font-mono transition-all shrink-0 ${
                                        activeTab === cat.key
                                            ? 'bg-brand-accent/10 text-brand-accent border border-brand-accent/30'
                                            : 'text-muted hover:text-text-primary border border-transparent'
                                    }`}
                                >
                                    {cat.icon} {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Items — horizontal scroll */}
                        <div className="border-t border-overlay relative">
                            {filteredItems.length === 0 ? (
                                <div className="py-6 text-center">
                                    <p className="font-mono text-muted text-[11px]">[ ПУСТО ]</p>
                                </div>
                            ) : (
                                <>
                                {/* Scroll arrows — desktop */}
                                <button
                                    onClick={() => scrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                                    className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-14 items-center justify-center bg-surface/90 border border-overlay hover:bg-surface-hover transition-all text-muted hover:text-text-primary"
                                >
                                    ‹
                                </button>
                                <button
                                    onClick={() => scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                                    className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-14 items-center justify-center bg-surface/90 border border-overlay hover:bg-surface-hover transition-all text-muted hover:text-text-primary"
                                >
                                    ›
                                </button>
                                <div
                                    ref={scrollRef}
                                    className="flex gap-2 px-3 md:px-10 py-3 overflow-x-auto"
                                    style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
                                >
                                    {filteredItems.map(item => {
                                        const owned = isOwned(item);
                                        const active = owned && isItemActive(item);
                                        const rarity = item.rarity || 'common';
                                        const rc = RARITY_COLORS[rarity] || RARITY_COLORS.common;
                                        const thumbSrc = getThumbSrc(item);
                                        const isSelected = selectedKey === item.key;

                                        return (
                                            <div
                                                key={item.key}
                                                onClick={() => setSelectedKey(isSelected ? null : item.key)}
                                                className={`shrink-0 cursor-pointer transition-all duration-200 border overflow-hidden select-none ${cardW} ${
                                                    isSelected
                                                        ? 'border-brand-accent ring-2 ring-brand-accent/40 scale-[1.03]'
                                                        : active
                                                            ? 'border-green-500/60 bg-green-500/10'
                                                            : owned
                                                                ? `${rc.border} bg-surface/50 hover:bg-surface-hover`
                                                                : `${rc.border} bg-base/80 hover:bg-surface-hover`
                                                }`}
                                                style={{ scrollSnapAlign: 'start' }}
                                            >
                                                {/* Thumbnail */}
                                                <div className={`${item.category === 'frame' ? 'w-[68px] h-[68px] md:w-[90px] md:h-[90px]' : thumbClass} flex items-center justify-center overflow-hidden relative ${item.category === 'frame' ? 'bg-gradient-to-b from-[#1a1a2e] to-[#0a0a15]' : 'bg-base/50'}`}>
                                                    {item.category === 'frame' && thumbSrc ? (
                                                        /* Steam-style frame preview — 90% of container */
                                                        <>
                                                            <div className="relative" style={{ width: '90%', height: '90%' }}>
                                                                {/* Avatar 65% centered inside frame */}
                                                                <div className="absolute overflow-hidden bg-gradient-to-br from-[#2a2a3e] to-[#1a1a2e]" style={{ width: '77%', height: '77%', top: '11.5%', left: '11.5%', borderRadius: '50%', zIndex: 1 }}>
                                                                    {activeChecks?.avatarUrl ? (
                                                                        <img src={activeChecks.avatarUrl.startsWith('/') ? `${API_BASE}${activeChecks.avatarUrl}` : activeChecks.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            <span className="text-xs font-bold text-white/40">?</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ objectFit: 'fill' }} loading="lazy" />
                                                            </div>
                                                        </>
                                                    ) : item.category === 'skin' ? (
                                                        <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${item.preview}, ${item.preview}66, #0a0a0a)` }} />
                                                    ) : thumbSrc && /\.(mp4|webm|ogg)(\?|$)/i.test(thumbSrc) ? (
                                                        <video src={thumbSrc} muted loop autoPlay playsInline className="w-full h-full object-cover" />
                                                    ) : thumbSrc ? (
                                                        <img src={thumbSrc} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : item.preview.startsWith('#') ? (
                                                        <div className="w-full h-full" style={{ backgroundColor: item.preview }} />
                                                    ) : (
                                                        <span className="text-xl md:text-2xl">{item.preview}</span>
                                                    )}

                                                    {/* Rarity badge */}
                                                    <span className={`absolute top-1 right-1 text-[6px] md:text-[7px] font-mono font-bold px-1 py-px border ${rc.badge} ${rc.badgeText}`}>
                                                        {RARITY_NAMES[rarity]}
                                                    </span>

                                                    {/* Active check */}
                                                    {active && (
                                                        <span className="absolute top-1 left-1 text-[7px] font-mono font-bold px-1 py-px bg-green-500/80 text-white">✓</span>
                                                    )}

                                                    {/* PREVIEW overlay when selected & not owned */}
                                                    {isSelected && !owned && (
                                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                            <span className="text-[8px] font-mono font-bold text-white bg-black/60 px-2 py-0.5 tracking-wider">PREVIEW</span>
                                                        </div>
                                                    )}

                                                </div>

                                                {/* Info */}
                                                <div className="px-1.5 py-1">
                                                    <p className="text-[7px] md:text-[8px] font-mono font-bold text-text-primary truncate leading-tight">{item.name}</p>
                                                    {item.price === 0 ? (
                                                        <p className="text-[6px] md:text-[7px] font-mono text-green-400 leading-tight">БЕСПЛАТНО</p>
                                                    ) : owned ? (
                                                        <p className="text-[6px] md:text-[7px] font-mono text-brand-accent leading-tight">В КОЛЛЕКЦИИ</p>
                                                    ) : (
                                                        <p className="text-[6px] md:text-[7px] font-mono font-bold text-yellow-400 leading-tight inline-flex items-center gap-0.5">{item.price} <ScrapIcon className="w-2 h-2" /></p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </>
                            )}
                        </div>

                        {/* Bottom action bar */}
                        <div className="px-4 py-2.5 border-t border-overlay bg-base/50">
                            {selectedItem ? (
                                <div>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] font-mono font-bold text-text-primary truncate">{selectedItem.name}</p>
                                                {(() => {
                                                    const r = selectedItem.rarity || 'common';
                                                    const rc = RARITY_COLORS[r] || RARITY_COLORS.common;
                                                    return <span className={`text-[7px] font-mono font-bold ${rc.badgeText}`}>{RARITY_NAMES[r]}</span>;
                                                })()}
                                                {!isOwned(selectedItem) && (
                                                    <span className="text-[8px] font-mono text-yellow-400/70 bg-yellow-500/10 px-1 py-px border border-yellow-500/15">ПРЕВЬЮ</span>
                                                )}
                                            </div>
                                            <p className="text-[8px] font-mono text-muted truncate">{selectedItem.description}</p>
                                        </div>
                                        {getActionButton()}
                                    </div>
                                    {/* Mythic features: font + nick color */}
                                    {selectedItem.rarity === 'mythic' && selectedItem.category === 'skin' && (
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            <span className="text-[8px] font-mono text-yellow-400/70 px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20">ШРИФТ НИКА</span>
                                            <span className="text-[8px] font-mono text-yellow-400/70 px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20">ЦВЕТ НИКА</span>
                                            <span className="text-[7px] font-mono text-muted">настройка в Магазин → Скины</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[9px] font-mono text-muted text-center">Выберите предмет для предпросмотра</p>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default ShopModal;
