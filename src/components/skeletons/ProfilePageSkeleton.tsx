import React from 'react';

const ProfilePageSkeleton: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto animate-pulse">
            <div className="bg-surface p-8 rounded-lg flex items-center gap-6 mb-8">
                <div className="w-24 h-24 bg-overlay rounded-full"></div>
                <div>
                    <div className="h-8 w-48 bg-overlay rounded-md"></div>
                    <div className="h-5 w-64 bg-overlay rounded-md mt-2"></div>
                    <div className="h-8 w-32 bg-overlay rounded-md mt-3"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section>
                    <div className="h-8 w-1/2 bg-surface rounded-md mb-4"></div>
                    <div className="space-y-3">
                        <div className="h-20 w-full bg-surface rounded-lg"></div>
                        <div className="h-20 w-full bg-surface rounded-lg"></div>
                        <div className="h-20 w-full bg-surface rounded-lg"></div>
                    </div>
                </section>
                
                <section>
                    <div className="h-8 w-1/2 bg-surface rounded-md mb-4"></div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="aspect-[2/3] bg-surface rounded-md"></div>
                        <div className="aspect-[2/3] bg-surface rounded-md"></div>
                        <div className="aspect-[2/3] bg-surface rounded-md"></div>
                        <div className="aspect-[2/3] bg-surface rounded-md"></div>
                     </div>
                </section>
            </div>
        </div>
    );
};

export default ProfilePageSkeleton;
