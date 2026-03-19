import React, { useRef, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import ArrowUpRightIcon from './icons/ArrowUpRightIcon';

interface CarouselProps {
    title: string;
    children: ReactNode;
    viewAllLink?: string;
}

const Carousel: React.FC<CarouselProps> = ({ title, children, viewAllLink }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { current } = scrollRef;
            const scrollAmount = current.offsetWidth * 0.8;
            current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    return (
        <div className="mb-16 relative">
            <div className="flex justify-between items-center mb-6 px-1">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-brand-accent"></div>
                    <h2 className="text-2xl md:text-3xl font-display font-bold text-text-primary tracking-wide uppercase spring-glitch">{title}</h2>
                    <span className="hidden md:inline text-[10px] font-mono text-muted tracking-widest">//SECTION</span>
                </div>
                {viewAllLink && (
                    <Link to={viewAllLink} className="group flex items-center gap-2 text-sm font-mono text-muted hover:text-brand-accent transition-colors">
                        <span>Смотреть все</span>
                        <div className="bg-surface border border-overlay p-1.5 group-hover:bg-brand-accent group-hover:text-black group-hover:border-brand-accent transition-all">
                            <ArrowUpRightIcon className="w-4 h-4" />
                        </div>
                    </Link>
                )}
            </div>

            <div className="relative group/carousel">
                <button
                    onClick={() => scroll('left')}
                    className="absolute top-1/2 -left-5 -translate-y-1/2 z-20 p-3 bg-surface border border-overlay shadow-xl text-text-primary md:opacity-0 md:group-hover/carousel:opacity-100 hover:bg-brand-accent hover:text-black hover:border-brand-accent hover:scale-110 transition-all duration-300 disabled:opacity-0"
                    aria-label="Scroll left"
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </button>

                <div
                    ref={scrollRef}
                    className="flex space-x-5 overflow-x-auto pb-8 pt-2 px-1 scrollbar-hide snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {children}
                </div>

                <button
                    onClick={() => scroll('right')}
                    className="absolute top-1/2 -right-5 -translate-y-1/2 z-20 p-3 bg-surface border border-overlay shadow-xl text-text-primary md:opacity-0 md:group-hover/carousel:opacity-100 hover:bg-brand-accent hover:text-black hover:border-brand-accent hover:scale-110 transition-all duration-300"
                    aria-label="Scroll right"
                >
                    <ChevronRightIcon className="w-5 h-5" />
                </button>

                {/* Fade effect on edges */}
                <div className="absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-base to-transparent pointer-events-none z-10"></div>
                <div className="absolute top-0 left-0 h-full w-4 bg-gradient-to-r from-base to-transparent pointer-events-none z-10"></div>
            </div>
        </div>
    );
};

export default Carousel;
