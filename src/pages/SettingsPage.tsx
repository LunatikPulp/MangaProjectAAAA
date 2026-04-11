import React, { useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { API_BASE } from '../services/externalApiService';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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

type SettingsTab = 'profile' | 'security' | 'content' | 'notifications';

const SettingsPage: React.FC = () => {
    const { user, updateUser, refreshUser, deleteAccount } = useContext(AuthContext);
    const { showToaster } = useContext(ToasterContext);
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

    // Profile form
    const [newUsername, setNewUsername] = useState('');
    const [newBio, setNewBio] = useState('');
    const [newBirthday, setNewBirthday] = useState('');
    const [newGender, setNewGender] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    // Security
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

    // Content/privacy
    const [newEroticFilter, setNewEroticFilter] = useState('hide');
    const [newPrivateProfile, setNewPrivateProfile] = useState(false);
    const [newAllowTrades, setNewAllowTrades] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(false);

    // Horror mode
    const [horrorDisabled, setHorrorDisabled] = useState(() => localStorage.getItem('nightmare_disabled') === 'true');
    const nightmareDiscovered = localStorage.getItem('nightmare_discovered') === 'true';

    // Notifications
    const [newNotifyEmail, setNewNotifyEmail] = useState(true);
    const [newNotifyVk, setNewNotifyVk] = useState(false);
    const [newNotifyTelegram, setNewNotifyTelegram] = useState(false);

    // Avatar
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const cropImgRef = useRef<HTMLImageElement>(null);
    const avatarFileRef = useRef<HTMLInputElement>(null);
    const [mediaCacheBuster, setMediaCacheBuster] = useState(Date.now());

    // Init form values from user
    useEffect(() => {
        if (!user) return;
        setNewUsername(user.username);
        setNewBio(user.bio || '');
        setNewBirthday(user.birthday || '');
        setNewGender(user.gender || '');
        setNewEroticFilter(user.erotic_filter || 'hide');
        setNewPrivateProfile(user.private_profile || false);
        setNewAllowTrades(user.allow_trades !== false);
        setNewNotifyEmail(user.notify_email !== false);
        setNewNotifyVk(user.notify_vk || false);
        setNewNotifyTelegram(user.notify_telegram || false);
        setSoundEnabled((user as any).sound_enabled || false);
    }, [user]);

    // Lock body scroll when crop modal open
    useEffect(() => {
        if (cropImageSrc) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = '';
        return () => { document.body.style.overflow = ''; };
    }, [cropImageSrc]);

    if (!user) return <div className="text-center p-8 font-mono text-muted">[ ЗАГРУЗКА ]</div>;

    const avatarSrc = user.avatar_url ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_BASE}${user.avatar_url}`) : '';
    const cacheSuffix = mediaCacheBuster ? `?v=${mediaCacheBuster}` : '';

    // Handlers
    const handleSaveProfile = async () => {
        if (!newUsername.trim()) return;
        setProfileSaving(true);
        await updateUser({
            username: newUsername, birthday: newBirthday,
            gender: newGender, erotic_filter: newEroticFilter as any,
            private_profile: newPrivateProfile, allow_trades: newAllowTrades,
            notify_email: newNotifyEmail, notify_vk: newNotifyVk, notify_telegram: newNotifyTelegram,
            bio: newBio, sound_enabled: soundEnabled,
        });
        setProfileSaving(false);
        showToaster('Настройки сохранены!');
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

    const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { setCropImageSrc(reader.result as string); setCrop(undefined); setCompletedCrop(undefined); };
        reader.readAsDataURL(file);
        if (avatarFileRef.current) avatarFileRef.current.value = '';
    };

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
            const token = localStorage.getItem('backend_token');
            const formData = new FormData();
            formData.append('file', blob, 'avatar.jpg');
            const res = await fetch(`${API_BASE}/auth/avatar`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (res.ok) {
                await refreshUser();
                setMediaCacheBuster(Date.now());
                showToaster('Аватарка обновлена!');
                setCropImageSrc(null);
            } else { showToaster('Ошибка загрузки'); }
        } catch { showToaster('Ошибка сети'); }
        finally { setAvatarLoading(false); }
    };

    const handleHorrorToggle = (disabled: boolean) => {
        setHorrorDisabled(disabled);
        localStorage.setItem('nightmare_disabled', disabled ? 'true' : 'false');
    };

    const tabs: { key: SettingsTab; label: string; icon: string }[] = [
        { key: 'profile', label: 'Профиль', icon: '>' },
        { key: 'security', label: 'Безопасность', icon: '>' },
        { key: 'content', label: 'Контент', icon: '>' },
        { key: 'notifications', label: 'Уведомления', icon: '>' },
    ];

    return (
        <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-sm font-mono font-bold text-text-primary uppercase tracking-widest">НАСТРОЙКИ</h1>
                <button onClick={() => navigate(-1)} className="px-3 py-1.5 text-[10px] font-mono font-bold text-muted hover:text-text-primary border border-overlay hover:border-brand-accent transition-all">
                    НАЗАД
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-overlay p-1 mb-6 overflow-x-auto scrollbar-hide">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex-shrink-0 text-[11px] font-mono font-medium py-2.5 px-4 transition-all ${
                            activeTab === t.key ? 'bg-surface text-brand-accent shadow-sm' : 'text-muted hover:text-text-secondary'
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
                <div className="space-y-5">
                    <SectionTitle>Аватарка</SectionTitle>
                    <div className="flex items-center gap-4">
                        <div className="relative group shrink-0">
                            <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-overlay bg-base">
                                {avatarSrc ? (
                                    <img src={`${avatarSrc}${cacheSuffix}`} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <Avatar name={user.username} size={80} />
                                )}
                            </div>
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-all">
                                <span className="text-white text-xs font-mono">{avatarLoading ? '...' : '+'}</span>
                                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileSelect} disabled={avatarLoading} />
                            </label>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-mono text-text-primary font-bold">Сменить аватарку</p>
                            <p className="text-[10px] font-mono text-muted mt-0.5">JPG, PNG, WebP, GIF</p>
                            <button onClick={() => avatarFileRef.current?.click()} disabled={avatarLoading}
                                className="mt-1.5 px-3 py-1 text-[10px] font-mono font-bold bg-brand-accent/10 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/20 transition-all disabled:opacity-50">
                                ВЫБРАТЬ ФОТО
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-overlay" />
                    <SectionTitle>Основная информация</SectionTitle>

                    <InputField label="Имя пользователя" value={newUsername} onChange={setNewUsername} />
                    <div>
                        <label className="text-xs font-mono font-medium text-muted block mb-1.5">Био <span className="text-muted/50">({newBio.length}/500)</span></label>
                        <textarea rows={3} placeholder="Краткое описание..." value={newBio} onChange={e => setNewBio(e.target.value.slice(0, 500))}
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

            {/* SECURITY TAB */}
            {activeTab === 'security' && (
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
                        <h3 className="text-[10px] font-mono font-bold text-red-400/80 mb-2 uppercase tracking-widest">DANGER ZONE</h3>
                        <p className="text-[10px] text-muted font-mono mb-3">Это действие необратимо. Все данные будут удалены.</p>
                        <button onClick={() => setDeleteModalOpen(true)}
                            className="px-4 py-2 text-[10px] font-mono font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors">
                            УДАЛИТЬ АККАУНТ
                        </button>
                    </div>
                </div>
            )}

            {/* CONTENT TAB */}
            {activeTab === 'content' && (
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
                        <Toggle label="Системные звуки" description="Звуковые эффекты при действиях" checked={soundEnabled} onChange={setSoundEnabled} />
                    </div>

                    {nightmareDiscovered && (
                        <>
                            <div className="border-t border-overlay" />
                            <SectionTitle>Horror Mode</SectionTitle>
                            <Toggle
                                label="Отключить Horror Mode"
                                description="Отключить пасхалку с аватаркой"
                                checked={horrorDisabled}
                                onChange={handleHorrorToggle}
                            />
                        </>
                    )}

                    <button onClick={handleSaveProfile} disabled={profileSaving}
                        className="w-full py-3 bg-brand text-white font-mono font-bold hover:bg-brand-hover disabled:opacity-50 transition-all active:scale-[0.98]">
                        {profileSaving ? '...' : 'СОХРАНИТЬ'}
                    </button>
                </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
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

            {/* Crop Modal */}
            {cropImageSrc && (
                <div className="fixed inset-0 z-[12000] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-surface border border-overlay p-4 max-w-md w-full">
                        <h3 className="text-sm font-mono font-bold text-text-primary mb-3">Обрезать аватарку</h3>
                        <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={1} circularCrop>
                            <img ref={cropImgRef} src={cropImageSrc} onLoad={onCropImageLoad} style={{ maxHeight: '60vh' }} alt="crop" />
                        </ReactCrop>
                        <div className="flex gap-2 mt-3">
                            <button onClick={() => setCropImageSrc(null)} className="flex-1 py-2 text-sm font-mono text-muted border border-overlay hover:bg-overlay transition-colors">Отмена</button>
                            <button onClick={handleCropConfirm} disabled={avatarLoading || !completedCrop}
                                className="flex-1 py-2 text-sm font-mono font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-all">
                                {avatarLoading ? '...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Account Modal */}
            <Modal isOpen={isDeleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Удалить аккаунт"
                onConfirm={() => { deleteAccount(); setDeleteModalOpen(false); showToaster('Аккаунт удален.'); navigate('/'); }}
                confirmText="Да, удалить">
                <p className="text-text-secondary">Вы уверены? Все данные будут безвозвратно удалены.</p>
            </Modal>
        </div>
    );
};

/* ── Helper Components ── */
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
    <div className="flex items-center justify-between p-3 bg-base cursor-pointer hover:bg-overlay/50 transition-colors" onClick={() => onChange(!checked)}>
        <div>
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-[10px] text-muted font-mono">{description}</p>
        </div>
        <div className={`relative w-11 h-6 transition-colors ${checked ? 'bg-brand-accent' : 'bg-overlay'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </div>
    </div>
);

export default SettingsPage;
