import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../services/externalApiService';

const coverSrc = (url: string) => url?.startsWith('/') ? `${API_BASE}${url}` : url;


/* ═══════════════════════════════════════════════════
   SPRINGMANGA — QUIZ / ВИКТОРИНА
   "Techno-Organic Decay" style trivia
   ═══════════════════════════════════════════════════ */

type QuizMode = 'cover' | 'genre';

interface CoverQuestion {
    mode: 'cover';
    question: string;
    image_url: string;
    correct_manga_id: string;
    options: { manga_id: string; title: string }[];
}

interface GenreQuestion {
    mode: 'genre';
    question: string;
    image_url: string;
    manga_title: string;
    correct_answer: string;
    options: string[];
}

type QuizQuestion = CoverQuestion | GenreQuestion;

const QuizPage: React.FC = () => {
    const token = localStorage.getItem('backend_token');

    const [mode, setMode] = useState<QuizMode>('cover');
    const [question, setQuestion] = useState<QuizQuestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [result, setResult] = useState<{ correct: boolean; xp_gained: number } | null>(null);
    const [stats, setStats] = useState({ correct: 0, wrong: 0, streak: 0, bestStreak: 0, totalXp: 0 });
    const [started, setStarted] = useState(false);

    const fetchQuestion = useCallback(async (m?: QuizMode) => {
        const qMode = m || mode;
        setLoading(true);
        setSelected(null);
        setResult(null);
        try {
            const res = await fetch(`${API_BASE}/quiz/question?mode=${qMode}`);
            if (res.ok) {
                setQuestion(await res.json());
            }
        } catch {}
        setLoading(false);
    }, [mode]);

    const handleStart = (m: QuizMode) => {
        setMode(m);
        setStarted(true);
        setStats({ correct: 0, wrong: 0, streak: 0, bestStreak: 0, totalXp: 0 });
        fetchQuestion(m);
    };

    const handleAnswer = async (answer: string) => {
        if (selected || !question) return;
        setSelected(answer);

        let correctValue = '';
        if (question.mode === 'cover') {
            correctValue = question.correct_manga_id;
        } else {
            correctValue = question.correct_answer;
        }

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/quiz/answer`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ mode: question.mode, answer, correct: correctValue }),
            });
            if (res.ok) {
                const data = await res.json();
                setResult(data);
                setStats(prev => {
                    const newStreak = data.correct ? prev.streak + 1 : 0;
                    return {
                        correct: prev.correct + (data.correct ? 1 : 0),
                        wrong: prev.wrong + (data.correct ? 0 : 1),
                        streak: newStreak,
                        bestStreak: Math.max(prev.bestStreak, newStreak),
                        totalXp: prev.totalXp + (data.xp_gained || 0),
                    };
                });
            }
        } catch {}
    };

    const getOptionId = (opt: string | { manga_id: string; title: string }) => {
        return typeof opt === 'string' ? opt : opt.manga_id;
    };

    const getOptionLabel = (opt: string | { manga_id: string; title: string }) => {
        return typeof opt === 'string' ? opt : opt.title;
    };

    const getCorrectId = () => {
        if (!question) return '';
        return question.mode === 'cover' ? question.correct_manga_id : question.correct_answer;
    };

    // ── Lobby ──
    if (!started) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center">
                <div className="max-w-lg w-full mx-4 text-center font-mono">
                    {/* Title */}
                    <div className="mb-8">
                        <div className="text-5xl mb-4" style={{ filter: 'drop-shadow(0 0 20px rgba(169,255,0,0.2))' }}>🧩</div>
                        <h1 className="text-2xl font-bold tracking-widest uppercase mb-2" style={{ color: '#A9FF00' }}>
                            ВИКТОРИНА
                        </h1>
                        <p className="text-xs" style={{ color: 'rgba(224,224,224,0.4)' }}>
                            Проверь свои знания манги. +5 XP за каждый верный ответ.
                        </p>
                    </div>

                    {/* Mode buttons */}
                    <div className="space-y-3">
                        <button
                            onClick={() => handleStart('cover')}
                            className="w-full p-5 text-left transition-all hover:scale-[1.02]"
                            style={{
                                background: '#1A1A1A',
                                border: '1px solid #3D2B1F',
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl">🖼️</span>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: '#E0E0E0' }}>Угадай по обложке</p>
                                    <p className="text-[10px] mt-1" style={{ color: 'rgba(224,224,224,0.4)' }}>
                                        Видишь обложку — выбери правильное название манги
                                    </p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleStart('genre')}
                            className="w-full p-5 text-left transition-all hover:scale-[1.02]"
                            style={{
                                background: '#1A1A1A',
                                border: '1px solid #3D2B1F',
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl">🏷️</span>
                                <div>
                                    <p className="text-sm font-bold" style={{ color: '#E0E0E0' }}>Угадай жанр</p>
                                    <p className="text-[10px] mt-1" style={{ color: 'rgba(224,224,224,0.4)' }}>
                                        Определи правильный жанр по названию и обложке
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Game ──
    return (
        <div className="max-w-2xl mx-auto py-4 font-mono">
            {/* Header with stats */}
            <div className="flex items-center justify-between mb-6 px-2">
                <button
                    onClick={() => { setStarted(false); setQuestion(null); }}
                    className="text-xs px-3 py-1.5 transition-colors"
                    style={{ color: 'rgba(224,224,224,0.4)', border: '1px solid rgba(61,43,31,0.3)' }}
                >
                    ← Назад
                </button>

                <div className="flex items-center gap-4 text-[10px]">
                    <span style={{ color: '#A9FF00' }}>✓ {stats.correct}</span>
                    <span style={{ color: '#C0392B' }}>✗ {stats.wrong}</span>
                    <span style={{ color: '#D4A017' }}>🔥 {stats.streak}</span>
                    {stats.totalXp > 0 && <span style={{ color: '#A9FF00' }}>+{stats.totalXp} XP</span>}
                </div>
            </div>

            {/* Question area */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center py-20"
                    >
                        <div className="text-4xl mb-4 animate-pulse">🧩</div>
                        <p className="text-xs" style={{ color: 'rgba(169,255,0,0.4)' }}>Генерирую вопрос...</p>
                    </motion.div>
                ) : question ? (
                    <motion.div
                        key={question.image_url}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Question text */}
                        <p className="text-center text-sm mb-4 tracking-wider" style={{ color: 'rgba(224,224,224,0.6)' }}>
                            {question.question}
                        </p>

                        {/* Cover image */}
                        <div className="flex justify-center mb-6">
                            <div className="relative" style={{ border: '1px solid #3D2B1F' }}>
                                <img
                                    src={coverSrc(question.image_url)}
                                    alt="Quiz"
                                    className="w-48 h-72 object-cover"
                                    style={{
                                        filter: question.mode === 'cover' && !selected ? 'blur(2px) brightness(0.7)' : 'none',
                                        transition: 'filter 0.3s ease',
                                    }}
                                />
                                {question.mode === 'cover' && !selected && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-4xl" style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.8))' }}>❓</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-2 px-2">
                            {(question.mode === 'cover' ? question.options : question.options).map((opt, idx) => {
                                const optId = getOptionId(opt);
                                const label = getOptionLabel(opt);
                                const correctId = getCorrectId();
                                const isSelected = selected === optId;
                                const isCorrect = optId === correctId;
                                const isRevealed = selected !== null;

                                let bg = '#1A1A1A';
                                let border = '1px solid #3D2B1F';
                                let textColor = '#E0E0E0';

                                if (isRevealed) {
                                    if (isCorrect) {
                                        bg = 'rgba(169,255,0,0.15)';
                                        border = '1px solid rgba(169,255,0,0.5)';
                                        textColor = '#A9FF00';
                                    } else if (isSelected && !isCorrect) {
                                        bg = 'rgba(192,57,43,0.15)';
                                        border = '1px solid rgba(192,57,43,0.5)';
                                        textColor = '#C0392B';
                                    } else {
                                        textColor = 'rgba(224,224,224,0.3)';
                                    }
                                }

                                return (
                                    <button
                                        key={optId}
                                        onClick={() => handleAnswer(optId)}
                                        disabled={isRevealed}
                                        className="w-full text-left p-3.5 transition-all duration-200"
                                        style={{
                                            background: bg,
                                            border,
                                            color: textColor,
                                            cursor: isRevealed ? 'default' : 'pointer',
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold w-5 text-center"
                                                  style={{ color: isRevealed && isCorrect ? '#A9FF00' : 'rgba(224,224,224,0.3)' }}>
                                                {String.fromCharCode(65 + idx)}
                                            </span>
                                            <span className="text-sm">{label}</span>
                                            {isRevealed && isCorrect && <span className="ml-auto">✓</span>}
                                            {isRevealed && isSelected && !isCorrect && <span className="ml-auto">✗</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Result + Next */}
                        <AnimatePresence>
                            {result && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6 text-center space-y-4"
                                >
                                    <div className="text-lg font-bold"
                                         style={{ color: result.correct ? '#A9FF00' : '#C0392B' }}>
                                        {result.correct ? '✓ Верно!' : '✗ Неверно'}
                                        {result.correct && result.xp_gained > 0 && (
                                            <span className="text-sm ml-2" style={{ color: '#D4A017' }}>+{result.xp_gained} XP</span>
                                        )}
                                    </div>

                                    {stats.streak >= 3 && (
                                        <p className="text-xs" style={{ color: '#D4A017' }}>
                                            🔥 Серия правильных ответов: {stats.streak}!
                                        </p>
                                    )}

                                    <div className="flex gap-3 justify-center">
                                        <button
                                            onClick={() => fetchQuestion()}
                                            className="px-6 py-2.5 text-sm font-bold transition-all hover:scale-105"
                                            style={{
                                                background: '#A9FF00',
                                                color: '#121212',
                                            }}
                                        >
                                            Следующий →
                                        </button>

                                        {question.mode === 'cover' && selected && (
                                            <Link
                                                to={`/manga/${(question as CoverQuestion).correct_manga_id}`}
                                                className="px-4 py-2.5 text-sm transition-all"
                                                style={{
                                                    border: '1px solid rgba(169,255,0,0.3)',
                                                    color: '#A9FF00',
                                                }}
                                            >
                                                Открыть мангу
                                            </Link>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};

export default QuizPage;
