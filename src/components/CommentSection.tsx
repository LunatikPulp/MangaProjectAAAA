import React, { useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Comment } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import FramedAvatar from './FramedAvatar';
import RankBadge from './RankBadge';
import { API_BASE } from '../services/externalApiService';

function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('backend_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

interface CommentSectionProps {
  mangaId: string;
  chapterId?: string;
  initialComments?: Comment[];
}

const CommentView: React.FC<{ 
    comment: Comment; 
    onReply: (commentId: number, text: string) => void;
    onDelete: (commentId: number) => void;
    onLike: (commentId: number) => void;
}> = ({ comment, onReply, onDelete, onLike }) => {
    const [showReply, setShowReply] = useState(false);
    const [replyText, setReplyText] = useState('');
    const { user } = useContext(AuthContext);

    const handleReplySubmit = () => {
        if (replyText.trim() && user) {
            onReply(comment.id, replyText);
            setReplyText('');
            setShowReply(false);
        }
    }
    
    const isLiked = user ? comment.likedBy.includes(user.email) : false;

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-4"
        >
            <Link to={comment.userNumericId ? `/user/${comment.userNumericId}` : '#'} className="flex-shrink-0 mt-1 hover:opacity-80 transition-opacity">
                <FramedAvatar avatarUrl={comment.user.avatar} username={comment.user.name} size={32} frameKey={comment.user.avatar_frame} />
            </Link>
            <div className="flex-1">
                <div className="bg-surface p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Link to={comment.userNumericId ? `/user/${comment.userNumericId}` : '#'} className="font-bold text-text-primary hover:text-brand-accent transition-colors">{comment.user.name}</Link>
                            <RankBadge chaptersRead={comment.user.chapters_read || 0} size="sm" />
                        </div>
                        <span className="text-xs text-muted">{comment.timestamp}</span>
                    </div>
                    <p className="text-text-secondary mt-2 text-sm">{comment.text}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                        <button onClick={() => setShowReply(!showReply)} className="hover:text-brand">Ответить</button>
                        <span>·</span>
                        <button onClick={() => onLike(comment.id)} className={`flex items-center gap-1 transition-colors ${isLiked ? 'text-brand-accent' : 'hover:text-brand'}`}>
                            <span>❤️</span> {comment.likedBy.length}
                        </button>
                        {user && (comment.userId === user.email || user.role === 'admin' || user.role === 'moderator') && (
                            <>
                                <span>·</span>
                                <button onClick={() => onDelete(comment.id)} className="hover:text-brand-accent">Удалить</button>
                            </>
                        )}
                    </div>
                </div>
                 {showReply && user && (
                    <div className="mt-3 flex items-start gap-2">
                        <div className="flex-shrink-0 mt-1">
                            <FramedAvatar avatarUrl={user.avatar_url} username={user.username} size={28} frameKey={user.avatar_frame} />
                        </div>
                        <div className="flex-1">
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder={`Ответ ${comment.user.name}...`}
                                className="w-full bg-base border border-surface rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                                rows={2}
                            />
                            <div className="flex justify-end gap-2 mt-1">
                                <button onClick={() => setShowReply(false)} className="text-xs text-muted hover:text-text-primary">Отмена</button>
                                <button onClick={handleReplySubmit} className="bg-brand text-white font-semibold px-3 py-1 rounded-lg text-xs hover:bg-brand-hover disabled:opacity-50" disabled={!replyText.trim()}>Отправить</button>
                            </div>
                        </div>
                    </div>
                )}

                 <div className="mt-4 pl-6 border-l-2 border-surface-50 space-y-4">
                    {comment.replies?.map(reply => (
                        <CommentView key={reply.id} comment={reply} onReply={onReply} onDelete={onDelete} onLike={onLike}/>
                    ))}
                 </div>
            </div>
        </motion.div>
    );
};


const CommentSection: React.FC<CommentSectionProps> = ({ mangaId, chapterId }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest'>('popular');
  const { user, openAuthModal } = useContext(AuthContext);
  const { showToaster } = useContext(ToasterContext);
  const isGuest = !user;

  // Подсчёт всех комментариев (включая ответы)
  const totalCount = useMemo(() => {
    const count = (list: Comment[]): number =>
      list.reduce((acc, c) => acc + 1 + count(c.replies || []), 0);
    return count(comments);
  }, [comments]);

  // Загрузка комментариев с сервера
  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (chapterId) params.set('chapter_id', chapterId);
      const res = await fetch(`${API_BASE}/manga/${mangaId}/comments?${params}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [mangaId, chapterId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleGuestFocus = () => {
    openAuthModal('register');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) {
        if (!user) showToaster("Пожалуйста, войдите, чтобы оставить комментарий");
        return;
    }

    try {
      const res = await fetch(`${API_BASE}/manga/${mangaId}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          text: newComment,
          chapter_id: chapterId || null,
        }),
      });
      if (res.ok) {
        const added = await res.json();
        setComments(prev => [added, ...prev]);
        setNewComment('');
        showToaster('Комментарий добавлен!');
      } else {
        showToaster('Ошибка при добавлении комментария');
      }
    } catch {
      showToaster('Ошибка сети');
    }
  };
  
  const handleReply = async (commentId: number, text: string) => {
    if (!user) return;

    try {
      const res = await fetch(`${API_BASE}/manga/${mangaId}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          text,
          parent_id: commentId,
          chapter_id: chapterId || null,
        }),
      });
      if (res.ok) {
        const newReply = await res.json();
        const addReplyToTree = (list: Comment[]): Comment[] =>
          list.map(c => {
            if (c.id === commentId) {
              return { ...c, replies: [newReply, ...(c.replies || [])] };
            }
            return { ...c, replies: c.replies ? addReplyToTree(c.replies) : [] };
          });
        setComments(addReplyToTree);
      }
    } catch {
      showToaster('Ошибка при ответе');
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      const res = await fetch(`${API_BASE}/manga/comments/${commentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const removeRecursively = (list: Comment[]): Comment[] =>
          list
            .filter(c => c.id !== commentId)
            .map(c => ({ ...c, replies: c.replies ? removeRecursively(c.replies) : [] }));
        setComments(removeRecursively);
        showToaster('Комментарий удален.');
      }
    } catch {
      showToaster('Ошибка при удалении');
    }
  };

  const handleLike = async (commentId: number) => {
    if (!user) {
      showToaster("Пожалуйста, войдите, чтобы поставить лайк");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/manga/comments/${commentId}/like`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const likeRecursively = (list: Comment[]): Comment[] =>
          list.map(c => {
            if (c.id === commentId) {
              const isLiked = c.likedBy.includes(user.email);
              const newLikedBy = isLiked
                ? c.likedBy.filter(email => email !== user.email)
                : [...c.likedBy, user.email];
              return { ...c, likedBy: newLikedBy };
            }
            return { ...c, replies: c.replies ? likeRecursively(c.replies) : [] };
          });
        setComments(likeRecursively);
      }
    } catch {
      showToaster('Ошибка');
    }
  };

  const sortedComments = useMemo(() => {
      const commentsCopy = [...comments];
      if (sortBy === 'popular') {
          return commentsCopy.sort((a, b) => b.likedBy.length - a.likedBy.length);
      }
      return commentsCopy;
  }, [comments, sortBy]);

  return (
    <div className="space-y-6">
        <form onSubmit={handleSubmit} className="flex items-start gap-4">
            <div className="flex-shrink-0">
                <FramedAvatar avatarUrl={user?.avatar_url} username={user?.username || 'Гость'} size={40} frameKey={user?.avatar_frame} />
            </div>
            <div className="flex-1">
                <textarea
                    value={newComment}
                    onChange={(e) => {
                        if (isGuest) return;
                        setNewComment(e.target.value);
                    }}
                    onFocus={isGuest ? handleGuestFocus : undefined}
                    onClick={isGuest ? handleGuestFocus : undefined}
                    placeholder={isGuest ? 'Войдите, чтобы оставить комментарий...' : 'Оставить комментарий...'}
                    className="w-full bg-base border border-surface rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    rows={3}
                    readOnly={isGuest}
                />
                <div className="flex justify-end mt-2">
                    <button type="submit" className="bg-brand text-white font-semibold px-4 py-2 rounded-lg text-sm hover:bg-brand-hover transition-colors disabled:opacity-50" disabled={!newComment.trim() || isGuest}>
                        Отправить
                    </button>
                </div>
            </div>
        </form>
      
      <div className="flex items-center gap-4 border-b border-surface pb-4">
          <h3 className="text-lg font-bold">Комментарии ({totalCount})</h3>
          <div className="flex items-center gap-2">
            <SortButton name="popular" currentSort={sortBy} setSort={setSortBy}>Популярные</SortButton>
            <SortButton name="newest" currentSort={sortBy} setSort={setSortBy}>Новые</SortButton>
          </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted text-sm">Загрузка комментариев...</div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
              {sortedComments.map((comment) => (
                  <CommentView key={comment.id} comment={comment} onReply={handleReply} onDelete={handleDelete} onLike={handleLike}/>
              ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const SortButton: React.FC<{name: 'popular' | 'newest', currentSort: string, setSort: (s: 'popular' | 'newest') => void, children: React.ReactNode}> = ({ name, currentSort, setSort, children }) => (
    <button onClick={() => setSort(name)} className={`px-3 py-1 text-xs font-semibold rounded-none ${currentSort === name ? 'bg-brand text-white' : 'bg-surface text-muted hover:bg-overlay'}`}>
        {children}
    </button>
);


export default CommentSection;
