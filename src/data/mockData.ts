import { Manga, ReadingProgress, Comment, User } from '../types';
import { v4 as uuidv4 } from 'uuid';

const generateChapters = (count: number, mangaTitle: string, hasContent: boolean = false) => {
    return Array.from({ length: count }, (_, i) => {
        const chapterNum = count - i;
        const date = new Date();
        date.setDate(date.getDate() - i * 7); // Assume weekly release
        
        return {
            id: uuidv4(),
            chapterNumber: String(chapterNum),
            title: `Том ${Math.floor(chapterNum / 50) + 1} Глава ${chapterNum}`,
            date: date.toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'}),
            views: 10000 + Math.floor(Math.random() * 50000),
            content: hasContent ? Array.from({ length: Math.floor(Math.random() * 25) + 15 }, (_, i) => `https://picsum.photos/seed/${mangaTitle}${chapterNum}${i}/800/1200`) : [],
        };
    });
};

export const mangaData: Manga[] = [
    {
        id: '9a3d132f-9d3b-4b6a-8b0a-8d3e9d8f3b2a',
        title: 'Поднятие уровня в одиночку',
        type: 'Manhwa' as const,
        year: 2018,
        rating: 9.9,
        userRatings: {},
        views: '25.3M',
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105398-fJ2458Sjxvga.jpg',
        description: 'В мире, где охотники — люди со сверхспособностями — должны сражаться со смертоносными монстрами, чтобы защитить человечество, Сон Джину, заведомо известный как «самый слабый охотник в мире», оказывается в бесконечной борьбе за выживание.',
        genres: ['Экшен', 'Фэнтези', 'Система', 'Приключения'],
        status: 'Завершено' as const,
        chapters: [],
    },
    {
        id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
        title: 'Всеведущий читатель',
        type: 'Manhwa' as const,
        year: 2020,
        rating: 9.7,
        userRatings: {},
        views: '12.1M',
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx125034-LzmKk52a13iA.jpg',
        description: 'Ким Докча — единственный читатель веб-романа «Три способа выжить в апокалипсисе». Когда мир романа становится реальностью, его уникальные знания становятся ключом к выживанию в новом, разрушенном мире.',
        genres: ['Экшен', 'Фэнтези', 'Апокалипсис', 'Приключения'],
        status: 'В процессе' as const,
        chapters: [],
    },
    {
        id: '25d8869b-980e-43a2-8f19-3e3c63c26027',
        title: 'Начало после конца',
        type: 'Manhwa' as const,
        year: 2018,
        rating: 9.8,
        userRatings: {},
        views: '15.5M',
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx105750-fTqL4y5D9Tbb.jpg',
        description: 'Король Грей обладает непревзойденной силой, богатством и престижем. Однако за великой силой всегда следует одиночество. Переродившись в новом мире, полном магии и монстров, у короля есть второй шанс исправить свои прошлые ошибки.',
        genres: ['Фэнтези', 'Исекай', 'Экшен', 'Реинкарнация'],
        status: 'В процессе' as const,
        chapters: [],
    },
    {
        id: '6f8f8b1e-0b7b-4b1e-8b1e-0b7b8f8b1e0b',
        title: 'Башня Бога',
        type: 'Manhwa' as const,
        year: 2010,
        rating: 9.5,
        userRatings: {},
        views: '20.2M',
        cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx85961-k5wP4j535nRq.jpg',
        description: 'Двадцать Пятый Баам — мальчик, который всю свою жизнь провёл в одиночестве в тёмной пещере. Его единственный друг, Рахиль, уходит, чтобы подняться на таинственную Башню. Баам следует за ней, готовый столкнуться с любыми испытаниями.',
        genres: ['Экшен', 'Фэнтези', 'Приключения', 'Мистика'],
        status: 'В процессе' as const,
        chapters: [],
    },
];

export const demoContinueReadingData: ReadingProgress[] = [
    { mangaId: '9a3d132f-9d3b-4b6a-8b0a-8d3e9d8f3b2a', currentChapter: 150, totalChapters: 179 },
    { mangaId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', currentChapter: 48, totalChapters: 210 },
];

export const demoUsers: User[] = [
    { username: 'admin', email: 'admin@example.com', avatar: 'admin', role: 'admin', status: 'active', subscribedMangaIds: [] },
    { username: 'Moderator', email: 'moderator@example.com', avatar: 'Moderator', role: 'moderator', status: 'active', subscribedMangaIds: [] },
    { username: 'Danat', email: 'danat@example.com', avatar: 'Danat', role: 'user', status: 'active', subscribedMangaIds: [] },
    { username: 'M1nsk1', email: 'm1nsk1@example.com', avatar: 'M1nsk1', role: 'user', status: 'active', subscribedMangaIds: [] },
    { username: 'ARK4IM', email: 'ark4im@example.com', avatar: 'ARK4IM', role: 'user', status: 'active', subscribedMangaIds: [] },
    { username: 'BannedUser', email: 'banned@example.com', avatar: 'BannedUser', role: 'user', status: 'banned', subscribedMangaIds: [] },
];

export const demoComments: Comment[] = [
    {
        id: 1,
        userId: 'danat@example.com',
        user: { name: 'Danat', avatar: 'Danat' },
        text: 'Тайтл ожидается довольно таки интересным, ставим лайки и 10ки. Это даст нам огромный буст к работоспособности (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ а главы в оригинале выходят каждый четверг.',
        timestamp: '2 года назад',
        likedBy: ['m1nsk1@example.com', 'ark4im@example.com'],
        replies: []
    },
];