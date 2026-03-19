import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { typeDisplayNames } from '../types';
import MangaCardSkeleton from '../components/skeletons/MangaCardSkeleton';
import { API_BASE } from '../services/externalApiService';

interface SectionItem {
  manga_id: string;
  title: string;
  cover_url: string;
  manga_type: string;
  year: number;
  status: string;
  mangabuff_rating: string;
  mangabuff_views?: number;
  real_views?: number;
  genres: string[];
  description?: string;
  user_rating_avg?: number | null;
  user_rating_count?: number;
}

const formatViews = (views: number): string => {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
};

const GridSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-surface border border-overlay p-4">
        <MangaCardSkeleton />
      </div>
    ))}
  </div>
);

const SectionListPage: React.FC = () => {
  const { section } = useParams<{ section: string }>();
  const [items, setItems] = useState<SectionItem[]>([]);
  const [title, setTitle] = useState('Список');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!section) return;
    setLoading(true);
    fetch(`${API_BASE}/manga/section/${section}`)
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        setTitle(data.title || 'Список');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [section]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center gap-3">
        <span className="text-[10px] font-mono text-brand-accent tracking-[0.3em] uppercase">// СЕКЦИЯ</span>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-text-primary text-center uppercase tracking-wide spring-glitch">{title}</h1>
        <div className="h-0.5 w-32 bg-brand-accent"></div>
      </div>

      {loading ? (
        <GridSkeleton count={6} />
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item, index) => {
            const coverUrl = item.cover_url?.startsWith('/') ? `${API_BASE}${item.cover_url}` : (item.cover_url || '');
            const mangaType = (item.manga_type as keyof typeof typeDisplayNames) || 'Manga';

            return (
              <Link
                to={`/manga/${item.manga_id}`}
                key={item.manga_id}
                className="group bg-surface p-4 flex items-center gap-4 border border-overlay hover:border-brand-accent-30 hover:bg-surface-hover transition-all"
              >
                <div className="relative flex-shrink-0">
                  <span className="absolute -left-2 -top-2 w-6 h-6 flex items-center justify-center bg-base text-xs font-mono font-bold text-brand-accent border border-overlay z-10">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <img src={coverUrl} alt={item.title} className="w-16 h-24 object-cover border border-overlay group-hover:border-brand-accent-30 transition-all" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-muted">
                    {typeDisplayNames[mangaType] || mangaType} • {item.year} • {item.status}
                  </p>
                  <h3 className="text-sm md:text-base font-bold text-text-primary group-hover:text-brand-accent transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center text-xs font-mono text-muted mt-2 gap-3">
                    {(item.real_views != null && item.real_views > 0) && (
                      <span className="text-brand">👁 {formatViews(item.real_views)}</span>
                    )}
                    {item.genres?.length > 0 && (
                      <span className="truncate">{item.genres.slice(0, 3).join(' / ')}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <h2 className="text-2xl font-display font-bold text-text-primary uppercase">[ПУСТО]</h2>
          <p className="text-muted font-mono mt-2">В этой секции пока нет тайтлов.</p>
        </div>
      )}
    </div>
  );
};

export default SectionListPage;
