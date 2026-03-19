import { MangaFormData } from '../types';

// Add chapters to the mock data so the import simulation is more realistic
export const externalSourceData: (Omit<MangaFormData, 'userRatings'> & { altSlugs?: string[]; chapters: { title: string; url: string; }[] })[] = [
    {
        title: 'Solo Leveling',
        type: 'Manhwa' as const,
        year: 2018,
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-fJ2458Sjxvga.jpg',
        description: 'In a world where hunters, humans with supernatural abilities, must fight deadly monsters to protect humanity, Sung Jinwoo, notoriously known as the "world\'s weakest hunter," finds himself in a seemingly endless struggle for survival.',
        genres: ['Action', 'Fantasy', 'Adventure', 'System'],
        status: 'Завершено' as const,
        altSlugs: ['na-honjaman-lebel-eob'],
        chapters: Array.from({ length: 179 }, (_, i) => ({ title: `Chapter ${i + 1}`, url: '#' })),
    },
    {
        title: 'Omniscient Reader',
        type: 'Manhwa' as const,
        year: 2020,
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx125034-LzmKk52a13iA.jpg',
        description: 'Kim Dokja is the sole reader of the web novel "Three Ways to Survive the Apocalypse." When the world of the novel becomes reality, his unique knowledge becomes key to surviving in the new, ruined world.',
        genres: ['Action', 'Fantasy', 'Apocalypse', 'Adventure'],
        status: 'В процессе' as const,
        altSlugs: ['jeonjijeog-dogja-sijeom'],
        chapters: Array.from({ length: 210 }, (_, i) => ({ title: `Chapter ${i + 1}`, url: '#' })),
    },
    {
        title: 'The Beginning After The End',
        type: 'Manhwa' as const,
        year: 2018,
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105750-fTqL4y5D9Tbb.jpg',
        description: 'King Grey possesses unrivaled strength, wealth, and prestige. However, with great power comes great loneliness. Reborn into a new world full of magic and monsters, the king has a second chance to correct his past mistakes.',
        genres: ['Fantasy', 'Isekai', 'Action', 'Reincarnation'],
        status: 'В процессе' as const,
        altSlugs: [],
        chapters: Array.from({ length: 175 }, (_, i) => ({ title: `Chapter ${i + 1}`, url: '#' })),
    },
    {
        title: 'Berserk',
        type: 'Manga',
        year: 1989,
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-sY2alEagwO2S.jpg',
        description: 'Guts, a former mercenary known as the "Black Swordsman," is out for revenge. After a traumatic betrayal, he must battle demons and other monstrosities that are attracted to a demonic brand he bears.',
        genres: ['Action', 'Adventure', 'Dark Fantasy', 'Horror', 'Seinen'],
        status: 'В процессе',
        altSlugs: [],
        chapters: Array.from({ length: 375 }, (_, i) => ({ title: `Chapter ${i + 1}`, url: '#' })),
    }
];
