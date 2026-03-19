import React, { useState, useEffect } from 'react';
import { Chapter } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../Modal';

interface ChapterMetadataModalProps {
    isOpen: boolean;
    onClose: () => void;
    chapter: Chapter | Partial<Chapter>; // Can be partial for a new chapter
    onSave: (chapter: Chapter) => void;
}

const ChapterMetadataModal: React.FC<ChapterMetadataModalProps> = ({ isOpen, onClose, chapter, onSave }) => {
    const [chapterNumber, setChapterNumber] = useState('');
    const [title, setTitle] = useState('');

    const isEditing = !!chapter.id;

    useEffect(() => {
        setChapterNumber(chapter.chapterNumber || '');
        setTitle(chapter.title || '');
    }, [chapter]);

    const handleSave = () => {
        if (!chapterNumber.trim()) return;

        const chapterData: Chapter = {
            id: chapter.id || uuidv4(),
            chapterNumber,
            title: title.trim() || `Глава ${chapterNumber}`,
            views: chapter.views || 0,
            date: chapter.date || new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            pages: chapter.pages || [],
        };

        onSave(chapterData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? `Редактировать Главу ${chapter.chapterNumber}` : 'Добавить новую главу'}
            onConfirm={handleSave}
            confirmText={isEditing ? "Сохранить" : "Добавить"}
        >
            <div className="space-y-4">
                <div>
                    <label className="text-sm text-muted block mb-1.5">Номер главы</label>
                    <input
                        type="text"
                        value={chapterNumber}
                        onChange={(e) => setChapterNumber(e.target.value)}
                        placeholder="Например, 179.5"
                        required
                        className="w-full bg-base border border-overlay rounded-md p-2"
                    />
                </div>
                <div>
                    <label className="text-sm text-muted block mb-1.5">Название главы (необязательно)</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Например, Финальная битва"
                        className="w-full bg-base border border-overlay rounded-md p-2"
                    />
                </div>
            </div>
        </Modal>
    );
};

export default ChapterMetadataModal;
