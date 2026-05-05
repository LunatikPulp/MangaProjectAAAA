import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Chapter, Page } from '../types';
import { fetchChapterPages, proxyImageUrl } from '../services/externalApiService';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';

/** Prefetch next N images so page transitions feel instant */
const prefetchCache = new Set<string>();
const prefetchImages = (urls: string[], start: number, count: number) => {
    for (let i = start; i < Math.min(start + count, urls.length); i++) {
        const url = urls[i];
        if (url && !prefetchCache.has(url)) {
            prefetchCache.add(url);
            const img = new Image();
            img.src = url;
        }
    }
};

interface PagedChapterViewProps {
    chapter: Chapter;
    onNextChapter: () => void;
    onPrevChapter: () => void;
    onPageChange: (page: number, total: number) => void;
    renderFooter?: () => React.ReactNode;
    initialPage?: number;
    mangaId?: string;
}

const getPageSrc = (p: Page, wm: string = ""): string => {
    if (p.file) return URL.createObjectURL(p.file);
    if (p.url) {
        const raw = p.url.startsWith('//') ? 'https:' + p.url : p.url;
        return proxyImageUrl(raw, wm);
    }
    return '';
};

function getViewportHeight(): number {
    return window.visualViewport?.height ?? window.innerHeight;
}

// Represents a visible slice of a potentially long image
interface PageSlice {
    imageIndex: number;
    sliceIndex: number;
    totalSlices: number;
    yOffset: number;
    height: number;
    isLong: boolean;
}

const PagedChapterView: React.FC<PagedChapterViewProps> = ({ chapter, onNextChapter, onPrevChapter, onPageChange, renderFooter, initialPage = 1, mangaId }) => {
    const [currentSliceIndex, setCurrentSliceIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [showEndScreen, setShowEndScreen] = useState(false);
    
    // Stores calculated slices for each image. Key is image index.
    const [imageSlices, setImageSlices] = useState<Record<number, number>>({});
    
    // Lazy-load pages if chapter has none
    const [lazyPages, setLazyPages] = useState<string[]>([]);
    const [lazyLoading, setLazyLoading] = useState(false);

    const staticPages = useMemo(() => {
        if (!chapter.pages || !Array.isArray(chapter.pages)) return [];
        const arr = chapter.pages;
        return arr.map((p, i) => {
            let wm = "";
            if (i === 0 && arr.length > 1) wm = "top";
            else if (i === arr.length - 1 && arr.length > 1) wm = "bottom";
            else if (arr.length === 1) wm = "both";
            return getPageSrc(p, wm);
        }).filter(Boolean);
    }, [chapter]);

    useEffect(() => {
        if (staticPages.length > 0 || lazyPages.length > 0 || lazyLoading) return;
        setLazyLoading(true);
        fetchChapterPages(chapter.id, mangaId)
            .then((data) => setLazyPages(data.pages || []))
            .catch(() => setLazyPages([]))
            .finally(() => setLazyLoading(false));
    }, [chapter.id, staticPages.length, lazyPages.length, lazyLoading, mangaId]);

    const proxiedLazyPages = useMemo(() => {
        if (lazyPages.length === 0) return [];
        return lazyPages.map((url, i) => {
            let wm = "";
            if (i === 0 && lazyPages.length > 1) wm = "top";
            else if (i === lazyPages.length - 1 && lazyPages.length > 1) wm = "bottom";
            else if (lazyPages.length === 1) wm = "both";
            const raw = url.startsWith('//') ? 'https:' + url : url;
            return proxyImageUrl(raw, wm);
        });
    }, [lazyPages]);

    const pages = staticPages.length > 0 ? staticPages : proxiedLazyPages;

    // Calculate total virtual pages (slices) based on loaded image info
    const virtualPages: PageSlice[] = useMemo(() => {
        const result: PageSlice[] = [];
        const viewportHeight = getViewportHeight();

        pages.forEach((_, index) => {
            const slices = imageSlices[index] || 1; // Default to 1 slice until loaded
            for (let i = 0; i < slices; i++) {
                result.push({
                    imageIndex: index,
                    sliceIndex: i,
                    totalSlices: slices,
                    yOffset: i * viewportHeight,
                    height: viewportHeight,
                    isLong: slices > 1
                });
            }
        });
        return result;
    }, [pages, imageSlices]);

    const initialPageAppliedRef = useRef(false);

    // Reset when chapter changes
    useEffect(() => {
        setCurrentSliceIndex(0);
        setShowEndScreen(false);
        setImageSlices({});
        setIsLoading(true);
        initialPageAppliedRef.current = false;
    }, [chapter.id]);

    // Переход к initialPage после загрузки slices
    useEffect(() => {
        if (initialPageAppliedRef.current || initialPage <= 1 || virtualPages.length === 0) return;
        const targetImageIndex = initialPage - 1;
        const sliceIdx = virtualPages.findIndex(s => s.imageIndex === targetImageIndex);
        if (sliceIdx !== -1) {
            setCurrentSliceIndex(sliceIdx);
            initialPageAppliedRef.current = true;
        }
    }, [virtualPages, initialPage]);

    // Notify parent about progress
    useEffect(() => {
        if (showEndScreen) {
             // Just show total count
             onPageChange(pages.length, pages.length);
        } else if (virtualPages.length > 0) {
            const currentSlice = virtualPages[currentSliceIndex];
            if (currentSlice) {
                 // Report REAL page number, not slice number
                onPageChange(currentSlice.imageIndex + 1, pages.length);
            }
        }
    }, [currentSliceIndex, virtualPages, pages.length, onPageChange, showEndScreen]);

    const handleImageLoad = (index: number, e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const naturalHeight = img.naturalHeight;
        const viewportHeight = getViewportHeight();
        
        // If image is significantly taller than viewport (e.g. > 1.2x), slice it
        if (naturalHeight > viewportHeight * 1.2) {
            const slices = Math.ceil(naturalHeight / viewportHeight);
            setImageSlices(prev => {
                // Avoid re-render loop if value hasn't changed
                if (prev[index] === slices) return prev;
                return { ...prev, [index]: slices };
            });
        }
        
        // Only stop loading spinner if it's the current image we are waiting for
        if (index === (virtualPages[currentSliceIndex]?.imageIndex || 0)) {
            setIsLoading(false);
        }
    };

    const goToNextPage = useCallback(() => {
        if (currentSliceIndex < virtualPages.length - 1) {
            setCurrentSliceIndex(p => p + 1);
            setIsLoading(false); // Assume next slice is ready or will load
        } else if (!showEndScreen && renderFooter) {
            setShowEndScreen(true);
        } else {
            onNextChapter();
        }
    }, [currentSliceIndex, virtualPages.length, onNextChapter, showEndScreen, renderFooter]);

    const goToPrevPage = useCallback(() => {
        if (showEndScreen) {
            setShowEndScreen(false);
        } else if (currentSliceIndex > 0) {
            setCurrentSliceIndex(p => p - 1);
            setIsLoading(false);
        } else {
            onPrevChapter();
        }
    }, [currentSliceIndex, onPrevChapter, showEndScreen]);
    
    // Prefetch adjacent pages for instant navigation
    useEffect(() => {
        if (pages.length === 0 || !virtualPages[currentSliceIndex]) return;
        const currentImageIdx = virtualPages[currentSliceIndex].imageIndex;
        prefetchImages(pages, currentImageIdx + 1, 3); // prefetch next 3 images
        if (currentImageIdx > 0) prefetchImages(pages, currentImageIdx - 1, 1); // prefetch prev
    }, [currentSliceIndex, virtualPages, pages]);

    // Keyboard navigation
     useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                goToNextPage();
            } else if (e.key === 'ArrowLeft') {
                goToPrevPage();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToNextPage, goToPrevPage]);

    if (pages.length === 0) {
        return (
            <div className="flex items-center justify-center h-[100dvh] text-muted">
                В этой главе нет страниц.
            </div>
        );
    }
    
    // --- End Screen ---
    if (showEndScreen && renderFooter) {
        return (
            <div className="relative w-full min-h-screen bg-base overflow-auto">
                 <div className="absolute inset-y-0 left-0 w-16 z-20 cursor-pointer hover:bg-black/5 transition-colors" onClick={goToPrevPage} title="Назад" />
                 <div className="relative z-10">{renderFooter()}</div>
                 <button onClick={goToPrevPage} className="fixed left-4 top-1/2 -translate-y-1/2 p-3 bg-surface border border-overlay rounded-full text-text-primary hover:bg-overlay transition-colors z-30 shadow-lg">
                    <ChevronLeftIcon className="w-6 h-6" />
                </button>
            </div>
        );
    }

    const currentSlice = virtualPages[currentSliceIndex];
    // Fallback if slices aren't calculated yet
    const currentImageUrl = pages[currentSlice?.imageIndex || 0];

    return (
        <div className="relative w-full h-[100dvh] bg-black flex items-center justify-center overflow-hidden select-none">
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-4">
                    <div className="w-[60%] max-w-md aspect-[3/4] bg-white/5 rounded animate-pulse" />
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                </div>
            )}
            
            {/* Navigation Zones */}
            <div className="absolute inset-0 flex z-20">
                <div className="w-1/3 h-full cursor-pointer hover:bg-white/5 transition-colors" onClick={goToPrevPage} title="Назад" />
                <div className="w-1/3 h-full cursor-default" />
                <div className="w-1/3 h-full cursor-pointer hover:bg-white/5 transition-colors" onClick={goToNextPage} title="Вперед" />
            </div>

            {/* Image Renderer */}
            {/* We render the current image in a container that crops it based on the current slice offset */}
            {currentSlice && (
                <div 
                    className="relative w-full h-full flex items-start justify-center overflow-hidden"
                    style={{ containerType: 'inline-size' }}
                >
                    <img
                        key={currentImageUrl}
                        src={currentImageUrl}
                        alt={`Страница ${currentSlice.imageIndex + 1}`}
                        onLoad={(e) => handleImageLoad(currentSlice.imageIndex, e)}
                        className="max-w-full absolute transition-transform duration-200"
                        style={{ 
                            top: currentSlice.isLong ? `-${currentSlice.yOffset}px` : '50%',
                            transform: currentSlice.isLong ? 'none' : 'translateY(-50%)',
                            width: 'auto',
                            height: 'auto',
                            maxHeight: currentSlice.isLong ? 'none' : '100dvh',
                            maxWidth: '100%',
                            opacity: isLoading ? 0 : 1 
                        }}
                    />
                    {/* Watermark overlay */}
                    {(() => {
                        return true ? (
                            <div
                                className="absolute pointer-events-none select-none"
                                style={{
                                    top: '50%',
                                    right: '2cqw',
                                    transform: 'translateY(-50%)',
                                    opacity: 0.35,
                                    whiteSpace: 'nowrap',
                                    zIndex: 10,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <div style={{ fontSize: '4cqw', fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1.2, color: 'var(--c-brand)', textTransform: 'uppercase', textShadow: '0 0 8px rgba(0,0,0,0.6)' }}>
                                    SPRINGMANGA
                                </div>
                                <div style={{ fontSize: '2cqw', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-brand)', textShadow: '0 0 5px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                                    быстрее только у нас
                                </div>
                            </div>
                        ) : null;
                    })()}
                </div>
            )}

            {/* Info Overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-1 rounded-full font-mono z-30 pointer-events-none">
                {currentSlice ? `${currentSlice.imageIndex + 1} / ${pages.length}` : '...'}
                {/* Optional: Show slice progress if needed, e.g. " (Part 1/3)" */}
                {currentSlice && currentSlice.totalSlices > 1 && ` [Часть ${currentSlice.sliceIndex + 1}/${currentSlice.totalSlices}]`}
            </div>

            <button onClick={(e) => { e.stopPropagation(); goToPrevPage(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 rounded-full text-white hover:bg-brand-80 transition-colors z-30 hidden md:block">
                <ChevronLeftIcon className="w-8 h-8" />
            </button>
            
            <button onClick={(e) => { e.stopPropagation(); goToNextPage(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/40 rounded-full text-white hover:bg-brand-80 transition-colors z-30 hidden md:block">
                <ChevronRightIcon className="w-8 h-8" />
            </button>
        </div>
    );
};

export default PagedChapterView;
