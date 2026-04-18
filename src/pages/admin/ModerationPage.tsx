import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../services/externalApiService';

interface FoundUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string;
  last_seen: string | null;
  scrap: number;
}

interface PendingComment {
  id: number;
  text: string;
  status: string;
  manga_id: string;
  manga_title: string;
  user_id: number;
  username: string;
  created_at: string;
}

interface ReportedComment {
  id: number;
  text: string;
  status: string;
  manga_id: string;
  manga_title: string;
  user_id: number;
  username: string;
  warnings_count: number;
  report_count: number;
  report_reasons: string[];
  created_at: string;
}

const ModerationPage: React.FC = () => {
  const token = localStorage.getItem('backend_token') || '';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [allowComments, setAllowComments] = useState(true);
  const [commentProvider, setCommentProvider] = useState('builtin');
  const [disqusShortname, setDisqusShortname] = useState('');
  const [preModeration, setPreModeration] = useState(false);
  const [spamFilter, setSpamFilter] = useState(true);
  const [warnBeforeBan, setWarnBeforeBan] = useState(true);
  const [muteStages, setMuteStages] = useState('1,7,30,0');
  const [badwordsShadow, setBadwordsShadow] = useState('');
  const [badwordsWarnLinks, setBadwordsWarnLinks] = useState('');
  const [badwordsWarnScam, setBadwordsWarnScam] = useState('');
  const [badwordsFreeze, setBadwordsFreeze] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [frozenUsers, setFrozenUsers] = useState<FoundUser[]>([]);
  const [freezeMsg, setFreezeMsg] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const [reportedComments, setReportedComments] = useState<ReportedComment[]>([]);
  const [reportedLoading, setReportedLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/settings`, { headers });
        if (res.ok) {
          const d = await res.json();
          setAllowComments(d.allow_comments ?? true);
          setCommentProvider(d.comment_provider ?? 'builtin');
          setDisqusShortname(d.disqus_shortname ?? '');
          setPreModeration(d.pre_moderation ?? false);
          setSpamFilter(d.spam_filter ?? true);
          setWarnBeforeBan(d.warn_before_ban ?? true);
          setMuteStages(d.mute_stages ?? '1,7,30,0');
          setBadwordsShadow(d.badwords_shadow ?? '');
          setBadwordsWarnLinks(d.badwords_warn_links ?? '');
          setBadwordsWarnScam(d.badwords_warn_scam ?? '');
          setBadwordsFreeze(d.badwords_freeze ?? '');
        }
      } catch {}
    })();
    loadFrozenUsers();
  }, []);

  const loadFrozenUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users?search=`, { headers });
      if (res.ok) {
        const all: FoundUser[] = await res.json();
        setFrozenUsers(all.filter(u => u.status === 'frozen'));
      }
    } catch {}
  };

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/comments/pending`, { headers });
      if (res.ok) setPendingComments(await res.json());
    } catch {}
    setPendingLoading(false);
  }, []);

  const loadReported = useCallback(async () => {
    setReportedLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/comments/reports`, { headers });
      if (res.ok) setReportedComments(await res.json());
    } catch {}
    setReportedLoading(false);
  }, []);

  useEffect(() => {
    if (preModeration) loadPending();
    loadReported();
  }, [preModeration, loadPending, loadReported]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users?search=${encodeURIComponent(searchQuery.trim())}`, { headers });
      if (res.ok) {
        const data: FoundUser[] = await res.json();
        setSearchResults(data.filter(u => u.role !== 'admin'));
      }
    } catch {}
    setSearching(false);
  };

  const setAccountStatus = async (userId: number, newStatus: string) => {
    setActionLoading(userId);
    setFreezeMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setFreezeMsg(newStatus === 'frozen' ? 'АККАУНТ ЗАМОРОЖЕН' : 'АККАУНТ РАЗБЛОКИРОВАН');
        setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
        loadFrozenUsers();
      } else {
        setFreezeMsg('ОШИБКА ДЕЙСТВИЯ');
      }
    } catch {
      setFreezeMsg('ОШИБКА СЕТИ');
    }
    setActionLoading(null);
    setTimeout(() => setFreezeMsg(''), 5000);
  };

  const moderateComment = async (commentId: number, action: string) => {
    const res = await fetch(`${API_BASE}/admin/comments/${commentId}/moderate?action=${action}`, { method: 'PUT', headers });
    if (res.ok) {
      setPendingComments(prev => prev.filter(c => c.id !== commentId));
    }
  };

  const reviewReport = async (commentId: number, action: string) => {
    const res = await fetch(`${API_BASE}/admin/comments/${commentId}/review?action=${action}`, { method: 'PUT', headers });
    if (res.ok) {
      setReportedComments(prev => prev.filter(c => c.id !== commentId));
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allow_comments: allowComments,
          comment_provider: commentProvider,
          disqus_shortname: disqusShortname,
          pre_moderation: preModeration,
          auto_moderation: spamFilter,
          spam_filter: spamFilter,
          warn_before_ban: warnBeforeBan,
          auto_ban_after_reports: 3,
          mute_stages: muteStages,
          badwords_shadow: badwordsShadow,
          badwords_warn_links: badwordsWarnLinks,
          badwords_warn_scam: badwordsWarnScam,
          badwords_freeze: badwordsFreeze,
        }),
      });
      setMsg(res.ok ? 'НАСТРОЙКИ СОХРАНЕНЫ' : 'ОШИБКА СОХРАНЕНИЯ');
    } catch {
      setMsg('ОШИБКА СЕТИ');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const Toggle = ({ val, setVal }: { val: boolean; setVal: (v: boolean) => void }) => (
    <div
      className={`springos-toggle ${val ? 'active' : ''}`}
      onClick={() => setVal(!val)}
      style={{ transform: 'scale(1.1)', cursor: 'pointer' }}
    />
  );

  return (
    <div>
      <div className="mb-6">
        <div className="font-terminal text-[30px] tracking-[3px] springos-glow-mustard" style={{ color: '#9b8c3b' }}>
          МОДЕРАЦИЯ<span className="springos-cursor" />
        </div>
        <div className="font-code text-[11px] mt-1">
          <span style={{ color: '#39ff14' }}>springtrap@afton</span>
          <span style={{ color: '#8a8070' }}>:</span>
          <span style={{ color: '#6cacff' }}>~/network/moderation</span>
          <span style={{ color: '#8a8070' }}>$ </span>
          <span style={{ color: '#d4c8b0' }}>./mod_tool --config</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LEFT: COMMENTS SETTINGS ── */}
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>КОММЕНТАРИИ</div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>РАЗРЕШИТЬ КОММЕНТАРИИ</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>ВКЛЮЧИТЬ СИСТЕМУ КОММЕНТАРИЕВ</div>
                </div>
                <Toggle val={allowComments} setVal={setAllowComments} />
              </div>
            </div>

            {allowComments && (
              <>
                <div className="mb-4">
                  <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>ПРОВАЙДЕР КОММЕНТАРИЕВ</div>
                  <select className="springos-input py-2 px-3 w-full" value={commentProvider} onChange={e => setCommentProvider(e.target.value)}>
                    <option value="builtin">Встроенный</option>
                    <option value="disqus">Disqus</option>
                  </select>
                </div>

                {commentProvider === 'disqus' && (
                  <div className="mb-4">
                    <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>DISQUS SHORTNAME</div>
                    <input className="springos-input py-2 px-3 w-full" placeholder="your-disqus-shortname" value={disqusShortname} onChange={e => setDisqusShortname(e.target.value)} />
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>ПРЕ-МОДЕРАЦИЯ</div>
                      <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>КОММЕНТАРИИ ОЖИДАЮТ ОДОБРЕНИЯ АДМИНА</div>
                    </div>
                    <Toggle val={preModeration} setVal={setPreModeration} />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#A9FF00' }}>АВТО-МОДЕРАЦИЯ</div>
                      <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>SPRINGOS BADWORD ENGINE (4 КАТЕГОРИИ)</div>
                    </div>
                    <Toggle val={spamFilter} setVal={setSpamFilter} />
                  </div>
                  {spamFilter && (
                    <div className="mt-2 p-3 rounded text-[10px] font-code" style={{ background: 'rgba(169,255,0,0.04)', border: '1px solid rgba(169,255,0,0.12)' }}>
                      <div style={{ color: '#A9FF00' }} className="mb-2">СЛОВАРИ ФИЛЬТРА:</div>
                      <div className="space-y-3">
                        <div>
                          <div className="font-terminal text-[12px] mb-1" style={{ color: '#ffcc00' }}>SHADOW — МАТ (АВТОЗАМЕНА)</div>
                          <textarea className="springos-input w-full py-2 px-3 text-[11px]" style={{ minHeight: 80 }} value={badwordsShadow} onChange={e => setBadwordsShadow(e.target.value)} />
                          <div className="text-[9px] mt-0.5" style={{ color: '#5a5040' }}>ЧЕРЕЗ ЗАПЯТУЮ. СЛОВА БУДУТ ЗАМЕНЕНЫ НА [ДАННЫЕ УДАЛЕНЫ ФАЗБЕР]</div>
                        </div>
                        <div>
                          <div className="font-terminal text-[12px] mb-1" style={{ color: '#ff8800' }}>WARN — ЗАПРЕЩЁННЫЕ ССЫЛКИ</div>
                          <textarea className="springos-input w-full py-2 px-3 text-[11px]" style={{ minHeight: 60 }} value={badwordsWarnLinks} onChange={e => setBadwordsWarnLinks(e.target.value)} />
                          <div className="text-[9px] mt-0.5" style={{ color: '#5a5040' }}>ЧЕРЕЗ ЗАПЯТУЮ. RegEx ШАБЛОНЫ (bit.ly, t.me И Т.Д.) ОСТАЮТСЯ ВСТРОЕННЫМИ</div>
                        </div>
                        <div>
                          <div className="font-terminal text-[12px] mb-1" style={{ color: '#ff8800' }}>WARN — СКАМ/РЕКЛАМА</div>
                          <textarea className="springos-input w-full py-2 px-3 text-[11px]" style={{ minHeight: 60 }} value={badwordsWarnScam} onChange={e => setBadwordsWarnScam(e.target.value)} />
                          <div className="text-[9px] mt-0.5" style={{ color: '#5a5040' }}>ЧЕРЕЗ ЗАПЯТУЮ. КОММЕНТАРИЙ ОТКЛОНЁН + ПРЕДУПРЕЖДЕНИЕ</div>
                        </div>
                        <div>
                          <div className="font-terminal text-[12px] mb-1" style={{ color: '#ff0044' }}>FREEZE — ОПАСНЫЙ КОНТЕНТ</div>
                          <textarea className="springos-input w-full py-2 px-3 text-[11px]" style={{ minHeight: 60 }} value={badwordsFreeze} onChange={e => setBadwordsFreeze(e.target.value)} />
                          <div className="text-[9px] mt-0.5" style={{ color: '#5a5040' }}>ЧЕРЕЗ ЗАПЯТУЮ. АККАУНТ ЗАМОРАЖИВАЕТСЯ МГНОВЕННО</div>
                        </div>
                      </div>
                      <div className="mt-2" style={{ color: '#5a5040' }}>ПОДДЕРЖКА: кириллица↔латиница, цифры→буквы, RegEx URL, whitelist доменов</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: MUTES + FREEZE ── */}
        <div className="springos-metal-frame springos-rust-dots rounded p-6">
          <div className="relative z-10">
            <div className="font-terminal text-[20px] mb-4" style={{ color: '#d4c8b0' }}>МУТЫ И ОГРАНИЧЕНИЯ</div>

            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-terminal text-[14px] tracking-[2px]" style={{ color: '#7a7060' }}>ПРЕДУПРЕЖДЕНИЕ ПЕРЕД МУТОМ</div>
                  <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>ПОКАЗАТЬ ПРЕДУПРЕЖДЕНИЕ ПЕРЕД СПРИНГЛОКОМ</div>
                </div>
                <Toggle val={warnBeforeBan} setVal={setWarnBeforeBan} />
              </div>
            </div>

            <div className="mb-4">
              <div className="font-terminal text-[14px] tracking-[2px] mb-1" style={{ color: '#7a7060' }}>СТАДИИ МУТОВ (ДНИ)</div>
              <input
                className="springos-input py-2 px-3 w-full"
                placeholder="1,7,30,0"
                value={muteStages}
                onChange={e => setMuteStages(e.target.value.replace(/[^0-9,]/g, ''))}
              />
              <div className="font-code text-[9px] mt-1" style={{ color: '#5a5040' }}>1Е НАРУШЕНИЕ → 1 ДЕНЬ, 2Е → 7 ДНЕЙ, 3Е → 30 ДНЕЙ, 0 = ВЕЧНЫЙ. ПОВТОР В ТЕЧЕНИЕ ГОДА = ВЕЧНЫЙ</div>
            </div>

            <div className="p-4 rounded" style={{ background: 'rgba(122,22,22,0.04)', border: '1px solid rgba(122,22,22,0.15)' }}>
              <div className="font-terminal text-[16px] springos-blink-blood" style={{ color: '#7a1616' }}>ЗАМОРОЗКА АККАУНТА</div>
              <div className="font-code text-[10px] mt-2 mb-3" style={{ color: '#5a5040' }}>
                ПОЛНАЯ БЛОКИРОВКА ДО РУЧНОЙ РАЗБЛОКИРОВКИ. ЗАМОРОЖЕННЫЙ НЕ МОЖЕТ ВОЙТИ.
              </div>

              <div className="flex gap-2 mb-3">
                <input
                  className="springos-input py-2 px-3 flex-1"
                  placeholder="ИМЯ ИЛИ EMAIL..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchUsers(); }}
                />
                <button className="springos-btn springos-btn-primary text-[12px]" onClick={searchUsers} disabled={searching}>
                  {searching ? '...' : 'НАЙТИ'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="overflow-x-auto springos-scroll rounded mb-3" style={{ border: '1px solid #2a2420', maxHeight: 200 }}>
                  <table className="springos-table w-full" style={{ background: '#0e0d0c' }}>
                    <thead>
                      <tr><th>ЮЗЕР</th><th>СТАТУС</th><th>ДЕЙСТВИЕ</th></tr>
                    </thead>
                    <tbody>
                      {searchResults.map(u => (
                        <tr key={u.id}>
                          <td className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{u.username}</td>
                          <td>
                            <span className="font-terminal text-[11px]" style={{ color: u.status === 'frozen' || u.status === 'banned' ? '#7a1616' : '#39ff14' }}>
                              {u.status.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            {u.status === 'frozen' ? (
                              <button className="springos-btn text-[10px] py-1 px-2" style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }} onClick={() => setAccountStatus(u.id, 'active')} disabled={actionLoading === u.id}>РАЗМОРОЗИТЬ</button>
                            ) : u.status === 'active' ? (
                              <button className="springos-btn text-[10px] py-1 px-2" style={{ color: '#7a1616', border: '1px solid rgba(122,22,22,0.3)' }} onClick={() => setAccountStatus(u.id, 'frozen')} disabled={actionLoading === u.id}>ЗАМОРОЗИТЬ</button>
                            ) : (
                              <span className="font-code text-[10px]" style={{ color: '#7a7060' }}>ЗАБАНЕН</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {frozenUsers.length > 0 && (
                <div>
                  <div style={{ borderTop: '1px solid #2a2420', margin: '8px 0' }} />
                  <div className="font-terminal text-[14px] mb-2" style={{ color: '#7a1616' }}>ЗАМОРОЖЕННЫЕ ({frozenUsers.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {frozenUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-2 p-2 rounded" style={{ background: 'rgba(122,22,22,0.06)', border: '1px solid rgba(122,22,22,0.15)' }}>
                        <span className="font-code text-[12px]" style={{ color: '#d4c8b0' }}>{u.username}</span>
                        <button className="font-terminal text-[10px] px-2 py-0.5 rounded" style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.2)', cursor: 'pointer', background: 'transparent' }} onClick={() => setAccountStatus(u.id, 'active')} disabled={actionLoading === u.id}>РАЗМОРОЗИТЬ</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {freezeMsg && (
                <div className="font-terminal text-[13px] mt-2" style={{ color: freezeMsg.includes('ОШИБКА') ? '#7a1616' : '#39ff14', textShadow: `0 0 6px ${freezeMsg.includes('ОШИБКА') ? 'rgba(122,22,22,0.4)' : 'rgba(57,255,20,0.3)'}` }}>
                  {'>'} {freezeMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ЖАЛОБЫ НА МОДЕРАЦИИ (pending + reported) ── */}
      <div className="mt-6 springos-metal-frame springos-rust-dots rounded p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-terminal text-[20px]" style={{ color: '#ff6600' }}>ЖАЛОБЫ НА МОДЕРАЦИИ ({reportedComments.length + (preModeration ? pendingComments.length : 0)})</div>
          <div className="flex gap-2">
            <button className="springos-btn springos-btn-primary text-[12px]" onClick={() => { loadReported(); if (preModeration) loadPending(); }} disabled={reportedLoading || pendingLoading}>
              {(reportedLoading || pendingLoading) ? '...' : 'ОБНОВИТЬ'}
            </button>
          </div>
        </div>

        {preModeration && pendingComments.length > 0 && (
          <div className="mb-4">
            <div className="font-terminal text-[14px] mb-2" style={{ color: '#ffcc00' }}>ОЖИДАЮТ ОДОБРЕНИЯ ({pendingComments.length})</div>
            <div className="space-y-3">
              {pendingComments.map(c => (
                <div key={c.id} className="p-3 rounded flex items-start gap-4" style={{ background: 'rgba(255,204,0,0.04)', border: '1px solid rgba(255,204,0,0.12)' }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-terminal text-[13px]" style={{ color: '#ffcc00' }}>{c.username}</span>
                      <span className="font-code text-[10px]" style={{ color: '#5a5040' }}>→ {c.manga_title}</span>
                      <span className="font-code text-[10px]" style={{ color: '#5a5040' }}>{c.created_at}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">ПРЕ-МОДЕРАЦИЯ</span>
                    </div>
                    <div className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{c.text}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button className="springos-btn text-[11px] py-1 px-3" style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }} onClick={() => moderateComment(c.id, 'approve')}>ОДОБРИТЬ</button>
                    <button className="springos-btn text-[11px] py-1 px-3" style={{ color: '#7a1616', border: '1px solid rgba(122,22,22,0.3)' }} onClick={() => moderateComment(c.id, 'reject')}>ОТКЛОНИТЬ</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportedComments.length > 0 && (
          <div>
            <div className="font-terminal text-[14px] mb-2" style={{ color: '#ff6600' }}>ЖАЛОБЫ ({reportedComments.length})</div>
            <div className="space-y-3">
              {reportedComments.map(c => (
                <div key={c.id} className="p-3 rounded" style={{ background: 'rgba(255,102,0,0.04)', border: '1px solid rgba(255,102,0,0.15)' }}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-terminal text-[13px]" style={{ color: '#ff6600' }}>{c.username}</span>
                        <span className="font-code text-[10px]" style={{ color: '#5a5040' }}>→ {c.manga_title}</span>
                        <span className="font-code text-[10px]" style={{ color: '#5a5040' }}>{c.created_at}</span>
                        <span className="font-code text-[10px]" style={{ color: '#ff6600' }}>⚠ {c.report_count} жалоб</span>
                        {c.warnings_count > 0 && <span className="font-code text-[10px]" style={{ color: '#ff4444' }}>⚡{c.warnings_count}</span>}
                      </div>
                      <div className="flex gap-1 mb-1 flex-wrap">
                        {c.report_reasons.map((r, i) => (
                          <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{r}</span>
                        ))}
                      </div>
                      <div className="font-code text-[13px]" style={{ color: '#d4c8b0' }}>{c.text}</div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="springos-btn text-[11px] py-1 px-3" style={{ color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }} onClick={() => reviewReport(c.id, 'approve')}>ОТКЛОНИТЬ ЖАЛОБУ</button>
                      <button className="springos-btn text-[11px] py-1 px-3" style={{ color: '#7a1616', border: '1px solid rgba(122,22,22,0.3)' }} onClick={() => reviewReport(c.id, 'reject')}>УДАЛИТЬ + МУТ</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reportedComments.length === 0 && (!preModeration || pendingComments.length === 0) && (
          <div className="font-code text-[12px] text-center py-4" style={{ color: '#5a5040' }}>НЕТ ЖАЛОБ НА МОДЕРАЦИИ</div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button className="springos-btn springos-btn-glow text-[16px] springos-glitch-hover" onClick={save} disabled={saving}>
          {saving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ НАСТРОЙКИ'}
        </button>
        {msg && (
          <div className="font-terminal text-[15px]" style={{ color: msg.includes('ОШИБКА') ? '#7a1616' : '#39ff14', textShadow: `0 0 8px ${msg.includes('ОШИБКА') ? 'rgba(122,22,22,0.5)' : 'rgba(57,255,20,0.4)'}` }}>
            {'>'} {msg}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModerationPage;
