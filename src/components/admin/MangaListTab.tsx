import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Manga } from '../../types';
import { MangaContext } from '../../contexts/MangaContext';
import Modal from '../Modal';

const MangaListTab: React.FC = () => {
    const { mangaList, deleteManga, loading } = useContext(MangaContext);
    const navigate = useNavigate();
    
    const [isModalOpen, setModalOpen] = useState(false);
    const [selectedManga, setSelectedManga] = useState<Manga | null>(null);

    const openDeleteModal = (manga: Manga) => {
        setSelectedManga(manga);
        setModalOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (selectedManga) {
            deleteManga(selectedManga.id);
            setSelectedManga(null);
            setModalOpen(false);
        }
    };

    if (loading) return <div>Загрузка списка...</div>;

    return (
        <div>
             <div className="bg-surface rounded-lg overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-overlay">
                        <tr>
                            <th className="p-4 text-sm font-semibold text-muted tracking-wider">Обложка</th>
                            <th className="p-4 text-sm font-semibold text-muted tracking-wider">Название</th>
                            <th className="p-4 text-sm font-semibold text-muted tracking-wider">Год</th>
                            <th className="p-4 text-sm font-semibold text-muted tracking-wider">Рейтинг</th>
                            <th className="p-4 text-sm font-semibold text-muted tracking-wider">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-overlay">
                        {mangaList.map(manga => (
                        <tr key={manga.id} className="hover:bg-overlay transition-colors">
                            <td className="p-2">
                            <img src={manga.cover} alt={manga.title} className="w-12 h-16 object-cover rounded-md" />
                            </td>
                            <td className="p-4 font-medium text-text-primary">
                            <Link to={`/manga/${manga.id}`} className="hover:text-brand">{manga.title}</Link>
                            </td>
                            <td className="p-4 text-text-secondary">{manga.year}</td>
                            <td className="p-4 text-text-secondary">{manga.rating.toFixed(1)}</td>
                            <td className="p-4">
                            <div className="flex gap-2">
                                <button onClick={() => navigate(`/manga/${manga.id}/edit`)} className="text-sm bg-base hover:bg-brand-10 text-brand font-semibold py-1 px-3 rounded-md transition-colors">Редактировать</button>
                                <button onClick={() => openDeleteModal(manga)} className="text-sm bg-base hover:bg-brand-accent-10 text-brand-accent font-semibold py-1 px-3 rounded-md transition-colors">Удалить</button>
                            </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
                title="Подтвердить удаление"
                onConfirm={handleDeleteConfirm}
                confirmText="Удалить"
            >
                <p className="text-text-secondary">Вы уверены, что хотите удалить мангу "{selectedManga?.title}"? Это действие нельзя будет отменить.</p>
            </Modal>
        </div>
    );
};

export default MangaListTab;
