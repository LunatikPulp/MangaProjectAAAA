import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Manga, MangaFormData, Chapter, Page } from '../../types';
import { ToasterContext } from '../../contexts/ToasterContext';
import { MangaContext } from '../../contexts/MangaContext';
import MangaForm from '../../components/admin/MangaForm';
import ChapterManager from '../../components/admin/ChapterManager';
import ChapterEditModal from '../../components/admin/ChapterEditModal';
import ChapterGeneratorModal from '../../components/admin/ChapterGeneratorModal';
import BulkChapterUploadModal from '../../components/admin/BulkChapterUploadModal';
import ChapterMetadataModal from '../../components/admin/ChapterMetadataModal';
import Modal from '../../components/Modal';

interface ManageMangaPageProps {
    manga: Manga;
}

type ActiveTab = 'chapters' | 'details';

const ManageMangaPage: React.FC<ManageMangaPageProps> = ({ manga }) => {
    const { showToaster } = useContext(ToasterContext);
    const { updateManga, updateChapters, updateChapterContent, getMangaById } = useContext(MangaContext);
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<ActiveTab>('chapters');

    // Modal states
    const [editingContentChapter, setEditingContentChapter] = useState<Chapter | null>(null);
    const [editingMetaChapter, setEditingMetaChapter] = useState<Chapter | null>(null);
    const [chapterToDelete, setChapterToDelete] = useState<Chapter | null>(null);
    const [isGeneratorOpen, setGeneratorOpen] = useState(false);
    const [isBulkUploadOpen, setBulkUploadOpen] = useState(false);
    
    // Data fetching
    const currentMangaData = getMangaById(manga.id) || manga;

    // Handlers
    const handleDetailsSubmit = (formData: MangaFormData) => {
        updateManga(manga.id, formData);
        showToaster('Информация о манге успешно обновлена!');
        setActiveTab('chapters');
    };

    const handleAddOrUpdateChapterMeta = (chapterData: Chapter) => {
        const existing = currentMangaData.chapters.find((c: Chapter) => c.id === chapterData.id);
        let updatedChapters;
        if (existing) {
            // Update existing chapter
            updatedChapters = currentMangaData.chapters.map((c: Chapter) => c.id === chapterData.id ? chapterData : c);
            showToaster(`Глава ${chapterData.chapterNumber} обновлена!`);
        } else {
            // Add new chapter
            updatedChapters = [chapterData, ...currentMangaData.chapters];
            showToaster(`Глава ${chapterData.chapterNumber} добавлена!`);
        }
        updateChapters(manga.id, updatedChapters);
        setEditingMetaChapter(null); // Close modal
    };

    const handleDeleteChapter = () => {
        if (!chapterToDelete) return;
        const updatedChapters = currentMangaData.chapters.filter((c: Chapter) => c.id !== chapterToDelete.id);
        updateChapters(manga.id, updatedChapters);
        showToaster(`Глава ${chapterToDelete.chapterNumber} удалена.`);
        setChapterToDelete(null);
    };

    const handleGenerateChapters = (newChapters: Chapter[]) => {
        const updatedChapters = [...newChapters, ...currentMangaData.chapters];
        updateChapters(manga.id, updatedChapters);
        showToaster(`Сгенерировано ${newChapters.length} глав!`);
        setGeneratorOpen(false);
    };

    const handleBulkUpload = ({ chapters: newChapters }: { rootName: string, chapters: Chapter[] }) => {
        const existingChapterNumbers = new Set(currentMangaData.chapters.map((c: Chapter) => c.chapterNumber));
        const uniqueNewChapters = newChapters.filter((c: Chapter) => !existingChapterNumbers.has(c.chapterNumber));

        if (uniqueNewChapters.length === 0) {
            showToaster('Все главы из архива уже существуют в этом тайтле.');
            setBulkUploadOpen(false);
            return;
        }

        const updatedChapters = [...uniqueNewChapters, ...currentMangaData.chapters];
        updateChapters(manga.id, updatedChapters);
        showToaster(`Массово добавлено ${uniqueNewChapters.length} глав!`);
        setBulkUploadOpen(false);
    };

    const handleUpdateChapterContent = (chapterId: string, newContent: Page[]) => {
        updateChapterContent(manga.id, chapterId, newContent);
        showToaster(`Содержимое главы ${editingContentChapter?.chapterNumber} обновлено!`);
        setEditingContentChapter(null);
    };

    const TabButton: React.FC<{ name: ActiveTab; children: React.ReactNode }> = ({ name, children }) => (
        <button
            onClick={() => setActiveTab(name)}
            className={`py-3 px-4 text-md font-medium transition-colors border-b-2 ${
                activeTab === name
                    ? 'border-brand text-text-primary'
                    : 'border-transparent text-muted hover:text-text-primary'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div>
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Управление: {currentMangaData.title}</h1>
                    <button onClick={() => navigate(`/manga/${currentMangaData.id}`)} className="text-sm text-brand hover:underline mt-1">Вернуться к просмотру</button>
                </div>
            </div>

            <div className="border-b border-surface flex items-center space-x-2">
                <TabButton name="chapters">Главы</TabButton>
                <TabButton name="details">Детали</TabButton>
            </div>

            <div className="mt-6">
                {activeTab === 'chapters' && (
                    <ChapterManager 
                        chapters={currentMangaData.chapters}
                        onAddChapter={() => setEditingMetaChapter({} as Chapter)} // Open modal with empty chapter
                        onEditChapterContent={setEditingContentChapter}
                        onEditChapterMeta={setEditingMetaChapter}
                        onDeleteChapter={setChapterToDelete}
                        onOpenGenerator={() => setGeneratorOpen(true)}
                        onOpenBulkUpload={() => setBulkUploadOpen(true)}
                    />
                )}
                {activeTab === 'details' && (
                    <MangaForm 
                        onSubmit={handleDetailsSubmit} 
                        initialData={currentMangaData}
                        onCancel={() => setActiveTab('chapters')}
                    />
                )}
            </div>

            {/* Modals */}
            {editingContentChapter && (
                <ChapterEditModal
                    isOpen={!!editingContentChapter}
                    onClose={() => setEditingContentChapter(null)}
                    chapter={editingContentChapter}
                    onSave={handleUpdateChapterContent}
                />
            )}
            {editingMetaChapter && (
                 <ChapterMetadataModal
                    isOpen={!!editingMetaChapter}
                    onClose={() => setEditingMetaChapter(null)}
                    chapter={editingMetaChapter}
                    onSave={handleAddOrUpdateChapterMeta}
                />
            )}
            <ChapterGeneratorModal 
                isOpen={isGeneratorOpen}
                onClose={() => setGeneratorOpen(false)}
                onGenerate={handleGenerateChapters}
            />
            <BulkChapterUploadModal
                isOpen={isBulkUploadOpen}
                onClose={() => setBulkUploadOpen(false)}
                onUpload={handleBulkUpload}
            />
            {chapterToDelete && (
                 <Modal
                    isOpen={!!chapterToDelete}
                    onClose={() => setChapterToDelete(null)}
                    title="Удалить главу"
                    onConfirm={handleDeleteChapter}
                    confirmText="Удалить"
                >
                    <p className="text-text-secondary">Вы уверены, что хотите удалить Главу {chapterToDelete.chapterNumber}? Это действие нельзя будет отменить.</p>
                </Modal>
            )}
        </div>
    );
};

export default ManageMangaPage;
