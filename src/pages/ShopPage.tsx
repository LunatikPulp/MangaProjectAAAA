import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ToasterContext } from '../contexts/ToasterContext';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../services/externalApiService';

export interface ShopItem {
    key: string;
    name: string;
    description: string;
    category: string;
    price: number;
    preview: string;
    rarity?: string;
    nickname_effect?: string;
    font_family?: string;
    locked?: boolean;
}

interface PersRequest {
    id: number;
    type: string;
    file_url: string;
    text_value: string;
    status: string;
    price: number;
    created_at: string;
    refundable: boolean;
}

type ShopCategory = 'avatar' | 'frame' | 'cover' | 'background' | 'sticker' | 'skin' | 'personalization' | 'springpro';

const CATEGORIES: { key: ShopCategory; label: string; icon: string; description: string }[] = [
    { key: 'avatar', label: 'Аватарки', icon: '👤', description: 'Уникальные аватары для профиля' },
    { key: 'frame', label: 'Рамки', icon: '🖼️', description: 'Рамки для аватара' },
    { key: 'cover', label: 'Обложки', icon: '🎨', description: 'Обложки профиля' },
    { key: 'background', label: 'Фон', icon: '🌄', description: 'Полноэкранный фон профиля' },
    { key: 'sticker', label: 'Стикеры', icon: '😎', description: 'Стикеры для стены' },
    { key: 'skin', label: 'Скины', icon: '🎭', description: 'Цветовые темы UI' },
    { key: 'personalization', label: 'Персонализация', icon: '✨', description: 'Загрузите свой контент' },
    { key: 'springpro', label: 'SPRINGPRO', icon: '👑', description: 'Премиум подписка' },
];

const PERS_TYPES = [
    { value: 'background', label: 'Фон профиля', accept: '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm' },
];

const PERS_PRICE = 5000;

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    pending: { text: 'На модерации', color: 'text-yellow-400' },
    approved: { text: 'Одобрено', color: 'text-green-400' },
    rejected: { text: 'Отклонено', color: 'text-red-400' },
};

interface ScrapPackage {
    id: string;
    scrap: number;
    price_rub: number;
    label?: string;
    first_buy_x2?: boolean;
}

const ScrapIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <img src="/money/scrap.png" alt="scrap" className={`inline-block align-middle ${className}`} />
);

const ShopPage: React.FC = () => {
    const { showToaster } = useContext(ToasterContext);
    const { refreshUser, user } = useContext(AuthContext);
    const [activeCategory, setActiveCategory] = useState<ShopCategory>(() => {
        const saved = localStorage.getItem('shop_active_category');
        return (saved as ShopCategory) || 'avatar';
    });
    const [items, setItems] = useState<ShopItem[]>([]);
    const [myPurchases, setMyPurchases] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [buyingKey, setBuyingKey] = useState<string | null>(null);
    const [activatingKey, setActivatingKey] = useState<string | null>(null);
    const [scrap, setScrap] = useState(0);
    const [donatedScrap, setDonatedScrap] = useState(0);
    const [profileTheme, setProfileTheme] = useState('base');
    const [avatarFrame, setAvatarFrame] = useState('none');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [bannerUrl, setBannerUrl] = useState('');
    const [backgroundUrl, setBackgroundUrl] = useState('');
    const [userBio, setUserBio] = useState('');
    const [nicknameColor, setNicknameColor] = useState('');
    const [nicknameFont, setNicknameFont] = useState('');
    const [showNickSettings, setShowNickSettings] = useState<string | null>(null);
    const [nickColorInput, setNickColorInput] = useState('');
    const [nickFontInput, setNickFontInput] = useState('');
    const [savingNick, setSavingNick] = useState(false);
    const [scrapPackages, setScrapPackages] = useState<ScrapPackage[]>([]);
    const [springproPlans, setSpringproPlans] = useState<{id: string; months: number; price_rub: number; label: string}[]>([]);
    const [subscriptionActive, setSubscriptionActive] = useState(false);
    const [subscriptionExpires, setSubscriptionExpires] = useState<string | null>(null);
    const [paymentProcessing, setPaymentProcessing] = useState<string | null>(null);

    const [selectedScrapPkg, setSelectedScrapPkg] = useState<ScrapPackage | null>(null);
    const [username, setUsername] = useState('');

    // Lazy load limit for items
    const ITEMS_PER_PAGE = 30;
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

    // Purchase confirm modal
    const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Scrap info modal
    const [showScrapInfo, setShowScrapInfo] = useState(false);

    // Personalization
    const [persFile, setPersFile] = useState<File | null>(null);
    const [persSending, setPersSending] = useState(false);
    const [persRequests, setPersRequests] = useState<PersRequest[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const opts: RequestInit = { credentials: 'include' };
        Promise.all([
            fetch(`${API_BASE}/shop/items`, opts).then(r => r.json()),
            fetch(`${API_BASE}/auth/my-purchases`, opts).then(r => r.ok ? r.json() : []),
            fetch(`${API_BASE}/auth/profile-full`, opts).then(r => r.ok ? r.json() : null),
            fetch(`${API_BASE}/payments/packages`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
        ]).then(([shopItems, purchases, profile, packages]) => {
            console.log('ShopPage profile data:', profile);
            console.log('nickname_color:', profile?.nickname_color);
            console.log('nickname_font:', profile?.nickname_font);
            console.log('user.nickname_color:', profile?.user?.nickname_color);
            console.log('user.nickname_font:', profile?.user?.nickname_font);
            setItems(shopItems);
            setMyPurchases(purchases);
            if (profile?.gamification?.scrap != null) setScrap((profile.gamification.scrap || 0) + (profile.gamification.donated_scrap || 0));
            if (profile?.gamification?.donated_scrap != null) setDonatedScrap(profile.gamification.donated_scrap);
            if (profile?.profile_theme) setProfileTheme(profile.profile_theme);
            if (profile?.avatar_frame) setAvatarFrame(profile.avatar_frame);
            if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
            if (profile?.profile_banner_url) setBannerUrl(profile.profile_banner_url);
            if (profile?.profile_background_url) setBackgroundUrl(profile.profile_background_url);
            if (profile?.bio) setUserBio(profile.bio);
            if (profile?.nickname_color) { setNicknameColor(profile.nickname_color); setNickColorInput(profile.nickname_color); }
            if (profile?.nickname_font) { setNicknameFont(profile.nickname_font); setNickFontInput(profile.nickname_font); }
            if (profile?.username) setUsername(profile.username);
            if (profile?.subscription_active) setSubscriptionActive(true);
            if (profile?.subscription_expires_at) setSubscriptionExpires(profile.subscription_expires_at);
            if (packages?.scrap_packages) setScrapPackages(packages.scrap_packages);
            if (packages?.springpro_plans) setSpringproPlans(packages.springpro_plans);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const fetchMyPersRequests = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/personalization/my-requests`, { credentials: 'include' });
            if (res.ok) setPersRequests(await res.json());
        } catch { /* ignore */ }
    }, []);

    const handleCategoryChange = (category: ShopCategory) => {
        setActiveCategory(category);
        setVisibleCount(ITEMS_PER_PAGE);
        localStorage.setItem('shop_active_category', category);
    };

    useEffect(() => { fetchMyPersRequests(); }, [fetchMyPersRequests]);

    // Lock page scroll when scrap purchase modal is open
    useEffect(() => {
        if (!selectedScrapPkg) return;
        const scrollY = window.scrollY;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        return () => {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            window.scrollTo(0, scrollY);
        };
    }, [selectedScrapPkg]);

    // Lock page scroll when purchase confirm modal is open
    useEffect(() => {
        if (!showConfirmModal) return;
        const scrollY = window.scrollY;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        return () => {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            window.scrollTo(0, scrollY);
        };
    }, [showConfirmModal]);

    const allFilteredItems = items
        .filter(i => {
            // Фильтруем по категории
            if (i.category !== activeCategory) return false;
            // Исключаем рамки за уровни (проверяем путь к файлу)
            if (activeCategory === 'frame' && i.preview.includes('/Frames_lvl/')) return false;
            return true;
        })
        .sort((a, b) => {
            // Сортируем по купленным (купленные наверх)
            const aOwned = myPurchases.includes(a.key);
            const bOwned = myPurchases.includes(b.key);
            if (aOwned && !bOwned) return -1;
            if (!aOwned && bOwned) return 1;
            return 0;
        });

    const filteredItems = allFilteredItems.slice(0, visibleCount);
    const hasMore = visibleCount < allFilteredItems.length;

    // Infinite scroll — load more when sentinel is visible
    const loadMoreRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!hasMore) return;
        const el = loadMoreRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setVisibleCount(prev => prev + ITEMS_PER_PAGE);
            }
        }, { rootMargin: '200px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, activeCategory]);

    const handleBuy = (item: ShopItem) => {
        setConfirmItem(item);
        setShowConfirmModal(true);
    };

    const handleConfirmPurchase = async () => {
        if (!confirmItem) return;
        setBuyingKey(confirmItem.key);
        setShowConfirmModal(false);
        try {
            const res = await fetch(`${API_BASE}/shop/buy/${confirmItem.key}`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setMyPurchases(prev => [...prev, confirmItem.key]);
                setScrap(data.scrap ?? ((data.earned_scrap || 0) + (data.donated_scrap || 0)));
                if (data.donated_scrap != null) setDonatedScrap(data.donated_scrap);
                if (data.subscription_active) {
                    setSubscriptionActive(true);
                    if (data.subscription_expires_at) setSubscriptionExpires(data.subscription_expires_at);
                }
                showToaster(`Куплено: ${confirmItem.name}!`);
                await refreshUser();
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка покупки');
            }
        } catch {
            showToaster('Ошибка сети');
        } finally {
            setBuyingKey(null);
            setConfirmItem(null);
        }
    };

    const ACTIVATABLE_CATEGORIES = ['skin', 'frame', 'avatar', 'cover', 'background', 'status'];

    const isItemActive = (item: ShopItem): boolean => {
        if (item.category === 'skin') return profileTheme === item.key.replace('skin_', '');
        if (item.category === 'frame') return avatarFrame === item.key;
        if (item.category === 'avatar') return avatarUrl === item.preview;
        if (item.category === 'cover') return bannerUrl === item.preview;
        if (item.category === 'background') return backgroundUrl === item.preview;
        if (item.category === 'status') return userBio === item.name;
        return false;
    };

    const handleActivate = async (item: ShopItem) => {
        setActivatingKey(item.key);
        try {
            const res = await fetch(`${API_BASE}/shop/activate/${item.key}`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                showToaster(`Применено: ${item.name}!`);
                if (item.category === 'skin') {
                    setProfileTheme(item.key.replace('skin_', ''));
                    // Сбрасываем настройки ника для немифических скинов
                    if (item.rarity !== 'mythic') {
                        setNicknameColor('');
                        setNicknameFont('');
                        setNickColorInput('');
                        setNickFontInput('');
                    }
                }
                else if (item.category === 'frame') setAvatarFrame(item.key);
                else if (item.category === 'avatar') setAvatarUrl(item.preview);
                else if (item.category === 'cover') setBannerUrl(item.preview);
                else if (item.category === 'background') setBackgroundUrl(item.preview);
                else if (item.category === 'status') setUserBio(item.name);

                // Обновляем данные пользователя в AuthContext
                await refreshUser();
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка применения');
            }
        } catch {
            showToaster('Ошибка сети');
        } finally {
            setActivatingKey(null);
        }
    };

    const handlePersSubmit = async () => {
        if (!persFile) { showToaster('Выберите файл'); return; }
        setPersSending(true);
        try {
            const formData = new FormData();
            formData.append('file', persFile);
            const url = new URL(`${API_BASE}/auth/personalization/request`);
            url.searchParams.set('type', 'background');
            const res = await fetch(url.toString(), {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            if (res.ok) {
                const data = await res.json();
                setScrap(data.scrap);
                setPersFile(null);
                if (fileRef.current) fileRef.current.value = '';
                showToaster('Заявка отправлена на модерацию!');
                fetchMyPersRequests();
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка отправки');
            }
        } catch {
            showToaster('Ошибка сети');
        } finally {
            setPersSending(false);
        }
    };

    const handleRefund = async (id: number) => {
        try {
            const res = await fetch(`${API_BASE}/auth/personalization/${id}/refund`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setScrap(data.scrap);
                showToaster('Scrap возвращены!');
                fetchMyPersRequests();
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка возврата');
            }
        } catch {
            showToaster('Ошибка сети');
        }
    };

    const handleRealPayment = async (type: 'scrap' | 'springpro', packageId?: string) => {
        const key = packageId || type;
        setPaymentProcessing(key);
        try {
            const res = await fetch(`${API_BASE}/payments/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ type, package_id: packageId }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.payment_url) {
                    window.open(data.payment_url, '_blank');
                    showToaster('Перенаправление на оплату...');
                    // Poll status
                    const paymentId = data.payment_id;
                    let attempts = 0;
                    const poll = setInterval(async () => {
                        attempts++;
                        if (attempts > 60) { clearInterval(poll); return; }
                        try {
                            const sr = await fetch(`${API_BASE}/payments/status/${paymentId}`, { credentials: 'include' });
                            if (sr.ok) {
                                const sd = await sr.json();
                                if (sd.status === 'completed') {
                                    clearInterval(poll);
                                    if (sd.type === 'scrap') {
                                        showToaster(`Начислено ${sd.scrap_amount} SCRAP!`);
                                        setScrap(prev => prev + sd.scrap_amount);
                                        setDonatedScrap(prev => prev + sd.scrap_amount);
                                    } else {
                                        showToaster('SPRINGPRO активирован!');
                                        setSubscriptionActive(true);
                                    }
                                    refreshUser();
                                } else if (sd.status === 'failed') {
                                    clearInterval(poll);
                                    showToaster('Платёж не прошёл');
                                }
                            }
                        } catch { /* ignore */ }
                    }, 5000);
                }
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка создания платежа');
            }
        } catch {
            showToaster('Ошибка сети');
        } finally {
            setPaymentProcessing(null);
        }
    };

    const handleSubscribeWithScrap = async (plan: string = 'springpro_month') => {
        setPaymentProcessing('scrap_sub_' + plan);
        try {
            const res = await fetch(`${API_BASE}/shop/subscribe-springpro`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ plan }),
            });
            if (res.ok) {
                const data = await res.json();
                setDonatedScrap(data.donated_scrap);
                setScrap((data.earned_scrap || 0) + (data.donated_scrap || 0));
                setSubscriptionActive(true);
                if (data.subscription_expires_at) setSubscriptionExpires(data.subscription_expires_at);
                await refreshUser();
                showToaster('SPRINGPRO активирован за донатные Scrap!');
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка подписки');
            }
        } catch { showToaster('Ошибка сети'); }
        finally { setPaymentProcessing(null); }
    };

    const handleSaveNickSettings = async () => {
        setSavingNick(true);
        try {
            const res = await fetch(`${API_BASE}/auth/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ nickname_color: nickColorInput, nickname_font: nickFontInput }),
            });
            if (res.ok) {
                setNicknameColor(nickColorInput);
                setNicknameFont(nickFontInput);
                showToaster('Настройки ника сохранены!');
                setShowNickSettings(null);
            } else {
                const err = await res.json().catch(() => ({}));
                showToaster(err.detail || 'Ошибка сохранения');
            }
        } catch { showToaster('Ошибка сети'); }
        finally { setSavingNick(false); }
    };

    const MYTHIC_FONTS = ['', 'VT323', 'Creepster', 'Press Start 2P', 'Orbitron', 'Russo One', 'Black Ops One'];

    const activeCatData = CATEGORIES.find(c => c.key === activeCategory)!;
    const currentPersType = PERS_TYPES[0]; // Only one type now (background)

    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="border-b border-overlay bg-surface/50 backdrop-blur-sm mb-4 md:mb-6">
                <div className="flex items-center justify-between py-3 md:py-4">
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-2xl font-display font-bold text-text-primary tracking-wider">
                            МАГАЗИН <span className="text-brand-accent">SCRAP</span>
                        </h1>
                        <p className="text-[10px] md:text-xs font-mono text-muted mt-0.5 md:mt-1">{'>'} Обменивай Scrap на уникальные предметы</p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        <button
                            onClick={() => setShowScrapInfo(true)}
                            className="text-xs md:text-sm font-mono font-bold text-yellow-400 hover:text-yellow-300 transition-colors hover:underline"
                        >
                            Как получить SCRAP?
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile category bar */}
            <div className="md:hidden mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 pb-2">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => handleCategoryChange(cat.key)}
                            className={`whitespace-nowrap px-3 py-2 font-mono text-xs border transition-all shrink-0 ${
                                activeCategory === cat.key
                                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
                                    : 'border-overlay text-muted hover:text-text-primary'
                            }`}
                        >
                            {cat.icon} {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex gap-6">
                {/* Sidebar categories — desktop only */}
                <div className="w-56 shrink-0 hidden md:block">
                    <div className="sticky top-24 space-y-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-mono text-muted px-3 pb-2 tracking-widest">КАТЕГОРИИ</p>
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => handleCategoryChange(cat.key)}
                                    className={`w-full text-left px-3 py-2.5 font-mono text-sm transition-all border-l-2 ${
                                        activeCategory === cat.key
                                            ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
                                            : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                                    }`}
                                >
                                    <span className="mr-2">{cat.icon}</span>
                                    {cat.label}
                                    {cat.key === 'springpro' && (
                                        <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 font-bold relative -top-[2px]">PRO</span>
                                    )}
                                </button>
                            ))}
                        </div>

                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Category header */}
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-2xl">{activeCatData.icon}</span>
                            <h2 className="text-xl font-display font-bold text-text-primary tracking-wide">{activeCatData.label}</h2>
                            {activeCategory === 'springpro' && (
                                <span className="text-[10px] px-2 py-0.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 font-mono font-bold border border-yellow-500/30">
                                    PREMIUM
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-mono text-muted">{activeCatData.description}</p>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1,2,3,4,5,6].map(i => (
                                <div key={i} className="h-40 bg-surface border border-overlay animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeCategory}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                            >
                                {activeCategory === 'personalization' ? (
                                    /* ═══ Personalization: upload form + my requests ═══ */
                                    <div className="space-y-6">
                                        {/* Upload form */}
                                        <div className="p-4 md:p-6 border border-brand-accent/30 bg-brand-accent/5 space-y-4">
                                            <h3 className="text-sm font-mono font-bold text-text-primary">🖼️ Фон профиля</h3>
                                            <p className="text-[10px] font-mono text-muted">
                                                Загрузите изображение для полноэкранного фона вашего профиля. Стоимость: <span className="text-yellow-400 font-bold inline-flex items-center gap-0.5">{PERS_PRICE}<ScrapIcon className="w-3.5 h-3.5" /></span>. Заявка будет отправлена на модерацию.
                                            </p>

                                            {/* File input */}
                                            <div>
                                                <label className="text-xs font-mono text-muted block mb-1.5">Изображение фона</label>
                                                <input
                                                    ref={fileRef}
                                                    type="file"
                                                    accept={currentPersType.accept}
                                                    onChange={e => setPersFile(e.target.files?.[0] || null)}
                                                    className="w-full bg-base border border-overlay p-3 text-sm text-text-primary font-mono file:mr-3 file:px-3 file:py-1 file:text-xs file:font-mono file:bg-surface file:border file:border-overlay file:text-text-secondary file:cursor-pointer"
                                                />
                                                {persFile && (
                                                    <p className="text-[10px] font-mono text-muted mt-1">{persFile.name} ({(persFile.size / 1024).toFixed(0)} KB)</p>
                                                )}
                                            </div>

                                            {/* Warning + submit */}
                                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-[10px] font-mono text-yellow-400/80">
                                                Возврат Scrap возможен в течение 10 мин после отправки
                                            </div>

                                            <button
                                                onClick={handlePersSubmit}
                                                disabled={persSending || scrap < PERS_PRICE}
                                                className="px-6 py-3 text-sm font-mono font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-30 transition-all"
                                            >
                                                {persSending ? 'ОТПРАВКА...' : <span className="inline-flex items-center gap-1">ОТПРАВИТЬ ({PERS_PRICE}<ScrapIcon className="w-3.5 h-3.5" />)</span>}
                                            </button>
                                            {scrap < PERS_PRICE && (
                                                <p className="text-[10px] font-mono text-red-400">Недостаточно Scrap (нужно {PERS_PRICE}, у вас {scrap})</p>
                                            )}
                                        </div>

                                        {/* My requests */}
                                        {persRequests.length > 0 && (
                                            <div>
                                                <h3 className="text-sm font-mono font-bold text-text-primary mb-3">Мои заявки</h3>
                                                <div className="space-y-2">
                                                    {persRequests.map(r => {
                                                        const st = STATUS_LABELS[r.status] || { text: r.status, color: 'text-muted' };
                                                        const typeLabel = PERS_TYPES.find(t => t.value === r.type)?.label || r.type;
                                                        return (
                                                            <div key={r.id} className="flex items-center gap-3 p-3 bg-surface border border-overlay flex-wrap">
                                                                <span className="text-xs font-mono text-text-secondary">{typeLabel}</span>
                                                                <span className={`text-[10px] font-mono font-bold ${st.color}`}>{st.text}</span>
                                                                <span className="text-[10px] font-mono text-muted inline-flex items-center gap-0.5">{r.price} <ScrapIcon className="w-3 h-3" /></span>
                                                                {r.type === 'status' && r.text_value && (
                                                                    <span className="text-xs font-mono text-text-primary">"{r.text_value}"</span>
                                                                )}
                                                                {r.file_url && r.type !== 'status' && (
                                                                    r.file_url.match(/\.(mp4|webm|ogg)$/i)
                                                                        ? <video src={`${API_BASE}${r.file_url}`} className="w-10 h-10 object-cover border border-overlay" muted />
                                                                        : <img src={`${API_BASE}${r.file_url}`} className="w-10 h-10 object-cover border border-overlay" alt="" />
                                                                )}
                                                                {r.created_at && (
                                                                    <span className="text-[10px] font-mono text-muted ml-auto">
                                                                        {new Date(r.created_at).toLocaleString()}
                                                                    </span>
                                                                )}
                                                                {r.refundable && (
                                                                    <button
                                                                        onClick={() => handleRefund(r.id)}
                                                                        className="px-3 py-1.5 text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
                                                                    >
                                                                        ВЕРНУТЬ
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : activeCategory === 'springpro' ? (
                                    /* SPRINGPRO special layout */
                                    <div className="space-y-6">
                                        {/* Subscription card */}
                                        <div className="p-4 md:p-6 border border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                            <h3 className="text-lg font-display font-bold text-yellow-400 mb-2">SPRINGPRO</h3>
                                            <p className="text-xs font-mono text-muted mb-4 max-w-md">
                                                Премиум подписка. Загрузка баннеров и аватарок, +50% к начислению Scrap, эксклюзивный бейдж.
                                            </p>
                                            <div className="flex flex-wrap gap-3 mb-4">
                                                <span className="px-2 py-1 text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">+50% SCRAP</span>
                                                <span className="px-2 py-1 text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">ЗАГРУЗКА БАННЕРОВ</span>
                                                <span className="px-2 py-1 text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">БЕЙДЖ PRO</span>
                                            </div>
                                            {subscriptionActive && (
                                                <div className="p-3 bg-green-500/10 border border-green-500/30 mb-4">
                                                    <span className="text-sm font-mono text-green-400 font-bold">SPRINGPRO АКТИВЕН</span>
                                                    {subscriptionExpires && (
                                                        <span className="text-[10px] font-mono text-muted ml-3">до {new Date(subscriptionExpires).toLocaleDateString('ru-RU')}</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Ruble payment plans */}
                                            <div className="mb-4">
                                                <p className="text-[10px] font-mono text-muted mb-2 uppercase tracking-wider">Оплата рублями</p>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {(springproPlans.length > 0 ? springproPlans : [
                                                        {id: 'springpro_1m', months: 1, price_rub: 159, label: ''},
                                                        {id: 'springpro_3m', months: 3, price_rub: 419, label: 'economy_5'},
                                                        {id: 'springpro_12m', months: 12, price_rub: 1490, label: 'economy_20'},
                                                    ]).map(plan => (
                                                        <button
                                                            key={plan.id}
                                                            onClick={() => handleRealPayment('springpro', plan.id)}
                                                            disabled={paymentProcessing !== null}
                                                            className="p-3 text-center border border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 hover:from-yellow-500/10 hover:to-orange-500/10 disabled:opacity-30 transition-all"
                                                        >
                                                            <div className="text-xs font-mono font-bold text-yellow-400">{plan.months === 1 ? '1 месяц' : plan.months === 3 ? '3 месяца' : '12 месяцев'}</div>
                                                            <div className="text-lg font-mono font-bold text-text-primary mt-1">{plan.price_rub}₽</div>
                                                            {plan.label === 'economy_5' && <div className="text-[9px] font-mono text-green-400 mt-0.5">Экономия 5%</div>}
                                                            {plan.label === 'economy_20' && <div className="text-[9px] font-mono text-green-400 mt-0.5">Скидка 20%</div>}
                                                            {paymentProcessing === plan.id && <div className="text-[9px] font-mono text-muted mt-1">ОБРАБОТКА...</div>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Scrap payment plans */}
                                            <div>
                                                <p className="text-[10px] font-mono text-muted mb-2 uppercase tracking-wider">Оплата SCRAP</p>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        {plan: 'springpro_month', label: '1 месяц', price: 1200, oldPrice: null as number | null},
                                                        {plan: 'springpro_3month', label: '3 месяца', price: 3000, oldPrice: 3600},
                                                        {plan: 'springpro_year', label: '1 год', price: 8500, oldPrice: 14400},
                                                    ].map(opt => (
                                                        <button
                                                            key={opt.plan}
                                                            onClick={() => {
                                                                if (donatedScrap < opt.price) {
                                                                    showToaster(`Недостаточно донатных SCRAP, у вас: ${donatedScrap.toLocaleString()}`);
                                                                    return;
                                                                }
                                                                handleSubscribeWithScrap(opt.plan);
                                                            }}
                                                            disabled={paymentProcessing !== null}
                                                            className="p-3 text-center border border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 hover:from-yellow-500/10 hover:to-orange-500/10 disabled:opacity-30 transition-all"
                                                        >
                                                            <div className="text-xs font-mono font-bold text-yellow-400">{opt.label}</div>
                                                            <div className="mt-1 flex flex-col items-center">
                                                                <span className="text-lg font-mono font-bold text-text-primary ml-4 inline-flex items-center gap-0.5">{opt.price.toLocaleString()}<ScrapIcon className="w-4 h-4" /></span>
                                                                {opt.oldPrice && <span className="text-[10px] font-mono text-muted line-through ml-3 inline-flex items-center gap-0.5">{opt.oldPrice.toLocaleString()}<ScrapIcon className="w-3 h-3 opacity-50" /></span>}
                                                            </div>
                                                            {paymentProcessing === ('scrap_sub_' + opt.plan) && <div className="text-[9px] font-mono text-muted mt-1">ОБРАБОТКА...</div>}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-[12px] font-mono text-muted mt-3 inline-flex items-center gap-0.5">Ваш баланс: <span className="text-text-primary font-bold">{donatedScrap.toLocaleString()}</span><ScrapIcon className="w-3.5 h-3.5" /> донатных</p>
                                            </div>
                                        </div>

                                        {/* SCRAP Purchase — Genshin-style cards */}
                                        <div className="p-4 md:p-6 border border-overlay bg-surface/50">
                                            <h3 className="text-base font-display font-bold text-text-primary mb-1">Купить SCRAP</h3>
                                            <p className="text-[10px] font-mono text-muted mb-4">Пополните баланс донатных Scrap за реальные деньги</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                                {scrapPackages.map(pkg => {
                                                    const TIER_NAMES: Record<string, string> = {
                                                        scrap_600: 'Базовый',
                                                        scrap_1600: 'Стандартный',
                                                        scrap_3500: 'Продвинутый',
                                                        scrap_8000: 'Премиум',
                                                        scrap_18000: 'Супер',
                                                        scrap_50000: 'VIP',
                                                        scrap_120000: 'Элитный',
                                                    };
                                                    const BADGE_MAP: Record<string, string> = {
                                                        popular: 'Хит',
                                                        discount_30: 'Выгода 30%',
                                                        discount_40: 'Выгода 40%',
                                                        vip: 'VIP',
                                                        elite: 'Элита',
                                                    };
                                                    const tierName = TIER_NAMES[pkg.id] || '';
                                                    const badgeText = pkg.label ? BADGE_MAP[pkg.label] || pkg.label : '';
                                                    const isPopular = pkg.label === 'popular';
                                                    const isSelected = selectedScrapPkg?.id === pkg.id;
                                                    return (
                                                        <div
                                                            key={pkg.id}
                                                            onClick={() => setSelectedScrapPkg(pkg)}
                                                            className={`relative p-3 border rounded-lg transition-all flex flex-col items-center justify-center min-h-[140px] cursor-pointer select-none group
                                                                ${isSelected ? 'border-yellow-400/70 bg-yellow-500/10 ring-2 ring-yellow-400/30 shadow-[0_0_16px_rgba(234,179,8,0.15)]' : ''}
                                                                ${isPopular && !isSelected ? 'border-orange-500/40 bg-orange-500/5 hover:border-orange-500/60 hover:bg-orange-500/10' : ''}
                                                                ${!isPopular && !isSelected ? 'border-overlay bg-base hover:border-yellow-500/30 hover:bg-yellow-500/5' : ''}
                                                            `}
                                                        >
                                                            {badgeText && (
                                                                <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold px-2 py-0.5 whitespace-nowrap rounded-full ${isPopular ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                                                                    {badgeText}
                                                                </span>
                                                            )}
                                                            <div className="text-2xl font-mono font-bold text-yellow-400 text-center leading-tight flex items-center justify-center gap-1 ml-5">
                                                                {pkg.scrap.toLocaleString()}<ScrapIcon className="w-5 h-5" />
                                                            </div>
                                                            {tierName && (
                                                                <span className="text-[10px] font-mono text-muted/80 mt-1">{tierName}</span>
                                                            )}
                                                            <span className="text-sm font-mono font-bold text-text-primary mt-2">{pkg.price_rub.toLocaleString()}₽</span>
                                                            {pkg.first_buy_x2 && (
                                                                <span className="text-[9px] font-mono text-green-400 mt-0.5 opacity-80 group-hover:opacity-100">x2 первая покупка</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* SCRAP package detail modal — rendered via portal to always center on viewport */}
                                        {selectedScrapPkg && createPortal(
                                            <div
                                                className="fixed inset-0 z-[9999] flex items-center justify-center"
                                                style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
                                                onClick={() => setSelectedScrapPkg(null)}
                                            >
                                                <div className="bg-surface border border-overlay rounded-xl p-6 max-w-sm w-full mx-4 relative shadow-2xl" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => setSelectedScrapPkg(null)} className="absolute top-3 right-3 text-muted hover:text-text-primary text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors">&times;</button>

                                                    {/* Header — big number + tier + price */}
                                                    <div className="text-center mb-6">
                                                        <div className="text-5xl font-mono font-bold text-yellow-400 leading-tight">
                                                            {selectedScrapPkg.scrap.toLocaleString()}
                                                        </div>
                                                        <p className="text-xs font-mono text-yellow-400/60 uppercase tracking-widest mt-1">Scrap</p>
                                                        <p className="text-sm font-mono text-muted mt-2">
                                                            {{
                                                                scrap_600: 'Базовый',
                                                                scrap_1600: 'Стандартный',
                                                                scrap_3500: 'Продвинутый',
                                                                scrap_8000: 'Премиум',
                                                                scrap_18000: 'Супер',
                                                                scrap_50000: 'VIP',
                                                                scrap_120000: 'Элитный',
                                                            }[selectedScrapPkg.id] || 'Пакет'}
                                                        </p>
                                                        <div className="text-2xl font-mono font-bold text-text-primary mt-3">
                                                            {selectedScrapPkg.price_rub.toLocaleString()} ₽
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => { handleRealPayment('scrap', selectedScrapPkg.id); setSelectedScrapPkg(null); }}
                                                        disabled={paymentProcessing !== null}
                                                        className="w-full py-3.5 text-sm font-mono font-bold bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border border-yellow-500/30 hover:from-yellow-500/30 hover:to-orange-500/30 disabled:opacity-30 transition-all rounded-lg"
                                                    >
                                                        {paymentProcessing === selectedScrapPkg.id ? 'ОБРАБОТКА...' : `КУПИТЬ ЗА ${selectedScrapPkg.price_rub.toLocaleString()} ₽`}
                                                    </button>

                                                    {selectedScrapPkg.first_buy_x2 && (
                                                        <p className="text-[10px] font-mono text-red-400 font-bold text-center mt-3 uppercase tracking-wide">
                                                            x2 начисляется обычными SCRAP
                                                        </p>
                                                    )}
                                                </div>
                                            </div>,
                                            document.body
                                        )}

                                        {/* Existing SPRINGPRO shop items (excluding subscription plans) */}
                                        {filteredItems.filter(i => !['springpro_month', 'springpro_3month', 'springpro_year'].includes(i.key)).length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                {filteredItems.filter(i => !['springpro_month', 'springpro_3month', 'springpro_year'].includes(i.key)).map(item => {
                                                    const owned = myPurchases.includes(item.key);
                                                    return (
                                                        <div key={item.key} className={`p-4 border text-center transition-all flex flex-col items-center ${owned ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-overlay bg-base hover:border-yellow-500/30'}`}>
                                                            <div className="text-3xl mb-2">{item.preview}</div>
                                                            <p className="text-sm font-mono font-bold text-text-primary">{item.name}</p>
                                                            <p className="text-[10px] font-mono text-muted mt-1 mb-3">{item.description}</p>
                                                            <div className="text-sm font-mono font-bold text-yellow-400 mb-2 w-full text-center ml-2 inline-flex items-center justify-center gap-0.5">{item.price}<ScrapIcon className="w-3.5 h-3.5" /></div>
                                                            {owned ? (
                                                                <span className="text-[10px] font-mono text-brand-accent font-bold">КУПЛЕНО</span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleBuy(item)}
                                                                    disabled={buyingKey !== null || scrap < item.price}
                                                                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all"
                                                                >
                                                                    {buyingKey === item.key ? '...' : 'КУПИТЬ'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ) : activeCategory === 'frame' ? (
                                    /* Frames — Steam-style cards */
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3">
                                        {filteredItems.map(item => {
                                            const owned = myPurchases.includes(item.key);
                                            const active = owned && isItemActive(item);
                                            const canActivate = owned && ACTIVATABLE_CATEGORIES.includes(item.category);
                                            const isFree = item.price === 0;
                                            const frameSrc = item.preview.startsWith('/Frames_shop/') ? item.preview : (item.preview.startsWith('/Frames_lvl/') ? `${API_BASE}${item.preview}` : item.preview);
                                            console.log('Frame item:', item.key, 'preview:', item.preview, 'frameSrc:', frameSrc);
                                            return (
                                                <div key={item.key} className={`group relative overflow-hidden rounded transition-all duration-200 hover:scale-[1.02] ${active ? 'ring-2 ring-green-500/60' : owned ? 'ring-1 ring-brand-accent/30' : 'ring-1 ring-white/5 hover:ring-white/15'}`}>
                                                    {/* Steam-style dark card */}
                                                    <div className="relative bg-gradient-to-b from-[#1a1a2e] to-[#0a0a15] aspect-square flex items-center justify-center overflow-hidden">
                                                        {/* Avatar + Frame — remanga style */}
                                                        <div className="relative flex shrink-0 overflow-visible" style={{ width: '75%', height: '75%', margin: '12.5%', borderRadius: 12 }}>
                                                            {/* Avatar — z-[1] */}
                                                            <div className="z-[1] aspect-square size-full bg-gradient-to-br from-[#2a2a3e] to-[#1a1a2e]" style={{ borderRadius: 12, overflow: 'hidden' }}>
                                                                {avatarUrl ? (
                                                                    <img src={avatarUrl.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <span className="text-sm sm:text-base font-bold text-white/40">?</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Frame overlay — z-[2], scale-125 */}
                                                            <span className="inline-flex shrink-0 absolute top-0 left-0 z-[2] scale-125 select-none pointer-events-none">
                                                                <img
                                                                    src={frameSrc}
                                                                    alt="frame"
                                                                    className="w-full h-full"
                                                                    loading="lazy"
                                                                />
                                                            </span>
                                                        </div>

                                                        {/* Active indicator */}
                                                        {active && (
                                                            <span className="absolute top-1 left-1 text-[8px] font-mono font-bold px-1 py-px bg-green-500/80 text-white rounded-sm z-20">✓</span>
                                                        )}
                                                    </div>

                                                    {/* Bottom info bar — Steam style */}
                                                    <div className="px-2 py-1.5 bg-[#0d0d1a] border-t border-white/5">
                                                        {item.name && <p className="text-[8px] sm:text-[9px] font-mono font-bold text-white/80 truncate mb-1">{item.name}</p>}
                                                        <div className="flex items-center justify-between gap-1">
                                                            {isFree ? (
                                                                <span className="text-[8px] sm:text-[9px] font-mono font-bold text-green-400">БЕСПЛАТНО</span>
                                                            ) : (
                                                                <span className="text-[8px] sm:text-[9px] font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{item.price} <ScrapIcon className="w-2.5 h-2.5" /></span>
                                                            )}
                                                            {owned ? (
                                                                active ? (
                                                                    <span className="text-[7px] sm:text-[8px] font-mono text-green-400 font-bold">АКТИВНО</span>
                                                                ) : canActivate ? (
                                                                    <button
                                                                        onClick={() => handleActivate(item)}
                                                                        disabled={activatingKey !== null}
                                                                        className="px-1.5 py-0.5 text-[7px] sm:text-[8px] font-mono font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 disabled:opacity-30 transition-all rounded-sm"
                                                                    >
                                                                        {activatingKey === item.key ? '...' : 'НАДЕТЬ'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-[7px] sm:text-[8px] font-mono text-brand-accent font-bold">КУПЛЕНО</span>
                                                                )
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleBuy(item)}
                                                                    disabled={buyingKey !== null || (!isFree && scrap < item.price)}
                                                                    className="px-1.5 py-0.5 text-[7px] sm:text-[8px] font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all rounded-sm"
                                                                >
                                                                    {buyingKey === item.key ? '...' : isFree ? 'ПОЛУЧИТЬ' : 'КУПИТЬ'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (activeCategory === 'skin' || activeCategory === 'cover' || activeCategory === 'background') ? (
                                    /* Skins / Covers / Backgrounds — rectangle cards with preview */
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                        {filteredItems.map(item => {
                                            const owned = myPurchases.includes(item.key);
                                            const active = owned && isItemActive(item);
                                            const canActivate = owned && ACTIVATABLE_CATEGORIES.includes(item.category);
                                            const rarity = item.rarity || 'common';
                                            const rarityColors: Record<string, { border: string; badge: string; text: string; glow: string }> = {
                                                common: { border: 'border-overlay', badge: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', text: 'COMMON', glow: '' },
                                                rare: { border: 'border-blue-500/40', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', text: 'RARE', glow: 'shadow-blue-500/10' },
                                                epic: { border: 'border-purple-500/40', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30', text: 'EPIC', glow: 'shadow-purple-500/10' },
                                                mythic: { border: 'border-yellow-500/40', badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', text: 'MYTHIC', glow: 'shadow-yellow-500/20 shadow-lg' },
                                                legendary: { border: 'border-orange-500/40', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30', text: 'LEGENDARY', glow: 'shadow-orange-500/20 shadow-lg' },
                                            };
                                            const rc = rarityColors[rarity] || rarityColors.common;
                                            const isFree = item.price === 0;
                                            return (
                                                <div key={item.key} className={`border transition-all overflow-hidden ${rc.glow} ${active ? 'border-green-500/50' : owned ? 'border-brand-accent/30' : rc.border + ' hover:border-muted'}`}>
                                                    {/* Preview bar */}
                                                    <div className={`relative overflow-hidden bg-base/80 h-20 sm:h-28`} style={item.preview.startsWith('#') ? { background: `linear-gradient(135deg, ${item.preview}, ${item.preview}88, #0a0a0a)` } : {}}>
                                                        {(item.preview.startsWith('/uploads/') || item.preview.startsWith('/Frames_lvl/')) ? (
                                                            /\.(mp4|webm|ogg)$/i.test(item.preview) ? (
                                                                <video src={`${API_BASE}${item.preview}`} muted loop autoPlay playsInline className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={`${API_BASE}${item.preview}`} alt="" className="w-full h-full object-cover" />
                                                            )
                                                        ) : item.preview.startsWith('/Frames_shop/') ? (
                                                            <img src={item.preview} alt="" className="w-full h-full object-cover" />
                                                        ) : !item.preview.startsWith('#') ? (
                                                            <div className="w-full h-full flex items-center justify-center text-4xl">{item.preview}</div>
                                                        ) : null}
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <span className="text-[10px] sm:text-xs font-mono font-bold text-white drop-shadow-lg px-1.5 py-0.5 sm:px-2 sm:py-1 bg-black/40 max-w-full truncate">{item.name}</span>
                                                        </div>
                                                        {/* Rarity badge */}
                                                        <span className={`absolute top-1 right-1 sm:top-2 sm:right-2 text-[7px] sm:text-[8px] font-mono font-bold px-1 py-px sm:px-1.5 sm:py-0.5 border ${rc.badge}`}>
                                                            {rc.text}
                                                        </span>
                                                    </div>
                                                    <div className="p-2 sm:p-3 bg-base">
                                                        <p className="text-[9px] sm:text-[10px] font-mono text-muted mb-1.5 sm:mb-2 line-clamp-2">{item.description}</p>
                                                        {/* Features for mythic/epic */}
                                                        {(rarity === 'mythic' || rarity === 'epic') && (
                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                {item.nickname_effect && item.nickname_effect !== 'none' && (
                                                                    <span className="text-[8px] font-mono px-1.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20">ЭФФЕКТ НИКА</span>
                                                                )}
                                                                {item.font_family && (
                                                                    <span className="text-[8px] font-mono px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20">ШРИФТ</span>
                                                                )}
                                                                {rarity === 'mythic' && (
                                                                    <span className="text-[8px] font-mono px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">ЦВЕТ НИКА</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between gap-1">
                                                            {isFree ? (
                                                                <span className="text-[10px] sm:text-xs font-mono font-bold text-green-400">БЕСПЛАТНО</span>
                                                            ) : (
                                                                <span className="text-[10px] sm:text-xs font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{item.price}<ScrapIcon className="w-3 h-3" /></span>
                                                            )}
                                                            {owned ? (
                                                                active ? (
                                                                    <div className="flex items-center gap-1 sm:gap-2">
                                                                        <span className="text-[8px] sm:text-[10px] font-mono text-green-400 font-bold">✓ АКТИВНО</span>
                                                                        {rarity === 'mythic' && (
                                                                            <button
                                                                                onClick={() => { setShowNickSettings(showNickSettings === item.key ? null : item.key); setNickColorInput(nicknameColor); setNickFontInput(nicknameFont); }}
                                                                                className="px-1.5 py-0.5 sm:px-2 sm:py-1 text-[7px] sm:text-[8px] font-mono font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-all"
                                                                            >
                                                                                ⚙ НИК
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : canActivate ? (
                                                                    <button
                                                                        onClick={() => handleActivate(item)}
                                                                        disabled={activatingKey !== null}
                                                                        className="px-2 py-1 sm:px-3 sm:py-1.5 text-[8px] sm:text-[10px] font-mono font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 disabled:opacity-30 transition-all"
                                                                    >
                                                                        {activatingKey === item.key ? '...' : 'ПРИМЕНИТЬ'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-[8px] sm:text-[10px] font-mono text-brand-accent font-bold">✓ КУПЛЕНО</span>
                                                                )
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleBuy(item)}
                                                                    disabled={buyingKey !== null || (!isFree && scrap < item.price)}
                                                                    className="px-2 py-1 sm:px-3 sm:py-1.5 text-[8px] sm:text-[10px] font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all"
                                                                >
                                                                    {buyingKey === item.key ? '...' : isFree ? 'ПОЛУЧИТЬ' : 'КУПИТЬ'}
                                                                </button>
                                                            )}
                                                        </div>
                                                        {/* Nickname customization panel for active mythic skins */}
                                                        {showNickSettings === item.key && active && rarity === 'mythic' && (
                                                            <div className="mt-3 pt-3 border-t border-overlay space-y-3">
                                                                <p className="text-[10px] font-mono font-bold text-yellow-400 tracking-wider">НАСТРОЙКА НИКА</p>
                                                                {/* Preview */}
                                                                <div className="p-2 bg-surface border border-overlay text-center">
                                                                    <span
                                                                        className="text-base font-bold"
                                                                        style={{
                                                                            color: nickColorInput || '#fff',
                                                                            fontFamily: nickFontInput || 'inherit',
                                                                        }}
                                                                    >
                                                                        Превью ника
                                                                    </span>
                                                                </div>
                                                                {/* Color picker */}
                                                                <div>
                                                                    <label className="text-[9px] font-mono text-muted block mb-1">Цвет ника</label>
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="color"
                                                                            value={nickColorInput || '#ffffff'}
                                                                            onChange={e => setNickColorInput(e.target.value)}
                                                                            className="w-8 h-8 border border-overlay bg-transparent cursor-pointer"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={nickColorInput}
                                                                            onChange={e => setNickColorInput(e.target.value)}
                                                                            placeholder="#ffffff"
                                                                            className="flex-1 px-2 py-1 text-[10px] font-mono bg-base border border-overlay text-text-primary"
                                                                        />
                                                                        {nickColorInput && (
                                                                            <button onClick={() => setNickColorInput('')} className="text-[9px] font-mono text-muted hover:text-red-400">✕</button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Font selector */}
                                                                <div>
                                                                    <label className="text-[9px] font-mono text-muted block mb-1">Шрифт ника</label>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {MYTHIC_FONTS.map(f => (
                                                                            <button
                                                                                key={f || '__default'}
                                                                                onClick={() => setNickFontInput(f)}
                                                                                className={`px-2 py-1 text-[9px] font-mono border transition-all ${
                                                                                    nickFontInput === f
                                                                                        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                                                                                        : 'border-overlay text-muted hover:text-text-primary'
                                                                                }`}
                                                                                style={{ fontFamily: f || 'inherit' }}
                                                                            >
                                                                                {f || 'По умолч.'}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                {/* Save button */}
                                                                <button
                                                                    onClick={handleSaveNickSettings}
                                                                    disabled={savingNick}
                                                                    className="w-full px-3 py-2 text-[10px] font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all"
                                                                >
                                                                    {savingNick ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* Default grid layout */
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                                        {filteredItems.map(item => {
                                            const owned = myPurchases.includes(item.key);
                                            const active = owned && isItemActive(item);
                                            const canActivate = owned && ACTIVATABLE_CATEGORIES.includes(item.category);
                                            const isLocked = item.locked || false;
                                            const isFree = item.price === 0;
                                            return (
                                                <motion.div
                                                    key={item.key}
                                                    layout
                                                    className={`p-2 sm:p-3 border transition-all ${isLocked ? 'border-red-500/30 bg-red-500/5 opacity-60' : active ? 'border-green-500/30 bg-green-500/5' : owned ? 'border-brand-accent/30 bg-brand-accent/5' : 'border-overlay bg-base hover:border-muted hover:bg-surface-hover'}`}
                                                >
                                                    <div className="flex flex-col items-center gap-2 mb-2 sm:mb-3">
                                                        {(item.preview.startsWith('/uploads/') || item.preview.startsWith('/Frames_lvl/')) ? (
                                                            /\.(mp4|webm|ogg)$/i.test(item.preview) ? (
                                                                <video src={`${API_BASE}${item.preview}`} muted loop autoPlay playsInline className="w-14 h-14 sm:w-16 sm:h-16 object-cover border border-overlay shrink-0" />
                                                            ) : (
                                                                <img src={`${API_BASE}${item.preview}`} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-cover border border-overlay shrink-0" />
                                                            )
                                                        ) : item.preview.startsWith('/Frames_shop/') ? (
                                                            <img src={item.preview} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-cover border border-overlay shrink-0" />
                                                        ) : (
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-xl sm:text-2xl bg-surface border border-overlay shrink-0">
                                                            {item.preview.startsWith('#') ? (
                                                                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full" style={{ backgroundColor: item.preview }} />
                                                            ) : (
                                                                item.preview
                                                            )}
                                                        </div>
                                                        )}
                                                        <div className="min-w-0 w-full text-center">
                                                            <p className="text-[10px] sm:text-sm font-mono font-bold text-text-primary truncate">{item.name}</p>
                                                            <p className="text-[8px] sm:text-[10px] font-mono text-muted mt-0.5 line-clamp-2">{item.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1.5 pt-2 border-t border-overlay/50">
                                                        {isFree && !isLocked ? (
                                                            <span className="text-[10px] sm:text-xs font-mono font-bold text-green-400">БЕСПЛАТНО</span>
                                                        ) : (
                                                            <span className="text-[10px] sm:text-xs font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{item.price}<ScrapIcon className="w-3 h-3" /></span>
                                                        )}
                                                        {isLocked ? (
                                                            <span className="text-[8px] sm:text-[10px] font-mono text-red-400 font-bold">🔒 ЗАБЛОКИРОВАНО</span>
                                                        ) : owned ? (
                                                            active ? (
                                                                <span className="text-[8px] sm:text-[10px] font-mono text-green-400 font-bold">✓ АКТИВНО</span>
                                                            ) : canActivate ? (
                                                                <button
                                                                    onClick={() => handleActivate(item)}
                                                                    disabled={activatingKey !== null}
                                                                    className="w-full px-2 py-1 sm:px-3 sm:py-1.5 text-[8px] sm:text-[10px] font-mono font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 disabled:opacity-30 transition-all"
                                                                >
                                                                    {activatingKey === item.key ? '...' : 'ПРИМЕНИТЬ'}
                                                                </button>
                                                            ) : (
                                                                <span className="text-[8px] sm:text-[10px] font-mono text-brand-accent font-bold">✓ КУПЛЕНО</span>
                                                            )
                                                        ) : (
                                                            <button
                                                                onClick={() => handleBuy(item)}
                                                                disabled={buyingKey !== null || (!isFree && scrap < item.price)}
                                                                className="w-full px-2 py-1 sm:px-3 sm:py-1.5 text-[8px] sm:text-[10px] font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all"
                                                            >
                                                                {buyingKey === item.key ? '...' : isFree ? 'ПОЛУЧИТЬ' : 'КУПИТЬ'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                        {filteredItems.length === 0 && (
                                            <div className="col-span-full py-16 text-center">
                                                <p className="font-mono text-muted text-sm">[ КАТЕГОРИЯ ПУСТА ]</p>
                                                <p className="font-mono text-muted/50 text-[10px] mt-1">Товары скоро появятся</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {hasMore && <div ref={loadMoreRef} className="h-10" />}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* ═══ PURCHASE CONFIRMATION MODAL ═══ */}
            {createPortal(
                <AnimatePresence>
                    {showConfirmModal && confirmItem && (() => {
                        const isFrame = confirmItem.category === 'frame';
                        const frameSrc = isFrame && confirmItem.preview.startsWith('/Frames_shop/') ? confirmItem.preview : (isFrame && confirmItem.preview.startsWith('/') ? `${API_BASE}${confirmItem.preview}` : null);
                        const userAvatarSrc = avatarUrl ? (avatarUrl.startsWith('/') ? `${API_BASE}${avatarUrl}` : avatarUrl) : null;
                        const userBannerSrc = bannerUrl ? (bannerUrl.startsWith('/') ? `${API_BASE}${bannerUrl}` : bannerUrl) : null;
                        console.log('ShopPage modal - nicknameColor:', nicknameColor, 'nicknameFont:', nicknameFont, 'username:', user?.username || username);
                        return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setShowConfirmModal(false); setConfirmItem(null); }}
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99999] flex items-center justify-center p-4"
                            style={{ overflow: 'hidden' }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                onClick={e => e.stopPropagation()}
                                className={`w-full bg-surface border border-overlay shadow-2xl overflow-hidden ${isFrame ? 'max-w-2xl' : 'max-w-sm'}`}
                            >
                                {/* Header */}
                                <div className="px-5 pt-5 pb-3 border-b border-overlay">
                                    <h3 className="text-sm font-mono font-bold text-text-primary tracking-wider">ПОДТВЕРЖДЕНИЕ ПОКУПКИ</h3>
                                </div>

                                {/* Frame preview — mini profile card */}
                                {isFrame && frameSrc && (
                                    <div className="relative overflow-hidden" style={{ height: 320 }}>
                                        {/* Background: banner or skin gradient */}
                                        {userBannerSrc ? (
                                            <div className="absolute inset-0">
                                                {userBannerSrc.endsWith('.mp4') || userBannerSrc.endsWith('.webm') ? (
                                                    <video src={userBannerSrc} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={userBannerSrc} alt="" className="w-full h-full object-cover" />
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 profile-surface-bg bg-gradient-to-b from-surface to-base" />
                                        )}
                                        {/* Avatar + Frame + Username */}
                                        <div className="relative z-10 px-4 sm:px-4 pt-24 sm:pt-32 pb-8 sm:pb-10">
                                            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 sm:justify-start">
                                                <div className="relative flex shrink-0 overflow-visible" style={{ width: '8rem', height: '8rem', margin: '1rem', borderRadius: 12 }}>
                                                    {/* Avatar — z-[1] */}
                                                    <div className="z-[1] aspect-square size-full bg-gradient-to-br from-[#2a2a3e] to-[#1a1a2e]" style={{ borderRadius: 12, overflow: 'hidden' }}>
                                                        {userAvatarSrc ? (
                                                            <img src={userAvatarSrc} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/40">?</div>
                                                        )}
                                                    </div>
                                                    {/* Frame — z-[2], scale-125 */}
                                                    <span className="inline-flex shrink-0 absolute top-0 left-0 z-[2] scale-125 select-none pointer-events-none">
                                                        <img src={confirmItem.preview.startsWith('/Frames_shop/') ? confirmItem.preview : (confirmItem.preview.startsWith('/') ? `${API_BASE}${confirmItem.preview}` : confirmItem.preview)} alt="frame" style={{ width: '8rem', height: '8rem' }} />
                                                    </span>
                                                </div>
                                                <div className="flex-1 text-center sm:text-left min-w-0">
                                                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white drop-shadow-lg truncate"
                                                        style={{
                                                            color: nicknameColor || undefined,
                                                            fontFamily: nicknameFont ? `'${nicknameFont}', monospace` : undefined
                                                        }}>
                                                        {user?.username || username || 'Username'}
                                                    </h1>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Item info (non-frame items keep original layout) */}
                                <div className="px-5 py-4">
                                    {!isFrame && (
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-14 h-14 flex items-center justify-center text-3xl bg-base border border-overlay shrink-0">
                                                {confirmItem.preview.startsWith('#') ? (
                                                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: confirmItem.preview }} />
                                                ) : confirmItem.preview.startsWith('/') ? (
                                                    <img src={`${API_BASE}${confirmItem.preview}`} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    confirmItem.preview
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-mono font-bold text-text-primary truncate">{confirmItem.name || confirmItem.description}</p>
                                                <p className="text-[10px] font-mono text-muted mt-0.5">{confirmItem.description}</p>
                                            </div>
                                        </div>
                                    )}


                                    <div className="flex items-center justify-between p-3 bg-base border border-overlay mb-3">
                                        <span className="text-xs font-mono text-muted">Стоимость:</span>
                                        <span className="text-sm font-mono font-bold text-yellow-400 inline-flex items-center gap-1">{confirmItem.price} <ScrapIcon className="w-4 h-4" /></span>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-base border border-overlay">
                                        <span className="text-xs font-mono text-muted">Ваш баланс:</span>
                                        <span className={`text-sm font-mono font-bold inline-flex items-center gap-0.5 ${scrap >= confirmItem.price ? 'text-green-400' : 'text-red-400'}`}>{scrap} <ScrapIcon className="w-4 h-4" /></span>
                                    </div>

                                    {scrap < confirmItem.price && (
                                        <p className="text-[10px] font-mono text-red-400 mt-2">Недостаточно Scrap для покупки</p>
                                    )}
                                </div>

                                {/* Buttons */}
                                <div className="px-5 pb-5 flex gap-3">
                                    <button
                                        onClick={() => { setShowConfirmModal(false); setConfirmItem(null); }}
                                        className="flex-1 px-4 py-2.5 text-xs font-mono font-bold bg-base text-text-secondary border border-overlay hover:bg-surface-hover transition-all"
                                    >
                                        ОТМЕНА
                                    </button>
                                    <button
                                        onClick={handleConfirmPurchase}
                                        disabled={scrap < confirmItem.price}
                                        className="flex-1 px-4 py-2.5 text-xs font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-30 transition-all"
                                    >
                                        КУПИТЬ
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                        );
                    })()}
                </AnimatePresence>,
                document.body
            )}

            {/* ═══ HOW TO GET SCRAP MODAL ═══ */}
            <AnimatePresence>
                {showScrapInfo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowScrapInfo(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-md bg-surface border border-overlay shadow-2xl"
                        >
                            <div className="px-5 pt-5 pb-3 border-b border-overlay flex items-center justify-between">
                                <h3 className="text-sm font-mono font-bold text-yellow-400 tracking-wider">КАК ПОЛУЧИТЬ SCRAP?</h3>
                                <button onClick={() => setShowScrapInfo(false)} className="w-7 h-7 flex items-center justify-center text-muted hover:text-text-primary hover:bg-overlay/50 transition-all text-sm">✕</button>
                            </div>
                            <div className="px-5 py-5 space-y-3">
                                <div className="flex items-center justify-between py-2 border-b border-overlay/50">
                                    <span className="text-sm font-mono text-text-secondary">📅 Ежедневный вход</span>
                                    <span className="text-sm font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">25 <ScrapIcon className="w-4 h-4" /></span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-overlay/50">
                                    <span className="text-sm font-mono text-text-secondary">💬 Коммент</span>
                                    <span className="text-sm font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">10 <ScrapIcon className="w-4 h-4" /></span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-overlay/50">
                                    <span className="text-sm font-mono text-text-secondary">📖 Каждая 5-я глава</span>
                                    <span className="text-sm font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">5 <ScrapIcon className="w-4 h-4" /></span>
                                </div>
                                <div className="pt-2 text-xs font-mono text-muted/60">
                                    макс. 5 комментов/день
                                </div>
                                <div className="pt-3 mt-2 border-t border-yellow-500/20 bg-yellow-500/5 -mx-5 px-5 py-3">
                                    <span className="text-sm font-mono font-bold text-yellow-400">👑 SPRINGPRO: +50%</span>
                                    <span className="text-sm font-mono text-muted ml-2">ко всем начислениям!</span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ShopPage;
