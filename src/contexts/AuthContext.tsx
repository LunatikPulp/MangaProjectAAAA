import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { API_BASE } from '../services/externalApiService';

type AuthModalView = 'login' | 'register';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  register: (username: string, email: string, pass: string) => Promise<void>;
  updateUser: (userData: Partial<User>) => void | Promise<void>;
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
  deleteAccount: () => {},
  subscribeToManga: () => {},
  unsubscribeFromManga: () => {},
  authModal: { isOpen: false, view: 'login' },
  openAuthModal: () => {},
  closeAuthModal: () => {},
  setAuthModalView: () => {},
});

// Вспомогательная функция: получить данные пользователя с бэкенда по токену
async function fetchMe(token: string): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
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
      profile_theme: data.profile_theme || 'base',
      avatar_frame: data.avatar_frame || 'none',
      badge_ids: data.badge_ids || '[]',
      showcase_manga_ids: data.showcase_manga_ids || '[]',
      xp: data.xp || 0,
      level: data.level || 1,
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

  // При загрузке — восстанавливаем сессию из localStorage + проверяем токен
  useEffect(() => {
    const init = async () => {
      try {
        const token = localStorage.getItem('backend_token');
        const storedUser = localStorage.getItem('user');

        if (token) {
          // Проверяем токен через /auth/me
          const backendUser = await fetchMe(token);
          if (backendUser) {
            // Восстанавливаем подписки из localStorage
            if (storedUser) {
              try {
                const parsed = JSON.parse(storedUser);
                backendUser.subscribedMangaIds = parsed.subscribedMangaIds || [];
              } catch {}
            }
            setUser(backendUser);
            localStorage.setItem('user', JSON.stringify(backendUser));
            return;
          }
          // Токен протух — удаляем
          localStorage.removeItem('backend_token');
        }

        // Нет валидного токена — пользователь не залогинен
        if (storedUser) {
          // Старая сессия без токена — чистим
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error("Failed to restore session", error);
        localStorage.removeItem('user');
        localStorage.removeItem('backend_token');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const updateUserState = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;
    const token = localStorage.getItem('backend_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/profile`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(userData),
        });
      } catch {}
    }
    const newUser = { ...user, ...userData };
    updateUserState(newUser);
  };

  const login = async (email: string, pass: string): Promise<void> => {
    // Логинимся через бэкенд
    const form = new URLSearchParams();
    form.append('username', email); // бэкенд ожидает email в поле username (OAuth2 форма)
    form.append('password', pass);

    const res = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Error('Этот аккаунт заблокирован.');
      throw new Error(err.detail || 'Неверная почта или пароль.');
    }

    const data = await res.json();
    localStorage.setItem('backend_token', data.access_token);

    // Получаем профиль пользователя
    const backendUser = await fetchMe(data.access_token);
    if (!backendUser) throw new Error('Не удалось получить данные пользователя.');

    updateUserState(backendUser);
  };

  const register = async (username: string, email: string, pass: string): Promise<void> => {
    // Регистрируемся на бэкенде
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password: pass }),
    });

    if (!regRes.ok) {
      const err = await regRes.json().catch(() => ({}));
      throw new Error(err.detail || 'Ошибка регистрации.');
    }

    // Сразу логинимся
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', pass);

    const tokenRes = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!tokenRes.ok) throw new Error('Регистрация прошла, но не удалось войти. Попробуйте залогиниться.');

    const data = await tokenRes.json();
    localStorage.setItem('backend_token', data.access_token);

    const backendUser = await fetchMe(data.access_token);
    if (!backendUser) throw new Error('Не удалось получить данные пользователя.');

    updateUserState(backendUser);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('backend_token');
    setUser(null);
  };

  const deleteAccount = async () => {
    if (!user) return;
    const token = localStorage.getItem('backend_token');
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/auth/account`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error('Failed to delete account:', res.status);
        }
      } catch (e) {
        console.error('Failed to delete account:', e);
      }
    }
    localStorage.removeItem(`bookmarks_v2_${user.email}`);
    localStorage.removeItem(`history_${user.email}`);
    localStorage.removeItem(`notifications_${user.email}`);
    logout();
  };

  const subscribeToManga = (mangaId: string) => {
    if (!user) return;
    const currentSubs = user.subscribedMangaIds || [];
    if (!currentSubs.includes(mangaId)) {
      const newUser = { ...user, subscribedMangaIds: [...currentSubs, mangaId] };
      updateUserState(newUser);
    }
  };

  const unsubscribeFromManga = (mangaId: string) => {
    if (!user) return;
    const currentSubs = user.subscribedMangaIds || [];
    const newUser = { ...user, subscribedMangaIds: currentSubs.filter(id => id !== mangaId) };
    updateUserState(newUser);
  };

  const openAuthModal = (view: AuthModalView = 'login', returnTo?: string) => {
    setAuthModal({ isOpen: true, view, returnTo });
  };

  const closeAuthModal = () => {
    setAuthModal(prev => ({ ...prev, isOpen: false, returnTo: undefined }));
  };

  const setAuthModalView = (view: AuthModalView) => {
    setAuthModal(prev => ({ ...prev, view }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register, updateUser, deleteAccount, subscribeToManga, unsubscribeFromManga, authModal, openAuthModal, closeAuthModal, setAuthModalView }}>
      {children}
    </AuthContext.Provider>
  );
};
