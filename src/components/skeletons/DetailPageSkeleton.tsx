import React from 'react';

const DetailPageSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen pb-20 bg-base animate-pulse">
        {/* Hero Background */}
        <div className="absolute top-0 left-0 w-full h-[500px] bg-surface-30"></div>

        <div className="container mx-auto px-4 relative z-10 pt-24 md:pt-32">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Sidebar */}
                <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-4">
                    <div className="aspect-[2/3] bg-surface rounded-xl"></div>
                    <div className="h-12 bg-surface rounded-xl"></div>
                    <div className="grid grid-cols-2 gap-3">
                         <div className="h-10 bg-surface rounded-xl"></div>
                         <div className="h-10 bg-surface rounded-xl"></div>
                    </div>
                </div>

                {/* Center Content */}
                <div className="lg:col-span-6 xl:col-span-6 flex flex-col gap-6">
                    <div>
                        <div className="h-4 w-32 bg-surface rounded mb-2"></div>
                        <div className="h-10 w-3/4 bg-surface rounded mb-4"></div>
                        <div className="flex gap-6">
                            <div className="h-4 w-16 bg-surface rounded"></div>
                            <div className="h-4 w-16 bg-surface rounded"></div>
                            <div className="h-4 w-16 bg-surface rounded"></div>
                        </div>
                    </div>

                    <div className="h-10 bg-surface rounded-xl w-full"></div>

                    <div className="space-y-4">
                        <div className="h-4 w-full bg-surface rounded"></div>
                        <div className="h-4 w-full bg-surface rounded"></div>
                        <div className="h-4 w-2/3 bg-surface rounded"></div>
                    </div>

                    <div className="flex gap-2">
                        <div className="h-6 w-20 bg-surface rounded-lg"></div>
                        <div className="h-6 w-24 bg-surface rounded-lg"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 h-32 bg-surface rounded-xl"></div>
                </div>

                {/* Right Sidebar */}
                <div className="lg:col-span-3 xl:col-span-3 flex flex-col gap-6">
                    <div className="flex justify-between">
                         <div className="h-5 w-24 bg-surface rounded"></div>
                         <div className="h-4 w-12 bg-surface rounded"></div>
                    </div>
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="flex gap-3">
                                <div className="w-16 h-24 bg-surface rounded-lg shrink-0"></div>
                                <div className="flex flex-col justify-center gap-2 w-full">
                                    <div className="h-3 w-3/4 bg-surface rounded"></div>
                                    <div className="h-3 w-1/2 bg-surface rounded"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default DetailPageSkeleton;