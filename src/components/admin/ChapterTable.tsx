import React, { useState, useMemo } from 'react';
import { Chapter } from '../../types';
import EditIcon from '../icons/EditIcon';
import CogIcon from '../icons/CogIcon';

interface ChapterTableProps {
    chapters: Chapter[];
    onEditContent: (chapter: Chapter) => void;
    onEditMeta: (chapter: Chapter) => void;
    onDelete: (chapter: Chapter) => void;
}

const ITEMS_PER_PAGE = 15;

const ChapterTable: React.FC<ChapterTableProps> = ({ chapters, onEditContent, onEditMeta, onDelete }) => {
    const [currentPage, setCurrentPage] = useState(1);

    const sortedChapters = useMemo(() => 
        [...chapters].sort((a, b) => parseFloat(b.chapterNumber) - parseFloat(a.chapterNumber)),
    [chapters]);
    
    const paginatedChapters = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedChapters.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [currentPage, sortedChapters]);

    const totalPages = Math.ceil(sortedChapters.length / ITEMS_PER_PAGE);

    if (chapters.length === 0) {
        return <p className="text-sm text-muted text-center py-8">Главы не найдены.</p>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-surface">
                        <tr>
                            <th className="p-3 font-semibold text-muted">Номер</th>
                            <th className="p-3 font-semibold text-muted">Название</th>
                            <th className="p-3 font-semibold text-muted">Дата</th>
                            <th className="p-3 font-semibold text-muted text-right">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-overlay">
                        {paginatedChapters.map(chapter => (
                            <tr key={chapter.id} className="hover:bg-overlay-50">
                                <td className="p-3 font-medium">#{chapter.chapterNumber}</td>
                                <td className="p-3 text-text-secondary truncate max-w-xs">{chapter.title}</td>
                                <td className="p-3 text-muted">{chapter.date}</td>
                                <td className="p-3">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => onEditContent(chapter)} title="Редактировать страницы" className="p-2 text-muted hover:text-brand transition-colors"><EditIcon className="w-4 h-4" /></button>
                                        <button onClick={() => onEditMeta(chapter)} title="Редактировать детали" className="p-2 text-muted hover:text-brand transition-colors"><CogIcon className="w-4 h-4" /></button>
                                        <button onClick={() => onDelete(chapter)} title="Удалить главу" className="p-2 text-muted hover:text-brand-accent transition-colors">&times;</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 p-4 border-t border-overlay mt-auto">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-xs rounded bg-overlay disabled:opacity-50">Назад</button>
                    <span className="text-xs text-muted">Стр. {currentPage} из {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-xs rounded bg-overlay disabled:opacity-50">Вперед</button>
                </div>
            )}
        </div>
    );
};

export default ChapterTable;