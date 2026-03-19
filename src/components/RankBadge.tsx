import React from 'react';
import { getRankByChapters } from '../config/userRanks';

interface RankBadgeProps {
    chaptersRead: number;
    size?: 'sm' | 'md';
}

const RankBadge: React.FC<RankBadgeProps> = ({ chaptersRead, size = 'sm' }) => {
    const rank = getRankByChapters(chaptersRead);
    const isSm = size === 'sm';

    return (
        <>
            {rank.rainbow && (
                <style>{`
                    @keyframes rankRainbow {
                        0%   { color: #FF0000; border-color: rgba(255,0,0,0.4); box-shadow: 0 0 12px rgba(255,0,0,0.3); }
                        16%  { color: #FF8800; border-color: rgba(255,136,0,0.4); box-shadow: 0 0 12px rgba(255,136,0,0.3); }
                        33%  { color: #FFFF00; border-color: rgba(255,255,0,0.4); box-shadow: 0 0 12px rgba(255,255,0,0.3); }
                        50%  { color: #00FF00; border-color: rgba(0,255,0,0.4); box-shadow: 0 0 12px rgba(0,255,0,0.3); }
                        66%  { color: #00CCFF; border-color: rgba(0,204,255,0.4); box-shadow: 0 0 12px rgba(0,204,255,0.3); }
                        83%  { color: #AA00FF; border-color: rgba(170,0,255,0.4); box-shadow: 0 0 12px rgba(170,0,255,0.3); }
                        100% { color: #FF0000; border-color: rgba(255,0,0,0.4); box-shadow: 0 0 12px rgba(255,0,0,0.3); }
                    }
                    .rank-rainbow {
                        animation: rankRainbow 3s linear infinite;
                    }
                `}</style>
            )}
            <span
                className={`inline-flex items-center font-mono font-bold uppercase tracking-wider select-none ${isSm ? 'text-[8px] px-1.5 py-0.5 gap-0.5' : 'text-[10px] px-2 py-0.5 gap-1'} ${rank.rainbow ? 'rank-rainbow' : ''}`}
                style={rank.rainbow ? {
                    background: rank.bgColor,
                    border: `1px solid ${rank.borderColor}`,
                    borderRadius: '0px',
                    lineHeight: 1.2,
                } : {
                    color: rank.color,
                    background: rank.bgColor,
                    border: `1px solid ${rank.borderColor}`,
                    boxShadow: rank.glow || 'none',
                    borderRadius: '0px',
                    lineHeight: 1.2,
                }}
            >
                {rank.title}
            </span>
        </>
    );
};

export default RankBadge;
