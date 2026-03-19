import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Manga, MangaFormData } from '../types';
import { ToasterContext } from '../contexts/ToasterContext';
import MangaForm from '../components/admin/MangaForm';
import { useEditSuggestions } from '../hooks/useEditSuggestions';

interface SuggestEditPageProps {
    manga: Manga;
}

const SuggestEditPage: React.FC<SuggestEditPageProps> = ({ manga }) => {
    const { showToaster } = useContext(ToasterContext);
    const { addSuggestion } = useEditSuggestions();
    const navigate = useNavigate();

    const handleSubmit = (formData: MangaFormData) => {
        addSuggestion(manga.id, manga.title, formData);
        showToaster('Ваше предложение отправлено на модерацию!');
        navigate(`/manga/${manga.id}`);
    };

    return (
        <div>
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">Предложить правку: {manga.title}</h1>
                    <p className="text-muted mt-1">Ваши изменения будут рассмотрены модератором перед публикацией.</p>
                </div>
            </div>
            
            <MangaForm 
                onSubmit={handleSubmit} 
                initialData={manga} 
                submitText="Отправить на проверку"
                onCancel={() => navigate(`/manga/${manga.id}`)}
            />
        </div>
    );
};

export default SuggestEditPage;
