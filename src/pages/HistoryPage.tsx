import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { MangaContext } from '../contexts/MangaContext';
import { useHistory } from '../hooks/useHistory';
import { HistoryItem } from '../types';

const HistoryPage: React.FC = () => {
    const { history, clearHistory } = useHistory();
    const { getMangaById } = useContext(MangaContext);

    if (history.length === 0) {
        return (
            <div className="text-center py-16">
                <h1 className="text-3xl font-bold">История чтения</h1>
                <p className="text-muted mt-4">Ваша история чтения пуста.</p>
                <p className="text-muted">Начните читать, и ваш прогресс появится здесь.</p>
                <Link to="/catalog" className="mt-6 inline-block bg-brand hover:bg-brand-hover text-white font-bold py-2 px-6 rounded-lg transition-colors">
                    Перейти в каталог
                </Link>
            </div>
        )
    }
    
    // Deduplicate: one entry per manga (latest chapter)
    const dedupedHistory = (() => {
        const seen = new Set<string>();
        return history.filter(item => {
            if (seen.has(item.mangaId)) return false;
            seen.add(item.mangaId);
            return true;
        });
    })();

    // Group history by date
    const groupedHistory = dedupedHistory.reduce((acc, item) => {
        const date = new Date(item.readAt).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        (acc[date] = acc[date] || []).push(item);
        return acc;
    }, {} as Record<string, HistoryItem[]>);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">История чтения</h1>
                <button onClick={clearHistory} className="text-sm text-muted hover:text-brand-accent transition-colors">Удалить всю историю</button>
            </div>

            <div className="space-y-8">
                {Object.entries(groupedHistory).map(([date, items]) => (
                    <div key={date}>
                        <h2 className="text-lg font-semibold text-text-secondary mb-3 pb-2 border-b border-surface">{date}</h2>
                        <div className="space-y-3">
                            {items.map((item, index) => {
                                const manga = getMangaById(item.mangaId);
                                if (!manga) return null;

                                // FIX: Find the chapter to display its number instead of its ID.
                                const chapter = manga.chapters.find(c => c.id === item.chapterId);

                                const time = new Date(item.readAt).toLocaleTimeString('ru-RU', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });

                                return (
                                    <div key={index} className="flex items-center gap-4 p-2 rounded-lg hover:bg-surface transition-colors">
                                        <span className="text-sm text-muted">{time}</span>
                                        <div className="w-1 h-8 bg-surface rounded-none"></div>
                                        <img src={manga.cover} alt={manga.title} className="w-12 h-16 object-cover rounded-md" />
                                        <div className="flex-1">
                                            <Link to={`/manga/${manga.id}`} className="font-semibold text-text-primary hover:text-brand transition-colors">{manga.title}</Link>
                                            <p className="text-sm text-text-secondary mt-1">
                                        Глава {chapter ? chapter.chapterNumber : item.chapterId} из {manga.chapters.length}
                                    </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HistoryPage;