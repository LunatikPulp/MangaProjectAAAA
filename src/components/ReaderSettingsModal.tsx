import React, { useState } from 'react';
import Modal from './Modal';
import { motion } from 'framer-motion';

export interface HotkeyBindings {
    nextChapter: string;
    prevChapter: string;
    nextPage: string;
    prevPage: string;
    widthUp: string;
    widthDown: string;
}

export const defaultHotkeys: HotkeyBindings = {
    nextChapter: 'Period',
    prevChapter: 'Comma',
    nextPage: 'ArrowRight',
    prevPage: 'ArrowLeft',
    widthUp: 'Equal',
    widthDown: 'Minus',
};

const hotkeyLabels: Record<keyof HotkeyBindings, string> = {
    nextChapter: 'Следующая глава',
    prevChapter: 'Предыдущая глава',
    nextPage: 'Следующая страница',
    prevPage: 'Предыдущая страница',
    widthUp: 'Увеличить ширину',
    widthDown: 'Уменьшить ширину',
};

const keyDisplayName = (code: string): string => {
    const map: Record<string, string> = {
        ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
        Period: '.', Comma: ',', Equal: '=', Minus: '-',
        Space: 'Пробел', Enter: 'Enter', Escape: 'Esc',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
};

export interface ReaderSettings {
    readerType: 'paged' | 'scroll';
    containerWidth: number;
    imageServer: 'main' | 'backup';
    autoLoadNextChapter: boolean;
    showNotes: boolean;
    showPageIndicator: boolean;
    brightness: number;
    imageFit: 'width' | 'height';
    imageUpscale: 'none' | 'auto';
    clickZone: 'page' | 'anywhere';
    imageGap: number;
    autoScrollSpeed: number;
    hotkeys: HotkeyBindings;
}

interface ReaderSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: ReaderSettings;
    onSettingsChange: (newSettings: ReaderSettings) => void;
}

const Toggle: React.FC<{ label: string; enabled: boolean; onChange: (enabled: boolean) => void; }> = ({ label, enabled, onChange }) => (
    <div className="flex items-center justify-between py-3 px-2 rounded-lg hover:bg-white/5 transition-colors">
        <span className="text-text-primary text-sm font-medium">{label}</span>
        <button
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-50 ${enabled ? 'bg-brand' : 'bg-surface border border-white/10'}`}
            aria-checked={enabled}
            role="switch"
        >
            <motion.span
                layout
                className={`inline-block w-4 h-4 transform bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
            />
        </button>
    </div>
);

const SettingButton: React.FC<{ label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }> = ({ label, active, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
            active
            ? 'bg-brand text-white shadow-lg shadow-brand-20'
            : 'bg-transparent text-muted hover:text-text-primary hover:bg-white/5'
        }`}
    >
        {icon}
        {label}
    </button>
);

const RangeSlider: React.FC<{ value: number; min: number; max: number; onChange: (val: number) => void }> = ({ value, min, max, onChange }) => (
    <div className="relative w-full h-6 flex items-center">
        <div className="absolute w-full h-1.5 bg-surface rounded-full overflow-hidden">
            <div
                className="h-full bg-brand"
                style={{ width: `${((value - min) / (max - min)) * 100}%` }}
            />
        </div>
        <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div
            className="absolute w-4 h-4 bg-white rounded-full shadow-md border-2 border-brand pointer-events-none transition-transform active:scale-110"
            style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 8px)` }}
        />
    </div>
);

const MenuLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="w-full flex items-center justify-between py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
    >
        <span className="text-text-primary text-sm font-medium">{label}</span>
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
    </button>
);

type SubmenuView = 'main' | 'image' | 'hotkeys' | 'scroll';

const ReaderSettingsModal: React.FC<ReaderSettingsModalProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
    const [view, setView] = useState<SubmenuView>('main');

    const handleSettingChange = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    const handleClose = () => {
        setView('main');
        onClose();
    };

    const backButton = (
        <button onClick={() => setView('main')} className="flex items-center gap-1 text-muted hover:text-text-primary transition-colors text-sm mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Назад
        </button>
    );

    const renderImageSettings = () => (
        <div className="space-y-6">
            {backButton}
            <div>
                <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Яркость</label>
                    <span className="text-sm font-bold text-brand">{settings.brightness}%</span>
                </div>
                <div className="px-1">
                    <RangeSlider min={0} max={100} value={settings.brightness} onChange={(val) => handleSettingChange('brightness', val)} />
                </div>
                <div className="flex justify-between mt-2 px-1 text-xs text-muted">
                    <span>0%</span>
                    <span>100%</span>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block px-1">Вмещать изображение</label>
                <div className="flex bg-surface p-1 rounded-xl border border-white/5">
                    <SettingButton label="По ширине" active={settings.imageFit === 'width'} onClick={() => handleSettingChange('imageFit', 'width')} />
                    <SettingButton label="По высоте" active={settings.imageFit === 'height'} onClick={() => handleSettingChange('imageFit', 'height')} />
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block px-1">Увеличение изображений</label>
                <div className="flex bg-surface p-1 rounded-xl border border-white/5">
                    <SettingButton label="Не увеличивать" active={settings.imageUpscale === 'none'} onClick={() => handleSettingChange('imageUpscale', 'none')} />
                    <SettingButton label="Авто" active={settings.imageUpscale === 'auto'} onClick={() => handleSettingChange('imageUpscale', 'auto')} />
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block px-1">Зона нажатия</label>
                <div className="flex bg-surface p-1 rounded-xl border border-white/5">
                    <SettingButton label="Страница" active={settings.clickZone === 'page'} onClick={() => handleSettingChange('clickZone', 'page')} />
                    <SettingButton label="Везде" active={settings.clickZone === 'anywhere'} onClick={() => handleSettingChange('clickZone', 'anywhere')} />
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Отступ между картинками</label>
                    <span className="text-sm font-bold text-brand">{settings.imageGap}px</span>
                </div>
                <div className="px-1">
                    <RangeSlider min={0} max={50} value={settings.imageGap} onChange={(val) => handleSettingChange('imageGap', val)} />
                </div>
                <div className="flex justify-between mt-2 px-1 text-xs text-muted">
                    <span>0px</span>
                    <span>50px</span>
                </div>
            </div>
        </div>
    );

    const [rebindingKey, setRebindingKey] = useState<keyof HotkeyBindings | null>(null);

    React.useEffect(() => {
        if (!rebindingKey) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const hotkeys = { ...(settings.hotkeys ?? defaultHotkeys), [rebindingKey]: e.code };
            onSettingsChange({ ...settings, hotkeys });
            setRebindingKey(null);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [rebindingKey, settings, onSettingsChange]);

    const renderScrollSettings = () => {
        const speed = settings.autoScrollSpeed ?? 2;
        return (
            <div className="space-y-6">
                {backButton}
                <div>
                    <div className="flex justify-between items-center mb-3 px-1">
                        <label className="text-xs font-bold text-muted uppercase tracking-wider">Скорость автоскролла</label>
                        <span className="text-sm font-bold text-brand">{speed}</span>
                    </div>
                    <div className="px-1">
                        <RangeSlider min={1} max={10} value={speed} onChange={(val) => handleSettingChange('autoScrollSpeed', val)} />
                    </div>
                    <div className="flex justify-between mt-2 px-1 text-xs text-muted">
                        <span>1 (медленно)</span>
                        <span>10 (быстро)</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderHotkeySettings = () => {
        const hotkeys = settings.hotkeys ?? defaultHotkeys;
        return (
            <div className="space-y-4">
                {backButton}
                <p className="text-xs text-muted px-1">Нажмите на кнопку, затем нажмите нужную клавишу.</p>
                {(Object.keys(hotkeyLabels) as (keyof HotkeyBindings)[]).map((action) => (
                    <div key={action} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5 transition-colors">
                        <span className="text-text-primary text-sm font-medium">{hotkeyLabels[action]}</span>
                        <button
                            onClick={() => setRebindingKey(action)}
                            className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors min-w-[60px] text-center ${
                                rebindingKey === action
                                    ? 'bg-brand text-white border-brand animate-pulse'
                                    : 'bg-surface border-white/10 text-text-primary hover:border-brand'
                            }`}
                        >
                            {rebindingKey === action ? '...' : keyDisplayName(hotkeys[action])}
                        </button>
                    </div>
                ))}
                <button
                    onClick={() => onSettingsChange({ ...settings, hotkeys: { ...defaultHotkeys } })}
                    className="w-full mt-2 py-2 text-xs text-muted hover:text-text-primary transition-colors"
                >
                    Сбросить по умолчанию
                </button>
            </div>
        );
    };

    const renderMainMenu = () => (
        <div className="space-y-6">
            <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block px-1">Режим чтения</label>
                <div className="flex bg-surface p-1 rounded-xl border border-white/5">
                    <SettingButton
                        label="Постранично"
                        active={settings.readerType === 'paged'}
                        onClick={() => handleSettingChange('readerType', 'paged')}
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        }
                    />
                    <SettingButton
                        label="Лента"
                        active={settings.readerType === 'scroll'}
                        onClick={() => handleSettingChange('readerType', 'scroll')}
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                            </svg>
                        }
                    />
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center mb-3 px-1">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Ширина страницы</label>
                    <span className="text-sm font-bold text-brand">{settings.containerWidth}%</span>
                </div>
                <div className="px-1">
                    <RangeSlider
                        min={10}
                        max={100}
                        value={settings.containerWidth}
                        onChange={(val) => handleSettingChange('containerWidth', val)}
                    />
                </div>
                <div className="flex justify-between mt-2 px-1 text-xs text-muted">
                    <span>10%</span>
                    <span>100% (авто)</span>
                </div>
            </div>

             <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider mb-3 block px-1">Сервер изображений</label>
                <div className="flex bg-surface p-1 rounded-xl border border-white/5">
                    <SettingButton label="Основной" active={settings.imageServer === 'main'} onClick={() => handleSettingChange('imageServer', 'main')} />
                    <SettingButton label="Запасной" active={settings.imageServer === 'backup'} onClick={() => handleSettingChange('imageServer', 'backup')} />
                </div>
                <p className="text-[10px] text-muted mt-2 px-1">
                    Используйте запасной сервер, если изображения не грузятся.
                </p>
             </div>

             <div className="border-t border-surface-50 pt-4 mt-4">
                <Toggle label="Авто-переход к следующей главе" enabled={settings.autoLoadNextChapter} onChange={(val) => handleSettingChange('autoLoadNextChapter', val)} />
                <Toggle label="Показывать заметки переводчиков" enabled={settings.showNotes} onChange={(val) => handleSettingChange('showNotes', val)} />
                <Toggle label="Индикатор страницы" enabled={settings.showPageIndicator} onChange={(val) => handleSettingChange('showPageIndicator', val)} />
             </div>

             <div className="border-t border-surface-50 pt-4 mt-4">
                <MenuLink label="Настройка изображения" onClick={() => setView('image')} />
                <MenuLink label="Настройка горячих клавиш" onClick={() => setView('hotkeys')} />
                <MenuLink label="Настройка скролла" onClick={() => setView('scroll')} />
             </div>
        </div>
    );

    const getTitle = () => {
        switch (view) {
            case 'image': return 'Настройка изображения';
            case 'hotkeys': return 'Горячие клавиши';
            case 'scroll': return 'Настройка скролла';
            default: return 'Настройки читалки';
        }
    };

    return (
        <Modal placement="right" offsetRightPx={84} isOpen={isOpen} onClose={handleClose} title={getTitle()} confirmText="Готово" onConfirm={handleClose}>
            {view === 'main' && renderMainMenu()}
            {view === 'image' && renderImageSettings()}
            {view === 'hotkeys' && renderHotkeySettings()}
            {view === 'scroll' && renderScrollSettings()}
        </Modal>
    );
};

export default ReaderSettingsModal;
