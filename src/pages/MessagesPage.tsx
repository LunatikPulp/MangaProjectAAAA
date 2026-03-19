import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE } from '../services/externalApiService';
import FramedAvatar from '../components/FramedAvatar';
import RankBadge from '../components/RankBadge';

/* ═══════════════════════════════════════════════════
   SPRINGMANGA — ДИАЛОГОВЫЕ ШЛЮЗЫ
   "Techno-Organic Decay" Messages Interface
   ═══════════════════════════════════════════════════ */

interface Conversation {
    user_id: number;
    username: string;
    avatar_url: string;
    avatar_frame: string;
    level: number;
    last_message: string;
    last_time: string;
    unread: number;
    is_online?: boolean;
    last_seen?: string | null;
    chapters_read?: number;
}

interface Message {
    id: number;
    sender_id: number;
    receiver_id: number;
    text: string;
    is_read: boolean;
    timestamp: string;
    is_mine: boolean;
}

// ── Sleeping Animatronic Cat SVG ──
const SleepingCatSVG: React.FC = () => (
    <svg width="160" height="140" viewBox="0 0 160 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="idle-cat-svg">
        {/* Body */}
        <ellipse cx="80" cy="100" rx="55" ry="28" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1.5" />
        {/* Head */}
        <circle cx="80" cy="62" r="28" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1.5" />
        {/* Ears */}
        <polygon points="58,42 50,18 68,36" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1.5" />
        <polygon points="102,42 110,18 92,36" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1.5" />
        {/* Ear inner glow */}
        <polygon points="60,40 54,24 66,37" fill="none" stroke="#A9FF00" strokeWidth="0.5" opacity="0.3" />
        <polygon points="100,40 106,24 94,37" fill="none" stroke="#A9FF00" strokeWidth="0.5" opacity="0.3" />
        {/* Closed eyes — X marks (broken/glitchy) */}
        <g opacity="0.5" stroke="#A9FF00" strokeWidth="1.5" strokeLinecap="round">
            <line x1="68" y1="56" x2="72" y2="60" />
            <line x1="72" y1="56" x2="68" y2="60" />
            <line x1="88" y1="56" x2="92" y2="60" />
            <line x1="92" y1="56" x2="88" y2="60" />
        </g>
        {/* Nose */}
        <polygon points="80,66 78,69 82,69" fill="#3D2B1F" />
        {/* Mouth — slight frown */}
        <path d="M76 72 Q80 70 84 72" stroke="#3D2B1F" strokeWidth="1" fill="none" />
        {/* Whiskers */}
        <g stroke="#3D2B1F" strokeWidth="0.8" opacity="0.4">
            <line x1="60" y1="66" x2="40" y2="63" />
            <line x1="60" y1="69" x2="38" y2="70" />
            <line x1="100" y1="66" x2="120" y2="63" />
            <line x1="100" y1="69" x2="122" y2="70" />
        </g>
        {/* Tail */}
        <path d="M130 95 Q145 80 140 100 Q135 115 125 108" stroke="#3D2B1F" strokeWidth="2" fill="none" />
        {/* Paws tucked under */}
        <ellipse cx="55" cy="112" rx="12" ry="6" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1" />
        <ellipse cx="105" cy="112" rx="12" ry="6" fill="#1A1A1A" stroke="#3D2B1F" strokeWidth="1" />
        {/* Zzz floating */}
        <g className="zzz-float" opacity="0.25">
            <text x="115" y="45" fill="#A9FF00" fontFamily="monospace" fontSize="14" fontWeight="bold">Z</text>
            <text x="125" y="32" fill="#A9FF00" fontFamily="monospace" fontSize="11" fontWeight="bold">z</text>
            <text x="132" y="22" fill="#A9FF00" fontFamily="monospace" fontSize="8" fontWeight="bold">z</text>
        </g>
        {/* Scan line across body */}
        <line x1="25" y1="85" x2="135" y2="85" stroke="#A9FF00" strokeWidth="0.3" opacity="0.15">
            <animate attributeName="y1" values="60;120;60" dur="4s" repeatCount="indefinite" />
            <animate attributeName="y2" values="60;120;60" dur="4s" repeatCount="indefinite" />
        </line>
        {/* Glitch rectangles */}
        <rect x="65" y="58" width="30" height="2" fill="#A9FF00" opacity="0">
            <animate attributeName="opacity" values="0;0.15;0;0" dur="3s" repeatCount="indefinite" />
            <animate attributeName="x" values="65;62;68;65" dur="3s" repeatCount="indefinite" />
        </rect>
    </svg>
);

// ── Glitch keyframes injected as style ──
const GlitchStyles: React.FC = () => (
    <style>{`
        @keyframes msgGlitchIn {
            0%   { transform: translateX(-4px) skewX(-2deg); opacity: 0.3; filter: hue-rotate(90deg); }
            30%  { transform: translateX(2px) skewX(1deg); opacity: 0.7; }
            60%  { transform: translateX(-1px); opacity: 0.9; filter: none; }
            100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes unreadBlink {
            0%, 100% { opacity: 1; box-shadow: 0 0 4px rgba(169,255,0,0.4); }
            50%      { opacity: 0.6; box-shadow: 0 0 10px rgba(169,255,0,0.8); }
        }
        @keyframes zzzFloat {
            0%, 100% { transform: translateY(0); opacity: 0.25; }
            50%      { transform: translateY(-6px); opacity: 0.4; }
        }
        @keyframes scanPulse {
            0%, 100% { opacity: 0.04; }
            50%      { opacity: 0.08; }
        }
        @keyframes terminalCursorBlink {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0; }
        }
        .msg-glitch-in {
            animation: msgGlitchIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .unread-blink {
            animation: unreadBlink 1.2s ease-in-out infinite;
        }
        .zzz-float {
            animation: zzzFloat 2.5s ease-in-out infinite;
        }
        .idle-cat-svg {
            filter: drop-shadow(0 0 20px rgba(169,255,0,0.05));
        }
        .conv-item-hover {
            transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .conv-item-hover:hover {
            background-color: #2A2A2A !important;
        }
        /* Custom scrollbar — rust track */
        .rust-scrollbar::-webkit-scrollbar {
            width: 5px;
        }
        .rust-scrollbar::-webkit-scrollbar-track {
            background: #121212;
        }
        .rust-scrollbar::-webkit-scrollbar-thumb {
            background: #3D2B1F;
            border-radius: 0;
        }
        .rust-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #5A3F2B;
        }
        /* Hide scrollbar for Firefox */
        .rust-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: #3D2B1F #121212;
        }
    `}</style>
);

function formatLastSeen(iso: string | null | undefined): string {
    if (!iso) return 'давно';
    const diff = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} дн. назад`;
    return 'давно';
}

const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return isMobile;
};

const MessagesPage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const token = localStorage.getItem('backend_token');
    const isMobile = useIsMobile();

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatUser, setChatUser] = useState<{ id: number; username: string; avatar_url: string; avatar_frame: string; is_online?: boolean; last_seen?: string | null; chapters_read?: number } | null>(null);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [newMsgIds, setNewMsgIds] = useState<Set<number>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevMsgCount = useRef(0);

    // Load conversations
    const loadConversations = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/messages/conversations`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setConversations(await res.json());
        } catch {}
    }, [token]);

    // Load messages for a chat
    const loadMessages = useCallback(async (uid: string) => {
        if (!token) return;
        try {
            const res = await fetch(`${API_BASE}/messages/${uid}?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data: Message[] = await res.json();
                // Detect new messages for glitch animation
                if (data.length > prevMsgCount.current && prevMsgCount.current > 0) {
                    const newIds = new Set(data.slice(prevMsgCount.current).map(m => m.id));
                    setNewMsgIds(newIds);
                    setTimeout(() => setNewMsgIds(new Set()), 400);
                }
                prevMsgCount.current = data.length;
                setMessages(data);
            }
        } catch {}
    }, [token]);

    // Load chat user info
    useEffect(() => {
        if (!userId) { setChatUser(null); setMessages([]); prevMsgCount.current = 0; return; }
        fetch(`${API_BASE}/users/${userId}`)
            .then(r => r.json())
            .then(d => setChatUser({ id: d.id, username: d.username, avatar_url: d.avatar_url, avatar_frame: d.avatar_frame, is_online: d.is_online, last_seen: d.last_seen, chapters_read: d.chapters_read ?? d.stats?.chapters_read ?? 0 }))
            .catch(() => setChatUser(null));
    }, [userId]);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    // Refresh chat user online status
    const refreshChatUser = useCallback((uid: string) => {
        fetch(`${API_BASE}/users/${uid}`)
            .then(r => r.json())
            .then(d => setChatUser(prev => prev ? { ...prev, is_online: d.is_online, last_seen: d.last_seen } : prev))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (userId) {
            prevMsgCount.current = 0;
            loadMessages(userId);
            pollRef.current = setInterval(() => {
                loadMessages(userId);
                refreshChatUser(userId);
            }, 3000);
            return () => { if (pollRef.current) clearInterval(pollRef.current); };
        }
    }, [userId, loadMessages, refreshChatUser]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !token || !userId) return;
        setSending(true);
        try {
            const res = await fetch(`${API_BASE}/messages/${userId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: input.trim() }),
            });
            if (res.ok) {
                const msg = await res.json();
                setNewMsgIds(new Set([msg.id]));
                setTimeout(() => setNewMsgIds(new Set()), 400);
                setMessages(prev => [...prev, msg]);
                prevMsgCount.current += 1;
                setInput('');
                loadConversations();
            }
        } catch {}
        setSending(false);
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-full" style={{ background: '#121212' }}>
                <div className="text-center font-mono">
                    <div className="text-4xl mb-3 opacity-20">🔒</div>
                    <p className="text-sm tracking-widest uppercase" style={{ color: '#A9FF00', opacity: 0.5 }}>
                        [ ДОСТУП ЗАПРЕЩЁН ]
                    </p>
                    <p className="text-xs mt-2" style={{ color: '#3D2B1F' }}>
                        Требуется авторизация в системе
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            <GlitchStyles />
            <div className="flex overflow-hidden"
                 style={{ background: '#121212', height: 'calc(100vh - 56px)' }}>

                {/* ═══════════════════════════════════════
                    LEFT PANEL — ДИАЛОГОВЫЕ ШЛЮЗЫ (30%)
                   ═══════════════════════════════════════ */}
                <div className="flex flex-col relative spring-scanlines"
                     style={{
                         width: isMobile ? '100%' : '30%',
                         minWidth: isMobile ? 'unset' : '280px',
                         maxWidth: isMobile ? 'unset' : '380px',
                         background: '#1A1A1A',
                         borderRight: isMobile ? 'none' : '1px solid #3D2B1F',
                         display: isMobile && userId ? 'none' : 'flex',
                     }}>

                    {/* Header */}
                    <div className="px-4 py-4 relative z-10"
                         style={{ borderBottom: '1px solid #3D2B1F' }}>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 animate-pulse"
                                 style={{
                                     background: '#A9FF00',
                                     boxShadow: '0 0 8px rgba(169,255,0,0.6)',
                                 }} />
                            <h2 className="text-xs font-mono font-bold tracking-[0.2em] uppercase"
                                style={{ color: '#A9FF00' }}>
                                {'>'} ДИАЛОГОВЫЕ ШЛЮЗЫ
                            </h2>
                            {conversations.length > 0 && (
                                <span className="ml-auto text-[9px] font-mono tracking-wider"
                                      style={{ color: '#3D2B1F' }}>
                                    [{conversations.length}]
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Conversations list */}
                    <div className="flex-1 overflow-y-auto rust-scrollbar relative z-10">
                        {conversations.length > 0 ? (
                            conversations.map((c) => {
                                const isActive = userId === String(c.user_id);
                                return (
                                    <Link
                                        to={`/messages/${c.user_id}`}
                                        key={c.user_id}
                                        className="conv-item-hover relative flex items-center gap-3 px-4 py-3 cursor-pointer"
                                        style={{
                                            background: isActive ? 'rgba(169,255,0,0.04)' : 'transparent',
                                            borderBottom: '1px solid rgba(61,43,31,0.3)',
                                            borderLeft: isActive ? '2px solid #A9FF00' : '2px solid transparent',
                                            ...(isActive ? { boxShadow: 'inset 4px 0 12px rgba(169,255,0,0.05)' } : {}),
                                        }}
                                    >
                                        {/* Avatar with online indicator */}
                                        <div className="shrink-0 relative">
                                            <FramedAvatar avatarUrl={c.avatar_url} username={c.username} size={40} frameKey={c.avatar_frame} />
                                            {/* Online dot */}
                                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5"
                                                 style={{
                                                     background: c.is_online ? '#A9FF00' : '#555',
                                                     border: '2px solid #1A1A1A',
                                                     borderRadius: '50%',
                                                     boxShadow: c.is_online ? '0 0 6px rgba(169,255,0,0.5)' : 'none',
                                                 }} />
                                            {/* Level */}
                                            {c.level > 0 && (
                                                <div className="absolute -bottom-0.5 -right-0.5 px-1 min-w-[14px] h-3.5 flex items-center justify-center"
                                                     style={{
                                                         background: '#121212',
                                                         border: '1px solid #3D2B1F',
                                                     }}>
                                                    <span className="text-[7px] font-mono font-bold" style={{ color: '#A9FF00' }}>{c.level}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Content — "Server Log Entry" style */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-mono font-bold truncate"
                                                      style={{ color: isActive ? '#A9FF00' : '#E0E0E0' }}>
                                                    {c.username}
                                                </span>
                                                <span className="text-[8px] font-mono shrink-0 tabular-nums"
                                                      style={{ color: 'rgba(224,224,224,0.35)' }}>
                                                    {c.last_time}
                                                </span>
                                            </div>
                                            <p className="text-[10px] font-mono truncate mt-0.5"
                                               style={{ color: c.unread > 0 ? 'rgba(224,224,224,0.7)' : 'rgba(224,224,224,0.4)' }}>
                                                <span style={{ color: 'rgba(169,255,0,0.3)', marginRight: '4px' }}>{'>'}</span>
                                                {c.last_message}
                                            </p>
                                        </div>

                                        {/* Unread — "short circuit" blinking square */}
                                        {c.unread > 0 && (
                                            <div className="shrink-0">
                                                <span className="unread-blink inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-mono font-bold"
                                                      style={{
                                                          background: '#A9FF00',
                                                          color: '#121212',
                                                          borderRadius: '0',
                                                      }}>
                                                    {c.unread}
                                                </span>
                                            </div>
                                        )}
                                    </Link>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                                <div className="text-[10px] font-mono tracking-widest uppercase mb-2"
                                     style={{ color: 'rgba(169,255,0,0.35)' }}>
                                    SYSTEM_LOG: 0 entries
                                </div>
                                <p className="text-[9px] font-mono leading-relaxed"
                                   style={{ color: 'rgba(224,224,224,0.35)' }}>
                                    Откройте профиль пользователя<br />и инициируйте соединение
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════
                    RIGHT PANEL — Messages (70%)
                   ═══════════════════════════════════════ */}
                <div className="flex-1 flex flex-col min-w-0 relative"
                     style={{
                         background: '#121212',
                         display: isMobile && !userId ? 'none' : 'flex',
                     }}>

                    {userId && chatUser ? (
                        <>
                            {/* ── Chat header ── */}
                            <div className={`flex items-center gap-3 ${isMobile ? 'px-3' : 'px-5'} py-3`}
                                 style={{
                                     background: 'rgba(26,26,26,0.6)',
                                     borderBottom: '1px solid #3D2B1F',
                                     backdropFilter: 'blur(12px)',
                                 }}>
                                {isMobile && (
                                    <button
                                        onClick={() => navigate('/messages')}
                                        className="shrink-0 w-8 h-8 flex items-center justify-center font-mono font-bold mr-1 transition-colors"
                                        style={{
                                            color: '#A9FF00',
                                            background: 'rgba(169,255,0,0.05)',
                                            border: '1px solid #3D2B1F',
                                            borderRadius: '0',
                                        }}
                                    >
                                        ◂
                                    </button>
                                )}
                                <Link to={`/user/${chatUser.id}`}
                                      className="flex items-center gap-3 group">
                                    <FramedAvatar avatarUrl={chatUser.avatar_url} username={chatUser.username} size={34} frameKey={chatUser.avatar_frame} />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono font-bold transition-colors duration-200"
                                                  style={{ color: '#E0E0E0' }}>
                                                {chatUser.username}
                                            </span>
                                            <span style={{ position: 'relative', top: '-7уpx' }}>
                                                <RankBadge chaptersRead={chatUser.chapters_read || 0} size="sm" />
                                            </span>
                                        </div>
                                        <span className="text-[8px] font-mono tracking-widest uppercase flex items-center gap-1.5"
                                              style={{ color: chatUser.is_online ? '#A9FF00' : 'rgba(224,224,224,0.4)' }}>
                                            <span className="inline-block w-1.5 h-1.5 rounded-full"
                                                  style={{
                                                      background: chatUser.is_online ? '#A9FF00' : '#555',
                                                      boxShadow: chatUser.is_online ? '0 0 6px rgba(169,255,0,0.6)' : 'none',
                                                  }} />
                                            {chatUser.is_online ? 'В сети' : `Был(а) ${formatLastSeen(chatUser.last_seen)}`}
                                        </span>
                                    </div>
                                </Link>
                            </div>

                            {/* ── Messages area ── */}
                            <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-3' : 'px-5'} py-4 space-y-1 rust-scrollbar`}>
                                {messages.length === 0 && (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="text-center font-mono">
                                            <div className="text-2xl mb-3 opacity-10">▌</div>
                                            <p className="text-xs tracking-widest uppercase" style={{ color: '#3D2B1F' }}>
                                                INIT_DIALOG: Отправьте первый пакет
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {messages.map((m, idx) => {
                                    const showTimestamp = idx === 0 || (idx > 0 && messages[idx - 1].timestamp?.split(' ')[0] !== m.timestamp?.split(' ')[0]);
                                    const isNew = newMsgIds.has(m.id);
                                    return (
                                        <React.Fragment key={m.id}>
                                            {showTimestamp && m.timestamp && (
                                                <div className="flex items-center gap-3 py-3">
                                                    <div className="flex-1 h-px" style={{ background: 'rgba(61,43,31,0.3)' }} />
                                                    <span className="text-[8px] font-mono tracking-widest uppercase shrink-0"
                                                          style={{ color: '#3D2B1F' }}>
                                                        {m.timestamp.split(' ')[0]}
                                                    </span>
                                                    <div className="flex-1 h-px" style={{ background: 'rgba(61,43,31,0.3)' }} />
                                                </div>
                                            )}
                                            <div className={`flex items-end gap-2 ${m.is_mine ? 'justify-end' : 'justify-start'} ${isNew ? 'msg-glitch-in' : ''}`}>
                                                {/* Partner avatar */}
                                                {!m.is_mine && (
                                                    <div className="shrink-0 mb-1">
                                                        <FramedAvatar avatarUrl={chatUser.avatar_url} username={chatUser.username} size={26} frameKey={chatUser.avatar_frame} />
                                                    </div>
                                                )}

                                                {/* Message bubble */}
                                                <div className={`${isMobile ? 'max-w-[80%]' : 'max-w-[65%]'} ${m.is_mine ? (isMobile ? 'ml-4' : 'ml-12') : (isMobile ? 'mr-4' : 'mr-12')}`}>
                                                    <div className="px-3.5 py-2.5 text-sm leading-relaxed"
                                                         style={m.is_mine
                                                             ? {
                                                                 background: 'rgba(169,255,0,0.12)',
                                                                 border: '1px solid rgba(169,255,0,0.2)',
                                                                 color: '#E0E0E0',
                                                                 borderRadius: '0px',
                                                             }
                                                             : {
                                                                 background: '#1A1A1A',
                                                                 border: '1px solid #3D2B1F',
                                                                 color: '#E0E0E0',
                                                                 borderRadius: '0px',
                                                             }
                                                         }>
                                                        <p className="whitespace-pre-wrap break-words font-mono text-[13px]">{m.text}</p>
                                                    </div>
                                                    <div className={`mt-0.5 px-1 ${m.is_mine ? 'text-right' : 'text-left'}`}>
                                                        <span className="text-[8px] font-mono tabular-nums" style={{ color: '#3D2B1F' }}>
                                                            {m.timestamp?.split(' ')[1] || m.timestamp}
                                                        </span>
                                                        {m.is_mine && m.is_read && (
                                                            <span className="text-[8px] font-mono ml-1.5" style={{ color: 'rgba(169,255,0,0.4)' }}>✓✓</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* ── Command-line Input ── */}
                            <div className={`${isMobile ? 'px-2 py-2' : 'px-5 py-3'}`}
                                 style={{
                                     borderTop: '1px solid #3D2B1F',
                                     background: 'rgba(26,26,26,0.4)',
                                 }}>
                                <div className="flex items-center gap-0">
                                    {/* Prompt prefix */}
                                    {!isMobile && (
                                        <div className="shrink-0 px-3 py-2.5 font-mono text-xs font-bold select-none"
                                             style={{
                                                 color: '#A9FF00',
                                                 background: 'rgba(169,255,0,0.05)',
                                                 border: '1px solid #3D2B1F',
                                                 borderRight: 'none',
                                             }}>
                                            <span style={{ opacity: 0.6 }}>spring@msg</span>
                                            <span style={{ color: '#3D2B1F' }}>:</span>
                                            <span>~$</span>
                                        </div>
                                    )}
                                    {/* Input */}
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                        placeholder="Введите данные для передачи..."
                                        className="flex-1 py-2.5 px-3 text-sm font-mono focus:outline-none"
                                        style={{
                                            background: '#121212',
                                            border: '1px solid #3D2B1F',
                                            borderRight: 'none',
                                            color: '#E0E0E0',
                                            borderRadius: '0',
                                            caretColor: '#A9FF00',
                                        }}
                                    />
                                    {/* Send button — neon chevron */}
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || sending}
                                        className="shrink-0 w-11 h-[42px] flex items-center justify-center font-mono font-bold transition-all duration-150"
                                        style={{
                                            background: input.trim() && !sending ? '#A9FF00' : 'rgba(169,255,0,0.1)',
                                            color: input.trim() && !sending ? '#121212' : 'rgba(169,255,0,0.3)',
                                            border: '1px solid #3D2B1F',
                                            borderRadius: '0',
                                            cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
                                            boxShadow: input.trim() && !sending ? '0 0 12px rgba(169,255,0,0.3)' : 'none',
                                        }}
                                    >
                                        {sending ? (
                                            <span className="animate-pulse text-base">_</span>
                                        ) : (
                                            <span className="text-lg">▸</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ── SYSTEM_IDLE — No chat selected ── */
                        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                            {/* Background grid */}
                            <div className="absolute inset-0"
                                 style={{
                                     backgroundImage: 'linear-gradient(rgba(169,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(169,255,0,0.03) 1px, transparent 1px)',
                                     backgroundSize: '40px 40px',
                                     animation: 'scanPulse 4s ease-in-out infinite',
                                 }} />

                            {/* Horizontal scan line */}
                            <div className="absolute left-0 right-0 h-px pointer-events-none"
                                 style={{
                                     background: 'linear-gradient(90deg, transparent, rgba(169,255,0,0.1), transparent)',
                                     animation: 'scanMove 6s linear infinite',
                                 }} />

                            <div className="text-center font-mono relative z-10">
                                {/* Sleeping animatronic cat */}
                                <div className="mb-6 flex justify-center">
                                    <SleepingCatSVG />
                                </div>

                                {/* System message */}
                                <div className="space-y-2">
                                    <p className="text-sm tracking-widest uppercase font-bold"
                                       style={{ color: 'rgba(169,255,0,0.3)' }}>
                                        SYSTEM_IDLE
                                    </p>
                                    <p className="text-xs tracking-wider"
                                       style={{ color: 'rgba(169,255,0,0.35)' }}>
                                        No data packets found
                                    </p>
                                    <div className="flex items-center justify-center gap-1.5 mt-4">
                                        <div className="w-1 h-1" style={{ background: '#3D2B1F' }} />
                                        <div className="w-1 h-1" style={{ background: '#3D2B1F' }} />
                                        <div className="w-1 h-1" style={{ background: '#3D2B1F' }} />
                                    </div>
                                    <p className="text-[10px] tracking-wider leading-relaxed mt-3"
                                       style={{ color: 'rgba(224,224,224,0.4)' }}>
                                        Система ожидает входящих сигналов...<br />
                                        Выберите шлюз или откройте профиль пользователя
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default MessagesPage;
