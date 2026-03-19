import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToasterContext } from '../../contexts/ToasterContext';
import { MangaContext } from '../../contexts/MangaContext';
import MangaForm from '../../components/admin/MangaForm';
import { Manga, MangaFormData } from '../../types';
import { v4 as uuidv4 } from 'uuid';

const CreateMangaPage: React.FC = () => {
    const { showToaster } = useContext(ToasterContext);
    const { addManga } = useContext(MangaContext);
    const navigate = useNavigate();

    const handleSubmit = (formData: MangaFormData) => {
        // FIX: Construct a full Manga object with default values for missing fields.
        const newManga: Manga = {
            ...formData,
            id: uuidv4(),
            rating: 0,
            userRatings: {},
            views: '0',
            chapters: [],
        };
        addManga(newManga);
        showToaster('Манга успешно создана!');
        navigate(`/admin/manga/${newManga.id}/manage`);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Добавить новую мангу</h1>
            <MangaForm 
                onSubmit={handleSubmit} 
                onCancel={() => navigate('/admin')}
            />
        </div>
    );
};

export default CreateMangaPage;
