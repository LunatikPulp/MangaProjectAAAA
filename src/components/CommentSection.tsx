import React, { useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Comment } from '../types';
import { AuthContext } from '../contexts/AuthContext';
import { ToasterContext } from '../contexts/ToasterContext';
import FramedAvatar from './FramedAvatar';
import RankBadge from './RankBadge';
import { API_BASE } from '../services/externalApiService';


interface CommentSectionProps {
  mangaId: string;
  chapterId?: string;
  initialComments?: Comment[];
}

const REPORT_REASONS = [
  { r: 'profanity', l: 'Маты' },
  { r: 'illegal', l: 'Нарушение законов РФ' },
  { r: 'suicide', l: 'Призыв к суициду' },
  { r: 'ads', l: 'Реклама' },
  { r: 'spam', l: 'Спам' },
  { r: 'spoiler', l: 'Спойлер' },
];

const ReportModal: React.FC<{
  commentId: number;
  onClose: () => void;
  onSubmit: (commentId: number, reason: string, message: string) => void;
}> = ({ commentId, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-overlay rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-text-primary text-base mb-3">Отправить жалобу</h3>
        <select
          className="w-full bg-base border border-surface rounded-lg p-2.5 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-brand"
          value={reason}
          onChange={e => setReason(e.target.value)}
        >
          <option value="">Выберите причину...</option>
          {REPORT_REASONS.map(opt => (
            <option key={opt.r} value={opt.r}>{opt.l}</option>
          ))}
        </select>
        <textarea
          className="w-full bg-base border border-surface rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand"
          rows={3}
          placeholder="Сообщение (необязательно)..."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2 text-sm rounded-lg bg-surface hover:bg-surface-hover text-muted">Отмена</button>
          <button
            onClick={() => { if (reason) { onSubmit(commentId, reason, message); onClose(); } }}
            disabled={!reason}
            className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Отправить жалобу
          </button>
        </div>
      </div>
    </div>
  );
};

const CommentView: React.FC<{ 
    comment: Comment; 
    onReply: (commentId: number, text: string) => void;
    onDelete: (commentId: number) => void;
    onLike: (commentId: number) => void;
    onReport: (commentId: number, reason: string, message: string) => void;
    onModerate?: (commentId: number, action: string) => void;
    isAdmin?: boolean;
}> = ({ comment, onReply, onDelete, onLike, onReport, onModerate, isAdmin }) => {
    const [showReply, setShowReply] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showReportModal, setShowReportModal] = useState(false);
    const { user } = useContext(AuthContext);

    const handleReplySubmit = () => {
        if (replyText.trim() && user) {
            onReply(comment.id, replyText);
            setReplyText('');
            setShowReply(false);
        }
    }
    
    const isLiked = user ? comment.likedBy.includes(user.email) : false;
    const isPending = comment.status === 'pending';
    const isUnderReview = comment.status === 'under_review';
    const isRejected = comment.status === 'rejected';

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
                <div className={`bg-surface p-4 rounded-lg ${isPending ? 'border border-yellow-500/40' : isUnderReview ? 'border border-orange-500/40' : isRejected ? 'border border-red-500/40 opacity-60' : ''}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Link to={comment.userNumericId ? `/user/${comment.userNumericId}` : '#'} className="font-bold text-text-primary hover:text-brand-accent transition-colors">{comment.user.name}</Link>
                            <RankBadge chaptersRead={comment.user.chapters_read || 0} size="sm" />
                            {isPending && <span className="text-[10px] font-mono bg-yellow-500/20 text-yellow-400 px-2 py-0.5">ОЖИДАЕТ</span>}
                            {isUnderReview && <span className="text-[10px] font-mono bg-orange-500/20 text-orange-400 px-2 py-0.5">НА ПРОВЕРКЕ</span>}
                            {isRejected && <span className="text-[10px] font-mono bg-red-500/20 text-red-400 px-2 py-0.5">ОТКЛОНЁН</span>}
                        </div>
                        <span className="text-xs text-muted">{comment.timestamp}</span>
                    </div>
                    <p className="text-text-secondary mt-2 text-sm">{comment.text}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted flex-wrap">
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
                        {user && comment.userId !== user.email && !isPending && !isRejected && (
                            <>
                                <span>·</span>
                                <button onClick={() => setShowReportModal(true)} className="hover:text-red-400">Пожаловаться</button>
                            </>
                        )}
                        {isAdmin && onModerate && isPending && (
                            <>
                                <span>·</span>
                                <button onClick={() => onModerate(comment.id, 'approve')} className="text-green-400 hover:text-green-300">Одобрить</button>
                                <span>·</span>
                                <button onClick={() => onModerate(comment.id, 'reject')} className="text-red-400 hover:text-red-300">Отклонить</button>
                            </>
                        )}
                    </div>
                </div>
                {showReportModal && (
                    <ReportModal commentId={comment.id} onClose={() => setShowReportModal(false)} onSubmit={onReport} />
                )}
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
                         <CommentView key={reply.id} comment={reply} onReply={onReply} onDelete={onDelete} onLike={onLike} onReport={onReport} onModerate={onModerate} isAdmin={isAdmin} />
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
  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

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
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setComments(data);
        } else if (data.comments) {
          setComments(Array.isArray(data.comments) ? data.comments : []);
        }
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
        if (added.scrap_earned > 0) showToaster(`+${added.scrap_earned} за комментарий!`);
      } else {
        const data = await res.json().catch(() => ({}));
        showToaster(data.detail || 'Ошибка при добавлении комментария');
      }
    } catch {
      showToaster('Сервер временно недоступен');
    }
  };
  
  const handleReply = async (commentId: number, text: string) => {
    if (!user) return;

    try {
      const res = await fetch(`${API_BASE}/manga/${mangaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text,
          parent_id: commentId,
          chapter_id: chapterId || null,
        }),
      });
      if (res.ok) {
        const newReply = await res.json();
        if (newReply.scrap_earned > 0) showToaster(`+${newReply.scrap_earned} за комментарий!`);
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
      showToaster('Сервер временно недоступен');
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      const res = await fetch(`${API_BASE}/manga/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
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
        credentials: 'include',
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

  const handleReport = async (commentId: number, reason: string, message: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/manga/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason, message }),
      });
      if (res.ok) {
        const data = await res.json();
        showToaster(data.comment_deleted ? 'Комментарий удалён по результатам проверки' : 'Жалоба отправлена');
        if (data.comment_deleted) {
          const removeRecursively = (list: Comment[]): Comment[] =>
            list.filter(c => c.id !== commentId).map(c => ({ ...c, replies: c.replies ? removeRecursively(c.replies) : [] }));
          setComments(removeRecursively);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showToaster(data.detail || 'Ошибка');
      }
    } catch {
      showToaster('Ошибка');
    }
  };

  const handleModerate = async (commentId: number, action: string) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE}/admin/comments/${commentId}/moderate?action=${action}`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (res.ok) {
        const updateStatus = (list: Comment[]): Comment[] =>
          list.map(c => {
            if (c.id === commentId) return { ...c, status: action === 'approve' ? 'approved' : 'rejected' };
            return { ...c, replies: c.replies ? updateStatus(c.replies) : [] };
          });
        setComments(updateStatus);
        showToaster(action === 'approve' ? 'Комментарий одобрен' : 'Комментарий отклонён');
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
                   <CommentView key={comment.id} comment={comment} onReply={handleReply} onDelete={handleDelete} onLike={handleLike} onReport={handleReport} onModerate={isAdmin ? handleModerate : undefined} isAdmin={isAdmin} />
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
