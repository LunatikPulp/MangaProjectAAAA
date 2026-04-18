import React, { Suspense, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import ProtectedRoute from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import { MangaContext } from './contexts/MangaContext';
import { AuthContext } from './contexts/AuthContext';
import { API_BASE } from './services/externalApiService';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/admin/AdminLayout';
import DetailPageSkeleton from './components/skeletons/DetailPageSkeleton';
import SpringtrapNightmare from './components/SpringtrapNightmare';
import SpringlockWarning from './components/SpringlockWarning';
import SpringOSErrorPage from './pages/SpringOSErrorPage';

// Lazy-loaded pages — each becomes a separate chunk
const HomePage = React.lazy(() => import('./pages/HomePage'));
const DetailPage = React.lazy(() => import('./pages/DetailPage'));
const TopsPage = React.lazy(() => import('./pages/TopsPage'));
const BookmarksPage = React.lazy(() => import('./pages/BookmarksPage'));
const HistoryPage = React.lazy(() => import('./pages/HistoryPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const FriendsPage = React.lazy(() => import('./pages/FriendsPage'));
const CatalogPage = React.lazy(() => import('./pages/CatalogPage'));
const GenrePage = React.lazy(() => import('./pages/GenrePage'));
const ReaderPage = React.lazy(() => import('./pages/ReaderPage'));
const SuggestEditPage = React.lazy(() => import('./pages/SuggestEditPage'));
const ManageMangaPage = React.lazy(() => import('./pages/admin/ManageMangaPage'));
const SectionListPage = React.lazy(() => import('./pages/SectionListPage'));
const GoogleCallbackPage = React.lazy(() => import('./pages/GoogleCallbackPage'));
const YandexCallbackPage = React.lazy(() => import('./pages/YandexCallbackPage'));
const UserProfilePage = React.lazy(() => import('./pages/UserProfilePage'));
const UserBookmarksPage = React.lazy(() => import('./pages/UserBookmarksPage'));
const MessagesPage = React.lazy(() => import('./pages/MessagesPage'));
const QuizPage = React.lazy(() => import('./pages/QuizPage'));
const CardsPage = React.lazy(() => import('./pages/CardsPage'));
const ShopPage = React.lazy(() => import('./pages/ShopPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));

// Admin pages — lazy loaded (only fetched for admins)
const AdminDashboardPage = React.lazy(() => import('./pages/admin/AdminDashboardPage'));
const CreateMangaPage = React.lazy(() => import('./pages/admin/CreateMangaPage'));
const ArchivesPage = React.lazy(() => import('./pages/admin/ArchivesPage'));
const UsersPage = React.lazy(() => import('./pages/admin/UsersPage'));
const ReportsPage = React.lazy(() => import('./pages/admin/ReportsPage'));
const ShopPageAdmin = React.lazy(() => import('./pages/admin/ShopPageAdmin'));
const TransactionsPage = React.lazy(() => import('./pages/admin/TransactionsPage'));
const ParserPage = React.lazy(() => import('./pages/admin/ParserPage'));
const AuditPage = React.lazy(() => import('./pages/admin/AuditPage'));
const AdminSettingsPage = React.lazy(() => import('./pages/admin/AdminSettingsPage'));
const MediaSettingsPage = React.lazy(() => import('./pages/admin/MediaSettingsPage'));
const ModerationPage = React.lazy(() => import('./pages/admin/ModerationPage'));
const SecurityPage = React.lazy(() => import('./pages/admin/SecurityPage'));
const AdminNotificationsPage = React.lazy(() => import('./pages/admin/NotificationsPage'));
const AnalyticsPage = React.lazy(() => import('./pages/admin/AnalyticsPage'));
const PromocodesPage = React.lazy(() => import('./pages/admin/PromocodesPage'));
const MonetizationPage = React.lazy(() => import('./pages/admin/MonetizationPage'));
const SuggestionsPage = React.lazy(() => import('./pages/admin/SuggestionsPage'));

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
     <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" /></div>}>
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
    </Suspense>
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
    return <Suspense fallback={null}><GoogleCallbackPage /></Suspense>;
  }
  if (urlParams.has('code') && !urlParams.has('scope')) {
    return <Suspense fallback={null}><YandexCallbackPage /></Suspense>;
  }

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
