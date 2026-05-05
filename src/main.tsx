import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ToasterProvider } from './contexts/ToasterContext';
import { MangaProvider } from './contexts/MangaContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Build fingerprint — changing this forces a new entry-chunk hash.
(window as any).__SM_BUILD__ = '20260423-1530';

// Handle stale chunk errors after deploy: if a dynamically imported chunk
// is missing (404) because the user has an old tab open, reload the page once.
// sessionStorage guard prevents infinite reload loop.
const RELOAD_KEY = '__sm_chunk_reload__';
function handleChunkError(reason?: unknown) {
  const msg = String((reason as Error)?.message || reason || '');
  const isChunkError =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Unable to preload CSS');
  if (!isChunkError) return false;
  if (sessionStorage.getItem(RELOAD_KEY)) return false;
  sessionStorage.setItem(RELOAD_KEY, '1');
  setTimeout(() => sessionStorage.removeItem(RELOAD_KEY), 10_000);
  window.location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (e: Event) => {
  (e as any).preventDefault?.();
  handleChunkError((e as any).payload || (e as any).reason);
});
window.addEventListener('error', (e) => handleChunkError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => handleChunkError(e.reason));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToasterProvider>
        <AuthProvider>
          <MangaProvider>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </MangaProvider>
        </AuthProvider>
      </ToasterProvider>
    </ThemeProvider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}