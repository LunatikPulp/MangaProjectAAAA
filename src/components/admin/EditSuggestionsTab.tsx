import React, { useContext, useState } from 'react';
import { useEditSuggestions } from '../../hooks/useEditSuggestions';
import { MangaContext } from '../../contexts/MangaContext';
import { EditSuggestion, Manga, MangaFormData } from '../../types';
import Modal from '../Modal';

const DiffViewer: React.FC<{ original: Manga, suggestion: MangaFormData }> = ({ original, suggestion }) => {
    const fields: (keyof MangaFormData)[] = ['title', 'description', 'year', 'type', 'status', 'cover', 'genres'];
    
    const changes = fields.filter(field => {
        if (field === 'genres') {
            return JSON.stringify(original[field].sort()) !== JSON.stringify(suggestion[field].sort());
        }
        return original[field as keyof Manga] !== suggestion[field];
    });

    if (changes.length === 0) {
        return <p className="text-muted text-sm">Нет изменений.</p>
    }

    return (
        <div className="space-y-3 text-sm">
            {changes.map(field => (
                <div key={String(field)}>
                    <strong className="capitalize text-text-secondary">{String(field)}:</strong>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="bg-brand-accent-10 p-2 rounded">
                            <p className="text-brand-accent line-through text-xs">{String(original[field as keyof Manga])}</p>
                        </div>
                         <div className="bg-brand-10 p-2 rounded">
                            <p className="text-brand-accent text-xs">{String(suggestion[field])}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};


const EditSuggestionsTab: React.FC = () => {
    const { suggestions, approveSuggestion, rejectSuggestion } = useEditSuggestions();
    const { getMangaById, updateManga } = useContext(MangaContext);
    const [selectedSuggestion, setSelectedSuggestion] = useState<EditSuggestion | null>(null);

    const pendingSuggestions = suggestions.filter(s => s.status === 'pending');

    const handleApprove = () => {
        if (!selectedSuggestion) return;
        updateManga(selectedSuggestion.mangaId, selectedSuggestion.data);
        approveSuggestion(selectedSuggestion.id);
        setSelectedSuggestion(null);
    };

    const handleReject = () => {
        if (!selectedSuggestion) return;
        rejectSuggestion(selectedSuggestion.id);
        setSelectedSuggestion(null);
    }
    
    const originalManga = selectedSuggestion ? getMangaById(selectedSuggestion.mangaId) : null;


    if (pendingSuggestions.length === 0) {
        return <div className="text-center p-8 bg-surface rounded-lg">
            <h3 className="text-xl font-bold">Нет предложенных правок</h3>
            <p className="text-muted mt-2">Очередь пуста.</p>
        </div>
    }

    return (
        <div className="bg-surface rounded-lg overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-overlay">
                    <tr>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Название</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Отправитель</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Дата</th>
                        <th className="p-4 text-sm font-semibold text-muted tracking-wider">Действия</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-overlay">
                    {pendingSuggestions.map(suggestion => (
                        <tr key={suggestion.id} className="hover:bg-overlay transition-colors">
                            <td className="p-4 font-medium text-text-primary">{suggestion.mangaTitle}</td>
                            <td className="p-4 text-text-secondary">{suggestion.suggestedBy}</td>
                            <td className="p-4 text-text-secondary">{new Date(suggestion.timestamp).toLocaleString('ru-RU')}</td>
                            <td className="p-4">
                                <button 
                                    onClick={() => setSelectedSuggestion(suggestion)}
                                    className="text-sm bg-base hover:bg-brand-10 text-brand font-semibold py-1 px-3 rounded-md transition-colors"
                                >
                                    Рассмотреть
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {selectedSuggestion && originalManga && (
                <Modal
                    isOpen={!!selectedSuggestion}
                    onClose={() => setSelectedSuggestion(null)}
                    title={`Правка для "${selectedSuggestion.mangaTitle}"`}
                    onConfirm={handleApprove}
                    confirmText="Принять"
                >
                    <DiffViewer original={originalManga} suggestion={selectedSuggestion.data} />
                     <div className="mt-4 pt-4 border-t border-overlay">
                        <button onClick={handleReject} className="text-sm text-brand-accent hover:underline">Отклонить правку</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default EditSuggestionsTab;
