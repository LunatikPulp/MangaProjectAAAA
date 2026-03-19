import React, { useState, useContext, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationContext } from '../contexts/NotificationContext';
import { NotificationCategory } from '../types';

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
);

type TabKey = 'all' | NotificationCategory;

const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'updates', label: 'Обновления' },
    { key: 'social', label: 'Социальное' },
    { key: 'important', label: 'Важное' },
];

const NotificationBell: React.FC = () => {
    const { notifications, markAsRead, clearNotifications, unreadCount, unreadByCategory } = useContext(NotificationContext);
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const notificationRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        setIsOpen(!isOpen);
        if(!isOpen) {
            markAsRead();
        }
    };

    const filtered = activeTab === 'all'
        ? notifications
        : notifications.filter(n => n.category === activeTab);

    return (
        <div className="relative" ref={notificationRef}>
            <button onClick={handleToggle} className="relative p-2 rounded-full text-muted hover:bg-surface hover:text-brand transition-colors" aria-label="Уведомления">
                <BellIcon className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold ring-2 ring-base">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-96 bg-surface border border-overlay shadow-2xl shadow-rust-20 overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="p-3 flex justify-between items-center border-b border-overlay">
                            <h4 className="font-mono font-bold text-sm text-text-primary">Уведомления</h4>
                            {notifications.length > 0 && (
                                <button onClick={clearNotifications} className="text-[10px] font-mono text-muted hover:text-brand-accent transition-colors">Очистить все</button>
                            )}
                        </div>

                        {/* Category tabs */}
                        <div className="flex border-b border-overlay">
                            {TABS.map(tab => {
                                const count = unreadByCategory[tab.key];
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`flex-1 py-2 px-1 text-[10px] font-mono transition-all relative ${
                                            activeTab === tab.key
                                                ? 'text-brand-accent bg-brand-accent/5'
                                                : 'text-muted hover:text-text-secondary'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={`ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${
                                            count > 0 ? 'bg-red-500/20 text-red-400' : 'bg-overlay text-muted'
                                        }`}>
                                            {count}
                                        </span>
                                        {activeTab === tab.key && (
                                            <motion.div layoutId="notif-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Notifications list */}
                        <div className="max-h-80 overflow-y-auto scrollbar-hide">
                            {filtered.length > 0 ? (
                                filtered.map(notif => (
                                    <Link key={notif.id} to={notif.link} onClick={() => setIsOpen(false)}
                                        className={`block p-3 hover:bg-surface-hover transition-colors border-b border-overlay/30 ${!notif.read ? 'bg-brand-accent/5' : ''}`}>
                                        <p className="text-sm text-text-primary font-mono leading-relaxed" dangerouslySetInnerHTML={{ __html: notif.message }} />
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-muted font-mono">{new Date(notif.timestamp).toLocaleString('ru-RU')}</span>
                                            {notif.category && (
                                                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm ${
                                                    notif.category === 'social' ? 'bg-blue-500/10 text-blue-400' :
                                                    notif.category === 'updates' ? 'bg-green-500/10 text-green-400' :
                                                    'bg-orange-500/10 text-orange-400'
                                                }`}>
                                                    {notif.category === 'social' ? 'СОЦ' : notif.category === 'updates' ? 'ОБН' : 'ВАЖН'}
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                ))
                            ) : (
                                <p className="p-6 text-center text-xs text-muted font-mono">
                                    {activeTab === 'all' ? 'Новых уведомлений нет' : 'Нет уведомлений в этой категории'}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationBell;
