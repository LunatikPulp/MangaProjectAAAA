import React, { useEffect, useRef, useState, useCallback, useContext } from 'react';
import './SpringtrapNightmare.css';
import { API_BASE } from '../services/externalApiService';
import { ToasterContext } from '../contexts/ToasterContext';

const SpringtrapNightmare: React.FC = () => {
  const { showToaster } = useContext(ToasterContext);
  const [isNightmareActive, setIsNightmareActive] = useState(false);
  const [showRebootBtn, setShowRebootBtn] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clicksBlockedRef = useRef(false);
  const clickCountRef = useRef(0);
  const nightmareActiveRef = useRef(false);
  const seeYouAudioRef = useRef<HTMLAudioElement | null>(null);
  const comeBackAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    nightmareActiveRef.current = isNightmareActive;
    if (!isNightmareActive) return;
    const tick = () => setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isNightmareActive]);

  const isReaderPage = useCallback(() => {
    return window.location.hash.includes('/chapter/');
  }, []);

  useEffect(() => {
    const seeYouAudio = new Audio('/Horror_design/i-see-you-fnaf-springtrap.mp3');
    const comeBackAudio = new Audio('/Horror_design/ialwayscomeback.mp3');
    seeYouAudio.volume = 1.0;
    comeBackAudio.volume = 1.0;
    seeYouAudioRef.current = seeYouAudio;
    comeBackAudioRef.current = comeBackAudio;

    // 3-click avatar trigger
    const handleAvatarClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.spring-avatar') || clicksBlockedRef.current) return;
      if (localStorage.getItem('nightmare_disabled') === 'true') return;

      clickCountRef.current += 1;
      const newCount = clickCountRef.current;

      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 2000);

      if (newCount <= 2) {
        target.closest('.spring-avatar')?.classList.add('spring-glitch-avatar');
        setTimeout(() => {
          target.closest('.spring-avatar')?.classList.remove('spring-glitch-avatar');
        }, 600);
      }

      if (newCount === 3) {
        clicksBlockedRef.current = true;
        clickCountRef.current = 0;
        startVideoSequence();
      }
    };

    // "I see you" sound on specific element clicks (only in nightmare mode)
    const playSeeYou = () => {
      if (seeYouAudioRef.current) {
        seeYouAudioRef.current.currentTime = 0;
        seeYouAudioRef.current.play().catch(() => {});
      }
    };

    const handleNightmareClicks = (e: MouseEvent) => {
      if (!nightmareActiveRef.current) return;
      const target = e.target as HTMLElement;

      // Profile page avatar (.spring-avatar)
      if (target.closest('.spring-avatar')) {
        playSeeYou();
        return;
      }

      // Desktop logo
      if (target.closest('[data-spring-logo]')) {
        playSeeYou();
        return;
      }

      // Mobile bottom bar logo (NavLink inside fixed nav)
      const mobileNav = target.closest('nav.fixed');
      if (mobileNav && target.closest('a')) {
        const link = target.closest('a');
        // The logo link doesn't have a label, it's the center one with just the logo image
        if (link && !link.querySelector('span')) {
          playSeeYou();
          return;
        }
      }

      // Profile avatar button in header (desktop)
      if (target.closest('button[aria-label="Меню профиля"]')) {
        playSeeYou();
        return;
      }

      // Mobile menu avatar area (.spring-rust contains the avatar in mobile sheet)
      if (target.closest('.spring-rust')) {
        playSeeYou();
        return;
      }
    };

    document.addEventListener('click', handleAvatarClick);
    document.addEventListener('click', handleNightmareClicks);

    return () => {
      document.removeEventListener('click', handleAvatarClick);
      document.removeEventListener('click', handleNightmareClicks);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);


  const startVideoSequence = () => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    setShowVideo(true);
  };

  const handleVideoEnded = () => {
    setShowVideo(false);
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    activateNightmareMode();
  };

  const insertVideoBackground = () => {
    // Don't recreate if already exists — destroying kills playback
    if (document.getElementById('nightmare-video-bg')) return;

    const videoBg = document.createElement('div');
    videoBg.id = 'nightmare-video-bg';
    videoBg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;overflow:hidden;pointer-events:none;';
    videoBg.innerHTML = `
      <video src="/Horror_design/springmanga_background.mp4" autoplay loop muted playsinline preload="auto" poster="/Horror_design/scratches.png" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.5s ease;"></video>
      <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(18,18,18,0.72);pointer-events:none;"></div>
    `;
    document.body.insertBefore(videoBg, document.body.firstChild);
    const videoEl = videoBg.querySelector('video') as HTMLVideoElement | null;
    if (videoEl) {
      const showVideo = () => { videoEl.style.opacity = '1'; };
      // Explicitly call play() — mobile browsers ignore autoplay attribute on innerHTML-injected videos
      videoEl.play().then(showVideo).catch(() => {
        // Retry after a short delay (mobile may need a moment)
        setTimeout(() => { videoEl.play().then(showVideo).catch(() => showVideo()); }, 500);
      });
      // Also listen for canplay as backup
      videoEl.addEventListener('canplay', () => {
        videoEl.play().catch(() => {});
        showVideo();
      }, { once: true });
    }
  };

  const removeVideoBackground = () => {
    const vid = document.getElementById('nightmare-video-bg');
    if (vid) vid.remove();
  };

  const makeBackgroundTransparent = () => {
    const root = document.getElementById('root');
    document.body.style.backgroundColor = 'transparent';
    document.body.style.position = 'relative';
    if (root) {
      root.style.backgroundColor = 'transparent';
      root.style.position = 'relative';
      root.style.zIndex = '1';
    }
  };

  const activateNightmareMode = (isRestore = false) => {
    setIsNightmareActive(true);
    setShowRebootBtn(true);

    // Persist so horror mode survives F5 (sessionStorage clears on tab close)
    sessionStorage.setItem('nightmare_active', 'true');

    // Mark horror mode as discovered for settings toggle
    localStorage.setItem('nightmare_discovered', 'true');

    // Unlock horror_discoverer achievement — only on first activation, not restore
    if (!isRestore) {
      fetch(`${API_BASE}/auth/unlock-achievement?achievement_id=horror_discoverer`, {
        method: 'POST',
        credentials: 'include',
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            showToaster('🎃 СЕКРЕТНАЯ АЧИВКА РАЗБЛОКИРОВАНА: Кошмарный исследователь!');
            window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail: 'horror_discoverer' }));
          }
        })
        .catch(() => {});
    }

    document.documentElement.classList.add('springtrap-nightmare-active');

    // Make body/root transparent so video background shows through (like ProfilePage does)
    makeBackgroundTransparent();

    // Insert video background into body (before #root) so it shows on all pages
    if (!isReaderPage()) {
      insertVideoBackground();
    }

    const replaceNavText = () => {
      const navLinks = document.querySelectorAll('header nav a');
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === '/catalog') {
          link.textContent = '[ СИСТЕМА ОХРАНЫ ]';
        } else if (href === '/tops') {
          link.textContent = '[ БАЗА ДАННЫХ ]';
        } else if (href === '/history') {
          link.textContent = '[ ОШИБКА 1983 ]';
        } else if (href === '/quiz') {
          link.textContent = '[ ПРОТОКОЛ ]';
        } else if (href === '/cards') {
          link.textContent = '[ АРХИВ ]';
        }
      });

      // Keep background transparent on navigation (React may re-render and re-add bg-base)
      makeBackgroundTransparent();
    };

    replaceNavText();
    const intervalId = setInterval(replaceNavText, 100);
    (window as any).__navInterval = intervalId;

  };

  // Restore horror mode from sessionStorage on mount (persists across F5, clears on tab close)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (sessionStorage.getItem('nightmare_active') === 'true') {
      activateNightmareMode(true);
    }
  }, []);

  // Manage video background reactively based on nightmare state + route
  useEffect(() => {
    if (!isNightmareActive) return;

    const syncVideo = () => {
      if (isReaderPage()) {
        removeVideoBackground();
        document.documentElement.classList.add('springtrap-reader-page');
      } else {
        document.documentElement.classList.remove('springtrap-reader-page');
        insertVideoBackground();
        makeBackgroundTransparent();
      }
    };

    syncVideo();

    // Re-check on SPA navigation (hash changes)
    window.addEventListener('hashchange', syncVideo);
    window.addEventListener('popstate', syncVideo);

    return () => {
      window.removeEventListener('hashchange', syncVideo);
      window.removeEventListener('popstate', syncVideo);
    };
  }, [isNightmareActive]);

  const exitNightmareMode = () => {
    const cleanup = () => {
      sessionStorage.removeItem('nightmare_active');
      setIsNightmareActive(false);
      setShowRebootBtn(false);
      removeVideoBackground();
      clicksBlockedRef.current = false;

      // Restore styles
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.backgroundColor = '';
      document.body.style.position = '';
      const root = document.getElementById('root');
      if (root) {
        root.style.backgroundColor = '';
        root.style.position = '';
        root.style.zIndex = '';
      }

      document.documentElement.classList.remove('springtrap-nightmare-active');
      document.documentElement.classList.remove('springtrap-reader-page');
      document.body.classList.remove('tv-shutdown');
    };

    // Start TV shutdown animation
    document.body.classList.add('tv-shutdown');

    // Stop nav replacement loop
    if ((window as any).__navInterval) {
      clearInterval((window as any).__navInterval);
      delete (window as any).__navInterval;
    }

    // Play exit sound and wait for it to finish before cleanup
    const audio = comeBackAudioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        audio.addEventListener('ended', cleanup, { once: true });
      }).catch(() => {
        // If audio fails to play, cleanup after fallback delay
        setTimeout(cleanup, 2000);
      });
    } else {
      setTimeout(cleanup, 2000);
    }
  };

  return (
    <>
      {/* Fullscreen I_AM.mp4 Video */}
      {showVideo && (
        <div className="fnaf-video-fullscreen-overlay">
          <video
            ref={videoRef}
            className="fnaf-video-fullscreen"
            src="/Horror_design/I_AM.mp4"
            autoPlay
            playsInline
            onEnded={handleVideoEnded}
            onCanPlay={() => {
              if (videoRef.current) {
                videoRef.current.volume = 1.0;
              }
            }}
          />
        </div>
      )}

      {/* Nightmare Mode */}
      {isNightmareActive && (
        <>
          {/* Camera HUD */}
          <div className="fnaf-camera-hud">
            <div className="fnaf-rec-indicator">
              <span className="fnaf-rec-dot">●</span> REC
            </div>
            <div className="fnaf-cam-label">CAM 08</div>
            <div className="fnaf-timestamp">
              {currentTime}
            </div>
            <div className="fnaf-scanlines" />
            <div className="fnaf-vhs-noise" />
          </div>

          {/* Phantom Springtrap — поверх всех элементов */}
          <div className="phantom-springtrap" />

          {/* Reboot Button — hidden on reader page */}
          {showRebootBtn && !isReaderPage() && (
            <button className="fnaf-reboot-btn" onClick={exitNightmareMode}>
              <span className="fnaf-reboot-bracket">[</span>
              {' '}REBOOT SYSTEM{' '}
              <span className="fnaf-reboot-bracket">]</span>
            </button>
          )}
        </>
      )}
    </>
  );
};

export default SpringtrapNightmare;
