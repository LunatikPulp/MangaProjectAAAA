import React, { useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import { API_BASE } from '../services/externalApiService';

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
      { key: 'telegram', label: 'Telegram', icon: <i className="fa-brands fa-telegram text-xl" /> },
      { key: 'yandex', label: 'Яндекс', icon: <i className="fa-brands fa-yandex text-xl" style={{color:'#FC3F1D'}} /> },
      { key: 'vk', label: 'VK', icon: <i className="fa-brands fa-vk text-xl" style={{color:'#0077FF'}} /> },
      { key: 'google', label: 'Google', icon: <i className="fa-brands fa-google text-xl" style={{color:'#4285F4'}} /> },
    ],
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
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
        body: JSON.stringify(tgData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Ошибка авторизации Telegram');
      }
      const data = await res.json();
      localStorage.setItem('backend_token', data.access_token);
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
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
