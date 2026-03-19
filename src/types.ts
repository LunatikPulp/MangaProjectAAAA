export const typeDisplayNames: Record<string, string> = {
  Manga: 'Манга',
  Manhwa: 'Манхва',
  Manhua: 'Маньхуа',
  'OEL-Manga': 'OEL-Манга',
  Rukomiks: 'Руманга',
  Western: 'Комикс западный',
};

export interface Manga {
  id: string;
  title: string;
  type: 'Manhwa' | 'Manga' | 'Manhua' | 'OEL-Manga' | 'Rukomiks' | 'Western';
  year: number;
  rating: number;
  userRatings: { [userEmail: string]: number };
  userStatuses?: { [userEmail: string]: BookmarkStatus };
  views: string;
  cover: string;
  description: string;
  chapters: Chapter[];
  chapterCount?: number;
  genres: string[];
  status: string;
  ageRating?: string;
  alternativeNames?: string[];
  authors?: string[];
  publishers?: string[];
  tags?: string[];
  statistics?: {
    rating?: string;
    status_counts?: { [key: string]: string };
  };
  ratingInfo?: {
    average: number;
    total: number;
    distribution: { [score: string]: number };
    user_rating?: number;
  };
  bookmarkCounts?: { [status: string]: number };
  userBookmark?: BookmarkStatus | null;
}

export type MangaFormData = Omit<
  Manga,
  'id' | 'chapters' | 'rating' | 'views' | 'userRatings'
>;

export interface Page {
  id: string;
  url?: string;   // для http/https
  file?: File;    // для загруженных
}


export interface Chapter {
  id: string;
  chapterNumber: string;
  title: string;
  date: string;
  views: number;
  pages: Page[];   // ✅ теперь массив Page
  likes?: number;
  is_liked?: boolean;
}



export interface ReadingProgress {
  mangaId: string;
  currentChapter: number;
  totalChapters: number;
}

export type BookmarkStatus =
  | 'Читаю'
  | 'Буду читать'
  | 'Прочитано'
  | 'Брошено'
  | 'Отложено'
  | 'Не интересно';

export interface Bookmark {
  mangaId: string;
  status: BookmarkStatus;
  addedAt: string; // ISO
}

export interface User {
  id?: number;
  username: string;
  email: string;
  avatar: string;
  avatar_url?: string;
  role: 'user' | 'moderator' | 'admin';
  status: 'active' | 'banned';
  about?: string;
  birthday?: string;
  gender?: string;
  erotic_filter?: 'show' | 'hide' | 'hentai_only';
  private_profile?: boolean;
  allow_trades?: boolean;
  notify_email?: boolean;
  notify_vk?: boolean;
  notify_telegram?: boolean;
  subscribedMangaIds?: string[];
  bio?: string;
  profile_banner_url?: string;
  profile_theme?: string;
  avatar_frame?: string;
  badge_ids?: string;
  showcase_manga_ids?: string;
  xp?: number;
  level?: number;
}

export interface Comment {
  id: number;
  userId: string;
  userNumericId?: number;
  user: {
    name: string;
    avatar: string;
    avatar_frame?: string;
    chapters_read?: number;
  };
  text: string;
  timestamp: string;
  likedBy: string[];
  replies?: Comment[];
}

export interface HistoryItem {
  mangaId: string;
  chapterId: string;
  readAt: string;
}

export type NotificationCategory = 'updates' | 'social' | 'important';

export interface Notification {
  id: number;
  message: string;
  link: string;
  read: boolean;
  timestamp: string;
  category?: NotificationCategory;
}

export interface Report {
  id: number;
  mangaId: string;
  mangaTitle: string;
  reportedBy: string;
  timestamp: string;
  status: 'pending' | 'resolved';
  reason?: string;
  message?: string;
}

export interface EditSuggestion {
  id: number;
  mangaId: string;
  mangaTitle: string;
  suggestedBy: string;
  timestamp: string;
  data: MangaFormData;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AIRecommendation {
  title: string;
  reason: string;
  manga?: Manga;
}

export interface CharacterInfo {
  name: string;
  description: string;
}
