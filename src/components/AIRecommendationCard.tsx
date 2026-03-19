import React from 'react';
import { Link } from 'react-router-dom';
import { AIRecommendation } from '../types';

interface AIRecommendationCardProps {
    recommendation: AIRecommendation;
}

const AIRecommendationCard: React.FC<AIRecommendationCardProps> = ({ recommendation }) => {
    const { manga, reason } = recommendation;

    if (!manga) {
        return null;
    }

    return (
        <Link to={`/manga/${manga.id}`} className="block group w-full">
            <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden bg-surface">
                <img 
                    src={manga.cover} 
                    alt={manga.title} 
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                     <p className="text-xs italic text-text-secondary bg-black/30 backdrop-blur-sm p-2 rounded-md mb-2 line-clamp-3">"{reason}"</p>
                    <h3 className="text-md font-bold truncate">
                        {manga.title}
                    </h3>
                </div>

            </div>
        </Link>
    );
};

export default AIRecommendationCard;
