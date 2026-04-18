import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface ShopItem {
    id: number;
    key: string;
    name: string;
    description: string;
    category: string;
    price: number;
    preview: string;
    rarity: string;
    css_variables: string;
    block_style: string;
    nickname_effect: string;
    font_family: string;
}

interface PersonalizationReq {
    id: number;
    user_id: number;
    username: string;
    avatar_url: string;
    type: string;
    file_url: string;
    text_value: string;
    price: number;
    created_at: string;
}

const CATEGORY_OPTIONS = [
    { value: 'avatar', label: 'Аватарки' },
    { value: 'frame', label: 'Рамки' },
    { value: 'cover', label: 'Обложки' },
    { value: 'background', label: 'Фон' },
    { value: 'sticker', label: 'Стикеры' },
    { value: 'status', label: 'Статусы' },
    { value: 'skin', label: 'Скины' },
    { value: 'personalization', label: 'Персонализация' },
    { value: 'springpro', label: 'SPRINGPRO' },
];

const TYPE_LABELS: Record<string, string> = {
    background: 'Фон профиля',
};

const ShopManagementTab: React.FC = () => {
    const jsonHeaders = { 'Content-Type': 'application/json' };

    // Shop items
    const [items, setItems] = useState<ShopItem[]>([]);
    const [filterCat, setFilterCat] = useState('');
    const [loading, setLoading] = useState(true);

    // Create form
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ key: '', name: '', description: '', category: 'sticker', price: 0, preview: '', rarity: 'common', css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '' });

    // Edit
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', description: '', category: '', price: 0, preview: '', rarity: 'common', css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '' });

    // File upload
    const [uploading, setUploading] = useState(false);
    const fileUploadRef = React.useRef<HTMLInputElement>(null);
    const editFileUploadRef = React.useRef<HTMLInputElement>(null);

    // Scrap grant
    const [scrapUsername, setScrapUsername] = useState('');
    const [scrapAmount, setScrapAmount] = useState('');
    const [scrapMsg, setScrapMsg] = useState('');

    // Personalization requests
    const [persReqs, setPersReqs] = useState<PersonalizationReq[]>([]);

    const fetchItems = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/shop/items`);
            if (res.ok) setItems(await res.json());
        } catch { /* ignore */ }
    }, []);

    const fetchPersReqs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/personalization/pending`, { credentials: 'include' });
            if (res.ok) setPersReqs(await res.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        Promise.all([fetchItems(), fetchPersReqs()]).finally(() => setLoading(false));
    }, []);

    const filtered = filterCat ? items.filter(i => i.category === filterCat) : items;

    // CRUD
    const createItem = async () => {
        const res = await fetch(`${API_BASE}/admin/shop/items`, { method: 'POST', headers: jsonHeaders, credentials: 'include', body: JSON.stringify(form) });
        if (res.ok) { setShowForm(false); setForm({ key: '', name: '', description: '', category: 'sticker', price: 0, preview: '', rarity: 'common', css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '' }); fetchItems(); }
    };

    const deleteItem = async (key: string) => {
        if (!confirm(`Удалить товар ${key}?`)) return;
        await fetch(`${API_BASE}/admin/shop/items/${key}`, { method: 'DELETE', credentials: 'include' });
        fetchItems();
    };

    const startEdit = (item: ShopItem) => {
        setEditingKey(item.key);
        setEditForm({ name: item.name, description: item.description, category: item.category, price: item.price, preview: item.preview, rarity: item.rarity || 'common', css_variables: item.css_variables || '{}', block_style: item.block_style || 'none', nickname_effect: item.nickname_effect || 'none', font_family: item.font_family || '' });
    };

    const saveEdit = async () => {
        if (!editingKey) return;
        await fetch(`${API_BASE}/admin/shop/items/${editingKey}`, { method: 'PUT', headers: jsonHeaders, credentials: 'include', body: JSON.stringify(editForm) });
        setEditingKey(null);
        fetchItems();
    };

    // Scrap
    const grantScrap = async () => {
        setScrapMsg('');
        const amount = parseInt(scrapAmount, 10);
        if (!scrapUsername.trim()) { setScrapMsg('Введите юзернейм'); return; }
        if (isNaN(amount) || amount === 0) { setScrapMsg('Введите ненулевую сумму'); return; }
        try {
            const usersRes = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
            if (!usersRes.ok) { setScrapMsg('Ошибка загрузки пользователей'); return; }
            const users = await usersRes.json();
            const target = users.find((u: any) => u.username.toLowerCase() === scrapUsername.trim().toLowerCase());
            if (!target) { setScrapMsg(`Пользователь "${scrapUsername}" не найден`); return; }
            const res = await fetch(`${API_BASE}/admin/users/${target.id}/scrap`, { method: 'POST', headers: jsonHeaders, credentials: 'include', body: JSON.stringify({ amount }) });
            if (res.ok) {
                const data = await res.json();
                setScrapMsg(`Готово! ${target.username} получил донатный Scrap (${data.donated_scrap})`);
                setScrapUsername('');
                setScrapAmount('');
            } else {
                const err = await res.json().catch(() => ({}));
                setScrapMsg(err.detail || 'Ошибка начисления');
            }
        } catch {
            setScrapMsg('Ошибка сети');
        }
    };

    // Personalization
    const approvePers = async (id: number) => {
        await fetch(`${API_BASE}/admin/personalization/${id}/approve`, { method: 'PUT', credentials: 'include' });
        fetchPersReqs();
    };
    const rejectPers = async (id: number) => {
        await fetch(`${API_BASE}/admin/personalization/${id}/reject`, { method: 'PUT', credentials: 'include' });
        fetchPersReqs();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API_BASE}/admin/shop/upload`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
            });
            if (res.ok) {
                const data = await res.json();
                if (target === 'create') setForm(prev => ({ ...prev, preview: data.url }));
                else setEditForm(prev => ({ ...prev, preview: data.url }));
            }
        } catch { /* ignore */ }
        finally { setUploading(false); }
    };

    const UPLOADABLE_CATEGORIES = ['avatar', 'cover', 'frame'];

    if (loading) return <div className="p-8 text-center text-muted">Загрузка...</div>;

    const inputCls = "w-full bg-base border border-overlay p-2 text-sm text-text-primary placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-brand-accent/30 font-mono";
    const btnPrimary = "px-4 py-2 text-xs font-mono font-bold bg-brand text-white hover:bg-brand-hover transition-all";
    const btnDanger = "px-3 py-1.5 text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all";
    const btnSuccess = "px-3 py-1.5 text-[10px] font-mono font-bold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all";

    return (
        <div className="space-y-8">
            {/* ── Товары ── */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-text-primary">Товары магазина</h2>
                    <button onClick={() => setShowForm(!showForm)} className={btnPrimary}>
                        {showForm ? 'Закрыть' : '+ Добавить товар'}
                    </button>
                </div>

                {showForm && (
                    <div className="bg-surface border border-overlay p-4 mb-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <input className={inputCls} placeholder="key (уникальный)" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
                            <input className={inputCls} placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                            <input className={inputCls} placeholder="Описание" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                            <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <input className={inputCls} type="number" placeholder="Цена" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
                            <div className="flex gap-2 items-center">
                                <input className={inputCls} placeholder="Превью (emoji/цвет/URL)" value={form.preview} onChange={e => setForm({ ...form, preview: e.target.value })} />
                                {UPLOADABLE_CATEGORIES.includes(form.category) && (
                                    <>
                                        <input ref={fileUploadRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" className="hidden" onChange={e => handleFileUpload(e, 'create')} />
                                        <button type="button" onClick={() => fileUploadRef.current?.click()} disabled={uploading} className="px-3 py-2 text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-30 transition-all whitespace-nowrap shrink-0">
                                            {uploading ? '...' : 'Файл'}
                                        </button>
                                    </>
                                )}
                            </div>
                            <select className={inputCls} value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })}>
                                <option value="common">Common</option>
                                <option value="rare">Rare</option>
                                <option value="epic">Epic</option>
                                <option value="mythic">Mythic</option>
                            </select>
                            <select className={inputCls} value={form.block_style} onChange={e => setForm({ ...form, block_style: e.target.value })}>
                                <option value="none">Block Style: None</option>
                                <option value="neon-border">Neon Border</option>
                                <option value="rusted-metal-bg">Rusted Metal BG</option>
                                <option value="glassmorphism">Glassmorphism</option>
                            </select>
                            <select className={inputCls} value={form.nickname_effect} onChange={e => setForm({ ...form, nickname_effect: e.target.value })}>
                                <option value="none">Nickname Effect: None</option>
                                <option value="gradient-pulse">Gradient Pulse</option>
                                <option value="toxic-glitch">Toxic Glitch</option>
                                <option value="custom-color">Custom Color (Mythic)</option>
                            </select>
                            <input className={inputCls} placeholder="Font Family (Google Font)" value={form.font_family} onChange={e => setForm({ ...form, font_family: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-mono text-muted block mb-1">CSS Variables (JSON)</label>
                            <textarea className={inputCls} rows={3} placeholder='{"--profile-accent":"#8B0000",...}' value={form.css_variables} onChange={e => setForm({ ...form, css_variables: e.target.value })} />
                        </div>
                        <button onClick={createItem} className={btnPrimary}>Создать</button>
                    </div>
                )}

                {/* Filter */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-xs font-mono text-muted">Фильтр:</span>
                    <button onClick={() => setFilterCat('')} className={`px-2 py-1 text-[10px] font-mono border transition-all ${!filterCat ? 'border-brand-accent text-brand-accent bg-brand-accent/10' : 'border-overlay text-muted hover:text-text-primary'}`}>Все</button>
                    {CATEGORY_OPTIONS.map(c => (
                        <button key={c.value} onClick={() => setFilterCat(c.value)}
                            className={`px-2 py-1 text-[10px] font-mono border transition-all ${filterCat === c.value ? 'border-brand-accent text-brand-accent bg-brand-accent/10' : 'border-overlay text-muted hover:text-text-primary'}`}>
                            {c.label}
                        </button>
                    ))}
                </div>

                <div className="bg-surface rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-overlay">
                            <tr>
                                <th className="p-3 text-xs font-semibold text-muted">Key</th>
                                <th className="p-3 text-xs font-semibold text-muted">Название</th>
                                <th className="p-3 text-xs font-semibold text-muted">Категория</th>
                                <th className="p-3 text-xs font-semibold text-muted">Цена</th>
                                <th className="p-3 text-xs font-semibold text-muted">Редкость</th>
                                <th className="p-3 text-xs font-semibold text-muted">Превью</th>
                                <th className="p-3 text-xs font-semibold text-muted">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-overlay">
                            {filtered.map(item => (
                                <tr key={item.key} className="hover:bg-overlay/50 transition-colors">
                                    {editingKey === item.key ? (
                                        <>
                                            <td className="p-3 text-xs font-mono text-muted">{item.key}</td>
                                            <td className="p-3"><input className={inputCls} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></td>
                                            <td className="p-3">
                                                <select className={inputCls} value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                                                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                                </select>
                                            </td>
                                            <td className="p-3"><input className={inputCls} type="number" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: Number(e.target.value) })} /></td>
                                            <td className="p-3">
                                                <select className={inputCls} value={editForm.rarity} onChange={e => setEditForm({ ...editForm, rarity: e.target.value })}>
                                                    <option value="common">Common</option>
                                                    <option value="rare">Rare</option>
                                                    <option value="epic">Epic</option>
                                                    <option value="mythic">Mythic</option>
                                                </select>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-1 items-center">
                                                    <input className={inputCls} value={editForm.preview} onChange={e => setEditForm({ ...editForm, preview: e.target.value })} />
                                                    {UPLOADABLE_CATEGORIES.includes(editForm.category) && (
                                                        <>
                                                            <input ref={editFileUploadRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" className="hidden" onChange={e => handleFileUpload(e, 'edit')} />
                                                            <button type="button" onClick={() => editFileUploadRef.current?.click()} disabled={uploading} className="px-2 py-1 text-[10px] font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                                                                {uploading ? '...' : 'Файл'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex flex-col gap-2">
                                                    <select className={inputCls} value={editForm.block_style} onChange={e => setEditForm({ ...editForm, block_style: e.target.value })}>
                                                        <option value="none">Block: None</option>
                                                        <option value="neon-border">Neon Border</option>
                                                        <option value="rusted-metal-bg">Rusted Metal</option>
                                                        <option value="glassmorphism">Glassmorphism</option>
                                                    </select>
                                                    <select className={inputCls} value={editForm.nickname_effect} onChange={e => setEditForm({ ...editForm, nickname_effect: e.target.value })}>
                                                        <option value="none">Nick: None</option>
                                                        <option value="gradient-pulse">Gradient Pulse</option>
                                                        <option value="toxic-glitch">Toxic Glitch</option>
                                                        <option value="custom-color">Custom Color</option>
                                                    </select>
                                                    <input className={inputCls} placeholder="Font Family" value={editForm.font_family} onChange={e => setEditForm({ ...editForm, font_family: e.target.value })} />
                                                    <textarea className={inputCls} rows={2} placeholder="CSS Vars JSON" value={editForm.css_variables} onChange={e => setEditForm({ ...editForm, css_variables: e.target.value })} />
                                                    <div className="flex gap-2">
                                                        <button onClick={saveEdit} className={btnSuccess}>Сохранить</button>
                                                        <button onClick={() => setEditingKey(null)} className={btnDanger}>Отмена</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-3 text-xs font-mono text-muted">{item.key}</td>
                                            <td className="p-3 text-sm text-text-primary">{item.name}</td>
                                            <td className="p-3 text-xs text-text-secondary">{item.category}</td>
                                            <td className="p-3 text-xs font-mono text-yellow-400">{item.price}</td>
                                            <td className="p-3 text-xs font-mono text-text-secondary">{item.rarity || 'common'}</td>
                                            <td className="p-3 text-sm">{item.preview?.startsWith('/uploads/') ? (
                                                item.preview.match(/\.(mp4|webm)$/i) ? <video src={`${API_BASE}${item.preview}`} className="w-10 h-10 object-cover border border-overlay" muted /> : <img src={`${API_BASE}${item.preview}`} className="w-10 h-10 object-cover border border-overlay" alt="" />
                                            ) : item.preview?.startsWith('#') ? <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: item.preview }} /> : item.preview}</td>
                                            <td className="p-3 flex gap-2">
                                                <button onClick={() => startEdit(item)} className="px-3 py-1.5 text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all">Изменить</button>
                                                <button onClick={() => deleteItem(item.key)} className={btnDanger}>Удалить</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-muted text-sm">Нет товаров</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── Начисление Scrap ── */}
            <section>
                <h2 className="text-lg font-bold text-text-primary mb-4">Начислить Scrap</h2>
                <div className="bg-surface border border-overlay p-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs font-mono text-muted block mb-1">Юзернейм</label>
                        <input className={inputCls} placeholder="username" value={scrapUsername} onChange={e => setScrapUsername(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-mono text-muted block mb-1">Сумма (+ или -)</label>
                        <input className={inputCls} placeholder="например 500 или -200" value={scrapAmount} onChange={e => setScrapAmount(e.target.value.replace(/[^0-9-]/g, ''))} />
                    </div>
                    <button onClick={grantScrap} className={btnPrimary}>Начислить</button>
                    {scrapMsg && <span className="text-xs font-mono text-brand-accent">{scrapMsg}</span>}
                </div>
            </section>

            {/* ── Заявки на персонализацию ── */}
            <section>
                <h2 className="text-lg font-bold text-text-primary mb-4">
                    Заявки на персонализацию
                    {persReqs.length > 0 && <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 font-mono">{persReqs.length}</span>}
                </h2>
                {persReqs.length === 0 ? (
                    <div className="bg-surface border border-overlay p-8 text-center text-muted text-sm">Нет заявок на модерацию</div>
                ) : (
                    <div className="space-y-3">
                        {persReqs.map(r => (
                            <div key={r.id} className="bg-surface border border-overlay p-4 flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 min-w-[140px]">
                                    {r.avatar_url ? (
                                        <img src={r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-overlay flex items-center justify-center text-xs text-muted">{(r.username || '?')[0]}</div>
                                    )}
                                    <span className="text-sm font-mono text-text-primary">{r.username}</span>
                                </div>
                                <span className="px-2 py-0.5 text-[10px] font-mono bg-overlay text-text-secondary">{TYPE_LABELS[r.type] || r.type}</span>
                                <span className="text-xs font-mono text-yellow-400">{r.price} ⚡</span>
                                {r.type === 'status' ? (
                                    <span className="text-sm text-text-primary font-mono">"{r.text_value}"</span>
                                ) : r.file_url ? (
                                    r.file_url.match(/\.(mp4|webm|ogg)$/i) ? (
                                        <video src={`${API_BASE}${r.file_url}`} className="w-20 h-20 object-cover border border-overlay" controls muted />
                                    ) : (
                                        <img src={`${API_BASE}${r.file_url}`} className="w-20 h-20 object-cover border border-overlay" alt="preview" />
                                    )
                                ) : null}
                                <div className="ml-auto flex gap-2">
                                    <button onClick={() => approvePers(r.id)} className={btnSuccess}>Одобрить</button>
                                    <button onClick={() => rejectPers(r.id)} className={btnDanger}>Отклонить</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default ShopManagementTab;
