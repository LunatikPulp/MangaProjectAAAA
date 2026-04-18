import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../services/externalApiService';

interface MangaRow {
  id: string;
  slug?: string;
  title: string;
  type: string;
  status: string;
  year: number;
  rating: number;
  cover: string;
  hidden: boolean;
  updated_at: string;
  chapters_count: number;
}

const ArchivesPage: React.FC = () => {
  const navigate = useNavigate();
  const headers = {};

  const [items, setItems] = useState<MangaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const perPage = 50;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MangaRow | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchManga = useCallback(async (p: number = 1, s: string = search, t: string = typeFilter, st: string = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(perPage),
        sort: 'newest',
      });
      if (s) params.set('search', s);
      if (t) params.set('manga_type', t);
      if (st) params.set('status', st);

      const res = await fetch(`${API_BASE}/manga/list?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const rows: MangaRow[] = data.items.map((item: any) => ({
          id: item.manga_id,
          slug: item.slug || item.manga_id,
          title: item.title || 'Без названия',
          type: item.manga_type || 'Manga',
          status: item.status || 'В процессе',
          year: item.year || 0,
          rating: item.rating_info?.average ?? 0,
          cover: item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || ''),
          hidden: item.hidden || false,
          updated_at: item.updated_at || item.created_at || '',
          chapters_count: item.chapters_count ?? item.chapter_count ?? 0,
        }));
        setItems(rows);
        setTotal(data.total);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchManga(1);
  }, [fetchManga]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchManga(1, val, typeFilter, statusFilter);
    }, 400);
  };

  const handleTypeFilter = (val: string) => {
    setTypeFilter(val);
    setPage(1);
    fetchManga(1, search, val, statusFilter);
  };

  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    fetchManga(1, search, typeFilter, val);
  };

  const goToPage = (p: number) => {
    setPage(p);
    fetchManga(p, search, typeFilter, statusFilter);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(m => m.id)));
  };

  const deleteSelected = async () => {
    try {
      await fetch(`${API_BASE}/admin/manga/bulk`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(Array.from(selected)),
      });
      setSelected(new Set());
      setBulkConfirm(false);
      fetchManga(page, search, typeFilter, statusFilter);
    } catch {}
  };

  const toggleVisibility = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/manga/${id}/visibility`, {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(m => m.id === id ? { ...m, hidden: data.hidden } : m));
      }
    } catch {}
  };

  const handleDeleteConfirm = async () => {
    if (confirmDelete) {
      try {
        await fetch(`${API_BASE}/manga/${confirmDelete.id}`, { method: 'DELETE', headers });
        setItems(prev => prev.filter(m => m.id !== confirmDelete.id));
        setTotal(prev => prev - 1);
      } catch {}
      setConfirmDelete(null);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  if (loading && items.length === 0) {
    return (
      <div className="p-10">
        <div className="font-terminal text-[22px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          ЗАГРУЗКА АРХИВОВ<span className="springos-cursor" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
              АРХИВЫ — КАТАЛОГ
            </div>
            <div className="font-code text-[11px] mt-1">
              <span style={{ color: '#39ff14' }}>springtrap@afton</span>
              <span style={{ color: '#8a8070' }}>:</span>
              <span style={{ color: '#6cacff' }}>~/archives</span>
              <span style={{ color: '#8a8070' }}>$ </span>
              <span style={{ color: '#d4c8b0' }}>ls -la --count </span>
              <span className="springos-glow-green">{total}</span>
              <span style={{ color: '#8a8070' }}> | стр. {page}/{totalPages}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/archives/manga/new" className="springos-btn springos-btn-glow text-[14px] springos-glitch-hover no-underline">
              + СОЗДАТЬ
            </Link>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[350px]">
          <input
            className="springos-input w-full py-2 px-3 pr-8"
            placeholder="> ПОИСК ПО НАЗВАНИЮ..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 font-code text-[12px]"
              style={{ color: '#9a9080', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {['', 'Manhwa', 'Manga', 'Manhua', 'OEL-Manga', 'Rukomiks', 'Western'].map(t => (
            <button
              key={t}
              className={`springos-btn text-[13px] py-1 px-2.5 ${typeFilter === t ? 'springos-btn-primary' : ''}`}
              onClick={() => handleTypeFilter(t)}
            >
              {t || 'ВСЕ'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['', 'В процессе', 'Завершено'].map(s => (
            <button
              key={s}
              className={`springos-btn text-[13px] py-1 px-2.5 ${statusFilter === s ? 'springos-btn-primary' : ''}`}
              onClick={() => handleStatusFilter(s)}
            >
              {s || 'ВСЕ'}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="flex gap-3 items-center p-3 mb-3 rounded"
          style={{ background: 'rgba(90, 102, 56, 0.08)', border: '1px solid rgba(90, 102, 56, 0.2)' }}
        >
          <span className="font-terminal text-[16px] springos-glow-green">
            ВЫБРАНО: {selected.size}
          </span>
          <button className="springos-btn springos-btn-danger text-[13px] py-1 springos-glitch-hover" onClick={() => setBulkConfirm(true)}>
            УДАЛИТЬ ВЫБРАННЫЕ
          </button>
          <button className="springos-btn text-[13px] py-1" onClick={() => setSelected(new Set())}>
            СБРОСИТЬ
          </button>
        </div>
      )}

      <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
        <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleSelectAll} style={{ accentColor: '#5a6638' }} />
              </th>
              <th style={{ width: 50 }}>ОБЛОЖКА</th>
              <th>НАЗВАНИЕ</th>
              <th style={{ width: 80 }}>ТИП</th>
              <th style={{ width: 110 }}>СТАТУС</th>
              <th style={{ width: 60 }}>ГОД</th>
              <th style={{ width: 70 }}>РЕЙТИНГ</th>
              <th style={{ width: 50 }}>ГЛ.</th>
              <th style={{ width: 100 }}>ОБНОВЛЕНО</th>
              <th style={{ width: 60 }}>ВИД.</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(manga => (
              <tr key={manga.id} style={{ opacity: manga.hidden ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <td>
                  <input type="checkbox" checked={selected.has(manga.id)} onChange={() => toggleSelect(manga.id)} style={{ accentColor: '#5a6638' }} />
                </td>
                <td>
                  <img src={manga.cover} alt="" className="rounded-sm" style={{ width: 38, height: 52, objectFit: 'cover', border: '1px solid #2a2420' }} />
                </td>
                <td>
                  <Link to={`/manga/${manga.slug || manga.id}`} className="font-code text-[13px] hover:underline" style={{ color: '#d4c8b0', textDecoration: 'none' }}>
                    {manga.title}
                  </Link>
                  {manga.hidden && <span className="ml-2 font-code text-[10px]" style={{ color: '#7a1616' }}>[СКРЫТА]</span>}
                </td>
                <td>
                  <span className="font-terminal text-[15px]" style={{ color: '#9b8c3b' }}>{manga.type}</span>
                </td>
                <td>
                  {manga.status === 'Завершено' ? (
                    <span className="springos-badge-springlocked" style={{ animation: 'none', fontSize: '11px' }}>ЗАВЕРШЕНО</span>
                  ) : (
                    <span className="springos-badge-alive" style={{ fontSize: '11px' }}>В ПРОЦЕССЕ</span>
                  )}
                </td>
                <td className="font-code text-[12px]">{manga.year}</td>
                <td>
                  <span className="font-code text-[13px]" style={{ color: '#9b8c3b' }}>{manga.rating.toFixed(1)}</span>
                </td>
                <td className="font-terminal text-[14px]" style={{ color: '#5a6638' }}>
                  {manga.chapters_count}
                </td>
                <td className="font-code text-[11px]" style={{ color: manga.updated_at ? '#7a7060' : '#2a2420' }}>
                  {manga.updated_at ? new Date(manga.updated_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                </td>
                <td>
                  <div
                    className={`springos-toggle ${!manga.hidden ? 'active' : ''}`}
                    onClick={() => toggleVisibility(manga.id)}
                    style={{ transform: 'scale(0.85)' }}
                  />
                </td>
                <td style={{ position: 'relative' }}>
                  <button
                    className="springos-glitch-hover"
                    style={{ background: 'none', border: '1px solid transparent', color: '#6a6050', fontSize: 20, cursor: 'pointer', padding: '2px 6px', fontFamily: 'monospace', borderRadius: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a3028')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                    onClick={() => setDropdownOpen(dropdownOpen === manga.id ? null : manga.id)}
                  >
                    ⋮
                  </button>
                  {dropdownOpen === manga.id && (
                    <div
                      ref={dropdownRef}
                      className="absolute right-0 top-full z-[100] springos-metal-frame"
                      style={{ minWidth: 190, boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                    >
                      <button
                        className="w-full text-left font-code text-[12px] px-3 py-2 transition-colors"
                        style={{ color: '#d4c8b0', background: 'transparent', border: 'none', borderBottom: '1px solid #2a2420', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90, 102, 56, 0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => { navigate(`/manga/${manga.slug || manga.id}/edit`); setDropdownOpen(null); }}
                      >
                        ✎ РЕДАКТИРОВАТЬ
                      </button>
                      <button
                        className="w-full text-left font-code text-[12px] px-3 py-2 transition-colors"
                        style={{ color: '#d4c8b0', background: 'transparent', border: 'none', borderBottom: '1px solid #2a2420', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90, 102, 56, 0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => { navigate(`/admin/manga/${manga.id}/manage`); setDropdownOpen(null); }}
                      >
                        ☰ УПРАВЛЕНИЕ ГЛАВАМИ
                      </button>
                      <button
                        className="w-full text-left font-code text-[12px] px-3 py-2 transition-colors"
                        style={{ color: '#d4c8b0', background: 'transparent', border: 'none', borderBottom: '1px solid #2a2420', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(90, 102, 56, 0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => { toggleVisibility(manga.id); setDropdownOpen(null); }}
                      >
                        {manga.hidden ? '◉ ПОКАЗАТЬ' : '◎ СКРЫТЬ'}
                      </button>
                      <button
                        className="w-full text-left font-code text-[12px] px-3 py-2 transition-colors"
                        style={{ color: '#7a1616', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(122, 22, 22, 0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => { setConfirmDelete(manga); setDropdownOpen(null); }}
                      >
                        ✕ УДАЛИТЬ
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="text-center py-10">
                  <div className="font-terminal text-[20px]" style={{ color: '#7a7060' }}>АРХИВ ПУСТ</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            className="springos-btn text-[13px]"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            style={{ opacity: page <= 1 ? 0.3 : 1 }}
          >
            ◀ НАЗАД
          </button>
          <span className="font-code text-[12px]" style={{ color: '#7a7060' }}>
            {page} / {totalPages}
          </span>
          <button
            className="springos-btn text-[13px]"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            style={{ opacity: page >= totalPages ? 0.3 : 1 }}
          >
            ВПЕРЁД ▶
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setConfirmDelete(null)}>
          <div className="springos-metal-frame p-6" style={{ maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="font-terminal text-[22px] springos-glow-blood mb-3" style={{ color: '#7a1616' }}>
              ⚠ ПОДТВЕРДИТЬ УДАЛЕНИЕ
            </div>
            <div className="font-code text-[13px] mb-5" style={{ color: '#d4c8b0' }}>
              Удалить "<span style={{ color: '#9b8c3b' }}>{confirmDelete.title}</span>"?
            </div>
            <div className="flex gap-3">
              <button className="springos-btn springos-btn-danger springos-glitch-hover" onClick={handleDeleteConfirm}>УДАЛИТЬ</button>
              <button className="springos-btn" onClick={() => setConfirmDelete(null)}>ОТМЕНА</button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setBulkConfirm(false)}>
          <div className="springos-metal-frame p-6" style={{ maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="font-terminal text-[22px] springos-glow-blood mb-3" style={{ color: '#7a1616' }}>
              ⚠ МАССОВОЕ УДАЛЕНИЕ
            </div>
            <div className="font-code text-[13px] mb-5" style={{ color: '#d4c8b0' }}>
              Удалить <span className="springos-glow-green">{selected.size}</span> записей?
            </div>
            <div className="flex gap-3">
              <button className="springos-btn springos-btn-danger springos-glitch-hover" onClick={deleteSelected}>УДАЛИТЬ ВСЁ</button>
              <button className="springos-btn" onClick={() => setBulkConfirm(false)}>ОТМЕНА</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivesPage;
