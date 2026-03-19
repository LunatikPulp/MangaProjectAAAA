import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ListIcon from './icons/ListIcon';
import CommentIcon from './icons/CommentIcon';
import SettingsIcon from './icons/SettingsIcon';
import ReportIcon from './icons/ReportIcon';
import HeartIcon from './icons/HeartIcon';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon';
import ChevronLeftIcon from './icons/ChevronLeftIcon';

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

interface ReaderSidebarProps {
    onChapterListClick: () => void;
    onCommentsClick: () => void;
    onSettingsClick: () => void;
    onReportClick: () => void;
    onReport: (reason: string, message: string) => void;
    onLikeClick: () => void;
    isLiked: boolean;
    likeCount: number;
    onAutoScrollToggle: () => void;
    isAutoScrolling: boolean;
    currentPage: number;
    totalPages: number;
    onBackToManga: () => void;
    onPrevChapterClick?: () => void;
    onNextChapterClick?: () => void;
    readerType?: 'scroll' | 'paged';
    isVisible?: boolean;
    isBookmarked: boolean;
    bookmarkStatus: string | null;
    bookmarkStatuses: string[];
    onBookmarkStatusSelect: (status: string) => void;
    onBookmarkRemove: () => void;
}

const SidebarButton: React.FC<{ onClick: () => void; 'aria-label': string; children: React.ReactNode; active?: boolean }> = ({ onClick, children, active, ...props }) => (
    <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={`p-3 rounded-none transition-all shadow-sm backdrop-blur-md border border-white/5 ${
            active
            ? 'bg-brand text-white shadow-brand-20'
            : 'bg-surface-80 text-muted hover:text-brand hover:bg-surface hover:shadow-lg'
        }`}
        {...props}
    >
        {children}
    </motion.button>
);

const BottomBarButton: React.FC<{ onClick: () => void; 'aria-label': string; children: React.ReactNode; active?: boolean; label?: string }> = ({ onClick, children, active, label, ...props }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${
            active ? 'text-brand' : 'text-muted active:text-brand'
        }`}
        {...props}
    >
        {children}
        {label && <span className="text-[10px] leading-none">{label}</span>}
    </button>
);

const ReaderSidebar: React.FC<ReaderSidebarProps> = ({
    onChapterListClick,
    onCommentsClick,
    onSettingsClick,
    onReportClick: _onReportClick,
    onReport,
    onLikeClick,
    isLiked,
    likeCount,
    onAutoScrollToggle,
    isAutoScrolling,
    currentPage,
    totalPages,
    onBackToManga,
    onPrevChapterClick,
    onNextChapterClick,
    readerType = 'scroll',
    isVisible = true,
    isBookmarked,
    bookmarkStatus,
    bookmarkStatuses,
    onBookmarkStatusSelect,
    onBookmarkRemove,
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [isBookmarkMenuOpen, setBookmarkMenuOpen] = useState(false);
    const [isReportPanelOpen, setReportPanelOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportMessage, setReportMessage] = useState('');
    const [isReasonDropdownOpen, setReasonDropdownOpen] = useState(false);
    const reportPanelRef = React.useRef<HTMLDivElement>(null);

    // Close report panel on outside click
    React.useEffect(() => {
        if (!isReportPanelOpen) return;
        const handler = (e: MouseEvent) => {
            if (reportPanelRef.current && !reportPanelRef.current.contains(e.target as Node)) {
                setReportPanelOpen(false);
                setReasonDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isReportPanelOpen]);

    // Lock scroll when report panel is open
    React.useEffect(() => {
        if (isReportPanelOpen) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            };
        }
    }, [isReportPanelOpen]);

    const handleSubmitReport = () => {
        if (!reportReason) return;
        onReport(reportReason, reportMessage);
        setReportPanelOpen(false);
        setReportReason('');
        setReportMessage('');
    };

    const selectedReasonLabel = reportReasons.find(r => r.value === reportReason)?.label || '';
    const hint = reasonHints[reportReason];

    const content = (
        <>
            {/* Desktop sidebar — hidden on mobile */}
            <motion.div
                initial={{ opacity: 0, x: 50, y: "-50%" }}
                animate={{ opacity: 1, x: 0, y: "-50%" }}
                className="fixed right-4 top-1/2 z-[100] max-h-[90vh] flex-col justify-center hidden md:flex"
            >
                <motion.div
                    animate={{ width: collapsed ? 'auto' : 'auto' }}
                    className={`flex flex-col gap-3 p-2 rounded-none border border-overlay shadow-2xl backdrop-blur-xl transition-all duration-300 overflow-y-auto scrollbar-hide ${
                        collapsed ? 'bg-surface-40' : 'bg-base-80'
                    }`}
                    style={{ maxHeight: '100%' }}
                >
                    {collapsed ? (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            onClick={() => setCollapsed(false)}
                            className="p-3 bg-surface-80 rounded-none text-muted hover:text-brand shadow-lg border border-white/5"
                            aria-label="Развернуть панель"
                        >
                            <ChevronLeftIcon className="w-5 h-5" />
                        </motion.button>
                    ) : (
                        <>
                            <div className="flex flex-col gap-2">
                                <motion.button
                                    whileHover={{ x: 5 }}
                                    onClick={() => setCollapsed(true)}
                                    className="p-1 self-start text-muted hover:text-text-primary transition-colors"
                                    aria-label="Свернуть панель"
                                >
                                    <ChevronRightIcon className="w-4 h-4" />
                                </motion.button>

                                <SidebarButton onClick={onBackToManga} aria-label="Вернуться к произведению">
                                    <ChevronLeftIcon className="w-6 h-6" />
                                </SidebarButton>

                                <div className="h-px w-full bg-white/10 my-1"></div>

                                <div className="flex flex-col items-center justify-center py-2 bg-surface-50 rounded-none border border-white/5">
                                    <span className="text-sm font-bold text-text-primary">{currentPage}</span>
                                    <div className="w-4 h-px bg-muted-30 my-0.5"></div>
                                    <span className="text-xs text-muted">{totalPages}</span>
                                </div>

                                <div className="h-px w-full bg-white/10 my-1"></div>

                                <div className="flex flex-col gap-2">
                                    {onPrevChapterClick && (
                                        <SidebarButton onClick={onPrevChapterClick} aria-label="К предыдущей главе">
                                            <ChevronLeftIcon className="w-6 h-6 -rotate-90" />
                                        </SidebarButton>
                                    )}
                                    {onNextChapterClick && (
                                        <SidebarButton onClick={onNextChapterClick} aria-label="К следующей главе">
                                            <ChevronLeftIcon className="w-6 h-6 rotate-90" />
                                        </SidebarButton>
                                    )}
                                </div>

                                <div className="h-px w-full bg-white/10 my-1"></div>

                                <div className="flex flex-col gap-2">
                                    <SidebarButton onClick={onChapterListClick} aria-label="Список глав">
                                        <ListIcon className="w-6 h-6" />
                                    </SidebarButton>
                                    <SidebarButton onClick={onCommentsClick} aria-label="Комментарии">
                                        <CommentIcon className="w-6 h-6" />
                                    </SidebarButton>
                                    <SidebarButton onClick={onLikeClick} aria-label="Поблагодарить">
                                        <HeartIcon className={`w-6 h-6 ${isLiked ? 'text-brand-accent' : ''}`} isFilled={isLiked} />
                                    </SidebarButton>
                                </div>

                                <div className="h-px w-full bg-white/10 my-1"></div>

                                <div className="flex flex-col gap-2">
                                    {readerType === 'scroll' && (
                                        <SidebarButton
                                            onClick={onAutoScrollToggle}
                                            aria-label={isAutoScrolling ? "Остановить прокрутку" : "Начать прокрутку"}
                                            active={isAutoScrolling}
                                        >
                                            {isAutoScrolling ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                                        </SidebarButton>
                                    )}
                                    <SidebarButton onClick={onSettingsClick} aria-label="Настройки">
                                        <SettingsIcon className="w-6 h-6" />
                                    </SidebarButton>
                                    <SidebarButton onClick={() => setReportPanelOpen(v => !v)} aria-label="Пожаловаться" active={isReportPanelOpen}>
                                        <ReportIcon className="w-6 h-6" />
                                    </SidebarButton>
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>

            {/* Mobile bottom bar */}
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        exit={{ y: 100 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="reader-bottom-bar fixed bottom-0 left-0 right-0 z-[100] md:hidden"
                    >
                        <div className="bg-base-90 backdrop-blur-xl border-t border-overlay shadow-[0_-4px_20px_rgba(0,0,0,0.3)] px-2 pb-[env(safe-area-inset-bottom)] safe-area-pb">
                            <div className="flex items-center justify-center pt-1.5 pb-0.5">
                                <span className="text-[11px] font-medium text-muted tabular-nums">{currentPage} / {totalPages}</span>
                            </div>
                            <div className="flex items-center justify-evenly py-1">
                                {readerType === 'paged' && onPrevChapterClick && (
                                    <BottomBarButton onClick={onPrevChapterClick} aria-label="Пред. глава">
                                        <ChevronLeftIcon className="w-[22px] h-[22px] -rotate-90" />
                                    </BottomBarButton>
                                )}
                                <BottomBarButton onClick={onChapterListClick} aria-label="Главы" label="Главы">
                                    <ListIcon className="w-[22px] h-[22px]" />
                                </BottomBarButton>
                                <BottomBarButton onClick={onCommentsClick} aria-label="Комментарии" label="Комм.">
                                    <CommentIcon className="w-[22px] h-[22px]" />
                                </BottomBarButton>
                                <button onClick={onLikeClick} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors ${isLiked ? 'text-brand-accent' : 'text-muted active:text-brand'}`} aria-label="Лайк">
                                    <HeartIcon className="w-[22px] h-[22px]" isFilled={isLiked} />
                                    <span className="text-[10px] leading-none">{likeCount}</span>
                                </button>
                                {readerType === 'scroll' && (
                                    <BottomBarButton
                                        onClick={onAutoScrollToggle}
                                        aria-label={isAutoScrolling ? 'Стоп' : 'Скролл'}
                                        active={isAutoScrolling}
                                        label={isAutoScrolling ? 'Стоп' : 'Скролл'}
                                    >
                                        {isAutoScrolling ? <PauseIcon className="w-[22px] h-[22px]" /> : <PlayIcon className="w-[22px] h-[22px]" />}
                                    </BottomBarButton>
                                )}
                                <div className="relative">
                                    <BottomBarButton
                                        onClick={() => setBookmarkMenuOpen((v) => !v)}
                                        aria-label="Закладка"
                                        active={isBookmarked}
                                        label="Закладка"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[22px] h-[22px]">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.5 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                        </svg>
                                    </BottomBarButton>
                                    <AnimatePresence>
                                        {isBookmarkMenuOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                                                className="absolute bottom-full right-0 mb-2 w-40 bg-surface-hover border border-overlay rounded-none shadow-xl overflow-hidden py-1"
                                            >
                                                {bookmarkStatuses.map(status => (
                                                    <button
                                                        key={status}
                                                        onClick={() => { onBookmarkStatusSelect(status); setBookmarkMenuOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-hover transition-colors ${bookmarkStatus === status ? 'text-brand-accent font-bold' : 'text-text-secondary'}`}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                                {bookmarkStatus && (
                                                    <>
                                                        <div className="h-px bg-white/10 my-1"></div>
                                                        <button
                                                            onClick={() => { onBookmarkRemove(); setBookmarkMenuOpen(false); }}
                                                            className="w-full text-left px-3 py-2 text-xs text-brand-accent hover:bg-surface-hover transition-colors"
                                                        >
                                                            Удалить
                                                        </button>
                                                    </>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <BottomBarButton onClick={onSettingsClick} aria-label="Настройки" label="Настр.">
                                    <SettingsIcon className="w-[22px] h-[22px]" />
                                </BottomBarButton>
                                {readerType === 'paged' && onNextChapterClick && (
                                    <BottomBarButton onClick={onNextChapterClick} aria-label="След. глава">
                                        <ChevronLeftIcon className="w-[22px] h-[22px] rotate-90" />
                                    </BottomBarButton>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Report modal overlay (PC) */}
            <AnimatePresence>
                {isReportPanelOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm hidden md:flex items-center justify-center"
                        onClick={() => { setReportPanelOpen(false); setReasonDropdownOpen(false); }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="w-full max-w-md bg-overlay rounded-none shadow-2xl border border-surface py-5 px-6"
                            ref={reportPanelRef}
                        >
                            <h3 className="text-base font-bold text-text-primary mb-4">Пожаловаться на главу</h3>

                            <label className="text-xs font-bold text-muted uppercase tracking-wider mb-2 block">Причина жалобы</label>
                            <div className="relative mb-4">
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
                                                    onClick={() => { setReportReason(reason.value); setReasonDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${reportReason === reason.value ? 'text-brand font-medium' : 'text-text-secondary'}`}
                                                >
                                                    {reason.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {hint && (
                                <div className="mb-4 px-3 py-2.5 bg-surface-50 rounded-lg border border-white/5">
                                    <p className="text-xs text-muted leading-relaxed">{hint}</p>
                                </div>
                            )}

                            <label className="text-xs font-bold text-muted uppercase tracking-wider mb-2 block">Сообщение</label>
                            <textarea
                                value={reportMessage}
                                onChange={(e) => setReportMessage(e.target.value)}
                                placeholder="Опишите проблему (необязательно)"
                                rows={4}
                                className="w-full px-3 py-2.5 bg-surface rounded-lg border border-overlay text-sm text-text-primary placeholder-muted resize-none focus:outline-none focus:border-brand/50 transition-colors mb-4"
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setReportPanelOpen(false); setReasonDropdownOpen(false); }}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-surface text-text-primary hover:bg-white/10 transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={handleSubmitReport}
                                    disabled={!reportReason}
                                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${reportReason ? 'bg-brand-accent text-white hover:bg-brand-accent' : 'bg-surface text-muted cursor-not-allowed'}`}
                                >
                                    Отправить жалобу
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

/** Простая стрелка вправо для кнопки свёртки */
const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
);

export default ReaderSidebar;
