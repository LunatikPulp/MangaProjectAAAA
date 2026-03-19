import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortablePageItemProps {
    id: string;
    pageUrl: string;
    index: number;
    onDelete: (index: number) => void;
}

const SortablePageItem: React.FC<SortablePageItemProps> = ({ id, pageUrl, index, onDelete }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.7 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className="flex items-center gap-3 bg-base p-2 rounded-lg relative">
            <button type="button" {...listeners} className="cursor-grab text-muted hover:text-text-primary p-1">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
            </button>
            <img src={pageUrl} alt={`Page ${index + 1}`} className="w-16 h-24 object-cover rounded-md bg-overlay" />
            <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Страница {index + 1}</p>
            </div>
            <button
                type="button"
                onClick={() => onDelete(index)}
                className="absolute top-1 right-1 bg-black/50 text-white rounded-none p-1 leading-none hover:bg-brand-accent transition-colors"
                aria-label="Удалить страницу"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
};

export default SortablePageItem;