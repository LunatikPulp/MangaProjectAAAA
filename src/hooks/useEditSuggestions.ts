import { useCallback, useContext } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { EditSuggestion, MangaFormData } from '../types';
import { AuthContext } from '../contexts/AuthContext';

const SUGGESTIONS_KEY = 'app_edit_suggestions_v2';

export const useEditSuggestions = () => {
    const [suggestions, setSuggestions] = useLocalStorage<EditSuggestion[]>(SUGGESTIONS_KEY, []);
    const { user } = useContext(AuthContext);

    const addSuggestion = useCallback((mangaId: string, mangaTitle: string, data: MangaFormData) => {
        if (!user) return;
        const newSuggestion: EditSuggestion = {
            id: Date.now(),
            mangaId,
            mangaTitle,
            suggestedBy: user.email,
            timestamp: new Date().toISOString(),
            data,
            status: 'pending',
        };
        setSuggestions(prev => [newSuggestion, ...prev]);
    }, [setSuggestions, user]);

    const approveSuggestion = useCallback((suggestionId: number) => {
        setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'approved' } : s));
    }, [setSuggestions]);
    
    const rejectSuggestion = useCallback((suggestionId: number) => {
        setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: 'rejected' } : s));
    }, [setSuggestions]);

    return { suggestions, addSuggestion, approveSuggestion, rejectSuggestion };
};
