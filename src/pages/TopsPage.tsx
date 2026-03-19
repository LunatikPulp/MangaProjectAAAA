import React, { useState, useContext } from 'react';
import { MangaContext } from '../contexts/MangaContext';
import StarIcon from '../components/icons/StarIcon';
import { Link } from 'react-router-dom';
import { typeDisplayNames } from '../types';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';

const GridSkeleton: React.FC<{ count: number }> = ({ count }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
        {Array.from({ length: count }).map((_, i) => <MangaCardSkeleton key={i} />)}
    </div>
);


const TopsPage: React.FC = () => {
    const [activeFilter, setActiveFilter] = useState('new');
    const { mangaList, loading } = useContext(MangaContext);

    if (loading) return <GridSkeleton count={12} />

    const sortedManga = [...mangaList].sort((a, b) => b.rating - a.rating);

    return (
        <div>
            <h1 className="text-3xl font-bold mb-2">Топы</h1>
            
            <div className="flex items-center space-x-2 bg-surface p-1 rounded-lg max-w-xs mb-8">
                <FilterButton name="new" activeFilter={activeFilter} setFilter={setActiveFilter}>Новинки</FilterButton>
                <FilterButton name="month" activeFilter={activeFilter} setFilter={setActiveFilter}>Месяца</FilterButton>
                <FilterButton name="year" activeFilter={activeFilter} setFilter={setActiveFilter}>Года</FilterButton>
            </div>

            <div className="space-y-4">
                {sortedManga.map(manga => (
                    <Link to={`/manga/${manga.id}`} key={manga.id} className="block bg-surface rounded-lg p-4 flex gap-4 items-center group hover:bg-overlay transition-colors">
                        <img src={manga.cover} alt={manga.title} className="w-20 h-28 object-cover rounded-md flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-xs text-text-secondary">{typeDisplayNames[manga.type]} {manga.year}</p>
                            <h3 className="text-lg font-bold text-text-primary group-hover:text-brand transition-colors">{manga.title}</h3>
                            <div className="flex items-center mt-1 text-sm text-muted">
                                <span>{manga.genres.join(', ')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-lg font-bold">
                            <StarIcon className="w-5 h-5 text-brand-accent" />
                            <span>{manga.rating.toFixed(1)}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

const FilterButton: React.FC<{ name: string; activeFilter: string; setFilter: (name: string) => void; children: React.ReactNode }> = ({ name, activeFilter, setFilter, children }) => {
    const isActive = name === activeFilter;
    return (
        <button
            onClick={() => setFilter(name)}
            className={`w-full text-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-brand text-white' : 'text-text-secondary hover:bg-overlay'
            }`}
        >
            {children}
        </button>
    );
}

export default TopsPage;