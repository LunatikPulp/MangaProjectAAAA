import React, { useState, useContext, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBookmarks } from '../hooks/useBookmarks';
import { BookmarkStatus } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import { useNavigate } from 'react-router-dom';

const statuses: BookmarkStatus[] = ['Читаю', 'Буду читать', 'Прочитано', 'Отложено', 'Брошено', 'Не интересно'];

interface BookmarkButtonProps {
    // FIX: Changed mangaId from number to string to match the Manga type.
    mangaId: string;
}

const BookmarkIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
)


const BookmarkButton: React.FC<BookmarkButtonProps> = ({ mangaId }) => {
    const { user } = useContext(AuthContext);
    const { showToaster } = useContext(ToasterContext);
    const { updateBookmarkStatus, removeBookmark, getBookmarkStatus } = useBookmarks();
    const navigate = useNavigate();

    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLDivElement>(null);
    const currentStatus = getBookmarkStatus(mangaId);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectStatus = (status: BookmarkStatus) => {
        if (!user) {
            showToaster('Пожалуйста, войдите, чтобы добавить закладку');
            navigate('/login');
            return;
        }
        updateBookmarkStatus(mangaId, status);
        showToaster(`Статус обновлен: ${status}`);
        setIsOpen(false);
    };
    
    const handleRemove = () => {
        removeBookmark(mangaId);
        showToaster('Закладка удалена');
        setIsOpen(false);
    }

    const handleButtonClick = () => {
         if (!user) {
            showToaster('Пожалуйста, войдите, чтобы добавить закладку');
            navigate('/login');
            return;
        }
        setIsOpen(prev => !prev);
    }

    return (
        <div className="relative flex-1" ref={buttonRef}>
            <button
                onClick={handleButtonClick}
                className={`w-full font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    currentStatus
                        ? 'bg-brand-20 text-brand'
                        : 'bg-surface hover:bg-overlay text-text-primary'
                }`}
            >
                <BookmarkIcon className="w-5 h-5" />
                <span className="hidden xl:inline">{currentStatus || 'В закладки'}</span>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-full mb-2 w-full bg-overlay rounded-lg shadow-lg py-1 border border-surface z-20"
                    >
                        {statuses.map(status => (
                            <button
                                key={status}
                                onClick={() => handleSelectStatus(status)}
                                className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface transition-colors"
                            >
                                {status}
                            </button>
                        ))}
                         {currentStatus && (
                            <>
                                <div className="h-px bg-surface my-1"></div>
                                <button
                                    onClick={handleRemove}
                                    className="w-full text-left px-4 py-2 text-sm text-brand-accent hover:bg-surface transition-colors"
                                >
                                    Удалить закладку
                                </button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BookmarkButton;