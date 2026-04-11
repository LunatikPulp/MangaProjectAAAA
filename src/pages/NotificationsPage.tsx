import React, { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NotificationContext } from '../contexts/NotificationContext';
import { NotificationCategory } from '../types';

type TabKey = 'all' | NotificationCategory;

const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'updates', label: 'Обновления' },
    { key: 'social', label: 'Социальное' },
    { key: 'important', label: 'Важное' },
];

const NotificationsPage: React.FC = () => {
    const { notifications, markAsRead, clearNotifications, unreadByCategory } = useContext(NotificationContext);
    const [activeTab, setActiveTab] = useState<TabKey>('all');

    const filtered = activeTab === 'all'
        ? notifications
        : notifications.filter(n => n.category === activeTab);

    const getCountForTab = (tabKey: TabKey) => {
        return unreadByCategory[tabKey] || 0;
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
            },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-bold text-text-primary font-mono">Уведомления</h1>
                {notifications.length > 0 && (
                    <button
                        onClick={clearNotifications}
                        className="px-4 py-2 text-sm font-mono text-muted hover:text-brand-accent transition-colors border border-overlay hover:border-brand-accent"
                    >
                        Очистить все
                    </button>
                )}
            </div>

            <div className="border-b border-overlay mb-6">
                <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
                    {TABS.map(tab => (
                        <TabButton
                            key={tab.key}
                            tabKey={tab.key}
                            label={tab.label}
                            count={getCountForTab(tab.key)}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                        />
                    ))}
                </div>
            </div>

            {filtered.length > 0 ? (
                <motion.div
                    className="space-y-2"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {filtered.map(notif => (
                        <motion.div key={notif.id} variants={itemVariants}>
                            <Link
                                to={notif.link}
                                onClick={() => markAsRead()}
                                className={`block p-4 border border-overlay hover:border-brand-accent transition-all ${
                                    !notif.read ? 'bg-brand-accent/5 border-brand-accent/30' : 'bg-surface hover:bg-surface-hover'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p
                                            className="text-sm text-text-primary font-mono leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: notif.message }}
                                        />
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] text-muted font-mono">
                                                {new Date(notif.timestamp).toLocaleString('ru-RU')}
                                            </span>
                                            {notif.category && (
                                                <span
                                                    className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm ${
                                                        notif.category === 'social'
                                                            ? 'bg-blue-500/10 text-blue-400'
                                                            : notif.category === 'updates'
                                                            ? 'bg-green-500/10 text-green-400'
                                                            : 'bg-orange-500/10 text-orange-400'
                                                    }`}
                                                >
                                                    {notif.category === 'social'
                                                        ? 'СОЦ'
                                                        : notif.category === 'updates'
                                                        ? 'ОБН'
                                                        : 'ВАЖН'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {!notif.read && (
                                        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-brand-accent mt-1" />
                                    )}
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <div className="text-center py-12 md:py-16 border border-overlay bg-surface">
                    <div className="text-3xl md:text-4xl mb-3 md:mb-4">🔔</div>
                    <h2 className="text-lg md:text-2xl font-bold text-text-primary font-mono px-4">
                        Новых уведомлений нет
                    </h2>
                </div>
            )}
        </div>
    );
};

const TabButton: React.FC<{
    tabKey: TabKey;
    label: string;
    count: number;
    activeTab: TabKey;
    setActiveTab: (key: TabKey) => void;
}> = ({ tabKey, label, count, activeTab, setActiveTab }) => {
    const isActive = tabKey === activeTab;
    return (
        <button
            onClick={() => setActiveTab(tabKey)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium font-mono transition-colors border-b-2 ${
                isActive
                    ? 'border-brand-accent text-brand-accent'
                    : 'border-transparent text-muted hover:text-text-primary'
            }`}
        >
            {label}{' '}
            <span
                className={`ml-1.5 px-1.5 py-0.5 text-xs ${
                    isActive
                        ? count > 0
                            ? 'bg-brand-accent text-base'
                            : 'bg-overlay text-muted'
                        : count > 0
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-overlay text-muted'
                }`}
            >
                {count}
            </span>
        </button>
    );
};

export default NotificationsPage;
