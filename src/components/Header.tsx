import React, { useState, useContext, useRef, useEffect } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../contexts/AuthContext';
import { MangaContext } from '../contexts/MangaContext';
import { NotificationContext } from '../contexts/NotificationContext';
import { typeDisplayNames } from '../types';
import { Manga } from '../types';
import FramedAvatar from './FramedAvatar';
import Logo from './icons/Logo';

import { API_BASE } from '../services/externalApiService';

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const BookmarkIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
);

const HomeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);

const MenuDotsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

const NavItem: React.FC<{ to: string, children: React.ReactNode }> = ({ to, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `px-4 py-2 rounded-none border-b-2 transition-all font-mono text-sm tracking-wide uppercase ${
        isActive
          ? 'border-brand-accent text-brand-accent bg-brand-accent-5'
          : 'border-transparent text-text-secondary hover:text-brand-accent hover:border-brand-30'
      }`
    }
  >
    {children}
  </NavLink>
);

/** Protected Nav Item - opens auth modal if not logged in */
const ProtectedNavItem: React.FC<{ to: string, children: React.ReactNode, requireAuth: boolean }> = ({ to, children, requireAuth }) => {
  const { user, openAuthModal } = useContext(AuthContext);
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/');

  const handleClick = (e: React.MouseEvent) => {
    if (requireAuth && !user) {
      e.preventDefault();
      openAuthModal('login');
    }
  };

  return (
    <NavLink
      to={to}
      onClick={handleClick}
      className={`px-4 py-2 rounded-none border-b-2 transition-all font-mono text-sm tracking-wide uppercase ${
        isActive
          ? 'border-brand-accent text-brand-accent bg-brand-accent-5'
          : 'border-transparent text-text-secondary hover:text-brand-accent hover:border-brand-30'
      }`}
    >
      {children}
    </NavLink>
  );
};

/** Mobile bottom tab item */
const MobileTabItem: React.FC<{ to: string; label: string; children: React.ReactNode; requireAuth?: boolean }> = ({ to, label, children, requireAuth = false }) => {
  const { user, openAuthModal } = useContext(AuthContext);
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/');

  const handleClick = (e: React.MouseEvent) => {
    if (requireAuth && !user) {
      e.preventDefault();
      openAuthModal('login');
    }
  };

  return (
    <NavLink to={to} onClick={handleClick} className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
      <span className={`transition-colors ${isActive ? 'text-brand-accent' : 'text-muted'}`}>
        {children}
      </span>
      <span className={`text-[10px] leading-none truncate font-mono ${isActive ? 'text-brand-accent font-medium' : 'text-muted'}`}>{label}</span>
    </NavLink>
  );
};

const Header: React.FC = () => {
  const { user, logout, openAuthModal } = useContext(AuthContext);
  const { mangaList, searchMangas } = useContext(MangaContext);
  const { unreadCount } = useContext(NotificationContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isMessagesPage = location.pathname.startsWith('/messages');
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Manga[]>([]);
  const [userResults, setUserResults] = useState<{ id: number; username: string; avatar_url: string; avatar_frame: string; level: number }[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [scrapBalance, setScrapBalance] = useState<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Poll unread messages count + scrap balance
  useEffect(() => {
    if (!user) { setUnreadMessages(0); setScrapBalance(null); return; }
    const token = localStorage.getItem('backend_token');
    if (!token) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/unread/count`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { const data = await res.json(); setUnreadMessages(data.count || 0); }
      } catch {}
    };
    const fetchScrap = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/profile-full`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setScrapBalance((data.gamification?.scrap || 0) + (data.gamification?.donated_scrap || 0));
        }
      } catch {}
    };
    fetchUnread();
    fetchScrap();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim() === '') { setSearchResults([]); setUserResults([]); return; }
    const local = mangaList.filter(manga => manga.title.toLowerCase().includes(searchQuery.toLowerCase()));
    if (local.length >= 5) { setSearchResults(local.slice(0, 5)); }
    const timer = setTimeout(async () => {
      // Search manga
      try { const results = await searchMangas(searchQuery); setSearchResults(results.slice(0, 5)); }
      catch { setSearchResults(local.slice(0, 5)); }
      // Search users
      try {
        const res = await fetch(`${API_BASE}/users?q=${encodeURIComponent(searchQuery)}&limit=3`);
        if (res.ok) { const data = await res.json(); setUserResults(data.users || []); }
        else setUserResults([]);
      } catch { setUserResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mangaList, searchMangas]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchQuery('');
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevBody; document.documentElement.style.overflow = prevHtml; };
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* ===== Desktop & Mobile Top Header ===== */}
      <header className="sticky top-0 z-50 bg-base-95 backdrop-blur-xl border-b border-overlay shadow-lg shadow-rust-10 transition-all duration-300">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-14 md:h-16">

            {/* Left: Logo + Desktop Nav */}
            <div className="hidden md:flex items-center space-x-8">
              <NavLink to="/" className="flex items-center space-x-2.5 group" data-spring-logo>
                <div className="transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(169,255,0,0.3)]">
                  <Logo />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-display font-bold text-lg tracking-[0.2em] text-text-primary group-hover:text-brand-accent transition-colors">
                    SPRING<span className="text-brand-accent">MANGA</span>
                  </span>
                  <span className="text-[9px] font-mono text-muted tracking-[0.3em] uppercase">sys_v2.087</span>
                </div>
              </NavLink>
              <nav className="flex items-center space-x-1">
                <NavItem to="/catalog">Каталог</NavItem>
                <NavItem to="/tops">Топы</NavItem>
                <ProtectedNavItem to="/history" requireAuth={true}>История</ProtectedNavItem>
                <ProtectedNavItem to="/quiz" requireAuth={true}>Викторина</ProtectedNavItem>
                <ProtectedNavItem to="/cards" requireAuth={true}>Карточки</ProtectedNavItem>
              </nav>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-md ml-2 sm:ml-6" ref={searchRef}>
              <div className="relative group">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted group-focus-within:text-brand-accent transition-colors" />
                <input
                  type="text"
                  placeholder="[ПОИСК] ..."
                  className="w-full bg-surface border border-overlay rounded-none pl-10 pr-4 py-2 text-base sm:text-sm font-mono text-text-primary placeholder-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 focus:bg-surface-hover transition-all duration-300"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {(searchResults.length > 0 || userResults.length > 0) && (
                  <div className="absolute top-full mt-1 w-full bg-surface border border-overlay shadow-2xl shadow-rust-20 overflow-hidden z-50 animate-fade-in max-h-[70vh] overflow-y-auto">
                    {/* Manga results */}
                    {searchResults.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-mono text-muted uppercase tracking-widest bg-surface-hover border-b border-overlay-30">Тайтлы</div>
                        <ul>
                          {searchResults.map(manga => (
                            <li key={manga.id}>
                              <Link
                                to={`/manga/${manga.slug || manga.id}`}
                                onClick={() => setSearchQuery('')}
                                className="flex items-center gap-3 p-3 hover:bg-brand-10 border-b border-overlay-30 transition-colors group/item"
                              >
                                <img src={manga.cover} alt={manga.title} className="w-10 h-14 object-cover shadow-sm group-hover/item:scale-105 transition-transform" />
                                <div>
                                  <span className="font-medium text-sm block text-text-primary group-hover/item:text-brand-accent transition-colors">{manga.title}</span>
                                  <span className="text-xs font-mono text-muted">{manga.year} • {typeDisplayNames[manga.type]}</span>
                                </div>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => { navigate(`/catalog?search=${encodeURIComponent(searchQuery)}`); setSearchQuery(''); }}
                          className="w-full py-2 text-center text-xs font-mono text-brand-accent hover:bg-brand-10 border-b border-overlay transition-colors"
                        >
                          Все результаты по тайтлам
                        </button>
                      </>
                    )}
                    {/* User results */}
                    {userResults.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-mono text-muted uppercase tracking-widest bg-surface-hover border-b border-overlay-30">Пользователи</div>
                        <ul>
                          {userResults.map(u => (
                            <li key={u.id}>
                              <Link
                                to={`/user/${u.id}`}
                                onClick={() => setSearchQuery('')}
                                className="flex items-center gap-3 p-3 hover:bg-brand-10 border-b border-overlay-30 transition-colors group/item"
                              >
                                <FramedAvatar avatarUrl={u.avatar_url ? (u.avatar_url.startsWith('http') ? u.avatar_url : `${API_BASE}${u.avatar_url}`) : ''} frameKey={u.avatar_frame || 'none'} username={u.username} size={36} />
                                <div>
                                  <span className="font-medium text-sm block text-text-primary group-hover/item:text-brand-accent transition-colors">{u.username}</span>
                                  <span className="text-xs font-mono text-muted">Уровень {u.level}</span>
                                </div>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Desktop actions */}
            <div className="hidden md:flex items-center space-x-3 ml-6">
              <button
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuthModal('login');
                  } else {
                    navigate('/bookmarks');
                  }
                }}
                className="p-2 text-muted hover:text-brand-accent hover:bg-brand-accent-5 transition-all relative group"
                aria-label="Закладки"
              >
                <BookmarkIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
              </button>
              <button
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuthModal('login');
                  } else {
                    navigate('/notifications');
                  }
                }}
                className="p-2 text-muted hover:text-brand-accent hover:bg-brand-accent-5 transition-all relative group"
                aria-label="Уведомления"
              >
                <div className="relative">
                  <BellIcon className="w-6 h-6 transition-transform group-hover:scale-110" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold ring-2 ring-base">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
              </button>

              {user ? (
                <div className="relative" ref={profileRef}>
                  <button onClick={() => setProfileOpen(!isProfileOpen)} aria-label="Меню профиля" className="relative">
                    <FramedAvatar avatarUrl={user.avatar_url} username={user.username} size={32} frameKey={user.avatar_frame} className="border-2 border-transparent hover:border-brand-accent rounded-full transition-colors" />
                    {unreadMessages > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-mono font-bold ring-2 ring-base z-10">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                  </button>
                  <AnimatePresence>
                  {isProfileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-56 bg-surface border border-overlay shadow-2xl shadow-rust-20 py-2 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-overlay mb-1 spring-rust">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-text-primary font-mono">{user.username}</p>
                          {scrapBalance !== null && (
                            <span className="text-[12px] font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{scrapBalance}<img src="/money/scrap.png" alt="scrap" className="inline-block w-3.5 h-3.5" /></span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate">{user.email}</p>
                      </div>
                      <Link to="/profile" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Профиль</Link>
                      <Link to="/messages" className="flex items-center justify-between px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>
                        <span>{'>'} Сообщения</span>
                        {unreadMessages > 0 && (
                          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-mono font-bold">
                            {unreadMessages > 99 ? '99+' : unreadMessages}
                          </span>
                        )}
                      </Link>
                      <Link to="/profile/friends" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Друзья</Link>
                      <Link to="/shop" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Магазин</Link>
                      <Link to="/settings" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Настройки</Link>
                      {user.role === 'admin' && (
                        <>
                          <Link to="/admin" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Админ панель</Link>
                          <Link to="/admin/import" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Импорт</Link>
                        </>
                      )}
                      {user.role === 'moderator' && (
                        <Link to="/admin" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Модератор</Link>
                      )}
                      <div className="border-t border-overlay mt-1 pt-1">
                        <button onClick={() => { logout(); setProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm font-mono text-brand-accent hover:bg-brand-accent-10 transition-colors">[ВЫХОД]</button>
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <button onClick={() => openAuthModal('login')} className="px-4 py-2 text-sm font-mono text-text-secondary hover:text-brand-accent transition-colors">[ВХОД]</button>
                  <button onClick={() => openAuthModal('register')} className="px-5 py-2 text-sm font-mono font-bold bg-brand text-white hover:bg-brand-hover hover:shadow-[0_0_16px_rgba(169,255,0,0.2)] transition-all">РЕГИСТРАЦИЯ</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      {!isMessagesPage && <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-base-95 backdrop-blur-xl border-t border-overlay shadow-[0_-2px_10px_rgba(0,0,0,0.3)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around h-16 px-2">
          <MobileTabItem to="/" label="Главная"><HomeIcon className="w-6 h-6" /></MobileTabItem>
          <MobileTabItem to="/bookmarks" label="Закладки" requireAuth={true}><BookmarkIcon className="w-6 h-6" /></MobileTabItem>

          {/* Центр — Логотип */}
          <NavLink to="/" className="flex flex-col items-center justify-center flex-1">
            <div className="w-12 h-12 flex items-center justify-center">
              <Logo />
            </div>
          </NavLink>

          <MobileTabItem to="/notifications" label="Уведом." requireAuth={true}>
            <div className="relative">
              <BellIcon className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-mono font-bold ring-2 ring-base">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
          </MobileTabItem>

          <button onClick={() => setMobileMenuOpen(!isMobileMenuOpen)} className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
            <span className={`transition-colors ${isMobileMenuOpen ? 'text-brand-accent' : 'text-muted'}`}><MenuDotsIcon className="w-6 h-6" /></span>
            <span className={`text-[10px] leading-none font-mono ${isMobileMenuOpen ? 'text-brand-accent font-medium' : 'text-muted'}`}>Меню</span>
          </button>
        </div>
      </nav>}

      {/* ===== Mobile Menu Sheet ===== */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-[300] md:hidden" onClick={() => setMobileMenuOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-16 left-0 right-0 z-[300] md:hidden bg-surface border-t border-overlay shadow-2xl overflow-hidden max-h-[60vh]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="p-4 space-y-1 overflow-y-auto max-h-[calc(60vh-2rem)]">
                {user ? (
                  <Link
                    to="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 mb-2 spring-rust rounded-none border border-overlay hover:border-brand-accent transition-colors cursor-pointer"
                  >
                    <FramedAvatar avatarUrl={user.avatar_url} username={user.username} size={32} frameKey={user.avatar_frame} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-text-primary font-mono truncate">{user.username}</p>
                        {scrapBalance !== null && (
                          <span className="text-[12px] font-mono font-bold text-yellow-400 inline-flex items-center gap-0.5">{scrapBalance}<img src="/money/scrap.png" alt="scrap" className="inline-block w-3.5 h-3.5" /></span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate">{user.email}</p>
                    </div>
                  </Link>
                ) : (
                  <div className="flex gap-2 px-4 py-3 mb-2">
                    <button onClick={() => { setMobileMenuOpen(false); openAuthModal('login'); }} className="flex-1 text-center py-2.5 text-sm font-mono text-text-secondary border border-overlay hover:border-brand-accent hover:text-brand-accent transition-colors">[ВХОД]</button>
                    <button onClick={() => { setMobileMenuOpen(false); openAuthModal('register'); }} className="flex-1 text-center py-2.5 text-sm font-mono font-bold bg-brand text-white hover:bg-brand-hover transition-colors">РЕГИСТРАЦИЯ</button>
                  </div>
                )}
                <div className="border-t border-overlay my-2"></div>

                <NavLink to="/catalog" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors ${isActive ? 'bg-brand-10 text-brand-accent border-l-2 border-brand-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}>
                  <span>{'>'}</span> Каталог
                </NavLink>
                <NavLink to="/tops" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors ${isActive ? 'bg-brand-10 text-brand-accent border-l-2 border-brand-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}>
                  <span>{'>'}</span> Топы
                </NavLink>
                <NavLink
                  to="/history"
                  onClick={(e) => {
                    if (!user) {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      openAuthModal('login');
                    } else {
                      setMobileMenuOpen(false);
                    }
                  }}
                  className={({ isActive }) => `flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors ${isActive ? 'bg-brand-10 text-brand-accent border-l-2 border-brand-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  <span>{'>'}</span> История
                </NavLink>
                <NavLink
                  to="/quiz"
                  onClick={(e) => {
                    if (!user) {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      openAuthModal('login');
                    } else {
                      setMobileMenuOpen(false);
                    }
                  }}
                  className={({ isActive }) => `flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors ${isActive ? 'bg-brand-10 text-brand-accent border-l-2 border-brand-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  <span>{'>'}</span> 🧩 Викторина
                </NavLink>
                <NavLink
                  to="/cards"
                  onClick={(e) => {
                    if (!user) {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      openAuthModal('login');
                    } else {
                      setMobileMenuOpen(false);
                    }
                  }}
                  className={({ isActive }) => `flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors ${isActive ? 'bg-brand-10 text-brand-accent border-l-2 border-brand-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
                >
                  <span>{'>'}</span> 🃏 Карточки
                </NavLink>

                <div className="border-t border-overlay my-2"></div>

                {user && (
                  <>
                    <Link to="/messages" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">
                      <span className="flex items-center gap-3">{'>'} Сообщения</span>
                      {unreadMessages > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-mono font-bold">
                          {unreadMessages > 99 ? '99+' : unreadMessages}
                        </span>
                      )}
                    </Link>
                    <Link to="/shop" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">{'>'} Магазин</Link>
                    {user.role === 'admin' && (
                      <>
                        <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">{'>'} Админ панель</Link>
                        <Link to="/admin/import" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">{'>'} Импорт</Link>
                      </>
                    )}
                    {user.role === 'moderator' && (
                      <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">{'>'} Модератор</Link>
                    )}
                    <div className="border-t border-overlay my-2"></div>
                  </>
                )}

                {user && (
                  <Link to="/settings" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">{'>'} Настройки</Link>
                )}

                {user && (
                  <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 font-mono text-sm text-brand-accent hover:bg-brand-accent-10 transition-colors w-full">
                    [ВЫХОД]
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
