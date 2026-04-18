import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface ErrorConfig {
  code: number;
  title: string;
  subtitle: string;
  message: string;
  glitchText: string;
  accent: string;
  accentGlow: string;
  icon: string;
}

const ERROR_CONFIGS: Record<number, ErrorConfig> = {
  503: {
    code: 503,
    title: 'SERVICE UNAVAILABLE',
    subtitle: 'РЕЖИМ ТЕХНИЧЕСКОГО ОБСЛУЖИВАНИЯ',
    message: 'Система временно недоступна. Проводятся плановые работы. Спрингтрап уже чинит провода.',
    glitchText: 'SPRINGLOCK_FAILURE',
    accent: '#7a1616',
    accentGlow: 'rgba(122, 22, 22, 0.5)',
    icon: '🔧',
  },
  404: {
    code: 404,
    title: 'NOT FOUND',
    subtitle: 'ОБЪЕКТ НЕ НАЙДЕН',
    message: 'Запрашиваемая зона не обнаружена в системе наблюдения. Возможно, она была перемещена или удалена.',
    glitchText: 'CAMERA_OFFLINE',
    accent: '#9b8c3b',
    accentGlow: 'rgba(155, 140, 59, 0.4)',
    icon: '📹',
  },
  403: {
    code: 403,
    title: 'FORBIDDEN',
    subtitle: 'ДОСТУП ЗАПРЕЩЁН',
    message: 'Уровень допуска недостаточен. Спринглок-протокол активирован. Обратитесь к администратору.',
    glitchText: 'SPRINGLOCK_ENGAGED',
    accent: '#7a1616',
    accentGlow: 'rgba(122, 22, 22, 0.5)',
    icon: '🔒',
  },
  500: {
    code: 500,
    title: 'INTERNAL ERROR',
    subtitle: 'КРИТИЧЕСКИЙ СБОЙ СИСТЕМЫ',
    message: 'Неустранимая ошибка в модуле обработки. Аниматроник вышел из-под контроля. Инженеры уже в пути.',
    glitchText: 'FATAL_EXCEPTION',
    accent: '#7a1616',
    accentGlow: 'rgba(122, 22, 22, 0.5)',
    icon: '💀',
  },
  401: {
    code: 401,
    title: 'UNAUTHORIZED',
    subtitle: 'ТРЕБУЕТСЯ АУТЕНТИФИКАЦИЯ',
    message: 'Идентификация не пройдена. Введите учётные данные для доступа к терминалу.',
    glitchText: 'AUTH_REQUIRED',
    accent: '#5a6638',
    accentGlow: 'rgba(90, 102, 56, 0.4)',
    icon: '🔐',
  },
};

interface SpringOSErrorPageProps {
  errorCode: number;
  customMessage?: string;
}

const SpringOSErrorPage: React.FC<SpringOSErrorPageProps> = ({ errorCode, customMessage }) => {
  const config = ERROR_CONFIGS[errorCode] || ERROR_CONFIGS[500];
  const [scanProgress, setScanProgress] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [flickerState, setFlickerState] = useState(true);

  useEffect(() => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => setShowContent(true), 300);
      }
      setScanProgress(progress);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const flicker = setInterval(() => {
      setFlickerState(prev => !prev);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(flicker);
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center springos-crt springos-vignette"
      style={{ background: '#11100F', padding: '20px' }}
    >
      <div
        className={`w-full max-w-2xl transition-opacity duration-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 py-2 mb-0"
          style={{
            background: '#181410',
            borderBottom: `2px solid ${config.accent}`,
          }}
        >
          <div className="font-code text-[10px]" style={{ color: '#5a5040' }}>
            SPRINGOS TERMINAL v3.0
          </div>
          <div className="font-code text-[10px]" style={{ color: config.accent }}>
            PID::{Math.floor(Math.random() * 9999)}
          </div>
        </div>

        {/* Main content */}
        <div
          className="springos-metal-frame springos-rust-dots"
          style={{ borderTop: 'none' }}
        >
          <div className="relative z-10 p-6 md:p-8">
            {/* Error code - huge */}
            <div className="text-center mb-6">
              <div
                className="font-terminal leading-none text-[80px] md:text-[120px]"
                style={{
                  color: config.accent,
                  textShadow: `0 0 30px ${config.accentGlow}, 0 0 60px ${config.accentGlow.replace('0.5', '0.2').replace('0.4', '0.15')}`,
                  animation: errorCode === 503 ? 'springosBloodPulse 1.5s ease-in-out infinite' : 'none',
                }}
              >
                {config.code}
              </div>
              <div
                className="font-terminal text-[20px] md:text-[28px] tracking-[4px] md:tracking-[6px] mt-2"
                style={{ color: config.accent }}
              >
                {config.title}
              </div>
            </div>

            {/* Scanline separator */}
            <div className="relative my-4" style={{ height: 2 }}>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, transparent, ${config.accent}, transparent)`,
                  opacity: 0.4,
                }}
              />
              <div
                className="absolute top-0 h-full"
                style={{
                  width: `${scanProgress}%`,
                  background: config.accent,
                  boxShadow: `0 0 8px ${config.accentGlow}`,
                  transition: 'width 0.1s linear',
                }}
              />
            </div>

            {/* Glitch text */}
            <div className="text-center mb-4">
              <span
                className="font-code text-[14px] md:text-[16px] tracking-[4px]"
                style={{
                  color: config.accent,
                  opacity: flickerState ? 1 : 0.4,
                  transition: 'opacity 0.1s',
                  textShadow: `0 0 6px ${config.accentGlow}`,
                }}
              >
                {'>'} {config.glitchText} <span className="springos-cursor" />
              </span>
            </div>

            {/* Subtitle */}
            <div
              className="font-terminal text-[18px] md:text-[22px] tracking-[2px] md:tracking-[3px] text-center mb-3"
              style={{ color: '#d4c8b0' }}
            >
              {config.icon} {config.subtitle}
            </div>

            {/* Message */}
            <div
              className="font-code text-[12px] md:text-[13px] text-center max-w-md mx-auto mb-6"
              style={{ color: '#9a9080', lineHeight: 1.6 }}
            >
              {customMessage || config.message}
            </div>

            {/* Terminal dump */}
            <div
              className="p-3 rounded mb-6 font-code text-[11px]"
              style={{
                background: '#0a0a08',
                border: '1px solid #1e1a16',
              }}
            >
              <div style={{ color: '#5a5040' }}>
                [{' '}
                <span style={{ color: config.accent }}>{new Date().toISOString()}</span>{' '}
                ]{' '}
                <span style={{ color: '#7a1616' }}>ERR</span>{' '}
                {config.glitchText}::{config.code}
              </div>
              <div style={{ color: '#5a5040' }}>
                [{' '}
                <span style={{ color: config.accent }}>{new Date().toISOString()}</span>{' '}
                ]{' '}
                <span style={{ color: '#5a6638' }}>SYS</span>{' '}
                Перезапуск модуля через 30с...
              </div>
              <div style={{ color: '#5a5040' }}>
                [{' '}
                <span style={{ color: config.accent }}>{new Date().toISOString()}</span>{' '}
                ]{' '}
                <span style={{ color: '#5a6638' }}>SYS</span>{' '}
                Afton Robotics Inc. — Все права защищены
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3 flex-wrap">
              <Link
                to="/"
                className="springos-btn springos-btn-glow text-[15px] springos-glitch-hover no-underline"
              >
                НА ГЛАВНУЮ
              </Link>
              {errorCode === 401 && (
                <Link
                  to="/login"
                  className="springos-btn springos-btn-primary text-[15px] no-underline"
                >
                  ВОЙТИ В СИСТЕМУ
                </Link>
              )}
              <button
                className="springos-btn text-[15px]"
                onClick={() => window.location.reload()}
              >
                ПЕРЕЗАГРУЗИТЬ
              </button>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center">
              <div className="font-code text-[10px] md:text-[11px]" style={{ color: '#5a5040' }}>
                SPRINGOS ERROR HANDLER v3.0 — AFTON ROBOTICS INC.
              </div>
              <div className="font-code text-[10px] md:text-[11px] mt-0.5" style={{ color: '#5a5040' }}>
                СПРИНГЛОК-ПРОТОКОЛ АКТИВЕН — ЛИЦЕНЗИЯ: FREDDY_FAZBEAR_INC
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-4 py-1.5"
          style={{
            background: '#181410',
            borderTop: `1px solid ${config.accent}40`,
          }}
        >
          <span className="font-code text-[9px] md:text-[10px]" style={{ color: '#5a5040' }}>
            ERR::{config.code}
          </span>
          <span className="font-code text-[9px] md:text-[10px]" style={{ color: '#5a5040' }}>
            AFTON ROBOTICS — ПАНЕЛЬ ОБСЛУЖИВАНИЯ
          </span>
        </div>
      </div>
    </div>
  );
};

export default SpringOSErrorPage;
