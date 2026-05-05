import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '../types';
import { API_BASE } from '../services/externalApiService';

type AuthModalView = 'login' | 'register' | 'forgot';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  register: (username: string, email: string, pass: string) => Promise<void>;
  updateUser: (userData: Partial<User>) => void | Promise<void>;
  refreshUser: () => Promise<void>;
  deleteAccount: () => void;
  subscribeToManga: (mangaId: string) => void;
  unsubscribeFromManga: (mangaId: string) => void;
  authModal: { isOpen: boolean; view: AuthModalView; returnTo?: string };
  openAuthModal: (view?: AuthModalView, returnTo?: string) => void;
  closeAuthModal: () => void;
  setAuthModalView: (view: AuthModalView) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  register: async () => {},
  updateUser: () => {},
  refreshUser: async () => {},
  deleteAccount: () => {},
  subscribeToManga: () => {},
  unsubscribeFromManga: () => {},
  authModal: { isOpen: false, view: 'login' },
  openAuthModal: () => {},
  closeAuthModal: () => {},
  setAuthModalView: () => {},
});

// Fetch current user via httpOnly cookie
async function fetchMe(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      avatar: data.avatar_url || data.username,
      avatar_url: data.avatar_url || '',
      role: data.role || 'user',
      status: data.status || 'active',
      about: data.about || '',
      birthday: data.birthday || '',
      gender: data.gender || '',
      erotic_filter: data.erotic_filter || 'hide',
      private_profile: !!data.private_profile,
      allow_trades: data.allow_trades !== false,
      notify_email: data.notify_email !== false,
      notify_vk: !!data.notify_vk,
      notify_telegram: !!data.notify_telegram,
      subscribedMangaIds: [],
      bio: data.bio || '',
      profile_banner_url: data.profile_banner_url || '',
      profile_background_url: data.profile_background_url || '',
      profile_theme: data.profile_theme || 'base',
      avatar_frame: data.avatar_frame || 'none',
      badge_ids: data.badge_ids || '[]',
      showcase_manga_ids: data.showcase_manga_ids || '[]',
      xp: data.xp || 0,
      level: data.level || 1,
      telegram_id: data.telegram_id || '',
      telegram_username: data.telegram_username || '',
      google_id: data.google_id || '',
      yandex_id: data.yandex_id || '',
      chapters_read: data.chapters_read || 0,
    };
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; view: AuthModalView; returnTo?: string }>({
    isOpen: false,
    view: 'login',
    returnTo: undefined,
  });

  useEffect(() => {
    const init = async () => {
      try {
        if (localStorage.getItem('backend_token')) {
          localStorage.removeItem('backend_token');
        }

        const backendUser = await fetchMe();
        if (backendUser) {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              const parsed = JSON.parse(storedUser);
              backendUser.subscribedMangaIds = parsed.subscribedMangaIds || [];
            } catch {}
          }
          setUser(backendUser);
          localStorage.setItem('user', JSON.stringify(backendUser));
        } else {
          setUser(null);
          localStorage.removeItem('user');
          localStorage.removeItem('profileData');
        }
      } catch (error) {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('profileData');
      } finally {
        setLoading(false);
      }
    };
    init();

    const handleAuthChange = () => {
      fetchMe().then(u => {
        if (u) {
          setUser(prev => {
            if (prev) u.subscribedMangaIds = prev.subscribedMangaIds || [];
            return u;
          });
          localStorage.setItem('user', JSON.stringify(u));
        }
      });
    };
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, []);

  const updateUserState = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;
    try {
      await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(userData),
      });
    } catch {}
    const newUser = { ...user, ...userData };
    updateUserState(newUser);
  };

  const refreshUser = async () => {
    const backendUser = await fetchMe();
    if (backendUser) {
      if (user) {
        backendUser.subscribedMangaIds = user.subscribedMangaIds || [];
      }
      updateUserState(backendUser);
    }
  };

  const login = async (email: string, pass: string): Promise<void> => {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', pass);

    const res = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body: form.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error('Этот аккаунт заблокирован.');
      throw new Error(err.detail || 'Неверная почта или пароль.');
    }

    // Cookie is set by the server — just fetch the user profile
    const backendUser = await fetchMe();
    if (!backendUser) throw new Error('Не удалось получить данные пользователя.');

    updateUserState(backendUser);
  };

  const register = async (username: string, email: string, pass: string): Promise<void> => {
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password: pass }),
    });

    if (!regRes.ok) {
      const err = await regRes.json().catch(() => ({}));
      throw new Error(err.detail || 'Ошибка регистрации.');
    }

    // Login after registration
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', pass);

    const tokenRes = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body: form.toString(),
    });

    if (!tokenRes.ok) throw new Error('Регистрация прошла, но не удалось войти. Попробуйте залогиниться.');

    const backendUser = await fetchMe();
    if (!backendUser) throw new Error('Не удалось получить данные пользователя.');

    updateUserState(backendUser);
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('profileData');
    setUser(null);
  };

  const deleteAccount = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/auth/account`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        console.error('Failed to delete account:', res.status);
      }
    } catch (e) {
      console.error('Failed to delete account:', e);
    }
    localStorage.removeItem(`bookmarks_v2_${user.email}`);
    localStorage.removeItem(`history_${user.email}`);
    localStorage.removeItem(`notifications_${user.email}`);
    logout();
  };

  const subscribeToManga = useCallback((mangaId: string) => {
    if (!user) return;
    const currentSubs = user.subscribedMangaIds || [];
    if (!currentSubs.includes(mangaId)) {
      const newUser = { ...user, subscribedMangaIds: [...currentSubs, mangaId] };
      updateUserState(newUser);
    }
  }, [user]);

  const unsubscribeFromManga = useCallback((mangaId: string) => {
    if (!user) return;
    const currentSubs = user.subscribedMangaIds || [];
    const newUser = { ...user, subscribedMangaIds: currentSubs.filter(id => id !== mangaId) };
    updateUserState(newUser);
  }, [user]);

  const openAuthModal = useCallback((view: AuthModalView = 'login', returnTo?: string) => {
    setAuthModal({ isOpen: true, view, returnTo });
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModal(prev => ({ ...prev, isOpen: false, returnTo: undefined }));
  }, []);

  const setAuthModalView = useCallback((view: AuthModalView) => {
    setAuthModal(prev => ({ ...prev, view }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateUser, refreshUser, deleteAccount, subscribeToManga, unsubscribeFromManga, authModal, openAuthModal, closeAuthModal, setAuthModalView }}>
      {children}
    </AuthContext.Provider>
  );
};
