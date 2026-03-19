import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { Chapter, Page } from '../../types';
import UploadIcon from '../icons/UploadIcon';

interface BulkChapterUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (data: { rootName: string; chapters: Chapter[] }) => void;
}

const fileToDataUrl = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const extractNumberFromString = (str: string): string | null => {
    const m = str.match(/(\d+[.,]?\d*)/);
    return m ? m[1].replace(',', '.') : null;
};

const BulkChapterUploadModal: React.FC<BulkChapterUploadModalProps> = ({ isOpen, onClose, onUpload }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');
    const [processedChapters, setProcessedChapters] = useState<Chapter[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [archiveRootName, setArchiveRootName] = useState<string>('archive');

    const handleClose = () => {
        setIsProcessing(false);
        setError('');
        setProcessedChapters([]);
        setArchiveRootName('archive');
        onClose();
    };

    const processZipFile = async (file: File) => {
        setIsProcessing(true);
        setError('');
        setProcessedChapters([]);
        setArchiveRootName('archive');

        try {
            const zip = await JSZip.loadAsync(file);

            const imageEntries: Array<{ relativePath: string; entry: JSZip.JSZipObject }> = [];
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && /\.(jpe?g|png|webp)$/i.test(zipEntry.name)) {
                    imageEntries.push({ relativePath: relativePath.replace(/\\/g, '/'), entry: zipEntry });
                }
            });

            if (imageEntries.length === 0) {
                setError('Архив пуст или внутри нет изображений.');
                setIsProcessing(false);
                return;
            }

            const chaptersMap = new Map<string, { files: { entry: JSZip.JSZipObject; fileName: string }[] }>();
            const parentNameCounts = new Map<string, number>();

            for (const { relativePath, entry } of imageEntries) {
                const pathParts = relativePath.split('/').filter(Boolean);

                let foundNumber: string | null = null;
                for (let i = pathParts.length - 2; i >= 0; i--) {
                    const num = extractNumberFromString(pathParts[i]);
                    if (num !== null) {
                        foundNumber = num;
                        const parent = pathParts[i - 1];
                        if (parent) {
                            parentNameCounts.set(parent, (parentNameCounts.get(parent) || 0) + 1);
                        }
                        break;
                    }
                }
                if (!foundNumber) continue;

                const fileName = pathParts[pathParts.length - 1];
                if (!chaptersMap.has(foundNumber)) {
                    chaptersMap.set(foundNumber, { files: [] });
                }
                chaptersMap.get(foundNumber)!.files.push({ entry, fileName });
            }

            if (chaptersMap.size === 0) {
                setError('Не удалось найти папки с номерами глав внутри архива.');
                setIsProcessing(false);
                return;
            }

            let detectedRoot: string | null = null;
            if (parentNameCounts.size > 0) {
                let best = { name: '', count: 0 };
                parentNameCounts.forEach((count, name) => {
                    if (count > best.count) best = { name, count };
                });
                detectedRoot = best.name;
            } else {
                const firstParts = new Set<string>();
                imageEntries.forEach(({ relativePath }) => {
                    const parts = relativePath.split('/').filter(Boolean);
                    if (parts.length > 1) firstParts.add(parts[0]);
                });
                if (firstParts.size === 1) detectedRoot = Array.from(firstParts)[0];
            }
            if (!detectedRoot) detectedRoot = file.name.replace(/\.zip$/i, '') || 'archive';

            const newChapters: Chapter[] = [];
            for (const [chapterNumber, payload] of chaptersMap.entries()) {
                payload.files.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));

                const content = await Promise.all(payload.files.map(f => f.entry.async('blob').then(fileToDataUrl)));

                if (content.length > 0) {
                    const pages: Page[] = content.map((url, index) => ({
                        id: `${chapterNumber}-${index}`,
                        url,
                    }));
                    newChapters.push({
                        id: uuidv4(),
                        chapterNumber,
                        title: `Глава ${chapterNumber}`,
                        views: 0,
                        date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                        pages,
                    });
                }
            }

            newChapters.sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));

            setArchiveRootName(detectedRoot);
            setProcessedChapters(newChapters);
        } catch (e) {
            console.error(e);
            setError('Не удалось обработать архив.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip'))) {
            processZipFile(file);
        } else {
            setError('Пожалуйста, загрузите .zip файл.');
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip')) {
                processZipFile(file);
            } else {
                setError('Пожалуйста, выберите .zip файл.');
            }
        }
    };

    const handleConfirmUpload = () => {
        onUpload({
            rootName: archiveRootName || 'archive',
            chapters: processedChapters || [],
        });
    };

    const renderContent = () => {
        if (isProcessing) {
            return (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-brand mx-auto"></div>
                    <p className="mt-4 text-muted">Обработка архива...</p>
                </div>
            );
        }
        if (error) {
            return (
                <div className="text-center py-12 text-brand-accent">
                    <p className="font-semibold">Ошибка</p>
                    <p className="text-sm mt-2">{error}</p>
                </div>
            );
        }
        if (processedChapters.length > 0) {
            return (
                <div>
                    <h3 className="font-semibold mb-2">Найдено {processedChapters.length} глав:</h3>
                    <div className="mb-3 text-sm text-muted">
                        Имя корневой папки: <span className="font-medium">{archiveRootName}</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 bg-base p-2 rounded-lg border border-overlay">
                        {processedChapters.map(ch => (
                            <div key={ch.id} className="text-sm p-2 bg-overlay rounded-md">
                                <span className="font-medium text-text-primary">{ch.title}</span>
                                <span className="text-muted"> — {ch.pages.length} страниц</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return (
            <div
                className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${isDraggingOver ? 'border-brand bg-brand-10' : 'border-overlay hover:border-muted'}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setIsDraggingOver(true)}
                onDragLeave={() => setIsDraggingOver(false)}
            >
                <UploadIcon className="w-12 h-12 mx-auto text-muted" />
                <p className="mt-4 text-sm text-muted">Перетащите .zip архив сюда</p>
                <p className="text-xs text-subtle mt-1">или</p>
                <label className="mt-2 inline-block text-brand font-semibold hover:underline cursor-pointer">
                    выберите файл
                    <input
                        type="file"
                        accept=".zip,application/zip,application/x-zip,application/x-zip-compressed"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </label>
                <p className="text-xs text-subtle mt-4">Структура архива: папки с номерами глав (они могут быть вложены), внутри — изображения.</p>
            </div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ y: -50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 50, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-surface rounded-none shadow-2xl w-full max-w-lg border border-overlay"
                    >
                        <div className="p-6 border-b border-overlay">
                            <h2 className="text-xl font-bold text-text-primary">Массовая загрузка глав</h2>
                        </div>
                        <div className="p-6">{renderContent()}</div>
                        <div className="p-4 bg-base-50 rounded-b-xl flex justify-end gap-3">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-semibold bg-overlay text-text-primary rounded-lg hover:bg-opacity-80 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleConfirmUpload}
                                disabled={processedChapters.length === 0}
                                className="px-4 py-2 text-sm font-semibold bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Добавить главы
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default BulkChapterUploadModal;
