import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SpringSidebar from './SpringSidebar';
import '../../styles/springos.css';

// Simple icons
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconRec = () => (
  <span 
    style={{ 
      width: '8px', 
      height: '8px', 
      background: '#b45858', 
      borderRadius: '50%',
      boxShadow: '0 0 8px rgba(180, 88, 88, 0.6)',
      display: 'inline-block',
      animation: 'pulse 2s infinite'
    }} 
  />
);

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bootDone, setBoot] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBoot(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [children]);

  return (
    <div className="fixed inset-0 flex springos-crt springos-flicker springos-vignette" style={{ background: '#12100e' }}>
      {/* Boot sequence - simplified */}
      {!bootDone && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: '#0e0c0a' }}
        >
          <div className="text-center">
            <div className="font-mono text-sm tracking-widest mb-4 flex items-center justify-center gap-3" style={{ color: '#c4b454' }}>
              <span style={{ width: '8px', height: '8px', background: '#c4b454', borderRadius: '50%', boxShadow: '0 0 10px #c4b454' }} />
              AFTON ROBOTICS INC.
            </div>
            <div className="font-mono text-xs mb-6" style={{ color: '#7a7570' }}>
              Инициализация системы...
            </div>
            <div style={{ width: 200, margin: '0 auto' }}>
              <div className="sp-progress" style={{ height: '3px' }}>
                <div className="sp-progress-bar success" style={{ width: '100%', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <SpringSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[9999] md:hidden"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="relative h-full"
            style={{ width: 260 }}
            onClick={e => e.stopPropagation()}
          >
            <SpringSidebar />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto springos-scroll relative" style={{ background: '#12100e' }}>
        {/* Subtle scanline */}
        <div
          className="fixed pointer-events-none z-[9996]"
          style={{
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(196, 180, 84, 0.03), transparent)',
            animation: 'springosHBar 12s linear infinite',
          }}
        />

        <div className="p-5 md:p-6 min-h-full relative pt-0 md:pt-6">
          {/* Top bar */}
          <div
            className="sticky top-0 z-50 flex items-center justify-between py-3 md:py-0 mb-6 md:mb-0"
            style={{ background: '#12100e' }}
          >
            <div className="flex items-center gap-3">
              <button
                className="md:hidden sp-btn flex items-center gap-2"
                onClick={() => setMobileMenuOpen(true)}
                style={{ padding: '8px 12px' }}
              >
                <IconMenu />
              </button>
              <Link to="/" className="md:hidden sp-btn flex items-center gap-2 text-xs no-underline" style={{ padding: '8px 12px' }}>
                <IconArrowLeft />
                <span>На сайт</span>
              </Link>
            </div>

            <div className="md:fixed md:top-5 md:right-6 z-[100] flex items-center gap-3">
              <span className="font-mono text-xs tracking-wider flex items-center gap-2" style={{ color: '#7a7570' }}>
                <IconRec />
                REC
              </span>
              <span className="font-mono text-xs px-2 py-1 rounded" style={{ color: '#7ab45a', background: 'rgba(90, 138, 58, 0.1)', border: '1px solid rgba(90, 138, 58, 0.2)' }}>
                ● ONLINE
              </span>
            </div>
          </div>

          {/* Page Content */}
          <div className="mt-4 md:mt-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;