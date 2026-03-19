/* ═══════════════════════════════════════════════════
   SPRINGMANGA — USER RANK / PREFIX SYSTEM
   "Techno-Organic Decay" rank progression
   ═══════════════════════════════════════════════════ */

export interface UserRank {
    id: string;
    title: string;
    minChapters: number;
    color: string;
    bgColor: string;
    borderColor: string;
    glow?: string;
    rainbow?: boolean;
}

export const USER_RANKS: UserRank[] = [
    {
        id: 'init',
        title: 'Инициализация',
        minChapters: 0,
        color: '#7A7A7A',
        bgColor: 'rgba(122,122,122,0.08)',
        borderColor: 'rgba(122,122,122,0.25)',
    },
    {
        id: 'glitch',
        title: 'Сбой системы',
        minChapters: 10,
        color: '#5A7A42',
        bgColor: 'rgba(90,122,66,0.1)',
        borderColor: 'rgba(90,122,66,0.3)',
    },
    {
        id: 'corrosion',
        title: 'Коррозия',
        minChapters: 50,
        color: '#8B5E3C',
        bgColor: 'rgba(139,94,60,0.12)',
        borderColor: 'rgba(139,94,60,0.35)',
        glow: '0 0 6px rgba(139,94,60,0.3)',
    },
    {
        id: 'shortcircuit',
        title: 'Замыкание',
        minChapters: 150,
        color: '#9B59B6',
        bgColor: 'rgba(155,89,182,0.1)',
        borderColor: 'rgba(155,89,182,0.35)',
        glow: '0 0 8px rgba(155,89,182,0.4)',
    },
    {
        id: 'infection',
        title: 'Заражение',
        minChapters: 300,
        color: '#A9FF00',
        bgColor: 'rgba(169,255,0,0.08)',
        borderColor: 'rgba(169,255,0,0.3)',
        glow: '0 0 10px rgba(169,255,0,0.4)',
    },
    {
        id: 'animatronic',
        title: 'Аниматроник',
        minChapters: 500,
        color: '#D4A017',
        bgColor: 'rgba(212,160,23,0.1)',
        borderColor: 'rgba(212,160,23,0.35)',
        glow: '0 0 12px rgba(212,160,23,0.4)',
    },
    {
        id: 'springlock',
        title: 'Пружинный замок',
        minChapters: 1000,
        color: '#C0392B',
        bgColor: 'rgba(192,57,43,0.12)',
        borderColor: 'rgba(192,57,43,0.4)',
        glow: '0 0 14px rgba(192,57,43,0.5)',
    },
    {
        id: 'phantom',
        title: 'Фантом системы',
        minChapters: 2000,
        color: '#FF00FF',
        bgColor: 'rgba(255,0,255,0.06)',
        borderColor: 'rgba(255,0,255,0.3)',
        glow: '0 0 16px rgba(255,0,255,0.4)',
        rainbow: true,
    },
];

export function getRankByChapters(chaptersRead: number): UserRank {
    let rank = USER_RANKS[0];
    for (const r of USER_RANKS) {
        if (chaptersRead >= r.minChapters) rank = r;
    }
    return rank;
}

export function getNextRank(chaptersRead: number): { rank: UserRank; chaptersNeeded: number } | null {
    for (const r of USER_RANKS) {
        if (chaptersRead < r.minChapters) {
            return { rank: r, chaptersNeeded: r.minChapters - chaptersRead };
        }
    }
    return null;
}
