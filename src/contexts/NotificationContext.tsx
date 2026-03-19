import React, { createContext, useState, useEffect, ReactNode, useContext, useCallback } from 'react';
import { Notification, NotificationCategory } from '../types';
import { AuthContext } from './AuthContext';
import { API_BASE } from '../services/externalApiService';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
  markAsRead: () => void;
  clearNotifications: () => void;
  unreadCount: number;
  unreadByCategory: Record<NotificationCategory | 'all', number>;
}

export const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  addNotification: () => {},
  markAsRead: () => {},
  clearNotifications: () => {},
  unreadCount: 0,
  unreadByCategory: { all: 0, updates: 0, social: 0, important: 0 },
});

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useContext(AuthContext);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('backend_token');
    if (!token || !user) { setNotifications([]); return; }
    try {
      const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);
  
  const addNotification = (notificationData: Omit<Notification, 'id' | 'read' | 'timestamp'>) => {
    // Client-side fallback - just add locally
    const newNotification: Notification = {
      ...notificationData,
      id: Date.now(),
      read: false,
      timestamp: new Date().toISOString(),
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50));
  };

  const markAsRead = async () => {
    const token = localStorage.getItem('backend_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/notifications/mark-read`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {}
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };
  
  const clearNotifications = async () => {
    const token = localStorage.getItem('backend_token');
    if (token) {
      try {
        await fetch(`${API_BASE}/notifications`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      } catch {}
    }
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const unreadByCategory: Record<NotificationCategory | 'all', number> = {
    all: unreadCount,
    updates: notifications.filter(n => !n.read && n.category === 'updates').length,
    social: notifications.filter(n => !n.read && n.category === 'social').length,
    important: notifications.filter(n => !n.read && n.category === 'important').length,
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, markAsRead, clearNotifications, unreadCount, unreadByCategory }}>
      {children}
    </NotificationContext.Provider>
  );
};
