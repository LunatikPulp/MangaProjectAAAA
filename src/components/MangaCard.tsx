import React from 'react';
import { Link } from 'react-router-dom';
import { Manga, typeDisplayNames } from '../types';
import PlayIcon from './icons/PlayIcon';

interface MangaCardProps {
    manga: Manga;
}

const MangaCard: React.FC<MangaCardProps> = ({ manga }) => {
    return (
        <Link to={`/manga/${manga.id}`} className="block group relative">
            <div className="relative aspect-[2/3] w-full overflow-hidden bg-surface border border-overlay transition-all duration-300 group-hover:border-brand-accent group-hover:shadow-[0_0_16px_rgba(169,255,0,0.15)] group-hover:-translate-y-1">
                <img
                    src={manga.cover}
                    alt={manga.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                />

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>

                {/* Scanline effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                     style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)' }}></div>

                {/* Hover Play Button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-50 group-hover:scale-100">
                    <div className="w-12 h-12 bg-brand-accent flex items-center justify-center shadow-[0_0_20px_rgba(169,255,0,0.3)] text-black">
                        <PlayIcon className="w-6 h-6 ml-1" />
                    </div>
                </div>

                {/* Status Badge — industrial */}
                <div className="absolute top-2 left-2">
                    <span className={`text-[10px] font-mono font-bold px-2 py-1 border ${
                        manga.status === 'Завершено'
                            ? 'bg-brand-80 border-brand text-white'
                            : 'bg-[rgba(169,255,0,0.15)] border-[#A9FF00] text-[#A9FF00]'
                    }`}>
                        {manga.status}
                    </span>
                </div>

                {/* Toxic accent line at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent opacity-0 group-hover:opacity-80 transition-opacity duration-300"></div>
            </div>

            <div className="mt-3 space-y-1">
                <h3 className="text-sm font-bold text-text-primary truncate group-hover:text-brand-accent transition-colors leading-tight">
                    {manga.title}
                </h3>
                <div className="flex items-center justify-between text-xs font-mono text-muted">
                    <span>{typeDisplayNames[manga.type]}</span>
                    <span>{manga.year}</span>
                </div>
            </div>
        </Link>
    );
};

export default MangaCard;
