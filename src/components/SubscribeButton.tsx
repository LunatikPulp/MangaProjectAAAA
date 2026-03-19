import React, { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import { useNavigate } from 'react-router-dom';

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
);

interface SubscribeButtonProps {
    mangaId: string;
}

const SubscribeButton: React.FC<SubscribeButtonProps> = ({ mangaId }) => {
    const { user, subscribeToManga, unsubscribeFromManga } = useContext(AuthContext);
    const { showToaster } = useContext(ToasterContext);
    const navigate = useNavigate();

    const isSubscribed = user?.subscribedMangaIds?.includes(mangaId) ?? false;

    const handleToggleSubscription = () => {
        if (!user) {
            showToaster('Пожалуйста, войдите, чтобы управлять подписками');
            navigate('/login');
            return;
        }

        if (isSubscribed) {
            unsubscribeFromManga(mangaId);
            showToaster('Вы отписались от обновлений');
        } else {
            subscribeToManga(mangaId);
            showToaster('Вы подписались на обновления!');
        }
    };

    return (
        <button
            onClick={handleToggleSubscription}
            title={isSubscribed ? 'Отписаться от уведомлений' : 'Подписаться на уведомления'}
            className={`font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center ${
                isSubscribed
                    ? 'bg-brand/20 text-brand-accent'
                    : 'bg-surface hover:bg-overlay text-text-primary'
            }`}
        >
            <BellIcon className="w-5 h-5" />
        </button>
    );
};

export default SubscribeButton;