import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Manga, typeDisplayNames } from '../types';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';

interface HeroCarouselProps {
    featuredManga: Manga[];
}

const variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? '100%' : '-100%',
        opacity: 0,
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        zIndex: 0,
        x: direction < 0 ? '100%' : '-100%',
        opacity: 0,
    }),
};

const HeroCarousel: React.FC<HeroCarouselProps> = ({ featuredManga }) => {
    const [[page, direction], setPage] = useState([0, 0]);

    const paginate = (newDirection: number) => {
        setPage([(page + newDirection + featuredManga.length) % featuredManga.length, newDirection]);
    };

    useEffect(() => {
        const interval = setInterval(() => paginate(1), 5000);
        return () => clearInterval(interval);
    }, [page]);

    if (!featuredManga || featuredManga.length === 0) return null;

    const currentManga = featuredManga[page];

    return (
        <div className="relative aspect-[16/9] md:aspect-[16/7] w-full overflow-hidden flex items-center justify-center mb-8 border border-overlay spring-scanlines">
            <AnimatePresence initial={false} custom={direction}>
                <motion.div
                    key={page}
                    className="absolute w-full h-full"
                    custom={direction}
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                        x: { type: 'spring', stiffness: 300, damping: 30 },
                        opacity: { duration: 0.2 },
                    }}
                >
                    <img
                        src={currentManga.cover}
                        alt={currentManga.title}
                        className="absolute inset-0 w-full h-full object-cover blur-md scale-110"
                    />
                    {/* Dark overlays with rust tint */}
                    <div className="absolute inset-0 bg-gradient-to-t from-base via-base/70 to-base/40"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-base/80 via-transparent to-transparent"></div>
                    {/* Rust vignette */}
                    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 80% 90%, rgba(61,43,31,0.3) 0%, transparent 50%)' }}></div>

                    <div className="relative h-full container mx-auto px-3 sm:px-8 md:px-16 flex items-end pb-8 sm:pb-10 md:items-center md:pb-0 z-[2]">
                        <div className="flex gap-3 items-end sm:items-center md:grid md:grid-cols-3 md:gap-12 w-full">
                            {/* Cover */}
                            <motion.div
                                className="relative shrink-0 w-fit"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2, duration: 0.6, type: "spring" }}
                            >
                                <img
                                    src={currentManga.cover}
                                    alt={currentManga.title}
                                    className="w-24 sm:w-36 md:w-56 aspect-[2/3] md:rounded-sm shadow-2xl shadow-rust-40 object-cover border border-overlay"
                                />
                                {/* Toxic glow line at bottom */}
                                <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-brand-accent opacity-60"></div>
                            </motion.div>

                            <div className="md:col-span-2 text-white space-y-1.5 sm:space-y-3 md:space-y-5 min-w-0 flex-1">
                                {/* System label */}
                                <motion.div
                                    className="hidden md:block"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <span className="font-mono text-[10px] text-brand-accent tracking-[0.3em] uppercase">// РЕКОМЕНДАЦИЯ #{String(page + 1).padStart(2, '0')}</span>
                                </motion.div>

                                <motion.h1
                                    className="text-lg sm:text-4xl md:text-5xl font-display font-bold uppercase tracking-wide leading-tight drop-shadow-lg spring-glitch"
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                >
                                    {currentManga.title}
                                </motion.h1>

                                <motion.div
                                    className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-[10px] sm:text-sm font-mono"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    <span className="bg-surface-50 px-2 py-0.5 sm:px-3 sm:py-1 border border-overlay text-text-primary">{currentManga.year}</span>
                                    <span className={`px-2 py-0.5 sm:px-3 sm:py-1 border ${
                                        currentManga.status === 'Завершено'
                                            ? 'bg-brand-20 border-brand-30 text-brand-accent'
                                            : 'bg-[rgba(169,255,0,0.15)] border-[#A9FF00] text-[#A9FF00]'
                                    }`}>
                                        {currentManga.status}
                                    </span>
                                    <span className="hidden sm:inline text-text-secondary">• {typeDisplayNames[currentManga.type]}</span>
                                </motion.div>

                                <motion.p
                                    className="text-text-secondary text-[11px] sm:text-base leading-snug sm:leading-relaxed max-w-2xl line-clamp-2 sm:line-clamp-3 font-light"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    {currentManga.description}
                                </motion.p>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="flex gap-2 sm:gap-4"
                                >
                                    <Link
                                        to={`/manga/${currentManga.id}`}
                                        className="relative inline-flex items-center gap-1.5 sm:gap-2 bg-brand-accent text-black font-mono font-bold text-xs sm:text-sm py-1.5 px-3 sm:py-3 sm:px-8 transition-all hover:shadow-[0_0_20px_rgba(169,255,0,0.4)] hover:-translate-y-0.5 group active:scale-95"
                                    >
                                        <span>ЧИТАТЬ</span>
                                        <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        to={`/manga/${currentManga.id}`}
                                        className="inline-flex items-center gap-1.5 sm:gap-2 bg-surface-30 hover:bg-surface-50 text-text-primary font-mono text-xs sm:text-sm py-1.5 px-3 sm:py-3 sm:px-6 border border-overlay hover:border-brand transition-colors"
                                    >
                                        Подробнее
                                    </Link>
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Navigation arrows — industrial */}
            <button
                onClick={() => paginate(-1)}
                className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-4 z-10 p-1.5 sm:p-2 bg-surface-80 border border-overlay hover:border-brand-accent hover:bg-surface transition-all"
            >
                <ChevronLeftIcon className="w-4 h-4 sm:w-5 sm:h-5 text-text-primary" />
            </button>
            <button
                onClick={() => paginate(1)}
                className="absolute top-1/2 -translate-y-1/2 right-2 sm:right-4 z-10 p-1.5 sm:p-2 bg-surface-80 border border-overlay hover:border-brand-accent hover:bg-surface transition-all"
            >
                <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5 text-text-primary" />
            </button>

            {/* Progress indicators — industrial bars */}
            <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-10 flex space-x-1 sm:space-x-1.5">
                {featuredManga.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => setPage([i, i > page ? 1 : -1])}
                        className={`h-1 sm:h-1.5 rounded-none transition-all duration-300 ${
                            i === page ? 'w-8 bg-brand-accent' : 'w-3 bg-text-primary-30 hover:bg-text-primary-50'
                        }`}
                        aria-label={`Перейти к слайду ${i + 1}`}
                    />
                ))}
            </div>
        </div>
    );
};

export default HeroCarousel;
