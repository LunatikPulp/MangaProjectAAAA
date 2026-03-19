import React from 'react';

const MangaCardSkeleton: React.FC = () => {
    return (
        <div className="animate-pulse">
            <div className="relative aspect-[2/3] w-full bg-surface border border-overlay"></div>
            <div className="mt-2 space-y-2">
                <div className="h-4 bg-surface-hover w-1/2"></div>
                <div className="h-5 bg-surface-hover w-full"></div>
            </div>
        </div>
    );
};

export default MangaCardSkeleton;
