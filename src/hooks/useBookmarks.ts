import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { MangaContext } from '../contexts/MangaContext';
import { Bookmark, BookmarkStatus } from '../types';
import { API_BASE } from '../services/externalApiService';

const BOOKMARKS_STORAGE_KEY_PREFIX = 'bookmarks_v3_';
const getBookmarksKey = (userId: string | undefined) => `${BOOKMARKS_STORAGE_KEY_PREFIX}${userId || 'guest'}`;

function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem('backend_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

export const useBookmarks = () => {
    const { user } = useContext(AuthContext);
    const { updateUserStatus } = useContext(MangaContext);
    const bookmarksKey = getBookmarksKey(user?.email);
    const fetchedRef = useRef(false);

    const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
        try {
            const item = window.localStorage.getItem(bookmarksKey);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            console.error(error);
            return [];
        }
    });

    // При смене юзера — сбрасываем флаг и читаем localStorage как fallback
    useEffect(() => {
      fetchedRef.current = false;
      try {
        const item = window.localStorage.getItem(bookmarksKey);
        setBookmarks(item ? JSON.parse(item) : []);
      } catch (error) {
        console.error(error);
        setBookmarks([]);
      }
    }, [user, bookmarksKey]);

    // Загружаем все закладки с сервера при старте (если залогинен)
    useEffect(() => {
      if (!user || fetchedRef.current) return;
      fetchedRef.current = true;

      const token = localStorage.getItem('backend_token');
      if (!token) return;

      fetch(`${API_BASE}/auth/bookmarks`, { headers: getAuthHeaders() })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch bookmarks');
          return res.json();
        })
        .then((serverBookmarks: Bookmark[]) => {
          if (serverBookmarks.length > 0 || true) {
            // Сервер — источник истины
            const normalized = serverBookmarks.map(b => ({
              mangaId: b.mangaId,
              status: b.status as BookmarkStatus,
              addedAt: b.addedAt || new Date().toISOString(),
            }));
            setBookmarks(normalized);
            window.localStorage.setItem(bookmarksKey, JSON.stringify(normalized));
          }
        })
        .catch(err => {
          console.error('Failed to load bookmarks from server:', err);
          // Fallback: localStorage уже загружен выше
        });
    }, [user, bookmarksKey]);

    const persistBookmarks = useCallback((newBookmarks: Bookmark[]) => {
        setBookmarks(newBookmarks);
        window.localStorage.setItem(bookmarksKey, JSON.stringify(newBookmarks));
    }, [bookmarksKey]);

    const updateBookmarkStatus = useCallback((mangaId: string, status: BookmarkStatus) => {
        setBookmarks(prev => {
            const existingBookmarkIndex = prev.findIndex(b => b.mangaId === mangaId);
            const newBookmarks = [...prev];
            if (existingBookmarkIndex > -1) {
                newBookmarks[existingBookmarkIndex] = { ...newBookmarks[existingBookmarkIndex], status };
            } else {
                newBookmarks.push({ mangaId, status, addedAt: new Date().toISOString() });
            }
            window.localStorage.setItem(bookmarksKey, JSON.stringify(newBookmarks));
            return newBookmarks;
        });
        
        // Sync with global MangaContext state for stats
        if (user?.email) {
            updateUserStatus(mangaId, user.email, status);
        }
    }, [bookmarksKey, updateUserStatus, user]);

    const removeBookmark = useCallback((mangaId: string) => {
        const newBookmarks = bookmarks.filter(b => b.mangaId !== mangaId);
        persistBookmarks(newBookmarks);
        
        // Remove status from global MangaContext state for stats
        if (user?.email) {
            updateUserStatus(mangaId, user.email, null);
        }
    }, [bookmarks, persistBookmarks, updateUserStatus, user]);

    const getBookmarkStatus = useCallback((mangaId: string): BookmarkStatus | null => {
        return bookmarks.find(b => b.mangaId === mangaId)?.status || null;
    }, [bookmarks]);

    return { bookmarks, updateBookmarkStatus, removeBookmark, getBookmarkStatus };
};
