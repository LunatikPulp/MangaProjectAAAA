import React from 'react';
import { Chapter } from '../../types';
import ChapterTable from './ChapterTable';

interface ChapterManagerProps {
    chapters: Chapter[];
    onAddChapter: () => void;
    onEditChapterContent: (chapter: Chapter) => void;
    onEditChapterMeta: (chapter: Chapter) => void;
    onDeleteChapter: (chapter: Chapter) => void;
    onOpenGenerator: () => void;
    onOpenBulkUpload: () => void;
}

const ChapterManager: React.FC<ChapterManagerProps> = ({ 
    chapters, 
    onAddChapter, 
    onEditChapterContent,
    onEditChapterMeta,
    onDeleteChapter,
    onOpenGenerator, 
    onOpenBulkUpload 
}) => {
    return (
        <div className="bg-surface p-6 rounded-lg h-full flex flex-col">
            <h2 className="text-xl font-bold mb-4">Управление главами</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                 <button
                    type="button"
                    onClick={onAddChapter}
                    className="w-full bg-overlay hover:bg-opacity-80 text-text-secondary font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                    Добавить главу
                </button>
                 <button
                    type="button"
                    onClick={onOpenGenerator}
                    className="w-full bg-overlay hover:bg-opacity-80 text-text-secondary font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                    Сгенерировать
                </button>
                 <button
                    type="button"
                    onClick={onOpenBulkUpload}
                    className="w-full bg-overlay hover:bg-opacity-80 text-text-secondary font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                    Массовая загрузка
                </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
                <ChapterTable 
                    chapters={chapters}
                    onEditContent={onEditChapterContent}
                    onEditMeta={onEditChapterMeta}
                    onDelete={onDeleteChapter}
                />
            </div>
        </div>
    );
};

export default ChapterManager;
