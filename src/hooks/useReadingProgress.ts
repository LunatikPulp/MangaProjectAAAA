import { useLocalStorage } from './useLocalStorage';
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export interface ReadingProgress {
  chapterId: string;
  chapterNumber: string;
  currentPage: number;
  totalPages: number;
  isComplete: boolean;
  lastReadAt: string;
}

export const useReadingProgress = (mangaId: string) => {
  const { user } = useContext(AuthContext);
  const userId = user?.email || 'guest';
  
  const [readingProgress, setReadingProgress] = useLocalStorage<Record<string, ReadingProgress>>(
    `reading_progress_${mangaId}_${userId}`,
    {}
  );

  const updateProgress = (
    chapterId: string, 
    chapterNumber: string, 
    currentPage: number, 
    totalPages: number
  ) => {
    const isComplete = currentPage >= totalPages;
    setReadingProgress(prev => ({
      ...prev,
      [chapterId]: {
        chapterId,
        chapterNumber,
        currentPage,
        totalPages,
        isComplete,
        lastReadAt: new Date().toISOString()
      }
    }));
  };

  const markChapterAsRead = (chapterId: string, chapterNumber: string, totalPages: number) => {
    setReadingProgress(prev => ({
      ...prev,
      [chapterId]: {
        chapterId,
        chapterNumber,
        currentPage: totalPages,
        totalPages,
        isComplete: true,
        lastReadAt: new Date().toISOString()
      }
    }));
  };

  const getChapterProgress = (chapterId: string): ReadingProgress | null => {
    return readingProgress[chapterId] || null;
  };

  const getLastReadChapter = (): ReadingProgress | null => {
    const chapters = Object.values(readingProgress);
    if (chapters.length === 0) return null;
    
    return chapters.reduce((latest, current) => {
      return new Date(current.lastReadAt) > new Date(latest.lastReadAt) ? current : latest;
    });
  };

  const isChapterRead = (chapterId: string): boolean => {
    const progress = readingProgress[chapterId];
    return progress ? progress.isComplete : false;
  };

  return {
    readingProgress,
    updateProgress,
    markChapterAsRead,
    getChapterProgress,
    getLastReadChapter,
    isChapterRead
  };
};
