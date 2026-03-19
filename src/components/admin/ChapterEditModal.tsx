import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Chapter, Page } from '../../types';
import SortablePageItem from './SortablePageItem';
import UploadIcon from '../icons/UploadIcon';

interface ChapterEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: Chapter;
  onSave: (chapterId: string, pages: Page[]) => void;
}

const ChapterEditModal: React.FC<ChapterEditModalProps> = ({
  isOpen,
  onClose,
  chapter,
  onSave,
}) => {
  const [pages, setPages] = useState<Page[]>(chapter.pages || []);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  /** ---- Drag&Drop reorder ---- */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  /** ---- File upload ---- */
  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const newPages: Page[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      file,
    }));
    setPages((prev) => [...prev, ...newPages]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  /** ---- Delete page ---- */
  const handleDeletePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  /** ---- Save ---- */
  const handleSaveChanges = () => {
    onSave(chapter.id, pages);
    onClose();
  };

  /** ---- Reset при смене главы ---- */
  useEffect(() => {
    setPages(chapter.pages || []);
  }, [chapter]);

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
            className="bg-surface rounded-none shadow-2xl w-full max-w-2xl border border-overlay flex flex-col h-[90vh]"
          >
            {/* Заголовок */}
            <div className="p-6 border-b border-overlay">
              <h2 className="text-xl font-bold text-text-primary">
                Редактировать главу {chapter.chapterNumber}
              </h2>
              <p className="text-sm text-muted">{chapter.title}</p>
            </div>

            {/* Контент */}
            <div className="p-6 flex-1 overflow-y-auto">
              {/* Загрузка файлов */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDraggingOver
                    ? 'border-brand bg-brand-10'
                    : 'border-overlay hover:border-muted'
                }`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setIsDraggingOver(true)}
                onDragLeave={() => setIsDraggingOver(false)}
              >
                <UploadIcon className="w-10 h-10 mx-auto text-muted" />
                <p className="mt-2 text-sm text-muted">
                  Перетащите файлы сюда или нажмите, чтобы загрузить
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              {/* Список страниц */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">
                  Страницы ({pages.length})
                </h3>
                {pages.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={pages.map((p) => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {pages.map((page, index) => (
                          <SortablePageItem
                            key={page.id}
                            id={page.id}
                            pageUrl={
                              page.file
                                ? URL.createObjectURL(page.file)
                                : page.url || ''
                            }
                            index={index}
                            onDelete={handleDeletePage}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-center text-muted py-8">
                    Загрузите страницы или используйте импортированные URL.
                  </p>
                )}
              </div>
            </div>

            {/* Футер */}
            <div className="p-4 bg-base-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold bg-overlay text-text-primary rounded-lg hover:bg-opacity-80 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveChanges}
                className="px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
              >
                Сохранить
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChapterEditModal;
