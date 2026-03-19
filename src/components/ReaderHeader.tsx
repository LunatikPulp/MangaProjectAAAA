import React, { useState, useEffect, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../contexts/AuthContext';
import FramedAvatar from './FramedAvatar';
import Logo from './icons/Logo';
import ReportIcon from './icons/ReportIcon';

const reportReasons = [
  { value: 'broken', label: 'Битая глава' },
  { value: 'stolen', label: 'Воровство' },
  { value: 'duplicate', label: 'Дубль' },
  { value: 'mixed', label: 'Мешанина из разных глав' },
  { value: 'illegal', label: 'Нарушение законов РФ' },
  { value: 'no_images', label: 'Не грузит картинки' },
  { value: 'low_quality', label: 'Низкое качество главы' },
  { value: 'lgbt', label: 'Пропаганда ЛГБТ' },
] as const;

const reasonHints: Partial<Record<string, string>> = {
  no_images: 'Перед отправкой жалобы, пожалуйста, попробуйте сменить сервер, с которого загружаются картинки (в настройках читалки), а также почистить кэш/куки.',
  broken: 'Убедитесь, что проблема не на вашей стороне — попробуйте обновить страницу или сменить браузер.',
  low_quality: 'Если качество низкое только на одной странице, укажите её номер в сообщении.',
  duplicate: 'Данная глава является копией другой главы. Пожалуйста, приложите ссылку на оригинальную главу.',
  mixed: 'Глава состоит из кусков других глав (и проектов).',
};

interface ReaderHeaderProps {
  mangaTitle: string;
  mangaId: string;
  isVisible: boolean;
  chapterNumber: string;
  volumeNumber?: string;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onReport: (reason: string, message: string) => void;
  onReportOpenChange?: (open: boolean) => void;
}

const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  mangaTitle,
  mangaId,
  isVisible,
  chapterNumber,
  volumeNumber = '1',
  onPrevChapter,
  onNextChapter,
  hasPrev,
  hasNext,
  onReport,
  onReportOpenChange,
}) => {
  const { user, logout, openAuthModal } = useContext(AuthContext);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [isReasonDropdownOpen, setReasonDropdownOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (reportRef.current && !reportRef.current.contains(event.target as Node)) {
        setReportOpen(false);
        setReasonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Notify parent about report open state
  useEffect(() => {
    onReportOpenChange?.(isReportOpen);
  }, [isReportOpen, onReportOpenChange]);

  // Lock scroll when report is open (mobile only — header report is mobile-only)
  useEffect(() => {
    if (isReportOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };
    }
  }, [isReportOpen]);

  const handleSubmitReport = () => {
    if (!reportReason) return;
    onReport(reportReason, reportMessage);
    setReportOpen(false);
    setReportReason('');
    setReportMessage('');
  };

  const selectedReasonLabel = reportReasons.find(r => r.value === reportReason)?.label || '';
  const hint = reasonHints[reportReason];

  const chapterLabel = `${volumeNumber}-${chapterNumber}`;

  const content = (
    <AnimatePresence>
      {isVisible && (
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="reader-header fixed top-0 left-0 right-0 z-[10000] bg-base bg-opacity-90 backdrop-blur-md border-b border-surface"
        >
          <div className="container mx-auto px-3 md:px-8">
            <div className="flex items-center h-14">
              {/* Left: logo + back arrow + manga title (PC) */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Link to="/" className="flex items-center shrink-0">
                  <Logo />
                </Link>
                <Link
                  to={`/manga/${mangaId}`}
                  className="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-text-primary shrink-0"
                  aria-label="К произведению"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <Link
                  to={`/manga/${mangaId}`}
                  className="hidden md:block text-sm font-semibold text-text-primary hover:text-brand transition-colors truncate max-w-[200px] lg:max-w-xs"
                >
                  {mangaTitle}
                </Link>
              </div>

              {/* Center: < vol-chapter > navigator */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onPrevChapter}
                  disabled={!hasPrev || isReportOpen}
                  className={`p-1.5 rounded-lg transition-colors ${hasPrev && !isReportOpen ? 'text-muted hover:text-text-primary hover:bg-surface' : 'text-muted/30 cursor-not-allowed'}`}
                  aria-label="Предыдущая глава"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-text-primary tabular-nums px-2 select-none">
                  {chapterLabel}
                </span>
                <button
                  onClick={onNextChapter}
                  disabled={!hasNext || isReportOpen}
                  className={`p-1.5 rounded-lg transition-colors ${hasNext && !isReportOpen ? 'text-muted hover:text-text-primary hover:bg-surface' : 'text-muted/30 cursor-not-allowed'}`}
                  aria-label="Следующая глава"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Right: report (mobile only) + profile */}
              <div className="flex items-center gap-1 flex-1 justify-end">
                {/* Report button — mobile only, PC uses sidebar */}
                <div className="relative md:hidden" ref={reportRef}>
                  <button
                    onClick={() => setReportOpen(!isReportOpen)}
                    className="p-2 rounded-lg hover:bg-surface transition-colors text-muted hover:text-brand-accent"
                    aria-label="Пожаловаться"
                  >
                    <ReportIcon className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {isReportOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-x-3 top-16 bg-overlay rounded-none shadow-2xl border border-surface py-3 px-4 z-50"
                      >
                        <h3 className="text-sm font-bold text-text-primary mb-3">Причина жалобы</h3>

                        {/* Reason dropdown */}
                        <div className="relative mb-3">
                          <button
                            onClick={() => setReasonDropdownOpen(!isReasonDropdownOpen)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-surface rounded-lg border border-overlay text-sm text-left transition-colors hover:border-white/20"
                          >
                            <span className={selectedReasonLabel ? 'text-text-primary' : 'text-muted'}>
                              {selectedReasonLabel || 'Выберите причину'}
                            </span>
                            <svg className={`w-4 h-4 text-muted transition-transform ${isReasonDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <AnimatePresence>
                            {isReasonDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute top-full left-0 right-0 mt-1 bg-surface-hover border border-overlay rounded-none shadow-xl overflow-hidden py-1 z-10 max-h-60 overflow-y-auto"
                              >
                                {reportReasons.map(reason => (
                                  <button
                                    key={reason.value}
                                    onClick={() => {
                                      setReportReason(reason.value);
                                      setReasonDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors ${
                                      reportReason === reason.value ? 'text-brand font-medium' : 'text-text-secondary'
                                    }`}
                                  >
                                    {reason.label}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Hint for selected reason */}
                        {hint && (
                          <div className="mb-3 px-3 py-2.5 bg-surface-50 rounded-lg border border-white/5">
                            <p className="text-xs text-muted leading-relaxed">{hint}</p>
                          </div>
                        )}

                        {/* Message textarea */}
                        <textarea
                          value={reportMessage}
                          onChange={(e) => setReportMessage(e.target.value)}
                          placeholder="Сообщение (необязательно)"
                          rows={3}
                          className="w-full px-3 py-2.5 bg-surface rounded-lg border border-overlay text-sm text-text-primary placeholder-muted resize-none focus:outline-none focus:border-brand/50 transition-colors mb-3"
                        />

                        {/* Submit */}
                        <button
                          onClick={handleSubmitReport}
                          disabled={!reportReason}
                          className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            reportReason
                              ? 'bg-brand-accent text-white hover:bg-brand-accent'
                              : 'bg-surface text-muted cursor-not-allowed'
                          }`}
                        >
                          Отправить жалобу
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Profile */}
                {user ? (
                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => setProfileOpen(!isProfileOpen)}
                      aria-label="Меню профиля"
                      className="p-1.5 rounded-lg hover:bg-surface transition-colors"
                    >
                      <FramedAvatar avatarUrl={user.avatar_url} username={user.username} size={32} frameKey={user.avatar_frame} />
                    </button>
                    <AnimatePresence>
                      {isProfileOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute right-0 mt-2 w-56 bg-surface border border-overlay shadow-2xl shadow-rust-20 py-2 overflow-hidden"
                        >
                          <div className="px-4 py-3 border-b border-overlay mb-1 spring-rust">
                            <p className="text-sm font-bold text-text-primary font-mono">{user.username}</p>
                            <p className="text-xs text-muted truncate">{user.email}</p>
                          </div>
                          <Link to="/profile" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Профиль</Link>
                          {user.role === 'admin' && (
                            <>
                              <Link to="/admin" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Админ панель</Link>
                              <Link to="/admin/import" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Импорт</Link>
                            </>
                          )}
                          {user.role === 'moderator' && (
                            <Link to="/moderator" className="block px-4 py-2 text-sm text-text-primary hover:bg-brand-10 hover:text-brand-accent transition-colors font-mono" onClick={() => setProfileOpen(false)}>{'>'} Модератор</Link>
                          )}
                          <div className="border-t border-overlay mt-1 pt-1">
                            <button onClick={() => { logout(); setProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm font-mono text-brand-accent hover:bg-brand-accent-10 transition-colors">[ВЫХОД]</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAuthModal('login')}
                      className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Войти
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.header>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default ReaderHeader;
