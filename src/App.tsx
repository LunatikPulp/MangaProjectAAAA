import React, { useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import HomePage from './pages/HomePage';
import DetailPage from './pages/DetailPage';
import TopsPage from './pages/TopsPage';
import BookmarksPage from './pages/BookmarksPage';
import HistoryPage from './pages/HistoryPage';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProfilePage from './pages/ProfilePage';
import FriendsPage from './pages/FriendsPage';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import { MangaContext } from './contexts/MangaContext';
import { AuthContext } from './contexts/AuthContext';
import { API_BASE } from './services/externalApiService';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import CreateMangaPage from './pages/admin/CreateMangaPage';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/admin/AdminLayout';
import ArchivesPage from './pages/admin/ArchivesPage';
import UsersPage from './pages/admin/UsersPage';
import ReportsPage from './pages/admin/ReportsPage';
import ShopPageAdmin from './pages/admin/ShopPageAdmin';
import TransactionsPage from './pages/admin/TransactionsPage';
import ParserPage from './pages/admin/ParserPage';
import AuditPage from './pages/admin/AuditPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import MediaSettingsPage from './pages/admin/MediaSettingsPage';
import ModerationPage from './pages/admin/ModerationPage';
import SecurityPage from './pages/admin/SecurityPage';
import AdminNotificationsPage from './pages/admin/NotificationsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import PromocodesPage from './pages/admin/PromocodesPage';
import MonetizationPage from './pages/admin/MonetizationPage';
import GenrePage from './pages/GenrePage';
import ReaderPage from './pages/ReaderPage';
import DetailPageSkeleton from './components/skeletons/DetailPageSkeleton';
import SuggestEditPage from './pages/SuggestEditPage';
import CatalogPage from './pages/CatalogPage';
import ManageMangaPage from './pages/admin/ManageMangaPage';
import SuggestionsPage from './pages/admin/SuggestionsPage';
import SectionListPage from './pages/SectionListPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import YandexCallbackPage from './pages/YandexCallbackPage';
import UserProfilePage from './pages/UserProfilePage';
import UserBookmarksPage from './pages/UserBookmarksPage';
import MessagesPage from './pages/MessagesPage';
import QuizPage from './pages/QuizPage';
import CardsPage from './pages/CardsPage';
import ShopPage from './pages/ShopPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import SpringtrapNightmare from './components/SpringtrapNightmare';
import SpringlockWarning from './components/SpringlockWarning';
import SpringOSErrorPage from './pages/SpringOSErrorPage';

const DetailPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, fetchMangaById, loading } = useContext(MangaContext);
    const navigate = useNavigate();
    const mangaId = id || '';
    const manga = getMangaById(mangaId);
    const [fetching, setFetching] = React.useState(false);
    const [notFound, setNotFound] = React.useState(false);

    React.useEffect(() => {
        if (!manga && !loading && !fetching && !notFound) {
            setFetching(true);
            fetchMangaById(mangaId).then(result => {
                if (!result) setNotFound(true);
                setFetching(false);
            });
        }
    }, [manga, loading, fetching, notFound, mangaId, fetchMangaById]);

    // Redirect MD5 hash URLs to slug URLs
    React.useEffect(() => {
        if (manga && manga.slug && mangaId !== manga.slug && /^[0-9a-f]{32}$/.test(mangaId)) {
            navigate(`/manga/${manga.slug}`, { replace: true });
        }
    }, [manga, mangaId, navigate]);

    if (loading || fetching) {
        return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga && notFound) {
        return <SpringOSErrorPage errorCode={404} customMessage="Запрошенная манга не найдена в архивах. Возможно, она была удалена или перемещена." />;
    }
    if (!manga) {
        return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    return <PageTransition><DetailPage manga={manga} /></PageTransition>;
};

const ManageMangaPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, loading } = useContext(MangaContext);
    const mangaId = id || '';
    const manga = getMangaById(mangaId);

    if (loading) {
         return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga) {
        return <SpringOSErrorPage errorCode={404} customMessage="Запрошенная манга не найдена в архивах." />;
    }
    return <PageTransition><ManageMangaPage manga={manga} /></PageTransition>;
};

const SuggestEditPageWrapper: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { getMangaById, loading } = useContext(MangaContext);
    const mangaId = id || '';
    const manga = getMangaById(mangaId);

    if (loading) {
         return <PageTransition><DetailPageSkeleton /></PageTransition>;
    }
    if (!manga) {
        return <SpringOSErrorPage errorCode={404} customMessage="Запрошенная манга не найдена в архивах." />;
    }
    return <PageTransition><SuggestEditPage manga={manga} /></PageTransition>;
};


const GenrePageWrapper: React.FC = () => {
    const { genreName } = useParams<{ genreName: string }>();
    return <PageTransition><GenrePage genreName={genreName || ''} /></PageTransition>;
};

const ReaderPageWrapper: React.FC = () => {
    const { id, chapterId } = useParams<{ id: string; chapterId: string; }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { getMangaById } = useContext(MangaContext);
    const mangaId = id || '';
    const chapId = chapterId || '';
    const startPage = (location.state as any)?.startPage || 1;
    const manga = getMangaById(mangaId);

    // Redirect MD5 hash URLs to slug URLs
    React.useEffect(() => {
        if (manga && manga.slug && mangaId !== manga.slug && /^[0-9a-f]{32}$/.test(mangaId)) {
            navigate(`/manga/${manga.slug}/chapter/${chapId}`, { replace: true });
        }
    }, [manga, mangaId, chapId, navigate]);

    return <PageTransition><ReaderPage key={`${mangaId}-${chapId}`} mangaId={mangaId} chapterId={chapId} startPage={startPage} /></PageTransition>;
}


const AppRoutes: React.FC = () => {
  const location = useLocation();
  
  return (
     <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname.startsWith('/messages') ? '/messages' : location.pathname}>
            <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
            <Route path="/catalog" element={<PageTransition><CatalogPage /></PageTransition>} />
            <Route path="/manga/:id" element={<DetailPageWrapper />} />
            <Route path="/tops" element={<PageTransition><TopsPage /></PageTransition>} />
            <Route path="/genre/:genreName" element={<GenrePageWrapper />} />
            <Route path="/list/:section" element={<PageTransition><SectionListPage /></PageTransition>} />
            
            <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
            <Route path="/register" element={<PageTransition><RegisterPage /></PageTransition>} />
            <Route path="/forgot-password" element={<PageTransition><ForgotPasswordPage /></PageTransition>} />
            <Route path="/reset-password" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
            
            {/* User Routes */}
            <Route path="/bookmarks" element={<ProtectedRoute><PageTransition><BookmarksPage /></PageTransition></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><PageTransition><HistoryPage /></PageTransition></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><PageTransition><ProfilePage /></PageTransition></ProtectedRoute>} />
            <Route path="/profile/friends" element={<ProtectedRoute><PageTransition><FriendsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/user/:userId" element={<PageTransition><UserProfilePage /></PageTransition>} />
            <Route path="/user/:userId/bookmarks" element={<PageTransition><UserBookmarksPage /></PageTransition>} />
            <Route path="/messages" element={<ProtectedRoute><PageTransition><MessagesPage /></PageTransition></ProtectedRoute>} />
            <Route path="/messages/:userId" element={<ProtectedRoute><PageTransition><MessagesPage /></PageTransition></ProtectedRoute>} />
            <Route path="/quiz" element={<PageTransition><QuizPage /></PageTransition>} />
            <Route path="/cards" element={<ProtectedRoute><PageTransition><CardsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/shop" element={<ProtectedRoute><PageTransition><ShopPage /></PageTransition></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><PageTransition><SettingsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><PageTransition><NotificationsPage /></PageTransition></ProtectedRoute>} />

            <Route path="/manga/:id/chapter/:chapterId" element={<ReaderPageWrapper />} />
            <Route path="/manga/:id/suggest-edit" element={<ProtectedRoute><SuggestEditPageWrapper /></ProtectedRoute>} />

            {/* Admin Routes — SpringOS Terminal */}
            <Route path="/admin" element={<AdminRoute><AdminLayout><AdminDashboardPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/archive" element={<AdminRoute><AdminLayout><ArchivesPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/archives/manga/new" element={<AdminRoute><AdminLayout><CreateMangaPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/night-staff/users" element={<AdminRoute><AdminLayout><UsersPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/night-staff/reports" element={<AdminRoute><AdminLayout><ReportsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/night-staff/suggestions" element={<AdminRoute><AdminLayout><SuggestionsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/workshop/shop" element={<AdminRoute><AdminLayout><ShopPageAdmin /></AdminLayout></AdminRoute>} />
            <Route path="/admin/workshop/promocodes" element={<AdminRoute><AdminLayout><PromocodesPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/workshop/monetization" element={<AdminRoute><AdminLayout><MonetizationPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/workshop/transactions" element={<AdminRoute><AdminLayout><TransactionsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/parser" element={<AdminRoute><AdminLayout><ParserPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/analytics" element={<AdminRoute><AdminLayout><AnalyticsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/moderation" element={<AdminRoute><AdminLayout><ModerationPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/media" element={<AdminRoute><AdminLayout><MediaSettingsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/security" element={<AdminRoute><AdminLayout><SecurityPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/notifications" element={<AdminRoute><AdminLayout><AdminNotificationsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/audit" element={<AdminRoute><AdminLayout><AuditPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/network/settings" element={<AdminRoute><AdminLayout><AdminSettingsPage /></AdminLayout></AdminRoute>} />
            <Route path="/admin/manga/:id/manage" element={<AdminRoute><AdminLayout><ManageMangaPageWrapper /></AdminLayout></AdminRoute>} />
            <Route path="/manga/:id/edit" element={<AdminRoute><AdminLayout><ManageMangaPageWrapper /></AdminLayout></AdminRoute>} />

            <Route path="/auth/callback" element={<Navigate to="/" />} />
            <Route path="/error/503" element={<SpringOSErrorPage errorCode={503} />} />
            <Route path="/error/404" element={<SpringOSErrorPage errorCode={404} />} />
            <Route path="/error/403" element={<SpringOSErrorPage errorCode={403} />} />
            <Route path="/error/500" element={<SpringOSErrorPage errorCode={500} />} />
            <Route path="/error/401" element={<SpringOSErrorPage errorCode={401} />} />
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    </AnimatePresence>
  )
}

const AppContent: React.FC = () => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const isReaderPage = location.pathname.includes('/chapter/');
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/user/');
  const isMessagesPage = location.pathname.startsWith('/messages');
  const isAdminPage = location.pathname.startsWith('/admin') || location.pathname === location.pathname && location.pathname.includes('/edit');

  // Проверяем bypass: из URL query или sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bypassKey = params.get('mnt_bypass');
    if (bypassKey) {
      sessionStorage.setItem('mnt_bypass', bypassKey);
      // Убираем параметр из URL чтобы не светился
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, []);

  const hasBypass = !!sessionStorage.getItem('mnt_bypass');
  const isAdmin = user?.role === 'admin';
  const isLoginPage = location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    fetch(`${API_BASE}/admin/maintenance-status`)
      .then(r => r.json())
      .then(data => setMaintenanceMode(data.maintenance === true))
      .catch(() => setMaintenanceMode(false));
  }, [location.pathname]);

  // Полная блокировка: не админ, нет bypass, не страница логина
  if (maintenanceMode && !isAdmin && !hasBypass && !isLoginPage) {
    return <SpringOSErrorPage errorCode={503} />;
  }

  return (
    <div className={`min-h-screen flex flex-col overflow-x-hidden ${isMessagesPage ? 'overflow-hidden h-screen' : ''} ${isProfilePage ? '' : 'bg-base'}`}>
      {!isReaderPage && !isAdminPage && <Header />}
      <main className={`${isReaderPage ? 'flex-grow' : isMessagesPage ? 'flex-grow overflow-hidden' : isAdminPage ? 'flex-grow' : 'flex-grow container mx-auto px-4 md:px-8 py-6 pb-20 md:pb-6'}`}>
        <AppRoutes />
      </main>
      <AuthModal />
      <SpringtrapNightmare />
      <SpringlockWarning />
    </div>
  );
};

const App: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code') && urlParams.has('scope')) {
    return <GoogleCallbackPage />;
  }
  if (urlParams.has('code') && !urlParams.has('scope')) {
    return <YandexCallbackPage />;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
