import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../../services/externalApiService';
import ShopDataInjector from '../../components/admin/ShopDataInjector';

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

const emptyForm = { key: '', name: '', description: '', category: 'sticker', price: 0, preview: '', rarity: 'common', css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '' };

type Tab = 'items' | 'scrap' | 'requests';

const ShopPageAdmin: React.FC = () => {
  const headers = { 'Content-Type': 'application/json' };

  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', category: '', price: 0, preview: '', rarity: 'common', css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '' });
  const [uploading, setUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const editFileUploadRef = useRef<HTMLInputElement>(null);
  const [showInjector, setShowInjector] = useState(false);

  const handleInjectorSubmit = async (data: any) => {
    let previewUrl = data.preview || '';
    if (data.file) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', data.file);
        const res = await fetch(`${API_BASE}/admin/shop/upload`, {
          method: 'POST', credentials: 'include', body: fd,
        });
        if (res.ok) { previewUrl = (await res.json()).url; }
      } catch {} finally { setUploading(false); }
    }
    const catMap: Record<string, string> = { frame: 'frame', cover: 'cover', background: 'background', stickers: 'sticker', skin: 'skin' };
    const itemForm = {
      key: data.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      name: data.name, description: data.description, category: catMap[data.type] || 'sticker',
      price: data.price, preview: previewUrl, rarity: 'common',
      css_variables: '{}', block_style: 'none', nickname_effect: 'none', font_family: '',
    };
    const res = await fetch(`${API_BASE}/admin/shop/items`, { method: 'POST', headers, body: JSON.stringify(itemForm) });
    if (res.ok) { setShowInjector(false); fetchItems(); }
  };

  const [scrapUsername, setScrapUsername] = useState('');
  const [scrapAmount, setScrapAmount] = useState('');
  const [scrapMsg, setScrapMsg] = useState('');
  const [persReqs, setPersReqs] = useState<PersonalizationReq[]>([]);

  const fetchItems = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/shop/items`); if (res.ok) setItems(await res.json()); } catch {}
  }, []);

  const fetchPersReqs = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/admin/personalization/pending`, { headers }); if (res.ok) setPersReqs(await res.json()); } catch {}
  }, []);

  useEffect(() => { Promise.all([fetchItems(), fetchPersReqs()]).finally(() => setLoading(false)); }, []);

  const shopItems = items;
  const filtered = shopItems.filter(i => {
    if (filterCat && i.category !== filterCat) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase()) && !i.key.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const displayed = filtered.slice(0, displayCount);

  const createItem = async () => {
    const res = await fetch(`${API_BASE}/admin/shop/items`, { method: 'POST', headers, body: JSON.stringify(form) });
    if (res.ok) { setShowForm(false); setForm({ ...emptyForm }); fetchItems(); }
  };

  const deleteItem = async (key: string) => {
    if (!confirm(`Удалить товар ${key}?`)) return;
    await fetch(`${API_BASE}/admin/shop/items/${key}`, { method: 'DELETE', headers });
    fetchItems();
  };

  const startEdit = (item: ShopItem) => {
    setEditingKey(item.key);
    setEditForm({ name: item.name, description: item.description, category: item.category, price: item.price, preview: item.preview, rarity: item.rarity || 'common', css_variables: item.css_variables || '{}', block_style: item.block_style || 'none', nickname_effect: item.nickname_effect || 'none', font_family: item.font_family || '' });
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    await fetch(`${API_BASE}/admin/shop/items/${editingKey}`, { method: 'PUT', headers, body: JSON.stringify(editForm) });
    setEditingKey(null); fetchItems();
  };

  const grantScrap = async () => {
    setScrapMsg('');
    const amount = parseInt(scrapAmount, 10);
    if (!scrapUsername.trim()) { setScrapMsg('ВВЕДИТЕ ЮЗЕРНЕЙМ'); return; }
    if (isNaN(amount) || amount === 0) { setScrapMsg('НЕКОРРЕКТНАЯ СУММА'); return; }
    try {
      const usersRes = await fetch(`${API_BASE}/admin/users`, { headers });
      if (!usersRes.ok) { setScrapMsg('ОШИБКА ЗАГРУЗКИ'); return; }
      const users = await usersRes.json();
      const target = users.find((u: any) => u.username.toLowerCase() === scrapUsername.trim().toLowerCase());
      if (!target) { setScrapMsg(`"${scrapUsername}" НЕ НАЙДЕН`); return; }
      const res = await fetch(`${API_BASE}/admin/users/${target.id}/scrap`, { method: 'POST', headers, body: JSON.stringify({ amount }) });
      if (res.ok) {
        const data = await res.json();
        setScrapMsg(`OK :: ${target.username} → ${data.donated_scrap} SCRAP`);
        setScrapUsername(''); setScrapAmount('');
      } else {
        const err = await res.json().catch(() => ({}));
        setScrapMsg(err.detail || 'ОШИБКА');
      }
    } catch { setScrapMsg('ОШИБКА СЕТИ'); }
  };

  const approvePers = async (id: number) => { await fetch(`${API_BASE}/admin/personalization/${id}/approve`, { method: 'PUT', headers }); fetchPersReqs(); };
  const rejectPers = async (id: number) => { await fetch(`${API_BASE}/admin/personalization/${id}/reject`, { method: 'PUT', headers }); fetchPersReqs(); };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`${API_BASE}/admin/shop/upload`, { method: 'POST', credentials: 'include', body: fd });
      if (res.ok) {
        const data = await res.json();
        if (target === 'create') setForm(prev => ({ ...prev, preview: data.url }));
        else setEditForm(prev => ({ ...prev, preview: data.url }));
      }
    } catch {} finally { setUploading(false); }
  };

  const UPLOADABLE_CATEGORIES = ['avatar', 'cover', 'frame'];

  if (loading) return (
    <div className="p-10">
      <div className="font-terminal text-[22px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
        ЗАГРУЗКА МАГАЗИНА<span className="springos-cursor" />
      </div>
    </div>
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'items', label: 'ТОВАРЫ', count: shopItems.length },
    { key: 'scrap', label: 'НАЧИСЛИТЬ SCRAP' },
    { key: 'requests', label: 'ЗАЯВКИ', count: persReqs.length },
  ];

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[28px] sm:text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          МАГАЗИН — УПРАВЛЕНИЕ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/workshop</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>./shop_manager --status</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 flex-wrap" style={{ borderBottom: '1px solid #2a2420' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="font-terminal text-[16px] tracking-[1px] px-4 py-2 transition-all relative"
            style={{
              color: activeTab === tab.key ? '#d4c8b0' : '#8a8070',
              background: activeTab === tab.key ? 'rgba(90, 102, 56, 0.1)' : 'transparent',
              borderBottom: activeTab === tab.key ? '2px solid #5a6638' : '2px solid transparent',
              cursor: 'pointer',
              border: 'none',
              borderBottomWidth: '2px',
              borderBottomStyle: 'solid',
              borderBottomColor: activeTab === tab.key ? '#5a6638' : 'transparent',
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className="ml-1.5 font-code text-[11px] px-1.5 py-0.5 rounded-sm"
                style={{
                  background: tab.key === 'requests' && tab.count > 0 ? 'rgba(122, 22, 22, 0.15)' : 'rgba(90, 102, 56, 0.15)',
                  color: tab.key === 'requests' && tab.count > 0 ? '#7a1616' : '#5a6638',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* === TAB: Items === */}
      {activeTab === 'items' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-2">
              <button className="springos-btn springos-btn-glow text-[13px] springos-glitch-hover" onClick={() => { setShowInjector(!showInjector); setShowForm(false); }}>
                {showInjector ? 'ЗАКРЫТЬ' : '+ ВНЕДРИТЬ ДАННЫЕ'}
              </button>
              <button className="springos-btn text-[13px]" onClick={() => { setShowForm(!showForm); setShowInjector(false); }}>
                {showForm ? 'ЗАКРЫТЬ' : '+ БЫСТРАЯ ФОРМА'}
              </button>
            </div>
          </div>

          {/* Injector */}
          {showInjector && (
            <div className="springos-metal-frame springos-rust-dots rounded p-4 mb-4">
              <div className="relative z-10">
                <ShopDataInjector onSubmit={handleInjectorSubmit} onCancel={() => setShowInjector(false)} />
              </div>
            </div>
          )}

          {/* Quick Form */}
          {!showInjector && showForm && (
            <div className="springos-metal-frame springos-rust-dots rounded p-4 mb-4">
              <div className="relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="springos-input py-2 px-3" placeholder="KEY (УНИКАЛЬНЫЙ)" value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
                  <input className="springos-input py-2 px-3" placeholder="НАЗВАНИЕ" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  <input className="springos-input py-2 px-3" placeholder="ОПИСАНИЕ" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  <select className="springos-input py-2 px-3" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <input className="springos-input py-2 px-3" type="number" placeholder="ЦЕНА" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
                  <div className="flex gap-2">
                    <input className="springos-input py-2 px-3 flex-1" placeholder="ПРЕВЬЮ (EMOJI/URL)" value={form.preview} onChange={e => setForm({ ...form, preview: e.target.value })} />
                    {UPLOADABLE_CATEGORIES.includes(form.category) && (
                      <>
                        <input ref={fileUploadRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" className="hidden" onChange={e => handleFileUpload(e, 'create')} />
                        <button className="springos-btn springos-btn-primary text-[12px] py-1" onClick={() => fileUploadRef.current?.click()} disabled={uploading}>
                          {uploading ? '...' : 'ФАЙЛ'}
                        </button>
                      </>
                    )}
                  </div>
                  <select className="springos-input py-2 px-3" value={form.rarity} onChange={e => setForm({ ...form, rarity: e.target.value })}>
                    <option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="mythic">Mythic</option>
                  </select>
                  <select className="springos-input py-2 px-3" value={form.block_style} onChange={e => setForm({ ...form, block_style: e.target.value })}>
                    <option value="none">Block: None</option><option value="neon-border">Neon Border</option><option value="rusted-metal-bg">Rusted Metal BG</option><option value="glassmorphism">Glassmorphism</option>
                  </select>
                  <select className="springos-input py-2 px-3" value={form.nickname_effect} onChange={e => setForm({ ...form, nickname_effect: e.target.value })}>
                    <option value="none">Nick: None</option><option value="gradient-pulse">Gradient Pulse</option><option value="toxic-glitch">Toxic Glitch</option><option value="custom-color">Custom Color</option>
                  </select>
                  <input className="springos-input py-2 px-3" placeholder="Font Family" value={form.font_family} onChange={e => setForm({ ...form, font_family: e.target.value })} />
                </div>
                <div className="mt-3">
                  <label className="font-terminal text-[12px] block mb-1" style={{ color: '#7a7060' }}>CSS VARIABLES (JSON)</label>
                  <textarea className="springos-input w-full py-2 px-3 resize-none" style={{ height: 60 }} placeholder='{"--profile-accent":"#8B0000",...}' value={form.css_variables} onChange={e => setForm({ ...form, css_variables: e.target.value })} />
                </div>
                <button className="springos-btn springos-btn-glow text-[14px] mt-3 springos-glitch-hover" onClick={createItem}>СОЗДАТЬ</button>
              </div>
            </div>
          )}

          {/* Category Filters */}
          <div className="flex gap-2 mb-3 items-center flex-wrap">
            <input
              className="springos-input py-1.5 px-2 text-[12px]"
              style={{ width: 200, maxWidth: '100%' }}
              placeholder="> ПОИСК ПО НАЗВАНИЮ / KEY..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select
              className="springos-input py-1.5 px-2 text-[12px]"
              style={{ width: 180 }}
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
            >
              <option value="">ВСЕ КАТЕГОРИИ</option>
              {CATEGORY_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {filterCat && (
              <span className="font-code text-[11px]" style={{ color: '#5a6638' }}>
                {shopItems.filter(i => i.category === filterCat).length} шт.
              </span>
            )}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
            <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
              <thead>
                <tr>
                  <th>KEY</th><th>НАЗВАНИЕ</th><th>КАТЕГОРИЯ</th><th>ЦЕНА</th><th>РЕДКОСТЬ</th><th>ПРЕВЬЮ</th><th style={{ width: 80 }}>ДЕЙСТВИЯ</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(item => (
                  <tr key={item.key}>
                    {editingKey === item.key ? (
                      <>
                        <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>{item.key}</td>
                        <td><input className="springos-input py-1 px-2 w-full text-[12px]" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></td>
                        <td><select className="springos-input py-1 px-2 text-[12px]" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>{CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></td>
                        <td><input className="springos-input py-1 px-2 text-[12px]" type="number" style={{ width: 70 }} value={editForm.price} onChange={e => setEditForm({ ...editForm, price: Number(e.target.value) })} /></td>
                        <td><select className="springos-input py-1 px-2 text-[11px]" value={editForm.rarity} onChange={e => setEditForm({ ...editForm, rarity: e.target.value })}><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="mythic">Mythic</option></select></td>
                        <td>
                          <div className="flex gap-1 items-center">
                            <input className="springos-input py-1 px-2 text-[11px] flex-1" value={editForm.preview} onChange={e => setEditForm({ ...editForm, preview: e.target.value })} />
                            {UPLOADABLE_CATEGORIES.includes(editForm.category) && (
                              <><input ref={editFileUploadRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm" className="hidden" onChange={e => handleFileUpload(e, 'edit')} /><button className="springos-btn springos-btn-primary text-[10px] py-0.5 px-1.5" onClick={() => editFileUploadRef.current?.click()} disabled={uploading}>{uploading ? '...' : '📁'}</button></>
                            )}
                          </div>
                        </td>
                        <td><div className="flex gap-1"><button className="springos-btn springos-btn-glow text-[11px] py-0.5 px-1.5" onClick={saveEdit}>✓</button><button className="springos-btn springos-btn-danger text-[11px] py-0.5 px-1.5" onClick={() => setEditingKey(null)}>✕</button></div></td>
                      </>
                    ) : (
                      <>
                        <td className="font-code text-[11px]" style={{ color: '#7a7060' }}>{item.key}</td>
                        <td className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{item.name}</td>
                        <td className="font-terminal text-[14px]" style={{ color: '#9b8c3b' }}>{item.category}</td>
                        <td className="font-code text-[13px] springos-glow-green">{item.price}</td>
                        <td className="font-code text-[11px]" style={{ color: '#9a9080' }}>{item.rarity || 'common'}</td>
                        <td>
                          {item.preview?.startsWith('/uploads/') || item.preview?.startsWith('/Frames') ? (
                            item.preview.match(/\.(mp4|webm)$/i)
                              ? <video src={`${API_BASE}${item.preview}`} style={{ width: 32, height: 32, objectFit: 'cover', border: '1px solid #2a2420' }} muted />
                              : <img src={`${API_BASE}${item.preview}`} style={{ width: 32, height: 32, objectFit: 'cover', border: '1px solid #2a2420' }} alt="" />
                          ) : item.preview?.startsWith('#')
                            ? <span className="inline-block w-4 h-4" style={{ background: item.preview, border: '1px solid #2a2420' }} />
                            : <span className="font-code text-[12px]" style={{ color: '#9a9080' }}>{item.preview}</span>
                          }
                        </td>
                        <td><div className="flex gap-1"><button className="springos-btn springos-btn-primary text-[11px] py-0.5 px-2" onClick={() => startEdit(item)}>✎</button><button className="springos-btn springos-btn-danger text-[11px] py-0.5 px-2" onClick={() => deleteItem(item.key)}>✕</button></div></td>
                      </>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 font-terminal text-[18px]" style={{ color: '#7a7060' }}>НЕТ ТОВАРОВ</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {displayCount < filtered.length && (
            <div className="text-center mt-3">
              <button className="springos-btn springos-btn-primary springos-glitch-hover" onClick={() => setDisplayCount(prev => prev + 50)}>
                ЗАГРУЗИТЬ ЕЩЁ ({filtered.length - displayCount} ОСТАЛОСЬ)
              </button>
            </div>
          )}
        </div>
      )}

      {/* === TAB: Scrap === */}
      {activeTab === 'scrap' && (
        <div>
          <div className="springos-metal-frame springos-rust-dots rounded p-6">
            <div className="relative z-10">
              <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>
                НАЧИСЛИТЬ / СПИСАТЬ SCRAP
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="w-full sm:w-auto">
                  <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>ЮЗЕРНЕЙМ</label>
                  <input className="springos-input py-2.5 px-3 w-full sm:w-[220px]" placeholder="> username" value={scrapUsername} onChange={e => setScrapUsername(e.target.value)} />
                </div>
                <div className="w-full sm:w-auto">
                  <label className="font-terminal text-[13px] tracking-[2px] block mb-1" style={{ color: '#9a9080' }}>СУММА</label>
                  <input className="springos-input py-2.5 px-3 w-full sm:w-[160px]" placeholder="> +500 или -200" value={scrapAmount} onChange={e => setScrapAmount(e.target.value.replace(/[^0-9-]/g, ''))} onKeyDown={e => e.key === 'Enter' && grantScrap()} />
                </div>
                <button className="springos-btn springos-btn-glow text-[15px] springos-glitch-hover py-2" onClick={grantScrap}>
                  НАЧИСЛИТЬ
                </button>
              </div>
              {scrapMsg && (
                <div
                  className="font-code text-[13px] mt-4 p-2 rounded"
                  style={{
                    color: scrapMsg.startsWith('OK') ? '#39ff14' : '#7a1616',
                    background: scrapMsg.startsWith('OK') ? 'rgba(57,255,20,0.05)' : 'rgba(122,22,22,0.05)',
                    border: `1px solid ${scrapMsg.startsWith('OK') ? 'rgba(57,255,20,0.15)' : 'rgba(122,22,22,0.15)'}`,
                  }}
                >
                  {'>'} {scrapMsg}
                </div>
              )}

              <div className="springos-divider" />
              <div className="font-code text-[10px]" style={{ color: '#7a7060' }}>
                Введите положительное число для начисления, отрицательное для списания.
                <br />Юзернейм должен точно совпадать с именем в базе.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TAB: Requests === */}
      {activeTab === 'requests' && (
        <div>
          {persReqs.length === 0 ? (
            <div className="springos-metal-frame rounded p-10 text-center">
              <div className="relative z-10">
                <div className="font-terminal text-[22px]" style={{ color: '#7a7060' }}>НЕТ ЗАЯВОК</div>
                <div className="font-code text-[10px] mt-2" style={{ color: '#1e1a16' }}>
                  КОГДА ПОЛЬЗОВАТЕЛИ ЗАКАЖУТ ПЕРСОНАЛИЗАЦИЮ, ЗАЯВКИ ПОЯВЯТСЯ ЗДЕСЬ
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {persReqs.map(r => (
                <div key={r.id} className="springos-metal-frame springos-rust-dots rounded p-3">
                  <div className="relative z-10 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      {r.avatar_url ? (
                        <img src={r.avatar_url.startsWith('http') ? r.avatar_url : `${API_BASE}${r.avatar_url}`} className="rounded-sm" style={{ width: 36, height: 36, objectFit: 'cover', border: '1px solid #2a2420' }} alt="" />
                      ) : (
                        <div className="flex items-center justify-center font-code text-[13px] rounded-sm" style={{ width: 36, height: 36, background: '#1a1614', border: '1px solid #2a2420', color: '#9a9080' }}>
                          {(r.username || '?')[0]}
                        </div>
                      )}
                      <span className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{r.username}</span>
                    </div>
                    <span className="font-terminal text-[13px] px-2 py-0.5" style={{ background: '#0e0d0c', border: '1px solid #2a2420', color: '#9a9080' }}>
                      {TYPE_LABELS[r.type] || r.type}
                    </span>
                    <span className="springos-glow-green font-terminal text-[15px]">{r.price} SCRAP</span>
                    {r.type === 'status' ? (
                      <span className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>"{r.text_value}"</span>
                    ) : r.file_url ? (
                      r.file_url.match(/\.(mp4|webm|ogg)$/i)
                        ? <video src={`${API_BASE}${r.file_url}`} className="rounded-sm" style={{ width: 60, height: 60, objectFit: 'cover', border: '1px solid #2a2420' }} controls muted />
                        : <img src={`${API_BASE}${r.file_url}`} className="rounded-sm" style={{ width: 60, height: 60, objectFit: 'cover', border: '1px solid #2a2420' }} alt="" />
                    ) : null}
                    <div className="ml-auto flex gap-2">
                      <button className="springos-btn springos-btn-glow text-[13px] py-1 springos-glitch-hover" onClick={() => approvePers(r.id)}>ОДОБРИТЬ</button>
                      <button className="springos-btn springos-btn-danger text-[13px] py-1" onClick={() => rejectPers(r.id)}>ОТКЛОНИТЬ</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShopPageAdmin;
