import React, { useContext, useEffect, useMemo, useState } from 'react';
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

  const isOpen = authModal.isOpen;
  const view = authModal.view;

  const providers = useMemo(
    () => [
      { key: 'telegram', label: 'Telegram' },
      { key: 'yandex', label: 'Яндекс' },
      { key: 'vk', label: 'VK' },
      { key: 'google', label: 'Google' },
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
  }, [isOpen, view]);

  const handleClose = () => {
    setIdentifier('');
    setUsername('');
    setEmail('');
    setPassword('');
    setError('');
    setLoading(false);
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

  const handleProviderAuth = (provider: string) => {
    if (provider === 'google') {
      window.location.href = `${API_BASE}/auth/google`;
    } else {
      showToaster('Скоро будет доступно!');
    }
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
              <div className="grid grid-cols-2 gap-3">
                {providers.map(provider => (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => handleProviderAuth(provider.key)}
                    className="w-full py-2.5 bg-surface-hover border border-overlay text-sm font-mono font-semibold text-text-primary hover:border-brand-accent hover:text-brand-accent transition-colors"
                  >
                    {provider.label}
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
