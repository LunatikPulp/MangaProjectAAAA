import React, { useContext } from 'react';
import { MangaContext } from '../contexts/MangaContext';
import MangaCard from '../components/MangaCard';
import { motion } from 'framer-motion';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';

interface GenrePageProps {
  genreName: string;
}

const GridSkeleton: React.FC<{ count: number }> = ({ count }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8">
        {Array.from({ length: count }).map((_, i) => <MangaCardSkeleton key={i} />)}
    </div>
);


const GenrePage: React.FC<GenrePageProps> = ({ genreName }) => {
    const { mangaList, loading } = useContext(MangaContext);
    
    if (loading) {
        return <GridSkeleton count={12} />;
    }

    const filteredManga = mangaList.filter(manga => manga.genres.map(g => g.toLowerCase()).includes(genreName.toLowerCase()));

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
            },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">
                Жанр: <span className="text-brand">{genreName}</span>
            </h1>
            
            {filteredManga.length > 0 ? (
                <motion.div 
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-8"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {filteredManga.map(manga => (
                        <motion.div key={manga.id} variants={itemVariants}>
                            <MangaCard manga={manga} />
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <p className="text-muted">Не найдено манги с этим жанром.</p>
            )}
        </div>
    );
};

export default GenrePage;