import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Chapter } from '../types';
import Modal from './Modal';

const ChapterListModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    chapters: Chapter[];
    mangaId: string;
    currentChapterId: string;
}> = ({ isOpen, onClose, chapters, mangaId, currentChapterId }) => {

    const [searchTerm, setSearchTerm] = useState('');
    const sortedChapters = [...chapters].sort((a, b) => parseFloat(b.chapterNumber) - parseFloat(a.chapterNumber));
    
    const filteredChapters = sortedChapters.filter(ch => 
        ch.chapterNumber.includes(searchTerm) || ch.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Modal placement="right" offsetRightPx={84} isOpen={isOpen} onClose={onClose} title="Список глав" confirmText="Закрыть" onConfirm={onClose}>
            <div className="flex flex-col h-[60vh]">
                <div className="mb-4">
                    <input 
                        type="text"
                        placeholder="Поиск по номеру или названию"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-base border border-overlay rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {filteredChapters.map(chapter => (
                        <Link
                            key={chapter.id}
                            to={`/manga/${mangaId}/chapter/${encodeURIComponent(chapter.id)}`}
                            onClick={onClose}
                            className={`block p-3 rounded-lg transition-colors ${
                                chapter.id === currentChapterId ? 'bg-brand-20 text-brand' : 'bg-base hover:bg-overlay'
                            }`}
                        >
                            <p className="font-medium text-sm">{(() => {
                                const tomMatch = chapter.title?.match(/Том\s+(\S+)\s+Глава\s+(\S+)/i);
                                return tomMatch ? `${tomMatch[1]} Глава ${tomMatch[2]}` : `Глава ${chapter.chapterNumber}`;
                            })()}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default ChapterListModal;
