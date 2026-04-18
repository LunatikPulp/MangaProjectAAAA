import React, { useState } from 'react';
import { useUsers } from '../../hooks/useUsers';
import FramedAvatar from '../../components/FramedAvatar';
import { User } from '../../types';
import { API_BASE } from '../../services/externalApiService';

interface UserDossier {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
  role: string;
  status: string;
  avatar_frame: string;
  scrap: number;
  xp: number;
  level: number;
  reading_manga: string[];
  purchased_skins: string[];
  purchased_frames: string[];
}

const UsersPage: React.FC = () => {
  const { users, loading, updateUserStatus, updateUserRole } = useUsers();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dossier, setDossier] = useState<UserDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierTab, setDossierTab] = useState<'profile' | 'content' | 'actions'>('profile');
  const [scrapInput, setScrapInput] = useState('');
  const [scrapMsg, setScrapMsg] = useState('');
  const [roleSelect, setRoleSelect] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<'ban' | 'unban' | 'role' | ''>('');
  const [bulkRole, setBulkRole] = useState<string>('user');

  const token = localStorage.getItem('backend_token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const filtered = users.filter(u => {
    if (search && !u.username.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    return true;
  });

  const openDossier = async (userId: number) => {
    setDossierLoading(true);
    setScrapMsg('');
    setScrapInput('');
    setDossierTab('profile');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDossier({
          id: data.id,
          username: data.username,
          email: data.email,
          avatar_url: data.avatar_url || '',
          role: data.role,
          status: data.status,
          avatar_frame: data.avatar_frame || 'none',
          scrap: data.donated_scrap || 0,
          xp: data.xp || 0,
          level: data.level || 1,
          reading_manga: data.reading_manga || [],
          purchased_skins: data.purchased_skins || [],
          purchased_frames: data.purchased_frames || [],
        });
        setRoleSelect(data.role);
      }
    } catch {}
    setDossierLoading(false);
  };

  const grantScrap = async () => {
    if (!dossier || !scrapInput) return;
    const amount = parseInt(scrapInput, 10);
    if (isNaN(amount) || amount === 0) { setScrapMsg('НЕКОРРЕКТНАЯ СУММА'); return; }
    try {
      const res = await fetch(`${API_BASE}/admin/users/${dossier.id}/scrap`, { method: 'POST', headers, body: JSON.stringify({ amount }) });
      if (res.ok) {
        const data = await res.json();
        setScrapMsg(`OK :: ${data.donated_scrap} SCRAP`);
        setScrapInput('');
        setDossier(prev => prev ? { ...prev, scrap: data.donated_scrap } : prev);
      } else {
        const err = await res.json().catch(() => ({}));
        setScrapMsg(err.detail || 'ОШИБКА');
      }
    } catch { setScrapMsg('ОШИБКА СЕТИ'); }
  };

  const handleBan = (email: string, currentStatus: string) => {
    const newStatus: 'active' | 'banned' = currentStatus === 'active' ? 'banned' : 'active';
    updateUserStatus(email, newStatus);
    if (dossier) setDossier(prev => prev ? { ...prev, status: newStatus } : prev);
  };

  const handleRoleChange = (email: string, role: User['role']) => {
    updateUserRole(email, role);
    if (dossier) setDossier(prev => prev ? { ...prev, role } : prev);
  };

  const toggleSelectUser = (id: number) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filtered.length) setSelectedUsers(new Set());
    else setSelectedUsers(new Set(filtered.map(u => u.id).filter(Boolean) as number[]));
  };

  const executeBulkAction = () => {
    const targets = users.filter(u => u.id && selectedUsers.has(u.id));
    if (bulkAction === 'ban') {
      targets.forEach(u => { if (u.role !== 'admin') updateUserStatus(u.email, 'banned'); });
    } else if (bulkAction === 'unban') {
      targets.forEach(u => updateUserStatus(u.email, 'active'));
    } else if (bulkAction === 'role') {
      targets.forEach(u => { if (u.role !== 'admin') updateUserRole(u.email, bulkRole as User['role']); });
    }
    setSelectedUsers(new Set());
    setBulkAction('');
  };

  if (loading) {
    return (
      <div className="p-10">
        <div className="font-terminal text-[22px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          СКАНИРОВАНИЕ СУБЪЕКТОВ<span className="springos-cursor" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="springos-page-header mb-5">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          НОЧНОЙ ПЕРСОНАЛ — СУБЪЕКТЫ
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/night-staff</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>cat /etc/personnel --total {users.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          className="springos-input py-2 px-3"
          style={{ width: 280, maxWidth: '100%' }}
          placeholder="> ПОИСК ПО ИМЕНИ / EMAIL..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {['', 'user', 'moderator', 'admin'].map(r => (
            <button
              key={r}
              className={`springos-btn text-[13px] py-1 px-2.5 ${roleFilter === r ? 'springos-btn-primary' : ''}`}
              onClick={() => setRoleFilter(r)}
            >
              {r === '' ? 'ВСЕ' : r === 'user' ? 'ЮЗЕР' : r === 'moderator' ? 'МОД' : 'АДМИН'}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <div className="flex gap-3 items-center p-3 mb-3 rounded flex-wrap" style={{ background: 'rgba(90, 102, 56, 0.08)', border: '1px solid rgba(90, 102, 56, 0.2)' }}>
          <span className="font-terminal text-[16px] springos-glow-green">
            ВЫБРАНО: {selectedUsers.size}
          </span>
          <button className="springos-btn springos-btn-danger text-[13px] py-1" onClick={() => { setBulkAction('ban'); }}>🔒 ЗАБЛОКИРОВАТЬ</button>
          <button className="springos-btn springos-btn-glow text-[13px] py-1" onClick={() => { setBulkAction('unban'); }}>🔓 РАЗБЛОКИРОВАТЬ</button>
          <select className="springos-input py-1 px-2 text-[12px]" value={bulkRole} onChange={e => setBulkRole(e.target.value)}>
            <option value="user">ЮЗЕР</option>
            <option value="moderator">МОД</option>
          </select>
          <button className="springos-btn text-[13px] py-1" onClick={() => { setBulkAction('role'); }}>СМЕНИТЬ РОЛЬ</button>
          <button className="springos-btn text-[13px] py-1" onClick={() => setSelectedUsers(new Set())}>СБРОСИТЬ</button>
          {bulkAction && (
            <button className="springos-btn springos-btn-glow text-[13px] py-1 springos-glitch-hover" onClick={executeBulkAction}>
              ПОДТВЕРДИТЬ ({selectedUsers.size})
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto springos-scroll rounded" style={{ border: '1px solid #2a2420' }}>
        <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={selectedUsers.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{ accentColor: '#5a6638' }} />
              </th>
              <th>СУБЪЕКТ</th>
              <th>EMAIL</th>
              <th style={{ width: 100 }}>РОЛЬ</th>
              <th style={{ width: 120 }}>СТАТУС</th>
              <th style={{ width: 100 }}>ДЕЙСТВИЕ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr
                key={u.email}
                style={{ cursor: 'pointer' }}
                onClick={() => u.id && openDossier(u.id)}
              >
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={u.id ? selectedUsers.has(u.id) : false} onChange={() => u.id && toggleSelectUser(u.id)} style={{ accentColor: '#5a6638' }} />
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <FramedAvatar avatarUrl={u.avatar_url} username={u.username} size={34} frameKey={u.avatar_frame} />
                    <span className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{u.username}</span>
                  </div>
                </td>
                <td className="font-code text-[12px]" style={{ color: '#9a9080' }}>{u.email}</td>
                <td>
                  <span className="font-terminal text-[15px] uppercase" style={{ color: '#9b8c3b' }}>
                    {u.role}
                  </span>
                </td>
                <td>
                  {u.status === 'active' ? (
                    <span className="springos-badge-alive">ЖИВ</span>
                  ) : (
                    <span className="springos-badge-springlocked">СПРИНГЛОК</span>
                  )}
                </td>
                <td>
                  {u.role !== 'admin' && (
                    <button
                      className={`springos-btn text-[11px] py-0.5 px-2 ${u.status === 'active' ? 'springos-btn-danger' : 'springos-btn-glow'}`}
                      onClick={e => {
                        e.stopPropagation();
                        updateUserStatus(u.email, u.status === 'active' ? 'banned' : 'active');
                      }}
                    >
                      {u.status === 'active' ? '🔒' : '🔓'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="font-terminal text-[20px]" style={{ color: '#7a7060' }}>НЕТ СУБЪЕКТОВ</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dossier Modal */}
      {(dossier || dossierLoading) && (
        <div className="springos-modal-overlay" onClick={() => { setDossier(null); setDossierLoading(false); }}>
          <div
            className="springos-metal-frame springos-modal p-6"
            style={{ maxWidth: 540, width: '92%' }}
            onClick={e => e.stopPropagation()}
          >
            {dossierLoading ? (
              <div className="font-terminal text-[20px] springos-glow-mustard py-8 text-center" style={{ color: '#9b8c3b' }}>
                СКАНИРОВАНИЕ<span className="springos-cursor" />
              </div>
            ) : dossier ? (
              <>
                {/* Dossier Header */}
                <div className="flex gap-4 mb-4 items-center">
                  <div className="springos-metal-frame springos-glow-green-box p-1 flex-shrink-0">
                    <FramedAvatar
                      avatarUrl={dossier.avatar_url}
                      username={dossier.username}
                      size={56}
                      frameKey={dossier.avatar_frame}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-terminal text-[24px] truncate" style={{ color: '#d4c8b0' }}>
                      {dossier.username}
                    </div>
                    <div className="font-code text-[11px]" style={{ color: '#8a8070' }}>
                      {dossier.email}
                    </div>
                    <div className="mt-1">
                      {dossier.status === 'active' ? (
                        <span className="springos-badge-alive">ЖИВ</span>
                      ) : (
                        <span className="springos-badge-springlocked">СПРИНГЛОК</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dossier Tabs */}
                <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid #2a2420' }}>
                  {(['profile', 'content', 'actions'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDossierTab(tab)}
                      className="font-terminal text-[14px] tracking-[1px] px-3 py-1.5"
                      style={{
                        color: dossierTab === tab ? '#d4c8b0' : '#8a8070',
                        background: dossierTab === tab ? 'rgba(90, 102, 56, 0.1)' : 'transparent',
                        borderBottom: dossierTab === tab ? '2px solid #5a6638' : '2px solid transparent',
                        cursor: 'pointer',
                        border: 'none',
                        borderBottomWidth: '2px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: dossierTab === tab ? '#5a6638' : 'transparent',
                      }}
                    >
                      {tab === 'profile' ? 'ПРОФИЛЬ' : tab === 'content' ? 'КОНТЕНТ' : 'ДЕЙСТВИЯ'}
                    </button>
                  ))}
                </div>

                {/* Tab: Profile */}
                {dossierTab === 'profile' && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'SCRAP', value: dossier.scrap, glow: 'springos-glow-green' },
                      { label: 'XP', value: dossier.xp, glow: 'springos-glow-mustard' },
                      { label: 'УРОВЕНЬ', value: dossier.level, glow: '' },
                    ].map((s, i) => (
                      <div key={i} className="springos-metal-frame springos-rust-dots p-3 text-center">
                        <div className="relative z-10">
                          <div className="font-terminal text-[12px] tracking-[2px] mb-1" style={{ color: '#8a8070' }}>{s.label}</div>
                          <div className={`font-terminal text-[22px] ${s.glow}`} style={{ color: s.glow ? undefined : '#d4c8b0' }}>
                            {s.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab: Content */}
                {dossierTab === 'content' && (
                  <div>
                    <div className="mb-4">
                      <div className="font-terminal text-[14px] tracking-[2px] mb-2" style={{ color: '#9b8c3b' }}>
                        ЧИТАЕМАЯ МАНГА
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dossier.reading_manga.length > 0 ? dossier.reading_manga.map((m, i) => (
                          <span
                            key={i}
                            className="font-code text-[11px] px-2 py-0.5"
                            style={{ background: '#0e0d0c', border: '1px solid #2a2420', color: '#d4c8b0' }}
                          >
                            {m}
                          </span>
                        )) : (
                          <span className="font-code text-[11px]" style={{ color: '#7a7060' }}>НЕТ ДАННЫХ</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-terminal text-[13px] tracking-[2px] mb-1.5" style={{ color: '#5a6638' }}>СКИНЫ</div>
                        <div className="flex flex-wrap gap-1">
                          {dossier.purchased_skins.length > 0 ? dossier.purchased_skins.map((s, i) => (
                            <span key={i} className="font-code text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(90,102,56,0.08)', border: '1px solid rgba(90,102,56,0.2)', color: '#5a6638' }}>{s}</span>
                          )) : <span className="font-code text-[10px]" style={{ color: '#7a7060' }}>НЕТ</span>}
                        </div>
                      </div>
                      <div>
                        <div className="font-terminal text-[13px] tracking-[2px] mb-1.5" style={{ color: '#9b8c3b' }}>РАМКИ</div>
                        <div className="flex flex-wrap gap-1">
                          {dossier.purchased_frames.length > 0 ? dossier.purchased_frames.map((f, i) => (
                            <span key={i} className="font-code text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(155,140,59,0.08)', border: '1px solid rgba(155,140,59,0.2)', color: '#9b8c3b' }}>{f}</span>
                          )) : <span className="font-code text-[10px]" style={{ color: '#7a7060' }}>НЕТ</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Actions */}
                {dossierTab === 'actions' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2 items-center">
                      <span className="font-terminal text-[13px] flex-shrink-0" style={{ color: '#8a8070' }}>РОЛЬ:</span>
                      <select
                        className="springos-input py-1.5 px-2 text-[12px] flex-1"
                        value={roleSelect}
                        onChange={e => { setRoleSelect(e.target.value); handleRoleChange(dossier.email, e.target.value as User['role']); }}
                      >
                        <option value="user">ПОЛЬЗОВАТЕЛЬ</option>
                        <option value="moderator">МОДЕРАТОР</option>
                        <option value="admin">АДМИНИСТРАТОР</option>
                      </select>
                    </div>

                    <div className="flex gap-2 items-center">
                      <span className="font-terminal text-[13px] flex-shrink-0" style={{ color: '#8a8070' }}>SCRAP:</span>
                      <input
                        className="springos-input py-1.5 px-2 flex-1"
                        placeholder="+/- СУММА"
                        value={scrapInput}
                        onChange={e => setScrapInput(e.target.value.replace(/[^0-9-]/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && grantScrap()}
                      />
                      <button className="springos-btn springos-btn-glow text-[13px] py-1" onClick={grantScrap}>
                        НАЧИСЛИТЬ
                      </button>
                    </div>
                    {scrapMsg && (
                      <div
                        className="font-code text-[11px]"
                        style={{ color: scrapMsg.startsWith('OK') ? '#39ff14' : '#7a1616' }}
                      >
                        {'>'} {scrapMsg}
                      </div>
                    )}

                    {dossier.role !== 'admin' && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`springos-btn springos-glitch-hover ${dossier.status === 'active' ? 'springos-btn-danger' : 'springos-btn-glow'} text-[14px]`}
                          onClick={() => handleBan(dossier.email, dossier.status)}
                        >
                          {dossier.status === 'active' ? '🔒 СПРИНГЛОК' : '🔓 РАЗБЛОКИРОВАТЬ'}
                        </button>
                        <button
                          className="springos-btn bg-yellow-600/20 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-600/30 text-[14px]"
                          onClick={async () => {
                            const reason = prompt('Причина предупреждения:');
                            if (!reason) return;
                            const res = await fetch(`${API_BASE}/admin/users/${dossier.id}/warn?reason=${encodeURIComponent(reason)}`, { method: 'POST', headers });
                            if (res.ok) {
                              const data = await res.json();
                              alert(`Предупреждение выдано (${data.warnings}/3). Статус: ${data.status}`);
                              openDossier(dossier.id);
                            }
                          }}
                        >
                          ⚠️ ПРЕДУПРЕЖДЕНИЕ
                        </button>
                        <button
                          className={`springos-btn text-[14px] ${dossier.status === 'frozen' ? 'bg-cyan-600/20 border border-cyan-500/40 text-cyan-400' : 'bg-blue-600/20 border border-blue-500/40 text-blue-400'}`}
                          onClick={async () => {
                            const res = await fetch(`${API_BASE}/admin/users/${dossier.id}/freeze`, { method: 'PUT', headers });
                            if (res.ok) {
                              const data = await res.json();
                              alert(data.status === 'frozen' ? 'Аккаунт заморожен' : 'Аккаунт разморожен');
                              openDossier(dossier.id);
                            }
                          }}
                        >
                          {dossier.status === 'frozen' ? '❄️ РАЗМОРОЗИТЬ' : '🧊 ЗАМОРОЗИТЬ'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
