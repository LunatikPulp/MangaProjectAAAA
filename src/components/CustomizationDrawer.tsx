import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { API_BASE } from '../services/externalApiService';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface CustomizationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    user: { id: number; username: string; avatar_url?: string; role?: string };
    scrap: number;
    onSubmit?: () => void;
}

const PERS_PRICE = 5000;

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const CustomizationDrawer: React.FC<CustomizationDrawerProps> = ({
    isOpen, onClose, user: _user, scrap, onSubmit,
}) => {
    const [persFile, setPersFile] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    // Reset state when drawer opens/closes
    React.useEffect(() => {
        if (isOpen) {
            setPersFile(null);
            setPreviewUrl(null);
            setMessage(null);
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setPersFile(file);
        setMessage(null);
        if (file) {
            const reader = new FileReader();
            reader.onload = () => setPreviewUrl(reader.result as string);
            reader.readAsDataURL(file);
        } else {
            setPreviewUrl(null);
        }
    };

    const handleSubmit = async () => {
        if (!persFile) return;
        setSending(true);
        setMessage(null);
        try {
            const formData = new FormData();
            formData.append('file', persFile);
            const url = new URL(`${API_BASE}/auth/personalization/request`);
            url.searchParams.set('type', 'background');
            const res = await fetch(url.toString(), {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            if (res.ok) {
                setPersFile(null);
                setPreviewUrl(null);
                if (fileRef.current) fileRef.current.value = '';
                setMessage({ text: 'Заявка отправлена на модерацию!', type: 'success' });
                onSubmit?.();
            } else {
                const err = await res.json().catch(() => ({}));
                setMessage({ text: err.detail || 'Ошибка отправки', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Ошибка сети', type: 'error' });
        } finally {
            setSending(false);
        }
    };

    const content = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/60 z-[12000] flex items-end justify-center"
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 35 }}
                        onClick={e => e.stopPropagation()}
                        className="w-full max-w-lg bg-surface border-t border-x border-overlay max-h-[70vh] flex flex-col overflow-hidden"
                        style={{ borderRadius: '16px 16px 0 0' }}
                    >
                        {/* Drag handle + close */}
                        <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 bg-overlay rounded-full mx-auto" />
                            <button onClick={onClose} className="absolute right-4 top-3 text-muted hover:text-text-primary text-lg leading-none">✕</button>
                        </div>

                        {/* Header */}
                        <div className="px-4 pb-3 border-b border-overlay shrink-0">
                            <h3 className="text-sm font-mono font-bold text-text-primary tracking-wider">🖼️ ФОН ПРОФИЛЯ</h3>
                            <p className="text-[10px] font-mono text-muted mt-1">
                                Загрузите изображение для полноэкранного фона вашего профиля
                            </p>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                            {/* Preview */}
                            {previewUrl && (
                                <div className="relative aspect-video w-full border border-overlay overflow-hidden bg-base">
                                    <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                    <span className="absolute bottom-2 left-2 text-[9px] font-mono text-white/80 bg-black/40 px-2 py-0.5">ПРЕВЬЮ</span>
                                </div>
                            )}

                            {/* File input */}
                            <div>
                                <label className="text-xs font-mono text-muted block mb-1.5">Изображение (.jpg, .png, .gif, .webp)</label>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.gif,.webp"
                                    onChange={handleFileChange}
                                    className="w-full bg-base border border-overlay p-3 text-sm text-text-primary font-mono file:mr-3 file:px-3 file:py-1 file:text-xs file:font-mono file:bg-surface file:border file:border-overlay file:text-text-secondary file:cursor-pointer"
                                />
                                {persFile && (
                                    <p className="text-[10px] font-mono text-muted mt-1">{persFile.name} ({(persFile.size / 1024).toFixed(0)} KB)</p>
                                )}
                            </div>

                            {/* Price info */}
                            <div className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20">
                                <span className="text-xs font-mono text-muted">Стоимость:</span>
                                <span className="text-sm font-mono font-bold text-yellow-400">{PERS_PRICE} Scrap⚡</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-base border border-overlay">
                                <span className="text-xs font-mono text-muted">Ваш баланс:</span>
                                <span className={`text-sm font-mono font-bold ${scrap >= PERS_PRICE ? 'text-green-400' : 'text-red-400'}`}>
                                    {scrap}⚡
                                </span>
                            </div>

                            {/* Refund warning */}
                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-[10px] font-mono text-yellow-400/80">
                                ⏳ Возврат Scrap возможен в течение 10 мин после отправки заявки
                            </div>

                            {/* Message */}
                            {message && (
                                <div className={`p-3 text-xs font-mono font-bold ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}
                        </div>

                        {/* Action button */}
                        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-overlay">
                            <button
                                onClick={handleSubmit}
                                disabled={sending || !persFile || scrap < PERS_PRICE}
                                className="w-full py-2.5 text-sm font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 disabled:opacity-40 transition-all active:scale-[0.98]"
                            >
                                {sending ? 'ОТПРАВКА...' : `ОТПРАВИТЬ ЗА ${PERS_PRICE} ⚡`}
                            </button>
                            {scrap < PERS_PRICE && (
                                <p className="text-[10px] font-mono text-red-400 mt-1.5 text-center">
                                    Недостаточно Scrap (нужно {PERS_PRICE}, у вас {scrap})
                                </p>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default CustomizationDrawer;
