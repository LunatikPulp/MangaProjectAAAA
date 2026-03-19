import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { HistoryItem } from '../types';
import { API_BASE } from '../services/externalApiService';

const getHistoryKey = (userId: string | undefined) => `history_v2_${userId || 'guest'}`;

export const useHistory = () => {
    const { user } = useContext(AuthContext);
    const historyKey = getHistoryKey(user?.email);
    const isLoggedIn = !!user;
    const isSyncing = useRef(false);

    const [history, setHistory] = useState<HistoryItem[]>(() => {
        try {
            const item = window.localStorage.getItem(historyKey);
            return item ? JSON.parse(item) : [];
        } catch (error) {
            console.error(error);
            return [];
        }
    });

    const getAuthHeaders = useCallback(() => {
        const token = localStorage.getItem('backend_token');
        return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
    }, []);

    // Fetch history from API when user logs in
    useEffect(() => {
        if (!isLoggedIn || isSyncing.current) {
            // Guest: read from localStorage
            if (!isLoggedIn) {
                try {
                    const item = window.localStorage.getItem(historyKey);
                    setHistory(item ? JSON.parse(item) : []);
                } catch {
                    setHistory([]);
                }
            }
            return;
        }

        const fetchHistory = async () => {
            const headers = getAuthHeaders();
            if (!headers) return;

            try {
                isSyncing.current = true;
                const res = await fetch(`${API_BASE}/history`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    const items: HistoryItem[] = data.map((item: { mangaId: string; chapterId: string; readAt: string }) => ({
                        mangaId: item.mangaId,
                        chapterId: item.chapterId,
                        readAt: item.readAt,
                    }));
                    setHistory(items);
                    // Cache in localStorage too
                    window.localStorage.setItem(historyKey, JSON.stringify(items));
                }
            } catch (error) {
                console.error('Failed to fetch history from API:', error);
                // Fallback to localStorage
                try {
                    const item = window.localStorage.getItem(historyKey);
                    setHistory(item ? JSON.parse(item) : []);
                } catch {
                    setHistory([]);
                }
            } finally {
                isSyncing.current = false;
            }
        };

        fetchHistory();
    }, [isLoggedIn, historyKey, getAuthHeaders]);

    const addHistoryItem = useCallback((mangaId: string, chapterId: string) => {
        setHistory(prevHistory => {
            const newHistoryItem: HistoryItem = {
                mangaId,
                chapterId,
                readAt: new Date().toISOString(),
            };
            // Remove any previous entry for the same manga (deduplicate per manga)
            const filteredHistory = prevHistory.filter(item =>
                item.mangaId !== mangaId
            );
            const newHistory = [newHistoryItem, ...filteredHistory].slice(0, 50);

            window.localStorage.setItem(historyKey, JSON.stringify(newHistory));
            return newHistory;
        });

        // Sync to API if logged in
        if (isLoggedIn) {
            const headers = getAuthHeaders();
            if (headers) {
                fetch(`${API_BASE}/history`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ manga_id: mangaId, chapter_id: chapterId }),
                }).catch(err => console.error('Failed to sync history item:', err));
            }
        }
    }, [historyKey, isLoggedIn, getAuthHeaders]);

    const clearHistory = useCallback(() => {
        setHistory([]);
        window.localStorage.removeItem(historyKey);

        // Sync to API if logged in
        if (isLoggedIn) {
            const headers = getAuthHeaders();
            if (headers) {
                fetch(`${API_BASE}/history`, {
                    method: 'DELETE',
                    headers,
                }).catch(err => console.error('Failed to clear history on API:', err));
            }
        }
    }, [historyKey, isLoggedIn, getAuthHeaders]);

    return { history, addHistoryItem, clearHistory };
};
