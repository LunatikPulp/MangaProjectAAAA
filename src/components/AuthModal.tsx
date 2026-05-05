import React, { useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import { API_BASE } from '../services/externalApiService';
import { lockBodyScroll, unlockBodyScroll } from '../utils/iosScrollLock';

const AuthModal: React.FC = () => {
  const { authModal, closeAuthModal, setAuthModalView, login, register } = useContext(AuthContext);
  const { showToaster } = useContext(ToasterContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [tgLoading, setTgLoading] = useState(false);
  const tgMessageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const isOpen = authModal.isOpen;
  const view = authModal.view;

  const providers = useMemo(
    () => [
      {
        key: 'telegram', label: 'Telegram', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.504-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
        )
      },
      {
        key: 'yandex', label: 'Яндекс', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC3F1D"><path d="M14.47 2.12c-2.78 0-5.2 1.79-5.2 4.87 0 2.08 1.2 3.51 2.9 4.5l.73.44-.84 1.6c-.49-.28-1.5-.87-2.63-1.67C7.5 10.12 5.5 8.25 5.5 5.37 5.5 2.15 8.3 0 12.07 0c4.14 0 6.93 2.65 6.93 6.12 0 3.08-1.87 5.2-4.14 6.7l-.02.02c-.6.4-.96.65-1.12.78L12.4 11.2c.37-.22.78-.5 1.2-.82 1.56-1.18 2.64-2.6 2.64-4.56 0-2.2-1.58-3.7-3.77-3.7zM12.27 24l1.6-3.2H8.67L7.07 24h5.2z" /></svg>
        )
      },
      {
        key: 'vk', label: 'VK', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#0077FF"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.848 2.456 2.27 4.608 2.85 4.608.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.644v3.473c0 .372.17.508.271.508.22 0 .407-.136.814-.542 1.27-1.388 2.18-3.523 2.18-3.523.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.644-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.78 1.203 1.27.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z" /></svg>
        )
      },
      {
        key: 'google', label: 'Google', icon: (
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
        )
      },
    ],
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setTgLoading(false);
    if (tgMessageHandlerRef.current) {
      window.removeEventListener('message', tgMessageHandlerRef.current);
      tgMessageHandlerRef.current = null;
    }
  }, [isOpen, view]);

  const handleClose = () => {
    if (tgMessageHandlerRef.current) {
      window.removeEventListener('message', tgMessageHandlerRef.current);
      tgMessageHandlerRef.current = null;
    }
    setIdentifier('');
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
    setLoading(false);
    setTgLoading(false);
    closeAuthModal();
  };

  const handleSuccess = () => {
    const target = authModal.returnTo;
    handleClose();
    if (target && target !== location.pathname) {
      navigate(target, { replace: true });
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      handleSuccess();
    } catch (err: any) {
      const message = err?.message || 'Не удалось войти. Пожалуйста, проверьте свои данные.';
      setError(message);
      showToaster(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      const message = 'Пароль должен содержать не менее 6 символов.';
      setError(message);
      showToaster(message);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(username, email, password);
      handleSuccess();
    } catch (err: any) {
      const message = err?.message || 'Не удалось создать аккаунт. Пожалуйста, попробуйте еще раз.';
      setError(message);
      showToaster(message);
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramAuth = useCallback(async (tgData: any) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/telegram/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(tgData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Ошибка авторизации Telegram');
      }
      await res.json();
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        const userObj: any = {
          id: meData.id, username: meData.username, email: meData.email,
          avatar: meData.avatar_url || meData.username, avatar_url: meData.avatar_url || '',
          role: meData.role || 'user', status: meData.status || 'active', subscribedMangaIds: [],
        };
        localStorage.setItem('user', JSON.stringify(userObj));
        window.dispatchEvent(new Event('auth-change'));
        const target = authModal.returnTo;
        handleClose();
        if (target && target !== location.pathname) {
          navigate(target, { replace: true });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка Telegram');
      showToaster(err.message || 'Ошибка Telegram');
    } finally {
      setLoading(false);
    }
  }, [authModal.returnTo, location.pathname, navigate, showToaster]);

  const handleProviderAuth = async (provider: string) => {
    if (provider === 'google') {
      window.location.href = `${API_BASE}/auth/google`;
      return;
    }
    if (provider === 'yandex') {
      window.location.href = `${API_BASE}/auth/yandex`;
      return;
    }
    if (provider === 'telegram') {
      setTgLoading(true);
      setError('');
      try {
        const infoRes = await fetch(`${API_BASE}/auth/telegram/info`);
        const info = await infoRes.json();
        if (!info.configured || !info.bot_id) {
          setError('Telegram Login не настроен на сервере');
          showToaster('Telegram Login не настроен');
          setTgLoading(false);
          return;
        }
        const botId = info.bot_id;
        const origin = window.location.origin;
        const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const tgUrl = `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(origin)}&request_id=${requestId}&return_to=${encodeURIComponent(origin)}`;
        const popup = window.open(tgUrl, 'telegram_auth', 'width=500,height=600,left=' + (screen.width / 2 - 250) + ',top=' + (screen.height / 2 - 300));

        if (tgMessageHandlerRef.current) {
          window.removeEventListener('message', tgMessageHandlerRef.current);
        }

        const handler = (e: MessageEvent) => {
          if (e.origin !== 'https://oauth.telegram.org' && e.origin !== origin) return;
          let userData = e.data;
          if (typeof userData === 'string') {
            try { userData = JSON.parse(userData); } catch { return; }
          }
          if (!userData) return;
          if (userData.event === 'auth_result' && userData.result) {
            userData = userData.result;
          }
          if (!userData.id) return;
          window.removeEventListener('message', handler);
          tgMessageHandlerRef.current = null;
          if (popup) popup.close();
          handleTelegramAuth(userData);
        };
        tgMessageHandlerRef.current = handler;
        window.addEventListener('message', handler);

        const checkClosed = setInterval(() => {
          // Try to read tgAuthResult from popup URL hash (Telegram redirect fallback)
          try {
            if (popup && !popup.closed) {
              const popupHash = popup.location?.hash;
              if (popupHash && popupHash.includes('tgAuthResult=')) {
                const encoded = popupHash.split('tgAuthResult=')[1];
                if (encoded) {
                  const decoded = JSON.parse(atob(decodeURIComponent(encoded)));
                  if (decoded && decoded.id) {
                    clearInterval(checkClosed);
                    window.removeEventListener('message', handler);
                    tgMessageHandlerRef.current = null;
                    popup.close();
                    handleTelegramAuth(decoded);
                    return;
                  }
                }
              }
            }
          } catch { /* cross-origin, ignore */ }

          if (popup && popup.closed) {
            clearInterval(checkClosed);
            // Check if main window got a hash result (mobile redirect)
            const mainHash = window.location.hash;
            if (mainHash.includes('tgAuthResult=')) {
              const encoded = mainHash.split('tgAuthResult=')[1];
              window.location.hash = '';
              try {
                const decoded = JSON.parse(atob(decodeURIComponent(encoded)));
                if (decoded && decoded.id) {
                  window.removeEventListener('message', handler);
                  tgMessageHandlerRef.current = null;
                  handleTelegramAuth(decoded);
                  return;
                }
              } catch { /* ignore */ }
            }
            if (tgMessageHandlerRef.current === handler) {
              window.removeEventListener('message', handler);
              tgMessageHandlerRef.current = null;
            }
            setTgLoading(false);
          }
        }, 500);
      } catch (err: any) {
        setError(err.message || 'Ошибка Telegram');
        showToaster(err.message || 'Ошибка Telegram');
      }
      setTgLoading(false);
      return;
    }
    showToaster('Скоро будет доступно!');
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[12000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface border border-overlay shadow-2xl shadow-rust-20"
          >
            <div className="p-6 border-b border-overlay flex items-center justify-between spring-rust">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAuthModalView('login')}
                  className={`text-sm font-mono font-bold px-4 py-1.5 transition-colors ${view === 'login' ? 'bg-brand-accent text-black' : 'bg-surface-hover text-text-secondary hover:text-brand-accent'}`}
                >
                  [ВХОД]
                </button>
                <button
                  type="button"
                  onClick={() => setAuthModalView('register')}
                  className={`text-sm font-mono font-bold px-4 py-1.5 transition-colors ${view === 'register' ? 'bg-brand-accent text-black' : 'bg-surface-hover text-text-secondary hover:text-brand-accent'}`}
                >
                  [РЕГИСТРАЦИЯ]
                </button>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 bg-surface-hover text-text-secondary hover:text-brand-accent hover:bg-overlay flex items-center justify-center transition-colors"
                aria-label="Закрыть"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {providers.map(provider => (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => handleProviderAuth(provider.key)}
                    disabled={tgLoading && provider.key === 'telegram'}
                    title={provider.label}
                    className="w-full py-2.5 bg-surface-hover border border-overlay text-text-primary hover:border-brand-accent hover:text-brand-accent transition-colors disabled:opacity-50 flex items-center justify-center"
                  >
                    {provider.key === 'telegram' && tgLoading ? <span className="animate-spin text-lg">⏳</span> : provider.icon}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="flex-1 h-px bg-text-primary-10"></div>
                <span>или</span>
                <div className="flex-1 h-px bg-text-primary-10"></div>
              </div>

              {view === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="auth-identifier" className="text-xs font-semibold text-muted">Логин или почта</label>
                    <input
                      id="auth-identifier"
                      name="identifier"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full px-3 py-2 mt-1 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-password" className="text-xs font-semibold text-muted">Пароль</label>
                    <input
                      id="auth-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 mt-1 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                    />
                  </div>
                  {error && <p className="text-xs text-brand-accent">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-4 py-2.5 font-mono font-bold text-black bg-brand-accent hover:bg-brand-hover hover:text-white focus:outline-none focus:ring-1 focus:ring-brand-accent disabled:opacity-50 transition-all"
                  >
                    {loading ? 'Входим...' : 'Войти'}
                  </button>
                  <div className="text-center mt-2">
                    <a
                      href="/forgot-password"
                      onClick={e => { e.preventDefault(); handleClose(); navigate('/forgot-password'); }}
                      className="text-xs font-mono text-muted hover:text-brand-accent transition-colors cursor-pointer"
                    >
                      Забыли пароль?
                    </a>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="auth-username" className="text-xs font-semibold text-muted">Логин</label>
                    <input
                      id="auth-username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 mt-1 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-email" className="text-xs font-semibold text-muted">Почта</label>
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 mt-1 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-password-register" className="text-xs font-semibold text-muted">Пароль</label>
                    <input
                      id="auth-password-register"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 mt-1 text-text-primary bg-base border border-overlay focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent-30 font-mono"
                    />
                  </div>
                  {error && <p className="text-xs text-brand-accent">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-4 py-2.5 font-mono font-bold text-black bg-brand-accent hover:bg-brand-hover hover:text-white focus:outline-none focus:ring-1 focus:ring-brand-accent disabled:opacity-50 transition-all"
                  >
                    {loading ? 'Создание...' : 'Создать аккаунт'}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default AuthModal;
