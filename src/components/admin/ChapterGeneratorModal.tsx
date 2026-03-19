import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Chapter } from '../../types';
import { AnimatePresence, motion } from 'framer-motion';

interface ChapterGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (chapters: Chapter[]) => void;
}

const ChapterGeneratorModal: React.FC<ChapterGeneratorModalProps> = ({ isOpen, onClose, onGenerate }) => {
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [error, setError] = useState('');

    const handleGenerate = () => {
        setError('');
        const startNum = parseInt(start, 10);
        const endNum = parseInt(end, 10);

        if (isNaN(startNum) || isNaN(endNum) || startNum <= 0 || endNum < startNum) {
            setError('Пожалуйста, введите корректный диапазон.');
            return;
        }

        const newChapters: Chapter[] = [];
        for (let i = startNum; i <= endNum; i++) {
            const chapterNumber = String(i);
            const newChapter: Chapter = {
                id: uuidv4(),
                chapterNumber,
                title: `Глава ${chapterNumber}`,
                views: 0,
                date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                pages: [],
            };
            newChapters.push(newChapter);
        }
        onGenerate(newChapters.reverse()); // Reverse to keep chronological order when prepending
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 50, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface rounded-none shadow-2xl w-full max-w-md border border-overlay"
                    >
                        <div className="p-6 border-b border-overlay">
                            <h2 className="text-xl font-bold text-text-primary">Сгенерировать главы</h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-muted">Создайте несколько пустых глав за один раз. Вы сможете добавить страницы позже.</p>
                            <div className="flex gap-4">
                                <div>
                                    <label className="text-xs text-muted block mb-1">Начальная глава</label>
                                    <input
                                        type="number"
                                        value={start}
                                        onChange={(e) => setStart(e.target.value)}
                                        placeholder="1"
                                        className="w-full bg-base border border-overlay rounded-md p-2"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted block mb-1">Конечная глава</label>
                                    <input
                                        type="number"
                                        value={end}
                                        onChange={(e) => setEnd(e.target.value)}
                                        placeholder="100"
                                        className="w-full bg-base border border-overlay rounded-md p-2"
                                    />
                                </div>
                            </div>
                             {error && <p className="text-sm text-brand-accent">{error}</p>}
                        </div>
                        <div className="p-4 bg-base-50 rounded-b-xl flex justify-end gap-3">
                            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-overlay text-text-primary rounded-lg hover:bg-opacity-80 transition-colors">
                                Отмена
                            </button>
                            <button onClick={handleGenerate} className="px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors">
                                Сгенерировать
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ChapterGeneratorModal;
