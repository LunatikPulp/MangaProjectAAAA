import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { ToasterProvider } from './contexts/ToasterContext';
import { MangaProvider } from './contexts/MangaContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ThemeProvider } from './contexts/ThemeContext';

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